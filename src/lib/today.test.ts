import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { todayISO, msUntilMidnight, subscribeToday } from "./today";

class FakeTarget extends EventTarget {}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 31, 23, 59, 0));
  const win = new FakeTarget();
  const doc = Object.assign(new FakeTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("todayISO", () => {
  it("is the local date, not UTC", () => {
    vi.setSystemTime(new Date(2026, 10, 1, 0, 30));
    expect(todayISO()).toBe("2026-11-01");
  });
});

describe("msUntilMidnight", () => {
  it("counts to the next local midnight", () => {
    expect(msUntilMidnight(new Date(2026, 9, 31, 23, 59, 0))).toBe(60_000);
  });
});

describe("subscribeToday", () => {
  it("notifies when local midnight passes", () => {
    const seen: string[] = [];
    const off = subscribeToday(() => seen.push(todayISO()));
    vi.advanceTimersByTime(59_000);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(2_000);
    expect(seen).toEqual(["2026-11-01"]);
    vi.advanceTimersByTime(24 * 3600_000);
    expect(seen).toEqual(["2026-11-01", "2026-11-02"]);
    off();
  });

  it("notifies on returning to the window if the day changed meanwhile", () => {
    const cb = vi.fn();
    const off = subscribeToday(cb);
    vi.setSystemTime(new Date(2026, 10, 1, 8, 0)); // timers frozen (sleep)
    window.dispatchEvent(new Event("focus"));
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it("stops after unsubscribe", () => {
    const cb = vi.fn();
    subscribeToday(cb)();
    vi.advanceTimersByTime(3 * 24 * 3600_000);
    expect(cb).not.toHaveBeenCalled();
  });
});
