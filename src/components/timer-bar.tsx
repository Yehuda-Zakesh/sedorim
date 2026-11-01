import { Link, useRouterState } from "@tanstack/react-router";
import { Pause, Play, Square, MicOff } from "lucide-react";
import { FRAMEWORK_LABELS } from "@/lib/kollel-store";
import { formatElapsed, useActiveTimer, useViewedFramework } from "./timer-actions";
import { TimerOverrunDecision } from "./timer-overrun";

/**
 * A compact strip, inside the sticky header, showing the running timer so it
 * can be seen and stopped from any screen. On /learning it appears only when
 * the running timer belongs to a framework other than the one on screen — when
 * it is the one on screen, the screen itself puts the timer in the foreground.
 */
export function TimerBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onLearning = pathname.startsWith("/learning");
  const viewed = useViewedFramework();
  // The bar never stops a session by itself (autoStop off): v7 auto-saved only
  // from the timer's own learning screen. A timer past its limit shows an
  // explicit decision here instead of a silent save.
  const {
    timer,
    writable,
    overrun,
    saveToLimit,
    continueWithoutLimit,
    cancel,
    paused,
    elapsedMs,
    stopAndSave,
    pause,
    resume,
    saveError,
    saveWithMinutes,
    dismissSaveError,
  } = useActiveTimer({ autoStop: false });
  if (!timer) return null;
  if (onLearning && viewed === timer.framework) return null;

  const btn =
    "pressable inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium";

  return (
    <div role="region" aria-label="טיימר פעיל" className="border-t border-border bg-secondary">
      <div
        className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-s-4 px-[var(--density-page)] py-2 ${
          paused ? "border-s-warning" : "border-s-primary"
        }`}
      >
        <span className="text-sm font-medium">{FRAMEWORK_LABELS[timer.framework]}</span>
        <span
          className={`figure text-lg font-semibold ${paused ? "text-muted-foreground" : ""}`}
          dir="ltr"
        >
          {formatElapsed(elapsedMs)}
        </span>
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${paused ? "text-warning-fg" : "text-primary"}`}
        >
          {paused ? (
            <Pause className="size-3.5" aria-hidden="true" />
          ) : (
            <Play className="size-3.5" aria-hidden="true" />
          )}
          {paused ? "מושהה" : "פעיל"}
        </span>
        {timer.tanitDibur && (
          <span className="inline-flex items-center gap-1 text-xs text-primary">
            <MicOff className="size-3.5" aria-hidden="true" /> תענית דיבור
          </span>
        )}
        <div className="ms-auto flex items-center gap-2">
          {paused ? (
            <button
              type="button"
              onClick={resume}
              disabled={!writable}
              aria-label="המשך את הטיימר"
              className={`${btn} border border-input bg-card hover:bg-accent disabled:opacity-50`}
            >
              <Play className="size-3.5" aria-hidden="true" /> המשך
            </button>
          ) : (
            <button
              type="button"
              onClick={pause}
              disabled={!writable}
              aria-label="השהה את הטיימר"
              className={`${btn} border border-border hover:bg-accent disabled:opacity-50`}
            >
              <Pause className="size-3.5" aria-hidden="true" /> השהה
            </button>
          )}
          <button
            type="button"
            onClick={stopAndSave}
            disabled={!writable}
            aria-label="עצור ושמור את הטיימר"
            className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
          >
            <Square className="size-3.5" aria-hidden="true" /> עצור ושמור
          </button>
          {!onLearning && (
            <Link
              to="/learning"
              className={`${btn} border border-border hover:bg-accent`}
              aria-label="למסך הלימוד המלא"
            >
              למסך הלימוד
            </Link>
          )}
        </div>
      </div>
      {!writable && (
        <div
          role="alert"
          className="border-s-4 border-s-destructive px-[var(--density-page)] py-2 text-sm"
        >
          קובץ הנתונים אינו זמין כרגע — הטיימר לא ישתנה ושום דבר לא יישמר.
        </div>
      )}
      {overrun && (
        <TimerOverrunDecision
          overrun={overrun}
          disabled={!writable}
          onSaveToLimit={saveToLimit}
          onContinue={continueWithoutLimit}
          onCancel={cancel}
        />
      )}
      {saveError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-s-4 border-s-destructive px-[var(--density-page)] py-2"
        >
          <div className="min-w-0 text-sm">
            <span className="font-semibold">השמירה נדחתה — הטיימר עדיין פועל. </span>
            <span className="text-muted-foreground">{saveError.error}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => saveWithMinutes(saveError.suggestedMinutes)}
              className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              שמור <span className="figure">{saveError.suggestedMinutes}</span> דק׳
            </button>
            <button
              type="button"
              onClick={dismissSaveError}
              className={`${btn} border border-border hover:bg-accent`}
            >
              השאר פועל
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
