// Which days attendance can be recorded on.
//
// Weekends (Friday, Saturday), Yom Tov and Erev Yom Tov are not ordinary
// learning days: the seder is not in session, so no attendance is recorded on
// them. The rule itself is `isLearningDay` in hebrew-calendar.ts — this file
// only turns it into a reason a person can read, and one place to ask.
//
// It guards *new* attendance. Records that already sit on such a day (entered
// before the rule, imported, restored from a backup) stay where they are and
// stay editable; see `upsert` in kollel-store.ts. Extra learning (לימוד נוסף)
// is a separate record type and is not covered.
import { isErevYomTov, isLearningDay, isYomTov } from "./hebrew-calendar";
import { parseISODate } from "./quick-day";

/**
 * Where attendance cannot be recorded, as a phrase that starts with "ב":
 * "בשבת", "ביום שישי", "ביום טוב", "בערב יום טוב". Null when the day is an
 * ordinary learning day — and for a date that does not parse, which
 * validation reports on its own.
 */
export function attendanceBlockedReason(iso: string): string | null {
  const d = parseISODate(iso);
  if (!d || isLearningDay(d)) return null;
  if (d.getDay() === 6) return "בשבת";
  if (d.getDay() === 5) return "ביום שישי";
  if (isYomTov(d)) return "ביום טוב";
  if (isErevYomTov(d)) return "בערב יום טוב";
  return "ביום זה";
}

/** The sentence shown wherever a save is refused for this reason, or null. */
export function attendanceBlockedMessage(iso: string): string | null {
  const reason = attendanceBlockedReason(iso);
  return reason ? `${reason} לא רושמים נוכחות — זה אינו יום לימוד רגיל.` : null;
}
