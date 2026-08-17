// Real OS notifications.
//
// The three switches under Settings → "התראות" used to control nothing: the
// onboarding wizard even said so out loud ("visual only"). They now drive
// actual Windows toasts, raised through the `notify` command in
// src-tauri/core/src/lib.rs.
//
// What this is not: a background scheduler. The app has no service and does
// not run when closed, so a reminder can only fire while a window is open.
// The rules below are written for that — they ask "is this still worth saying
// *now*", not "was this due at 09:00" — and each one fires at most once per
// day / week / month, tracked in the shared data file so the two EXEs don't
// both toast the same reminder.
import { useEffect } from "react";
import { invoke, isDesktop } from "./tauri";
import { sharedValue } from "./shared-state";
import { getSettings } from "./settings-store";
import { getSederTimesFor } from "./settings-store";
import {
  hhmmToMin, todayISO, summarizeEntries, getSederSnapshot, entriesInMonth,
  type SederEntry,
} from "./kollel-store";
import { isLearningDay } from "./hebrew-calendar";

export type NotificationKind = "daily-reminder" | "lateness-alert" | "weekly-summary";

export type DueNotification = {
  kind: NotificationKind;
  title: string;
  body: string;
  /** The period this instance belongs to; stored so it fires only once. */
  token: string;
};

// ============ delivery ============

/**
 * Raises one notification. Resolves false when it could not be shown — no
 * transport, permission refused, or notifications muted at the OS level.
 */
export async function deliverNotification(title: string, body: string): Promise<boolean> {
  if (isDesktop) {
    try {
      await invoke<void>("notify", { title, body });
      return true;
    } catch {
      return false;
    }
  }
  // `npm run dev` in a browser: the Web Notification API stands in, so the
  // rules can be exercised without building an EXE.
  if (typeof Notification === "undefined") return false;
  try {
    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}

// ============ once-per-period bookkeeping ============

/** kind -> the period token last delivered for it. */
type SentMap = Partial<Record<NotificationKind, string>>;

const sent = sharedValue<SentMap>({
  key: "notificationsSent",
  fallback: {},
  parse: (raw) => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as SentMap) : {}),
});

// ============ rules ============

/** ISO-8601 week key, e.g. "2026-W34". Weeks start Monday. */
export function isoWeekKey(d: Date): string {
  // Shift onto the Thursday of the same week, whose year is by definition the
  // ISO week-numbering year — the reason 1 Jan can belong to week 52 of the
  // year before.
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (t.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const isoYear = t.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export type ReminderFacts = {
  now: Date;
  /** Is the kollel in session today (not weekend / yom tov / erev yom tov)? */
  isLearningDay: boolean;
  /** Minutes past midnight at which seder 1 begins today. */
  seder1StartMin: number;
  hasEntryToday: boolean;
  lateCountThisMonth: number;
  maxLatePerMonth: number;
  lastWeek: { entries: number; netMissing: number; oheveiCount: number };
  enabled: { dailyReminder: boolean; latenessAlert: boolean; weeklySummary: boolean };
  sent: SentMap;
};

/**
 * Which reminders are worth raising right now.
 *
 * Pure, so the timing rules can be tested without a clock or a desktop.
 */
export function dueNotifications(f: ReminderFacts): DueNotification[] {
  const out: DueNotification[] = [];
  const today = `${f.now.getFullYear()}-${String(f.now.getMonth() + 1).padStart(2, "0")}-${String(f.now.getDate()).padStart(2, "0")}`;
  const monthKey = today.slice(0, 7);
  const nowMin = f.now.getHours() * 60 + f.now.getMinutes();

  // 1. Nothing logged yet today. Held back until seder 1 has actually begun —
  //    a reminder at 06:00 to record a seder that starts at 09:00 is noise —
  //    and never raised on a day the kollel is not sitting.
  if (
    f.enabled.dailyReminder &&
    f.isLearningDay &&
    nowMin >= f.seder1StartMin &&
    !f.hasEntryToday &&
    f.sent["daily-reminder"] !== today
  ) {
    out.push({
      kind: "daily-reminder",
      token: today,
      title: "סדר פלוס — לא נרשם סדר היום",
      body: "עדיין לא רשמת נוכחות להיום. פתח את מסך הנוכחות כדי לסמן הגעה.",
    });
  }

  // 2. The month's late quota is used up. Once per month: re-toasting on every
  //    further lateness would train the user to ignore it.
  if (
    f.enabled.latenessAlert &&
    f.maxLatePerMonth > 0 &&
    f.lateCountThisMonth >= f.maxLatePerMonth &&
    f.sent["lateness-alert"] !== monthKey
  ) {
    out.push({
      kind: "lateness-alert",
      token: monthKey,
      title: "סדר פלוס — חריגה ממכסת האיחורים",
      body: `נרשמו ${f.lateCountThisMonth} איחורים החודש, מתוך מכסה של ${f.maxLatePerMonth}.`,
    });
  }

  // 3. Last week's numbers, the first time the app is open in a new week.
  const weekKey = isoWeekKey(f.now);
  if (
    f.enabled.weeklySummary &&
    f.lastWeek.entries > 0 &&
    f.sent["weekly-summary"] !== weekKey
  ) {
    out.push({
      kind: "weekly-summary",
      token: weekKey,
      title: "סדר פלוס — סיכום השבוע שעבר",
      body: `${f.lastWeek.entries} סדרים · ${f.lastWeek.netMissing} דק׳ חסרות · ${f.lastWeek.oheveiCount} סדרי אוהבי ה׳.`,
    });
  }

  return out;
}

// ============ wiring ============

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Totals for the seven days ending yesterday. */
function lastWeekSummary(entries: SederEntry[], now: Date) {
  const end = new Date(now);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const from = isoOf(start), to = isoOf(end);
  return summarizeEntries(entries.filter((e) => e.date >= from && e.date <= to));
}

export function collectFacts(now = new Date()): ReminderFacts {
  const settings = getSettings();
  const entries = getSederSnapshot();
  const today = isoOf(now);
  const times = getSederTimesFor(today);
  const month = entriesInMonth(entries, now.getFullYear(), now.getMonth());
  return {
    now,
    isLearningDay: isLearningDay(now),
    seder1StartMin: hhmmToMin(times.s1Start) ?? 0,
    hasEntryToday: entries.some((e) => e.date === todayISO()),
    lateCountThisMonth: summarizeEntries(month).lateCount,
    maxLatePerMonth: settings.goals.maxLatePerMonth,
    lastWeek: lastWeekSummary(entries, now),
    enabled: settings.notifications,
    sent: sent.get(),
  };
}

/** Delivers whatever is due, and records what was delivered. */
export async function runReminderCheck(now = new Date()): Promise<DueNotification[]> {
  const due = dueNotifications(collectFacts(now));
  const delivered: DueNotification[] = [];
  for (const n of due) {
    // Only mark it sent if it actually got through, so a reminder is not lost
    // for the whole day because notifications happened to be muted when the
    // first attempt ran.
    if (await deliverNotification(n.title, n.body)) delivered.push(n);
  }
  if (delivered.length) {
    const next = { ...sent.get() };
    for (const n of delivered) next[n.kind] = n.token;
    sent.set(next);
  }
  return delivered;
}

const CHECK_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Runs the reminder rules while a window is open: shortly after launch, then
 * every ten minutes so a seder that starts mid-session still gets its nudge.
 */
export function useReminderNotifications() {
  useEffect(() => {
    // A short delay so the shared file has hydrated first — otherwise the very
    // first check reads an empty `sent` map and re-sends today's reminder.
    const first = setTimeout(() => { void runReminderCheck(); }, 8000);
    const timer = setInterval(() => { void runReminderCheck(); }, CHECK_INTERVAL_MS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
}
