// The stipend rules. Everything here goes through the pure calcStipend(), so
// the day counts are handed in explicitly wherever the calendar is not the
// thing under test.
import { describe, it, expect, beforeEach } from "vitest";
import {
  calcStipend, proportionalRatio, scaleTiers, tierCharges,
  STIPEND_POLICY, type DeductionTier,
} from "./stipend";
import { hhmmToMin, type SederEntry, type LearningEntry } from "./kollel-store";
import { DEFAULT_SETTINGS, resetSettings } from "./settings-store";

const { s1End, s2Start, s2End } = DEFAULT_SETTINGS.seder;
const s2StartMin = hhmmToMin(s2Start)!;

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

let seq = 0;
function entry(overrides: Partial<SederEntry> = {}): SederEntry {
  return {
    id: `e${seq++}`,
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
    id: `l${seq++}`,
    framework: "kollel-erev",
    date: "2026-07-08",
    minutes: 60,
    source: "manual",
    ...overrides,
  };
}

/** A seder א׳ arrived at `minutes` late. */
const late = (date: string, minutes: number) =>
  entry({ date, seder: 1, arrival: hhmm(hhmmToMin(DEFAULT_SETTINGS.seder.s1Start)! + minutes), departure: s1End });

/** A seder ב׳ counted by חבורת ש"ס. */
const shas = (date: string) =>
  entry({ date, seder: 2, arrival: "14:30", departure: s2End });

/**
 * The `n`-th day of July 2026 the kollel could have sat on — Sunday to
 * Thursday, so no test record ever lands on a Friday or a Shabbat. July 2026
 * has 22 of them (it runs Wed 1 to Fri 31: five Fridays, four Shabbatot).
 */
function july(n: number): string {
  let found = 0;
  for (let d = 1; d <= 31; d++) {
    const day = new Date(2026, 6, d).getDay();
    if (day === 5 || day === 6) continue;
    if (++found === n) return `2026-07-${String(d).padStart(2, "0")}`;
  }
  throw new Error(`July 2026 has no learning day number ${n}`);
}

/** A whole month, so nothing is scaled unless a test asks for it. */
const FULL = { sessionDays: 22, fullMonthDays: 22 };

function run(opts: {
  entries?: SederEntry[];
  lessons?: LearningEntry[];
  shasChavura?: boolean;
  priorApproval?: boolean;
  sessionDays?: number;
  fullMonthDays?: number;
}) {
  return calcStipend({
    monthKey: "2026-07",
    entries: opts.entries ?? [],
    lessons: opts.lessons ?? [],
    shasChavura: opts.shasChavura ?? false,
    priorApproval: opts.priorApproval ?? false,
    sessionDays: opts.sessionDays ?? FULL.sessionDays,
    fullMonthDays: opts.fullMonthDays ?? FULL.fullMonthDays,
  });
}

beforeEach(() => {
  resetSettings();
  seq = 0;
});

// ============================================================================
// The pieces
// ============================================================================

describe("proportionalRatio", () => {
  it("is 1 for a month the kollel sat every one of its weekdays", () => {
    expect(proportionalRatio(22, 22)).toBe(1);
    expect(proportionalRatio(21, 21)).toBe(1);
  });

  it("scales down a month that lost days", () => {
    expect(proportionalRatio(11, 22)).toBe(0.5);
  });

  it("never exceeds 1, even if more days were sat than the month has weekdays", () => {
    expect(proportionalRatio(25, 22)).toBe(1);
  });

  it("is 0 rather than Infinity or NaN when there is no reference month", () => {
    expect(proportionalRatio(10, 0)).toBe(0);
  });

  it("is 0 for a month with no sessions at all", () => {
    expect(proportionalRatio(0, 22)).toBe(0);
  });
});

describe("scaleTiers", () => {
  it("leaves the bands alone at full ratio", () => {
    const t = scaleTiers(STIPEND_POLICY.deductionTiers, 1);
    expect(t.map((x) => x.fromMin)).toEqual([500, 800, 1800]);
  });

  it("halves the bands at half a month", () => {
    const t = scaleTiers(STIPEND_POLICY.deductionTiers, 0.5);
    expect(t.map((x) => x.fromMin)).toEqual([250, 400, 900]);
    expect(t.map((x) => x.toMin)).toEqual([400, 900, Infinity]);
  });

  it("keeps the open-ended top band open-ended", () => {
    expect(scaleTiers(STIPEND_POLICY.deductionTiers, 0.25)[2].toMin).toBe(Infinity);
    expect(scaleTiers(STIPEND_POLICY.deductionTiers, 0)[2].toMin).toBe(Infinity);
  });
});

describe("tierCharges", () => {
  const TIERS: DeductionTier[] = [
    { fromMin: 500, toMin: 800, nisPer10Min: 5 },
    { fromMin: 800, toMin: 1800, nisPer10Min: 10 },
    { fromMin: 1800, toMin: Infinity, nisPer10Min: 20 },
  ];

  it("charges nothing below the first band", () => {
    expect(tierCharges(400, TIERS).reduce((s, c) => s + c.nis, 0)).toBe(0);
  });

  it("charges nothing exactly on the first band's floor", () => {
    expect(tierCharges(500, TIERS).reduce((s, c) => s + c.nis, 0)).toBe(0);
  });

  it("charges the first band only, while inside it", () => {
    const c = tierCharges(600, TIERS);
    expect(c[0]).toMatchObject({ minutes: 100, units: 10, nis: 50 });
    expect(c[1].nis).toBe(0);
    expect(c[2].nis).toBe(0);
  });

  it("fills the first band and spills into the second", () => {
    const c = tierCharges(1000, TIERS);
    expect(c[0]).toMatchObject({ minutes: 300, units: 30, nis: 150 });
    expect(c[1]).toMatchObject({ minutes: 200, units: 20, nis: 200 });
    expect(c[2].nis).toBe(0);
  });

  it("reaches the open-ended top band", () => {
    const c = tierCharges(2000, TIERS);
    expect(c[0].nis).toBe(150);
    expect(c[1]).toMatchObject({ minutes: 1000, units: 100, nis: 1000 });
    expect(c[2]).toMatchObject({ minutes: 200, units: 20, nis: 400 });
  });

  it("does not charge a part-block inside a band", () => {
    // 509 chargeable minutes is 9 minutes into the first band — not one whole
    // ten-minute block, so nothing comes off.
    expect(tierCharges(509, TIERS)[0]).toMatchObject({ minutes: 9, units: 0, nis: 0 });
  });

  it("does not carry a band's remainder into the next band", () => {
    // 5 minutes left over at the top of band one stay uncharged rather than
    // joining band two's minutes.
    const c = tierCharges(805, TIERS);
    expect(c[0]).toMatchObject({ minutes: 300, units: 30 });
    expect(c[1]).toMatchObject({ minutes: 5, units: 0, nis: 0 });
  });
});

// ============================================================================
// §9 — the rates themselves
// ============================================================================

describe("the §9 rates", () => {
  it("are the ones the kollel set", () => {
    // Pinned deliberately. These three figures are the whole deduction, and a
    // silent edit to one of them changes every stipend the app reports.
    expect(STIPEND_POLICY.deductionTiers).toEqual([
      { fromMin: 500, toMin: 800, nisPer10Min: 2 },
      { fromMin: 800, toMin: 1800, nisPer10Min: 3 },
      { fromMin: 1800, toMin: Infinity, nisPer10Min: 5 },
    ]);
  });

  it("takes nothing off a month inside the free allowance", () => {
    // Two full absences from seder א׳ — 480 minutes, under the 500 line.
    const r = run({ entries: [1, 2].map((d) => entry({ date: july(d), absent: true })) });
    expect(r.missing.chargeable).toBe(480);
    expect(r.deductionNis).toBe(0);
  });

  it("charges the first band once the month passes the line", () => {
    // Three full absences — 720 minutes, 220 of them inside band one.
    const r = run({ entries: [1, 2, 3].map((d) => entry({ date: july(d), absent: true })) });
    expect(r.missing.chargeable).toBe(720);
    expect(r.charges[0]).toMatchObject({ minutes: 220, units: 22, nis: 44 });
    expect(r.deductionNis).toBe(44);
  });

  it("reaches the second band on a worse month", () => {
    // Five full absences — 1200 minutes: 300 in band one, 400 in band two.
    const r = run({ entries: [1, 2, 3, 4, 5].map((d) => entry({ date: july(d), absent: true })) });
    expect(r.missing.chargeable).toBe(1200);
    expect(r.charges[0].nis).toBe(60);    // 30 × 2 ₪
    expect(r.charges[1].nis).toBe(120);   // 40 × 3 ₪
    expect(r.deductionNis).toBe(180);
  });

  it("takes the deduction off the stipend itself", () => {
    const r = run({ entries: [1, 2, 3].map((d) => entry({ date: july(d), absent: true })) });
    // 2000 base − 44 deduction, no bonus (720 minutes is over the 500 line)
    // and nothing else earned.
    expect(r.totalNis).toBe(1956);
  });
});

// ============================================================================
// The stipend
// ============================================================================

describe("calcStipend — the base", () => {
  it("starts from 2,000 ₪ with nothing recorded, plus the low-shortfall bonus", () => {
    const r = run({});
    expect(r.totalNis).toBe(STIPEND_POLICY.baseNis + STIPEND_POLICY.shortfallBonusNis);
  });

  it("does not scale the base down in a short month", () => {
    const r = run({ sessionDays: 8, fullMonthDays: 22 });
    expect(r.lines.find((l) => l.id === "base")!.nis).toBe(2000);
  });

  it("never reports a negative stipend", () => {
    expect(run({}).totalNis).toBeGreaterThanOrEqual(0);
  });
});

describe("calcStipend — §1/§2, the 500-minute line", () => {
  it("pays the 150 ₪ bonus for a month under the line", () => {
    const r = run({ entries: [late(july(1), 30), late(july(2), 20)] });
    expect(r.missing.total).toBe(50);
    expect(r.shortfallBonusNis).toBe(150);
  });

  it("withholds it once the line is reached", () => {
    // Three full absences from seder א׳ — 720 minutes.
    const r = run({ entries: [1, 2, 3].map((d) => entry({ date: july(d), absent: true })) });
    expect(r.missing.total).toBe(720);
    expect(r.shortfallBonusNis).toBe(0);
  });

  it("counts excused minutes towards the bonus test", () => {
    // 720 minutes missed, every one of them excused. The deduction ignores
    // them; the bonus does not.
    const r = run({
      entries: [1, 2, 3].map((d) => entry({ date: july(d), absent: true, excusedAll: true })),
    });
    expect(r.missing.net).toBe(0);
    expect(r.shortfallBonusNis).toBe(0);
  });

  it("prorates the 150 ₪ bonus itself in a partial month", () => {
    const r = run({
      entries: [late(july(1), 30)],
      sessionDays: 11,
      fullMonthDays: 22,
    });
    expect(r.shortfallBonusNis).toBe(75);   // round(150 × 11/22)
  });
});

describe("calcStipend — §3, excused minutes", () => {
  it("charges nothing for excused minutes under the ceiling", () => {
    // Two full absences = 480 excused minutes, under 600.
    const r = run({
      entries: [1, 2].map((d) => entry({ date: july(d), absent: true, excusedAll: true })),
    });
    expect(r.missing.excused).toBe(480);
    expect(r.missing.excusedCharged).toBe(0);
    expect(r.missing.chargeable).toBe(0);
  });

  it("treats the excess over the ceiling as ordinary missing minutes", () => {
    // Three full absences = 720 excused; 120 of them are past the ceiling.
    const r = run({
      entries: [1, 2, 3].map((d) => entry({ date: july(d), absent: true, excusedAll: true })),
    });
    expect(r.missing.excused).toBe(720);
    expect(r.missing.excusedCharged).toBe(120);
    expect(r.missing.chargeable).toBe(120);
  });

  it("adds the excess on top of the ordinary missing minutes", () => {
    const r = run({
      entries: [
        ...[1, 2, 3].map((d) => entry({ date: july(d), absent: true, excusedAll: true })),
        late(july(4), 45),
      ],
    });
    expect(r.missing.net).toBe(45);
    expect(r.missing.chargeable).toBe(165);
  });

  it("scales the ceiling down in a short month", () => {
    const r = run({
      entries: [1, 2].map((d) => entry({ date: july(d), absent: true, excusedAll: true })),
      sessionDays: 11,
      fullMonthDays: 22,
    });
    expect(r.scaled.excusedFreeMin).toBe(300);
    expect(r.missing.excusedCharged).toBe(180);   // 480 − 300
  });
});

describe("calcStipend — prior approval from the Rosh Kollel", () => {
  /** Enough excused minutes to land 480 past the 600-minute ceiling. */
  const wellOverCeiling = () =>
    [1, 2, 3, 4, 5].map((d) => entry({ date: july(d), absent: true, excusedAll: true }));

  it("charges the excess over the ceiling without an approval", () => {
    const r = run({ entries: wellOverCeiling() });
    expect(r.missing.excused).toBe(1200);
    expect(r.missing.excusedCharged).toBe(600);
    expect(r.missing.excusedWaived).toBe(0);
  });

  it("waives the ceiling entirely with one", () => {
    const r = run({ entries: wellOverCeiling(), priorApproval: true });
    expect(r.missing.excused).toBe(1200);
    expect(r.missing.excusedCharged).toBe(0);
    expect(r.missing.excusedWaived).toBe(600);
    expect(r.missing.chargeable).toBe(0);
    expect(r.deductionNis).toBe(0);
  });

  it("still charges minutes that were never excused", () => {
    // The approval covers §3's ceiling, not attendance itself: 720 ordinary
    // missing minutes are charged with or without it.
    const r = run({
      entries: [
        ...wellOverCeiling(),
        ...[6, 7, 8].map((d) => entry({ date: july(d), absent: true })),
      ],
      priorApproval: true,
    });
    expect(r.missing.net).toBe(720);
    expect(r.missing.chargeable).toBe(720);
    expect(r.deductionNis).toBe(44);
  });

  it("does not change a month that never reached the ceiling", () => {
    const entries = [1, 2].map((d) => entry({ date: july(d), absent: true, excusedAll: true }));
    expect(run({ entries, priorApproval: true })).toEqual(run({ entries }));
  });

  it("leaves the §2 bonus test alone — it counts excused minutes regardless", () => {
    const r = run({ entries: wellOverCeiling(), priorApproval: true });
    expect(r.missing.total).toBe(1200);
    expect(r.shortfallBonusNis).toBe(0);
  });
});

describe("calcStipend — §4, אוהבי ה׳", () => {
  it("pays 20 ₪ for each qualifying seder", () => {
    const r = run({
      entries: [1, 2, 3].map((d) =>
        entry({ date: july(d), arrival: DEFAULT_SETTINGS.seder.s1Start, departure: s1End, ohevei: true })),
    });
    expect(r.oheveiCount).toBe(3);
    expect(r.oheveiNis).toBe(60);
  });

  it("pays nothing for a seder marked אוהבי ה׳ that does not qualify", () => {
    const r = run({ entries: [entry({ date: july(1), arrival: "09:30", departure: s1End, ohevei: true })] });
    expect(r.oheveiCount).toBe(0);
    expect(r.oheveiNis).toBe(0);
  });
});

describe("calcStipend — §5, חבורת ש\"ס", () => {
  it("pays 5 ₪ for each arrival by the deadline, for a member", () => {
    const r = run({ entries: [shas(july(1)), shas(july(2)), shas(july(3))], shasChavura: true });
    expect(r.shasCount).toBe(3);
    expect(r.shasNis).toBe(15);
  });

  it("pays nothing to someone who is not in the חבורה", () => {
    const r = run({ entries: [shas(july(1)), shas(july(2))], shasChavura: false });
    expect(r.shasCount).toBe(0);
    expect(r.shasNis).toBe(0);
  });

  it("leaves the line out of the breakdown entirely for a non-member", () => {
    expect(run({ entries: [shas(july(1))] }).lines.some((l) => l.id === "shas")).toBe(false);
    expect(run({ entries: [shas(july(1))], shasChavura: true }).lines.some((l) => l.id === "shas")).toBe(true);
  });

  it("does not count a seder ב׳ arrived at after the deadline", () => {
    const r = run({
      entries: [entry({ date: july(1), seder: 2, arrival: hhmm(s2StartMin), departure: s2End })],
      shasChavura: true,
    });
    expect(r.shasCount).toBe(0);
  });
});

describe("calcStipend — §6/§7/§8, the learning frameworks", () => {
  const erevDays = (days: number, minutes = 60) =>
    Array.from({ length: days }, (_, i) => lesson({ date: july(i + 1), minutes }));

  it("pays 18 ₪ an hour for כולל ערב once the 10-hour minimum is met", () => {
    const r = run({ lessons: erevDays(10) });
    expect(r.learning.kollelErevCountedMin).toBe(600);
    expect(r.learning.kollelErevBelowMinimum).toBe(false);
    expect(r.learning.kollelErevNis).toBe(180);
  });

  it("pays nothing for כולל ערב below the minimum", () => {
    const r = run({ lessons: erevDays(9) });
    expect(r.learning.kollelErevCountedMin).toBe(540);
    expect(r.learning.kollelErevBelowMinimum).toBe(true);
    expect(r.learning.kollelErevNis).toBe(0);
  });

  it("caps כולל ערב at 90 minutes a day", () => {
    const r = run({ lessons: erevDays(10, 120) });
    expect(r.learning.kollelErevRawMin).toBe(1200);
    expect(r.learning.kollelErevCountedMin).toBe(900);
    expect(r.learning.kollelErevDaysOverCap).toBe(10);
  });

  it("applies the daily cap to the day's total, not to each record", () => {
    const r = run({
      lessons: [
        lesson({ date: july(1), minutes: 60 }),
        lesson({ date: july(1), minutes: 60 }),
      ],
    });
    expect(r.learning.kollelErevRawMin).toBe(120);
    expect(r.learning.kollelErevCountedMin).toBe(90);
  });

  it("counts תענית דיבור double, and then caps it", () => {
    const r = run({ lessons: [lesson({ date: july(1), minutes: 60, tanitDibur: true })] });
    expect(r.learning.kollelErevRawMin).toBe(120);
    expect(r.learning.kollelErevCountedMin).toBe(90);
  });

  it("pays 25 ₪ an hour for תורתו בידו, with no minimum", () => {
    const r = run({ lessons: [lesson({ framework: "torato-beyado", date: july(1), minutes: 60 })] });
    expect(r.learning.toratoCountedMin).toBe(60);
    expect(r.learning.toratoNis).toBe(25);
  });

  it("caps תורתו בידו at 20 hours a month", () => {
    const r = run({
      lessons: Array.from({ length: 20 }, (_, i) =>
        lesson({ framework: "torato-beyado", date: july(i + 1), minutes: 75 })),
    });
    expect(r.learning.toratoRawMin).toBe(1500);
    expect(r.learning.toratoCountedMin).toBe(1200);
    expect(r.learning.toratoCapped).toBe(true);
    expect(r.learning.toratoNis).toBe(500);
  });

  it("has no daily cap on תורתו בידו — only the monthly one", () => {
    const r = run({ lessons: [lesson({ framework: "torato-beyado", date: july(1), minutes: 300 })] });
    expect(r.learning.toratoCountedMin).toBe(300);
  });

  it("ignores ישיבת בין הזמנים, which carries no stipend", () => {
    const r = run({ lessons: [lesson({ framework: "bein-hazmanim", date: july(1), minutes: 600 })] });
    expect(r.learning.kollelErevCountedMin).toBe(0);
    expect(r.learning.toratoCountedMin).toBe(0);
  });
});

// ============================================================================
// Scope and totals
// ============================================================================

describe("calcStipend — the month it is asked about", () => {
  it("ignores rows from other months", () => {
    const r = run({
      entries: [late(july(1), 30), late("2026-06-15", 200), late("2026-08-02", 200)],
      lessons: [lesson({ date: "2026-06-10" }), lesson({ date: july(2) })],
    });
    expect(r.missing.total).toBe(30);
    expect(r.learning.kollelErevRawMin).toBe(60);
  });

  it("adds the lines up to the reported total", () => {
    const r = run({
      entries: [
        ...[1, 2, 3].map((d) =>
          entry({ date: july(d), arrival: DEFAULT_SETTINGS.seder.s1Start, departure: s1End, ohevei: true })),
        shas(july(4)),
      ],
      lessons: Array.from({ length: 10 }, (_, i) => lesson({ date: july(i + 1) })),
      shasChavura: true,
    });
    expect(r.lines.reduce((s, l) => s + l.nis, 0)).toBe(r.totalNis);
    // 2000 base + 150 low shortfall + 60 אוהבי ה׳ + 5 ש"ס + 180 כולל ערב
    expect(r.totalNis).toBe(2395);
  });

  it("reports the day counts it scaled by", () => {
    const r = run({ sessionDays: 12, fullMonthDays: 22 });
    expect(r.sessionDays).toBe(12);
    expect(r.fullMonthDays).toBe(22);
    expect(r.ratio).toBeCloseTo(12 / 22);
    expect(r.scaled.freeMissingMin).toBe(273);   // round(500 × 12/22)
  });

  it("derives the day counts from the calendar when it is not told them", () => {
    const r = calcStipend({ monthKey: "2026-07", entries: [], lessons: [], shasChavura: false });
    // Every Sunday-to-Thursday in July 2026 — a plain count of the calendar,
    // asserted here without going through the module under test.
    expect(r.fullMonthDays).toBe(22);
    // Yom Tov and Bein HaZmanim can only take days away, never add them.
    expect(r.sessionDays).toBeLessThanOrEqual(r.fullMonthDays);
    expect(r.sessionDays).toBeGreaterThan(0);
    expect(r.ratio).toBeCloseTo(r.sessionDays / r.fullMonthDays);
  });

  it("scales nothing in a month the kollel sits in full", () => {
    // February 2026 holds no Yom Tov and no Bein HaZmanim at all, so the two
    // counts have to agree and the thresholds stay at their written values.
    const r = calcStipend({ monthKey: "2026-02", entries: [], lessons: [], shasChavura: false });
    expect(r.sessionDays).toBe(r.fullMonthDays);
    expect(r.ratio).toBe(1);
    expect(r.scaled.freeMissingMin).toBe(STIPEND_POLICY.freeMissingMin);
    expect(r.scaled.excusedFreeMin).toBe(STIPEND_POLICY.excusedFreeMin);
  });
});
