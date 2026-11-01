// The day the quick-entry window is writing to. Local-time only (no UTC):
// every ISO string here is a calendar date as the wall clock reads it.

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parses YYYY-MM-DD at local noon, or null when it is not a real date. */
export function parseISODate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12);
  return toISO(d) === iso ? d : null;
}

/** The date `offset` days from `from` (negative = earlier). */
export function shiftISO(from: Date, offset: number): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, 12);
  return toISO(d);
}

/** "30.10" */
export function shortDate(iso: string): string {
  const d = parseISODate(iso);
  return d
    ? `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`
    : iso;
}

/** "היום", "אתמול", or the short date. */
export function relativeDayName(iso: string, now: Date): string {
  if (iso === toISO(now)) return "היום";
  if (iso === shiftISO(now, -1)) return "אתמול";
  return shortDate(iso);
}

/** "היום" / "אתמול, 30.10" / "30.10" — for button labels. */
export function dayLabelWithDate(iso: string, now: Date): string {
  const rel = relativeDayName(iso, now);
  return rel === "היום" ? rel : rel === shortDate(iso) ? rel : `${rel}, ${shortDate(iso)}`;
}

/** "YYYY-MM" of a date. */
export function monthPrefixOf(iso: string): string {
  return iso.slice(0, 7);
}
