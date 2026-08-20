// The quick window's whole job is to guess right from one time, so every
// branch of that guess is pinned here.
import { describe, it, expect } from "vitest";
import {
  detectSeder, canBeOhevei, sederBounds, sederEndTime, blankEntry,
  arrivalEntry, absenceEntry, withExcused, hhmmOf, parseLooseTime,
} from "./quick-entry";
import { calcSeder, hhmmToMin, type SederEntry } from "./kollel-store";
import { DEFAULT_SETTINGS, type SederTimes } from "./settings-store";

const TIMES: SederTimes = {
  s1Start: DEFAULT_SETTINGS.seder.s1Start, // 09:00
  s1End: DEFAULT_SETTINGS.seder.s1End,     // 13:00
  s2Start: DEFAULT_SETTINGS.seder.s2Start, // 15:45
  s2End: DEFAULT_SETTINGS.seder.s2End,     // 19:30
};
const at = (hhmm: string) => hhmmToMin(hhmm)!;

describe("sederBounds", () => {
  it("reads each seder's own hours", () => {
    expect(sederBounds(1, TIMES)).toEqual({ start: at("09:00"), end: at("13:00") });
    expect(sederBounds(2, TIMES)).toEqual({ start: at("15:45"), end: at("19:30") });
  });
});

describe("sederEndTime", () => {
  it("is the time a quick entry records as the departure", () => {
    expect(sederEndTime(1, TIMES)).toBe("13:00");
    expect(sederEndTime(2, TIMES)).toBe("19:30");
  });
});

describe("detectSeder", () => {
  it("puts the morning on seder א׳", () => {
    for (const t of ["06:00", "08:55", "09:00", "11:30", "12:59", "13:00"]) {
      expect(detectSeder(at(t), TIMES), t).toBe(1);
    }
  });

  it("puts the afternoon and evening on seder ב׳", () => {
    for (const t of ["15:45", "16:20", "19:30", "21:00", "23:59"]) {
      expect(detectSeder(at(t), TIMES), t).toBe(2);
    }
  });

  it("gives the gap between the sedarim to the nearer one", () => {
    // 13:00–15:45; the midpoint is 14:22:30.
    expect(detectSeder(at("13:20"), TIMES)).toBe(1);
    expect(detectSeder(at("14:00"), TIMES)).toBe(1);
    expect(detectSeder(at("14:30"), TIMES)).toBe(2);
    expect(detectSeder(at("15:30"), TIMES)).toBe(2);
  });

  it("still answers when the two sedarim touch", () => {
    const back2back: SederTimes = { s1Start: "09:00", s1End: "13:00", s2Start: "13:00", s2End: "17:00" };
    expect(detectSeder(at("12:59"), back2back)).toBe(1);
    expect(detectSeder(at("13:00"), back2back)).toBe(1);
    expect(detectSeder(at("13:01"), back2back)).toBe(2);
  });
});

describe("canBeOhevei", () => {
  it("allows it for an arrival at or before the start", () => {
    expect(canBeOhevei(at("08:45"), 1, TIMES)).toBe(true);
    expect(canBeOhevei(at("09:00"), 1, TIMES)).toBe(true);
  });

  it("refuses it for a late arrival", () => {
    expect(canBeOhevei(at("09:01"), 1, TIMES)).toBe(false);
    expect(canBeOhevei(at("16:00"), 2, TIMES)).toBe(false);
  });

  it("is judged against the right seder's start", () => {
    // 15:00 is late for seder א׳ but early for seder ב׳.
    expect(canBeOhevei(at("15:00"), 1, TIMES)).toBe(false);
    expect(canBeOhevei(at("15:00"), 2, TIMES)).toBe(true);
  });
});

describe("blankEntry", () => {
  it("starts with nothing recorded", () => {
    const e = blankEntry("2026-08-20", 2);
    expect(e).toMatchObject({
      date: "2026-08-20", seder: 2, absent: false, ohevei: false,
      excusedAll: false, excusedMinutes: 0, manualAdjustMin: 0, tags: [],
    });
    expect(e.arrival).toBeUndefined();
    expect(e.id).toBeTruthy();
  });
});

describe("arrivalEntry", () => {
  const base = { date: "2026-08-20", seder: 1 as const, times: TIMES, ohevei: false };

  it("records the arrival and closes the seder at its end time", () => {
    const e = arrivalEntry({ ...base, time: "09:12" });
    expect(e.arrival).toBe("09:12");
    expect(e.departure).toBe("13:00");
    expect(e.absent).toBe(false);
  });

  it("scores a late arrival as exactly the minutes lost", () => {
    const e = arrivalEntry({ ...base, time: "09:25" });
    expect(calcSeder(e).missingMin).toBe(25);
    expect(calcSeder(e).isLate).toBe(true);
    expect(calcSeder(e).isEarlyDeparture).toBe(false);
  });

  it("earns bonus for arriving early, and no missing minutes", () => {
    const e = arrivalEntry({ ...base, time: "08:50" });
    const c = calcSeder(e);
    expect(c.missingMin).toBe(0);
    expect(c.bonusMin).toBe(10);
  });

  it("makes אוהבי ה׳ actually count, since the departure is filled in", () => {
    const e = arrivalEntry({ ...base, time: "09:00", ohevei: true });
    // This is the point of recording the departure at all: without it
    // calcSeder refuses the אוהבי ה׳ mark outright.
    expect(calcSeder(e).isOhevei).toBe(true);
  });

  it("keeps the same record when saved twice, and takes the newer time", () => {
    const first = arrivalEntry({ ...base, time: "09:05" });
    const second = arrivalEntry({ ...base, existing: first, time: "09:02" });
    expect(second.id).toBe(first.id);
    expect(second.arrival).toBe("09:02");
  });

  it("keeps a justification entered earlier", () => {
    const excused = withExcused(arrivalEntry({ ...base, time: "09:20" }), { kind: "partial", minutes: 15 });
    const again = arrivalEntry({ ...base, existing: excused, time: "09:20" });
    expect(again.excusedMinutes).toBe(15);
  });

  it("turns an absence back into attendance", () => {
    const absent = absenceEntry({ date: base.date, seder: 1, excused: null });
    const present = arrivalEntry({ ...base, existing: absent, time: "09:00" });
    expect(present.absent).toBe(false);
    expect(present.arrival).toBe("09:00");
    expect(calcSeder(present).missingMin).toBe(0);
  });
});

describe("withExcused", () => {
  const late: SederEntry = arrivalEntry({ date: "2026-08-20", seder: 1, times: TIMES, ohevei: false, time: "09:30" });

  it("justifies the whole of the missing time", () => {
    const e = withExcused(late, { kind: "all" });
    const c = calcSeder(e);
    expect(c.missingMin).toBe(30);
    expect(c.excusedMin).toBe(30);
    expect(c.netMissingMin).toBe(0);
  });

  it("justifies part of it", () => {
    const c = calcSeder(withExcused(late, { kind: "partial", minutes: 20 }));
    expect(c.excusedMin).toBe(20);
    expect(c.nonExcusedMin).toBe(10);
  });

  it("caps a partial justification at the minutes actually missed", () => {
    const c = calcSeder(withExcused(late, { kind: "partial", minutes: 500 }));
    expect(c.excusedMin).toBe(30);
    expect(c.netMissingMin).toBe(0);
  });

  it("clears a whole-seder justification when switching to partial", () => {
    const all = withExcused(late, { kind: "all" });
    const partial = withExcused(all, { kind: "partial", minutes: 5 });
    expect(partial.excusedAll).toBe(false);
    expect(partial.excusedMinutes).toBe(5);
  });

  it("rounds and floors the minutes it is given", () => {
    expect(withExcused(late, { kind: "partial", minutes: 12.6 }).excusedMinutes).toBe(13);
    expect(withExcused(late, { kind: "partial", minutes: -4 }).excusedMinutes).toBe(0);
  });
});

describe("absenceEntry", () => {
  it("marks the whole seder missing", () => {
    const e = absenceEntry({ date: "2026-08-20", seder: 2, excused: null });
    expect(e.absent).toBe(true);
    const c = calcSeder(e);
    expect(c.missingMin).toBe(at("19:30") - at("15:45"));
    expect(c.netMissingMin).toBe(c.missingMin);
  });

  it("clears any times left over from an earlier arrival", () => {
    const present = arrivalEntry({ date: "2026-08-20", seder: 1, times: TIMES, ohevei: true, time: "09:00" });
    const e = absenceEntry({ date: "2026-08-20", seder: 1, existing: present, excused: null });
    expect(e.arrival).toBeUndefined();
    expect(e.departure).toBeUndefined();
    expect(e.ohevei).toBe(false);
    expect(e.id).toBe(present.id);
  });

  it("justifies the whole absence", () => {
    const e = absenceEntry({ date: "2026-08-20", seder: 1, excused: { kind: "all" } });
    expect(calcSeder(e).netMissingMin).toBe(0);
  });

  it("justifies part of an absence", () => {
    const e = absenceEntry({ date: "2026-08-20", seder: 1, excused: { kind: "partial", minutes: 60 } });
    const c = calcSeder(e);
    expect(c.excusedMin).toBe(60);
    expect(c.nonExcusedMin).toBe(c.missingMin - 60);
  });

  it("replaces a stale justification rather than adding to it", () => {
    const first = absenceEntry({ date: "2026-08-20", seder: 1, excused: { kind: "all" } });
    const second = absenceEntry({ date: "2026-08-20", seder: 1, existing: first, excused: null });
    expect(second.excusedAll).toBe(false);
    expect(second.excusedMinutes).toBe(0);
    expect(calcSeder(second).netMissingMin).toBeGreaterThan(0);
  });
});

describe("hhmmOf", () => {
  it("pads both halves", () => {
    expect(hhmmOf(new Date(2026, 7, 20, 9, 5))).toBe("09:05");
    expect(hhmmOf(new Date(2026, 7, 20, 19, 30))).toBe("19:30");
    expect(hhmmOf(new Date(2026, 7, 20, 0, 0))).toBe("00:00");
  });
});

describe("parseLooseTime", () => {
  it("takes four digits with no separator", () => {
    expect(parseLooseTime("0915")).toBe("09:15");
    expect(parseLooseTime("1930")).toBe("19:30");
    expect(parseLooseTime("0000")).toBe("00:00");
    expect(parseLooseTime("2359")).toBe("23:59");
  });

  it("takes three digits as h:mm", () => {
    expect(parseLooseTime("915")).toBe("09:15");
    expect(parseLooseTime("905")).toBe("09:05");
  });

  it("takes a bare hour", () => {
    // Nobody typing one number into a field called "שעת הגעה" means nine
    // minutes past midnight.
    expect(parseLooseTime("9")).toBe("09:00");
    expect(parseLooseTime("21")).toBe("21:00");
    expect(parseLooseTime("09")).toBe("09:00");
  });

  it("takes a time written the ordinary way", () => {
    expect(parseLooseTime("09:15")).toBe("09:15");
    expect(parseLooseTime("9:15")).toBe("09:15");
    expect(parseLooseTime("19:30")).toBe("19:30");
  });

  it("treats any punctuation as the separator", () => {
    expect(parseLooseTime("9.15")).toBe("09:15");
    expect(parseLooseTime("9 15")).toBe("09:15");
    expect(parseLooseTime("09-15")).toBe("09:15");
  });

  it("ignores surrounding whitespace", () => {
    expect(parseLooseTime("  0915  ")).toBe("09:15");
  });

  it("refuses an hour or minute out of range rather than clamping it", () => {
    // A silently corrected time is worse than an obvious refusal on the field
    // that feeds every figure in the app.
    expect(parseLooseTime("2530")).toBe(null);
    expect(parseLooseTime("0970")).toBe(null);
    expect(parseLooseTime("24:00")).toBe(null);
    expect(parseLooseTime("25")).toBe(null);
  });

  it("refuses a half-typed time with a separator", () => {
    // "1:5" is a typo mid-typing, not 01:05.
    expect(parseLooseTime("1:5")).toBe(null);
    expect(parseLooseTime("9:5")).toBe(null);
  });

  it("refuses anything that is not a time", () => {
    for (const bad of ["", "   ", "abc", "12345", ":", "--"]) {
      expect(parseLooseTime(bad), JSON.stringify(bad)).toBe(null);
    }
  });

  it("round-trips its own output", () => {
    for (const t of ["00:00", "09:15", "13:00", "23:59"]) {
      expect(parseLooseTime(t)).toBe(t);
    }
  });

  it("agrees with hhmmOf, so the default value parses", () => {
    const now = hhmmOf(new Date(2026, 7, 21, 8, 7));
    expect(parseLooseTime(now)).toBe("08:07");
  });
});
