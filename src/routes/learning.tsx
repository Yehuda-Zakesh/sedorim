import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Plus, Play, Pause, Square, AlertTriangle, BookOpen, Timer, MicOff, ChevronLeft, Info } from "lucide-react";
import {
  useLearning, todayISO, newId, FRAMEWORK_LABELS, hhmmToMin, effectiveLearningMin,
  useTimer, startTimer, stopTimer, cancelTimer, pauseTimer, resumeTimer,
  timerElapsedMs, isTimerPaused,
  type LearningFramework,
} from "@/lib/kollel-store";
import { isBeinHazmanim } from "@/lib/hebrew-calendar";
import { currentMonthKey, monthKeyLabel } from "@/lib/month-nav";
import { IconBadge } from "@/components/ui/stat";
import { toast } from "sonner";

export const Route = createFileRoute("/learning")({
  head: () => ({ meta: [{ title: "לימוד נוסף — המעקב שלי" }] }),
  component: LearningPage,
});

const FRAMEWORKS: LearningFramework[] = ["kollel-erev", "torato-beyado", "bein-hazmanim"];

function FrameworkPanel({ fw, enabled }: { fw: LearningFramework; enabled: boolean }) {
  const { add, items } = useLearning();
  const [minutes, setMinutes] = useState(60);
  const [fromT, setFromT] = useState("20:00");
  const [toT, setToT] = useState("21:00");
  const [limitOn, setLimitOn] = useState(false);
  const [limitMin, setLimitMin] = useState(60);
  const [tanitDibur, setTanitDibur] = useState(false);
  const timer = useTimer();
  const [now, setNow] = useState(Date.now());

  // Nothing to tick while the timer is paused — the reading is frozen.
  useEffect(() => {
    if (!timer || isTimerPaused(timer)) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer]);

  // There is deliberately no `beforeunload` guard here any more. It existed to
  // stop the user closing the window mid-session, on the belief that closing
  // the app would lose the timer — which was never true. The session is a pair
  // of timestamps in the shared data file (see startTimer/timerElapsedMs in
  // src/lib/kollel-store.ts), so it keeps running with the app shut and is
  // still there, still counting, when it is opened again.

  const addManual = () => {
    if (!enabled) return;
    try {
      add({ id: newId(), framework: fw, date: todayISO(), minutes, source: "manual" });
      toast.success("נוסף");
    } catch (e) { toast.error(e instanceof Error ? e.message : "שגיאה"); }
  };

  const addRange = () => {
    if (!enabled) return;
    const a = hhmmToMin(fromT), b = hhmmToMin(toT);
    if (a === null || b === null || b <= a) { toast.error("טווח שעות לא תקין"); return; }
    try {
      add({ id: newId(), framework: fw, date: todayISO(), minutes: b - a, source: "range" });
      toast.success("נוסף");
    } catch (e) { toast.error(e instanceof Error ? e.message : "שגיאה"); }
  };

  const onStartTimer = () => {
    if (!enabled) return;
    if (timer) { toast.warning("טיימר אחר פעיל"); return; }
    startTimer(fw, {
      limitMinutes: limitOn ? Math.max(1, limitMin) : undefined,
      tanitDibur: fw === "kollel-erev" ? tanitDibur : false,
    });
    toast.success("הטיימר הופעל");
  };
  const onStopTimer = () => {
    const res = stopTimer();
    if (res) {
      add({
        id: newId(), framework: res.framework, date: todayISO(),
        minutes: res.minutes, source: "timer",
        ...(res.tanitDibur ? { tanitDibur: true } : {}),
      });
      toast.success(
        res.tanitDibur
          ? `נשמרו ${res.minutes} דקות בתענית דיבור (נחשב ${res.minutes * 2})`
          : `נשמרו ${res.minutes} דקות`
      );
    }
  };
  const onCancelTimer = () => { cancelTimer(); toast("הטיימר בוטל ללא שמירה"); };
  const onPauseTimer = () => { pauseTimer(); toast("הטיימר הושהה"); };
  const onResumeTimer = () => { resumeTimer(); setNow(Date.now()); toast("הטיימר ממשיך"); };

  // The month, not everything ever recorded. This panel is read while logging
  // today's learning, and the question it is being asked is "how am I doing
  // this month" — a running total since the app was installed answers a
  // question nobody asked and grows past the point of meaning anything.
  const monthKey = currentMonthKey();
  const fwItems = items.filter((i) => i.framework === fw && i.date.startsWith(monthKey));
  const myItems = fwItems.slice(0, 8);
  const effectiveTotalMin = fwItems.reduce((s, i) => s + effectiveLearningMin(i), 0);
  const tanitMin = fwItems.filter((i) => i.tanitDibur).reduce((s, i) => s + i.minutes, 0);
  const allTimeMin = items
    .filter((i) => i.framework === fw)
    .reduce((s, i) => s + effectiveLearningMin(i), 0);

  const isMine = timer?.framework === fw;
  const paused = isMine && isTimerPaused(timer!);
  const elapsedMs = isMine ? timerElapsedMs(timer!, now) : 0;
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const elapsedSec = Math.floor((elapsedMs % 60000) / 1000);
  const limitReached = isMine && timer!.limitMinutes !== undefined
    && elapsedMs / 60000 >= timer!.limitMinutes;

  // Auto-stop when the configured limit is reached.
  useEffect(() => {
    if (limitReached) onStopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitReached]);

  if (!enabled) {
    return (
      <div className="card-surface p-6 text-center text-sm text-muted-foreground">
        <AlertTriangle className="size-5 mx-auto mb-2 text-warning-fg" />
        מסגרת זו זמינה רק בתקופת בין הזמנים (אב מי׳ ואילך, תשרי מי״א ואילך, ניסן).
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="card-surface p-5 lg:col-span-2 space-y-4">
        {isMine && (
          <div className={`rounded-lg border-2 p-4 ${paused ? "border-border bg-muted/40" : "border-primary/40 bg-primary/5"}`}>
            {/* What this used to say — "אל תסגור את האפליקציה, סגירה תעצור את
                הטיימר" — was simply not true, and it warned people away from
                closing a window they were free to close. The session lives in
                the shared data file as a start timestamp, so the clock keeps
                running with the app shut. */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Info className="size-4 shrink-0" />
              אפשר לסגור את התוכנה — הטיימר ממשיך לרוץ וימתין לך פתוח בפתיחה הבאה
            </div>
            <div className={`text-3xl font-bold tabular-nums ${paused ? "text-muted-foreground" : ""}`}>
              {String(elapsedMin).padStart(2, "0")}:{String(elapsedSec).padStart(2, "0")}
            </div>
            {paused && (
              <div className="mt-1 text-2xs font-medium text-warning-fg flex items-center gap-1">
                <Pause className="size-3" /> מושהה — הזמן אינו נצבר כרגע
              </div>
            )}
            {timer!.limitMinutes !== undefined && (
              <div className="mt-1 text-2xs text-muted-foreground">
                מוגבל ל־{timer!.limitMinutes} דק׳ · נותרו {Math.max(0, timer!.limitMinutes - elapsedMin)} דק׳
              </div>
            )}
            {timer!.tanitDibur && (
              <div className="mt-1 text-2xs text-primary font-medium flex items-center gap-1">
                <MicOff className="size-3" /> תענית דיבור — הזמן ייספר כפול בסיכום
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={onStopTimer}
                className="inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-medium text-success-foreground">
                <Square className="size-3.5" /> עצור ושמור
              </button>
              {paused ? (
                <button onClick={onResumeTimer}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                  <Play className="size-3.5" /> המשך
                </button>
              ) : (
                <button onClick={onPauseTimer}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">
                  <Pause className="size-3.5" /> השהה
                </button>
              )}
              <button onClick={onCancelTimer}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">בטל</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground mb-2">הוספה ידנית</div>
            <div className="flex gap-2">
              <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(Math.max(1, +e.target.value || 1))}
                className="field-input flex-1" />
              <button onClick={addManual}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
                <Plus className="size-3.5 inline" /> הוסף
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground mb-2">לפי טווח שעות</div>
            <div className="flex flex-wrap items-center gap-1">
              <input type="time" value={fromT} onChange={(e) => setFromT(e.target.value)}
                className="field-input min-w-0 flex-1 basis-[6rem] tabular-nums" />
              <span className="text-xs shrink-0">→</span>
              <input type="time" value={toT} onChange={(e) => setToT(e.target.value)}
                className="field-input min-w-0 flex-1 basis-[6rem] tabular-nums" />
              <button onClick={addRange}
                className="shrink-0 rounded-md bg-primary px-2 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {!isMine && (
          <div className="space-y-2">
            <div className="rounded-lg border border-border p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={limitOn} onChange={(e) => setLimitOn(e.target.checked)} />
                <Timer className="size-3.5" />
                הגבל את הטיימר לפרק זמן
              </label>
              {limitOn && (
                <div className="flex items-center gap-2 pe-6">
                  <input type="number" min={1} value={limitMin}
                    onChange={(e) => setLimitMin(Math.max(1, +e.target.value || 1))}
                    className="field-input w-24" />
                  <span className="text-xs text-muted-foreground">דקות · הטיימר ייעצר וישמר אוטומטית</span>
                </div>
              )}
              {fw === "kollel-erev" && (
                <label className="flex items-center gap-2 text-xs cursor-pointer pt-1 border-t border-border/50">
                  <input type="checkbox" checked={tanitDibur} onChange={(e) => setTanitDibur(e.target.checked)} />
                  <MicOff className="size-3.5" />
                  לימוד בבית בתענית דיבור <span className="text-muted-foreground">(כל דקה נחשבת כפול בסיכום)</span>
                </label>
              )}
            </div>
            <button onClick={onStartTimer} disabled={!!timer}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary/40 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50">
              <Play className="size-4" /> {timer ? "טיימר אחר פעיל" : "התחל טיימר"}
            </button>
          </div>
        )}
      </div>

      <div className="card-surface p-5">
        <div className="text-xs text-muted-foreground">סה״כ ב{monthKeyLabel(monthKey)}</div>
        <div className="text-3xl font-bold tabular-nums mt-1">{(effectiveTotalMin / 60).toFixed(1)} <span className="text-sm text-muted-foreground">שע׳</span></div>
        <div className="text-xs text-muted-foreground mt-1">{effectiveTotalMin} דקות · {fwItems.length} רישומים החודש</div>
        {tanitMin > 0 && (
          <div className="mt-2 rounded-md bg-primary/5 border border-primary/20 p-2 text-2xs text-primary flex items-start gap-1.5">
            <MicOff className="size-3 mt-0.5 shrink-0" />
            <span>נלמדו {tanitMin} דק׳ בתענית דיבור · נחשב כ־{tanitMin * 2} דק׳</span>
          </div>
        )}
        {allTimeMin > effectiveTotalMin && (
          <div className="mt-2 text-2xs text-muted-foreground">
            מאז תחילת השימוש: {(allTimeMin / 60).toFixed(1)} שע׳ במסגרת זו
          </div>
        )}

        <h3 className="text-sm font-semibold mt-5 mb-2">רישומי החודש</h3>
        {myItems.length ? (
          <ul className="space-y-2">
            {myItems.map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-xs">
                {i.tanitDibur
                  ? <MicOff className="size-3.5 text-primary" />
                  : <BookOpen className="size-3.5 text-muted-foreground" />}
                <span className="flex-1 tabular-nums">{i.date}</span>
                <span className="font-medium">
                  {i.minutes} דק׳{i.tanitDibur && <span className="text-primary"> ×2</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : <div className="text-xs text-muted-foreground">אין רישומים החודש</div>}
      </div>
    </div>
  );
}

function LearningPage() {
  const [active, setActive] = useState<LearningFramework>("kollel-erev");
  const { items } = useLearning();
  const beinHaz = isBeinHazmanim();

  return (
    <AppShell title="לימוד נוסף" subtitle="מסגרות לימוד מחוץ לסדרים">
      <div className="card-surface p-1 mb-4 inline-flex gap-1">
        {FRAMEWORKS.map((fw) => (
          <button key={fw} onClick={() => setActive(fw)}
            className={`px-4 py-2 rounded-md text-sm pressable transition ${active === fw ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"}`}>
            {FRAMEWORK_LABELS[fw]}
            {fw === "bein-hazmanim" && !beinHaz && <span className="ms-1 text-2xs opacity-60">(לא בעונה)</span>}
          </button>
        ))}
      </div>

      <FrameworkPanel fw={active} enabled={active !== "bein-hazmanim" || beinHaz} />

      {/* The full record list — with search, month/framework filters and delete
          — lives in History. This screen is for *logging* time, so it links
          there rather than carrying a second, weaker copy of the same table. */}
      <Link to="/history"
        className="card-surface mt-4 p-4 flex items-center gap-3 hover:border-primary pressable-lg">
        <IconBadge icon={BookOpen} size="md" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">כל רישומי הלימוד</div>
          <div className="text-xs text-muted-foreground">
            {items.length} רישומים · חיפוש, סינון לפי חודש ומסגרת, ומחיקה — במסך ההיסטוריה
          </div>
        </div>
        <ChevronLeft className="size-4 text-muted-foreground shrink-0" />
      </Link>
    </AppShell>
  );
}
