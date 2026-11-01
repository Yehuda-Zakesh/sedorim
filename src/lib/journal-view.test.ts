import { describe, expect, it } from "vitest";
import {
  activeFilterChips,
  calendarDay,
  DEFAULT_VIEW,
  formatDayDate,
  incompleteCount,
  notableStatusWords,
} from "./journal";
import { calcSeder, type SederEntry } from "./kollel-store";

const e = (id: string, over: Partial<SederEntry> = {}): SederEntry => ({
  id,
  date: "2026-10-27",
  seder: 1,
  absent: false,
  ohevei: false,
  excusedAll: false,
  excusedMinutes: 0,
  manualAdjustMin: 0,
  tags: [],
  ...over,
});

describe("calendarDay", () => {
  const byDate = { "2026-10-27": [e("a")] };
  const lessons = { "2026-10-27": [{ id: "l1" }], "2026-10-28": [{ id: "l2" }] };

  it("opens the attendance record when both kinds are shown and only it exists", () => {
    const d = calendarDay("2026-10-28", {}, lessons, { attendance: true, learning: true });
    expect(d.target).toEqual({ kind: "learning", id: "l2" });
  });
  it("does not open a record the kind filter hides", () => {
    const d = calendarDay("2026-10-27", byDate, {}, { attendance: false, learning: true });
    expect(d.seder).toEqual([]);
    expect(d.target).toBeNull();
    expect(d.hiddenSeder).toBe(1);
  });
  it("lists and opens from the same filtered set", () => {
    const d = calendarDay("2026-10-27", byDate, lessons, { attendance: false, learning: true });
    expect(d.lessons).toHaveLength(1);
    expect(d.hiddenSeder).toBe(1);
    expect(d.target).toEqual({ kind: "learning", id: "l1" });
  });
  it("opens nothing when a day has several visible records", () => {
    const d = calendarDay("2026-10-27", byDate, lessons, { attendance: true, learning: true });
    expect(d.target).toBeNull();
  });
});

describe("formatDayDate", () => {
  it("writes day.month.year and leaves anything else alone", () => {
    expect(formatDayDate("2026-10-27")).toBe("27.10.2026");
    expect(formatDayDate("nope")).toBe("nope");
  });
});

describe("quiet rows and the fix filter", () => {
  it("counts only records without hours, never absences", () => {
    const list = [
      e("a", { arrival: "09:00", departure: "12:00" }),
      e("b"),
      e("c", { absent: true }),
      e("d", { departure: "12:00" }),
    ];
    expect(incompleteCount(list)).toBe(2);
  });
  it("drops 'full attendance' but keeps problems", () => {
    const ok = e("a", { arrival: "00:00", departure: "23:59" });
    expect(notableStatusWords(ok, calcSeder(ok))).not.toContain("נוכח במלואו");
    const none = e("b");
    expect(notableStatusWords(none, calcSeder(none))).toContain("חסר פירוט שעות");
  });
  it("shows only the active tab's filters as chips", () => {
    expect(activeFilterChips(DEFAULT_VIEW)).toEqual([]);
    const chips = activeFilterChips({ ...DEFAULT_VIEW, type: "incomplete", seder: "2" });
    expect(chips.map((c) => c.key)).toEqual(["seder", "type"]);
    expect(activeFilterChips({ ...DEFAULT_VIEW, tab: "learning", type: "late" })).toEqual([]);
  });
});
