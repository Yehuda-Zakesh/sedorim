import { logAudit } from "./audit-store";
import { sharedValue, useHydrated } from "./shared-state";

export type FontSize = "small" | "normal" | "large" | "xlarge";
export type DateFormat = "iso" | "he" | "mixed" | "hebrew";
export type ColorTheme =
  | "blue" | "emerald" | "violet" | "rose" | "amber"
  | "teal" | "pink" | "slate" | "crimson" | "indigo" | "lime";
export type BgTheme =
  | "white" | "cream" | "mint" | "sky" | "lavender"
  | "peach" | "blush" | "sand" | "gray" | "paper";

export type SederConfig = {
  s1Start: string; s1End: string;
  s2Start: string; s2End: string;
  bonusThresholdMin: number;
  alertMissingMinPerMonth: number;
  defaultDeparture: "seder_end" | "blank";
};

export type SederTimes = { s1Start: string; s1End: string; s2Start: string; s2End: string };
/** A permanent change of seder hours, valid from `effectiveFrom` (ISO date) onwards. */
export type SederScheduleEntry = { id: string; effectiveFrom: string; times: SederTimes };
/** A temporary change for a closed date range; hours revert afterwards. */
export type SederOverride = { id: string; from: string; to: string; label?: string; times: SederTimes };

export type Settings = {
  profile: { name: string; classroom: string };
  seder: SederConfig;
  sederSchedule: SederScheduleEntry[];
  sederOverrides: SederOverride[];
  notifications: {
    dailyReminder: boolean;
    latenessAlert: boolean;
    weeklySummary: boolean;
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
  language: {
    dateFormat: DateFormat;
  };
  privacy: {
    lockScreen: boolean;
    enableAudit: boolean;
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
    s1Start: "09:00", s1End: "13:00",
    s2Start: "15:45", s2End: "19:30",
    bonusThresholdMin: 15,
    alertMissingMinPerMonth: 180,
    defaultDeparture: "seder_end",
  },
  notifications: { dailyReminder: true, latenessAlert: true, weeklySummary: false },
  sederSchedule: [],
  sederOverrides: [],
  appearance: { fontSize: "normal", highContrast: false, compactMode: false, colorTheme: "blue", background: "white" },
  dashboard: { showInsights: true, showReminders: true, showQuickActions: true },
  language: { dateFormat: "mixed" },
  privacy: { lockScreen: false, enableAudit: true },
  data: { autoBackup: "weekly", backupRetention: 5, autoBackupBeforeOps: true },
  goals: { monthlyTarget: 95, maxLatePerMonth: 3 },
};

// Pre-1.1 localStorage keys, read once to seed the shared file — see
// shared-state.ts.
const LEGACY_SETTINGS_KEY = "tracker.settings.v1";
const LEGACY_ONBOARD_KEY = "tracker.onboarded.v1";

function deepMerge<T>(base: T, over: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const k of Object.keys(over || {})) {
    const v: any = (over as any)[k];
    if (v && typeof v === "object" && !Array.isArray(v) && typeof (base as any)[k] === "object") {
      out[k] = deepMerge((base as any)[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
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
    raw && typeof raw === "object" ? deepMerge(DEFAULT_SETTINGS, raw as Partial<Settings>) : DEFAULT_SETTINGS,
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

export function getSettings(): Settings { return store.get(); }

export function updateSettings(patch: Partial<Settings>, opts?: { skipAudit?: boolean }) {
  const prev = store.get();
  const next = deepMerge(prev, patch);
  store.set(next);
  if (!opts?.skipAudit) logAudit("settings.update", { oldValue: prev, newValue: next });
}

export function resetSettings() {
  const prev = store.get();
  store.set(DEFAULT_SETTINGS);
  logAudit("backup.reset_settings", { oldValue: prev, newValue: DEFAULT_SETTINGS });
}

// ============ Date-aware seder hours ============
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function baseTimes(s: Settings = store.get()): SederTimes {
  return { s1Start: s.seder.s1Start, s1End: s.seder.s1End, s2Start: s.seder.s2Start, s2End: s.seder.s2End };
}

/** Seder hours that were in effect on a given ISO date (temporary override wins). */
export function getSederTimesFor(dateISO: string): SederTimes {
  const settings = store.get();
  const ov = (settings.sederOverrides || [])
    .filter((o) => dateISO >= o.from && dateISO <= o.to)
    .sort((a, b) => (a.from < b.from ? 1 : -1))[0];
  if (ov) return ov.times;

  const sched = [...(settings.sederSchedule || [])].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
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
    sched.push({ id: `base-${Date.now()}`, effectiveFrom: "0001-01-01", times: baseTimes(settings) });
  }
  const idx = sched.findIndex((e) => e.effectiveFrom === effectiveFrom);
  if (idx >= 0) sched[idx] = { ...sched[idx], times };
  else sched.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, effectiveFrom, times });
  updateSettings({ sederSchedule: sched, seder: { ...settings.seder, ...times } });
}

export function removeSederScheduleEntry(id: string) {
  updateSettings({ sederSchedule: (store.get().sederSchedule || []).filter((e) => e.id !== id) });
}

export function addSederOverride(o: Omit<SederOverride, "id">) {
  const item: SederOverride = { ...o, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
  updateSettings({ sederOverrides: [...(store.get().sederOverrides || []), item] });
}

export function removeSederOverride(id: string) {
  updateSettings({ sederOverrides: (store.get().sederOverrides || []).filter((o) => o.id !== id) });
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
  if (bg === "white") delete r.dataset.bg; else r.dataset.bg = bg;
  const sizes: Record<FontSize, string> = { small: "14px", normal: "16px", large: "18px", xlarge: "20px" };
  r.style.fontSize = sizes[appearance.fontSize];
}

// Shared for the same reason settings are: otherwise the quick EXE — and the
// full app opened from it — would each run the onboarding wizard again.
const onboarded = sharedValue<boolean>({
  key: "onboarded",
  legacyKey: LEGACY_ONBOARD_KEY,
  fallback: false,
  // The legacy key held the bare string "1".
  parse: (raw) => raw === true || raw === "1",
});

export function isOnboarded(): boolean { return onboarded.get(); }
export function markOnboarded() { onboarded.set(true); }
export function resetOnboarding() { onboarded.set(false); }

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
  return hydrated && !onboarded.use();
}
