import { describe, it, expect } from "vitest";
import { isWeekend, isYomTov, isErevYomTov, isLearningDay } from "./hebrew-calendar";

describe("isWeekend", () => {
  it("treats Friday and Saturday as weekend", () => {
    // 2026-07-10 is a Friday, 2026-07-11 is a Saturday (per Gregorian calendar).
    expect(isWeekend(new Date(2026, 6, 10))).toBe(true);
    expect(isWeekend(new Date(2026, 6, 11))).toBe(true);
  });

  it("does not treat Sunday–Thursday as weekend", () => {
    // 2026-07-06 (Mon) through 2026-07-09 (Thu), plus Sunday 2026-07-05.
    for (const day of [5, 6, 7, 8, 9]) {
      expect(isWeekend(new Date(2026, 6, day))).toBe(false);
    }
  });
});

describe("isYomTov / isErevYomTov", () => {
  // Dates below were derived by running hebrewFromGregorian() forward from
  // 2026-01-01 to find the real Gregorian date of Tishrei 9/10, rather than
  // assumed — Yom Kippur 5787 falls on 2026-09-22 (Erev: 2026-09-21).
  it("recognizes Yom Kippur", () => {
    expect(isYomTov(new Date(2026, 8, 22))).toBe(true);
  });

  it("recognizes Erev Yom Kippur the day before", () => {
    expect(isErevYomTov(new Date(2026, 8, 21))).toBe(true);
    expect(isYomTov(new Date(2026, 8, 21))).toBe(false);
  });

  it("does not flag an ordinary midweek day as Yom Tov", () => {
    expect(isYomTov(new Date(2026, 6, 8))).toBe(false);
    expect(isErevYomTov(new Date(2026, 6, 8))).toBe(false);
  });
});

describe("isLearningDay", () => {
  it("is false on weekends", () => {
    expect(isLearningDay(new Date(2026, 6, 11))).toBe(false); // Saturday
  });

  it("is false on Yom Tov and Erev Yom Tov", () => {
    expect(isLearningDay(new Date(2026, 8, 22))).toBe(false); // Yom Kippur
    expect(isLearningDay(new Date(2026, 8, 21))).toBe(false); // Erev Yom Kippur
  });

  it("is true on an ordinary weekday", () => {
    expect(isLearningDay(new Date(2026, 6, 8))).toBe(true); // Wednesday, no holiday
  });
});
