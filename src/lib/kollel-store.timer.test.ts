// The learning timer. Its session lives in module scope, so it gets its own
// file — vitest hands each test file a fresh copy of the module.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  startTimer,
  stopTimer,
  cancelTimer,
  getTimer,
  pauseTimer,
  resumeTimer,
  timerElapsedMs,
  isTimerPaused,
  sameTimerSession,
  removeTimerLimit,
  getTimerGeneration,
  type TimerSession,
} from "./kollel-store";
import { setStoreGate } from "@/lib/store-gate";

// These tests exercise the stores as if the data file had been read: writes are
// refused until the gate is "ready" (see store-gate.ts). In this environment the
// real startup read finds no storage, so the gate is opened before every test.
beforeEach(() => setStoreGate("ready"));

beforeEach(() => {
  cancelTimer();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 8, 20, 0));
});

afterEach(() => {
  cancelTimer();
  vi.useRealTimers();
});

describe("startTimer", () => {
  it("has no session before anything is started", () => {
    expect(getTimer()).toBe(null);
  });

  it("starts a session for the given framework, stamped now", () => {
    const t = startTimer("torato-beyado");
    expect(t.framework).toBe("torato-beyado");
    expect(t.startedAt).toBe(Date.now());
    expect(getTimer()).toEqual(t);
  });

  it("stores an optional time limit", () => {
    expect(startTimer("kollel-erev", { limitMinutes: 45 }).limitMinutes).toBe(45);
  });

  it("omits a zero or negative time limit rather than storing it", () => {
    expect(startTimer("kollel-erev", { limitMinutes: 0 })).not.toHaveProperty("limitMinutes");
    expect(startTimer("kollel-erev", { limitMinutes: -10 })).not.toHaveProperty("limitMinutes");
  });

  it("stores תענית דיבור only when asked for", () => {
    expect(startTimer("kollel-erev", { tanitDibur: true }).tanitDibur).toBe(true);
    expect(startTimer("kollel-erev", { tanitDibur: false })).not.toHaveProperty("tanitDibur");
    expect(startTimer("kollel-erev")).not.toHaveProperty("tanitDibur");
  });

  it("accepts both options together", () => {
    const t = startTimer("kollel-erev", { limitMinutes: 30, tanitDibur: true });
    expect(t).toMatchObject({ framework: "kollel-erev", limitMinutes: 30, tanitDibur: true });
  });

  it("replaces an existing session", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(10 * 60_000);
    const second = startTimer("torato-beyado");
    expect(getTimer()).toEqual(second);
    expect(second.startedAt).toBe(Date.now());
  });
});

describe("stopTimer", () => {
  it("returns the elapsed minutes and clears the session", () => {
    startTimer("bein-hazmanim");
    vi.advanceTimersByTime(45 * 60_000);
    expect(stopTimer()).toEqual({ framework: "bein-hazmanim", minutes: 45, tanitDibur: undefined });
    expect(getTimer()).toBe(null);
  });

  it("rounds to the nearest minute", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(20 * 60_000 + 40_000); // 20m40s
    expect(stopTimer()?.minutes).toBe(21);
  });

  it("rounds down below the half minute", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(20 * 60_000 + 20_000); // 20m20s
    expect(stopTimer()?.minutes).toBe(20);
  });

  it("never records less than one minute", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(5_000);
    expect(stopTimer()?.minutes).toBe(1);
  });

  it("records a minute even when stopped instantly", () => {
    startTimer("kollel-erev");
    expect(stopTimer()?.minutes).toBe(1);
  });

  it("caps the elapsed time at the session's limit", () => {
    startTimer("kollel-erev", { limitMinutes: 30 });
    vi.advanceTimersByTime(90 * 60_000);
    expect(stopTimer()?.minutes).toBe(30);
  });

  it("does not pad up to the limit when stopped early", () => {
    startTimer("kollel-erev", { limitMinutes: 30 });
    vi.advanceTimersByTime(10 * 60_000);
    expect(stopTimer()?.minutes).toBe(10);
  });

  it("reports exactly the limit when stopped right on it", () => {
    startTimer("kollel-erev", { limitMinutes: 30 });
    vi.advanceTimersByTime(30 * 60_000);
    expect(stopTimer()?.minutes).toBe(30);
  });

  it("carries תענית דיבור through to the result", () => {
    startTimer("kollel-erev", { tanitDibur: true });
    vi.advanceTimersByTime(30 * 60_000);
    expect(stopTimer()).toEqual({ framework: "kollel-erev", minutes: 30, tanitDibur: true });
  });

  it("returns null with nothing running", () => {
    expect(stopTimer()).toBe(null);
  });

  it("returns null on a second stop", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(60_000);
    expect(stopTimer()).not.toBe(null);
    expect(stopTimer()).toBe(null);
  });

  it("measures from the latest start after a restart", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(50 * 60_000);
    startTimer("torato-beyado");
    vi.advanceTimersByTime(5 * 60_000);
    expect(stopTimer()).toEqual({ framework: "torato-beyado", minutes: 5, tanitDibur: undefined });
  });

  it("handles a long session across hours", () => {
    startTimer("bein-hazmanim");
    vi.advanceTimersByTime(5 * 60 * 60_000);
    expect(stopTimer()?.minutes).toBe(300);
  });
});

describe("cancelTimer", () => {
  it("discards the session without reporting minutes", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(30 * 60_000);
    cancelTimer();
    expect(getTimer()).toBe(null);
    expect(stopTimer()).toBe(null);
  });

  it("is safe to call with nothing running", () => {
    expect(() => cancelTimer()).not.toThrow();
    expect(getTimer()).toBe(null);
  });

  it("is safe to call twice", () => {
    startTimer("kollel-erev");
    cancelTimer();
    expect(() => cancelTimer()).not.toThrow();
    expect(getTimer()).toBe(null);
  });
});

describe("pauseTimer / resumeTimer", () => {
  it("freezes the elapsed reading while paused", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(10 * 60_000);
    pauseTimer();
    vi.advanceTimersByTime(60 * 60_000);
    expect(timerElapsedMs(getTimer()!)).toBe(10 * 60_000);
  });

  it("does not count the paused stretch towards the saved minutes", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(20 * 60_000);
    pauseTimer();
    vi.advanceTimersByTime(90 * 60_000); // a long break
    resumeTimer();
    vi.advanceTimersByTime(10 * 60_000);
    expect(stopTimer()?.minutes).toBe(30);
  });

  it("adds up across several pauses", () => {
    startTimer("torato-beyado");
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(5 * 60_000);
      pauseTimer();
      vi.advanceTimersByTime(15 * 60_000);
      resumeTimer();
    }
    expect(stopTimer()?.minutes).toBe(15);
  });

  it("can be stopped and saved while still paused", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(25 * 60_000);
    pauseTimer();
    vi.advanceTimersByTime(5 * 60_000);
    expect(stopTimer()?.minutes).toBe(25);
    expect(getTimer()).toBe(null);
  });

  it("reports its own paused state", () => {
    startTimer("kollel-erev");
    expect(isTimerPaused(getTimer()!)).toBe(false);
    pauseTimer();
    expect(isTimerPaused(getTimer()!)).toBe(true);
    resumeTimer();
    expect(isTimerPaused(getTimer()!)).toBe(false);
  });

  it("keeps the framework, the limit and תענית דיבור across a pause", () => {
    startTimer("kollel-erev", { limitMinutes: 45, tanitDibur: true });
    vi.advanceTimersByTime(5 * 60_000);
    pauseTimer();
    resumeTimer();
    expect(getTimer()).toMatchObject({
      framework: "kollel-erev",
      limitMinutes: 45,
      tanitDibur: true,
    });
  });

  it("still caps at the limit when the break is longer than the limit", () => {
    startTimer("kollel-erev", { limitMinutes: 30 });
    vi.advanceTimersByTime(20 * 60_000);
    pauseTimer();
    vi.advanceTimersByTime(120 * 60_000);
    resumeTimer();
    vi.advanceTimersByTime(50 * 60_000);
    expect(stopTimer()?.minutes).toBe(30);
  });

  it("is a no-op when pausing twice — the break does not double-count", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(10 * 60_000);
    pauseTimer();
    vi.advanceTimersByTime(30 * 60_000);
    pauseTimer();
    expect(timerElapsedMs(getTimer()!)).toBe(10 * 60_000);
  });

  it("is a no-op when resuming a timer that is already running", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(10 * 60_000);
    resumeTimer();
    expect(timerElapsedMs(getTimer()!)).toBe(10 * 60_000);
  });

  it("returns null with nothing running", () => {
    expect(pauseTimer()).toBe(null);
    expect(resumeTimer()).toBe(null);
  });

  it("counts a session started before the app closed and reopened", () => {
    // The clock is derived from a stored timestamp, not from a running
    // interval, so wall-clock time passing with no window open still counts.
    const t = startTimer("kollel-erev");
    const twoHoursLater = t.startedAt + 2 * 60 * 60_000;
    expect(timerElapsedMs(t, twoHoursLater)).toBe(2 * 60 * 60_000);
  });
});

describe("previewStopTimer (finding 14)", () => {
  it("reads the result without ending the session", async () => {
    const { previewStopTimer } = await import("./kollel-store");
    startTimer("kollel-erev");
    vi.advanceTimersByTime(30 * 60000);
    expect(previewStopTimer()?.minutes).toBe(30);
    expect(getTimer()).not.toBe(null);
    expect(stopTimer()?.minutes).toBe(30);
    expect(getTimer()).toBe(null);
  });
});

describe("sameTimerSession — a session replaced by another is never 'the same'", () => {
  const MIN = 60000;
  const fresh = (startedAt: number): TimerSession => ({ framework: "kollel-erev", startedAt });
  const paused = (startedAt: number, accumulatedMs: number, pausedAt: number): TimerSession => ({
    framework: "kollel-erev",
    startedAt,
    accumulatedMs,
    pausedAt,
  });

  it("keeps the identity across pause and resume", () => {
    const a = fresh(1000);
    const p = paused(1000, 10 * MIN, 1000 + 10 * MIN);
    const r: TimerSession = {
      framework: "kollel-erev",
      startedAt: 1000 + 20 * MIN,
      accumulatedMs: 10 * MIN,
    };
    expect(sameTimerSession(a, p)).toBe(true);
    expect(sameTimerSession(p, r)).toBe(true);
    expect(sameTimerSession(a, r)).toBe(true);
    // paused again after the resume: banked 10 + 5 minutes
    const p2 = paused(r.startedAt, 15 * MIN, r.startedAt + 5 * MIN);
    expect(sameTimerSession(p, p2)).toBe(true);
    expect(sameTimerSession(r, p2)).toBe(true);
  });

  it("two different paused sessions are different (the old edge case)", () => {
    const first = paused(1000, 40 * MIN, 1000 + 40 * MIN);
    // cancelled, a new one started later and paused after 5 minutes
    const second = paused(5_000_000, 5 * MIN, 5_000_000 + 5 * MIN);
    expect(sameTimerSession(first, second)).toBe(false);
  });

  it("a fresh session replacing a banked one is different, and so is another start time", () => {
    expect(sameTimerSession(paused(1000, 10 * MIN, 1000 + 10 * MIN), fresh(9_000_000))).toBe(false);
    expect(sameTimerSession(fresh(1000), fresh(2000))).toBe(false);
    expect(sameTimerSession(fresh(1000), { ...fresh(1000), framework: "torato-beyado" })).toBe(
      false,
    );
    expect(sameTimerSession(null, null)).toBe(true);
    expect(sameTimerSession(fresh(1), null)).toBe(false);
  });
});

describe("removeTimerLimit", () => {
  it("keeps the session (same generation, same clock) and drops only the limit", () => {
    startTimer("kollel-erev", { limitMinutes: 10 });
    vi.advanceTimersByTime(5 * 60000);
    pauseTimer();
    const before = getTimer()!;
    const gen = getTimerGeneration();
    const after = removeTimerLimit()!;
    expect(after).toEqual({ ...before, limitMinutes: undefined });
    expect("limitMinutes" in after).toBe(false);
    expect(getTimerGeneration()).toBe(gen);
  });
  it("is a no-op without a limit", () => {
    const t = startTimer("kollel-erev");
    expect(removeTimerLimit()).toBe(t);
  });
});
