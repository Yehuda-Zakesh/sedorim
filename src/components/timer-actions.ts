import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  todayISO,
  newId,
  useTimer,
  stopTimer,
  previewStopTimer,
  validateLearning,
  saveLearningAndEndTimer,
  getTimerGeneration,
  type LearningEntry,
  cancelTimer,
  removeTimerLimit,
  pauseTimer,
  resumeTimer,
  timerElapsedMs,
  isTimerPaused,
  type LearningFramework,
} from "@/lib/kollel-store";
import {
  StoreBlockedError,
  getStoreGate,
  isStoreWritable,
  useStoreGate,
  writeFailureMessage,
} from "@/lib/store-gate";

export type SaveTimerResult =
  | { ok: true; minutes: number; tanitDibur: boolean }
  | { ok: false; error: string; suggestedMinutes: number };

/** Longest learning entry the store accepts (validateLearning). */
const MAX_ENTRY_MINUTES = 24 * 60;

/**
 * Validates the timer's result BEFORE ending the session, so a rejected entry
 * (e.g. a timer left running > 1440 minutes) never costs the user the session.
 * `minutesOverride` lets the UI save a corrected duration. The session is
 * ended only after `add` succeeded.
 */
export function saveTimerResult(
  add: (e: LearningEntry) => void,
  minutesOverride?: number,
): SaveTimerResult {
  const res = previewStopTimer();
  if (!res) return { ok: true, minutes: 0, tanitDibur: false };
  if (!isStoreWritable()) {
    return {
      ok: false,
      error: `${writeFailureMessage(new StoreBlockedError(getStoreGate()))}. הטיימר עדיין שמור.`,
      suggestedMinutes: 0,
    };
  }
  const minutes = minutesOverride ?? res.minutes;
  const entry: LearningEntry = {
    id: newId(),
    framework: res.framework,
    date: todayISO(),
    minutes,
    source: "timer",
    ...(res.tanitDibur ? { tanitDibur: true } : {}),
  };
  const v = validateLearning(entry);
  if (!v.ok) {
    return {
      ok: false,
      error: `${v.error}. הטיימר עדיין שמור — אפשר לשמור ${MAX_ENTRY_MINUTES} דקות לכל היותר, או לבטל.`,
      suggestedMinutes: MAX_ENTRY_MINUTES,
    };
  }
  try {
    add(entry);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "השמירה נכשלה",
      suggestedMinutes: Math.min(minutes, MAX_ENTRY_MINUTES),
    };
  }
  stopTimer();
  return { ok: true, minutes, tanitDibur: !!res.tanitDibur };
}

/**
 * Atomic stop-and-save: the learning entry and the end of the session are
 * written together (one write of learning + timer). Resolves only after that
 * write reached storage; on a persistence failure the session is left intact
 * and the result is { ok: false } with a retry suggestion. `expectedGeneration`
 * (getTimerGeneration() when the request was made) rejects the save if the
 * session has since been cancelled, stopped or replaced.
 */
export async function saveTimerResultAtomic(
  minutesOverride?: number,
  expectedGeneration: number = getTimerGeneration(),
): Promise<SaveTimerResult> {
  const res = previewStopTimer();
  if (!res) return { ok: true, minutes: 0, tanitDibur: false };
  // Nothing is written, nothing succeeds, while the data file is not usable.
  if (!isStoreWritable()) {
    return {
      ok: false,
      error: `${writeFailureMessage(new StoreBlockedError(getStoreGate()))}. הטיימר עדיין שמור.`,
      suggestedMinutes: 0,
    };
  }
  if (getTimerGeneration() !== expectedGeneration) {
    return { ok: false, error: STALE_SESSION_MESSAGE, suggestedMinutes: 0 };
  }
  const minutes = minutesOverride ?? res.minutes;
  const entry: LearningEntry = {
    id: newId(),
    framework: res.framework,
    date: todayISO(),
    minutes,
    source: "timer",
    ...(res.tanitDibur ? { tanitDibur: true } : {}),
  };
  const v = validateLearning(entry);
  if (!v.ok) {
    return {
      ok: false,
      error: `${v.error}. הטיימר עדיין שמור — אפשר לשמור ${MAX_ENTRY_MINUTES} דקות לכל היותר, או לבטל.`,
      suggestedMinutes: MAX_ENTRY_MINUTES,
    };
  }
  try {
    await saveLearningAndEndTimer(entry, expectedGeneration);
  } catch (e) {
    return {
      ok: false,
      error: `${e instanceof Error ? e.message : "השמירה נכשלה"}. הטיימר עדיין שמור.`,
      suggestedMinutes: Math.min(minutes, MAX_ENTRY_MINUTES),
    };
  }
  return { ok: true, minutes, tanitDibur: !!res.tanitDibur };
}

const STALE_SESSION_MESSAGE = "הטיימר התחלף או הסתיים, ולכן ההצעה בוטלה";

export type TimerLimitVerdict = "none" | "auto-stop" | "decide";

/**
 * What to do about a session's time limit. Pure, so the rules can be tested:
 *  - under the limit (or no limit): nothing, the session is kept as it is;
 *  - over it, the timer's own learning screen open, and the limit was reached
 *    while it was being watched, not yet tried: stop and save by itself (v7);
 *  - over it in any other way (old timer found over the limit, another screen,
 *    an auto-stop that already ran): the person decides - nothing is saved or
 *    deleted silently.
 * A rejected stop (`hasSaveError`) shows its own message instead.
 */
export function timerLimitVerdict(i: {
  limitMinutes: number | undefined;
  elapsedMs: number;
  sawUnderLimit: boolean;
  autoStopAllowed: boolean;
  autoStopTried: boolean;
  hasSaveError: boolean;
}): TimerLimitVerdict {
  if (i.limitMinutes === undefined || i.elapsedMs / 60000 < i.limitMinutes) return "none";
  if (i.hasSaveError) return "none";
  if (i.autoStopAllowed && i.sawUnderLimit && !i.autoStopTried) return "auto-stop";
  return "decide";
}

/** A running timer whose time limit has already been passed, awaiting the user's decision. */
export type TimerOverrun = { limitMinutes: number; elapsedMinutes: number };

/**
 * The one place that turns the running timer into a saved learning entry, and
 * that enforces the configured time limit. Both the full learning screen and
 * the always-visible timer bar use it, so stopping behaves identically from
 * either.
 *
 * Time limit, exactly as in v7: the session stops and saves by itself ONLY when
 * the learning screen of the timer's own framework is open (`autoStop`) and the
 * limit is reached while it is watching. In every other case - another screen,
 * or an old timer that was already past its limit when the app was opened - no
 * entry is created silently: `overrun` is set and the person chooses
 * (saveToLimit / continueWithoutLimit / cancel). Nothing is saved or deleted
 * until then.
 */
export function useActiveTimer({ autoStop = true }: { autoStop?: boolean } = {}) {
  const timer = useTimer();
  const [now, setNow] = useState(Date.now());
  const viewed = useViewedFramework();
  const { state: gateState } = useStoreGate();
  const writable = gateState === "ready";

  // Nothing to tick while the timer is paused — the reading is frozen.
  useEffect(() => {
    if (!timer || isTimerPaused(timer)) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer]);

  // Set when the last stop was rejected; the session is still running. Tied
  // to the session it came from (generation): cancelling, stopping or starting
  // another session makes it disappear and keeps its suggestion from saving.
  const [rawSaveError, setSaveError] = useState<{
    error: string;
    suggestedMinutes: number;
    generation: number;
  } | null>(null);
  const saveError =
    rawSaveError && timer && rawSaveError.generation === getTimerGeneration() ? rawSaveError : null;
  useEffect(() => {
    if (rawSaveError && !saveError) setSaveError(null);
  }, [rawSaveError, saveError]);

  const save = async (minutesOverride?: number, generation = getTimerGeneration()) => {
    const r = await saveTimerResultAtomic(minutesOverride, generation);
    if (r.ok) {
      setSaveError(null);
      if (r.minutes > 0)
        toast.success(
          r.tanitDibur
            ? `נשמרו ${r.minutes} דקות בתענית דיבור (נחשב ${r.minutes * 2})`
            : `נשמרו ${r.minutes} דקות`,
        );
    } else if (r.suggestedMinutes === 0) {
      setSaveError(null);
      toast.error(r.error);
    } else {
      setSaveError({
        error: r.error,
        suggestedMinutes: r.suggestedMinutes,
        generation: getTimerGeneration(),
      });
      toast.error(r.error);
    }
  };
  // No-arg on purpose: safe to pass straight to onClick.
  const stopAndSave = () => {
    void save();
  };
  // Refuses when the session the suggestion was made for is gone.
  const saveWithMinutes = (minutes: number) => {
    if (!saveError) {
      setSaveError(null);
      toast.error(STALE_SESSION_MESSAGE);
      return;
    }
    void save(minutes, saveError.generation);
  };
  // A refused write (the file is not usable) is an error the person sees, not a
  // success toast over an unchanged session.
  const attempt = (action: () => void, success: string, then?: () => void) => {
    try {
      action();
    } catch (e) {
      toast.error(writeFailureMessage(e));
      return;
    }
    then?.();
    toast(success);
  };
  const cancel = () => attempt(cancelTimer, "הטיימר בוטל ללא שמירה", () => setSaveError(null));
  const pause = () => attempt(pauseTimer, "הטיימר הושהה");
  const resume = () => attempt(resumeTimer, "הטיימר ממשיך", () => setNow(Date.now()));

  const paused = !!timer && isTimerPaused(timer);
  const elapsedMs = timer ? timerElapsedMs(timer, now) : 0;

  // The limit counts as "reached while watching" only if this window saw the
  // session still under it first. A session found already over the limit (an
  // old timer, an app opened after it ran out) never auto-saves.
  const generation = getTimerGeneration();
  const underLimitNow =
    timerLimitVerdict({
      limitMinutes: timer?.limitMinutes,
      elapsedMs,
      sawUnderLimit: false,
      autoStopAllowed: false,
      autoStopTried: false,
      hasSaveError: false,
    }) === "none";
  const [sawUnderLimit, setSawUnderLimit] = useState<number | null>(null);
  useEffect(() => {
    if (timer && underLimitNow) setSawUnderLimit(generation);
  }, [timer, underLimitNow, generation]);

  // Once per session. A failed save puts the session back, which flips the
  // verdict off and on again; without this the effect would retry forever.
  const [autoStopTried, setAutoStopTried] = useState<number | null>(null);
  const verdict = timerLimitVerdict({
    limitMinutes: timer?.limitMinutes,
    elapsedMs,
    sawUnderLimit: sawUnderLimit === generation,
    autoStopAllowed: autoStop && !!timer && viewed === timer.framework,
    autoStopTried: autoStopTried === generation,
    hasSaveError: !!saveError,
  });
  useEffect(() => {
    if (verdict !== "auto-stop" || !writable) return;
    setAutoStopTried(generation);
    stopAndSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict, writable]);

  const overrun: TimerOverrun | null =
    timer &&
    timer.limitMinutes !== undefined &&
    (verdict === "decide" || (verdict === "auto-stop" && !writable))
      ? { limitMinutes: timer.limitMinutes, elapsedMinutes: Math.floor(elapsedMs / 60000) }
      : null;

  return {
    timer,
    paused,
    elapsedMs,
    /** False while the data file is loading or unreadable: every action would be refused. */
    writable,
    stopAndSave,
    /** Non-null after a rejected stop (session kept): show `error`, offer saveWithMinutes(suggestedMinutes). */
    saveError,
    saveWithMinutes,
    dismissSaveError: () => setSaveError(null),
    /** Non-null for a timer past its limit that nobody decided about yet. */
    overrun,
    /** "שמור עד המגבלה": the same save as a stop - minutes = min(elapsed, limit), as in v7. */
    saveToLimit: stopAndSave,
    /** "המשך ללא מגבלה": removes only the limit; startedAt and the time banked stay. */
    continueWithoutLimit: () => attempt(removeTimerLimit, "הטיימר ממשיך ללא מגבלה"),
    cancel,
    pause,
    resume,
  };
}

// Which framework the learning screen is showing right now (null elsewhere).
// The timer bar uses it to appear on /learning only when the running timer
// belongs to a framework that is not on screen.
let viewedFramework: LearningFramework | null = null;
const viewedListeners = new Set<() => void>();
export function setViewedFramework(fw: LearningFramework | null) {
  if (viewedFramework === fw) return;
  viewedFramework = fw;
  viewedListeners.forEach((l) => l());
}
export function useViewedFramework(): LearningFramework | null {
  return useSyncExternalStore(
    (l) => {
      viewedListeners.add(l);
      return () => viewedListeners.delete(l);
    },
    () => viewedFramework,
    () => null,
  );
}

export function formatElapsed(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
