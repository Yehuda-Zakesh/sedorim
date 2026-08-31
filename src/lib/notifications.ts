// Reminders, and the two ways they can be shown.
//
// A reminder goes out on two independent channels, each with its own switch in
// Settings → "יעדים והתראות":
//
//   popups  — a toast inside the app. Only useful while a window is in front,
//             which is why it is on by default: it interrupts nothing.
//   desktop — a real Windows notification, raised through the `notify` command
//             in src-tauri/core/src/lib.rs. It appears over whatever the user
//             is doing, so it starts off and has to be asked for.
//
// These rules run while a window is open, and they ask "is this still worth
// saying *now*", not "was this due at 09:00" — so nothing here is lost by the
// app having been closed at the moment something fell due. Each one fires at
// most once per day / week / month, tracked in the shared data file so the
// two EXEs don't both raise the same reminder.
//
// Two of them also run when every window is closed. SederPlusAgent.exe — a
// windowless process a few megabytes in size, off unless the user asks for it
// (settings.background.enabled) — raises the unrecorded-seder reminder and
// the phone-system one from a timetable this app writes for it. It shares
// `notificationsSent` with these rules, which is how the two never say the
// same thing twice. See background-plan.ts and src-tauri/agent/src/main.rs.
//
// On top of the rules sits a thin adaptive layer, switched on by
// `settings.notifications.adaptive` and switched off to get exactly the fixed
// behaviour back. It does three things, all of them from figures the app
// already keeps:
//
//   * waits out a grace period drawn from the user's own arrival habit before
//     saying nothing has been recorded yet (graceMinutes below);
//   * halves that wait on the weekday he most often falls short on, which is
//     the morning the nudge is actually worth the interruption;
//   * lets a reminder that keeps going unanswered go quiet for a period or two
//     (notification-learning.ts).
//
// None of it is a model. It is arithmetic over the entries already in memory,
// run once every ten minutes.
import { useEffect } from "react";
import { toast } from "sonner";
import { invoke, isDesktop } from "./tauri";
import { sharedValue } from "./shared-state";
import { getSettings } from "./settings-store";
import { getSederTimesFor } from "./settings-store";
import {
  hhmmToMin,
  todayISO,
  summarizeEntries,
  getSederSnapshot,
  entriesInMonth,
  type SederEntry,
} from "./kollel-store";
import { isBeinHazmanim, isLearningDay } from "./hebrew-calendar";
import {
  averageArrivalOffsetMin,
  forecastMonthlyNetMissing,
  weakestLearningWeekday,
  fmtMin,
  WEEKDAY_NAMES,
} from "./insights";
import {
  parseLearningState,
  memoryFor,
  settle,
  gate,
  markDelivered,
  type LearningState,
} from "./notification-learning";
import {
  formatMonthKey,
  isReported,
  reportedMonthFor,
  REPORT_REMINDER_MINUTE,
  REPORT_WINDOW_LAST_DAY,
} from "./phone-report";

export const NOTIFICATION_KINDS = [
  "daily-reminder",
  "lateness-alert",
  "weekly-summary",
  "forecast-warning",
  "phone-report",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * The two kinds only SederPlusAgent.exe raises.
 *
 * They are tracked in the same `notificationsSent` map as everything else, so
 * that neither side repeats what the other has already said — the agent
 * checks `daily-reminder` before speaking, and rule 1 below checks these.
 * See src-tauri/shared/src/plan.rs.
 */
export const BACKGROUND_KINDS = ["bg-seder-1", "bg-seder-2"] as const;
export type BackgroundKind = (typeof BACKGROUND_KINDS)[number];

/**
 * The kinds the adaptive layer is allowed to quieten.
 *
 * A kind belongs here only if it recurs often enough to become noise *and*
 * names something concrete to do, so that "was it answered?" has an answer.
 * The monthly and weekly ones are statements of fact — going quiet on those
 * would not be tact, it would be hiding them.
 */
const ADAPTIVE_KINDS: readonly NotificationKind[] = ["daily-reminder"];

export type DueNotification = {
  kind: NotificationKind;
  title: string;
  body: string;
  /** The period this instance belongs to; stored so it fires only once. */
  token: string;
};

// ============ delivery ============

export type Delivery = { popup: boolean; desktop: boolean };

/**
 * Raises a desktop notification. Resolves false when it could not be shown —
 * no transport, permission refused, or notifications muted at the OS level.
 */
export async function deliverDesktopNotification(title: string, body: string): Promise<boolean> {
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

/**
 * Says something on every channel the user has switched on, and reports which
 * ones actually carried it.
 *
 * A reminder counts as delivered if *either* channel worked — see
 * runReminderCheck, which will not mark a reminder as sent until then.
 */
export async function announce(title: string, body: string): Promise<Delivery> {
  const channels = getSettings().notifications;
  const out: Delivery = { popup: false, desktop: false };

  if (channels.popups) {
    // The body is the message; the title is already implied by the app the
    // toast appears in.
    toast(title, { description: body, duration: 8000 });
    out.popup = true;
  }
  if (channels.desktop) {
    out.desktop = await deliverDesktopNotification(title, body);
  }
  return out;
}

// ============ once-per-period bookkeeping ============

/** kind -> the period token last delivered for it. */
type SentMap = Partial<Record<NotificationKind | BackgroundKind, string>>;

const sent = sharedValue<SentMap>({
  key: "notificationsSent",
  fallback: {},
  parse: (raw) => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as SentMap) : {}),
});

/**
 * How each kind's recent deliveries went. Kept in its own key rather than
 * folded into `notificationsSent`, so a file written by an older build keeps
 * working untouched and this starts empty rather than misparsed.
 */
const learningStore = sharedValue<LearningState<NotificationKind>>({
  key: "notificationLearning",
  fallback: {},
  parse: (raw) => parseLearningState(raw, NOTIFICATION_KINDS),
});

/** What the adaptive layer has learned, for the Settings screen. */
export function useNotificationLearning(): LearningState<NotificationKind> {
  return learningStore.use();
}

/** Forgets it and starts over — the escape hatch when it has got someone wrong. */
export function resetNotificationLearning() {
  learningStore.set({});
}

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

/** The wait before the daily reminder speaks, for someone who arrives on time. */
export const BASE_GRACE_MIN = 20;
/** The longest that wait can ever grow to, however late the habit. */
export const MAX_GRACE_MIN = 90;

/**
 * How long after the start of seder א׳ the daily reminder holds its tongue.
 *
 * With no wait at all it told a man who habitually walks in twenty minutes into
 * the seder that he had not recorded it — every morning, twenty minutes before
 * he could have. So the wait is his own average arrival plus a margin: the
 * reminder arrives once he is genuinely late to record, not once the clock says
 * the seder began. Arriving early never earns *less* than the margin.
 */
export function graceMinutes(avgArrivalOffsetMin: number | null, onWeakDay: boolean): number {
  const habit = Math.max(0, Math.round(avgArrivalOffsetMin ?? 0));
  const grace = Math.min(MAX_GRACE_MIN, BASE_GRACE_MIN + habit);
  // On the weekday he most often falls short, half of it: that is the morning
  // the interruption earns its keep.
  return onWeakDay ? Math.round(grace / 2) : grace;
}

export type ReminderFacts = {
  now: Date;
  /**
   * Is the kollel sitting today — not weekend, Yom Tov, Erev Yom Tov, and not
   * bein hazmanim either, when there are no sedarim to record and so nothing
   * to chase. (The stipend calculation counts bein hazmanim out for the same
   * reason; see kollelSessionDaysInMonth.)
   */
  isLearningDay: boolean;
  /** Minutes past midnight at which seder 1 begins today. */
  seder1StartMin: number;
  hasEntryToday: boolean;
  lateCountThisMonth: number;
  maxLatePerMonth: number;
  lastWeek: { entries: number; netMissing: number; oheveiCount: number };
  enabled: {
    dailyReminder: boolean;
    latenessAlert: boolean;
    weeklySummary: boolean;
    forecastWarning: boolean;
    phoneReport: boolean;
  };
  /** The month the phone-system report is about — last month, as YYYY-MM. */
  reportMonth: string;
  /** Whether that month has already been marked as reported. */
  reportDone: boolean;
  /** Whether any channel is switched on at all. */
  anyChannelOn: boolean;
  sent: SentMap;

  // ---- what the adaptive layer reads ----
  /** Off restores the fixed rules exactly: no grace, no weak day, no backing off. */
  adaptive: boolean;
  /** Mean minutes between a seder starting and the user arriving; +ve is late. */
  avgArrivalOffsetMin: number | null;
  /** The weekday (0 = Sunday) he most often falls short on, if the record says. */
  weakWeekday: number | null;
  /** Net missing minutes the month is on course for, if it can be projected. */
  forecastNetMissing: number | null;
  netMissingThisMonth: number;
  alertMissingMinPerMonth: number;
  learning: LearningState<NotificationKind>;
  /**
   * For each kind with a delivery awaiting judgement: was the need behind
   * *that* delivery met? Judged against the period it was sent for — see
   * notification-learning.ts.
   */
  satisfiedPending: Partial<Record<NotificationKind, boolean>>;
};

export type ReminderDecision = {
  due: DueNotification[];
  /** Due, but held back because the kind has been going unanswered. */
  silenced: NotificationKind[];
  /** The learning state after settling verdicts and charging any cooldown. */
  learning: LearningState<NotificationKind>;
};

/**
 * Which reminders are worth raising right now, and what that taught us.
 *
 * Pure, so both the timing rules and the adaptation can be tested without a
 * clock, a desktop or a data file.
 */
export function decideNotifications(f: ReminderFacts): ReminderDecision {
  // With both channels off there is nowhere to say anything, and a reminder
  // marked "sent" into the void would never be seen at all. Nothing is judged
  // either: silence the user never had the chance to answer says nothing.
  if (!f.anyChannelOn) return { due: [], silenced: [], learning: f.learning };

  const today = `${f.now.getFullYear()}-${String(f.now.getMonth() + 1).padStart(2, "0")}-${String(f.now.getDate()).padStart(2, "0")}`;
  const monthKey = today.slice(0, 7);
  const weekKey = isoWeekKey(f.now);
  const nowMin = f.now.getHours() * 60 + f.now.getMinutes();
  const tokens: Record<NotificationKind, string> = {
    "daily-reminder": today,
    "lateness-alert": monthKey,
    "weekly-summary": weekKey,
    "forecast-warning": monthKey,
    // Daily, not monthly: it is raised once a day for the first five days of
    // the month, and stops the moment the month is marked as reported.
    "phone-report": today,
  };

  // Settle outstanding verdicts before anything else: a delivery that turned
  // out to have been answered clears a cooldown that would otherwise silence
  // this very check.
  let learning = f.learning;
  if (f.adaptive) {
    for (const kind of ADAPTIVE_KINDS) {
      const before = memoryFor(learning, kind);
      const after = settle(before, f.satisfiedPending[kind] ?? false, tokens[kind]);
      if (after !== before) learning = { ...learning, [kind]: after };
    }
  }

  const candidates: DueNotification[] = [];

  // 1. Nothing logged yet today. Held back until seder 1 has begun — a reminder
  //    at 06:00 to record a seder that starts at 09:00 is noise — plus the
  //    grace period above, and never raised on a day the kollel is not sitting.
  //    Nor when the background agent has already said it this morning: it
  //    says the same thing about the same seder, and the app opening an hour
  //    later is not a reason to hear it twice.
  if (
    f.enabled.dailyReminder &&
    f.isLearningDay &&
    !f.hasEntryToday &&
    f.sent["daily-reminder"] !== today &&
    f.sent["bg-seder-1"] !== today
  ) {
    const weakDay =
      f.adaptive && f.weakWeekday !== null && f.now.getDay() === f.weakWeekday
        ? f.weakWeekday
        : null;
    const grace = f.adaptive ? graceMinutes(f.avgArrivalOffsetMin, weakDay !== null) : 0;
    if (nowMin >= f.seder1StartMin + grace) {
      candidates.push({
        kind: "daily-reminder",
        token: today,
        title: "סדר פלוס — לא נרשם סדר היום",
        body:
          weakDay !== null
            ? `עדיין לא רשמת נוכחות להיום. יום ${WEEKDAY_NAMES[weakDay]} הוא היום שבו הכי הרבה סדרים יוצאים חסרים אצלך.`
            : "עדיין לא רשמת נוכחות להיום. פתח את מסך הנוכחות כדי לסמן הגעה.",
      });
    }
  }

  // 2. The month's late quota is used up. Once per month: re-toasting on every
  //    further lateness would train the user to ignore it.
  if (
    f.enabled.latenessAlert &&
    f.maxLatePerMonth > 0 &&
    f.lateCountThisMonth >= f.maxLatePerMonth &&
    f.sent["lateness-alert"] !== monthKey
  ) {
    candidates.push({
      kind: "lateness-alert",
      token: monthKey,
      title: "סדר פלוס — חריגה ממכסת האיחורים",
      body: `נרשמו ${f.lateCountThisMonth} איחורים החודש, מתוך מכסה של ${f.maxLatePerMonth}.`,
    });
  }

  // 3. Last week's numbers, the first time the app is open in a new week.
  if (f.enabled.weeklySummary && f.lastWeek.entries > 0 && f.sent["weekly-summary"] !== weekKey) {
    candidates.push({
      kind: "weekly-summary",
      token: weekKey,
      title: "סדר פלוס — סיכום השבוע שעבר",
      body: `${f.lastWeek.entries} סדרים · ${f.lastWeek.netMissing} דק׳ חסרות · ${f.lastWeek.oheveiCount} סדרי אוהבי ה׳.`,
    });
  }

  // 4. The month is on course to cross the missing-minutes threshold. This is
  //    the one reminder that arrives before the fact rather than after it,
  //    which is the whole reason it is worth raising — so it is deliberately
  //    dropped once the threshold has actually been crossed, where it would be
  //    news to nobody and the statistics screen already says it better.
  if (
    f.enabled.forecastWarning &&
    f.forecastNetMissing !== null &&
    f.alertMissingMinPerMonth > 0 &&
    f.forecastNetMissing >= f.alertMissingMinPerMonth &&
    f.netMissingThisMonth < f.alertMissingMinPerMonth &&
    f.sent["forecast-warning"] !== monthKey
  ) {
    candidates.push({
      kind: "forecast-warning",
      token: monthKey,
      title: "סדר פלוס — הקצב הנוכחי חורג מהסף",
      body: `לפי הקצב עד כה צפויות ${fmtMin(f.forecastNetMissing)} חסרות עד סוף החודש, מול סף של ${fmtMin(f.alertMissingMinPerMonth)}. יש עוד זמן לסגור את הפער.`,
    });
  }

  // 5. Last month has not been reported to the phone system. Once a day for
  //    the first five days of the month — not once, because the whole point
  //    is the deadline, and not after the 5th, because by then it is late and
  //    saying so again helps nobody.
  //
  //    This is the one reminder about something the app cannot see: it knows
  //    the report is due, but only the user can say it was made. The moment
  //    he does — on the dashboard, or on the button on the Windows toast —
  //    `reportDone` goes true and this stops.
  if (
    f.enabled.phoneReport &&
    !f.reportDone &&
    f.now.getDate() <= REPORT_WINDOW_LAST_DAY &&
    nowMin >= REPORT_REMINDER_MINUTE &&
    f.sent["phone-report"] !== today
  ) {
    const daysLeft = REPORT_WINDOW_LAST_DAY - f.now.getDate();
    candidates.push({
      kind: "phone-report",
      token: today,
      title: "סדר פלוס — דיווח למערכת הטלפונית",
      body:
        daysLeft === 0
          ? `היום היום האחרון לדווח על חודש ${formatMonthKey(f.reportMonth)} במערכת הטלפונית.`
          : `עדיין לא דיווחת על חודש ${formatMonthKey(f.reportMonth)} במערכת הטלפונית. נשארו ${daysLeft + 1} ימים.`,
    });
  }

  const due: DueNotification[] = [];
  const silenced: NotificationKind[] = [];
  for (const n of candidates) {
    if (!f.adaptive || !ADAPTIVE_KINDS.includes(n.kind)) {
      due.push(n);
      continue;
    }
    const before = memoryFor(learning, n.kind);
    const { suppressed, memory } = gate(before, n.token);
    if (memory !== before) learning = { ...learning, [n.kind]: memory };
    if (suppressed) silenced.push(n.kind);
    else due.push(n);
  }

  return { due, silenced, learning };
}

/** Which reminders are worth raising right now. */
export function dueNotifications(f: ReminderFacts): DueNotification[] {
  return decideNotifications(f).due;
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
  const from = isoOf(start),
    to = isoOf(end);
  return summarizeEntries(entries.filter((e) => e.date >= from && e.date <= to));
}

/**
 * Entries to read the arrival habit off.
 *
 * Not the current month: on the 2nd that is one or two records, and a habit
 * measured from two records is not a habit.
 */
const HABIT_WINDOW = 60;

/**
 * For each kind waiting on a verdict, whether the need behind that particular
 * delivery was met — asked of the day it was sent for, never of today. See the
 * note at the top of notification-learning.ts for why that distinction is the
 * whole point.
 */
function pendingSatisfaction(
  learning: LearningState<NotificationKind>,
  entries: SederEntry[],
): Partial<Record<NotificationKind, boolean>> {
  const out: Partial<Record<NotificationKind, boolean>> = {};
  const pendingDay = learning["daily-reminder"]?.pendingToken;
  if (pendingDay !== undefined) {
    out["daily-reminder"] = entries.some((e) => e.date === pendingDay);
  }
  return out;
}

export function collectFacts(now = new Date()): ReminderFacts {
  const settings = getSettings();
  const entries = getSederSnapshot();
  const today = isoOf(now);
  const times = getSederTimesFor(today);
  const month = entriesInMonth(entries, now.getFullYear(), now.getMonth());
  const monthTotals = summarizeEntries(month);
  const learning = learningStore.get();
  const weak = weakestLearningWeekday(entries);
  return {
    now,
    isLearningDay: isLearningDay(now) && !isBeinHazmanim(now),
    seder1StartMin: hhmmToMin(times.s1Start) ?? 0,
    hasEntryToday: entries.some((e) => e.date === todayISO()),
    lateCountThisMonth: monthTotals.lateCount,
    maxLatePerMonth: settings.goals.maxLatePerMonth,
    lastWeek: lastWeekSummary(entries, now),
    enabled: settings.notifications,
    reportMonth: reportedMonthFor(now),
    reportDone: isReported(reportedMonthFor(now)),
    anyChannelOn: settings.notifications.popups || settings.notifications.desktop,
    sent: sent.get(),
    adaptive: settings.notifications.adaptive,
    avgArrivalOffsetMin: averageArrivalOffsetMin(entries.slice(0, HABIT_WINDOW)),
    weakWeekday: weak ? weak.day : null,
    forecastNetMissing: forecastMonthlyNetMissing(),
    netMissingThisMonth: monthTotals.netMissing,
    alertMissingMinPerMonth: settings.seder.alertMissingMinPerMonth,
    learning,
    satisfiedPending: pendingSatisfaction(learning, entries),
  };
}

/** Delivers whatever is due, and records what was delivered and how it landed. */
export async function runReminderCheck(now = new Date()): Promise<DueNotification[]> {
  const f = collectFacts(now);
  const decision = decideNotifications(f);
  const delivered: DueNotification[] = [];
  let learning = decision.learning;

  for (const n of decision.due) {
    // Only mark it sent once a channel actually carried it, so a reminder is
    // not lost for the whole day because notifications happened to be muted
    // when the first attempt ran. The same goes for the verdict: a delivery
    // nobody could have seen must not later count as one they ignored.
    const result = await announce(n.title, n.body);
    if (!result.popup && !result.desktop) continue;
    delivered.push(n);
    if (f.adaptive && ADAPTIVE_KINDS.includes(n.kind)) {
      learning = { ...learning, [n.kind]: markDelivered(memoryFor(learning, n.kind), n.token) };
    }
  }

  if (delivered.length) {
    const next = { ...sent.get() };
    for (const n of delivered) next[n.kind] = n.token;
    sent.set(next);
  }
  // Settling a verdict and charging a cooldown both happen with nothing
  // delivered, so this is written whenever it moved — and only then. These
  // rules re-run every ten minutes in every open window, and each set() is a
  // write to the file the other EXE is polling.
  if (JSON.stringify(learning) !== JSON.stringify(learningStore.get())) {
    learningStore.set(learning);
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
    const first = setTimeout(() => {
      void runReminderCheck();
    }, 8000);
    const timer = setInterval(() => {
      void runReminderCheck();
    }, CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
}
