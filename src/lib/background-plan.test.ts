import { describe, it, expect } from "vitest";

import { buildPlan, PLAN_HORIZON_DAYS, PLAN_VERSION, type PlanInputs } from "./background-plan";
import { BASE_GRACE_MIN } from "./notifications";
import { isBeinHazmanim, isFastDay, isLearningDay } from "./hebrew-calendar";
import { REPORT_REMINDER_MINUTE } from "./phone-report";

const TIMES = { s1Start: "09:00", s2Start: "15:45" };
const S1 = 9 * 60;
const S2 = 15 * 60 + 45;

const FIXED: PlanInputs = { avgArrivalOffsetMin: null, weakWeekday: null, adaptive: false };

function plan(from: Date, inputs: Partial<PlanInputs> = {}, days = 40) {
  return buildPlan(from, { ...FIXED, ...inputs }, () => TIMES, days);
}

/** The first day in the plan that satisfies a predicate. */
function firstDay(from: Date, days: number, match: (d: Date) => boolean): string {
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    if (match(d))
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  throw new Error("no such day inside the window");
}

// Wednesday 8 July 2026 — an ordinary learning day.
const WEDNESDAY = new Date(2026, 6, 8);

describe("the shape of a plan", () => {
  it("is stamped with the version the agent checks", () => {
    expect(plan(WEDNESDAY).v).toBe(PLAN_VERSION);
  });

  it("carries the hour the phone-system reminder is raised at", () => {
    expect(plan(WEDNESDAY).phoneAt).toBe(REPORT_REMINDER_MINUTE);
  });

  it("covers every day of the horizon, with none missing", () => {
    const full = buildPlan(WEDNESDAY, FIXED, () => TIMES);
    expect(Object.keys(full.days)).toHaveLength(PLAN_HORIZON_DAYS);
    // Today is in it — an agent starting now must find a row for today.
    expect(full.days["2026-07-08"]).toBeDefined();
  });
});

describe("a day the kollel sits", () => {
  it("falls due as each seder begins, when the adaptive layer is off", () => {
    expect(plan(WEDNESDAY).days["2026-07-08"]).toEqual({ r1: S1, r2: S2 });
  });

  it("waits out the habit when it is on", () => {
    const day = plan(WEDNESDAY, { adaptive: true, avgArrivalOffsetMin: 10 }).days["2026-07-08"];
    expect(day.r1).toBe(S1 + BASE_GRACE_MIN + 10);
    expect(day.r2).toBe(S2 + BASE_GRACE_MIN + 10);
  });

  it("comes earlier on the weekday most sedarim come out short on", () => {
    const weak = plan(WEDNESDAY, {
      adaptive: true,
      avgArrivalOffsetMin: 10,
      weakWeekday: WEDNESDAY.getDay(),
    }).days["2026-07-08"];
    expect(weak.r1).toBe(S1 + Math.round((BASE_GRACE_MIN + 10) / 2));
  });

  it("is not quiet", () => {
    expect(plan(WEDNESDAY).days["2026-07-08"].q).toBeUndefined();
  });
});

describe("days nothing is said on", () => {
  it("marks Friday and Shabbat quiet, so nothing lands over Shabbat", () => {
    // 10 July 2026 is a Friday; the 11th is Shabbat.
    expect(plan(WEDNESDAY).days["2026-07-10"]).toEqual({ q: true });
    expect(plan(WEDNESDAY).days["2026-07-11"]).toEqual({ q: true });
  });

  it("marks Yom Tov quiet", () => {
    const yomTov = firstDay(new Date(2026, 8, 1), 60, (d) => !isLearningDay(d) && d.getDay() < 5);
    expect(plan(new Date(2026, 8, 1), {}, 60).days[yomTov]).toEqual({ q: true });
  });

  it("chases no seder during bein hazmanim, but is not quiet — the report still stands", () => {
    const from = new Date(2026, 8, 1);
    const day = firstDay(from, 60, (d) => isLearningDay(d) && isBeinHazmanim(d));
    expect(plan(from, {}, 60).days[day]).toEqual({});
  });

  it("does not chase a seder ב׳ on a fast day, when there is none", () => {
    const from = new Date(2026, 0, 1);
    const fast = firstDay(from, 340, (d) => isLearningDay(d) && !isBeinHazmanim(d) && isFastDay(d));
    const day = buildPlan(from, FIXED, () => TIMES, 340).days[fast];
    expect(day.r1).toBe(S1);
    expect(day.r2).toBeUndefined();
  });
});

describe("the seder hours in force", () => {
  it("are asked for per day, so a change from a date onwards is respected", () => {
    const asked: string[] = [];
    const p = buildPlan(
      WEDNESDAY,
      FIXED,
      (iso) => {
        asked.push(iso);
        return iso >= "2026-07-13" ? { s1Start: "10:00", s2Start: "16:00" } : TIMES;
      },
      10,
    );
    expect(p.days["2026-07-08"].r1).toBe(S1);
    expect(p.days["2026-07-13"].r1).toBe(10 * 60);
    // Only for days that have sedarim — a quiet day asks nothing.
    expect(asked).not.toContain("2026-07-11");
  });
});
