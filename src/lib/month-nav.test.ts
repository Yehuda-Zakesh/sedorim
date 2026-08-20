import { describe, it, expect, afterEach, vi } from "vitest";
import { currentMonthKey, shiftMonth, monthKeyLabel, monthsWithData } from "./month-nav";

afterEach(() => { vi.useRealTimers(); });

function pinTo(y: number, monthIdx: number, day = 15) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(y, monthIdx, day, 12, 0));
}

describe("currentMonthKey", () => {
  it("pads the month", () => {
    expect(currentMonthKey(new Date(2026, 0, 5))).toBe("2026-01");
    expect(currentMonthKey(new Date(2026, 10, 30))).toBe("2026-11");
  });
});

describe("shiftMonth", () => {
  it("steps back and forward inside a year", () => {
    expect(shiftMonth("2026-08", -1)).toBe("2026-07");
    expect(shiftMonth("2026-08", 1)).toBe("2026-09");
  });

  it("crosses the year boundary in both directions", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("steps more than one month", () => {
    expect(shiftMonth("2026-03", -5)).toBe("2025-10");
    expect(shiftMonth("2026-03", 12)).toBe("2027-03");
  });

  it("returns the same month for a shift of nothing", () => {
    expect(shiftMonth("2026-08", 0)).toBe("2026-08");
  });
});

describe("monthKeyLabel", () => {
  it("names the month in Hebrew", () => {
    expect(monthKeyLabel("2026-08")).toBe("אוגוסט 2026");
    expect(monthKeyLabel("2026-01")).toBe("ינואר 2026");
    expect(monthKeyLabel("2026-12")).toBe("דצמבר 2026");
  });

  it("passes an unrecognisable key through untouched", () => {
    expect(monthKeyLabel("2026-13")).toBe("2026-13");
    expect(monthKeyLabel("nonsense")).toBe("nonsense");
  });
});

describe("monthsWithData", () => {
  it("always offers the current month, even with nothing in it", () => {
    pinTo(2026, 7);
    expect(monthsWithData([])).toEqual(["2026-08"]);
  });

  it("lists newest first", () => {
    pinTo(2026, 7);
    const out = monthsWithData([{ date: "2026-06-10" }, { date: "2026-07-01" }, { date: "2025-12-31" }]);
    expect(out).toEqual(["2026-08", "2026-07", "2026-06", "2025-12"]);
  });

  it("merges several lists and de-duplicates", () => {
    pinTo(2026, 7);
    const out = monthsWithData(
      [{ date: "2026-07-01" }, { date: "2026-07-20" }],
      [{ date: "2026-07-05" }, { date: "2026-05-02" }],
    );
    expect(out).toEqual(["2026-08", "2026-07", "2026-05"]);
  });

  it("includes a month that only has lessons in it", () => {
    pinTo(2026, 7);
    expect(monthsWithData([], [{ date: "2026-02-14" }])).toContain("2026-02");
  });

  it("ignores rubbish dates rather than listing them", () => {
    pinTo(2026, 7);
    const out = monthsWithData([{ date: "" }, { date: "2026" }, { date: "2026-04-01" }]);
    expect(out).toEqual(["2026-08", "2026-04"]);
  });
});
