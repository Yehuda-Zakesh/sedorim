// The learning timer. Its session lives in module scope, so it gets its own
// file — vitest hands each test file a fresh copy of the module.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startTimer, stopTimer, cancelTimer, getTimer } from "./kollel-store";

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
