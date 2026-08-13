// calcSeder, the time helpers and the record validators.
// Aggregations live in kollel-store.aggregate.test.ts, the timer in
// kollel-store.timer.test.ts — split up because the module keeps its entry
// lists in module scope, and vitest gives each test file its own copy.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  calcSeder,
  hhmmToMin,
  minToHHMM,
  todayISO,
  newId,
  effectiveLearningMin,
  replaceAllData,
  getSederSnapshot,
  getLearningSnapshot,
  FRAMEWORK_LABELS,
  ValidationError,
  type SederEntry,
  type LearningEntry,
  type LearningFramework,
} from "./kollel-store";
import { DEFAULT_SETTINGS, resetSettings, updateSettings } from "./settings-store";

const { s1Start, s1End, s2Start, s2End, bonusThresholdMin } = DEFAULT_SETTINGS.seder;
const s1StartMin = hhmmToMin(s1Start)!;
const s1EndMin = hhmmToMin(s1End)!;
const s1LengthMin = s1EndMin - s1StartMin;
const s2StartMin = hhmmToMin(s2Start)!;
const s2EndMin = hhmmToMin(s2End)!;
const s2LengthMin = s2EndMin - s2StartMin;

/** Written out longhand rather than via minToHHMM, so its own tests stay honest. */
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

beforeEach(() => {
  resetSettings();
  replaceAllData([], []);
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// Time helpers
// ============================================================================

describe("hhmmToMin", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(hhmmToMin("09:30")).toBe(570);
    expect(hhmmToMin("00:00")).toBe(0);
    expect(hhmmToMin("12:00")).toBe(720);
    expect(hhmmToMin("23:59")).toBe(1439);
  });

  it("accepts a single-digit hour", () => {
    expect(hhmmToMin("9:30")).toBe(570);
    expect(hhmmToMin("0:05")).toBe(5);
  });

  it("returns null for missing or empty input", () => {
    expect(hhmmToMin(undefined)).toBe(null);
    expect(hhmmToMin("")).toBe(null);
  });

  it("rejects an out-of-range hour or minute", () => {
    for (const bad of ["24:00", "25:30", "99:00", "12:60", "12:99"]) {
      expect(hhmmToMin(bad), bad).toBe(null);
    }
  });

  it("rejects anything that is not exactly HH:MM", () => {
    for (const bad of [
      "abc",
      "12",
      "12:",
      ":30",
      "12:5",
      "12:345",
      "1:2",
      "12.30",
      "12-30",
      "-1:00",
      " 12:30",
      "12:30 ",
      "12:30:00",
      "١٢:٣٠",
    ]) {
      expect(hhmmToMin(bad), bad).toBe(null);
    }
  });
});

describe("minToHHMM", () => {
  it("formats minutes since midnight as zero-padded HH:MM", () => {
    expect(minToHHMM(0)).toBe("00:00");
    expect(minToHHMM(5)).toBe("00:05");
    expect(minToHHMM(570)).toBe("09:30");
    expect(minToHHMM(1439)).toBe("23:59");
  });

  it("wraps past midnight rather than showing hour 24", () => {
    expect(minToHHMM(1440)).toBe("00:00");
    expect(minToHHMM(1500)).toBe("01:00");
  });

  it("round-trips with hhmmToMin across a whole day", () => {
    for (let min = 0; min < 1440; min++) {
      expect(hhmmToMin(minToHHMM(min)), String(min)).toBe(min);
    }
  });
});

describe("todayISO", () => {
  it("returns today's local date as YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 13, 45));
    expect(todayISO()).toBe("2026-07-08");
  });

  it("zero-pads single-digit months and days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 3, 9, 0));
    expect(todayISO()).toBe("2026-01-03");
  });

  it("uses local components, so a late-night entry is not filed a day early", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 23, 59));
    expect(todayISO()).toBe("2026-07-08");
    vi.setSystemTime(new Date(2026, 6, 8, 0, 1));
    expect(todayISO()).toBe("2026-07-08");
  });
});

describe("newId", () => {
  it("looks like a timestamp plus a random suffix", () => {
    expect(newId()).toMatch(/^\d+-[a-z0-9]{1,6}$/);
  });

  it("does not collide across a burst of calls", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newId()));
    expect(ids.size).toBe(2000);
  });
});

describe("effectiveLearningMin", () => {
  it("counts ordinary minutes once", () => {
    expect(effectiveLearningMin(lesson({ minutes: 90 }))).toBe(90);
    expect(effectiveLearningMin(lesson({ minutes: 90, tanitDibur: false }))).toBe(90);
  });

  it("counts תענית דיבור minutes twice", () => {
    expect(effectiveLearningMin(lesson({ minutes: 90, tanitDibur: true }))).toBe(180);
    expect(effectiveLearningMin(lesson({ minutes: 1, tanitDibur: true }))).toBe(2);
  });
});

describe("FRAMEWORK_LABELS", () => {
  it("labels every framework", () => {
    const frameworks: LearningFramework[] = ["kollel-erev", "torato-beyado", "bein-hazmanim"];
    expect(Object.keys(FRAMEWORK_LABELS).sort()).toEqual([...frameworks].sort());
    for (const f of frameworks) expect(FRAMEWORK_LABELS[f].length).toBeGreaterThan(0);
  });
});

describe("ValidationError", () => {
  it("is an Error carrying its own name", () => {
    const err = new ValidationError("תאריך לא תקין");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ValidationError");
    expect(err.message).toBe("תאריך לא תקין");
  });
});

// ============================================================================
// calcSeder
// ============================================================================

describe("calcSeder", () => {
  it("full attendance (on time, on time) has zero missing", () => {
    const c = calcSeder(entry({ arrival: s1Start, departure: s1End }));
    expect(c.sederLengthMin).toBe(s1LengthMin);
    expect(c.netMissingMin).toBe(0);
    expect(c.isLate).toBe(false);
    expect(c.isEarlyDeparture).toBe(false);
  });

  it("adds up lateness and an early departure together", () => {
    const c = calcSeder(entry({ arrival: hhmm(s1StartMin + 20), departure: hhmm(s1EndMin - 15) }));
    expect(c.missingMin).toBe(35);
    expect(c.isLate).toBe(true);
    expect(c.isEarlyDeparture).toBe(true);
  });

  it("counts a one-minute lateness", () => {
    const c = calcSeder(entry({ arrival: hhmm(s1StartMin + 1), departure: s1End }));
    expect(c.missingMin).toBe(1);
    expect(c.isLate).toBe(true);
  });

  it("does not call an exactly-on-time arrival late", () => {
    const c = calcSeder(entry({ arrival: s1Start, departure: s1End }));
    expect(c.isLate).toBe(false);
    expect(c.bonusMin).toBe(0);
  });

  it("does not call an exactly-on-time departure early", () => {
    expect(calcSeder(entry({ arrival: s1Start, departure: s1End })).isEarlyDeparture).toBe(false);
  });

  it("ignores staying past the end of the seder", () => {
    const c = calcSeder(entry({ arrival: s1Start, departure: hhmm(s1EndMin + 45) }));
    expect(c.missingMin).toBe(0);
    expect(c.isEarlyDeparture).toBe(false);
  });

  describe("bonus", () => {
    it("caps the bonus at bonusThresholdMin", () => {
      const c = calcSeder(entry({ arrival: hhmm(s1StartMin - 30), departure: s1End }));
      expect(c.bonusMin).toBe(bonusThresholdMin);
      expect(c.netMissingMin).toBe(0);
    });

    it("earns the exact minutes when arriving less early than the cap", () => {
      const early = Math.max(1, bonusThresholdMin - 5);
      const c = calcSeder(entry({ arrival: hhmm(s1StartMin - early), departure: s1End }));
      expect(c.bonusMin).toBe(early);
      expect(c.isLate).toBe(false);
    });

    it("offsets an early departure", () => {
      const c = calcSeder(
        entry({
          arrival: hhmm(s1StartMin - bonusThresholdMin),
          departure: hhmm(s1EndMin - bonusThresholdMin),
        }),
      );
      expect(c.missingMin).toBe(bonusThresholdMin);
      expect(c.bonusMin).toBe(bonusThresholdMin);
      expect(c.netMissingMin).toBe(0);
    });

    it("leaves the raw missing figure untouched", () => {
      const c = calcSeder(
        entry({
          arrival: hhmm(s1StartMin - bonusThresholdMin),
          departure: hhmm(s1EndMin - 60),
        }),
      );
      expect(c.missingMin).toBe(60);
      expect(c.netMissingMin).toBe(60 - bonusThresholdMin);
    });

    it("earns nothing for an absence, however early the recorded arrival", () => {
      expect(calcSeder(entry({ absent: true, arrival: hhmm(s1StartMin - 30) })).bonusMin).toBe(0);
    });

    it("follows a changed threshold in settings", () => {
      updateSettings({ seder: { ...DEFAULT_SETTINGS.seder, bonusThresholdMin: 40 } });
      const c = calcSeder(entry({ arrival: hhmm(s1StartMin - 60), departure: s1End }));
      expect(c.bonusMin).toBe(40);
    });
  });

  describe("absence", () => {
    it("counts the full seder length as missing", () => {
      const c = calcSeder(entry({ absent: true }));
      expect(c.missingMin).toBe(s1LengthMin);
      expect(c.netMissingMin).toBe(s1LengthMin);
    });

    it("does not set the late or early-departure flags", () => {
      const c = calcSeder(entry({ absent: true }));
      expect(c.isLate).toBe(false);
      expect(c.isEarlyDeparture).toBe(false);
    });

    it("ignores any clock times still on the record", () => {
      const c = calcSeder(entry({ absent: true, arrival: s1Start, departure: s1End }));
      expect(c.missingMin).toBe(s1LengthMin);
    });
  });

  describe("excused minutes", () => {
    it("excusedAll zeroes out non-excused missing minutes", () => {
      const c = calcSeder(entry({ absent: true, excusedAll: true }));
      expect(c.missingMin).toBe(s1LengthMin);
      expect(c.excusedMin).toBe(s1LengthMin);
      expect(c.nonExcusedMin).toBe(0);
      expect(c.netMissingMin).toBe(0);
    });

    it("partial excusedMinutes only offsets part of the missing time", () => {
      const c = calcSeder(entry({ absent: true, excusedMinutes: 20 }));
      expect(c.excusedMin).toBe(20);
      expect(c.nonExcusedMin).toBe(s1LengthMin - 20);
      expect(c.netMissingMin).toBe(s1LengthMin - 20);
    });

    it("never excuses more minutes than are actually missing", () => {
      const c = calcSeder(
        entry({ arrival: hhmm(s1StartMin + 10), departure: s1End, excusedMinutes: 500 }),
      );
      expect(c.missingMin).toBe(10);
      expect(c.excusedMin).toBe(10);
      expect(c.nonExcusedMin).toBe(0);
    });

    it("treats a negative excusedMinutes as zero", () => {
      const c = calcSeder(
        entry({ arrival: hhmm(s1StartMin + 10), departure: s1End, excusedMinutes: -30 }),
      );
      expect(c.excusedMin).toBe(0);
      expect(c.nonExcusedMin).toBe(10);
    });

    it("excuses nothing when nothing is missing", () => {
      const c = calcSeder(entry({ arrival: s1Start, departure: s1End, excusedAll: true }));
      expect(c.missingMin).toBe(0);
      expect(c.excusedMin).toBe(0);
      expect(c.netMissingMin).toBe(0);
    });

    it("keeps excused + nonExcused equal to the raw missing total", () => {
      for (const e of [
        entry({ absent: true, excusedMinutes: 30 }),
        entry({ absent: true, excusedAll: true }),
        entry({
          arrival: hhmm(s1StartMin + 25),
          departure: hhmm(s1EndMin - 10),
          excusedMinutes: 15,
        }),
        entry({ arrival: s1Start, departure: s1End }),
      ]) {
        const c = calcSeder(e);
        expect(c.excusedMin + c.nonExcusedMin).toBe(c.missingMin);
      }
    });
  });

  describe("manual adjustment", () => {
    it("can reduce net missing below the raw non-excused amount", () => {
      const c = calcSeder(
        entry({ arrival: hhmm(s1StartMin + 30), departure: s1End, manualAdjustMin: -30 }),
      );
      expect(c.missingMin).toBe(30);
      expect(c.netMissingMin).toBe(0);
    });

    it("can add missing minutes that no clock time explains", () => {
      const c = calcSeder(entry({ arrival: s1Start, departure: s1End, manualAdjustMin: 25 }));
      expect(c.missingMin).toBe(0);
      expect(c.netMissingMin).toBe(25);
    });

    it("never drives netMissingMin negative", () => {
      expect(
        calcSeder(entry({ arrival: s1Start, departure: s1End, manualAdjustMin: -50 }))
          .netMissingMin,
      ).toBe(0);
      expect(calcSeder(entry({ absent: true, manualAdjustMin: -9999 })).netMissingMin).toBe(0);
    });

    it("applies on top of the excused split, not instead of it", () => {
      const c = calcSeder(entry({ absent: true, excusedMinutes: 30, manualAdjustMin: 10 }));
      expect(c.excusedMin).toBe(30);
      expect(c.nonExcusedMin).toBe(s1LengthMin - 30);
      expect(c.netMissingMin).toBe(s1LengthMin - 30 + 10);
    });
  });

  describe("Seder ב׳", () => {
    it("uses the seder-2 hours", () => {
      const c = calcSeder(entry({ seder: 2, arrival: s2Start, departure: s2End }));
      expect(c.sederLengthMin).toBe(s2LengthMin);
      expect(c.netMissingMin).toBe(0);
    });

    it("scores an absence against the seder-2 length", () => {
      expect(calcSeder(entry({ seder: 2, absent: true })).missingMin).toBe(s2LengthMin);
    });

    it("does not accept seder-1 times as on-time for seder 2", () => {
      const c = calcSeder(entry({ seder: 2, arrival: s1Start, departure: s1End }));
      expect(c.netMissingMin).toBeGreaterThan(0);
    });
  });

  describe("missing clock times", () => {
    it("counts the whole seder as missing when neither time is recorded", () => {
      const c = calcSeder(entry());
      expect(c.missingMin).toBe(s1LengthMin);
      expect(c.isLate).toBe(false);
      expect(c.isEarlyDeparture).toBe(false);
    });

    it("assumes the full seder was attended when only an arrival is recorded", () => {
      const c = calcSeder(entry({ arrival: s1Start }));
      expect(c.missingMin).toBe(0);
      expect(c.isEarlyDeparture).toBe(false);
    });

    it("still counts lateness when only an arrival is recorded", () => {
      expect(calcSeder(entry({ arrival: hhmm(s1StartMin + 20) })).missingMin).toBe(20);
    });

    it("counts only the early departure when only a departure is recorded", () => {
      const c = calcSeder(entry({ departure: hhmm(s1EndMin - 40) }));
      expect(c.missingMin).toBe(40);
      expect(c.isEarlyDeparture).toBe(true);
      expect(c.isLate).toBe(false);
    });

    it("treats an unparseable arrival the same as a missing one", () => {
      expect(calcSeder(entry({ arrival: "not a time" })).missingMin).toBe(s1LengthMin);
      expect(calcSeder(entry({ arrival: "99:99" })).missingMin).toBe(s1LengthMin);
    });
  });

  describe("isOhevei", () => {
    it("requires the flag plus arriving on/before start and leaving on/after end", () => {
      expect(calcSeder(entry({ ohevei: true, arrival: s1Start, departure: s1End })).isOhevei).toBe(
        true,
      );
      expect(
        calcSeder(entry({ ohevei: true, arrival: hhmm(s1StartMin + 5), departure: s1End }))
          .isOhevei,
      ).toBe(false);
    });

    it("is false without the flag, however good the attendance", () => {
      const c = calcSeder(
        entry({ arrival: hhmm(s1StartMin - 30), departure: hhmm(s1EndMin + 30) }),
      );
      expect(c.isOhevei).toBe(false);
    });

    it("is false for an early departure, even by a minute", () => {
      expect(
        calcSeder(entry({ ohevei: true, arrival: s1Start, departure: hhmm(s1EndMin - 1) }))
          .isOhevei,
      ).toBe(false);
    });

    it("is false when absent, even with both times filled in", () => {
      const c = calcSeder(
        entry({ ohevei: true, absent: true, arrival: s1Start, departure: s1End }),
      );
      expect(c.isOhevei).toBe(false);
    });

    it("needs both times — one alone is not enough", () => {
      expect(calcSeder(entry({ ohevei: true, arrival: s1Start })).isOhevei).toBe(false);
      expect(calcSeder(entry({ ohevei: true, departure: s1End })).isOhevei).toBe(false);
      expect(calcSeder(entry({ ohevei: true })).isOhevei).toBe(false);
    });

    it("stays true when arriving early and leaving late", () => {
      const c = calcSeder(
        entry({
          ohevei: true,
          arrival: hhmm(s1StartMin - 20),
          departure: hhmm(s1EndMin + 20),
        }),
      );
      expect(c.isOhevei).toBe(true);
      expect(c.bonusMin).toBe(Math.min(bonusThresholdMin, 20));
    });
  });

  describe("date-aware seder hours", () => {
    it("scores an entry against the hours in force on its own date", () => {
      updateSettings({
        sederSchedule: [
          {
            id: "a",
            effectiveFrom: "0001-01-01",
            times: { s1Start: "09:00", s1End: "13:00", s2Start, s2End },
          },
          {
            id: "b",
            effectiveFrom: "2026-07-01",
            times: { s1Start: "10:00", s1End: "13:00", s2Start, s2End },
          },
        ],
      });
      // Before the change the seder began at 09:00, so 10:00 is an hour late.
      expect(
        calcSeder(entry({ date: "2026-06-30", arrival: "10:00", departure: "13:00" })).missingMin,
      ).toBe(60);
      // From the change onwards 10:00 *is* the start.
      expect(
        calcSeder(entry({ date: "2026-07-01", arrival: "10:00", departure: "13:00" })).missingMin,
      ).toBe(0);
    });

    it("honours a temporary override only for the dates it covers", () => {
      updateSettings({
        sederOverrides: [
          {
            id: "o",
            from: "2026-07-06",
            to: "2026-07-10",
            label: "בין הזמנים",
            times: { s1Start: "10:00", s1End: "12:00", s2Start, s2End },
          },
        ],
      });
      expect(calcSeder(entry({ date: "2026-07-08" })).sederLengthMin).toBe(120);
      expect(calcSeder(entry({ date: "2026-07-05" })).sederLengthMin).toBe(s1LengthMin);
      expect(calcSeder(entry({ date: "2026-07-11" })).sederLengthMin).toBe(s1LengthMin);
    });

    it("reports a zero-length seder rather than a negative one when the hours are inverted", () => {
      updateSettings({
        sederOverrides: [
          {
            id: "o",
            from: "2026-07-08",
            to: "2026-07-08",
            times: { s1Start: "13:00", s1End: "09:00", s2Start, s2End },
          },
        ],
      });
      const c = calcSeder(entry({ date: "2026-07-08", absent: true }));
      expect(c.sederLengthMin).toBe(0);
      expect(c.missingMin).toBe(0);
      expect(c.netMissingMin).toBe(0);
    });
  });

  it("never returns a negative figure for any field", () => {
    const cases = [
      entry({ absent: true }),
      entry({ arrival: s1Start, departure: s1End, manualAdjustMin: -600 }),
      entry({ arrival: hhmm(s1StartMin - 120), departure: hhmm(s1EndMin + 120) }),
      entry({ excusedMinutes: -50, manualAdjustMin: -50 }),
      entry({ seder: 2, absent: true, excusedAll: true }),
      entry(),
    ];
    for (const e of cases) {
      const c = calcSeder(e);
      for (const [key, value] of Object.entries(c)) {
        if (typeof value === "number") expect(value, key).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ============================================================================
// Validation — reached through replaceAllData, which drops invalid records
// ============================================================================

describe("seder validation", () => {
  const kept = (e: SederEntry) => {
    replaceAllData([e], []);
    return getSederSnapshot().length === 1;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 12, 0));
  });

  it("keeps a well-formed entry", () => {
    expect(kept(entry({ arrival: s1Start, departure: s1End }))).toBe(true);
  });

  it("rejects a malformed date", () => {
    for (const date of [
      "2026-7-8",
      "08/07/2026",
      "2026-07",
      "",
      "yesterday",
      "20260708",
      "2026-07-08T00:00",
    ]) {
      expect(kept(entry({ date })), date).toBe(false);
    }
  });

  it("rejects a date well into the future", () => {
    expect(kept(entry({ date: "2026-07-20" }))).toBe(false);
    expect(kept(entry({ date: "2027-01-01" }))).toBe(false);
  });

  it("accepts today and the past", () => {
    expect(kept(entry({ date: "2026-07-08" }))).toBe(true);
    expect(kept(entry({ date: "2020-01-01" }))).toBe(true);
  });

  it("rejects a seder number other than 1 or 2", () => {
    expect(kept(entry({ seder: 0 as 1 }))).toBe(false);
    expect(kept(entry({ seder: 3 as 1 }))).toBe(false);
  });

  it("rejects unparseable clock times", () => {
    expect(kept(entry({ arrival: "99:99" }))).toBe(false);
    expect(kept(entry({ departure: "24:00" }))).toBe(false);
  });

  it("rejects a departure before the arrival", () => {
    expect(kept(entry({ arrival: "13:00", departure: "09:00" }))).toBe(false);
  });

  it("accepts a departure equal to the arrival", () => {
    expect(kept(entry({ arrival: "10:00", departure: "10:00" }))).toBe(true);
  });

  it("skips the clock-time checks entirely for an absence", () => {
    expect(kept(entry({ absent: true, arrival: "99:99", departure: "00:00" }))).toBe(true);
  });

  it("rejects an out-of-range excusedMinutes", () => {
    expect(kept(entry({ excusedMinutes: -1 }))).toBe(false);
    expect(kept(entry({ excusedMinutes: 1441 }))).toBe(false);
    expect(kept(entry({ excusedMinutes: 1440 }))).toBe(true);
  });

  it("rejects a manual adjustment larger than a day either way", () => {
    expect(kept(entry({ manualAdjustMin: 1441 }))).toBe(false);
    expect(kept(entry({ manualAdjustMin: -1441 }))).toBe(false);
    expect(kept(entry({ manualAdjustMin: -1440 }))).toBe(true);
    expect(kept(entry({ manualAdjustMin: 1440 }))).toBe(true);
  });

  it("rejects an over-long note", () => {
    expect(kept(entry({ note: "x".repeat(501) }))).toBe(false);
    expect(kept(entry({ note: "x".repeat(500) }))).toBe(true);
  });

  it("drops only the invalid records from a mixed list", () => {
    replaceAllData(
      [
        entry({ id: "ok1", date: "2026-07-08" }),
        entry({ id: "bad", date: "not-a-date" }),
        entry({ id: "ok2", date: "2026-07-07" }),
      ],
      [],
    );
    expect(getSederSnapshot().map((e) => e.id)).toEqual(["ok1", "ok2"]);
  });
});

describe("learning validation", () => {
  const kept = (l: LearningEntry) => {
    replaceAllData([], [l]);
    return getLearningSnapshot().length === 1;
  };

  it("keeps a well-formed lesson", () => {
    expect(kept(lesson())).toBe(true);
  });

  it("rejects a missing id", () => {
    expect(kept(lesson({ id: "" }))).toBe(false);
  });

  it("rejects an unknown framework", () => {
    expect(kept(lesson({ framework: "yeshiva" as LearningFramework }))).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(kept(lesson({ date: "2026-7-8" }))).toBe(false);
    expect(kept(lesson({ date: "" }))).toBe(false);
  });

  it("accepts a future date — unlike a seder record", () => {
    // validateLearning has no future-date rule; only the format is checked.
    expect(kept(lesson({ date: "2099-01-01" }))).toBe(true);
  });

  it("rejects a duration outside 1–1440 minutes", () => {
    expect(kept(lesson({ minutes: 0 }))).toBe(false);
    expect(kept(lesson({ minutes: -30 }))).toBe(false);
    expect(kept(lesson({ minutes: 1441 }))).toBe(false);
    expect(kept(lesson({ minutes: 1 }))).toBe(true);
    expect(kept(lesson({ minutes: 1440 }))).toBe(true);
  });

  it("rejects a non-numeric duration", () => {
    expect(kept(lesson({ minutes: "60" as unknown as number }))).toBe(false);
    expect(kept(lesson({ minutes: null as unknown as number }))).toBe(false);
    expect(kept(lesson({ minutes: undefined as unknown as number }))).toBe(false);
  });

  it("lets a NaN duration through the range check", () => {
    // Documenting a real gap rather than asserting the ideal: the range test is
    // `minutes < 1 || minutes > 1440`, and both comparisons are false for NaN.
    // Nothing can currently reach it — all three callers in routes/learning.tsx
    // coerce with `Math.max(1, ...)` or a validated HH:MM difference, and
    // JSON.parse cannot produce NaN, so an imported backup can't either. Worth
    // a Number.isFinite() guard if a fourth caller ever appears.
    expect(kept(lesson({ minutes: NaN }))).toBe(true);
  });

  it("accepts every framework and every source", () => {
    for (const framework of [
      "kollel-erev",
      "torato-beyado",
      "bein-hazmanim",
    ] as LearningFramework[]) {
      expect(kept(lesson({ framework })), framework).toBe(true);
    }
    for (const source of ["manual", "range", "timer"] as LearningEntry["source"][]) {
      expect(kept(lesson({ source })), source).toBe(true);
    }
  });
});

// ============================================================================
// replaceAllData
// ============================================================================

describe("replaceAllData", () => {
  it("replaces both lists at once", () => {
    replaceAllData([entry({ id: "a" })], [lesson({ id: "b" })]);
    expect(getSederSnapshot().map((e) => e.id)).toEqual(["a"]);
    expect(getLearningSnapshot().map((l) => l.id)).toEqual(["b"]);
  });

  it("clears both lists when handed empty ones", () => {
    replaceAllData([entry({ id: "a" })], [lesson({ id: "b" })]);
    replaceAllData([], []);
    expect(getSederSnapshot()).toEqual([]);
    expect(getLearningSnapshot()).toEqual([]);
  });

  it("sorts seder entries newest date first", () => {
    replaceAllData(
      [
        entry({ id: "old", date: "2026-07-01" }),
        entry({ id: "new", date: "2026-07-08" }),
        entry({ id: "mid", date: "2026-07-05" }),
      ],
      [],
    );
    expect(getSederSnapshot().map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  it("puts Seder א׳ before Seder ב׳ within the same date", () => {
    replaceAllData(
      [
        entry({ id: "s2", date: "2026-07-08", seder: 2 }),
        entry({ id: "s1", date: "2026-07-08", seder: 1 }),
      ],
      [],
    );
    expect(getSederSnapshot().map((e) => e.id)).toEqual(["s1", "s2"]);
  });

  it("leaves learning entries in the order given", () => {
    replaceAllData(
      [],
      [lesson({ id: "a", date: "2026-07-01" }), lesson({ id: "b", date: "2026-07-08" })],
    );
    expect(getLearningSnapshot().map((l) => l.id)).toEqual(["a", "b"]);
  });
});
