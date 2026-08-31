// The part that decides a reminder has worn out its welcome.
//
// Getting this wrong is not a visible bug — it is a reminder that quietly stops
// arriving, which nobody reports and everybody blames the app for. So each rule
// is pinned down here: what counts as unanswered, how long the silence lasts,
// and above all what brings it straight back.
import { describe, it, expect } from "vitest";
import {
  settle, gate, markDelivered, memoryFor, cooldownFor, parseLearningState,
  EMPTY_MEMORY, IGNORE_THRESHOLD, MAX_COOLDOWN, type KindMemory,
} from "./notification-learning";

const KINDS = ["daily-reminder", "weekly-summary"] as const;
type Kind = (typeof KINDS)[number];

const mem = (over: Partial<KindMemory> = {}): KindMemory => ({ ...EMPTY_MEMORY, ...over });

describe("memoryFor", () => {
  it("fills in a kind that has no memory yet", () => {
    expect(memoryFor<Kind>({}, "daily-reminder")).toEqual(EMPTY_MEMORY);
  });

  it("keeps every field a stored memory already has", () => {
    const stored = mem({ ignoredStreak: 2, delivered: 7, pendingToken: "2026-07-08" });
    expect(memoryFor<Kind>({ "daily-reminder": stored }, "daily-reminder")).toEqual(stored);
  });
});

describe("cooldownFor", () => {
  it("asks for no silence below the threshold", () => {
    for (let streak = 0; streak < IGNORE_THRESHOLD; streak++) {
      expect(cooldownFor(streak), `streak ${streak}`).toBe(0);
    }
  });

  it("starts at one period on reaching the threshold", () => {
    expect(cooldownFor(IGNORE_THRESHOLD)).toBe(1);
  });

  it("grows a period at a time", () => {
    expect(cooldownFor(IGNORE_THRESHOLD + 1)).toBe(2);
  });

  it("never grows past the cap", () => {
    // A reminder must never be able to switch itself off for good; that
    // decision belongs to the switches in Settings.
    expect(cooldownFor(IGNORE_THRESHOLD + 50)).toBe(MAX_COOLDOWN);
  });
});

describe("settle", () => {
  it("does nothing when there is no delivery waiting", () => {
    const before = mem({ ignoredStreak: 2 });
    expect(settle(before, false, "2026-07-08")).toBe(before);
  });

  it("waits while the delivery is still inside its own period", () => {
    // The reminder went out this morning and the day is not over: there is
    // still time to record the seder it asked for.
    const before = mem({ pendingToken: "2026-07-08" });
    expect(settle(before, false, "2026-07-08")).toBe(before);
  });

  it("counts a period that ended unsatisfied as unanswered", () => {
    const after = settle(mem({ pendingToken: "2026-07-07" }), false, "2026-07-08");
    expect(after.ignoredStreak).toBe(1);
    expect(after.pendingToken).toBeUndefined();
  });

  it("asks for silence once the streak reaches the threshold", () => {
    const before = mem({ pendingToken: "2026-07-07", ignoredStreak: IGNORE_THRESHOLD - 1 });
    const after = settle(before, false, "2026-07-08");
    expect(after.ignoredStreak).toBe(IGNORE_THRESHOLD);
    expect(after.cooldown).toBe(1);
  });

  it("counts an answered delivery even after its period has passed", () => {
    // The seder was recorded later the same day, or the next morning before
    // the app was next open. Both are the reminder having worked.
    const after = settle(mem({ pendingToken: "2026-07-07", delivered: 3 }), true, "2026-07-08");
    expect(after.engaged).toBe(1);
    expect(after.pendingToken).toBeUndefined();
  });

  it("clears the streak and any outstanding silence on one answer", () => {
    const before = mem({ pendingToken: "2026-07-07", ignoredStreak: 5, cooldown: 3, cooldownToken: "2026-07-06" });
    const after = settle(before, true, "2026-07-08");
    expect(after.ignoredStreak).toBe(0);
    expect(after.cooldown).toBe(0);
    expect(after.cooldownToken).toBeUndefined();
  });

  it("leaves the delivered tally alone either way", () => {
    const before = mem({ pendingToken: "2026-07-07", delivered: 9 });
    expect(settle(before, true, "2026-07-08").delivered).toBe(9);
    expect(settle(before, false, "2026-07-08").delivered).toBe(9);
  });
});

describe("gate", () => {
  it("lets a kind speak when it owes nothing", () => {
    const before = mem({ ignoredStreak: 2 });
    const { suppressed, memory } = gate(before, "2026-07-08");
    expect(suppressed).toBe(false);
    expect(memory).toBe(before);
  });

  it("holds a kind back and charges it one period", () => {
    const { suppressed, memory } = gate(mem({ cooldown: 2 }), "2026-07-08");
    expect(suppressed).toBe(true);
    expect(memory.cooldown).toBe(1);
    expect(memory.cooldownToken).toBe("2026-07-08");
  });

  it("charges the same period only once", () => {
    // The rules re-run every ten minutes while a window is open, so a single
    // silenced morning must not burn the whole cooldown by lunchtime.
    const first = gate(mem({ cooldown: 3 }), "2026-07-08").memory;
    const second = gate(first, "2026-07-08");
    expect(second.suppressed).toBe(true);
    expect(second.memory.cooldown).toBe(2);
  });

  it("charges each new period once", () => {
    let memory = mem({ cooldown: 2 });
    memory = gate(memory, "2026-07-08").memory;
    memory = gate(memory, "2026-07-09").memory;
    expect(memory.cooldown).toBe(0);
    // Paid off: the next period it is due, it speaks.
    expect(gate(memory, "2026-07-12").suppressed).toBe(false);
  });
});

describe("markDelivered", () => {
  it("records the delivery and what it is now waiting on", () => {
    const after = markDelivered(mem({ delivered: 4 }), "2026-07-08");
    expect(after.delivered).toBe(5);
    expect(after.pendingToken).toBe("2026-07-08");
  });
});

describe("a run of ignored days and the day it ends", () => {
  it("goes quiet after three unanswered days, then comes straight back", () => {
    let memory = EMPTY_MEMORY;

    // Three days delivered and never acted on.
    for (const day of ["2026-07-06", "2026-07-07", "2026-07-08"]) {
      memory = markDelivered(memory, day);
      memory = settle(memory, false, nextDay(day));
    }
    expect(memory.ignoredStreak).toBe(3);
    expect(memory.cooldown).toBe(1);

    // The next morning it holds its tongue.
    const held = gate(memory, "2026-07-09");
    expect(held.suppressed).toBe(true);
    memory = held.memory;

    // The morning after, it speaks — and this time the seder gets recorded.
    expect(gate(memory, "2026-07-12").suppressed).toBe(false);
    memory = markDelivered(memory, "2026-07-12");
    memory = settle(memory, true, "2026-07-13");

    expect(memory.ignoredStreak).toBe(0);
    expect(memory.cooldown).toBe(0);
    expect(memory.engaged).toBe(1);
    expect(memory.delivered).toBe(4);
  });
});

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("parseLearningState", () => {
  it("reads back what it stored", () => {
    const state = { "daily-reminder": mem({ ignoredStreak: 2, cooldown: 1, delivered: 5, engaged: 3 }) };
    expect(parseLearningState(JSON.parse(JSON.stringify(state)), KINDS)).toEqual(state);
  });

  it("treats junk as nothing learned", () => {
    for (const raw of [null, undefined, 42, "text", [1, 2, 3], true]) {
      expect(parseLearningState(raw, KINDS), String(raw)).toEqual({});
    }
  });

  it("ignores keys that are not reminder kinds", () => {
    const parsed = parseLearningState({ "made-up-kind": mem({ cooldown: 2 }) }, KINDS);
    expect(parsed).toEqual({});
  });

  it("drops a kind whose entry is not an object", () => {
    expect(parseLearningState({ "daily-reminder": "nonsense" }, KINDS)).toEqual({});
  });

  it("clamps a hand-edited cooldown to the cap", () => {
    // The data file is plain JSON in the user's AppData folder. Nothing in it
    // may be able to silence a reminder for ever.
    const parsed = parseLearningState({ "daily-reminder": { cooldown: 9999 } }, KINDS);
    expect(parsed["daily-reminder"]?.cooldown).toBe(MAX_COOLDOWN);
  });

  it("replaces missing, negative and non-numeric counts with zero", () => {
    const parsed = parseLearningState(
      { "daily-reminder": { ignoredStreak: -4, delivered: "many", engaged: NaN } },
      KINDS,
    );
    expect(parsed["daily-reminder"]).toEqual(EMPTY_MEMORY);
  });

  it("drops a token that is not a short string", () => {
    const parsed = parseLearningState(
      { "daily-reminder": { pendingToken: 17, cooldownToken: "x".repeat(500) } },
      KINDS,
    );
    expect(parsed["daily-reminder"]?.pendingToken).toBeUndefined();
    expect(parsed["daily-reminder"]?.cooldownToken).toBeUndefined();
  });
});
