import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Plus,
  Play,
  Pause,
  Square,
  Timer,
  Clock,
  Hourglass,
  MicOff,
  ChevronLeft,
} from "lucide-react";
import {
  useLearning,
  useTimer,
  todayISO,
  newId,
  FRAMEWORK_LABELS,
  hhmmToMin,
  effectiveLearningMin,
  startTimer,
  type LearningFramework,
} from "@/lib/kollel-store";
import { isBeinHazmanim } from "@/lib/hebrew-calendar";
import { currentMonthKey, monthKeyLabel } from "@/lib/month-nav";
import { Button } from "@/components/ui/button";
import { PageSection, LedgerRow, Notice, EmptyNote, Figure } from "@/components/ui/ledger";
import { formatElapsed, useActiveTimer, setViewedFramework } from "@/components/timer-actions";
import { TimerOverrunDecision } from "@/components/timer-overrun";
import { writeFailureMessage } from "@/lib/store-gate";
import { toast } from "sonner";
import { CONFLICT_SAVE_TEXT } from "@/lib/save-conflicts";

export const Route = createFileRoute("/learning")({
  head: () => ({ meta: [{ title: "לימוד נוסף — המעקב שלי" }] }),
  component: LearningPage,
});

const FRAMEWORKS: LearningFramework[] = ["kollel-erev", "torato-beyado", "bein-hazmanim"];

// Two different numbers are shown on this screen and they must never be
// confused: what was actually learned, and what counts toward the totals
// (double for a minute learned at home in a fast of speech).
const ACTUAL_LABEL = "זמן שנלמד בפועל";
const CREDITED_LABEL = "זמן מזכה לצורך חישוב";

type Method = "timer" | "minutes" | "range";
const METHODS: { id: Method; label: string; icon: typeof Timer }[] = [
  { id: "timer", label: "טיימר", icon: Timer },
  { id: "minutes", label: "דקות", icon: Hourglass },
  { id: "range", label: "טווח שעות", icon: Clock },
];

function MethodPicker({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKeyDown = (e: KeyboardEvent) => {
    const rtl = document.documentElement.dir === "rtl";
    let step = 0;
    if (e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight")) step = 1;
    else if (e.key === "ArrowUp" || e.key === (rtl ? "ArrowRight" : "ArrowLeft")) step = -1;
    else return;
    e.preventDefault();
    const i = METHODS.findIndex((m) => m.id === value);
    const next = METHODS[(i + step + METHODS.length) % METHODS.length].id;
    onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="שיטת רישום"
      onKeyDown={onKeyDown}
      className="inline-flex gap-1 rounded-md border border-border bg-secondary/50 p-0.5"
    >
      {METHODS.map((m) => {
        const checked = value === m.id;
        return (
          <button
            key={m.id}
            ref={(el) => {
              refs.current[m.id] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(m.id)}
            className={`pressable inline-flex items-center gap-1.5 rounded-[4px] px-3.5 py-1.5 text-sm font-medium ${
              checked
                ? "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--color-primary)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <m.icon className="size-3.5" aria-hidden="true" />
            {m.label}
            {checked && <span className="sr-only"> (נבחר)</span>}
          </button>
        );
      })}
    </div>
  );
}

/** "נלמד בפועל" next to "מזכה לחישוב"; the credited line says why when it differs. */
function MinutesPair({ actual, doubled }: { actual: number; doubled: boolean }) {
  return (
    <div className="ledger text-sm" aria-live="polite">
      <LedgerRow label={ACTUAL_LABEL}>
        {actual} <span className="text-xs font-normal">דק׳</span>
      </LedgerRow>
      <LedgerRow
        label={CREDITED_LABEL}
        note={doubled ? "תענית דיבור — כל דקה נחשבת כפול" : undefined}
      >
        {doubled ? actual * 2 : actual} <span className="text-xs font-normal">דק׳</span>
      </LedgerRow>
    </div>
  );
}

function FrameworkPanel({ fw, enabled }: { fw: LearningFramework; enabled: boolean }) {
  const { addChecked, items } = useLearning();
  const [method, setMethod] = useState<Method>("timer");
  const [minutes, setMinutes] = useState(60);
  const [fromT, setFromT] = useState("20:00");
  const [toT, setToT] = useState("21:00");
  const [limitOn, setLimitOn] = useState(false);
  const [limitMin, setLimitMin] = useState(60);
  const [tanitDibur, setTanitDibur] = useState(false);
  const {
    timer,
    paused,
    elapsedMs,
    writable,
    overrun,
    saveToLimit,
    continueWithoutLimit,
    stopAndSave,
    saveError,
    saveWithMinutes,
    dismissSaveError,
    cancel,
    pause,
    resume,
  } = useActiveTimer();

  // There is deliberately no `beforeunload` guard here. The session is a pair
  // of timestamps in the shared data file (see startTimer/timerElapsedMs in
  // src/lib/kollel-store.ts), so it keeps running with the app shut and is
  // still there, still counting, when it is opened again.

  const tanitOn = fw === "kollel-erev" && tanitDibur;

  const addManual = async () => {
    if (!enabled) return;
    try {
      const outcome = await addChecked({
        id: newId(),
        framework: fw,
        date: todayISO(),
        minutes,
        source: "manual",
        ...(tanitOn ? { tanitDibur: true } : {}),
      });
      if (!outcome.complete) {
        toast.warning(CONFLICT_SAVE_TEXT);
        return;
      }
      toast.success(tanitOn ? `נוסף (בתענית דיבור — נחשב ${minutes * 2} דק׳)` : "נוסף");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    }
  };

  const rangeA = hhmmToMin(fromT);
  const rangeB = hhmmToMin(toT);
  const rangeValid = rangeA !== null && rangeB !== null && rangeB > rangeA;
  const rangeMin = rangeValid ? rangeB - rangeA : 0;

  const addRange = async () => {
    if (!enabled) return;
    if (!rangeValid) {
      toast.error("טווח שעות לא תקין");
      return;
    }
    try {
      const outcome = await addChecked({
        id: newId(),
        framework: fw,
        date: todayISO(),
        minutes: rangeMin,
        source: "range",
        ...(tanitOn ? { tanitDibur: true } : {}),
      });
      if (!outcome.complete) {
        toast.warning(CONFLICT_SAVE_TEXT);
        return;
      }
      toast.success(tanitOn ? `נוסף (בתענית דיבור — נחשב ${rangeMin * 2} דק׳)` : "נוסף");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    }
  };

  const onStartTimer = () => {
    if (!enabled) return;
    if (timer) {
      toast.warning("טיימר אחר פעיל");
      return;
    }
    try {
      startTimer(fw, {
        limitMinutes: limitOn ? Math.max(1, limitMin) : undefined,
        tanitDibur: fw === "kollel-erev" ? tanitDibur : false,
      });
    } catch (e) {
      toast.error(writeFailureMessage(e));
      return;
    }
    toast.success("הטיימר הופעל");
  };

  // The month, not everything ever recorded: this panel answers "how am I doing
  // this month", not a running total since the app was installed.
  const monthKey = currentMonthKey();
  const fwItems = items.filter((i) => i.framework === fw && i.date.startsWith(monthKey));
  const myItems = fwItems.slice(0, 8);
  const effectiveTotalMin = fwItems.reduce((s, i) => s + effectiveLearningMin(i), 0);
  const actualTotalMin = fwItems.reduce((s, i) => s + i.minutes, 0);
  const tanitMin = fwItems.filter((i) => i.tanitDibur).reduce((s, i) => s + i.minutes, 0);
  const allTimeMin = items
    .filter((i) => i.framework === fw)
    .reduce((s, i) => s + effectiveLearningMin(i), 0);

  const isMine = timer?.framework === fw;
  const elapsedMin = Math.floor(elapsedMs / 60000);

  // Showing a running session is separate from being allowed to start a new
  // one: a timer whose framework is out of season (bein hazmanim) must still
  // be stoppable, pausable and cancellable from its own panel.
  const timerSection = isMine && (
    <section
      aria-label="הטיימר הפעיל"
      className={`border-y-2 py-5 ${paused ? "border-warning" : "border-primary"}`}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <div className="eyebrow">{FRAMEWORK_LABELS[fw]}</div>
          <div
            className={`figure mt-1 text-6xl font-semibold ${paused ? "text-muted-foreground" : ""}`}
            dir="ltr"
            role="timer"
            aria-label={`זמן שחלף ${formatElapsed(elapsedMs)}`}
          >
            {formatElapsed(elapsedMs)}
          </div>
          <div
            className={`mt-1 flex items-center gap-1.5 text-sm font-medium ${paused ? "text-warning-fg" : "text-primary"}`}
          >
            {paused ? (
              <>
                <Pause className="size-3.5" aria-hidden="true" /> מושהה — הזמן אינו נצבר כרגע
              </>
            ) : (
              <>
                <Play className="size-3.5" aria-hidden="true" /> פעיל
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={stopAndSave} disabled={!writable}>
            <Square aria-hidden="true" /> עצור ושמור
          </Button>
          {paused ? (
            <Button variant="outline" onClick={resume} disabled={!writable}>
              <Play aria-hidden="true" /> המשך
            </Button>
          ) : (
            <Button variant="outline" onClick={pause} disabled={!writable}>
              <Pause aria-hidden="true" /> השהה
            </Button>
          )}
          <Button variant="ghost" onClick={cancel} disabled={!writable}>
            בטל ללא שמירה
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        {timer!.limitMinutes !== undefined && (
          <div>
            מוגבל ל־<span className="figure">{timer!.limitMinutes}</span> דק׳ · נותרו{" "}
            <span className="figure">{Math.max(0, timer!.limitMinutes - elapsedMin)}</span> דק׳
          </div>
        )}
        {timer!.tanitDibur && (
          <div className="flex items-center gap-1.5 font-medium text-primary">
            <MicOff className="size-3.5" aria-hidden="true" />
            תענית דיבור — {CREDITED_LABEL} יהיה כפול מ{ACTUAL_LABEL}
          </div>
        )}
        <div>אפשר לסגור את התוכנה — הטיימר ממשיך לרוץ וימתין לך פתוח בפתיחה הבאה.</div>
      </div>
      {overrun && (
        <TimerOverrunDecision
          className="mt-4"
          overrun={overrun}
          disabled={!writable}
          onSaveToLimit={saveToLimit}
          onContinue={continueWithoutLimit}
          onCancel={cancel}
        />
      )}
      {saveError && (
        <div className="mt-4">
          <Notice
            tone="danger"
            title="השמירה נדחתה — הטיימר עדיין פועל"
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => saveWithMinutes(saveError.suggestedMinutes)}>
                  שמור <span className="figure">{saveError.suggestedMinutes}</span> דק׳
                </Button>
                <Button size="sm" variant="outline" onClick={dismissSaveError}>
                  השאר פועל
                </Button>
              </div>
            }
          >
            {saveError.error}
          </Notice>
        </div>
      )}
    </section>
  );

  if (!enabled) {
    return (
      <div className="stack-gap">
        {timerSection}
        <Notice tone="warning" title="מסגרת זו אינה פעילה כעת">
          בין הזמנים זמינה רק בתקופתה (אב מי׳ ואילך, תשרי מי״א ואילך, ניסן).
        </Notice>
      </div>
    );
  }

  const fieldLabel = "text-sm text-muted-foreground block mb-1";

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="stack-gap">
        {timerSection}

        <section aria-label="רישום לימוד" className="stack-gap">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground" id="method-label">
              איך לרשום?
            </span>
            <MethodPicker value={method} onChange={setMethod} />
          </div>

          <div className="space-y-4 rounded-md border border-border bg-card p-4">
            {fw === "kollel-erev" && (
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={tanitDibur}
                  onChange={(e) => setTanitDibur(e.target.checked)}
                />
                <span>
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <MicOff className="size-3.5" aria-hidden="true" />
                    לימוד בבית בתענית דיבור
                  </span>{" "}
                  <span className="text-muted-foreground">
                    (כל דקה נחשבת כפול — {CREDITED_LABEL} גדול מ{ACTUAL_LABEL})
                  </span>
                </span>
              </label>
            )}

            {method === "minutes" && (
              <div className="space-y-3">
                <div>
                  <label htmlFor={`min-${fw}`} className={fieldLabel}>
                    כמה דקות למדת
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={`min-${fw}`}
                      type="number"
                      min={1}
                      value={minutes}
                      onChange={(e) => setMinutes(Math.max(1, +e.target.value || 1))}
                      className="field-input figure w-32"
                    />
                    <Button onClick={addManual}>
                      <Plus aria-hidden="true" /> הוסף
                    </Button>
                  </div>
                </div>
                <MinutesPair actual={minutes} doubled={tanitOn} />
              </div>
            )}

            {method === "range" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor={`from-${fw}`} className={fieldLabel}>
                      משעה
                    </label>
                    <input
                      id={`from-${fw}`}
                      type="time"
                      value={fromT}
                      onChange={(e) => setFromT(e.target.value)}
                      className="field-input figure w-32"
                    />
                  </div>
                  <div>
                    <label htmlFor={`to-${fw}`} className={fieldLabel}>
                      עד שעה
                    </label>
                    <input
                      id={`to-${fw}`}
                      type="time"
                      value={toT}
                      onChange={(e) => setToT(e.target.value)}
                      className="field-input figure w-32"
                    />
                  </div>
                  <Button onClick={addRange} disabled={!rangeValid}>
                    <Plus aria-hidden="true" /> הוסף טווח
                  </Button>
                </div>
                {rangeValid ? (
                  <MinutesPair actual={rangeMin} doubled={tanitOn} />
                ) : (
                  <p role="alert" className="text-sm font-medium text-warning-fg">
                    טווח שעות לא תקין — שעת הסיום חייבת לבוא אחרי ההתחלה
                  </p>
                )}
              </div>
            )}

            {method === "timer" && !isMine && (
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={limitOn}
                    onChange={(e) => setLimitOn(e.target.checked)}
                  />
                  הגבל את הטיימר לפרק זמן
                </label>
                {limitOn && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      aria-label="הגבלת הטיימר בדקות"
                      value={limitMin}
                      onChange={(e) => setLimitMin(Math.max(1, +e.target.value || 1))}
                      className="field-input figure w-28"
                    />
                    <span className="text-sm text-muted-foreground">
                      דקות · הטיימר ייעצר וישמר אוטומטית כשמסך זה פתוח; אחרת תתבקש להחליט
                    </span>
                  </div>
                )}
                <Button onClick={onStartTimer} disabled={!!timer || !writable}>
                  <Play aria-hidden="true" />
                  {timer ? `טיימר פעיל ב${FRAMEWORK_LABELS[timer.framework]}` : "התחל טיימר"}
                </Button>
              </div>
            )}
            {method === "timer" && isMine && (
              <p className="text-sm text-muted-foreground">
                הטיימר רץ — השליטה בו למעלה. אפשר להוסיף כאן רישום ידני בדקות או בטווח שעות.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="stack-gap">
        <PageSection title={`סיכום ${monthKeyLabel(monthKey)}`}>
          <Figure
            label={CREDITED_LABEL}
            value={(effectiveTotalMin / 60).toFixed(1)}
            unit="שע׳"
            size="lg"
            note={`${effectiveTotalMin} דקות · ${fwItems.length} רישומים החודש`}
          />
          {tanitMin > 0 && (
            <div className="mt-3 ledger">
              <LedgerRow label={ACTUAL_LABEL}>{actualTotalMin} דק׳</LedgerRow>
              <LedgerRow
                label={CREDITED_LABEL}
                note={`ההפרש נובע מתענית דיבור: ${tanitMin} דק׳ שנלמדו נחשבות כ־${tanitMin * 2}`}
              >
                {effectiveTotalMin} דק׳
              </LedgerRow>
            </div>
          )}
          {allTimeMin > effectiveTotalMin && (
            <p className="mt-2 text-sm text-muted-foreground">
              מאז תחילת השימוש: {(allTimeMin / 60).toFixed(1)} שע׳ מזכות במסגרת זו
            </p>
          )}
        </PageSection>

        <PageSection title="רישומי החודש">
          {myItems.length ? (
            <ul className="ledger">
              {myItems.map((i) => (
                <li key={i.id}>
                  <LedgerRow
                    label={<span className="figure">{i.date}</span>}
                    note={
                      i.tanitDibur ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <MicOff className="size-3" aria-hidden="true" />
                          תענית דיבור · מזכה {i.minutes * 2} דק׳
                        </span>
                      ) : undefined
                    }
                  >
                    {i.minutes} <span className="text-xs font-normal">דק׳</span>
                  </LedgerRow>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote title="אין רישומים החודש">לא נרשם לימוד במסגרת זו מתחילת החודש.</EmptyNote>
          )}
        </PageSection>
      </div>
    </div>
  );
}

function LearningPage() {
  const runningTimer = useTimer();
  // Open on the framework whose timer is running, so stop and pause are here.
  const [active, setActive] = useState<LearningFramework>(runningTimer?.framework ?? "kollel-erev");
  const { items } = useLearning();
  const beinHaz = isBeinHazmanim();

  // Tells the timer bar which framework is on screen: the bar appears here
  // only when the running timer is for a different one.
  useEffect(() => {
    setViewedFramework(active);
    return () => setViewedFramework(null);
  }, [active]);

  return (
    <AppShell title="לימוד נוסף" subtitle="מסגרות לימוד מחוץ לסדרים">
      <div className="stack-gap">
        <div
          role="group"
          aria-label="מסגרת לימוד"
          className="flex flex-wrap gap-x-6 border-b border-border"
        >
          {FRAMEWORKS.map((fw) => {
            const on = active === fw;
            return (
              <button
                key={fw}
                type="button"
                onClick={() => setActive(fw)}
                aria-pressed={on}
                className={`pressable -mb-px border-b-2 px-1 py-2 text-sm ${
                  on
                    ? "border-primary font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {FRAMEWORK_LABELS[fw]}
                {runningTimer?.framework === fw && (
                  <span className="ms-1.5 text-xs font-medium text-primary">(טיימר פעיל)</span>
                )}
                {fw === "bein-hazmanim" && !beinHaz && (
                  <span className="ms-1.5 text-xs text-muted-foreground">(לא בעונה)</span>
                )}
              </button>
            );
          })}
        </div>

        <FrameworkPanel fw={active} enabled={active !== "bein-hazmanim" || beinHaz} />

        {/* The full record list — search, month/framework filters, editing and
            delete — lives in History. This screen is for logging time. */}
        <PageSection>
          <Link
            to="/history"
            className="pressable-lg -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-accent"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold">כל רישומי הלימוד</span>
              <span className="block text-sm text-muted-foreground">
                {items.length} רישומים · חיפוש, סינון, עריכה ומחיקה — במסך ההיסטוריה
              </span>
            </span>
            <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </PageSection>
      </div>
    </AppShell>
  );
}
