import { sharedValue, useHydrated } from "./shared-state";

export type FontSize = "small" | "normal" | "large" | "xlarge";
export type ColorTheme =
  | "blue"
  | "emerald"
  | "violet"
  | "rose"
  | "amber"
  | "teal"
  | "pink"
  | "slate"
  | "crimson"
  | "indigo"
  | "lime";
export type BgTheme =
  "white" | "cream" | "mint" | "sky" | "lavender" | "peach" | "blush" | "sand" | "gray" | "paper";

export type SederConfig = {
  s1Start: string;
  s1End: string;
  s2Start: string;
  s2End: string;
  bonusThresholdMin: number;
  alertMissingMinPerMonth: number;
  /** Whether the user is counted among חבורת ש"ס — see SHAS_ARRIVAL_DEADLINE. */
  shasChavura: boolean;
};

/**
 * חבורת ש"ס: a member is credited for every seder ב׳ he was already there
 * for by this hour. Fixed by the kollel rather than chosen by the user, and
 * deliberately earlier than seder ב׳ itself (15:45 by default) — it marks an
 * early arrival, not merely a punctual one.
 */
export const SHAS_ARRIVAL_DEADLINE = "15:00";

export type SederTimes = { s1Start: string; s1End: string; s2Start: string; s2End: string };
/** A permanent change of seder hours, valid from `effectiveFrom` (ISO date) onwards. */
export type SederScheduleEntry = { id: string; effectiveFrom: string; times: SederTimes };
/** A temporary change for a closed date range; hours revert afterwards. */
export type SederOverride = {
  id: string;
  from: string;
  to: string;
  label?: string;
  times: SederTimes;
};

export type Settings = {
  profile: { name: string; classroom: string };
  seder: SederConfig;
  sederSchedule: SederScheduleEntry[];
  sederOverrides: SederOverride[];
  stipend: {
    /**
     * Months (YYYY-MM) the user has prior special approval from the Rosh
     * Kollel for. Every rule in src/lib/stipend.ts that is written to bend
     * for such an approval — today, only §3's ceiling on free excused
     * minutes — is waived for a month listed here. Set from the checkbox on
     * the stipend screen, one month at a time, since the approval itself is
     * something the Rosh Kollel grants for a particular month.
     */
    approvedMonths: string[];
  };
  notifications: {
    /** In-app pop-ups — a toast in whichever window is open. */
    popups: boolean;
    /** Real Windows notifications, which appear even behind another window. */
    desktop: boolean;
    dailyReminder: boolean;
    latenessAlert: boolean;
    weeklySummary: boolean;
    /** Warns that the month is *heading* past the missing-minutes threshold. */
    forecastWarning: boolean;
    /**
     * At the start of a month, that last month has not yet been reported to
     * the phone system. Runs until the 5th or until the user says he has
     * reported it — see phone-report.ts.
     */
    phoneReport: boolean;
    /**
     * Lets the reminders fit themselves to the user: a grace period drawn from
     * his own arrival habit, an earlier nudge on his weakest weekday, and going
     * quieter when a reminder keeps going unanswered. Switching it off restores
     * the fixed behaviour exactly — see notifications.ts.
     */
    adaptive: boolean;
  };
  /**
   * Reminders while the app is closed.
   *
   * Off by default, and deliberately the only setting in the app that starts
   * a process: switching it on writes a login entry and runs
   * SederPlusAgent.exe, a windowless few-megabyte program that raises two
   * reminders and nothing else (src-tauri/agent/src/main.rs). Switching it
   * off removes the entry; the running agent reads this same flag once a
   * minute and exits on its own.
   */
  background: {
    enabled: boolean;
  };
  appearance: {
    fontSize: FontSize;
    highContrast: boolean;
    compactMode: boolean;
    colorTheme: ColorTheme;
    background: BgTheme;
  };
  dashboard: {
    showInsights: boolean;
    showReminders: boolean;
    showQuickActions: boolean;
  };
  data: {
    autoBackup: "off" | "daily" | "weekly";
    backupRetention: number;
    autoBackupBeforeOps: boolean;
  };
  goals: {
    monthlyTarget: number;
    maxLatePerMonth: number;
  };
};

export const DEFAULT_SETTINGS: Settings = {
  profile: { name: "תלמיד הכולל", classroom: "" },
  seder: {
    s1Start: "09:00",
    s1End: "13:00",
    s2Start: "15:45",
    s2End: "19:30",
    bonusThresholdMin: 15,
    alertMissingMinPerMonth: 180,
    shasChavura: false,
  },
  // Desktop notifications start off: a Windows toast is the app talking over
  // whatever the user is doing, and that has to be asked for. In-app pop-ups
  // only show while a window is already in front, so they are on.
  notifications: {
    popups: true,
    desktop: false,
    dailyReminder: true,
    latenessAlert: true,
    weeklySummary: false,
    // On by default, unlike the weekly digest: it fires at most once a month
    // and only while there is still a month left to do something about it.
    forecastWarning: true,
    phoneReport: true,
    adaptive: true,
  },
  // Off: nothing starts a background process without being asked.
  background: { enabled: false },
  sederSchedule: [],
  sederOverrides: [],
  stipend: { approvedMonths: [] },
  appearance: {
    fontSize: "normal",
    highContrast: false,
    compactMode: false,
    colorTheme: "blue",
    background: "white",
  },
  dashboard: { showInsights: true, showReminders: true, showQuickActions: true },
  data: { autoBackup: "weekly", backupRetention: 5, autoBackupBeforeOps: true },
  goals: { monthlyTarget: 95, maxLatePerMonth: 3 },
};

// Pre-1.1 localStorage keys, read once to seed the shared file — see
// shared-state.ts.
const LEGACY_SETTINGS_KEY = "tracker.settings.v1";
const LEGACY_ONBOARD_KEY = "tracker.onboarded.v1";

function deepMerge<T>(base: T, over: Partial<T>): T {
  // Both sides are walked by key, so they are viewed as plain records here.
  // The array branch still spreads into a real array, so an array-valued
  // setting (sederSchedule, sederOverrides, approvedMonths) stays an array.
  const baseRec = base as Record<string, unknown>;
  const out = (Array.isArray(base) ? [...base] : { ...baseRec }) as unknown as Record<
    string,
    unknown
  >;
  for (const k of Object.keys(over || {})) {
    const v = (over as Record<string, unknown>)[k];
    if (v && typeof v === "object" && !Array.isArray(v) && typeof baseRec[k] === "object") {
      out[k] = deepMerge(baseRec[k], v as Partial<unknown>);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

// Lives in the shared data file, not localStorage: the two EXEs each have
// their own WebView profile, and these values feed the attendance maths
// (getSederTimesFor -> calcSeder), so a divergent copy would make the quick
// window score arrivals against the wrong seder hours. See shared-state.ts.
const store = sharedValue<Settings>({
  key: "settings",
  legacyKey: LEGACY_SETTINGS_KEY,
  fallback: DEFAULT_SETTINGS,
  // Merged over the defaults so a file written by an older version — missing
  // whichever fields have been added since — still loads.
  parse: (raw) =>
    raw && typeof raw === "object"
      ? deepMerge(DEFAULT_SETTINGS, raw as Partial<Settings>)
      : DEFAULT_SETTINGS,
  // Re-applied on hydration and on the other EXE's changes too, so a theme
  // change made over there shows up here.
  onChange: () => applyAppearance(),
});

// Apply the saved theme/colors to the DOM immediately at module load — not
// just inside a React useEffect — so the very first paint already shows the
// user's chosen color instead of the CSS default, then flashing to the real
// one a moment later. (applyAppearance is a function declaration below,
// hoisted, so calling it here is safe.)
applyAppearance();

export function getSettings(): Settings {
  return store.get();
}

export function updateSettings(patch: Partial<Settings>) {
  store.set(deepMerge(store.get(), patch));
}

export function resetSettings() {
  store.set(DEFAULT_SETTINGS);
}

// ============ Date-aware seder hours ============
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function baseTimes(s: Settings = store.get()): SederTimes {
  return {
    s1Start: s.seder.s1Start,
    s1End: s.seder.s1End,
    s2Start: s.seder.s2Start,
    s2End: s.seder.s2End,
  };
}

/**
 * What is wrong with a set of seder hours, or null if nothing is.
 *
 * A seder that ends before it starts makes every figure in the app
 * nonsense — calcSeder would report a length of zero and then score every
 * arrival against it — so neither the first-run wizard nor the Settings
 * screen will save one.
 */
export function sederTimesError(t: SederTimes): string | null {
  const pairs: [string, string, string][] = [
    [t.s1Start, t.s1End, "סדר א׳"],
    [t.s2Start, t.s2End, "סדר ב׳"],
  ];
  for (const [start, end, label] of pairs) {
    const a = toMinutes(start),
      b = toMinutes(end);
    if (a === null || b === null) return `${label}: שעה לא תקינה`;
    if (b <= a) return `${label}: שעת הסיום חייבת להיות אחרי שעת ההתחלה`;
  }
  return null;
}

/** Local copy of hhmmToMin: kollel-store imports *this* module, and a cycle
 *  back the other way would leave one of the two half-initialised. */
function toMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
  if (!m) return null;
  const h = +m[1],
    mm = +m[2];
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/** Seder hours that were in effect on a given ISO date (temporary override wins). */
export function getSederTimesFor(dateISO: string): SederTimes {
  const settings = store.get();
  const ov = (settings.sederOverrides || [])
    .filter((o) => dateISO >= o.from && dateISO <= o.to)
    .sort((a, b) => (a.from < b.from ? 1 : -1))[0];
  if (ov) return ov.times;

  const sched = [...(settings.sederSchedule || [])].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? -1 : 1,
  );
  let times: SederTimes | null = null;
  for (const e of sched) {
    if (e.effectiveFrom <= dateISO) times = e.times;
  }
  return times || baseTimes(settings);
}

/** Applies new seder hours from today onwards — past records keep their original hours. */
export function setSederTimesFromToday(times: SederTimes, effectiveFrom = todayIso()) {
  const settings = store.get();
  const sched = [...(settings.sederSchedule || [])];
  if (sched.length === 0) {
    // Snapshot the previous hours so earlier dates stay unchanged.
    sched.push({
      id: `base-${Date.now()}`,
      effectiveFrom: "0001-01-01",
      times: baseTimes(settings),
    });
  }
  const idx = sched.findIndex((e) => e.effectiveFrom === effectiveFrom);
  if (idx >= 0) sched[idx] = { ...sched[idx], times };
  else
    sched.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      effectiveFrom,
      times,
    });
  updateSettings({ sederSchedule: sched, seder: { ...settings.seder, ...times } });
}

export function removeSederScheduleEntry(id: string) {
  updateSettings({ sederSchedule: (store.get().sederSchedule || []).filter((e) => e.id !== id) });
}

export function addSederOverride(o: Omit<SederOverride, "id">) {
  const item: SederOverride = {
    ...o,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };
  updateSettings({ sederOverrides: [...(store.get().sederOverrides || []), item] });
}

export function removeSederOverride(id: string) {
  updateSettings({ sederOverrides: (store.get().sederOverrides || []).filter((o) => o.id !== id) });
}

// ============ Stipend approvals (per month) ============
// Read straight off `settings.stipend.approvedMonths` rather than through a
// helper: the stipend screen has to re-render when it changes, and only
// useSettings() gives it that.
export function setMonthApproved(monthKey: string, approved: boolean) {
  const months = store.get().stipend?.approvedMonths || [];
  const approvedMonths = approved
    ? months.includes(monthKey)
      ? months
      : [...months, monthKey]
    : months.filter((m) => m !== monthKey);
  updateSettings({ stipend: { approvedMonths } });
}

export function useSettings() {
  return { settings: store.use(), update: updateSettings };
}

export function applyAppearance() {
  if (typeof document === "undefined") return;
  const appearance = store.get().appearance;
  const r = document.documentElement;
  r.classList.toggle("hc", appearance.highContrast);
  r.classList.toggle("compact", appearance.compactMode);
  r.dataset.fontSize = appearance.fontSize;
  r.dataset.theme = appearance.colorTheme || "blue";
  const bg = appearance.background || "white";
  if (bg === "white") delete r.dataset.bg;
  else r.dataset.bg = bg;
  const sizes: Record<FontSize, string> = {
    small: "14px",
    normal: "16px",
    large: "18px",
    xlarge: "20px",
  };
  r.style.fontSize = sizes[appearance.fontSize];
}

// Shared for the same reason settings are: otherwise the quick EXE — and the
// full app opened from it — would each run the onboarding wizard again.
const onboarded = sharedValue<boolean>({
  key: "onboarded",
  legacyKey: LEGACY_ONBOARD_KEY,
  fallback: false,
  // The legacy key held the bare string "1" — which readLegacy in
  // shared-state.ts hands over as the *number* 1, since "1" happens to be
  // valid JSON and JSON.parse never throws on it. Accept all three forms:
  // missing the numeric one showed the onboarding wizard a second time to
  // everyone upgrading from a pre-1.1 build.
  parse: (raw) => raw === true || raw === "1" || raw === 1,
});

export function isOnboarded(): boolean {
  return onboarded.get();
}
export function markOnboarded() {
  onboarded.set(true);
}
export function resetOnboarding() {
  onboarded.set(false);
}

/**
 * Whether to show the onboarding wizard.
 *
 * Gated on hydration: before the shared file has been read, `isOnboarded()`
 * only knows this window's mirror, which is empty in a freshly created
 * WebView profile — so an already-onboarded user would otherwise get a flash
 * of the wizard the first time they open the second EXE.
 */
export function useNeedsOnboarding(): boolean {
  const hydrated = useHydrated();
  // Both hooks unconditionally: `hydrated && !onboarded.use()` short-circuits
  // before the first render's hydration lands, so onboarded.use()'s hooks were
  // skipped on that render and ran on the next one — "Rendered more hooks than
  // during the previous render". Only ever visible in the EXEs, where
  // loadStore() is a real async call into Rust; in a browser the localStorage
  // fallback resolves in a microtask and hydration is already done by the
  // first render.
  const isOnboardedNow = onboarded.use();
  return hydrated && !isOnboardedNow;
}
