/* eslint-disable @typescript-eslint/no-explicit-any */
// Same rows, same "now", two releases: every figure the app derives must come
// out the same as in v7 (the tag of the previous release). v7-golden.json was
// produced by running fixtures.ts against v7's own code; here the current code
// runs the same fixtures and is compared figure by figure.
//
// A difference is not automatically a bug — a fix to a calculation changes a
// figure on purpose — but it must be deliberate. If this fails, find out which
// figure moved and why before regenerating the golden (see fixtures.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import golden from "./v7-golden.json";
import { PARITY_NOW, buildFixtures, computeAll, monthKeys } from "./fixtures";
import * as store from "../kollel-store";
import * as stipend from "../stipend";

const api = {
  calcSeder: store.calcSeder,
  summarizeEntries: store.summarizeEntries,
  scoreEntries: store.scoreEntries,
  monthClosing: store.monthClosing,
  effectiveLearningMin: store.effectiveLearningMin,
  calcStipend: stipend.calcStipend,
};

/** The first path at which two JSON values differ, for a readable failure. */
function firstDifference(a: unknown, b: unknown, path = ""): string | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) {
      const d = firstDifference((a as any)[k], (b as any)[k], `${path}/${k}`);
      if (d) return d;
    }
  }
  return `${path}: v7=${JSON.stringify(a)} now=${JSON.stringify(b)}`;
}

describe("figures against v7, on the same rows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(PARITY_NOW));
  });
  afterEach(() => vi.useRealTimers());

  const fx = buildFixtures();
  const now = computeAll(api, fx);

  it("covers a meaningful body of data", () => {
    expect(fx.entries.length).toBeGreaterThan(300);
    expect(fx.lessons.length).toBeGreaterThan(100);
    expect(monthKeys()).toHaveLength(8);
  });

  it("exercises every kind of figure, so an equal result means something", () => {
    const rows = Object.values(golden.perEntry) as any[];
    for (const flag of ["isLate", "isEarlyDeparture", "isOhevei", "isShasArrival"]) {
      expect(rows.some((x) => x[flag])).toBe(true);
    }
    expect(rows.some((x) => x.bonusMin > 0)).toBe(true);
    expect(rows.some((x) => x.excusedMin > 0)).toBe(true);
    expect(rows.some((x) => x.netMissingMin === 0)).toBe(true);
    const totals = Object.values(golden.perMonth).flatMap((m: any) =>
      Object.values(m.stipend).map((s: any) => s.totalNis),
    );
    expect(new Set(totals).size).toBeGreaterThan(8);
  });

  it("calcSeder is identical for every row (missing, excused, bonus, ohevei, manual…)", () => {
    expect(firstDifference(golden.perEntry, now.perEntry)).toBeNull();
  });

  it("effective learning minutes are identical for every lesson (tanit dibur doubled)", () => {
    expect(firstDifference(golden.perLesson, now.perLesson)).toBeNull();
  });

  for (const key of monthKeys()) {
    it(`${key}: summary, score and closing are identical`, () => {
      const g = golden.perMonth[key as keyof typeof golden.perMonth] as any;
      const n = now.perMonth[key];
      expect(firstDifference(g.summary, n.summary)).toBeNull();
      expect(firstDifference(g.score, n.score)).toBeNull();
      expect(firstDifference(g.closing, n.closing)).toBeNull();
    });
    it(`${key}: the stipend is identical for every shas/approval combination`, () => {
      const g = golden.perMonth[key as keyof typeof golden.perMonth] as any;
      expect(firstDifference(g.stipend, now.perMonth[key].stipend)).toBeNull();
    });
  }
});
