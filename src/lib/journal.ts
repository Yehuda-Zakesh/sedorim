// The journal ("היומן שלי"): list, calendar and search share these pure
// helpers — what a link to one exact record looks like, how such a link is
// read back, and how the list screen filters a month. No formulas live here:
// every figure still comes from calcSeder / effectiveLearningMin.
//
// LINKING INTO THE LIST WITH AN INTENT (e.g. from the month summary):
//   <Link to="/history" search={{ month: "2026-03", kind: "attendance", filter: "exceptions" }} />
//   kind   = "attendance" | "learning"   ("seder" is accepted as a synonym of "attendance")
//   filter = "exceptions" | "late" | "absent" | "early" | "incomplete" | "ohevei" | "bonus"
//            "exceptions" = late + absent + early departure; "incomplete" = a
//            record with no hours that is not an absence. Applies to attendance only.
// A link that carries a kind and/or a filter REPLACES the saved list view (tab and
// every filter) with exactly that; a link with only `month` leaves the saved view
// alone. See JOURNAL_FILTERS and viewPatchFromSearch.
import {
  calcSeder,
  FRAMEWORK_LABELS,
  type LearningEntry,
  type SederCalc,
  type SederEntry,
} from "./kollel-store";

export type EntryKind = "seder" | "learning";

/** Values the attendance list can be narrowed to from a link (also its type select). */
export const JOURNAL_FILTERS = [
  "exceptions",
  "late",
  "absent",
  "early",
  "incomplete",
  "ohevei",
  "bonus",
] as const;
export type JournalFilter = (typeof JOURNAL_FILTERS)[number];

/** `attendance` is the link-friendly name of `seder`. */
export type JournalKindParam = EntryKind | "attendance";

/** The search params of /history that point at a record. All optional. */
export type JournalSearch = {
  /** YYYY-MM */
  month?: string;
  id?: string;
  kind?: JournalKindParam;
  /** Narrows the attendance list; see the note at the top of this file. */
  filter?: JournalFilter;
  /** YYYY-MM-DD — opens the first record of that day when no id is given. */
  date?: string;
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Reads untrusted URL params; anything malformed is dropped, never thrown. */
export function parseJournalSearch(raw: Record<string, unknown>): JournalSearch {
  const out: JournalSearch = {};
  if (typeof raw.month === "string" && MONTH_RE.test(raw.month)) out.month = raw.month;
  if (typeof raw.id === "string" && raw.id.length > 0 && raw.id.length <= 100) out.id = raw.id;
  if (raw.kind === "seder" || raw.kind === "learning" || raw.kind === "attendance")
    out.kind = raw.kind;
  if (JOURNAL_FILTERS.includes(raw.filter as JournalFilter))
    out.filter = raw.filter as JournalFilter;
  if (typeof raw.date === "string" && DATE_RE.test(raw.date)) out.date = raw.date;
  return out;
}

/** The params that make /history open exactly this record. */
export function openParams(kind: EntryKind, entry: { id: string; date: string }): JournalSearch {
  return { month: entry.date.slice(0, 7), id: entry.id, kind };
}

export type OpenTarget = { kind: EntryKind; id: string; month: string };

/**
 * The record a set of params refers to, or null when there is none (yet).
 * An id wins over a date; without a kind, seder records are looked at first.
 */
export function resolveOpenTarget(
  search: JournalSearch,
  entries: readonly SederEntry[],
  lessons: readonly LearningEntry[],
): OpenTarget | null {
  const kinds: EntryKind[] = search.kind
    ? [search.kind === "learning" ? "learning" : "seder"]
    : ["seder", "learning"];
  for (const kind of kinds) {
    const list: readonly { id: string; date: string }[] = kind === "seder" ? entries : lessons;
    const hit = search.id
      ? list.find((x) => x.id === search.id)
      : search.date
        ? list.find((x) => x.date === search.date)
        : undefined;
    if (hit) return { kind, id: hit.id, month: hit.date.slice(0, 7) };
  }
  return null;
}

/** A local-time Date (noon, so a DST shift can never change the day). */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

export const WEEKDAYS_HE = [
  "יום ראשון",
  "יום שני",
  "יום שלישי",
  "יום רביעי",
  "יום חמישי",
  "יום שישי",
  "שבת",
];

// ---------- the list screen's filters ----------

export type TypeFilter = "all" | JournalFilter;
export type ExcusedFilter = "all" | "excused" | "non-excused";

export type JournalView = {
  tab: EntryKind;
  q: string;
  seder: "all" | "1" | "2";
  type: TypeFilter;
  excused: ExcusedFilter;
  framework: "all" | LearningEntry["framework"];
};

export const DEFAULT_VIEW: JournalView = {
  tab: "seder",
  q: "",
  seder: "all",
  type: "all",
  excused: "all",
  framework: "all",
};

const TYPES: TypeFilter[] = ["all", ...JOURNAL_FILTERS];
const EXCUSED: ExcusedFilter[] = ["all", "excused", "non-excused"];
const FRAMEWORKS = ["all", "kollel-erev", "torato-beyado", "bein-hazmanim"];

/** Restores a saved view, falling back per field so a stale value cannot break the screen. */
export function sanitizeView(raw: unknown): JournalView {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    tab: r.tab === "learning" ? "learning" : "seder",
    q: typeof r.q === "string" ? r.q.slice(0, 200) : "",
    seder: r.seder === "1" || r.seder === "2" ? r.seder : "all",
    type: TYPES.includes(r.type as TypeFilter) ? (r.type as TypeFilter) : "all",
    excused: EXCUSED.includes(r.excused as ExcusedFilter) ? (r.excused as ExcusedFilter) : "all",
    framework: FRAMEWORKS.includes(r.framework as string)
      ? (r.framework as JournalView["framework"])
      : "all",
  };
}

/**
 * Whether a seder record says when the person was there. A record that is not
 * an absence and has no arrival (or no hours at all) must never read as "full
 * attendance": the data does not support it.
 */
export type HoursState = "absent" | "no-hours" | "no-arrival" | "ok";
export function hoursState(e: SederEntry): HoursState {
  if (e.absent) return "absent";
  if (!e.arrival) return e.departure ? "no-arrival" : "no-hours";
  return "ok";
}

/** The state of a seder record in words (never colour alone). */
export function sederStatusWords(e: SederEntry, c: SederCalc): string[] {
  const h = hoursState(e);
  if (h === "absent") return c.excusedMin > 0 ? ["היעדרות", "מוצדק"] : ["היעדרות"];
  const out: string[] = [];
  if (h === "no-hours") out.push("חסר פירוט שעות");
  else if (h === "no-arrival") out.push("חסרה שעת הגעה");
  if (c.isLate) out.push("איחור");
  if (c.isEarlyDeparture) out.push("יציאה מוקדמת");
  if (h === "ok" && !c.isLate && !c.isEarlyDeparture) out.push("נוכח במלואו");
  if (c.isOhevei) out.push("אוהבי ה׳");
  if (c.excusedMin > 0) out.push("מוצדק");
  return out;
}

/** Whether a record needs a look (incomplete, late, left early, absent, missing minutes). */
export function needsAttention(e: SederEntry, c: SederCalc): boolean {
  return (
    e.absent || hoursState(e) !== "ok" || c.isLate || c.isEarlyDeparture || c.netMissingMin > 0
  );
}

/**
 * What a link with an explicit intent does to the saved list view: a full
 * replacement (tab + filters), so a stale filter can never hide what the link
 * meant to show. null when the link states no intent (keep the saved view).
 */
export function viewPatchFromSearch(s: JournalSearch): JournalView | null {
  if (!s.kind && !s.filter) return null;
  const tab: EntryKind = s.kind === "learning" ? "learning" : "seder";
  return { ...DEFAULT_VIEW, tab, type: tab === "seder" && s.filter ? s.filter : "all" };
}

/** Whether any filter other than the tab itself is narrowing the list. */
export function filtersActive(v: JournalView): boolean {
  return (
    v.q !== "" ||
    v.seder !== "all" ||
    v.type !== "all" ||
    v.excused !== "all" ||
    v.framework !== "all"
  );
}

export function filterSeder(entries: readonly SederEntry[], v: JournalView): SederEntry[] {
  return entries.filter((e) => {
    if (v.seder !== "all" && String(e.seder) !== v.seder) return false;
    const c = calcSeder(e);
    if (v.type === "exceptions" && !(c.isLate || e.absent || c.isEarlyDeparture)) return false;
    if (v.type === "incomplete" && hoursState(e) !== "no-hours" && hoursState(e) !== "no-arrival")
      return false;
    if (v.type === "late" && !c.isLate) return false;
    if (v.type === "absent" && !e.absent) return false;
    if (v.type === "early" && !c.isEarlyDeparture) return false;
    if (v.type === "ohevei" && !c.isOhevei) return false;
    if (v.type === "bonus" && c.bonusMin === 0) return false;
    if (v.excused === "excused" && c.excusedMin === 0) return false;
    if (v.excused === "non-excused" && c.excusedMin > 0) return false;
    if (
      v.q &&
      !(
        e.date.includes(v.q) ||
        (e.note || "").includes(v.q) ||
        (e.excusedReason || "").includes(v.q) ||
        (e.tags || []).some((t) => t.includes(v.q))
      )
    )
      return false;
    return true;
  });
}

export function filterLearning(items: readonly LearningEntry[], v: JournalView): LearningEntry[] {
  return items.filter((i) => {
    if (v.framework !== "all" && i.framework !== v.framework) return false;
    if (
      v.q &&
      !(
        i.date.includes(v.q) ||
        (i.note || "").includes(v.q) ||
        FRAMEWORK_LABELS[i.framework].includes(v.q)
      )
    )
      return false;
    return true;
  });
}

/** 2026-10-27 -> 27.10.2026, the date as people read it. ISO stays for links and storage. */
export function formatDayDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Records that say nothing about when the person was there (and are not an absence). */
export function isIncomplete(e: SederEntry): boolean {
  const h = hoursState(e);
  return h === "no-hours" || h === "no-arrival";
}

export function incompleteCount(entries: readonly SederEntry[]): number {
  return entries.filter(isIncomplete).length;
}

/** The status words worth saying out loud: a fully present record says nothing. */
export function notableStatusWords(e: SederEntry, c: SederCalc): string[] {
  return sederStatusWords(e, c).filter((w) => w !== "נוכח במלואו");
}

export type FilterChip = { key: string; label: string; clear: Partial<JournalView> };

const TYPE_LABELS: Record<JournalFilter, string> = {
  exceptions: "חריגות",
  late: "איחור",
  absent: "היעדרות",
  early: "יציאה מוקדמת",
  incomplete: "דורש תיקון (חסר פירוט שעות)",
  ohevei: "אוהבי ה׳",
  bonus: "בונוס",
};
const FRAMEWORK_CHIP: Record<string, string> = {
  "kollel-erev": "כולל ערב",
  "torato-beyado": "תורתו בידו",
  "bein-hazmanim": "ישיבת בין הזמנים",
};

/** The filters in force as small removable tags, for the active tab only (q excluded: it has its own box). */
export function activeFilterChips(v: JournalView): FilterChip[] {
  const out: FilterChip[] = [];
  if (v.tab === "seder") {
    if (v.seder !== "all")
      out.push({
        key: "seder",
        label: `סדר ${v.seder === "1" ? "א׳" : "ב׳"}`,
        clear: { seder: "all" },
      });
    if (v.type !== "all")
      out.push({ key: "type", label: TYPE_LABELS[v.type], clear: { type: "all" } });
    if (v.excused !== "all")
      out.push({
        key: "excused",
        label: v.excused === "excused" ? "מוצדק בלבד" : "לא מוצדק בלבד",
        clear: { excused: "all" },
      });
  } else if (v.framework !== "all") {
    out.push({
      key: "framework",
      label: FRAMEWORK_CHIP[v.framework] ?? v.framework,
      clear: { framework: "all" },
    });
  }
  return out;
}

export type CalendarShow = { attendance: boolean; learning: boolean };

export type CalendarDay<S, L> = {
  /** What the calendar draws, lists and opens for the day — all from the same filtered set. */
  seder: S[];
  lessons: L[];
  /** Records the kind filter hides, so the screen can say so instead of silently skipping them. */
  hiddenSeder: number;
  hiddenLessons: number;
  /** What a click on the day opens: only when exactly one visible record exists. */
  target: { kind: EntryKind; id: string } | null;
};

export function calendarDay<S extends { id: string }, L extends { id: string }>(
  date: string,
  byDate: Readonly<Record<string, S[]>>,
  lessonsByDate: Readonly<Record<string, L[]>>,
  show: CalendarShow,
): CalendarDay<S, L> {
  const allSeder = byDate[date] ?? [];
  const allLessons = lessonsByDate[date] ?? [];
  const seder = show.attendance ? allSeder : [];
  const lessons = show.learning ? allLessons : [];
  let target: CalendarDay<S, L>["target"] = null;
  if (seder.length === 1 && lessons.length === 0) target = { kind: "seder", id: seder[0].id };
  else if (seder.length === 0 && lessons.length === 1)
    target = { kind: "learning", id: lessons[0].id };
  return {
    seder,
    lessons,
    hiddenSeder: allSeder.length - seder.length,
    hiddenLessons: allLessons.length - lessons.length,
    target,
  };
}

/** "חודש שהסתיים" / "החודש טרם הסתיים" — `closed` only means the month is over. */
export function monthStateLabel(closed: boolean): string {
  return closed ? "חודש שהסתיים" : "החודש טרם הסתיים";
}
