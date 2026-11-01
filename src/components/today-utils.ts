// Small pure helpers shared by the "היום" screens (home and attendance).
import type { SederCalc, SederEntry, SederNum } from "@/lib/kollel-store";

/**
 * Minutes with explicit units: "0 דק׳", "90 דק׳" is shown as "1 שע׳ 30 דק׳",
 * "45 דק׳", "2 שע׳". Never a bare number and never the ambiguous "1:30".
 */
export function fmtDur(m: number): string {
  const total = Math.round(m);
  if (!total) return "0 דק׳";
  const h = Math.floor(total / 60);
  const r = total % 60;
  if (h === 0) return `${r} דק׳`;
  return r === 0 ? `${h} שע׳` : `${h} שע׳ ${r} דק׳`;
}

/** A YYYY-MM-DD string as a local-time date (noon, so DST can never move the day). */
export function parseLocalISO(iso: string): Date {
  const [y, mo, d] = iso.split("-").map(Number);
  if (!y || !mo || !d) return new Date(NaN);
  return new Date(y, mo - 1, d, 12);
}

export const sederName = (n: 1 | 2) => (n === 1 ? "סדר א׳" : "סדר ב׳");

const WEEKDAYS = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבת"];
export const weekdayName = (d: Date) => WEEKDAYS[d.getDay()] ?? "";

/** A row with neither arrival nor departure that is not an absence: no hours to speak of. */
export function hasNoHours(e: Pick<SederEntry, "absent" | "arrival" | "departure">): boolean {
  return !e.absent && !e.arrival && !e.departure;
}

export type RecordState = "absent" | "incomplete" | "arrived" | "done";

/**
 * Where a saved seder stands, which decides its one primary action:
 * absent (a legitimate record), incomplete (needs hours), arrived (needs a
 * departure) or done.
 */
export function recordState(e: Pick<SederEntry, "absent" | "arrival" | "departure">): RecordState {
  if (e.absent) return "absent";
  if (!e.arrival) return "incomplete";
  if (!e.departure) return "arrived";
  return "done";
}

/** The state of a seder in words, so it is never carried by colour alone. */
export function statusWords(e: SederEntry, c: SederCalc): string[] {
  if (e.absent) return ["היעדרות"];
  // No hours is not full attendance, even though no late/early flag is raised.
  if (hasNoHours(e)) return [c.missingMin > 0 ? "חסר פירוט שעות" : "רישום לא שלם"];
  const out: string[] = [];
  if (!e.arrival) out.push("שעת הגעה חסרה");
  if (c.isLate) out.push("איחור");
  if (c.isEarlyDeparture) out.push("יציאה מוקדמת");
  if (!e.departure) out.push("יציאה טרם נרשמה");
  if (!c.isLate && !c.isEarlyDeparture && e.arrival && e.departure) out.push("נוכח במלואו");
  if (c.isOhevei) out.push("אוהבי ה׳");
  if (c.excusedMin > 0) out.push("מוצדק");
  return out;
}

/**
 * Today's completion counted against the sedarim that are actually owed:
 * none on a day without learning, only seder א׳ on a fast day. Records of a
 * seder that is not owed are reported separately and never count as done.
 */
export function dayCompletion(opts: {
  learningDay: boolean;
  noSederB: boolean;
  recorded: readonly SederNum[];
}) {
  const required: SederNum[] = !opts.learningDay ? [] : opts.noSederB ? [1] : [1, 2];
  const have = new Set(opts.recorded);
  const done = required.filter((n) => have.has(n));
  const missing = required.filter((n) => !have.has(n));
  const extra = ([1, 2] as SederNum[]).filter((n) => have.has(n) && !required.includes(n));
  return { required, done, missing, extra, complete: required.length > 0 && missing.length === 0 };
}

/** One line saying how the day stands. */
export function completionText(c: ReturnType<typeof dayCompletion>): string {
  const extra =
    c.extra.length > 0
      ? ` · ${c.extra.map(sederName).join(", ")} נרשם אף שאינו נדרש היום (לא נספר)`
      : "";
  if (c.required.length === 0) return `אין סדרים נדרשים היום${extra}`;
  if (c.done.length === 0) return `טרם נרשם דבר מתוך ${c.required.length} סדרים נדרשים${extra}`;
  if (c.complete) return `נרשמו כל הסדרים הנדרשים (${c.done.length})${extra}`;
  return `נרשמו ${c.done.length} מתוך ${c.required.length} סדרים נדרשים${extra}`;
}

// ---- attendance form state ----

type ExcuseFields = { excusedAll: boolean; excusedMinutes: number; excusedReason: string };
type ExtraFields = { manualAdjustMin: number; note: string };

export const hasExcuse = (f: ExcuseFields) =>
  f.excusedAll || f.excusedMinutes > 0 || f.excusedReason !== "";
export const hasExtras = (f: ExtraFields) => f.manualAdjustMin !== 0 || f.note !== "";

/** Which expandable sections of the form a record's data calls for. */
export function editStateFromForm(f: ExcuseFields & ExtraFields) {
  return { excuseOpen: hasExcuse(f), extrasOpen: hasExtras(f) };
}

function sameFields(a: object, b: object): boolean {
  const ka = Object.keys(a) as (keyof typeof a)[];
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k as keyof typeof b]);
}

/**
 * The stored record changed under an open form. `base` is what the form was
 * loaded from. Clean form: follow the new record. Edited form: keep the draft
 * and let the user choose. Already equal: nothing to do.
 */
export function reconcileForm<T extends object>(
  form: T,
  base: T,
  incoming: T,
): "same" | "sync" | "conflict" {
  if (sameFields(form, incoming)) return "same";
  return sameFields(form, base) ? "sync" : "conflict";
}

// ---- today's draft, tied to a date and a seder ----

/** A draft belongs to one seder on one date; the key is what tells them apart. */
export const draftKey = (date: string, seder: SederNum) => `${date}|${seder}`;

/** A draft written under another key is not this card's: it must not carry over. */
export const draftBelongs = (draft: { key: string } | null, key: string) =>
  draft !== null && draft.key === key;

/** The current time as HH:MM, for the "עכשיו" shortcut. */
export function nowHHMM(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// ---- save state: draft / saving / failed (saved is the summary row itself) ----

export type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "failed"; message: string };

export function saveStatusLabel(s: SaveState, dirty: boolean): string {
  if (s.kind === "saving") return "שומר…";
  if (s.kind === "failed") return `שמירה נכשלה — ${s.message}. הערכים נשארו בטופס, אפשר לנסות שוב.`;
  return dirty ? "טיוטה — טרם נשמר" : "טרם נשמר";
}

export const errorMessage = (e: unknown) => (e instanceof Error && e.message ? e.message : "שגיאה");

/**
 * Status words of a seder recorded as usual are silent: only a late arrival,
 * a shortfall, a justified part, or missing hours are worth saying again.
 */
export function notableWords(e: SederEntry, c: SederCalc): string[] {
  if (e.absent) return [];
  return statusWords(e, c).filter((w) => w !== "נוכח במלואו");
}

// ---- links from today into the attendance screen ----

export type AttendanceFocus = "arrival" | "departure" | "edit";
export type AttendanceSearch = { date?: string; seder?: SederNum; focus?: AttendanceFocus };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The search parameters of a link to /attendance; empty fields are left out. */
export function attendanceSearch(opts: {
  date?: string;
  seder?: SederNum;
  focus?: AttendanceFocus;
}): AttendanceSearch {
  const out: AttendanceSearch = {};
  if (opts.date) out.date = opts.date;
  if (opts.seder) out.seder = opts.seder;
  if (opts.focus) out.focus = opts.focus;
  return out;
}

/** Reads /attendance search parameters defensively: anything malformed is dropped. */
export function parseAttendanceSearch(raw: Record<string, unknown>): AttendanceSearch {
  const seder = Number(raw.seder);
  const focus = raw.focus;
  return attendanceSearch({
    date: typeof raw.date === "string" && ISO_DATE.test(raw.date) ? raw.date : undefined,
    seder: seder === 1 || seder === 2 ? seder : undefined,
    focus: focus === "arrival" || focus === "departure" || focus === "edit" ? focus : undefined,
  });
}

/** Which field a saved record's action should land on. */
export function focusFor(state: RecordState): AttendanceFocus {
  return state === "arrived" ? "departure" : state === "incomplete" ? "arrival" : "edit";
}
