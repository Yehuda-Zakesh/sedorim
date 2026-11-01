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
// The layout is responsive, never scaled: the window is 940x660 by default and
// can shrink to 560x560 (src-tauri/core/src/lib.rs). Text stays at its real
// size; wide windows get two columns (the field on one side, the day's records
// and everything else on the other), narrow ones fold into one column and the
// content area scrolls when it must.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { StoreGuard } from "@/components/store-recovery";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Zap,
  Clock,
  LayoutDashboard,
  Check,
  FileText,
  UserX,
  Moon,
  BookOpen,
  BarChart3,
  X,
  Pencil,
  CalendarClock,
} from "lucide-react";
import {
  useSeder,
  useLearning,
  ValidationError,
  newId,
  hhmmToMin,
  calcSeder,
  summarizeEntries,
  entriesInMonth,
  effectiveLearningMin,
  type SederEntry,
  type SederNum,
  type LearningFramework,
} from "@/lib/kollel-store";
import {
  applyAppearance,
  getSederTimesFor,
  useSettings,
  SHAS_ARRIVAL_DEADLINE,
} from "@/lib/settings-store";
import {
  detectSeder,
  canBeOhevei,
  sederBounds,
  arrivalEntry,
  absenceEntry,
  withExcused,
  hhmmOf,
  parseLooseTime,
  type ExcusedChoice,
} from "@/lib/quick-entry";
import {
  parseISODate,
  shiftISO,
  relativeDayName,
  dayLabelWithDate,
  monthPrefixOf,
} from "@/lib/quick-day";
import { formatHebrewDate, hasNoSederB, fastDayName } from "@/lib/hebrew-calendar";
import { attendanceBlockedMessage } from "@/lib/attendance-day";
import { invoke, isDesktop } from "@/lib/tauri";
import { logProblem } from "@/lib/diagnostics";
import { useReminderNotifications } from "@/lib/notifications";
import { useBackgroundPlan } from "@/lib/background-plan";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CONFLICT_SAVE_TEXT } from "@/lib/save-conflicts";
import { todayISO, useToday } from "@/lib/today";

export const Route = createFileRoute("/quick")({
  head: () => ({
    meta: [
      { title: "כניסה מהירה · סדר פלוס" },
      { name: "description", content: "רישום מהיר של שעת ההגעה לסדר" },
    ],
  }),
  component: QuickApp,
});

/** "היום" / "באתמול, 30.10" / "בתאריך 12.10" — for use mid-sentence. */
const inDay = (d: string) => (d === "היום" ? d : d.startsWith("אתמול") ? `ב${d}` : `בתאריך ${d}`);
const saveErrorText = (e: unknown) =>
  e instanceof ValidationError ? e.message : "השמירה נכשלה — לא נשמר באחסון, הערכים נשארו";
const sederLabel = (s: SederNum) => (s === 1 ? "סדר א׳" : "סדר ב׳");

function QuickApp() {
  useEffect(() => {
    applyAppearance();
  }, []);
  useSettings(); // re-render when the hours change in the other window
  useReminderNotifications();
  // Keeps the timetable SederPlusAgent.exe reads current. A no-op unless the
  // user has asked for reminders while the app is closed.
  useBackgroundPlan();
  const seder = useSeder();
  const learning = useLearning();
  const navigate = useNavigate();

  // Another day, for whoever forgot to record on the way in. Everything on the
  // screen follows this — the Hebrew date, the seder hours in force, the rows
  // already saved — so there is never a doubt about which day is being edited.
  const [day, setDay] = useState<"today" | "other">("today");
  const [otherDate, setOtherDate] = useState(() => shiftISO(new Date(), -1));
  // "Today" follows the clock past midnight; an explicitly chosen date stays put.
  const today = useToday();
  const todayDate = useMemo(() => parseISODate(today) ?? new Date(), [today]);
  const date = day === "today" ? today : otherDate;
  const isToday = day === "today";
  const dayWord = relativeDayName(date, todayDate);
  const dayFull = dayLabelWithDate(date, todayDate);
  const times = getSederTimesFor(date);
  const dateObj = useMemo(() => parseISODate(date) ?? new Date(), [date]);
  const hebrewDate = useMemo(() => {
    try {
      return formatHebrewDate(dateObj);
    } catch {
      return "";
    }
  }, [dateObj]);
  const fastName = useMemo(() => fastDayName(dateObj), [dateObj]);
  const noSederB = useMemo(() => hasNoSederB(dateObj), [dateObj]);
  // Weekends and Yom Tov take no attendance. Derived from `date`, so it follows
  // "today" past midnight. Extra learning is not affected.
  const blockedMessage = attendanceBlockedMessage(date);

  // Held as raw text, not as a time value: the field accepts 0915, 915, 9.15
  // and 09:15 alike (parseLooseTime), which is the difference between one
  // keystroke run and reaching for the colon every morning.
  const [typed, setTyped] = useState(() => hhmmOf(new Date()));
  const [ohevei, setOhevei] = useState(false);
  const [dialog, setDialog] = useState<
    null | "excused" | "absence" | "kollel-erev" | "torato-beyado" | "stats"
  >(null);
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
  useEffect(() => {
    if (!oheveiPossible && ohevei) setOhevei(false);
  }, [oheveiPossible, ohevei]);

  // Midnight passed while "today" was open: a row picked for correction belongs
  // to yesterday now, so drop it rather than write it onto the new day.
  useEffect(() => {
    if (day === "today") setEditing(null);
  }, [today, day]);

  const todays = seder.entries.filter((e) => e.date === date);
  const existingFor = (s: SederNum) => todays.find((e) => e.seder === s);
  const existing = existingFor(activeSeder);

  const lateBy = timeMin === null ? 0 : Math.max(0, timeMin - bounds.start);
  const earlyBy = timeMin === null ? 0 : Math.max(0, bounds.start - timeMin);

  /** Switching day is a different set of records — nothing may carry over. */
  const chooseDay = (next: "today" | "other") => {
    setDay(next);
    setEditing(null);
    setOhevei(false);
    setTyped(next === "today" ? hhmmOf(new Date()) : "");
  };
  const chooseOtherDate = (iso: string) => {
    if (!parseISODate(iso) || iso > todayISO()) return;
    setOtherDate(iso);
    setEditing(null);
    setOhevei(false);
    setTyped("");
  };

  /** Loads a saved row back into the field so it can be corrected. */
  const editEntry = (entry: SederEntry) => {
    if (blockedMessage) return;
    setEditing({ id: entry.id, seder: entry.seder });
    setTyped(entry.arrival ?? "");
    setOhevei(entry.ohevei);
  };

  const stopEditing = () => {
    setEditing(null);
    setOhevei(false);
    setTyped(isToday ? hhmmOf(new Date()) : "");
  };

  // One save at a time: a second click while a write is in flight would store
  // the same thing twice. Success is announced only after the write reached
  // storage; on a failure the form / dialog stays open with its values.
  const saving = useRef(false);
  const guarded = async (fn: () => Promise<void>) => {
    if (saving.current) return;
    saving.current = true;
    try {
      await fn();
    } finally {
      saving.current = false;
    }
  };

  const save = () =>
    guarded(async () => {
      if (time === null) {
        toast.error("שעה לא תקינה — נסה 0915 או 9:15");
        return;
      }
      try {
        // "Today" is re-read at the click: the screen may have stayed open past
        // midnight. An explicitly chosen date stays as chosen.
        const saveDate = isToday ? todayISO() : date;
        const blockedNow = attendanceBlockedMessage(saveDate);
        if (blockedNow) {
          toast.error(blockedNow);
          return;
        }
        const rolled = saveDate !== date;
        const outcome = await seder.upsertChecked(
          arrivalEntry({
            existing: rolled ? undefined : existing,
            date: saveDate,
            seder: activeSeder,
            time,
            ohevei,
            times: rolled ? getSederTimesFor(saveDate) : times,
          }),
        );
        if (!outcome.complete) {
          toast.warning(CONFLICT_SAVE_TEXT);
          return;
        }
        setEditing(null);
        toast.success(
          lateBy > 0
            ? `נרשמה הגעה ל${sederLabel(activeSeder)} (${dayFull}) · ${lateBy} דק׳ אחרי תחילת הסדר`
            : `נרשמה הגעה ל${sederLabel(activeSeder)} (${dayFull})${earlyBy > 0 ? ` · ${earlyBy} דק׳ מוקדם` : ""}`,
        );
      } catch (e) {
        logProblem("שמירת הגעה מהחלון המהיר", e);
        toast.error(saveErrorText(e));
      }
    });

  const applyExcused = (choice: ExcusedChoice) =>
    guarded(async () => {
      const blockedNow = attendanceBlockedMessage(isToday ? todayISO() : date);
      if (blockedNow) {
        toast.error(blockedNow);
        setDialog(null);
        return;
      }
      const target =
        existing ??
        arrivalEntry({
          date,
          seder: activeSeder,
          time: time ?? hhmmOf(new Date()),
          ohevei: false,
          times,
        });
      try {
        const outcome = await seder.upsertChecked(withExcused(target, choice));
        if (!outcome.complete) {
          toast.warning(CONFLICT_SAVE_TEXT);
          return;
        }
        toast.success(
          choice.kind === "all"
            ? `כל החוסר ב${sederLabel(activeSeder)} סומן כמוצדק`
            : `${choice.minutes} דק׳ ב${sederLabel(activeSeder)} סומנו כמוצדקות`,
        );
        setDialog(null);
      } catch (e) {
        logProblem("סימון מוצדק מהחלון המהיר", e);
        toast.error(saveErrorText(e));
      }
    });

  const applyAbsence = (target: SederNum, excused: ExcusedChoice | null) =>
    guarded(async () => {
      const blockedNow = attendanceBlockedMessage(isToday ? todayISO() : date);
      if (blockedNow) {
        toast.error(blockedNow);
        setDialog(null);
        return;
      }
      try {
        const outcome = await seder.upsertChecked(
          absenceEntry({ existing: existingFor(target), date, seder: target, excused }),
        );
        if (!outcome.complete) {
          toast.warning(CONFLICT_SAVE_TEXT);
          return;
        }
        toast.success(`נרשמה היעדרות ב${sederLabel(target)}${excused ? " (מוצדקת)" : ""}`);
        setDialog(null);
      } catch (e) {
        logProblem("רישום היעדרות מהחלון המהיר", e);
        toast.error(saveErrorText(e));
      }
    });

  const addLearning = (framework: LearningFramework, minutes: number) =>
    guarded(async () => {
      try {
        const outcome = await learning.addChecked({
          id: newId(),
          framework,
          date,
          minutes,
          source: "manual",
        });
        if (!outcome.complete) {
          toast.warning(CONFLICT_SAVE_TEXT);
          return;
        }
        toast.success(`נוספו ${minutes} דק׳ (${dayFull})`);
        setDialog(null);
      } catch (e) {
        logProblem("רישום לימוד מהחלון המהיר", e);
        toast.error(saveErrorText(e));
      }
    });

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

  const saveLabel = editing || (existing && !existing.absent) ? "עדכן הגעה" : "שמור הגעה";
  const typedBad = typed.trim() !== "" && time === null;
  const hintId = "quick-time-hint";
  const dayOptions = [
    { key: "today", label: "היום" },
    { key: "other", label: "תאריך אחר" },
  ] as const;

  return (
    <div
      dir="rtl"
      className="h-dvh bg-background text-foreground flex flex-col [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-ring"
    >
      {/* The shell is kept to one slim line: the title and the date it is
          writing to, the clock, and the way into the full app. */}
      <header className="shrink-0 border-b border-border bg-card">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-2 flex items-center gap-3">
          <div className="min-w-0">
            <h1 className="title-serif text-xl sm:text-2xl">כניסה מהירה</h1>
            <p className="text-sm text-muted-foreground truncate">
              {dayFull}
              {hebrewDate ? ` · ${hebrewDate}` : ""}
            </p>
          </div>
          <div className="flex-1" />
          <div
            className="text-base text-muted-foreground figure flex items-center gap-1.5"
            aria-label="השעה עכשיו"
            dir="ltr"
          >
            <Clock className="size-4" aria-hidden="true" />
            <LiveClock />
          </div>
          <button
            onClick={openMainApp}
            title="פתח את התוכנה המלאה"
            aria-label="פתח את התוכנה המלאה"
            className="pressable size-10 shrink-0 rounded-md border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <LayoutDashboard className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* The content area scrolls when the window is short; nothing is scaled. */}
      <StoreGuard scroll>
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-3">
            {/* Which day the record is written to. It scopes every panel below. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div
                role="group"
                aria-label="היום שאליו נרשם"
                className="inline-grid grid-cols-2 gap-0.5 rounded-md border border-border p-0.5 min-w-[13rem]"
              >
                {dayOptions.map((choice) => (
                  <button
                    key={choice.key}
                    onClick={() => chooseDay(choice.key)}
                    aria-pressed={day === choice.key}
                    className={`pressable min-h-9 rounded-[0.25rem] px-3 py-1.5 text-sm font-medium ${
                      day === choice.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              {day === "other" && (
                <div className="flex items-center gap-2">
                  <label htmlFor="quick-other-date" className="text-sm text-muted-foreground">
                    תאריך
                  </label>
                  <input
                    id="quick-other-date"
                    type="date"
                    value={otherDate}
                    max={today}
                    onChange={(e) => chooseOtherDate(e.target.value)}
                    className="field-input min-h-9 figure"
                  />
                </div>
              )}
              {!isToday && (
                <p
                  role="status"
                  className="flex items-center gap-1.5 text-sm font-medium text-primary"
                >
                  <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
                  הרישום ייכתב ל{dayFull}
                </p>
              )}
            </div>

            {blockedMessage && (
              <p
                role="status"
                className="mt-2 border-s-4 border-info bg-secondary/60 px-3 py-2 text-sm font-medium"
              >
                {blockedMessage} אפשר לרשום לימוד נוסף, או לבחור תאריך אחר.
              </p>
            )}

            {fastName && (
              <p className="mt-2 border-s-2 border-warning ps-3 text-sm text-warning-fg">
                {dayWord} {fastName}
                {noSederB ? " — אין סדר ב׳" : ""}
              </p>
            )}

            <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start">
              {/* ── The one thing this window exists for. ───────────────────── */}
              <section aria-label="רישום שעת הגעה" className="card-surface p-3 sm:p-4">
                {editing && (
                  <div className="mb-3 flex items-center gap-2 border-s-2 border-primary bg-primary/5 ps-3 pe-1 py-1 text-sm text-primary">
                    <Pencil className="size-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1">תיקון הרישום של {sederLabel(editing.seder)}</span>
                    <button
                      onClick={stopEditing}
                      title="בטל תיקון"
                      aria-label="בטל תיקון"
                      className="pressable size-9 grid place-items-center rounded-md hover:bg-primary/10"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <label htmlFor="quick-time" className="text-base font-semibold">
                    שעת הגעה
                  </label>
                  <span className="text-sm font-semibold text-primary">
                    {sederLabel(activeSeder)} ·{" "}
                    <span className="figure" dir="ltr">
                      {activeSeder === 1
                        ? `${times.s1Start}–${times.s1End}`
                        : `${times.s2Start}–${times.s2End}`}
                    </span>
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {editing ? "הסדר נקבע לפי הרישום שנבחר" : "הסדר מזוהה אוטומטית לפי השעה"} · נרשם ל
                  {dayFull}
                </p>

                {/* A text field, not <input type="time">: that one insists on being
                driven segment by segment, and "0915" typed straight through is
                the whole point. parseLooseTime does the rest. */}
                <input
                  id="quick-time"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  dir="ltr"
                  placeholder="0915"
                  value={typed}
                  aria-describedby={hintId}
                  aria-invalid={typedBad}
                  disabled={!!blockedMessage}
                  onChange={(e) => setTyped(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={() => {
                    if (time) setTyped(time);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void save();
                  }}
                  className={`mt-2 w-full rounded-md border-2 bg-background px-3 py-1 text-center text-5xl sm:text-6xl [@media(max-height:640px)]:text-4xl font-bold figure focus:outline-none focus-visible:ring-4 focus-visible:ring-ring/40 ${
                    typedBad
                      ? "border-destructive/70 focus:border-destructive"
                      : "border-input focus:border-primary"
                  }`}
                />

                {/* The consequence of what was typed, in the colour of what it
                means: on time reads as good, late is marked, unreadable is an
                error. The words carry it too, never the colour alone. */}
                <p
                  id={hintId}
                  aria-live="polite"
                  className={`mt-2 text-center text-sm font-medium ${
                    typed.trim() === ""
                      ? "text-muted-foreground"
                      : time === null
                        ? "text-destructive"
                        : lateBy > 0
                          ? "text-warning-fg"
                          : "text-success"
                  }`}
                >
                  {typed.trim() === ""
                    ? "אפשר להקליד 0915, 915 או 9:15"
                    : time === null
                      ? "שעה לא תקינה — אפשר להקליד 0915, 915 או 9:15"
                      : lateBy > 0
                        ? `${time} · ${lateBy} דק׳ אחרי תחילת ${sederLabel(activeSeder)}`
                        : earlyBy > 0
                          ? `${time} · ${earlyBy} דק׳ לפני תחילת ${sederLabel(activeSeder)} — נצבר כבונוס`
                          : `${time} · בדיוק בתחילת ${sederLabel(activeSeder)}`}
                </p>

                <label
                  className={`mt-2 flex items-center gap-3 border-t border-border pt-2 ${
                    oheveiPossible ? "cursor-pointer" : "opacity-70"
                  }`}
                  title={oheveiPossible ? undefined : "אוהבי ה׳ אפשרי רק בהגעה עד תחילת הסדר"}
                >
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-primary"
                    checked={ohevei}
                    disabled={!oheveiPossible || !!blockedMessage}
                    onChange={(e) => setOhevei(e.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="text-sm font-semibold">אוהבי ה׳</span>
                    <span className="text-sm text-muted-foreground">
                      {" — "}
                      {oheveiPossible
                        ? "הסדר כולו, מתחילתו ועד סופו"
                        : "אפשרי רק כשההגעה עד תחילת הסדר"}
                    </span>
                  </span>
                </label>

                <button
                  onClick={() => void save()}
                  disabled={!!blockedMessage}
                  className="pressable-lg mt-3 w-full inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-lg font-semibold text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Check className="size-5" aria-hidden="true" />
                  {isToday ? saveLabel : `${saveLabel} ל${dayFull}`}
                </button>

                <p className="mt-2 text-center text-xs text-muted-foreground">
                  שעת היציאה נרשמת אוטומטית כסוף הסדר. יציאה מוקדמת נערכת בתוכנה המלאה.
                </p>
              </section>

              {/* ── Everything else the day can need, one click away. ────────── */}
              <aside className="space-y-4" aria-label="פעולות נוספות">
                <section aria-labelledby="quick-day-title">
                  <h2 id="quick-day-title" className="mb-1 text-base font-semibold">
                    נרשם {dayFull}
                  </h2>
                  <DaySummary
                    date={date}
                    dayWord={dayWord}
                    editingId={editing?.id ?? null}
                    onEdit={editEntry}
                    readOnly={!!blockedMessage}
                  />
                </section>

                <div className="section-rule grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDialog("excused")}
                    disabled={!!blockedMessage}
                    className="pressable-lg disabled:pointer-events-none disabled:opacity-50 flex items-center gap-2 rounded-md border border-border px-3 py-2 text-start hover:border-status-excused hover:bg-accent/40"
                  >
                    <FileText
                      className="size-5 shrink-0 text-status-excused-fg"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">מוצדק</span>
                      <span className="block text-xs text-muted-foreground">איחור מאושר</span>
                    </span>
                  </button>
                  <button
                    onClick={() => setDialog("absence")}
                    disabled={!!blockedMessage}
                    className="pressable-lg disabled:pointer-events-none disabled:opacity-50 flex items-center gap-2 rounded-md border border-border px-3 py-2 text-start hover:border-status-absent hover:bg-accent/40"
                  >
                    <UserX className="size-5 shrink-0 text-status-absent-fg" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">היעדרות</span>
                      <span className="block text-xs text-muted-foreground">סדר שלם שהוחסר</span>
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <BarButton
                    icon={Moon}
                    label="כולל ערב"
                    onClick={() => setDialog("kollel-erev")}
                  />
                  <BarButton
                    icon={BookOpen}
                    label="תורתו בידו"
                    onClick={() => setDialog("torato-beyado")}
                  />
                  <BarButton
                    icon={BarChart3}
                    label="נתוני החודש"
                    onClick={() => setDialog("stats")}
                  />
                </div>
              </aside>
            </div>
          </div>
        </main>

        <ExcusedDialog
          open={dialog === "excused"}
          onClose={() => setDialog(null)}
          seder={activeSeder}
          dayFull={dayFull}
          missingMin={existing ? calcSeder(existing).missingMin : lateBy}
          alsoRecordsArrival={existing ? null : time}
          onApply={applyExcused}
        />
        <AbsenceDialog
          open={dialog === "absence"}
          onClose={() => setDialog(null)}
          suggested={activeSeder}
          noSederB={noSederB}
          dayFull={dayFull}
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
          date={date}
          dayFull={dayFull}
          onApply={addLearning}
        />
        <MonthStatsDialog open={dialog === "stats"} onClose={() => setDialog(null)} date={date} />
      </StoreGuard>
    </div>
  );
}

function BarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Moon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="pressable flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md border border-border px-2 py-2 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-accent/40"
    >
      <Icon className="size-5" aria-hidden="true" />
      <span className="text-sm font-medium text-center leading-tight">{label}</span>
    </button>
  );
}

/**
 * What is already recorded for the chosen day — so the window can be trusted
 * at a glance, and so a wrong entry can be put right where it is seen. Each
 * row loads itself back into the field.
 */
function DaySummary({
  date,
  dayWord,
  editingId,
  onEdit,
  readOnly,
}: {
  date: string;
  dayWord: string;
  editingId: string | null;
  onEdit: (entry: SederEntry) => void;
  /** A day that takes no attendance: rows are shown, not loaded for correction. */
  readOnly: boolean;
}) {
  const { entries } = useSeder();
  const rows = entries.filter((e) => e.date === date).sort((a, b) => a.seder - b.seder);
  if (!rows.length) {
    return (
      <div className="border-y border-dashed border-border px-2 py-4 text-center text-sm text-muted-foreground">
        {dayWord === "היום"
          ? "עדיין לא נרשם דבר היום."
          : `לא נרשם דבר ב${dayWord === "אתמול" ? "אתמול" : `־${dayWord}`}.`}
      </div>
    );
  }
  return (
    <div className="ledger border-y border-border">
      {rows.map((e) => {
        const c = calcSeder(e);
        return (
          <button
            key={e.id}
            onClick={() => onEdit(e)}
            disabled={readOnly}
            title={e.absent ? "טען לתיקון — רישום ההיעדרות יוחלף בהגעה" : "טען לתיקון"}
            className={`pressable w-full min-h-11 flex items-center gap-2.5 px-2 py-2 text-sm text-start hover:bg-accent/60 ${
              editingId === e.id ? "bg-primary/10" : ""
            }`}
          >
            <span className="font-semibold">{e.seder === 1 ? "א׳" : "ב׳"}</span>
            <span className="figure text-muted-foreground" dir="ltr">
              {e.absent ? "היעדרות" : e.arrival}
            </span>
            <span className="flex-1" />
            {c.isOhevei && (
              <span className="rounded-sm bg-status-present/15 px-1.5 py-0.5 text-xs text-status-present-fg">
                אוהבי ה׳
              </span>
            )}
            {c.excusedMin > 0 && (
              <span className="rounded-sm bg-status-excused/15 px-1.5 py-0.5 text-xs text-status-excused-fg">
                מוצדק {c.excusedMin}
              </span>
            )}
            <span
              className={`figure font-medium ${c.netMissingMin > 0 ? "text-destructive" : "text-success"}`}
            >
              {c.netMissingMin > 0 ? `חסר ${c.netMissingMin}` : "מלא"}
            </span>
            <Pencil className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
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
  open,
  onClose,
  seder,
  dayFull,
  missingMin,
  alsoRecordsArrival,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  seder: SederNum;
  dayFull: string;
  missingMin: number;
  /** The arrival time this will also record, when nothing is saved yet. */
  alsoRecordsArrival: string | null;
  onApply: (choice: ExcusedChoice) => void;
}) {
  const [mode, setMode] = useState<"all" | "partial">("all");
  const [minutes, setMinutes] = useState(Math.max(1, missingMin));

  // Reopening for a different seder must not carry the previous answer over.
  useEffect(() => {
    if (open) {
      setMode("all");
      setMinutes(Math.max(1, missingMin));
    }
  }, [open, missingMin]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            מוצדק — {sederLabel(seder)} ({dayFull})
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {missingMin > 0
            ? `כרגע חסרות ${missingMin} דק׳ ב${sederLabel(seder)}.`
            : `אין כרגע דקות חסרות ב${sederLabel(seder)} — סימון מוצדק יחול על חוסר שיירשם.`}
        </p>
        {alsoRecordsArrival && (
          <p className="text-xs text-warning-fg">
            טרם נרשמה הגעה ל{sederLabel(seder)} — השמירה תרשום גם הגעה בשעה {alsoRecordsArrival}.
          </p>
        )}

        <div className="space-y-2">
          <ChoiceRow
            label="הכל מוצדק"
            hint="כל החוסר בסדר הזה"
            selected={mode === "all"}
            onSelect={() => setMode("all")}
          />
          <ChoiceRow
            label="רק חלק מוצדק"
            hint="בחר מספר דקות"
            selected={mode === "partial"}
            onSelect={() => setMode("partial")}
          />
          {mode === "partial" && (
            <div className="flex items-center gap-2 pe-8">
              <input
                type="number"
                min={1}
                max={1440}
                value={minutes}
                autoFocus
                onChange={(e) => setMinutes(Math.max(1, Math.min(1440, +e.target.value || 1)))}
                className="field-input w-24 tabular-nums"
              />
              <span className="text-xs text-muted-foreground">
                דקות מוצדקות{missingMin > 0 ? ` מתוך ${missingMin}` : ""}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button
            onClick={() => onApply(mode === "all" ? { kind: "all" } : { kind: "partial", minutes })}
          >
            <Check className="size-4" /> שמור
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X className="size-4" /> ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Which seder, and was it justified — all of it or part of it?" */
function AbsenceDialog({
  open,
  onClose,
  suggested,
  noSederB,
  dayFull,
  sederLengthMin,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  suggested: SederNum;
  noSederB: boolean;
  dayFull: string;
  sederLengthMin: (s: SederNum) => number;
  onApply: (seder: SederNum, excused: ExcusedChoice | null) => void;
}) {
  const [seder, setSeder] = useState<SederNum>(suggested);
  const [mode, setMode] = useState<"none" | "all" | "partial">("none");
  const [minutes, setMinutes] = useState(60);

  useEffect(() => {
    if (open) {
      setSeder(suggested);
      setMode("none");
      setMinutes(60);
    }
  }, [open, suggested]);

  const length = sederLengthMin(seder);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>רישום היעדרות ({dayFull})</DialogTitle>
        </DialogHeader>

        <div>
          <div className="text-xs text-muted-foreground mb-1.5">באיזה סדר</div>
          <div className="grid grid-cols-2 gap-2">
            {([1, 2] as SederNum[]).map((s) => (
              <button
                key={s}
                onClick={() => setSeder(s)}
                className={`rounded-md border-2 px-3 py-2.5 text-sm font-medium pressable transition ${
                  seder === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/40"
                }`}
              >
                {sederLabel(s)}
              </button>
            ))}
          </div>
          {seder === 2 && noSederB && (
            <p className="mt-1.5 text-xs text-warning-fg">
              {inDay(dayFull)} אין סדר ב׳ — אין צורך לרשום היעדרות.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">האם ההיעדרות מוצדקת</div>
          <ChoiceRow
            label="לא מוצדקת"
            hint={`כל ${length} הדקות ייחשבו כחוסר`}
            selected={mode === "none"}
            onSelect={() => setMode("none")}
          />
          <ChoiceRow
            label="מוצדקת — הכל"
            hint="ההיעדרות כולה מאושרת"
            selected={mode === "all"}
            onSelect={() => setMode("all")}
          />
          <ChoiceRow
            label="מוצדקת — חלק"
            hint="בחר מספר דקות"
            selected={mode === "partial"}
            onSelect={() => setMode("partial")}
          />
          {mode === "partial" && (
            <div className="flex items-center gap-2 pe-8">
              <input
                type="number"
                min={1}
                max={1440}
                value={minutes}
                autoFocus
                onChange={(e) => setMinutes(Math.max(1, Math.min(1440, +e.target.value || 1)))}
                className="field-input w-24 tabular-nums"
              />
              <span className="text-xs text-muted-foreground">דקות מוצדקות מתוך {length}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button
            onClick={() =>
              onApply(
                seder,
                mode === "none"
                  ? null
                  : mode === "all"
                    ? { kind: "all" }
                    : { kind: "partial", minutes },
              )
            }
          >
            <Check className="size-4" /> שמור
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X className="size-4" /> ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FRAMEWORK_DIALOG: Record<
  "kollel-erev" | "torato-beyado",
  { title: string; hint: string; icon: typeof Moon }
> = {
  "kollel-erev": { title: "כולל ערב", hint: "מספר הדקות שנלמדו הערב", icon: Moon },
  "torato-beyado": { title: "תורתו בידו", hint: "מספר הדקות שנלמדו", icon: BookOpen },
};

/** One number, for one learning framework, for today. */
function MinutesDialog({
  open,
  onClose,
  framework,
  date,
  dayFull,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  framework: "kollel-erev" | "torato-beyado";
  date: string;
  dayFull: string;
  onApply: (framework: LearningFramework, minutes: number) => void;
}) {
  const [minutes, setMinutes] = useState(60);
  const minutesId = useId();
  const { title, hint, icon: Icon } = FRAMEWORK_DIALOG[framework];
  const { items } = useLearning();

  useEffect(() => {
    if (open) setMinutes(60);
  }, [open, framework]);

  const todayTotal = items
    .filter((l) => l.framework === framework && l.date === date)
    .reduce((s, l) => s + l.minutes, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-5 text-primary" /> {title} ({dayFull})
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor={minutesId} className="text-xs text-muted-foreground">
            {hint}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={minutesId}
              type="number"
              min={1}
              max={1440}
              value={minutes}
              autoFocus
              onChange={(e) => setMinutes(Math.max(1, Math.min(1440, +e.target.value || 1)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") onApply(framework, minutes);
              }}
              className="field-input flex-1 text-center text-xl tabular-nums py-3"
            />
            <span className="text-sm text-muted-foreground">דקות</span>
          </div>
          <div className="flex gap-2">
            {[30, 45, 60, 90].map((m) => (
              <button
                key={m}
                onClick={() => setMinutes(m)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs tabular-nums pressable transition ${
                  minutes === m
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {todayTotal > 0 && (
            <p className="text-xs text-muted-foreground">
              נרשמו {inDay(dayFull)} {todayTotal} דק׳ במסגרת זו — הרישום החדש יתווסף אליהן.
            </p>
          )}
        </div>
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button onClick={() => onApply(framework, minutes)}>
            <Check className="size-4" aria-hidden="true" /> הוסף ל{dayFull}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X className="size-4" /> ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The month, in the figures the user actually asks about. */
function MonthStatsDialog({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
}) {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const { settings } = useSettings();
  const now = parseISODate(date) ?? new Date();
  const monthEntries = entriesInMonth(entries, now.getFullYear(), now.getMonth());
  const s = summarizeEntries(monthEntries);
  const monthPrefix = monthPrefixOf(date);
  const learnFor = (framework: LearningFramework) =>
    lessons
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
      ? [
          {
            label: "חבורת ש״ס",
            value: s.shasCount,
            hint: `הגעות לסדר ב׳ עד ${SHAS_ARRIVAL_DEADLINE}`,
          },
        ]
      : []),
    { label: "דקות כולל ערב", value: learnFor("kollel-erev") },
    { label: "דקות תורתו בידו", value: learnFor("torato-beyado") },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="size-5 text-primary" aria-hidden="true" /> נתוני החודש{" "}
            {now.toLocaleDateString("he-IL", { month: "long", year: "numeric" })}
          </DialogTitle>
        </DialogHeader>
        {s.entries === 0 ? (
          <p className="text-sm text-muted-foreground">עדיין לא נרשם דבר בחודש הזה.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {rows.map((r) => (
              <li key={r.label} className="flex items-baseline gap-2 px-3 py-2.5">
                <span className="text-sm">{r.label}</span>
                {r.hint && <span className="text-xs text-muted-foreground">{r.hint}</span>}
                <span className="flex-1" />
                <span className="text-base font-bold tabular-nums">{r.value}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {s.entries} רישומי סדר בחודש. לפירוט מלא — בתוכנה המלאה.
        </p>
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button variant="outline" onClick={onClose}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceRow({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-start gap-2.5 rounded-md border-2 p-3 text-start pressable transition ${
        selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
      }`}
    >
      <span
        className={`mt-0.5 size-4 rounded-full border-2 shrink-0 grid place-items-center ${selected ? "border-primary" : "border-muted-foreground/40"}`}
      >
        {selected && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
