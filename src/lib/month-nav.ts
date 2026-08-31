// Moving between months.
//
// The History screen shows one month at a time, so "the month before this one"
// and "which months are there to look at" became real questions with real edge
// cases — December to January, a month with records but no lessons, a month
// nobody has typed anything into yet. They live here so they can be tested
// without a screen.

const GREGORIAN_MONTHS_HE = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

/** The current month as YYYY-MM. */
export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** The month `by` months away from `key`, as YYYY-MM. Crosses years. */
export function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return currentMonthKey(d);
}

/** "אוגוסט 2026" */
export function monthKeyLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return GREGORIAN_MONTHS_HE[m - 1] ? `${GREGORIAN_MONTHS_HE[m - 1]} ${y}` : key;
}

/**
 * Every month worth offering, newest first.
 *
 * The current month is always in the list even when empty — it is the month
 * the screen opens on, and an empty list with nowhere to go reads as a bug.
 */
export function monthsWithData(...lists: { date: string }[][]): string[] {
  const keys = new Set<string>([currentMonthKey()]);
  for (const list of lists) {
    for (const item of list) {
      if (typeof item?.date === "string" && item.date.length >= 7) keys.add(item.date.slice(0, 7));
    }
  }
  return [...keys].sort().reverse();
}
