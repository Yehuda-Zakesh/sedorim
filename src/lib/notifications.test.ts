// The reminder rules. These decide when the app is allowed to interrupt the
// user, so each guard is pinned down here rather than left to be discovered in
// production by being nagged at 06:00 on a Shabbos.
import { describe, it, expect } from "vitest";
import { dueNotifications, isoWeekKey, type ReminderFacts } from "./notifications";

const ALL_ON = { dailyReminder: true, latenessAlert: true, weeklySummary: true };

/** A weekday mid-morning, seder 1 already started, nothing due. */
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
    sent: {},
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
    const keys = new Set(
      Array.from({ length: 7 }, (_, i) => isoWeekKey(new Date(2026, 6, 6 + i))),
    );
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
    expect(kinds(facts({ lateCountThisMonth: 2, maxLatePerMonth: 3 }))).not.toContain("lateness-alert");
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
    const [n] = dueNotifications(facts({ lateCountThisMonth: 4, maxLatePerMonth: 3 }))
      .filter((x) => x.kind === "lateness-alert");
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
    const [n] = dueNotifications(facts({ lastWeek: { entries: 8, netMissing: 45, oheveiCount: 2 } }))
      .filter((x) => x.kind === "weekly-summary");
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
      enabled: { dailyReminder: false, latenessAlert: false, weeklySummary: false },
    });
    expect(dueNotifications(f)).toEqual([]);
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
    });
    for (const n of dueNotifications(f)) {
      expect(n.title.length, n.kind).toBeGreaterThan(0);
      expect(n.body.length, n.kind).toBeGreaterThan(0);
      expect(n.token.length, n.kind).toBeGreaterThan(0);
    }
  });
});
