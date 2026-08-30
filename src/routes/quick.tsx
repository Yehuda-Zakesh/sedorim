// The quick-entry window.
//
// Rewritten around one idea: someone walking into the beis medrash should be
// able to finish in one move, and should never have to open the main app for
// anything they do every day.
//
// So there is one field — the time — and the window works out the rest: which
// seder it belongs to, whether אוהבי ה׳ is even possible, what the departure
// must have been (see src/lib/quick-entry.ts). What used to be here — a card
// per seder, an arrival button and a departure button in each, a manual time
// editor behind a pencil icon, plus a separate "update in one click" path —
// asked the user to make four decisions to record one arrival.
//
// The two buttons beside it cover the rest of the day's reality: a justified
// lateness, and a seder missed. Three more reach the two learning frameworks
// and the month's figures, so the numbers are here too.
//
// The layout is two columns, and the window is wide rather than tall (940x660,
// set in src-tauri/core/src/lib.rs). It used to be a 480x760 phone-shaped
// column — taller than the usable height of a 1280x720 screen, so the window
// got capped and useFitToWindow then scaled the whole screen *down* to fit.
// A window whose entire purpose is to be read and answered in one glance was
// rendering smaller than everything around it. Laid out across the width it
// has, at 100%, nothing needs to shrink: the field on one side, the day's
// records and everything else on the other. Below 768 CSS pixels the two
// columns fold back into one.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Zap, Clock, LayoutDashboard, Check, FileText, UserX, Moon, BookOpen,
  BarChart3, X, Pencil, CalendarClock,
} from "lucide-react";
import {
  useSeder, useLearning, newId, hhmmToMin, calcSeder, summarizeEntries, entriesInMonth,
  effectiveLearningMin, type SederEntry, type SederNum, type LearningFramework,
} from "@/lib/kollel-store";
import { applyAppearance, getSederTimesFor, useSettings, SHAS_ARRIVAL_DEADLINE } from "@/lib/settings-store";
import {
  detectSeder, canBeOhevei, sederBounds, arrivalEntry, absenceEntry, withExcused,
  hhmmOf, parseLooseTime, type ExcusedChoice,
} from "@/lib/quick-entry";
import { formatHebrewDate, hasNoSederB, fastDayName } from "@/lib/hebrew-calendar";
import { invoke, isDesktop } from "@/lib/tauri";
import { logProblem } from "@/lib/diagnostics";
import { useReminderNotifications } from "@/lib/notifications";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/quick")({
  head: () => ({
    meta: [
      { title: "כניסה מהירה · סדר פלוס" },
      { name: "description", content: "רישום מהיר של שעת ההגעה לסדר" },
    ],
  }),
  component: QuickApp,
});

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const sederLabel = (s: SederNum) => (s === 1 ? "סדר א׳" : "סדר ב׳");

function QuickApp() {
  useEffect(() => { applyAppearance(); }, []);
  useSettings(); // re-render when the hours change in the other window
  useReminderNotifications();
  const seder = useSeder();
  const learning = useLearning();
  const navigate = useNavigate();

  // Yesterday, for whoever forgot to record on the way in. Everything on the
  // screen follows this — the Hebrew date, the seder hours in force, the rows
  // already saved — so there is never a doubt about which day is being edited.
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const date = useMemo(() => (day === "today" ? todayISO() : yesterdayISO()), [day]);
  const times = getSederTimesFor(date);
  const hebrewDate = useMemo(() => {
    try { return formatHebrewDate(new Date(date)); } catch { return ""; }
  }, [date]);
  const fastName = useMemo(() => fastDayName(new Date(date)), [date]);
  const noSederB = useMemo(() => hasNoSederB(new Date(date)), [date]);

  // Held as raw text, not as a time value: the field accepts 0915, 915, 9.15
  // and 09:15 alike (parseLooseTime), which is the difference between one
  // keystroke run and reaching for the colon every morning.
  const [typed, setTyped] = useState(() => hhmmOf(new Date()));
  const [ohevei, setOhevei] = useState(false);
  const [dialog, setDialog] = useState<null | "excused" | "absence" | "kollel-erev" | "torato-beyado" | "stats">(null);
  // Set when a saved row is picked for correction: that row's seder wins over
  // the automatic guess, because an arrival typed early enough could otherwise
  // be read as belonging to the seder before it.
  const [editing, setEditing] = useState<{ id: string; seder: SederNum } | null>(null);

  const time = parseLooseTime(typed);
  const timeMin = time === null ? null : hhmmToMin(time);
  const detected: SederNum = timeMin === null ? 1 : detectSeder(timeMin, times);
  const activeSeder: SederNum = editing?.seder ?? detected;
  const bounds = sederBounds(activeSeder, times);
  const oheveiPossible = timeMin !== null && canBeOhevei(timeMin, activeSeder, times);
  // Ticking the box and then typing a later time must not quietly leave a mark
  // the record cannot carry.
  useEffect(() => { if (!oheveiPossible && ohevei) setOhevei(false); }, [oheveiPossible, ohevei]);

  const todays = seder.entries.filter((e) => e.date === date);
  const existingFor = (s: SederNum) => todays.find((e) => e.seder === s);
  const existing = existingFor(activeSeder);

  // Everything that can make this screen taller or shorter: the day banner, the
  // fast-day banner, the correction banner, and how many saved rows the summary
  // is listing. Typing a time is deliberately *not* in here — it swaps one line
  // of helper text for another and never moves the height.
  const shell = useFitToWindow(
    `${day}|${editing?.id ?? ""}|${todays.length}|${fastName ?? ""}|${noSederB}`,
  );

  const lateBy = timeMin === null ? 0 : Math.max(0, timeMin - bounds.start);
  const earlyBy = timeMin === null ? 0 : Math.max(0, bounds.start - timeMin);

  /** Switching day is a different set of records — nothing may carry over. */
  const chooseDay = (next: "today" | "yesterday") => {
    setDay(next);
    setEditing(null);
    setOhevei(false);
    setTyped(next === "today" ? hhmmOf(new Date()) : "");
  };

  /** Loads a saved row back into the field so it can be corrected. */
  const editEntry = (entry: SederEntry) => {
    setEditing({ id: entry.id, seder: entry.seder });
    setTyped(entry.arrival ?? "");
    setOhevei(entry.ohevei);
  };

  const stopEditing = () => {
    setEditing(null);
    setOhevei(false);
    setTyped(day === "today" ? hhmmOf(new Date()) : "");
  };

  const save = () => {
    if (time === null) { toast.error("שעה לא תקינה — נסה 0915 או 9:15"); return; }
    try {
      seder.upsert(arrivalEntry({ existing, date, seder: activeSeder, time, ohevei, times }));
      setEditing(null);
      toast.success(
        lateBy > 0
          ? `נרשמה הגעה ל${sederLabel(activeSeder)} · ${lateBy} דק׳ אחרי תחילת הסדר`
          : `נרשמה הגעה ל${sederLabel(activeSeder)}${earlyBy > 0 ? ` · ${earlyBy} דק׳ מוקדם` : ""}`,
      );
    } catch (e) {
      logProblem("שמירת הגעה מהחלון המהיר", e);
      toast.error(e instanceof Error ? e.message : "השמירה נכשלה");
    }
  };

  const applyExcused = (choice: ExcusedChoice) => {
    const target = existing
      ?? arrivalEntry({ date, seder: activeSeder, time: time ?? hhmmOf(new Date()), ohevei: false, times });
    try {
      seder.upsert(withExcused(target, choice));
      toast.success(choice.kind === "all"
        ? `כל החוסר ב${sederLabel(activeSeder)} סומן כמוצדק`
        : `${choice.minutes} דק׳ ב${sederLabel(activeSeder)} סומנו כמוצדקות`);
      setDialog(null);
    } catch (e) {
      logProblem("סימון מוצדק מהחלון המהיר", e);
      toast.error(e instanceof Error ? e.message : "השמירה נכשלה");
    }
  };

  const applyAbsence = (target: SederNum, excused: ExcusedChoice | null) => {
    try {
      seder.upsert(absenceEntry({ existing: existingFor(target), date, seder: target, excused }));
      toast.success(`נרשמה היעדרות ב${sederLabel(target)}${excused ? " (מוצדקת)" : ""}`);
      setDialog(null);
    } catch (e) {
      logProblem("רישום היעדרות מהחלון המהיר", e);
      toast.error(e instanceof Error ? e.message : "השמירה נכשלה");
    }
  };

  const addLearning = (framework: LearningFramework, minutes: number) => {
    try {
      learning.add({ id: newId(), framework, date, minutes, source: "manual" });
      toast.success(`נוספו ${minutes} דק׳`);
      setDialog(null);
    } catch (e) {
      logProblem("רישום לימוד מהחלון המהיר", e);
      toast.error(e instanceof Error ? e.message : "השמירה נכשלה");
    }
  };

  function openMainApp() {
    if (!isDesktop) {
      // `npm run dev` in a browser: just navigate this tab to the full app.
      navigate({ to: "/" });
      return;
    }
    // Opens the full app as a second window in this same process, so both
    // share one WebView session. Reused and refocused on repeat clicks.
    invoke("open_main_window").catch((e) => {
      logProblem("פתיחת האפליקציה הראשית", e);
      toast.error("פתיחת האפליקציה נכשלה");
    });
  }

  return (
    <div ref={shell} className="bg-background">
    <div dir="rtl" className="h-full bg-background text-foreground flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto w-full max-w-5xl px-6 py-3.5 flex items-center gap-3">
          <div className="size-11 rounded-xl bg-primary grid place-items-center text-primary-foreground shadow-sm">
            <Zap className="size-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold">כניסה מהירה</h1>
            <p className="text-xs text-muted-foreground truncate">{hebrewDate}</p>
          </div>
          <div className="flex-1" />
          <div className="text-sm text-muted-foreground tabular-nums flex items-center gap-1.5">
            <Clock className="size-4" /><LiveClock />
          </div>
          <button
            onClick={openMainApp}
            title="פתח את התוכנה המלאה"
            aria-label="פתח את התוכנה המלאה"
            className="pressable size-10 rounded-lg border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <LayoutDashboard className="size-5" />
          </button>
        </div>
      </header>

      {/* overflow-hidden, not auto: useFitToWindow scales the screen down to
          the window, so a scrollbar here could only ever be a rounding
          artefact — and it would be the one thing this window must not have.
          At the window's own size (940x660, see build_quick_window) the two
          columns below fit with no scaling at all, so the hook is now the
          fallback for a small screen rather than the everyday case. */}
      <main className="flex-1 overflow-hidden mx-auto w-full max-w-5xl px-6 py-4">
        {/* Today or yesterday. It scopes both columns — the field on one side
            and the day's records on the other — so it sits above them both
            rather than inside either. Anything older is a job for the
            attendance screen, which can reach any date at all. */}
        <div className="inline-grid w-64 grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1">
          {([
            { key: "today", label: "היום" },
            { key: "yesterday", label: "אתמול" },
          ] as const).map((choice) => (
            <button key={choice.key} onClick={() => chooseDay(choice.key)}
              aria-pressed={day === choice.key}
              className={`pressable rounded-lg px-3 py-2 text-sm font-medium ${
                day === choice.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}>
              {choice.label}
            </button>
          ))}
        </div>

        {(day === "yesterday" || fastName) && (
          <div className="mt-3 space-y-2">
            {day === "yesterday" && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5 text-xs text-primary flex items-center gap-2">
                <CalendarClock className="size-4 shrink-0" />
                <span>הרישום ייכתב לאתמול — {hebrewDate}</span>
              </div>
            )}
            {fastName && (
              <div className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-2.5 text-xs text-warning-fg">
                {day === "today" ? "היום" : "אתמול"} {fastName}{noSederB ? " — אין סדר ב׳" : ""}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start">
          {/* ── The one thing this window exists for. ───────────────────── */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            {editing && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-primary">
                <Pencil className="size-4 shrink-0" />
                <span className="flex-1">תיקון הרישום של {sederLabel(editing.seder)}</span>
                <button onClick={stopEditing} title="בטל תיקון" aria-label="בטל תיקון"
                  className="pressable rounded p-0.5 hover:opacity-70">
                  <X className="size-4" />
                </button>
              </div>
            )}

            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="quick-time" className="text-base font-semibold">שעת הגעה</label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {sederLabel(activeSeder)} · {activeSeder === 1 ? `${times.s1Start}–${times.s1End}` : `${times.s2Start}–${times.s2End}`}
              </span>
            </div>

            {/* A text field, not <input type="time">: that one insists on being
                driven segment by segment, and "0915" typed straight through is
                the whole point. parseLooseTime does the rest. */}
            <input
              id="quick-time"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0915"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => { if (time) setTyped(time); }}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              className={`mt-4 w-full rounded-2xl border-2 bg-primary/5 px-4 py-4 text-center text-6xl font-bold tabular-nums focus:outline-none ${
                typed.trim() !== "" && time === null
                  ? "border-destructive/60 focus:border-destructive"
                  : "border-primary/30 focus:border-primary"
              }`}
            />

            {/* The consequence of what was typed, in the colour of what it
                means: an on-time arrival reads as good, a late one is marked,
                an unreadable one is an error. This was one grey 11px line
                whatever it said. */}
            <p className={`mt-3 text-center text-sm ${
              typed.trim() === "" ? "text-muted-foreground"
                : time === null ? "text-destructive"
                : lateBy > 0 ? "text-warning-fg"
                : "text-success"
            }`}>
              {typed.trim() === "" ? "אפשר להקליד 0915, 915 או 9:15"
                : time === null ? "שעה לא תקינה — אפשר להקליד 0915, 915 או 9:15"
                : lateBy > 0 ? `${time} · ${lateBy} דק׳ אחרי תחילת ${sederLabel(activeSeder)}`
                : earlyBy > 0 ? `${time} · ${earlyBy} דק׳ לפני תחילת ${sederLabel(activeSeder)} — נצבר כבונוס`
                : `${time} · בדיוק בתחילת ${sederLabel(activeSeder)}`}
            </p>

            <label
              className={`mt-4 flex items-start gap-3 rounded-xl border p-3.5 ${
                oheveiPossible
                  ? "pressable-lg border-border cursor-pointer hover:bg-accent/40"
                  : "border-dashed border-border opacity-55"
              }`}
              title={oheveiPossible ? undefined : "אוהבי ה׳ אפשרי רק בהגעה עד תחילת הסדר"}
            >
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={ohevei}
                disabled={!oheveiPossible}
                onChange={(e) => setOhevei(e.target.checked)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">אוהבי ה׳</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {oheveiPossible
                    ? "הסדר כולו — מתחילתו ועד סופו"
                    : "אפשרי רק כשההגעה עד תחילת הסדר"}
                </span>
              </span>
            </label>

            <button
              onClick={save}
              className="pressable-lg mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-lg font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Check className="size-5" />
              {editing || (existing && !existing.absent) ? "עדכן הגעה" : "שמור הגעה"}
            </button>

            <p className="mt-2.5 text-center text-2xs text-muted-foreground">
              שעת היציאה נרשמת אוטומטית כסוף הסדר. יציאה מוקדמת נערכת בתוכנה המלאה.
            </p>
          </section>

          {/* ── Everything else the day can need, one click away. ────────── */}
          <aside className="space-y-4">
            <div>
              <h2 className="mb-2 text-sm font-semibold">
                {day === "today" ? "נרשם היום" : "נרשם אתמול"}
              </h2>
              <DaySummary date={date} day={day} editingId={editing?.id ?? null} onEdit={editEntry} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDialog("excused")}
                className="pressable-lg rounded-xl border-2 border-border bg-card p-4 text-center hover:border-status-excused">
                <FileText className="size-6 mx-auto text-status-excused-fg" />
                <span className="mt-2 block text-sm font-semibold">מוצדק</span>
                <span className="block text-xs text-muted-foreground">איחור מאושר</span>
              </button>
              <button onClick={() => setDialog("absence")}
                className="pressable-lg rounded-xl border-2 border-border bg-card p-4 text-center hover:border-status-absent">
                <UserX className="size-6 mx-auto text-status-absent-fg" />
                <span className="mt-2 block text-sm font-semibold">היעדרות</span>
                <span className="block text-xs text-muted-foreground">סדר שלם שהוחסר</span>
              </button>
            </div>

            {/* The learning frameworks and the month's figures — the same three
                destinations that used to be a strip pinned to the bottom edge
                of the window, now sized to be hit. */}
            <div className="grid grid-cols-3 gap-2">
              <BarButton icon={Moon} label="כולל ערב" onClick={() => setDialog("kollel-erev")} />
              <BarButton icon={BookOpen} label="תורתו בידו" onClick={() => setDialog("torato-beyado")} />
              <BarButton icon={BarChart3} label="נתוני החודש" onClick={() => setDialog("stats")} />
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-border bg-card px-6 py-2 text-center text-2xs text-muted-foreground">
        סדר פלוס · כניסה מהירה
      </footer>

      <ExcusedDialog
        open={dialog === "excused"}
        onClose={() => setDialog(null)}
        seder={activeSeder}
        missingMin={existing ? calcSeder(existing).missingMin : lateBy}
        alsoRecordsArrival={existing ? null : time}
        onApply={applyExcused}
      />
      <AbsenceDialog
        open={dialog === "absence"}
        onClose={() => setDialog(null)}
        suggested={activeSeder}
        noSederB={noSederB}
        sederLengthMin={(s: SederNum) => {
          const b = sederBounds(s, times);
          return Math.max(0, b.end - b.start);
        }}
        onApply={applyAbsence}
      />
      <MinutesDialog
        open={dialog === "kollel-erev" || dialog === "torato-beyado"}
        onClose={() => setDialog(null)}
        framework={dialog === "torato-beyado" ? "torato-beyado" : "kollel-erev"}
        onApply={addLearning}
      />
      <MonthStatsDialog open={dialog === "stats"} onClose={() => setDialog(null)} />

    </div>
    </div>
  );
}

/**
 * Everything at once, never a scrollbar — without touching the design.
 *
 * The whole screen is scaled down by however much it takes to fit the window,
 * and only when it doesn't fit. Nothing is dropped, resized or rearranged; a
 * short day stays at 100%.
 *
 * `100vh` inside a zoomed element still means the unzoomed window, so the
 * shell's height is set in pixels rather than in vh.
 *
 * Written straight to the DOM, on every render, rather than through state: a
 * layout that changes what it measures is exactly the shape that turns a
 * ResizeObserver — or a setState — into a loop.
 */
function useFitToWindow(signature: string) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const MIN_ZOOM = 0.5; // well below what the smallest allowed window
    // (min_inner_size in src-tauri/core/src/lib.rs) ever needs.

    const fit = () => {
      const main = el.querySelector("main");
      if (!main) return;

      // Ask the layout, don't predict it: set a zoom, then read whether main
      // is actually clipping anything. A predicted height was wrong in both
      // directions — the flex/overflow combination does not report an honest
      // natural height, and a webfont arriving a moment later invalidates
      // whatever was measured before it.
      const apply = (zoom: number) => {
        el.style.zoom = String(zoom);
        el.style.height = `${window.innerHeight / zoom}px`;
      };
      const fits = () => main.scrollHeight <= main.clientHeight;

      // Full size is the common case and costs exactly one layout.
      apply(1);
      if (fits()) return;

      // Otherwise bisect. "Does it fit" is monotonic in the zoom, so seven
      // steps land within half a percent — where stepping down by 1% at a
      // time took up to fifty forced synchronous layouts to say the same
      // thing.
      let lo = MIN_ZOOM, hi = 1;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        apply(mid);
        if (fits()) lo = mid;
        else hi = mid;
      }
      apply(lo);
    };

    // A window drag fires resize per pixel; one fit per frame is enough.
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };

    fit();
    window.addEventListener("resize", onResize);
    // Hebrew text reflows when the real font replaces the fallback, which is
    // after the first fit has already run and settled.
    document.fonts?.ready.then(fit).catch(() => {});
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
    // `signature` is every piece of state that changes the height of the
    // screen. It used to have no dependency list at all, so the whole measure
    // loop ran after *every* render — including each keystroke in the time
    // field, which cannot change the layout and was paying up to fifty forced
    // layouts to discover that.
  }, [signature]);

  return ref;
}

function BarButton({ icon: Icon, label, onClick }: { icon: typeof Moon; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label}
      className="pressable flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-2 py-3 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-accent/40">
      <Icon className="size-5" />
      <span className="text-xs font-medium text-center leading-tight">{label}</span>
    </button>
  );
}

/**
 * What is already recorded for the chosen day — so the window can be trusted
 * at a glance, and so a wrong entry can be put right where it is seen. Each
 * row loads itself back into the field.
 */
function DaySummary({
  date, day, editingId, onEdit,
}: {
  date: string;
  day: "today" | "yesterday";
  editingId: string | null;
  onEdit: (entry: SederEntry) => void;
}) {
  const { entries } = useSeder();
  const rows = entries.filter((e) => e.date === date).sort((a, b) => a.seder - b.seder);
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
        {day === "today" ? "עדיין לא נרשם דבר היום." : "לא נרשם דבר באתמול."}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-muted/20 divide-y divide-border overflow-hidden">
      {rows.map((e) => {
        const c = calcSeder(e);
        return (
          <button key={e.id} onClick={() => onEdit(e)}
            title={e.absent ? "טען לתיקון — רישום ההיעדרות יוחלף בהגעה" : "טען לתיקון"}
            className={`pressable w-full flex items-center gap-2.5 px-4 py-3 text-sm text-start hover:bg-accent/60 ${
              editingId === e.id ? "bg-primary/10" : ""
            }`}>
            <span className="font-semibold">{e.seder === 1 ? "א׳" : "ב׳"}</span>
            <span className="tabular-nums text-muted-foreground">{e.absent ? "היעדרות" : e.arrival}</span>
            <span className="flex-1" />
            {c.isOhevei && <span className="rounded bg-status-present/15 px-1.5 py-0.5 text-2xs text-status-present-fg">אוהבי ה׳</span>}
            {c.excusedMin > 0 && <span className="rounded bg-status-excused/15 px-1.5 py-0.5 text-2xs text-status-excused-fg">מוצדק {c.excusedMin}</span>}
            <span className={`tabular-nums font-medium ${c.netMissingMin > 0 ? "text-destructive" : "text-success"}`}>
              {c.netMissingMin > 0 ? `חסר ${c.netMissingMin}` : "מלא"}
            </span>
            <Pencil className="size-3.5 text-muted-foreground shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

function LiveClock() {
  const [t, setT] = useState(() => hhmmOf(new Date()));
  useEffect(() => {
    const i = setInterval(() => setT(hhmmOf(new Date())), 15000);
    return () => clearInterval(i);
  }, []);
  return <span>{t}</span>;
}

// ---- dialogs ---------------------------------------------------------------

/** "Is all of it justified, or only part of it — and how much?" */
function ExcusedDialog({
  open, onClose, seder, missingMin, alsoRecordsArrival, onApply,
}: {
  open: boolean;
  onClose: () => void;
  seder: SederNum;
  missingMin: number;
  /** The arrival time this will also record, when nothing is saved yet. */
  alsoRecordsArrival: string | null;
  onApply: (choice: ExcusedChoice) => void;
}) {
  const [mode, setMode] = useState<"all" | "partial">("all");
  const [minutes, setMinutes] = useState(Math.max(1, missingMin));

  // Reopening for a different seder must not carry the previous answer over.
  useEffect(() => {
    if (open) { setMode("all"); setMinutes(Math.max(1, missingMin)); }
  }, [open, missingMin]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>מוצדק — {sederLabel(seder)}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {missingMin > 0
            ? `כרגע חסרות ${missingMin} דק׳ ב${sederLabel(seder)}.`
            : `אין כרגע דקות חסרות ב${sederLabel(seder)} — סימון מוצדק יחול על חוסר שיירשם.`}
        </p>
        {alsoRecordsArrival && (
          <p className="text-2xs text-warning-fg">
            טרם נרשמה הגעה ל{sederLabel(seder)} — השמירה תרשום גם הגעה בשעה {alsoRecordsArrival}.
          </p>
        )}

        <div className="space-y-2">
          <ChoiceRow label="הכל מוצדק" hint="כל החוסר בסדר הזה" selected={mode === "all"} onSelect={() => setMode("all")} />
          <ChoiceRow label="רק חלק מוצדק" hint="בחר מספר דקות" selected={mode === "partial"} onSelect={() => setMode("partial")} />
          {mode === "partial" && (
            <div className="flex items-center gap-2 pe-8">
              <input type="number" min={1} max={1440} value={minutes} autoFocus
                onChange={(e) => setMinutes(Math.max(1, Math.min(1440, +e.target.value || 1)))}
                className="field-input w-24 tabular-nums" />
              <span className="text-xs text-muted-foreground">
                דקות מוצדקות{missingMin > 0 ? ` מתוך ${missingMin}` : ""}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button onClick={() => onApply(mode === "all" ? { kind: "all" } : { kind: "partial", minutes })}>
            <Check className="size-4" /> שמור
          </Button>
          <Button variant="ghost" onClick={onClose}><X className="size-4" /> ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Which seder, and was it justified — all of it or part of it?" */
function AbsenceDialog({
  open, onClose, suggested, noSederB, sederLengthMin, onApply,
}: {
  open: boolean;
  onClose: () => void;
  suggested: SederNum;
  noSederB: boolean;
  sederLengthMin: (s: SederNum) => number;
  onApply: (seder: SederNum, excused: ExcusedChoice | null) => void;
}) {
  const [seder, setSeder] = useState<SederNum>(suggested);
  const [mode, setMode] = useState<"none" | "all" | "partial">("none");
  const [minutes, setMinutes] = useState(60);

  useEffect(() => {
    if (open) { setSeder(suggested); setMode("none"); setMinutes(60); }
  }, [open, suggested]);

  const length = sederLengthMin(seder);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>רישום היעדרות</DialogTitle>
        </DialogHeader>

        <div>
          <div className="text-xs text-muted-foreground mb-1.5">באיזה סדר</div>
          <div className="grid grid-cols-2 gap-2">
            {([1, 2] as SederNum[]).map((s) => (
              <button key={s} onClick={() => setSeder(s)}
                className={`rounded-lg border-2 px-3 py-2.5 text-sm font-medium pressable transition ${
                  seder === s ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                }`}>
                {sederLabel(s)}
              </button>
            ))}
          </div>
          {seder === 2 && noSederB && (
            <p className="mt-1.5 text-2xs text-warning-fg">היום אין סדר ב׳ — אין צורך לרשום היעדרות.</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">האם ההיעדרות מוצדקת</div>
          <ChoiceRow label="לא מוצדקת" hint={`כל ${length} הדקות ייחשבו כחוסר`} selected={mode === "none"} onSelect={() => setMode("none")} />
          <ChoiceRow label="מוצדקת — הכל" hint="ההיעדרות כולה מאושרת" selected={mode === "all"} onSelect={() => setMode("all")} />
          <ChoiceRow label="מוצדקת — חלק" hint="בחר מספר דקות" selected={mode === "partial"} onSelect={() => setMode("partial")} />
          {mode === "partial" && (
            <div className="flex items-center gap-2 pe-8">
              <input type="number" min={1} max={1440} value={minutes} autoFocus
                onChange={(e) => setMinutes(Math.max(1, Math.min(1440, +e.target.value || 1)))}
                className="field-input w-24 tabular-nums" />
              <span className="text-xs text-muted-foreground">דקות מוצדקות מתוך {length}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button
            onClick={() => onApply(
              seder,
              mode === "none" ? null : mode === "all" ? { kind: "all" } : { kind: "partial", minutes },
            )}>
            <Check className="size-4" /> שמור
          </Button>
          <Button variant="ghost" onClick={onClose}><X className="size-4" /> ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FRAMEWORK_DIALOG: Record<"kollel-erev" | "torato-beyado", { title: string; hint: string; icon: typeof Moon }> = {
  "kollel-erev": { title: "כולל ערב", hint: "מספר הדקות שנלמדו הערב", icon: Moon },
  "torato-beyado": { title: "תורתו בידו", hint: "מספר הדקות שנלמדו", icon: BookOpen },
};

/** One number, for one learning framework, for today. */
function MinutesDialog({
  open, onClose, framework, onApply,
}: {
  open: boolean;
  onClose: () => void;
  framework: "kollel-erev" | "torato-beyado";
  onApply: (framework: LearningFramework, minutes: number) => void;
}) {
  const [minutes, setMinutes] = useState(60);
  const { title, hint, icon: Icon } = FRAMEWORK_DIALOG[framework];
  const { items } = useLearning();

  useEffect(() => { if (open) setMinutes(60); }, [open, framework]);

  const todayTotal = items
    .filter((l) => l.framework === framework && l.date === todayISO())
    .reduce((s, l) => s + l.minutes, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Icon className="size-5 text-primary" /> {title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">{hint}</label>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={1440} value={minutes} autoFocus
              onChange={(e) => setMinutes(Math.max(1, Math.min(1440, +e.target.value || 1)))}
              onKeyDown={(e) => { if (e.key === "Enter") onApply(framework, minutes); }}
              className="field-input flex-1 text-center text-xl tabular-nums py-3" />
            <span className="text-sm text-muted-foreground">דקות</span>
          </div>
          <div className="flex gap-2">
            {[30, 45, 60, 90].map((m) => (
              <button key={m} onClick={() => setMinutes(m)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs tabular-nums pressable transition ${
                  minutes === m ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"
                }`}>
                {m}
              </button>
            ))}
          </div>
          {todayTotal > 0 && (
            <p className="text-2xs text-muted-foreground">נרשמו היום {todayTotal} דק׳ במסגרת זו — הרישום החדש יתווסף אליהן.</p>
          )}
        </div>
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button onClick={() => onApply(framework, minutes)}><Check className="size-4" /> הוסף</Button>
          <Button variant="ghost" onClick={onClose}><X className="size-4" /> ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The month, in the figures the user actually asks about. */
function MonthStatsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const { settings } = useSettings();
  const now = new Date();
  const monthEntries = entriesInMonth(entries, now.getFullYear(), now.getMonth());
  const s = summarizeEntries(monthEntries);
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const learnFor = (framework: LearningFramework) => lessons
    .filter((l) => l.framework === framework && l.date.startsWith(monthPrefix))
    .reduce((sum, l) => sum + effectiveLearningMin(l), 0);

  const rows: { label: string; value: number | string; hint?: string }[] = [
    { label: "סה״כ דקות חסרות", value: s.totalMissing },
    { label: "מתוכן מוצדקות", value: s.excused },
    { label: "חסר נטו", value: s.netMissing, hint: "אחרי מוצדק ובונוס" },
    { label: "מספר איחורים", value: s.lateCount },
    { label: "מספר חיסורים", value: s.absenceCount },
    ...(s.oheveiCount > 0 ? [{ label: "סדרי אוהבי ה׳", value: s.oheveiCount }] : []),
    ...(settings.seder.shasChavura
      ? [{ label: "חבורת ש״ס", value: s.shasCount, hint: `הגעות לסדר ב׳ עד ${SHAS_ARRIVAL_DEADLINE}` }]
      : []),
    { label: "דקות כולל ערב", value: learnFor("kollel-erev") },
    { label: "דקות תורתו בידו", value: learnFor("torato-beyado") },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="size-5 text-primary" /> נתוני החודש
          </DialogTitle>
        </DialogHeader>
        {s.entries === 0 ? (
          <p className="text-sm text-muted-foreground">עדיין לא נרשם דבר בחודש הזה.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {rows.map((r) => (
              <li key={r.label} className="flex items-baseline gap-2 px-3 py-2.5">
                <span className="text-sm">{r.label}</span>
                {r.hint && <span className="text-2xs text-muted-foreground">{r.hint}</span>}
                <span className="flex-1" />
                <span className="text-base font-bold tabular-nums">{r.value}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-2xs text-muted-foreground">
          {s.entries} רישומי סדר בחודש. לפירוט מלא — בתוכנה המלאה.
        </p>
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button variant="outline" onClick={onClose}>סגור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceRow({
  label, hint, selected, onSelect,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button onClick={onSelect}
      className={`w-full flex items-start gap-2.5 rounded-lg border-2 p-3 text-start pressable transition ${
        selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
      }`}>
      <span className={`mt-0.5 size-4 rounded-full border-2 shrink-0 grid place-items-center ${selected ? "border-primary" : "border-muted-foreground/40"}`}>
        {selected && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-2xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
