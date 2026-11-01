import { useSyncExternalStore } from "react";

/** Local calendar date (YYYY-MM-DD) — never UTC. Read fresh on every call. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Milliseconds from `now` to the next local midnight (DST-safe). */
export function msUntilMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Calls `cb` whenever the local day rolls over: at midnight (timer) and when
 * the window regains focus / becomes visible (timers freeze during sleep).
 * Returns an unsubscribe function.
 */
export function subscribeToday(cb: () => void): () => void {
  let last = todayISO();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = () => {
    const now = todayISO();
    if (now !== last) {
      last = now;
      cb();
    }
  };
  const schedule = () => {
    // +50ms so we land safely after midnight; re-check covers early firing.
    timer = setTimeout(() => {
      check();
      schedule();
    }, msUntilMidnight() + 50);
  };
  const onVisible = () => {
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      check();
      clearTimeout(timer);
      schedule();
    }
  };

  schedule();
  if (typeof window !== "undefined") window.addEventListener("focus", onVisible);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearTimeout(timer);
    if (typeof window !== "undefined") window.removeEventListener("focus", onVisible);
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", onVisible);
  };
}

/**
 * Current local date as React state; re-renders at midnight and on returning
 * to the window. Use it for the "today" screens (index.tsx should call
 * `const date = useToday()` instead of computing the date during render).
 * For an action fired at click time, call `todayISO()` instead of using a
 * captured value.
 */
export function useToday(): string {
  return useSyncExternalStore(subscribeToday, todayISO, todayISO);
}
