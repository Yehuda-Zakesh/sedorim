import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings,
  resetSettings,
  getSederTimesFor,
  setSederTimesFromToday,
  removeSederScheduleEntry,
  addSederOverride,
  removeSederOverride,
  isOnboarded,
  markOnboarded,
  resetOnboarding,
  applyAppearance,
  type SederTimes,
  type Settings,
} from "./settings-store";
import { hhmmToMin } from "./kollel-store";

const BASE: SederTimes = {
  s1Start: DEFAULT_SETTINGS.seder.s1Start,
  s1End: DEFAULT_SETTINGS.seder.s1End,
  s2Start: DEFAULT_SETTINGS.seder.s2Start,
  s2End: DEFAULT_SETTINGS.seder.s2End,
};

const times = (s1Start: string, s1End: string): SederTimes => ({
  s1Start,
  s1End,
  s2Start: BASE.s2Start,
  s2End: BASE.s2End,
});

beforeEach(() => {
  resetSettings();
  resetOnboarding();
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// Defaults
// ============================================================================

describe("DEFAULT_SETTINGS", () => {
  it("describes seder hours that parse and run forwards", () => {
    for (const key of ["s1Start", "s1End", "s2Start", "s2End"] as const) {
      expect(hhmmToMin(DEFAULT_SETTINGS.seder[key]), key).not.toBe(null);
    }
    expect(hhmmToMin(DEFAULT_SETTINGS.seder.s1End)!).toBeGreaterThan(
      hhmmToMin(DEFAULT_SETTINGS.seder.s1Start)!,
    );
    expect(hhmmToMin(DEFAULT_SETTINGS.seder.s2End)!).toBeGreaterThan(
      hhmmToMin(DEFAULT_SETTINGS.seder.s2Start)!,
    );
  });

  it("puts Seder ב׳ after Seder א׳", () => {
    expect(hhmmToMin(DEFAULT_SETTINGS.seder.s2Start)!).toBeGreaterThanOrEqual(
      hhmmToMin(DEFAULT_SETTINGS.seder.s1End)!,
    );
  });

  it("uses sane thresholds and goals", () => {
    expect(DEFAULT_SETTINGS.seder.bonusThresholdMin).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.seder.alertMissingMinPerMonth).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.goals.monthlyTarget).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.goals.monthlyTarget).toBeLessThanOrEqual(100);
    expect(DEFAULT_SETTINGS.goals.maxLatePerMonth).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.data.backupRetention).toBeGreaterThanOrEqual(1);
  });

  it("uses only values the types allow", () => {
    expect(["off", "daily", "weekly"]).toContain(DEFAULT_SETTINGS.data.autoBackup);
    expect(["small", "normal", "large", "xlarge"]).toContain(DEFAULT_SETTINGS.appearance.fontSize);
    expect(["iso", "he", "mixed", "hebrew"]).toContain(DEFAULT_SETTINGS.language.dateFormat);
    expect(["seder_end", "blank"]).toContain(DEFAULT_SETTINGS.seder.defaultDeparture);
  });

  it("starts with no schedule changes and no overrides", () => {
    expect(DEFAULT_SETTINGS.sederSchedule).toEqual([]);
    expect(DEFAULT_SETTINGS.sederOverrides).toEqual([]);
  });

  it("is what getSettings returns before anything is changed", () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

// ============================================================================
// updateSettings / resetSettings
// ============================================================================

describe("updateSettings", () => {
  it("applies a nested patch", () => {
    updateSettings({ profile: { name: "יהודה", classroom: "ג׳" } });
    expect(getSettings().profile).toEqual({ name: "יהודה", classroom: "ג׳" });
  });

  it("leaves the siblings of a partially-patched branch alone", () => {
    updateSettings({ appearance: { ...getSettings().appearance, fontSize: "large" } });
    const after = getSettings().appearance;
    expect(after.fontSize).toBe("large");
    expect(after.colorTheme).toBe(DEFAULT_SETTINGS.appearance.colorTheme);
    expect(after.highContrast).toBe(DEFAULT_SETTINGS.appearance.highContrast);
  });

  it("merges one key of a branch without listing the rest", () => {
    updateSettings({ profile: { name: "משה" } as Settings["profile"] });
    expect(getSettings().profile.name).toBe("משה");
    expect(getSettings().profile.classroom).toBe(DEFAULT_SETTINGS.profile.classroom);
  });

  it("leaves untouched branches alone entirely", () => {
    updateSettings({ goals: { monthlyTarget: 80, maxLatePerMonth: 1 } });
    expect(getSettings().seder).toEqual(DEFAULT_SETTINGS.seder);
    expect(getSettings().notifications).toEqual(DEFAULT_SETTINGS.notifications);
  });

  it("ignores an explicitly undefined value rather than erasing the old one", () => {
    updateSettings({ profile: { name: undefined as unknown as string } as Settings["profile"] });
    expect(getSettings().profile.name).toBe(DEFAULT_SETTINGS.profile.name);
  });

  it("replaces arrays wholesale instead of merging them element by element", () => {
    updateSettings({ sederSchedule: [{ id: "a", effectiveFrom: "2026-01-01", times: BASE }] });
    updateSettings({ sederSchedule: [{ id: "b", effectiveFrom: "2026-02-01", times: BASE }] });
    expect(getSettings().sederSchedule.map((e) => e.id)).toEqual(["b"]);
  });

  it("can empty an array", () => {
    updateSettings({
      sederOverrides: [{ id: "x", from: "2026-01-01", to: "2026-01-02", times: BASE }],
    });
    updateSettings({ sederOverrides: [] });
    expect(getSettings().sederOverrides).toEqual([]);
  });

  it("accepts an empty patch as a no-op", () => {
    updateSettings({});
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("does not mutate DEFAULT_SETTINGS", () => {
    const snapshot = structuredClone(DEFAULT_SETTINGS);
    updateSettings({ profile: { name: "X", classroom: "Y" } });
    updateSettings({ sederSchedule: [{ id: "a", effectiveFrom: "2026-01-01", times: BASE }] });
    updateSettings({ goals: { monthlyTarget: 1, maxLatePerMonth: 1 } });
    expect(DEFAULT_SETTINGS).toEqual(snapshot);
  });

  it("takes a skipAudit flag without changing the result", () => {
    updateSettings({ goals: { monthlyTarget: 77, maxLatePerMonth: 2 } }, { skipAudit: true });
    expect(getSettings().goals.monthlyTarget).toBe(77);
  });
});

describe("resetSettings", () => {
  it("puts everything back to the defaults", () => {
    updateSettings({
      profile: { name: "X", classroom: "Y" },
      sederSchedule: [{ id: "a", effectiveFrom: "2026-01-01", times: times("07:00", "08:00") }],
      sederOverrides: [{ id: "b", from: "2026-01-01", to: "2026-01-02", times: BASE }],
      goals: { monthlyTarget: 1, maxLatePerMonth: 9 },
    });
    resetSettings();
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

// ============================================================================
// getSederTimesFor
// ============================================================================

describe("getSederTimesFor", () => {
  it("returns the base hours when nothing else applies", () => {
    expect(getSederTimesFor("2026-07-08")).toEqual(BASE);
  });

  describe("permanent schedule changes", () => {
    beforeEach(() => {
      updateSettings({
        sederSchedule: [
          { id: "base", effectiveFrom: "0001-01-01", times: times("09:00", "13:00") },
          { id: "summer", effectiveFrom: "2026-07-01", times: times("10:00", "13:30") },
          { id: "winter", effectiveFrom: "2026-11-01", times: times("08:30", "12:30") },
        ],
      });
    });

    it("applies a change from its effective date onwards", () => {
      expect(getSederTimesFor("2026-07-01").s1Start).toBe("10:00");
      expect(getSederTimesFor("2026-08-15").s1Start).toBe("10:00");
    });

    it("leaves earlier dates on the previous hours", () => {
      expect(getSederTimesFor("2026-06-30").s1Start).toBe("09:00");
      expect(getSederTimesFor("2020-01-01").s1Start).toBe("09:00");
    });

    it("takes the latest change that has come into effect", () => {
      expect(getSederTimesFor("2026-11-01").s1Start).toBe("08:30");
      expect(getSederTimesFor("2027-03-01").s1Start).toBe("08:30");
    });

    it("does not care what order the entries are stored in", () => {
      const reversed = [...getSettings().sederSchedule].reverse();
      updateSettings({ sederSchedule: reversed });
      expect(getSederTimesFor("2026-08-15").s1Start).toBe("10:00");
      expect(getSederTimesFor("2026-06-30").s1Start).toBe("09:00");
    });

    it("falls back to the base hours for a date before every entry", () => {
      updateSettings({
        sederSchedule: [
          { id: "only", effectiveFrom: "2026-07-01", times: times("10:00", "13:30") },
        ],
      });
      expect(getSederTimesFor("2026-06-30")).toEqual(BASE);
    });
  });

  describe("temporary overrides", () => {
    beforeEach(() => {
      updateSettings({
        sederOverrides: [
          {
            id: "bh",
            from: "2026-07-06",
            to: "2026-07-10",
            label: "בין הזמנים",
            times: times("10:00", "12:00"),
          },
        ],
      });
    });

    it("applies inside the range", () => {
      expect(getSederTimesFor("2026-07-08").s1Start).toBe("10:00");
    });

    it("includes both endpoints", () => {
      expect(getSederTimesFor("2026-07-06").s1Start).toBe("10:00");
      expect(getSederTimesFor("2026-07-10").s1Start).toBe("10:00");
    });

    it("stops outside the range", () => {
      expect(getSederTimesFor("2026-07-05")).toEqual(BASE);
      expect(getSederTimesFor("2026-07-11")).toEqual(BASE);
    });

    it("wins over a permanent schedule change covering the same date", () => {
      updateSettings({
        sederSchedule: [{ id: "s", effectiveFrom: "2026-01-01", times: times("08:00", "12:00") }],
      });
      expect(getSederTimesFor("2026-07-08").s1Start).toBe("10:00"); // the override
      expect(getSederTimesFor("2026-07-11").s1Start).toBe("08:00"); // the schedule
    });

    it("prefers the override with the later start when two overlap", () => {
      updateSettings({
        sederOverrides: [
          { id: "a", from: "2026-07-01", to: "2026-07-31", times: times("07:00", "11:00") },
          { id: "b", from: "2026-07-06", to: "2026-07-10", times: times("10:00", "12:00") },
        ],
      });
      expect(getSederTimesFor("2026-07-08").s1Start).toBe("10:00");
      expect(getSederTimesFor("2026-07-20").s1Start).toBe("07:00");
    });

    it("handles a single-day override", () => {
      updateSettings({
        sederOverrides: [
          { id: "one", from: "2026-07-08", to: "2026-07-08", times: times("11:00", "12:00") },
        ],
      });
      expect(getSederTimesFor("2026-07-07")).toEqual(BASE);
      expect(getSederTimesFor("2026-07-08").s1Start).toBe("11:00");
      expect(getSederTimesFor("2026-07-09")).toEqual(BASE);
    });

    it("never matches an inverted range", () => {
      updateSettings({
        sederOverrides: [
          { id: "bad", from: "2026-07-10", to: "2026-07-06", times: times("11:00", "12:00") },
        ],
      });
      for (const day of ["2026-07-05", "2026-07-06", "2026-07-08", "2026-07-10", "2026-07-11"]) {
        expect(getSederTimesFor(day), day).toEqual(BASE);
      }
    });
  });
});

// ============================================================================
// setSederTimesFromToday
// ============================================================================

describe("setSederTimesFromToday", () => {
  it("snapshots the old hours so past dates are unaffected", () => {
    setSederTimesFromToday(times("10:00", "14:00"), "2026-07-01");
    expect(getSederTimesFor("2026-06-30")).toEqual(BASE);
    expect(getSederTimesFor("2026-07-01").s1Start).toBe("10:00");
  });

  it("adds the base snapshot only once", () => {
    setSederTimesFromToday(times("10:00", "14:00"), "2026-07-01");
    setSederTimesFromToday(times("11:00", "15:00"), "2026-08-01");
    const schedule = getSettings().sederSchedule;
    expect(schedule.filter((e) => e.effectiveFrom === "0001-01-01")).toHaveLength(1);
    expect(schedule).toHaveLength(3);
  });

  it("makes each change take effect from its own date", () => {
    setSederTimesFromToday(times("10:00", "14:00"), "2026-07-01");
    setSederTimesFromToday(times("11:00", "15:00"), "2026-08-01");
    expect(getSederTimesFor("2026-06-30")).toEqual(BASE);
    expect(getSederTimesFor("2026-07-15").s1Start).toBe("10:00");
    expect(getSederTimesFor("2026-08-15").s1Start).toBe("11:00");
  });

  it("overwrites rather than duplicates a change for a date already scheduled", () => {
    setSederTimesFromToday(times("10:00", "14:00"), "2026-07-01");
    setSederTimesFromToday(times("10:30", "14:30"), "2026-07-01");
    const schedule = getSettings().sederSchedule;
    expect(schedule.filter((e) => e.effectiveFrom === "2026-07-01")).toHaveLength(1);
    expect(getSederTimesFor("2026-07-01").s1Start).toBe("10:30");
  });

  it("updates the base hours in settings too", () => {
    setSederTimesFromToday(times("10:00", "14:00"), "2026-07-01");
    expect(getSettings().seder.s1Start).toBe("10:00");
    expect(getSettings().seder.s1End).toBe("14:00");
  });

  it("leaves the other seder settings alone", () => {
    setSederTimesFromToday(times("10:00", "14:00"), "2026-07-01");
    expect(getSettings().seder.bonusThresholdMin).toBe(DEFAULT_SETTINGS.seder.bonusThresholdMin);
    expect(getSettings().seder.defaultDeparture).toBe(DEFAULT_SETTINGS.seder.defaultDeparture);
  });

  it("defaults its effective date to today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 12, 0));
    setSederTimesFromToday(times("10:00", "14:00"));
    expect(getSettings().sederSchedule.map((e) => e.effectiveFrom)).toContain("2026-07-08");
    expect(getSederTimesFor("2026-07-07")).toEqual(BASE);
    expect(getSederTimesFor("2026-07-08").s1Start).toBe("10:00");
  });

  it("gives every entry an id", () => {
    setSederTimesFromToday(times("10:00", "14:00"), "2026-07-01");
    setSederTimesFromToday(times("11:00", "15:00"), "2026-08-01");
    const ids = getSettings().sederSchedule.map((e) => e.id);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("removeSederScheduleEntry", () => {
  it("drops the entry and reverts the dates it covered", () => {
    setSederTimesFromToday(times("10:00", "14:00"), "2026-07-01");
    const entry = getSettings().sederSchedule.find((e) => e.effectiveFrom === "2026-07-01")!;
    removeSederScheduleEntry(entry.id);
    expect(getSettings().sederSchedule.map((e) => e.effectiveFrom)).toEqual(["0001-01-01"]);
    expect(getSederTimesFor("2026-07-08")).toEqual(BASE);
  });

  it("ignores an unknown id", () => {
    setSederTimesFromToday(times("10:00", "14:00"), "2026-07-01");
    const before = getSettings().sederSchedule.length;
    removeSederScheduleEntry("no-such-id");
    expect(getSettings().sederSchedule).toHaveLength(before);
  });
});

describe("addSederOverride / removeSederOverride", () => {
  it("adds an override with a generated id", () => {
    addSederOverride({
      from: "2026-07-06",
      to: "2026-07-10",
      label: "בין הזמנים",
      times: times("10:00", "12:00"),
    });
    const [override] = getSettings().sederOverrides;
    expect(override.id.length).toBeGreaterThan(0);
    expect(override.label).toBe("בין הזמנים");
    expect(getSederTimesFor("2026-07-08").s1Start).toBe("10:00");
  });

  it("keeps earlier overrides when adding another", () => {
    addSederOverride({ from: "2026-07-06", to: "2026-07-10", times: times("10:00", "12:00") });
    addSederOverride({ from: "2026-08-06", to: "2026-08-10", times: times("11:00", "13:00") });
    expect(getSettings().sederOverrides).toHaveLength(2);
    expect(new Set(getSettings().sederOverrides.map((o) => o.id)).size).toBe(2);
  });

  it("works without a label", () => {
    addSederOverride({ from: "2026-07-06", to: "2026-07-10", times: times("10:00", "12:00") });
    expect(getSettings().sederOverrides[0].label).toBeUndefined();
  });

  it("removes one override by id and leaves the rest", () => {
    addSederOverride({ from: "2026-07-06", to: "2026-07-10", times: times("10:00", "12:00") });
    addSederOverride({ from: "2026-08-06", to: "2026-08-10", times: times("11:00", "13:00") });
    const [first] = getSettings().sederOverrides;
    removeSederOverride(first.id);
    expect(getSettings().sederOverrides).toHaveLength(1);
    expect(getSederTimesFor("2026-07-08")).toEqual(BASE);
    expect(getSederTimesFor("2026-08-08").s1Start).toBe("11:00");
  });

  it("ignores an unknown id", () => {
    addSederOverride({ from: "2026-07-06", to: "2026-07-10", times: times("10:00", "12:00") });
    removeSederOverride("no-such-id");
    expect(getSettings().sederOverrides).toHaveLength(1);
  });
});

// ============================================================================
// Onboarding
// ============================================================================

describe("onboarding flag", () => {
  it("starts unset", () => {
    expect(isOnboarded()).toBe(false);
  });

  it("is set by markOnboarded", () => {
    markOnboarded();
    expect(isOnboarded()).toBe(true);
  });

  it("is cleared by resetOnboarding", () => {
    markOnboarded();
    resetOnboarding();
    expect(isOnboarded()).toBe(false);
  });

  it("is idempotent", () => {
    markOnboarded();
    markOnboarded();
    expect(isOnboarded()).toBe(true);
  });

  it("is independent of resetSettings", () => {
    markOnboarded();
    resetSettings();
    expect(isOnboarded()).toBe(true);
  });
});

// ============================================================================
// applyAppearance
// ============================================================================

describe("applyAppearance", () => {
  it("does nothing and throws nothing when there is no document", () => {
    // The EXEs and the browser have one; the Node test env does not, and the
    // module calls this at import time, so it has to cope.
    expect(typeof document).toBe("undefined");
    expect(() => applyAppearance()).not.toThrow();
  });

  it("survives being called after every appearance change", () => {
    for (const fontSize of ["small", "normal", "large", "xlarge"] as const) {
      updateSettings({ appearance: { ...getSettings().appearance, fontSize } });
      expect(() => applyAppearance()).not.toThrow();
    }
  });
});
