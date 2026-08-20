// Aggregations over the entry lists: month slicing, summaries, the monthly
// closing line, the attendance score and the day streak.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  hhmmToMin,
  replaceAllData,
  getSederSnapshot,
  entriesInMonth,
  entriesByDate,
  allTags,
  summarizeEntries,
  monthlySummary,
  monthClosing,
  attendanceScore,
  currentDayStreak,
  type SederEntry,
  type LearningEntry,
} from "./kollel-store";
import { DEFAULT_SETTINGS, resetSettings, updateSettings } from "./settings-store";
import { hebrewFromGregorian, hebrewMonthName } from "./hebrew-calendar";

const { s1Start, s1End, s2Start, s2End, bonusThresholdMin } = DEFAULT_SETTINGS.seder;
const s1StartMin = hhmmToMin(s1Start)!;
const s1EndMin = hhmmToMin(s1End)!;
const s1LengthMin = s1EndMin - s1StartMin;

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function entry(overrides: Partial<SederEntry> = {}): SederEntry {
  return {
    id: "t1",
    date: "2026-07-08",
    seder: 1,
    absent: false,
    ohevei: false,
    excusedAll: false,
    excusedMinutes: 0,
    manualAdjustMin: 0,
    tags: [],
    ...overrides,
  };
}

function lesson(overrides: Partial<LearningEntry> = {}): LearningEntry {
  return {
    id: "l1",
    framework: "kollel-erev",
    date: "2026-07-08",
    minutes: 60,
    source: "manual",
    ...overrides,
  };
}

/** A seder with nothing missing — the building block for streak/score fixtures. */
const perfect = (date: string, seder: 1 | 2 = 1, extra: Partial<SederEntry> = {}) =>
  entry({
    id: `${date}-${seder}`,
    date,
    seder,
    arrival: seder === 1 ? s1Start : s2Start,
    departure: seder === 1 ? s1End : s2End,
    ...extra,
  });

const late = (date: string, minutes: number, extra: Partial<SederEntry> = {}) =>
  entry({
    id: `${date}-late`,
    date,
    arrival: hhmm(s1StartMin + minutes),
    departure: s1End,
    ...extra,
  });

beforeEach(() => {
  resetSettings();
  replaceAllData([], []);
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// Slicing
// ============================================================================

describe("entriesInMonth", () => {
  const list = [
    entry({ id: "jul1", date: "2026-07-01" }),
    entry({ id: "jul31", date: "2026-07-31" }),
    entry({ id: "jun30", date: "2026-06-30" }),
    entry({ id: "aug1", date: "2026-08-01" }),
    entry({ id: "prevYear", date: "2025-07-15" }),
  ];

  it("keeps only the entries of the given month", () => {
    expect(entriesInMonth(list, 2026, 6).map((e) => e.id)).toEqual(["jul1", "jul31"]);
  });

  it("does not leak in adjacent months or the same month of another year", () => {
    const ids = entriesInMonth(list, 2026, 6).map((e) => e.id);
    expect(ids).not.toContain("jun30");
    expect(ids).not.toContain("aug1");
    expect(ids).not.toContain("prevYear");
  });

  it("zero-pads the month, so January is 01 and not 1", () => {
    const mixed = [
      entry({ id: "jan", date: "2026-01-05" }),
      entry({ id: "nov", date: "2026-11-05" }),
    ];
    expect(entriesInMonth(mixed, 2026, 0).map((e) => e.id)).toEqual(["jan"]);
    expect(entriesInMonth(mixed, 2026, 10).map((e) => e.id)).toEqual(["nov"]);
  });

  it("returns an empty array for a month with nothing in it", () => {
    expect(entriesInMonth(list, 2026, 1)).toEqual([]);
    expect(entriesInMonth([], 2026, 6)).toEqual([]);
  });

  it("covers all twelve months without overlap", () => {
    const all = Array.from({ length: 12 }, (_, m) =>
      entry({ id: `m${m}`, date: `2026-${String(m + 1).padStart(2, "0")}-15` }),
    );
    for (let m = 0; m < 12; m++) {
      expect(entriesInMonth(all, 2026, m).map((e) => e.id)).toEqual([`m${m}`]);
    }
  });
});

describe("entriesByDate", () => {
  it("groups entries under their date", () => {
    const grouped = entriesByDate([
      entry({ id: "a", date: "2026-07-08", seder: 1 }),
      entry({ id: "b", date: "2026-07-08", seder: 2 }),
      entry({ id: "c", date: "2026-07-07" }),
    ]);
    expect(Object.keys(grouped).sort()).toEqual(["2026-07-07", "2026-07-08"]);
    expect(grouped["2026-07-08"].map((e) => e.id)).toEqual(["a", "b"]);
    expect(grouped["2026-07-07"].map((e) => e.id)).toEqual(["c"]);
  });

  it("returns an empty object for an empty list", () => {
    expect(entriesByDate([])).toEqual({});
  });

  it("has no key for a date with no records", () => {
    expect(entriesByDate([entry({ date: "2026-07-08" })])["2026-07-09"]).toBeUndefined();
  });
});

describe("allTags", () => {
  it("collects every tag in use, de-duplicated and sorted", () => {
    replaceAllData(
      [
        entry({ id: "a", date: "2026-07-08", tags: ["רופא", "אבל"] }),
        entry({ id: "b", date: "2026-07-07", tags: ["אבל", "שמחה"] }),
      ],
      [],
    );
    expect(allTags()).toEqual(["אבל", "רופא", "שמחה"]);
  });

  it("is empty with no records", () => {
    expect(allTags()).toEqual([]);
  });

  it("tolerates an entry with no tags array at all", () => {
    replaceAllData([{ ...entry({ id: "a" }), tags: undefined as unknown as string[] }], []);
    expect(allTags()).toEqual([]);
  });
});

// ============================================================================
// summarizeEntries / monthlySummary
// ============================================================================

describe("summarizeEntries", () => {
  const ZERO = {
    totalMissing: 0,
    excused: 0,
    nonExcused: 0,
    bonus: 0,
    lateCount: 0,
    absenceCount: 0,
    earlyDepCount: 0,
    oheveiCount: 0,
    entries: 0,
    netMissing: 0,
  };

  it("returns all zeros for an empty list", () => {
    expect(summarizeEntries([])).toEqual(ZERO);
  });

  it("adds up minutes and counts across the list", () => {
    const s = summarizeEntries([
      late("2026-07-01", 30),
      entry({ id: "abs", date: "2026-07-02", absent: true, excusedAll: true }),
      entry({ id: "early", date: "2026-07-03", arrival: s1Start, departure: hhmm(s1EndMin - 20) }),
      entry({
        id: "ohevei",
        date: "2026-07-06",
        ohevei: true,
        arrival: hhmm(s1StartMin - bonusThresholdMin),
        departure: s1End,
      }),
    ]);
    expect(s.entries).toBe(4);
    expect(s.totalMissing).toBe(30 + s1LengthMin + 20);
    expect(s.excused).toBe(s1LengthMin);
    expect(s.nonExcused).toBe(50);
    expect(s.bonus).toBe(bonusThresholdMin);
    expect(s.lateCount).toBe(1);
    expect(s.absenceCount).toBe(1);
    expect(s.earlyDepCount).toBe(1);
    expect(s.oheveiCount).toBe(1);
    expect(s.netMissing).toBe(50);
  });

  it("counts an absence as an absence even when it is excused", () => {
    const s = summarizeEntries([entry({ absent: true, excusedAll: true })]);
    expect(s.absenceCount).toBe(1);
    expect(s.netMissing).toBe(0);
  });

  it("counts one entry as late and early when it is both", () => {
    const s = summarizeEntries([
      entry({ arrival: hhmm(s1StartMin + 10), departure: hhmm(s1EndMin - 10) }),
    ]);
    expect(s.lateCount).toBe(1);
    expect(s.earlyDepCount).toBe(1);
    expect(s.entries).toBe(1);
  });

  it("keeps excused + nonExcused equal to totalMissing", () => {
    const s = summarizeEntries([
      entry({ id: "a", absent: true, excusedMinutes: 40 }),
      late("2026-07-02", 25),
      entry({ id: "c", absent: true, excusedAll: true }),
    ]);
    expect(s.excused + s.nonExcused).toBe(s.totalMissing);
  });

  it("does not filter by date — that is the caller's job", () => {
    const s = summarizeEntries([
      entry({ id: "a", date: "2026-07-08", absent: true }),
      entry({ id: "b", date: "2019-01-01", absent: true }),
    ]);
    expect(s.entries).toBe(2);
  });
});

describe("monthlySummary", () => {
  it("returns all zeros for a month with no records", () => {
    expect(monthlySummary(2026, 6).entries).toBe(0);
    expect(monthlySummary(2026, 6).netMissing).toBe(0);
  });

  it("summarizes only the requested month of the live store", () => {
    replaceAllData(
      [
        entry({ id: "in", date: "2026-07-08", absent: true }),
        entry({ id: "out", date: "2026-06-08", absent: true }),
      ],
      [],
    );
    expect(monthlySummary(2026, 6).entries).toBe(1);
    expect(monthlySummary(2026, 5).entries).toBe(1);
    expect(monthlySummary(2026, 4).entries).toBe(0);
  });

  it("matches summarizeEntries over the same slice", () => {
    replaceAllData(
      [
        late("2026-07-01", 30),
        perfect("2026-07-02"),
        entry({ id: "x", date: "2026-07-03", absent: true }),
      ],
      [],
    );
    const sliced = summarizeEntries(entriesInMonth(getSederSnapshot(), 2026, 6));
    expect(monthlySummary(2026, 6)).toEqual(sliced);
  });
});

// ============================================================================
// monthClosing
// ============================================================================

describe("monthClosing", () => {
  it("sums the month's seder minutes and counts events", () => {
    const c = monthClosing(
      "2026-07",
      [
        late("2026-07-06", 30),
        entry({ id: "b", date: "2026-07-07", absent: true, excusedAll: true }),
        entry({ id: "c", date: "2026-07-08", ohevei: true, arrival: s1Start, departure: s1End }),
      ],
      [],
    );
    expect(c.seder.entries).toBe(3);
    expect(c.seder.totalMissing).toBe(30 + s1LengthMin);
    expect(c.seder.excused).toBe(s1LengthMin);
    expect(c.seder.nonExcused).toBe(30);
    expect(c.seder.lateCount).toBe(1);
    expect(c.seder.absenceCount).toBe(1);
    expect(c.seder.oheveiCount).toBe(1);
  });

  it("ignores entries and lessons from other months", () => {
    const c = monthClosing(
      "2026-07",
      [
        entry({ id: "a", date: "2026-07-06", absent: true }),
        entry({ id: "b", date: "2026-08-06", absent: true }),
      ],
      [
        lesson({ id: "l1", date: "2026-07-06", minutes: 45 }),
        lesson({ id: "l2", date: "2026-08-06", minutes: 90 }),
      ],
    );
    expect(c.seder.entries).toBe(1);
    expect(c.learning.kollelErev).toBe(45);
  });

  it("splits learning minutes per framework and doubles תענית דיבור", () => {
    const c = monthClosing(
      "2026-07",
      [],
      [
        lesson({ id: "l1", framework: "kollel-erev", minutes: 60 }),
        lesson({ id: "l2", framework: "kollel-erev", minutes: 30, tanitDibur: true }),
        lesson({ id: "l3", framework: "torato-beyado", minutes: 90 }),
        lesson({ id: "l4", framework: "bein-hazmanim", minutes: 20 }),
      ],
    );
    expect(c.learning.kollelErev).toBe(60 + 60);
    expect(c.learning.kollelErevRaw).toBe(90);
    expect(c.learning.toratoBeyado).toBe(90);
    expect(c.learning.beinHazmanim).toBe(20);
  });

  it("keeps kollelErevRaw at the un-doubled figure", () => {
    const c = monthClosing("2026-07", [], [lesson({ minutes: 45, tanitDibur: true })]);
    expect(c.learning.kollelErevRaw).toBe(45);
    expect(c.learning.kollelErev).toBe(90);
  });

  it("reports zeros for a month with nothing in it", () => {
    const c = monthClosing("2026-07", [], []);
    expect(c.seder.entries).toBe(0);
    expect(c.learning).toEqual({
      kollelErev: 0,
      kollelErevRaw: 0,
      toratoBeyado: 0,
      beinHazmanim: 0,
    });
  });

  it("echoes back the month key it was asked about", () => {
    expect(monthClosing("2026-07", [], []).monthKey).toBe("2026-07");
  });

  describe("closed", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 15, 12, 0)); // 15 July 2026
    });

    it("is false for the month in progress", () => {
      expect(monthClosing("2026-07", [], []).closed).toBe(false);
    });

    it("is true for a month already past", () => {
      expect(monthClosing("2026-06", [], []).closed).toBe(true);
      expect(monthClosing("2020-01", [], []).closed).toBe(true);
    });

    it("is false for a month still ahead", () => {
      expect(monthClosing("2026-08", [], []).closed).toBe(false);
      expect(monthClosing("2027-01", [], []).closed).toBe(false);
    });

    it("only flips once the last day of the month has passed", () => {
      vi.setSystemTime(new Date(2026, 6, 31, 23, 0)); // still 31 July
      expect(monthClosing("2026-07", [], []).closed).toBe(false);
      vi.setSystemTime(new Date(2026, 7, 1, 0, 30)); // 1 August
      expect(monthClosing("2026-07", [], []).closed).toBe(true);
    });
  });

  describe("labels", () => {
    it("names the Gregorian month in Hebrew", () => {
      expect(monthClosing("2026-07", [], []).gregorianLabel).toBe("יולי 2026");
      expect(monthClosing("2026-01", [], []).gregorianLabel).toBe("ינואר 2026");
      expect(monthClosing("2026-12", [], []).gregorianLabel).toBe("דצמבר 2026");
    });

    it("spans the two Hebrew months a Gregorian month straddles", () => {
      expect(monthClosing("2026-07", [], []).hebrewLabel).toBe("תמוז–אב תשפ״ו");
    });

    it("spells out both years when the span crosses Rosh Hashana", () => {
      expect(monthClosing("2026-09", [], []).hebrewLabel).toBe("אלול תשפ״ו–תשרי תשפ״ז");
    });

    it("uses a single month name when the Gregorian month sits inside one Hebrew month", () => {
      // Rare, and only possible for February. Find a real instance rather than
      // assuming one exists in any particular year.
      let found: string | null = null;
      for (let y = 2020; y <= 2060 && !found; y++) {
        const first = hebrewFromGregorian(new Date(y, 1, 1));
        const last = hebrewFromGregorian(new Date(y, 2, 0));
        if (first.month === last.month && first.year === last.year) {
          found = monthClosing(`${y}-02`, [], []).hebrewLabel;
          expect(found).not.toContain("–");
          expect(found).toContain(hebrewMonthName(first.month, first.year));
        }
      }
      expect(found, "no February fits inside one Hebrew month between 2020 and 2060").not.toBe(
        null,
      );
    });

    it("always produces a non-empty label for every month of a decade", () => {
      for (let y = 2024; y <= 2034; y++) {
        for (let m = 1; m <= 12; m++) {
          const c = monthClosing(`${y}-${String(m).padStart(2, "0")}`, [], []);
          expect(c.gregorianLabel.length).toBeGreaterThan(4);
          expect(c.hebrewLabel.length).toBeGreaterThan(2);
          expect(c.gregorianLabel).not.toContain("undefined");
          expect(c.hebrewLabel).not.toContain("undefined");
        }
      }
    });
  });
});

// ============================================================================
// attendanceScore
// ============================================================================

describe("attendanceScore", () => {
  it("is 0 for a month with no records", () => {
    expect(attendanceScore(2026, 6)).toBe(0);
  });

  it("is 100 for a month of flawless attendance", () => {
    replaceAllData([perfect("2026-07-01"), perfect("2026-07-02"), perfect("2026-07-03")], []);
    expect(attendanceScore(2026, 6)).toBe(100);
  });

  it("is 0 for a month of unexcused absences", () => {
    replaceAllData(
      [
        entry({ id: "a", date: "2026-07-01", absent: true }),
        entry({ id: "b", date: "2026-07-02", absent: true }),
      ],
      [],
    );
    expect(attendanceScore(2026, 6)).toBe(0);
  });

  it("is 100 when every absence is excused", () => {
    replaceAllData(
      [
        entry({ id: "a", date: "2026-07-01", absent: true, excusedAll: true }),
        entry({ id: "b", date: "2026-07-02", absent: true, excusedAll: true }),
      ],
      [],
    );
    expect(attendanceScore(2026, 6)).toBe(100);
  });

  it("falls as more minutes go missing", () => {
    const scoreFor = (lateMin: number) => {
      replaceAllData(
        [late("2026-07-01", lateMin), perfect("2026-07-02"), perfect("2026-07-03")],
        [],
      );
      return attendanceScore(2026, 6);
    };
    const scores = [10, 30, 60, 120].map(scoreFor);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThan(scores[i - 1]);
  });

  it("penalises repeated lateness beyond the missing minutes themselves", () => {
    replaceAllData(
      [late("2026-07-01", 60), perfect("2026-07-02"), perfect("2026-07-03"), perfect("2026-07-06")],
      [],
    );
    const oneBigLate = attendanceScore(2026, 6);

    replaceAllData(
      [
        late("2026-07-01", 20),
        late("2026-07-02", 20),
        late("2026-07-03", 20),
        perfect("2026-07-06"),
      ],
      [],
    );
    expect(attendanceScore(2026, 6)).toBeLessThan(oneBigLate);
  });

  it("caps the lateness penalty, so a further late arrival costs nothing extra", () => {
    const oneMinuteLateOn = (days: number) =>
      Array.from({ length: days }, (_, i) => late(`2026-07-${String(i + 1).padStart(2, "0")}`, 1));

    replaceAllData(oneMinuteLateOn(10), []);
    const ten = attendanceScore(2026, 6);
    replaceAllData(oneMinuteLateOn(20), []);
    const twenty = attendanceScore(2026, 6);

    // Both are past the 5-point penalty cap, and each entry loses the same
    // fraction of its own seder, so the score stops sliding.
    expect(twenty).toBe(ten);
  });

  it("lets early arrivals lift a dented score", () => {
    replaceAllData(
      [
        entry({ id: "a", date: "2026-07-01", absent: true }),
        perfect("2026-07-02"),
        perfect("2026-07-03"),
      ],
      [],
    );
    const withoutBonus = attendanceScore(2026, 6);

    replaceAllData(
      [
        entry({ id: "a", date: "2026-07-01", absent: true }),
        perfect("2026-07-02", 1, { arrival: hhmm(s1StartMin - bonusThresholdMin) }),
        perfect("2026-07-03", 1, { arrival: hhmm(s1StartMin - bonusThresholdMin) }),
      ],
      [],
    );
    expect(attendanceScore(2026, 6)).toBeGreaterThan(withoutBonus);
  });

  it("stays inside 0–100 whatever the data", () => {
    replaceAllData(
      [
        entry({ id: "a", date: "2026-07-01", absent: true, manualAdjustMin: 1400 }),
        late("2026-07-02", 1),
        late("2026-07-03", 1),
        late("2026-07-06", 1),
      ],
      [],
    );
    const score = attendanceScore(2026, 6);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns a whole number", () => {
    replaceAllData([late("2026-07-01", 7), perfect("2026-07-02")], []);
    expect(Number.isInteger(attendanceScore(2026, 6))).toBe(true);
  });

  it("is 0 when the month's entries have no expected minutes at all", () => {
    updateSettings({
      sederOverrides: [
        {
          id: "o",
          from: "2026-07-01",
          to: "2026-07-31",
          times: { s1Start: "09:00", s1End: "09:00", s2Start: "09:00", s2End: "09:00" },
        },
      ],
    });
    replaceAllData([perfect("2026-07-01"), perfect("2026-07-02")], []);
    expect(attendanceScore(2026, 6)).toBe(0);
  });

  it("looks only at the month it was asked about", () => {
    replaceAllData(
      [perfect("2026-07-01"), entry({ id: "junk", date: "2026-06-01", absent: true })],
      [],
    );
    expect(attendanceScore(2026, 6)).toBe(100);
    expect(attendanceScore(2026, 5)).toBe(0);
  });
});

// ============================================================================
// currentDayStreak
// ============================================================================

describe("currentDayStreak", () => {
  // 2026-07-08 is a Wednesday. Walking back: Tue 07, Mon 06, Sun 05,
  // Sat 04 + Fri 03 are weekend (skipped, and do not break the streak),
  // Thu 02, Wed 01.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 20, 0));
  });

  it("is 0 with no records at all", () => {
    expect(currentDayStreak()).toBe(0);
  });

  it("counts consecutive fully-attended days", () => {
    replaceAllData([perfect("2026-07-08"), perfect("2026-07-07"), perfect("2026-07-06")], []);
    expect(currentDayStreak()).toBe(3);
  });

  it("steps over the weekend without breaking the streak", () => {
    replaceAllData(
      [
        perfect("2026-07-08"),
        perfect("2026-07-07"),
        perfect("2026-07-06"),
        perfect("2026-07-05"),
        // Fri 03 + Sat 04 have no records, and must not count against us.
        perfect("2026-07-02"),
        perfect("2026-07-01"),
      ],
      [],
    );
    expect(currentDayStreak()).toBe(6);
  });

  it("tolerates today having no record yet", () => {
    replaceAllData([perfect("2026-07-07"), perfect("2026-07-06")], []);
    expect(currentDayStreak()).toBe(2);
  });

  it("stops at the first learning day with no record", () => {
    replaceAllData([perfect("2026-07-08"), perfect("2026-07-07")], []); // Mon 06 missing
    expect(currentDayStreak()).toBe(2);
  });

  it("stops at an absence", () => {
    replaceAllData(
      [
        perfect("2026-07-08"),
        entry({ id: "abs", date: "2026-07-07", absent: true }),
        perfect("2026-07-06"),
      ],
      [],
    );
    expect(currentDayStreak()).toBe(1);
  });

  it("stops at a day with missing minutes left over", () => {
    replaceAllData([perfect("2026-07-08"), late("2026-07-07", 15), perfect("2026-07-06")], []);
    expect(currentDayStreak()).toBe(1);
  });

  it("counts a day where at least one of its sedarim was complete", () => {
    replaceAllData(
      [
        perfect("2026-07-08", 1),
        entry({ id: "bad2", date: "2026-07-08", seder: 2, absent: true }),
        perfect("2026-07-07"),
      ],
      [],
    );
    expect(currentDayStreak()).toBe(2);
  });

  it("does not count an excused absence as attendance", () => {
    replaceAllData(
      [
        entry({ id: "exc", date: "2026-07-08", absent: true, excusedAll: true }),
        perfect("2026-07-07"),
      ],
      [],
    );
    // The day counts only if someone actually turned up: `!e.absent` gates it,
    // whether or not the absence was excused.
    expect(currentDayStreak()).toBe(0);
  });

  it("treats a recorded absence today more harshly than no record at all", () => {
    // No record yet today is forgiven (the day is not over); a recorded
    // absence is not.
    replaceAllData([perfect("2026-07-07"), perfect("2026-07-06")], []);
    expect(currentDayStreak()).toBe(2);

    replaceAllData(
      [
        entry({ id: "abs", date: "2026-07-08", absent: true }),
        perfect("2026-07-07"),
        perfect("2026-07-06"),
      ],
      [],
    );
    expect(currentDayStreak()).toBe(0);
  });

  it("counts a late arrival cancelled out by a manual adjustment", () => {
    replaceAllData([late("2026-07-08", 15, { manualAdjustMin: -15 }), perfect("2026-07-07")], []);
    expect(currentDayStreak()).toBe(2);
  });

  it("is 0 when the most recent learning day was missed", () => {
    // Tue 07 is a learning day with no record, so the streak is already broken.
    replaceAllData([perfect("2026-07-06"), perfect("2026-07-05")], []);
    expect(currentDayStreak()).toBe(0);
  });

  it("skips Yom Tov the same way it skips the weekend", () => {
    // Mon 2026-09-21 is Yom Kippur and Sun 2026-09-20 is its erev; both are
    // stepped over rather than breaking the streak.
    vi.setSystemTime(new Date(2026, 8, 23, 20, 0)); // Wed 23 Sept 2026
    replaceAllData(
      [
        perfect("2026-09-23"),
        perfect("2026-09-22"),
        // 21st + 20th: Yom Kippur and its erev, no records.
        perfect("2026-09-17"), // Thu — 18th/19th are Fri/Sat
      ],
      [],
    );
    expect(currentDayStreak()).toBe(3);
  });

  it("does not run away past a year of history", () => {
    const entries: SederEntry[] = [];
    const cursor = new Date(2026, 6, 8);
    for (let i = 0; i < 500; i++) {
      const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      entries.push(perfect(date));
      cursor.setDate(cursor.getDate() - 1);
    }
    replaceAllData(entries, []);
    const streak = currentDayStreak();
    // The loop only looks back 366 calendar days, and weekends inside that
    // window are skipped rather than counted.
    expect(streak).toBeGreaterThan(200);
    expect(streak).toBeLessThanOrEqual(366);
  });
});
