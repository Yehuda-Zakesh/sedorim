// The reminder rules. These decide when the app is allowed to interrupt the
// user, so each guard is pinned down here rather than left to be discovered in
// production by being nagged at 06:00 on a Shabbos.
import { describe, it, expect } from "vitest";
import {
  dueNotifications,
  decideNotifications,
  isoWeekKey,
  graceMinutes,
  BASE_GRACE_MIN,
  MAX_GRACE_MIN,
  type ReminderFacts,
} from "./notifications";
import { EMPTY_MEMORY, IGNORE_THRESHOLD } from "./notification-learning";

const ALL_ON = {
  dailyReminder: true,
  latenessAlert: true,
  weeklySummary: true,
  forecastWarning: true,
  phoneReport: true,
};

/**
 * A weekday mid-morning, seder 1 already started, nothing due.
 *
 * `adaptive` is off here on purpose: these are the fixed rules, and they are
 * worth pinning down on their own. The layer that bends them has its own
 * blocks further down, which switch it on explicitly.
 */
function facts(over: Partial<ReminderFacts> = {}): ReminderFacts {
  return {
    now: new Date(2026, 6, 8, 10, 0), // Wed 8 July 2026, 10:00
    isLearningDay: true,
    seder1StartMin: 9 * 60,
    hasEntryToday: true,
    lateCountThisMonth: 0,
    maxLatePerMonth: 3,
    lastWeek: { entries: 0, netMissing: 0, oheveiCount: 0 },
    enabled: ALL_ON,
    // July 2026: the report reminder is about June, and the 8th is past its
    // window anyway, so it stays out of the way of every other rule here.
    reportMonth: "2026-06",
    reportDone: false,
    anyChannelOn: true,
    sent: {},
    adaptive: false,
    avgArrivalOffsetMin: null,
    weakWeekday: null,
    forecastNetMissing: null,
    netMissingThisMonth: 0,
    alertMissingMinPerMonth: 180,
    learning: {},
    satisfiedPending: {},
    ...over,
  };
}

const kinds = (f: ReminderFacts) => dueNotifications(f).map((n) => n.kind);

describe("isoWeekKey", () => {
  it("numbers a mid-year week", () => {
    expect(isoWeekKey(new Date(2026, 6, 8))).toBe("2026-W28");
  });

  it("gives every day of one week the same key", () => {
    // Mon 6 July through Sun 12 July 2026.
    const keys = new Set(Array.from({ length: 7 }, (_, i) => isoWeekKey(new Date(2026, 6, 6 + i))));
    expect(keys.size).toBe(1);
  });

  it("starts a new key on Monday", () => {
    expect(isoWeekKey(new Date(2026, 6, 12))).not.toBe(isoWeekKey(new Date(2026, 6, 13)));
  });

  it("puts an early-January day in the previous year's last week", () => {
    // 1 Jan 2027 is a Friday, so it belongs to ISO week 53 of 2026.
    expect(isoWeekKey(new Date(2027, 0, 1))).toBe("2026-W53");
  });
});

describe("daily reminder", () => {
  it("fires when nothing is logged and seder 1 has begun", () => {
    expect(kinds(facts({ hasEntryToday: false }))).toContain("daily-reminder");
  });

  it("stays quiet once something is logged", () => {
    expect(kinds(facts({ hasEntryToday: true }))).not.toContain("daily-reminder");
  });

  it("stays quiet before seder 1 starts", () => {
    // 07:30, an hour and a half before the seder — nothing to remind about yet.
    const f = facts({ hasEntryToday: false, now: new Date(2026, 6, 8, 7, 30) });
    expect(kinds(f)).not.toContain("daily-reminder");
  });

  it("fires exactly at the start of seder 1", () => {
    const f = facts({ hasEntryToday: false, now: new Date(2026, 6, 8, 9, 0) });
    expect(kinds(f)).toContain("daily-reminder");
  });

  it("stays quiet on a day the kollel is not sitting", () => {
    const f = facts({ hasEntryToday: false, isLearningDay: false });
    expect(kinds(f)).not.toContain("daily-reminder");
  });

  it("does not repeat once it has been sent today", () => {
    const f = facts({ hasEntryToday: false, sent: { "daily-reminder": "2026-07-08" } });
    expect(kinds(f)).not.toContain("daily-reminder");
  });

  it("fires again the next day", () => {
    const f = facts({ hasEntryToday: false, sent: { "daily-reminder": "2026-07-07" } });
    expect(kinds(f)).toContain("daily-reminder");
  });

  it("respects the switch being off", () => {
    const f = facts({ hasEntryToday: false, enabled: { ...ALL_ON, dailyReminder: false } });
    expect(kinds(f)).not.toContain("daily-reminder");
  });
});

describe("lateness alert", () => {
  it("fires on reaching the monthly quota", () => {
    expect(kinds(facts({ lateCountThisMonth: 3, maxLatePerMonth: 3 }))).toContain("lateness-alert");
  });

  it("stays quiet below the quota", () => {
    expect(kinds(facts({ lateCountThisMonth: 2, maxLatePerMonth: 3 }))).not.toContain(
      "lateness-alert",
    );
  });

  it("does not repeat within the same month", () => {
    const f = facts({ lateCountThisMonth: 5, sent: { "lateness-alert": "2026-07" } });
    expect(kinds(f)).not.toContain("lateness-alert");
  });

  it("fires again in a new month", () => {
    const f = facts({ lateCountThisMonth: 5, sent: { "lateness-alert": "2026-06" } });
    expect(kinds(f)).toContain("lateness-alert");
  });

  it("stays quiet when the quota is zero rather than firing forever", () => {
    // maxLatePerMonth 0 would otherwise be satisfied by any count at all,
    // including none, and toast on the first day of every month.
    const f = facts({ lateCountThisMonth: 0, maxLatePerMonth: 0 });
    expect(kinds(f)).not.toContain("lateness-alert");
  });

  it("names both numbers in the body", () => {
    const [n] = dueNotifications(facts({ lateCountThisMonth: 4, maxLatePerMonth: 3 })).filter(
      (x) => x.kind === "lateness-alert",
    );
    expect(n.body).toContain("4");
    expect(n.body).toContain("3");
  });
});

describe("weekly summary", () => {
  it("fires once a new week starts", () => {
    const f = facts({ lastWeek: { entries: 8, netMissing: 45, oheveiCount: 2 } });
    expect(kinds(f)).toContain("weekly-summary");
  });

  it("does not repeat within the same week", () => {
    const f = facts({
      lastWeek: { entries: 8, netMissing: 45, oheveiCount: 2 },
      sent: { "weekly-summary": "2026-W28" },
    });
    expect(kinds(f)).not.toContain("weekly-summary");
  });

  it("stays quiet when last week had no records at all", () => {
    // A brand-new install has nothing to summarize; an empty digest is noise.
    const f = facts({ lastWeek: { entries: 0, netMissing: 0, oheveiCount: 0 } });
    expect(kinds(f)).not.toContain("weekly-summary");
  });

  it("carries last week's figures", () => {
    const [n] = dueNotifications(
      facts({ lastWeek: { entries: 8, netMissing: 45, oheveiCount: 2 } }),
    ).filter((x) => x.kind === "weekly-summary");
    expect(n.body).toContain("8");
    expect(n.body).toContain("45");
    expect(n.body).toContain("2");
  });
});

describe("all together", () => {
  it("raises nothing when every switch is off", () => {
    const f = facts({
      hasEntryToday: false,
      lateCountThisMonth: 9,
      lastWeek: { entries: 8, netMissing: 45, oheveiCount: 2 },
      enabled: {
        dailyReminder: false,
        latenessAlert: false,
        weeklySummary: false,
        forecastWarning: false,
        phoneReport: false,
      },
    });
    expect(dueNotifications(f)).toEqual([]);
  });

  it("raises nothing when there is no channel to raise it on", () => {
    // Both pop-ups and desktop notifications switched off. A reminder marked
    // "sent" into the void would never be seen at all, so none is produced.
    const f = facts({
      hasEntryToday: false,
      lateCountThisMonth: 9,
      lastWeek: { entries: 8, netMissing: 45, oheveiCount: 2 },
      anyChannelOn: false,
    });
    expect(dueNotifications(f)).toEqual([]);
  });

  it("still raises them with only the in-app channel on", () => {
    const f = facts({
      hasEntryToday: false,
      lateCountThisMonth: 9,
      lastWeek: { entries: 8, netMissing: 45, oheveiCount: 2 },
      anyChannelOn: true,
    });
    expect(kinds(f)).toEqual(["daily-reminder", "lateness-alert", "weekly-summary"]);
  });

  it("can raise all three at once", () => {
    const f = facts({
      hasEntryToday: false,
      lateCountThisMonth: 9,
      lastWeek: { entries: 8, netMissing: 45, oheveiCount: 2 },
    });
    expect(kinds(f)).toEqual(["daily-reminder", "lateness-alert", "weekly-summary"]);
  });

  it("gives every notification a title and a body", () => {
    const f = facts({
      hasEntryToday: false,
      lateCountThisMonth: 9,
      lastWeek: { entries: 8, netMissing: 45, oheveiCount: 2 },
      forecastNetMissing: 400,
      netMissingThisMonth: 60,
    });
    for (const n of dueNotifications(f)) {
      expect(n.title.length, n.kind).toBeGreaterThan(0);
      expect(n.body.length, n.kind).toBeGreaterThan(0);
      expect(n.token.length, n.kind).toBeGreaterThan(0);
    }
  });
});

describe("forecast warning", () => {
  /** On course for 400 missing minutes against a 180 threshold, 60 so far. */
  const heading = (over: Partial<ReminderFacts> = {}) =>
    facts({
      forecastNetMissing: 400,
      netMissingThisMonth: 60,
      alertMissingMinPerMonth: 180,
      ...over,
    });

  it("warns while the month is only heading past the threshold", () => {
    expect(kinds(heading())).toContain("forecast-warning");
  });

  it("stays quiet once the threshold has actually been crossed", () => {
    // No longer a forecast. Saying it here would be news to nobody, and the
    // statistics screen puts it better.
    expect(kinds(heading({ netMissingThisMonth: 200 }))).not.toContain("forecast-warning");
  });

  it("stays quiet when the month is on course to stay under", () => {
    expect(kinds(heading({ forecastNetMissing: 100 }))).not.toContain("forecast-warning");
  });

  it("stays quiet when there is too little of the month to project", () => {
    expect(kinds(heading({ forecastNetMissing: null }))).not.toContain("forecast-warning");
  });

  it("stays quiet when the threshold is switched off with a zero", () => {
    expect(kinds(heading({ alertMissingMinPerMonth: 0 }))).not.toContain("forecast-warning");
  });

  it("does not repeat within the same month", () => {
    expect(kinds(heading({ sent: { "forecast-warning": "2026-07" } }))).not.toContain(
      "forecast-warning",
    );
  });

  it("fires again in a new month", () => {
    expect(kinds(heading({ sent: { "forecast-warning": "2026-06" } }))).toContain(
      "forecast-warning",
    );
  });

  it("respects the switch being off", () => {
    const f = heading({ enabled: { ...ALL_ON, forecastWarning: false } });
    expect(kinds(f)).not.toContain("forecast-warning");
  });
});

describe("graceMinutes", () => {
  it("gives someone who arrives on time the base margin", () => {
    expect(graceMinutes(0, false)).toBe(BASE_GRACE_MIN);
  });

  it("never gives an early arriver less than the base margin", () => {
    expect(graceMinutes(-15, false)).toBe(BASE_GRACE_MIN);
  });

  it("waits out the habit of someone who arrives late", () => {
    expect(graceMinutes(25, false)).toBe(BASE_GRACE_MIN + 25);
  });

  it("caps the wait however late the habit", () => {
    // Otherwise a bad month of half-day arrivals would silence the reminder.
    expect(graceMinutes(600, false)).toBe(MAX_GRACE_MIN);
  });

  it("halves the wait on the weak weekday", () => {
    expect(graceMinutes(40, true)).toBe(Math.round((BASE_GRACE_MIN + 40) / 2));
  });

  it("falls back to the base margin with no record to read", () => {
    expect(graceMinutes(null, false)).toBe(BASE_GRACE_MIN);
  });
});

describe("daily reminder, adapted", () => {
  const unlogged = (over: Partial<ReminderFacts> = {}) =>
    facts({ adaptive: true, hasEntryToday: false, ...over });

  it("holds back through the grace period", () => {
    // 09:10 — ten minutes into a seder that began at 09:00, inside the margin.
    expect(kinds(unlogged({ now: new Date(2026, 6, 8, 9, 10) }))).not.toContain("daily-reminder");
  });

  it("speaks once the grace period is up", () => {
    expect(kinds(unlogged({ now: new Date(2026, 6, 8, 9, 20) }))).toContain("daily-reminder");
  });

  it("waits longer for someone who habitually arrives late", () => {
    // An average arrival 25 minutes in makes the wait 45 minutes.
    const f = unlogged({ avgArrivalOffsetMin: 25, now: new Date(2026, 6, 8, 9, 30) });
    expect(kinds(f)).not.toContain("daily-reminder");
    expect(kinds({ ...f, now: new Date(2026, 6, 8, 9, 45) })).toContain("daily-reminder");
  });

  it("comes sooner on the weakest weekday", () => {
    // 8 July 2026 is a Wednesday — weekday 3.
    expect(kinds(unlogged({ now: new Date(2026, 6, 8, 9, 10), weakWeekday: 3 }))).toContain(
      "daily-reminder",
    );
  });

  it("says which day it is on the weakest weekday", () => {
    const [n] = decideNotifications(
      unlogged({ now: new Date(2026, 6, 8, 9, 15), weakWeekday: 3 }),
    ).due;
    expect(n.body).toContain("רביעי");
  });

  it("ignores a weak weekday that is not today", () => {
    expect(kinds(unlogged({ now: new Date(2026, 6, 8, 9, 10), weakWeekday: 0 }))).not.toContain(
      "daily-reminder",
    );
  });

  it("keeps the fixed behaviour when adaptation is switched off", () => {
    expect(kinds(unlogged({ adaptive: false, now: new Date(2026, 6, 8, 9, 0) }))).toContain(
      "daily-reminder",
    );
  });
});

describe("backing off a reminder nobody answers", () => {
  const unlogged = (over: Partial<ReminderFacts> = {}) =>
    facts({ adaptive: true, hasEntryToday: false, now: new Date(2026, 6, 8, 11, 0), ...over });

  const owing = (cooldown: number, over: Partial<ReminderFacts> = {}) =>
    unlogged({
      learning: {
        "daily-reminder": { ...EMPTY_MEMORY, ignoredStreak: IGNORE_THRESHOLD, cooldown },
      },
      ...over,
    });

  it("silences a kind that owes a period of quiet", () => {
    const d = decideNotifications(owing(1));
    expect(d.due.map((n) => n.kind)).not.toContain("daily-reminder");
    expect(d.silenced).toContain("daily-reminder");
  });

  it("charges one period of quiet, not one per check", () => {
    const first = decideNotifications(owing(2));
    expect(first.learning["daily-reminder"]?.cooldown).toBe(1);
    // The rules re-run every ten minutes; the same morning must not cost more.
    const again = decideNotifications(owing(2, { learning: first.learning }));
    expect(again.learning["daily-reminder"]?.cooldown).toBe(1);
    expect(again.silenced).toContain("daily-reminder");
  });

  it("speaks again once the quiet is paid off", () => {
    expect(kinds(owing(0))).toContain("daily-reminder");
  });

  it("counts a day that went by unrecorded as unanswered", () => {
    const d = decideNotifications(
      unlogged({
        learning: { "daily-reminder": { ...EMPTY_MEMORY, pendingToken: "2026-07-07" } },
        satisfiedPending: { "daily-reminder": false },
      }),
    );
    expect(d.learning["daily-reminder"]?.ignoredStreak).toBe(1);
    expect(d.learning["daily-reminder"]?.pendingToken).toBeUndefined();
  });

  it("leaves today's delivery unjudged — there is still time to act on it", () => {
    const d = decideNotifications(
      unlogged({
        learning: { "daily-reminder": { ...EMPTY_MEMORY, pendingToken: "2026-07-08" } },
        satisfiedPending: { "daily-reminder": false },
      }),
    );
    expect(d.learning["daily-reminder"]?.pendingToken).toBe("2026-07-08");
    expect(d.learning["daily-reminder"]?.ignoredStreak).toBe(0);
  });

  it("lets one answered reminder clear the whole backlog at once", () => {
    const d = decideNotifications(
      unlogged({
        learning: {
          "daily-reminder": {
            ...EMPTY_MEMORY,
            ignoredStreak: 5,
            cooldown: 3,
            pendingToken: "2026-07-07",
          },
        },
        satisfiedPending: { "daily-reminder": true },
      }),
    );
    expect(d.learning["daily-reminder"]?.ignoredStreak).toBe(0);
    expect(d.learning["daily-reminder"]?.cooldown).toBe(0);
    // And it is free to speak again on this very check.
    expect(d.due.map((n) => n.kind)).toContain("daily-reminder");
  });

  it("never backs off the monthly or weekly kinds", () => {
    // They state a fact rather than ask for anything, so "unanswered" is not a
    // thing they can be, and going quiet would only hide them.
    const f = unlogged({
      lateCountThisMonth: 9,
      lastWeek: { entries: 8, netMissing: 45, oheveiCount: 2 },
      learning: {
        "lateness-alert": { ...EMPTY_MEMORY, cooldown: 3 },
        "weekly-summary": { ...EMPTY_MEMORY, cooldown: 3 },
      },
    });
    expect(kinds(f)).toContain("lateness-alert");
    expect(kinds(f)).toContain("weekly-summary");
  });

  it("neither adapts nor learns when adaptation is switched off", () => {
    const f = owing(3, { adaptive: false });
    const d = decideNotifications(f);
    expect(d.due.map((n) => n.kind)).toContain("daily-reminder");
    expect(d.silenced).toEqual([]);
    expect(d.learning).toEqual(f.learning);
  });

  it("judges nothing while there is no channel to have seen it on", () => {
    // Silence the user was never given the chance to answer is not an answer.
    const f = unlogged({
      anyChannelOn: false,
      learning: { "daily-reminder": { ...EMPTY_MEMORY, pendingToken: "2026-07-07" } },
      satisfiedPending: { "daily-reminder": false },
    });
    expect(decideNotifications(f).learning).toEqual(f.learning);
  });
});

// ============================================================================
// דיווח למערכת הטלפונית
// ============================================================================

describe("phone-system report reminder", () => {
  /** The 2nd of the month at 20:00, with last month unreported. */
  const due = (over: Partial<ReminderFacts> = {}) =>
    facts({
      now: new Date(2026, 8, 2, 20, 0),
      reportMonth: "2026-08",
      reportDone: false,
      ...over,
    });

  it("says which month it is about", () => {
    const [n] = dueNotifications(due()).filter((x) => x.kind === "phone-report");
    expect(n.body).toContain("08/2026");
  });

  it("waits for the evening", () => {
    expect(kinds(due({ now: new Date(2026, 8, 2, 19, 59) }))).not.toContain("phone-report");
    expect(kinds(due({ now: new Date(2026, 8, 2, 20, 0) }))).toContain("phone-report");
  });

  it("runs on each of the first five days", () => {
    for (let day = 1; day <= 5; day++) {
      expect(kinds(due({ now: new Date(2026, 8, day, 20, 0) })), `day ${day}`).toContain(
        "phone-report",
      );
    }
  });

  it("stops after the 5th", () => {
    expect(kinds(due({ now: new Date(2026, 8, 6, 20, 0) }))).not.toContain("phone-report");
  });

  it("says so on the last day", () => {
    const [n] = dueNotifications(due({ now: new Date(2026, 8, 5, 20, 0) })).filter(
      (x) => x.kind === "phone-report",
    );
    expect(n.body).toContain("היום האחרון");
  });

  it("stops the moment the month is marked as reported", () => {
    expect(kinds(due({ reportDone: true }))).not.toContain("phone-report");
  });

  it("goes out once a day, not once a tick", () => {
    expect(kinds(due({ sent: { "phone-report": "2026-09-02" } }))).not.toContain("phone-report");
    // Yesterday's token does not silence today.
    expect(kinds(due({ sent: { "phone-report": "2026-09-01" } }))).toContain("phone-report");
  });

  it("respects the switch being off", () => {
    expect(kinds(due({ enabled: { ...ALL_ON, phoneReport: false } }))).not.toContain(
      "phone-report",
    );
  });
});

describe("what the background agent has already said", () => {
  /** Mid-morning on a learning day, nothing recorded: the daily reminder is due. */
  const unlogged = (over: Partial<ReminderFacts> = {}) => facts({ hasEntryToday: false, ...over });

  it("silences the app's own reminder about the same morning", () => {
    expect(kinds(unlogged())).toContain("daily-reminder");
    expect(kinds(unlogged({ sent: { "bg-seder-1": "2026-07-08" } }))).not.toContain(
      "daily-reminder",
    );
  });

  it("does not silence it on a later day", () => {
    expect(kinds(unlogged({ sent: { "bg-seder-1": "2026-07-07" } }))).toContain("daily-reminder");
  });

  it("leaves the seder ב׳ reminder to the agent alone", () => {
    // The app has no rule of its own for seder ב׳, so the agent's token for it
    // changes nothing here — and must not suppress the morning reminder.
    expect(kinds(unlogged({ sent: { "bg-seder-2": "2026-07-08" } }))).toContain("daily-reminder");
  });
});
