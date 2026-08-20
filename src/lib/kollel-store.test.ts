import { describe, it, expect } from "vitest";
import {
  calcSeder, hhmmToMin, monthClosing,
  type SederEntry, type LearningEntry,
} from "./kollel-store";
import { DEFAULT_SETTINGS } from "./settings-store";

// Node test env has no `window`, so getSettings() always returns
// DEFAULT_SETTINGS — but we deliberately don't hardcode its clock values
// here (they've already changed once via a Lovable edit and will again).
// Instead we derive fixture times from whatever DEFAULT_SETTINGS.seder
// currently is, so these tests stay correct across future settings tweaks.
const { s1Start, s1End, bonusThresholdMin } = DEFAULT_SETTINGS.seder;
const s1StartMin = hhmmToMin(s1Start)!;
const s1EndMin = hhmmToMin(s1End)!;
const s1LengthMin = s1EndMin - s1StartMin;

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function entry(overrides: Partial<SederEntry>): SederEntry {
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

describe("hhmmToMin", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(hhmmToMin("09:30")).toBe(570);
    expect(hhmmToMin("00:00")).toBe(0);
  });
  it("returns null for missing/undefined input", () => {
    expect(hhmmToMin(undefined)).toBe(null);
  });
});

describe("calcSeder", () => {
  it("full attendance (on time, on time) has zero missing", () => {
    const c = calcSeder(entry({ arrival: s1Start, departure: s1End }));
    expect(c.sederLengthMin).toBe(s1LengthMin);
    expect(c.netMissingMin).toBe(0);
    expect(c.isLate).toBe(false);
    expect(c.isEarlyDeparture).toBe(false);
  });

  it("absent counts the full seder length as missing", () => {
    const c = calcSeder(entry({ absent: true }));
    expect(c.missingMin).toBe(s1LengthMin);
    expect(c.netMissingMin).toBe(s1LengthMin);
  });

  it("arriving late adds the late minutes to missing", () => {
    const c = calcSeder(entry({ arrival: minToHHMM(s1StartMin + 30), departure: s1End }));
    expect(c.missingMin).toBe(30);
    expect(c.isLate).toBe(true);
  });

  it("leaving early adds the early minutes to missing", () => {
    const c = calcSeder(entry({ arrival: s1Start, departure: minToHHMM(s1EndMin - 30) }));
    expect(c.missingMin).toBe(30);
    expect(c.isEarlyDeparture).toBe(true);
  });

  it("arriving early earns bonus minutes capped at bonusThresholdMin", () => {
    // Arrives 30 min early — more than the bonus threshold, so bonus caps.
    const c = calcSeder(entry({ arrival: minToHHMM(s1StartMin - 30), departure: s1End }));
    expect(c.bonusMin).toBe(bonusThresholdMin);
    expect(c.netMissingMin).toBe(0); // no missing minutes to offset anyway
  });

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

  it("manualAdjustMin can reduce net missing below the raw non-excused amount", () => {
    const c = calcSeder(entry({ arrival: minToHHMM(s1StartMin + 30), departure: s1End, manualAdjustMin: -30 }));
    expect(c.missingMin).toBe(30);
    expect(c.netMissingMin).toBe(0); // 30 - 30 manual adjustment
  });

  it("netMissingMin never goes negative", () => {
    const c = calcSeder(entry({ arrival: s1Start, departure: s1End, manualAdjustMin: -50 }));
    expect(c.netMissingMin).toBe(0);
  });

  it("isOhevei requires ohevei flag + arriving on/before start + leaving on/after end", () => {
    const full = calcSeder(entry({ ohevei: true, arrival: s1Start, departure: s1End }));
    expect(full.isOhevei).toBe(true);

    const late = calcSeder(entry({ ohevei: true, arrival: minToHHMM(s1StartMin + 5), departure: s1End }));
    expect(late.isOhevei).toBe(false);
  });
});

function lesson(overrides: Partial<LearningEntry>): LearningEntry {
  return { id: "l1", framework: "kollel-erev", date: "2026-07-08", minutes: 60, source: "manual", ...overrides };
}

describe("monthClosing", () => {
  it("sums the month's minutes, splits out the excused part, and counts events", () => {
    const c = monthClosing("2026-07", [
      // 30 min late, none of it excused
      entry({ id: "a", date: "2026-07-06", arrival: minToHHMM(s1StartMin + 30), departure: s1End }),
      // absent, fully excused
      entry({ id: "b", date: "2026-07-07", absent: true, excusedAll: true }),
      // full attendance, counts as אוהבי ה׳
      entry({ id: "c", date: "2026-07-08", ohevei: true, arrival: s1Start, departure: s1End }),
    ], []);

    expect(c.seder.entries).toBe(3);
    expect(c.seder.totalMissing).toBe(30 + s1LengthMin);
    expect(c.seder.excused).toBe(s1LengthMin);
    expect(c.seder.nonExcused).toBe(30);
    expect(c.seder.lateCount).toBe(1);
    expect(c.seder.absenceCount).toBe(1);
    expect(c.seder.oheveiCount).toBe(1);
  });

  it("ignores entries and lessons from other months", () => {
    const c = monthClosing("2026-07", [
      entry({ id: "a", date: "2026-07-06", absent: true }),
      entry({ id: "b", date: "2026-08-06", absent: true }),
    ], [
      lesson({ id: "l1", date: "2026-07-06", minutes: 45 }),
      lesson({ id: "l2", date: "2026-08-06", minutes: 90 }),
    ]);
    expect(c.seder.entries).toBe(1);
    expect(c.learning.kollelErev).toBe(45);
  });

  it("splits learning minutes per framework and doubles תענית דיבור", () => {
    const c = monthClosing("2026-07", [], [
      lesson({ id: "l1", framework: "kollel-erev", minutes: 60 }),
      lesson({ id: "l2", framework: "kollel-erev", minutes: 30, tanitDibur: true }),
      lesson({ id: "l3", framework: "torato-beyado", minutes: 90 }),
      lesson({ id: "l4", framework: "bein-hazmanim", minutes: 20 }),
    ]);
    expect(c.learning.kollelErev).toBe(60 + 60); // 30 בתענית דיבור נספרות כפול
    expect(c.learning.kollelErevRaw).toBe(90);
    expect(c.learning.toratoBeyado).toBe(90);
    expect(c.learning.beinHazmanim).toBe(20);
  });

  it("marks past months closed and the current month still open", () => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(monthClosing(currentKey, [], []).closed).toBe(false);
    expect(monthClosing("2020-01", [], []).closed).toBe(true);
  });

  it("labels the month in both calendars", () => {
    const c = monthClosing("2026-07", [], []);
    expect(c.gregorianLabel).toBe("יולי 2026");
    expect(c.hebrewLabel).toContain("תשפ״ו");
  });
});
