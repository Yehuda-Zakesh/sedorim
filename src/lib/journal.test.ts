import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  filterSeder,
  filtersActive,
  hoursState,
  monthStateLabel,
  openParams,
  parseJournalSearch,
  parseLocalDate,
  resolveOpenTarget,
  sanitizeView,
  sederStatusWords,
  viewPatchFromSearch,
} from "./journal";
import {
  runSearch,
  EMPTY_SEARCH,
  normalizeSearchFilter,
  sanitizeSearchFilter,
} from "./journal-search";
import { calcSeder, type LearningEntry, type SederEntry } from "./kollel-store";

const seder = (id: string, date: string): SederEntry => ({
  id,
  date,
  seder: 1,
  absent: false,
  ohevei: false,
  excusedAll: false,
  excusedMinutes: 0,
  manualAdjustMin: 0,
  tags: [],
  note: "שיעור",
});
const lesson = (id: string, date: string): LearningEntry => ({
  id,
  date,
  framework: "kollel-erev",
  minutes: 30,
  source: "manual",
});

describe("parseJournalSearch", () => {
  it("keeps valid params and drops malformed ones", () => {
    expect(
      parseJournalSearch({ month: "2026-03", id: "a", kind: "learning", date: "2026-03-05" }),
    ).toEqual({
      month: "2026-03",
      id: "a",
      kind: "learning",
      date: "2026-03-05",
    });
    expect(parseJournalSearch({ month: "2026-13", id: 5, kind: "x", date: "2026-02-31x" })).toEqual(
      {},
    );
    expect(parseJournalSearch({})).toEqual({});
  });
});

describe("openParams / resolveOpenTarget", () => {
  const entries = [seder("s1", "2026-03-05")];
  const lessons = [lesson("l1", "2026-02-10")];

  it("round-trips a record through its link params", () => {
    const p = openParams("learning", lessons[0]);
    expect(p).toEqual({ month: "2026-02", id: "l1", kind: "learning" });
    expect(resolveOpenTarget(p, entries, lessons)).toEqual({
      kind: "learning",
      id: "l1",
      month: "2026-02",
    });
  });

  it("finds by id without a kind, and by date", () => {
    expect(resolveOpenTarget({ id: "s1" }, entries, lessons)?.kind).toBe("seder");
    expect(resolveOpenTarget({ date: "2026-02-10" }, entries, lessons)?.id).toBe("l1");
  });

  it("returns null for a month-only link or an unknown id", () => {
    expect(resolveOpenTarget({ month: "2026-03" }, entries, lessons)).toBeNull();
    expect(resolveOpenTarget({ id: "nope" }, entries, lessons)).toBeNull();
    expect(resolveOpenTarget({ id: "s1", kind: "learning" }, entries, lessons)).toBeNull();
  });
});

describe("views and filters", () => {
  it("sanitizes a stale stored view", () => {
    expect(sanitizeView({ tab: "bogus", type: "late", q: 4 })).toEqual({
      ...DEFAULT_VIEW,
      type: "late",
    });
    expect(sanitizeView(null)).toEqual(DEFAULT_VIEW);
    expect(filtersActive(DEFAULT_VIEW)).toBe(false);
    expect(filtersActive({ ...DEFAULT_VIEW, q: "x" })).toBe(true);
  });

  it("sanitizes saved search filters", () => {
    expect(sanitizeSearchFilter({ q: "a", type: "zzz", tag: 3 })).toEqual({
      ...EMPTY_SEARCH,
      q: "a",
    });
  });

  it("labels an ended month without implying a lock", () => {
    expect(monthStateLabel(true)).toBe("חודש שהסתיים");
    expect(monthStateLabel(false)).not.toContain("נעול");
  });

  it("parses ISO dates in local time", () => {
    const d = parseLocalDate("2026-03-05");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 5]);
  });
});

describe("runSearch", () => {
  const entries = [seder("s1", "2026-03-05"), seder("s2", "2026-01-02")];
  const lessons = [lesson("l1", "2026-02-10")];

  it("returns newest first, each result carrying its open params", () => {
    const r = runSearch(entries, lessons, EMPTY_SEARCH);
    expect(r.map((x) => x.key)).toEqual(["s-s1", "l-l1", "s-s2"]);
    expect(r[1].open).toEqual({ month: "2026-02", id: "l1", kind: "learning" });
  });

  it("applies range, text and tag rules", () => {
    expect(runSearch(entries, lessons, { ...EMPTY_SEARCH, from: "2026-02-01" })).toHaveLength(2);
    expect(runSearch(entries, lessons, { ...EMPTY_SEARCH, q: "שיעור" })).toHaveLength(2);
    expect(runSearch(entries, lessons, { ...EMPTY_SEARCH, tag: "x" })).toHaveLength(0);
  });
});

describe("link intent", () => {
  it("parses kind=attendance and the exceptions filter", () => {
    expect(
      parseJournalSearch({ month: "2026-03", kind: "attendance", filter: "exceptions" }),
    ).toEqual({ month: "2026-03", kind: "attendance", filter: "exceptions" });
    expect(parseJournalSearch({ filter: "nope" })).toEqual({});
  });

  it("an intent replaces the saved view; a month-only link keeps it", () => {
    expect(viewPatchFromSearch({ month: "2026-03" })).toBeNull();
    expect(viewPatchFromSearch({ kind: "attendance", filter: "exceptions" })).toEqual({
      ...DEFAULT_VIEW,
      tab: "seder",
      type: "exceptions",
    });
    expect(viewPatchFromSearch({ kind: "learning", filter: "late" })).toEqual({
      ...DEFAULT_VIEW,
      tab: "learning",
    });
    expect(viewPatchFromSearch({ filter: "late" })?.tab).toBe("seder");
  });

  it("exceptions = late + absent + early, nothing else", () => {
    const v = { ...DEFAULT_VIEW, type: "exceptions" as const };
    const ok = { ...seder("ok", "2026-03-05"), arrival: "09:00", departure: "13:00" };
    const absent = { ...seder("ab", "2026-03-05"), absent: true };
    const late = { ...seder("la", "2026-03-05"), arrival: "11:30", departure: "13:00" };
    const ids = filterSeder([ok, absent, late], v).map((e) => e.id);
    expect(ids).toContain("ab");
    expect(ids).toContain("la");
    expect(ids).not.toContain("ok");
  });

  it("an entry without hours is never 'full attendance'", () => {
    const e = seder("x", "2026-03-05");
    expect(hoursState(e)).toBe("no-hours");
    expect(sederStatusWords(e, calcSeder(e))).toEqual(["חסר פירוט שעות"]);
    expect(filterSeder([e], { ...DEFAULT_VIEW, type: "incomplete" })).toHaveLength(1);
  });

  it("resolves kind=attendance to seder records", () => {
    expect(
      resolveOpenTarget({ id: "s1", kind: "attendance" }, [seder("s1", "2026-03-05")], [])?.kind,
    ).toBe("seder");
  });
});

describe("advanced search tag", () => {
  const entries = [{ ...seder("s1", "2026-03-05"), tags: ["x"] }];
  const lessons = [lesson("l1", "2026-02-10")];
  it("a tag does not take part in a lessons-only search", () => {
    const r = runSearch(entries, lessons, { ...EMPTY_SEARCH, type: "learning", tag: "x" });
    expect(r.map((x) => x.key)).toEqual(["l-l1"]);
  });
  it("normalizes a saved filter that carries a tag with the lessons type", () => {
    expect(sanitizeSearchFilter({ type: "learning", tag: "x" }).tag).toBe("");
    expect(normalizeSearchFilter({ ...EMPTY_SEARCH, type: "all", tag: "x" }).tag).toBe("x");
  });
});
