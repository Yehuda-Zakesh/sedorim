import type { TimerOverrun } from "./timer-actions";

/**
 * The explicit decision for a timer found past its time limit (an old timer
 * the app was reopened on, or a limit passed while another screen was open).
 * Nothing is saved or deleted until one of the three buttons is pressed.
 */
export function TimerOverrunDecision({
  overrun,
  onSaveToLimit,
  onContinue,
  onCancel,
  disabled,
  className = "",
}: {
  overrun: TimerOverrun;
  onSaveToLimit: () => void;
  onContinue: () => void;
  onCancel: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const btn =
    "pressable inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 border-s-4 border-s-warning px-[var(--density-page)] py-2 ${className}`}
    >
      <div className="min-w-0 text-sm">
        <span className="font-semibold">
          הטיימר חרג מהמגבלה (מגבלה <span className="figure">{overrun.limitMinutes}</span> דק׳, נצבר{" "}
          <span className="figure">{overrun.elapsedMinutes}</span> דק׳).{" "}
        </span>
        <span className="text-muted-foreground">שום דבר לא נשמר ולא נמחק עד שתבחר.</span>
        <ul className="mt-1 list-disc ps-5 text-muted-foreground">
          <li>
            <b className="text-foreground">שמור עד המגבלה:</b> יירשם לימוד של{" "}
            <span className="figure">{Math.min(overrun.elapsedMinutes, overrun.limitMinutes)}</span>{" "}
            דק׳; הזמן שמעבר למגבלה לא יירשם והטיימר ייסגר.
          </li>
          <li>
            <b className="text-foreground">המשך ללא מגבלה:</b> לא נרשם כלום עכשיו; כל הזמן שנצבר
            נשמר והטיימר ממשיך.
          </li>
          <li>
            <b className="text-foreground">בטל טיימר:</b> לא יירשם לימוד, והזמן שנצבר (
            <span className="figure">{overrun.elapsedMinutes}</span> דק׳) יימחק.
          </li>
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onSaveToLimit}
          className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          שמור עד המגבלה
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onContinue}
          className={`${btn} border border-border hover:bg-accent`}
        >
          המשך ללא מגבלה
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className={`${btn} border border-border hover:bg-accent`}
        >
          בטל טיימר
        </button>
      </div>
    </div>
  );
}
