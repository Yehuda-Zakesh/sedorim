import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Plus, Play, Square, Trash2, AlertTriangle, BookOpen } from "lucide-react";
import {
  useLearning, todayISO, newId, FRAMEWORK_LABELS, hhmmToMin,
  getTimer, startTimer, stopTimer, cancelTimer,
  type LearningFramework, type LearningEntry,
} from "@/lib/kollel-store";
import { isBeinHazmanim } from "@/lib/hebrew-calendar";
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
  const [timer, setTimer] = useState(getTimer());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer]);

  useEffect(() => {
    if (!timer) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [timer]);

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
    setTimer(startTimer(fw));
    toast.success("הטיימר הופעל");
  };
  const onStopTimer = () => {
    const res = stopTimer();
    setTimer(null);
    if (res) {
      add({ id: newId(), framework: res.framework, date: todayISO(), minutes: res.minutes, source: "timer" });
      toast.success(`נשמרו ${res.minutes} דקות`);
    }
  };
  const onCancelTimer = () => { cancelTimer(); setTimer(null); toast("הטיימר בוטל ללא שמירה"); };

  const myItems = items.filter((i) => i.framework === fw).slice(0, 8);
  const totalMin = items.filter((i) => i.framework === fw).reduce((s, i) => s + i.minutes, 0);
  const isMine = timer?.framework === fw;
  const elapsedMin = isMine ? Math.floor((now - timer!.startedAt) / 60000) : 0;
  const elapsedSec = isMine ? Math.floor(((now - timer!.startedAt) % 60000) / 1000) : 0;

  if (!enabled) {
    return (
      <div className="card-surface p-6 text-center text-sm text-muted-foreground">
        <AlertTriangle className="size-5 mx-auto mb-2 text-warning" />
        מסגרת זו זמינה רק בתקופת בין הזמנים (אב, אלול ט׳-ל׳, תשרי יא׳-ל׳, ניסן).
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="card-surface p-5 lg:col-span-2 space-y-4">
        {isMine && (
          <div className="rounded-lg border-2 border-warning bg-warning/5 p-4">
            <div className="flex items-center gap-2 text-warning text-xs font-medium mb-2">
              <AlertTriangle className="size-4" />
              אל תסגור את האפליקציה — סגירה תעצור את הטיימר
            </div>
            <div className="text-3xl font-bold tabular-nums">
              {String(elapsedMin).padStart(2, "0")}:{String(elapsedSec).padStart(2, "0")}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={onStopTimer}
                className="inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-medium text-success-foreground">
                <Square className="size-3.5" /> עצור ושמור
              </button>
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
                className="flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-sm" />
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
                className="min-w-0 flex-1 basis-[6rem] rounded-md border border-input bg-card px-2 py-1.5 text-sm" />
              <span className="text-xs shrink-0">→</span>
              <input type="time" value={toT} onChange={(e) => setToT(e.target.value)}
                className="min-w-0 flex-1 basis-[6rem] rounded-md border border-input bg-card px-2 py-1.5 text-sm" />
              <button onClick={addRange}
                className="shrink-0 rounded-md bg-primary px-2 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {!isMine && (
          <button onClick={onStartTimer} disabled={!!timer}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary/40 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50">
            <Play className="size-4" /> {timer ? "טיימר אחר פעיל" : "התחל טיימר"}
          </button>
        )}
      </div>

      <div className="card-surface p-5">
        <div className="text-xs text-muted-foreground">סה״כ במסגרת זו</div>
        <div className="text-3xl font-bold tabular-nums mt-1">{(totalMin / 60).toFixed(1)} <span className="text-sm text-muted-foreground">שע׳</span></div>
        <div className="text-xs text-muted-foreground mt-1">{totalMin} דקות · {items.filter((i) => i.framework === fw).length} רישומים</div>

        <h3 className="text-sm font-semibold mt-5 mb-2">רישומים אחרונים</h3>
        {myItems.length ? (
          <ul className="space-y-2">
            {myItems.map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-xs">
                <BookOpen className="size-3.5 text-muted-foreground" />
                <span className="flex-1 tabular-nums">{i.date}</span>
                <span className="font-medium">{i.minutes} דק׳</span>
              </li>
            ))}
          </ul>
        ) : <div className="text-xs text-muted-foreground">אין רישומים</div>}
      </div>
    </div>
  );
}

function LearningPage() {
  const [active, setActive] = useState<LearningFramework>("kollel-erev");
  const { items, remove } = useLearning();
  const beinHaz = isBeinHazmanim();

  return (
    <AppShell title="לימוד נוסף" subtitle="מסגרות לימוד מחוץ לסדרים">
      <div className="card-surface p-1 mb-4 inline-flex gap-1">
        {FRAMEWORKS.map((fw) => (
          <button key={fw} onClick={() => setActive(fw)}
            className={`px-4 py-2 rounded-md text-sm transition ${active === fw ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"}`}>
            {FRAMEWORK_LABELS[fw]}
            {fw === "bein-hazmanim" && !beinHaz && <span className="mr-1 text-[10px] opacity-60">(לא בעונה)</span>}
          </button>
        ))}
      </div>

      <FrameworkPanel fw={active} enabled={active !== "bein-hazmanim" || beinHaz} />

      <div className="card-surface p-5 mt-4">
        <h3 className="text-sm font-semibold mb-3">כל הרישומים</h3>
        {items.length ? (
          <ul className="divide-y divide-border">
            {items.slice(0, 30).map((i: LearningEntry) => (
              <li key={i.id} className="flex items-center gap-3 py-2">
                <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center">
                  <BookOpen className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{FRAMEWORK_LABELS[i.framework]}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">{i.date} · {i.minutes} דק׳ · {i.source === "timer" ? "טיימר" : i.source === "range" ? "טווח" : "ידני"}</div>
                </div>
                <button onClick={() => { remove(i.id); toast("נמחק"); }}
                  className="size-8 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : <div className="text-center text-sm text-muted-foreground py-6">אין רישומים</div>}
      </div>
    </AppShell>
  );
}
