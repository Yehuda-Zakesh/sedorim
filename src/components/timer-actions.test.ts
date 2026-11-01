import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const saveMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/store-bridge", () => ({
  loadStore: vi.fn(async () => ({})),
  storeStamp: vi.fn(async () => "0"),
  saveStoreKey: saveMock,
  saveStoreKeys: saveMock,
  // The startup read: a fresh install, so the gate opens and nothing migrates.
  loadStoreChecked: vi.fn(async () => ({
    status: "missing" as const,
    meta: { upgradedFrom: null, upgradeCopy: null },
  })),
  onStoreCorruptDetected: () => {},
  saveStoreKeysDuringStartup: vi.fn(async () => ({ ok: true, updatedAt: 1 })),
  createUpgradeCopy: vi.fn(async () => ({ files: ["copy"] })),
}));

import {
  startTimer,
  cancelTimer,
  getTimer,
  pauseTimer,
  resumeTimer,
  getTimerGeneration,
  getLearningSnapshot,
  removeTimerLimit,
  replaceAllDataChecked,
  timerElapsedMs,
  type LearningEntry,
} from "@/lib/kollel-store";
import { saveTimerResult, saveTimerResultAtomic, timerLimitVerdict } from "./timer-actions";
import { StoreBlockedError, onWriteFailure, setStoreGate } from "@/lib/store-gate";

// These tests exercise the stores as if the data file had been read: writes are
// refused until the gate is "ready" (see store-gate.ts). In this environment the
// real startup read finds no storage, so the gate is opened before every test.
beforeEach(() => setStoreGate("ready"));

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true, updatedAt: 1 });
  cancelTimer();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 8, 20, 0));
});
afterEach(() => {
  cancelTimer();
  vi.useRealTimers();
});

describe("saveTimerResult", () => {
  it("saves and ends the session when valid", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(20 * 60000);
    const add = vi.fn();
    const r = saveTimerResult(add);
    expect(r).toEqual({ ok: true, minutes: 20, tanitDibur: false });
    expect(add).toHaveBeenCalledTimes(1);
    expect(getTimer()).toBe(null);
  });

  it("keeps the session when the duration exceeds 1440 and offers the max", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(25 * 3600_000);
    const add = vi.fn();
    const r = saveTimerResult(add);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.suggestedMinutes).toBe(1440);
      expect(r.error).toMatch(/1440/);
    }
    expect(add).not.toHaveBeenCalled();
    expect(getTimer()).not.toBe(null);
  });

  it("saves with a corrected duration and then ends the session", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(25 * 3600_000);
    const added: LearningEntry[] = [];
    const r = saveTimerResult((e) => added.push(e), 600);
    expect(r.ok).toBe(true);
    expect(added[0].minutes).toBe(600);
    expect(getTimer()).toBe(null);
  });

  it("keeps the session if add throws", () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(60000);
    const r = saveTimerResult(() => {
      throw new Error("boom");
    });
    expect(r.ok).toBe(false);
    expect(getTimer()).not.toBe(null);
  });
});

describe("saveTimerResultAtomic — the full stale-suggestion sequence", () => {
  it("stop -> error + suggestion -> cancel -> new timer -> the old suggestion cannot save to it", async () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(25 * 3600_000);
    const oldGen = getTimerGeneration();
    const r1 = await saveTimerResultAtomic(undefined, oldGen);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.suggestedMinutes).toBe(1440);
    expect(getTimer()).not.toBe(null);

    cancelTimer();
    const fresh = startTimer("kollel-erev");
    expect(getTimerGeneration()).not.toBe(oldGen);

    const r2 = await saveTimerResultAtomic(1440, oldGen);
    expect(r2.ok).toBe(false);
    expect(getTimer()).toBe(fresh);
    expect(getLearningSnapshot()).toHaveLength(0);
  });

  it("pause/resume keeps the session identity", () => {
    startTimer("kollel-erev");
    const gen = getTimerGeneration();
    pauseTimer();
    resumeTimer();
    expect(getTimerGeneration()).toBe(gen);
  });

  it("a failed write leaves the session whole; the success path ends it atomically", async () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(20 * 60000);
    const gen = getTimerGeneration();
    const t = getTimer();
    saveMock.mockRejectedValueOnce(new Error("disk"));
    const bad = await saveTimerResultAtomic(undefined, gen);
    expect(bad.ok).toBe(false);
    expect(getTimer()).toBe(t);
    expect(getLearningSnapshot()).toHaveLength(0);
    const good = await saveTimerResultAtomic(undefined, gen);
    expect(good).toEqual({ ok: true, minutes: 20, tanitDibur: false });
    expect(getTimer()).toBe(null);
    expect(getLearningSnapshot()).toHaveLength(1);
  });
});

// The time limit, as v7 had it: only a watched screen saves by itself; an old
// timer already past its limit is never turned into a record silently.
const verdictOf = (over: Partial<Parameters<typeof timerLimitVerdict>[0]> = {}) => {
  const t = getTimer()!;
  return timerLimitVerdict({
    limitMinutes: t.limitMinutes,
    elapsedMs: timerElapsedMs(t),
    sawUnderLimit: false,
    autoStopAllowed: false,
    autoStopTried: false,
    hasSaveError: false,
    ...over,
  });
};
// Every write that touched `key` (saveStoreKey(key, v) or saveStoreKeys({ key: v })), as the value written.
const writesOf = (key: string): { limitMinutes?: number }[] =>
  saveMock.mock.calls.flatMap((c) =>
    c[0] === key ? [c[1]] : c[0] && typeof c[0] === "object" && key in c[0] ? [c[0][key]] : [],
  );

describe("timer time limit", () => {
  beforeEach(async () => {
    await replaceAllDataChecked([], [], { safetySnapshot: false });
    saveMock.mockClear();
  });

  it("running inside the limit: nothing is saved or changed", () => {
    const t = startTimer("kollel-erev", { limitMinutes: 60 });
    vi.advanceTimersByTime(20 * 60000);
    expect(verdictOf({ sawUnderLimit: true, autoStopAllowed: true })).toBe("none");
    expect(getTimer()).toBe(t);
    expect(getLearningSnapshot()).toHaveLength(0);
    expect(writesOf("learning")).toHaveLength(0);
  });

  it("paused inside the limit: kept with its banked time, however long the pause", () => {
    startTimer("kollel-erev", { limitMinutes: 60 });
    vi.advanceTimersByTime(20 * 60000);
    const paused = pauseTimer()!;
    vi.advanceTimersByTime(5 * 3600_000);
    expect(verdictOf({ autoStopAllowed: true })).toBe("none");
    expect(getTimer()).toBe(paused);
    expect(timerElapsedMs(getTimer()!)).toBe(20 * 60000);
    expect(getLearningSnapshot()).toHaveLength(0);
    expect(writesOf("learning")).toHaveLength(0);
  });

  it("reached while the timer's own screen was watching: stops by itself, once (v7)", () => {
    startTimer("kollel-erev", { limitMinutes: 30 });
    vi.advanceTimersByTime(30 * 60000);
    const watched = { sawUnderLimit: true, autoStopAllowed: true };
    expect(verdictOf(watched)).toBe("auto-stop");
    expect(verdictOf({ ...watched, autoStopTried: true })).toBe("decide");
  });

  it("over the limit but not watched (another screen, or found on opening): the person decides", () => {
    startTimer("kollel-erev", { limitMinutes: 30 });
    vi.advanceTimersByTime(50 * 60000);
    expect(verdictOf({ sawUnderLimit: false, autoStopAllowed: true })).toBe("decide");
    expect(verdictOf({ sawUnderLimit: true, autoStopAllowed: false })).toBe("decide");
    expect(verdictOf({ hasSaveError: true })).toBe("none");
  });

  describe("an old timer already past its limit", () => {
    beforeEach(() => {
      startTimer("kollel-erev", { limitMinutes: 30 });
      vi.advanceTimersByTime(50 * 60000);
    });

    it("creates no record and deletes nothing until a choice is made", () => {
      expect(verdictOf()).toBe("decide");
      expect(getTimer()).not.toBe(null);
      expect(getLearningSnapshot()).toHaveLength(0);
      expect(writesOf("learning")).toHaveLength(0);
    });

    it("'שמור עד המגבלה' saves min(elapsed, limit), as v7 did", async () => {
      const r = await saveTimerResultAtomic();
      expect(r).toEqual({ ok: true, minutes: 30, tanitDibur: false });
      expect(getLearningSnapshot()[0].minutes).toBe(30);
      expect(getTimer()).toBe(null);
    });

    it("'המשך ללא מגבלה' drops only the limit; startedAt and the banked time stay", () => {
      const before = getTimer()!;
      const after = removeTimerLimit()!;
      expect(after.limitMinutes).toBeUndefined();
      expect(after.startedAt).toBe(before.startedAt);
      expect(after.accumulatedMs).toBe(before.accumulatedMs);
      expect(timerElapsedMs(after)).toBe(50 * 60000);
      expect(verdictOf()).toBe("none");
      expect(getLearningSnapshot()).toHaveLength(0);
      expect(writesOf("timer").at(-1)?.limitMinutes).toBeUndefined();
    });

    it("'המשך ללא מגבלה' keeps a paused timer's banked time and stays paused", () => {
      const p = pauseTimer()!;
      const after = removeTimerLimit()!;
      expect(after.accumulatedMs).toBe(p.accumulatedMs);
      expect(after.pausedAt).toBe(p.pausedAt);
      expect(getTimerGeneration()).toBe(getTimerGeneration());
    });

    it("'בטל טיימר' ends the session without a record", () => {
      cancelTimer();
      expect(getTimer()).toBe(null);
      expect(getLearningSnapshot()).toHaveLength(0);
      expect(writesOf("learning")).toHaveLength(0);
    });
  });
});

describe("the load gate around timer actions", () => {
  beforeEach(async () => {
    await replaceAllDataChecked([], [], { safetySnapshot: false });
    saveMock.mockClear();
  });
  afterEach(() => setStoreGate("ready"));

  it("refuses start/pause/resume/cancel/stop while the file is unreadable, changing nothing", async () => {
    const t = startTimer("kollel-erev");
    setStoreGate("corrupt", {
      reason: "unparseable",
      message: "x",
      preservedAs: null,
      backups: [],
    });
    saveMock.mockClear();
    expect(() => startTimer("bein-hazmanim")).toThrow(StoreBlockedError);
    expect(() => pauseTimer()).toThrow(StoreBlockedError);
    expect(() => cancelTimer()).toThrow(StoreBlockedError);
    expect(() => removeTimerLimit()).not.toThrow(); // no limit: nothing to change
    const r = await saveTimerResultAtomic();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/לא נקרא/);
    expect(getTimer()).toBe(t);
    expect(getLearningSnapshot()).toHaveLength(0);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("while loading, resume and stop are refused too", () => {
    startTimer("kollel-erev");
    pauseTimer();
    setStoreGate("loading");
    expect(() => resumeTimer()).toThrow(StoreBlockedError);
    expect(() => removeTimerLimit()).not.toThrow();
  });

  it("stop-and-save is ONE write (entry + session end); when it fails the session stays and is not deleted", async () => {
    startTimer("kollel-erev");
    vi.advanceTimersByTime(10 * 60000);
    saveMock.mockClear();
    saveMock.mockRejectedValueOnce(new Error("disk"));
    const r = await saveTimerResultAtomic();
    expect(r.ok).toBe(false);
    expect(saveMock).toHaveBeenCalledTimes(1);
    const patch = saveMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(["learning", "timer"]);
    expect(patch.timer).toBe(null);
    expect(getTimer()).not.toBe(null); // memory has the session back
    expect(getLearningSnapshot()).toHaveLength(0);
  });

  it("a fire-and-forget timer write that fails rolls the session back and is reported", async () => {
    const reported: unknown[] = [];
    const off = onWriteFailure((e) => reported.push(e));
    saveMock.mockRejectedValueOnce(new Error("disk"));
    startTimer("kollel-erev");
    expect(getTimer()).not.toBe(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(getTimer()).toBe(null);
    expect(reported).toHaveLength(1);
    off();
  });
});
