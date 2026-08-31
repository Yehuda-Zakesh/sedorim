// דיווח למערכת הטלפונית — מי שכבר דיווח לא צריך שיזכירו לו.
//
// The kollel is reported to by phone at the start of each month, for the
// month that just ended. The app cannot do the reporting and does not try to;
// all it does is remember whether it was done, so that the reminder stops the
// moment the user says it was.
//
// Kept in its own key rather than inside `settings` because two processes
// write it: the app (the dashboard card) and SederPlusAgent.exe (the button
// on its Windows toast). `settings` is a single large object the app rewrites
// wholesale, and a background write into it would lose whatever the app
// changed in the same second.

import { sharedValue } from "./shared-state";

/** The last day of the month the reminder still runs on. Also in Rust, as
 *  PHONE_REPORT_LAST_DAY in src-tauri/shared/src/plan.rs — keep them equal. */
export const REPORT_WINDOW_LAST_DAY = 5;

/** The hour the agent raises it at, as minutes past midnight — 20:00. */
export const REPORT_REMINDER_MINUTE = 20 * 60;

export type PhoneReportState = {
  /** Months (YYYY-MM) already reported. */
  reported: string[];
};

const store = sharedValue<PhoneReportState>({
  key: "phoneReport",
  fallback: { reported: [] },
  parse: (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { reported: [] };
    const months = (raw as PhoneReportState).reported;
    return { reported: Array.isArray(months) ? months.filter((m) => typeof m === "string") : [] };
  },
});

/** "2026-08" for a date in September 2026 — the month a report is about. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The month the report due now covers: the one before the given date's. */
export function reportedMonthFor(now: Date): string {
  return monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

export function isReported(month: string): boolean {
  return store.get().reported.includes(month);
}

export function setReported(month: string, reported: boolean) {
  const current = store.get().reported;
  if (reported) {
    if (current.includes(month)) return;
    store.set({ reported: [...current, month] });
  } else {
    if (!current.includes(month)) return;
    store.set({ reported: current.filter((m) => m !== month) });
  }
}

/** Re-renders on the agent's writes too, since it polls the same file. */
export function usePhoneReport(): PhoneReportState {
  return store.use();
}

/**
 * Whether last month's report is still outstanding *and* still worth saying.
 *
 * The window closes on the 5th: after it the report is late, the user knows,
 * and a card that keeps repeating it has stopped being a reminder.
 */
export function isReportDue(now: Date, reported: string[] = store.get().reported): boolean {
  if (now.getDate() > REPORT_WINDOW_LAST_DAY) return false;
  return !reported.includes(reportedMonthFor(now));
}

/** "2026-08" -> "08/2026", for a sentence that has to fit on one line. */
export function formatMonthKey(month: string): string {
  const [year, m] = month.split("-");
  return m ? `${m}/${year}` : month;
}
