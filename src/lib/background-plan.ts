// The timetable SederPlusAgent.exe works from.
//
// The agent has no Hebrew calendar, no seder schedule and no idea what the
// user's arrival habit is — and it should not, because all three already
// exist here, tested, and a second implementation in Rust would drift from
// this one within a release or two. So this works out the answer in advance:
// for every day in the next year, the minute of the day at which each seder's
// reminder falls due, and whether the day is one the app must stay silent on
// altogether. The agent compares a clock against those numbers.
//
// The plan is regenerated whenever a window is open — on launch and once an
// hour — and only written when it actually differs from what is already in
// the file, so an idle app is not writing a file the other EXE is polling.
//
// See src-tauri/shared/src/plan.rs, which reads it.

import { useEffect } from "react";

import { sharedValue } from "./shared-state";
import { getSettings, getSederTimesFor } from "./settings-store";
import { hhmmToMin, getSederSnapshot } from "./kollel-store";
import { isBeinHazmanim, isLearningDay, hasNoSederB } from "./hebrew-calendar";
import { averageArrivalOffsetMin, weakestLearningWeekday } from "./insights";
import { graceMinutes } from "./notifications";
import { REPORT_REMINDER_MINUTE } from "./phone-report";

/** Bumped only when the shape changes; an agent that meets a version it does
 *  not know stays silent. Matches PLAN_VERSION in shared/src/plan.rs. */
export const PLAN_VERSION = 1;

/**
 * How far ahead the plan reaches.
 *
 * A year and a week. The point is not that anyone leaves the app closed that
 * long — it is that the agent must never be the reason a reminder is missed,
 * and a plan that runs out is the one failure mode it cannot work around. At
 * roughly 40 bytes a day this costs about 15KB in the data file.
 */
export const PLAN_HORIZON_DAYS = 372;

/** Entries to measure the arrival habit off — the same window notifications.ts uses. */
const HABIT_WINDOW = 60;

export type PlanDay = {
  /** Minute of the day the seder א׳ reminder falls due. Absent = never today. */
  r1?: number;
  r2?: number;
  /** Shabbat or Yom Tov: the agent says nothing at all, about anything. */
  q?: boolean;
};

export type BackgroundPlan = {
  v: number;
  /** Minute of the day the phone-system reminder is raised at. */
  phoneAt: number;
  days: Record<string, PlanDay>;
};

const EMPTY_PLAN: BackgroundPlan = { v: PLAN_VERSION, phoneAt: REPORT_REMINDER_MINUTE, days: {} };

const store = sharedValue<BackgroundPlan>({
  key: "backgroundPlan",
  fallback: EMPTY_PLAN,
  parse: (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_PLAN;
    const plan = raw as Partial<BackgroundPlan>;
    return {
      v: typeof plan.v === "number" ? plan.v : 0,
      phoneAt: typeof plan.phoneAt === "number" ? plan.phoneAt : REPORT_REMINDER_MINUTE,
      days: plan.days && typeof plan.days === "object" ? plan.days : {},
    };
  },
});

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type PlanInputs = {
  /** Mean minutes between a seder starting and the user arriving; +ve is late. */
  avgArrivalOffsetMin: number | null;
  /** The weekday (0 = Sunday) most sedarim come out short on, if there is one. */
  weakWeekday: number | null;
  /** Off restores the fixed rule: the reminder falls due as the seder begins. */
  adaptive: boolean;
};

/**
 * The plan, for `days` days starting today.
 *
 * Pure, so the rules can be checked against a fixed date without a data file.
 * `timesFor` is passed in for the same reason.
 */
export function buildPlan(
  from: Date,
  inputs: PlanInputs,
  timesFor: (dateISO: string) => { s1Start: string; s2Start: string } = getSederTimesFor,
  days = PLAN_HORIZON_DAYS,
): BackgroundPlan {
  const plan: BackgroundPlan = { v: PLAN_VERSION, phoneAt: REPORT_REMINDER_MINUTE, days: {} };

  for (let i = 0; i < days; i++) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const iso = isoOf(date);

    // Not a day the kollel sits: nothing is owed and nothing is chased — and
    // for Friday and Shabbat, a toast at 20:00 would land in the middle of
    // Shabbat, so even the phone-system reminder waits.
    if (!isLearningDay(date)) {
      plan.days[iso] = { q: true };
      continue;
    }

    // Bein hazmanim has no sedarim to record — the stipend calculation counts
    // it out for exactly that reason (kollelSessionDaysInMonth) — so there is
    // nothing to chase. The report reminder still runs: last month happened.
    if (isBeinHazmanim(date)) {
      plan.days[iso] = {};
      continue;
    }

    const times = timesFor(iso);
    const onWeakDay = inputs.adaptive && inputs.weakWeekday === date.getDay();
    const grace = inputs.adaptive ? graceMinutes(inputs.avgArrivalOffsetMin, onWeakDay) : 0;

    const day: PlanDay = {};
    const s1 = hhmmToMin(times.s1Start);
    if (s1 !== null) day.r1 = s1 + grace;
    // A fast day has no seder ב׳ at all.
    if (!hasNoSederB(date)) {
      const s2 = hhmmToMin(times.s2Start);
      if (s2 !== null) day.r2 = s2 + grace;
    }
    plan.days[iso] = day;
  }

  return plan;
}

/** The habit figures the plan is built from, read off the current data. */
export function currentPlanInputs(): PlanInputs {
  const entries = getSederSnapshot();
  const weak = weakestLearningWeekday(entries);
  return {
    avgArrivalOffsetMin: averageArrivalOffsetMin(entries.slice(0, HABIT_WINDOW)),
    weakWeekday: weak ? weak.day : null,
    adaptive: getSettings().notifications.adaptive,
  };
}

/**
 * Writes the plan if it has moved.
 *
 * Called on launch, once an hour, and the moment the background switch is
 * turned on — that last one is why it is exported: without it, switching the
 * feature on would do nothing until the next launch.
 */
export function refreshBackgroundPlan(now = new Date()): void {
  if (!getSettings().background.enabled) return;
  const next = buildPlan(now, currentPlanInputs());
  // The days shift by one every midnight, so this does write once a day.
  if (JSON.stringify(next) === JSON.stringify(store.get())) return;
  store.set(next);
}

/** Removes the plan. Nothing reads it once the agent is off, and 15KB of dead
 *  timetable in the data file would outlive the feature being switched off. */
export function clearBackgroundPlan(): void {
  if (store.get().days && Object.keys(store.get().days).length === 0) return;
  store.set(EMPTY_PLAN);
}

const REFRESH_MS = 60 * 60 * 1000;

/** Keeps the plan current while a window is open. */
export function useBackgroundPlan() {
  useEffect(() => {
    // Late enough that the shared file has hydrated — before that this would
    // build a plan from empty settings and write it over the real one.
    const first = setTimeout(() => refreshBackgroundPlan(), 9000);
    const timer = setInterval(() => refreshBackgroundPlan(), REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
}
