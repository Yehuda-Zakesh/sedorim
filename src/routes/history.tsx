// History — one month at a time.
//
// It used to render every record ever entered in one table, with a month
// header and a closing line injected between each month. After a year that is
// several hundred rows on one screen, and the month you actually wanted was
// somewhere in the middle of it.
//
// Now the screen opens on the current month and nothing else. Moving between
// months is two arrows and a list; the closing summary belongs to the month on
// screen, so the numbers always add up to the rows above them.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Search, Trash2, History as HistoryIcon, BookOpen, FileDown, Loader2, Lock,
  LockOpen, ChevronRight, ChevronLeft, CalendarRange, X,
} from "lucide-react";
import {
  useSeder, useLearning, calcSeder, monthClosing,
  FRAMEWORK_LABELS, type MonthClosing, type LearningEntry, type SederEntry,
} from "@/lib/kollel-store";
import { exportMonthClosingsPdf } from "@/lib/exporters";
import { formatHebrewDate } from "@/lib/hebrew-calendar";
import { currentMonthKey, monthKeyLabel, monthsWithData, shiftMonth } from "@/lib/month-nav";
import { useSettings, SHAS_ARRIVAL_DEADLINE } from "@/lib/settings-store";
import { logProblem } from "@/lib/diagnostics";
import { toastUndo } from "@/lib/undo";
import { toast } from "sonner";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "היסטוריה — סדר פלוס" }] }),
  component: HistoryPage,
});

type TypeFilter = "all" | "late" | "absent" | "early" | "ohevei" | "bonus";
type ExcusedFilter = "all" | "excused" | "non-excused";

function HistoryPage() {
  const { entries, remove, upsert } = useSeder();
  const learning = useLearning();
  const [tab, setTab] = useState<"list" | "learning">("list");
  const [month, setMonth] = useState(currentMonthKey());
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const months = useMemo(() => monthsWithData(entries, learning.items), [entries, learning.items]);
  const monthEntries = useMemo(() => entries.filter((e) => e.date.startsWith(month)), [entries, month]);
  const monthLessons = useMemo(() => learning.items.filter((l) => l.date.startsWith(month)), [learning.items, month]);
  const closing = useMemo(() => monthClosing(month, monthEntries, monthLessons), [month, monthEntries, monthLessons]);

  const exportClosings = async (closings: MonthClosing[], busyKey: string) => {
    setPdfBusy(busyKey);
    try {
      // False means the save dialog was cancelled, not that anything failed.
      if (await exportMonthClosingsPdf({ closings })) toast.success("הסיכום יוצא ל-PDF");
    } catch (e) {
      logProblem("ייצוא סיכום חודשי", e);
      toast.error("הייצוא נכשל");
    } finally { setPdfBusy(null); }
  };

  const exportAllMonths = () => {
    const all = months
      .filter((key) => entries.some((e) => e.date.startsWith(key)) || learning.items.some((l) => l.date.startsWith(key)))
      .sort()
      .map((key) => monthClosing(
        key,
        entries.filter((e) => e.date.startsWith(key)),
        learning.items.filter((l) => l.date.startsWith(key)),
      ));
    if (!all.length) { toast.error("אין נתונים לייצוא"); return; }
    void exportClosings(all, "__all");
  };

  return (
    <AppShell
      title="היסטוריה"
      subtitle={`${entries.length} רישומי סדר · ${learning.items.length} רישומי לימוד`}
      actions={
        <button onClick={exportAllMonths} disabled={pdfBusy !== null}
          title="ייצוא שורת סיכום לכל החודשים"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 text-xs hover:bg-accent disabled:opacity-50">
          {pdfBusy === "__all" ? <Loader2 className="size-4 animate-spin" /> : <CalendarRange className="size-4" />}
          <span className="hidden sm:inline">סיכום כל החודשים</span>
        </button>
      }
    >
      <MonthPicker value={month} months={months} onChange={setMonth} closing={closing} />

      <div className="mt-4 mb-4 inline-flex rounded-lg border border-border bg-card p-1">
        <button onClick={() => setTab("list")}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium pressable transition ${tab === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <HistoryIcon className="size-3.5" /> נוכחות ({monthEntries.length})
        </button>
        <button onClick={() => setTab("learning")}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium pressable transition ${tab === "learning" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <BookOpen className="size-3.5" /> לימוד נוסף ({monthLessons.length})
        </button>
      </div>

      {tab === "learning" ? (
        <LearningHistory
          items={monthLessons}
          onRemove={(item) => {
            learning.remove(item.id);
            toastUndo("רישום הלימוד נמחק", () => learning.add(item));
          }}
        />
      ) : (
        <AttendanceHistory
          entries={monthEntries}
          onRemove={(e) => {
            remove(e.id);
            toastUndo(`הרישום מ-${e.date} נמחק`, () => upsert(e));
          }}
        />
      )}

      <MonthClosingCard
        closing={closing}
        busy={pdfBusy === month}
        disabled={pdfBusy !== null}
        onExport={() => exportClosings([closing], month)}
      />
    </AppShell>
  );
}

/** Arrows for the month either side, and a list for anything further away. */
function MonthPicker({
  value, months, onChange, closing,
}: {
  value: string;
  months: string[];
  onChange: (key: string) => void;
  closing: MonthClosing;
}) {
  const [listOpen, setListOpen] = useState(false);
  const isCurrent = value === currentMonthKey();

  return (
    <div className="card-surface p-4">
      <div className="flex items-center gap-2">
        {/* Right arrow steps back in time: in an RTL layout, back is to the right. */}
        <button onClick={() => onChange(shiftMonth(value, -1))} title="החודש הקודם"
          className="size-9 rounded-lg border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent pressable transition">
          <ChevronRight className="size-4" />
        </button>

        <button onClick={() => setListOpen((v) => !v)}
          className="flex-1 min-w-0 rounded-lg px-3 py-1.5 text-center hover:bg-accent/40 pressable transition">
          <div className="flex items-center justify-center gap-2">
            {closing.closed
              ? <Lock className="size-3.5 text-muted-foreground" />
              : <LockOpen className="size-3.5 text-primary" />}
            <span className="text-base font-semibold">{closing.gregorianLabel}</span>
          </div>
          <div className="text-2xs text-muted-foreground">
            {closing.hebrewLabel}
            {!closing.closed && " · חודש פתוח"}
          </div>
        </button>

        <button onClick={() => onChange(shiftMonth(value, 1))} disabled={isCurrent} title="החודש הבא"
          className="size-9 rounded-lg border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent pressable transition disabled:opacity-30">
          <ChevronLeft className="size-4" />
        </button>
      </div>

      {listOpen && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">בחר חודש</span>
            <button onClick={() => setListOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-56 overflow-auto">
            {months.map((key) => (
              <button key={key}
                onClick={() => { onChange(key); setListOpen(false); }}
                className={`rounded-md border px-2.5 py-2 text-xs pressable transition ${
                  key === value ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:bg-accent"
                }`}>
                {monthKeyLabel(key)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isCurrent && (
        <button onClick={() => onChange(currentMonthKey())}
          className="mt-3 w-full rounded-md border border-dashed border-border py-1.5 text-2xs text-muted-foreground hover:bg-accent pressable transition">
          חזור לחודש הנוכחי
        </button>
      )}
    </div>
  );
}

function AttendanceHistory({
  entries, onRemove,
}: {
  entries: SederEntry[];
  onRemove: (e: SederEntry) => void;
}) {
  const [q, setQ] = useState("");
  const [sederFilter, setSederFilter] = useState<"all" | "1" | "2">("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [excusedFilter, setExcusedFilter] = useState<ExcusedFilter>("all");

  const filtered = entries.filter((e) => {
    if (sederFilter !== "all" && String(e.seder) !== sederFilter) return false;
    const c = calcSeder(e);
    if (typeFilter === "late" && !c.isLate) return false;
    if (typeFilter === "absent" && !e.absent) return false;
    if (typeFilter === "early" && !c.isEarlyDeparture) return false;
    if (typeFilter === "ohevei" && !c.isOhevei) return false;
    if (typeFilter === "bonus" && c.bonusMin === 0) return false;
    if (excusedFilter === "excused" && c.excusedMin === 0) return false;
    if (excusedFilter === "non-excused" && c.excusedMin > 0) return false;
    if (q && !(e.date.includes(q) || (e.note || "").includes(q) || (e.excusedReason || "").includes(q) || (e.tags || []).some((t) => t.includes(q)))) return false;
    return true;
  });

  const filtersOn = q !== "" || sederFilter !== "all" || typeFilter !== "all" || excusedFilter !== "all";

  return (
    <>
      <div className="card-surface p-4 mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי תאריך, הערה, סיבה או תגית..."
            className="w-full rounded-md border border-input bg-card ps-9 pe-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
          <select value={sederFilter} onChange={(e) => setSederFilter(e.target.value as "all" | "1" | "2")}
            className="field-input-sm">
            <option value="all">כל הסדרים</option>
            <option value="1">סדר א׳</option>
            <option value="2">סדר ב׳</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="field-input-sm">
            <option value="all">כל הסוגים</option>
            <option value="late">איחור</option>
            <option value="absent">היעדרות</option>
            <option value="early">יציאה מוקדמת</option>
            <option value="ohevei">אוהבי ה׳</option>
            <option value="bonus">בונוס</option>
          </select>
          <select value={excusedFilter} onChange={(e) => setExcusedFilter(e.target.value as ExcusedFilter)}
            className="field-input-sm">
            <option value="all">מוצדק ולא מוצדק</option>
            <option value="excused">מוצדק בלבד</option>
            <option value="non-excused">לא מוצדק בלבד</option>
          </select>
        </div>
        {filtersOn && (
          <div className="flex items-center justify-between text-2xs text-muted-foreground">
            <span>{filtered.length} מתוך {entries.length} רישומי החודש</span>
            <button onClick={() => { setQ(""); setSederFilter("all"); setTypeFilter("all"); setExcusedFilter("all"); }}
              className="hover:text-foreground">נקה סינון</button>
          </div>
        )}
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-start px-3 py-3 font-medium">תאריך</th>
              <th className="text-start px-3 py-3 font-medium">סדר</th>
              <th className="text-start px-3 py-3 font-medium">הגעה</th>
              <th className="text-start px-3 py-3 font-medium">יציאה</th>
              <th className="text-start px-3 py-3 font-medium">חסר נטו</th>
              <th className="text-start px-3 py-3 font-medium">בונוס</th>
              <th className="text-start px-3 py-3 font-medium">מוצדק</th>
              <th className="text-start px-3 py-3 font-medium">סטטוס</th>
              <th className="px-3 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const c = calcSeder(e);
              const tags: string[] = [];
              if (e.absent) tags.push("היעדרות");
              if (c.isLate) tags.push("איחור");
              if (c.isEarlyDeparture) tags.push("יצא מוקדם");
              if (c.isOhevei) tags.push("אוהבי ה׳");
              return (
                <tr key={e.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-3 py-3 tabular-nums" title={formatHebrewDate(new Date(e.date))}>{e.date}</td>
                  <td className="px-3 py-3">{e.seder === 1 ? "א׳" : "ב׳"}</td>
                  <td className="px-3 py-3 tabular-nums">{e.absent ? "—" : (e.arrival || "—")}</td>
                  <td className="px-3 py-3 tabular-nums">{e.absent ? "—" : (e.departure || "—")}</td>
                  <td className="px-3 py-3 tabular-nums">{c.netMissingMin}</td>
                  <td className="px-3 py-3 tabular-nums">{c.bonusMin}</td>
                  <td className="px-3 py-3 tabular-nums">{c.excusedMin}</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{tags.join(", ") || "מלא"}</td>
                  <td className="px-3 py-3">
                    <button title="מחק רישום" onClick={() => onRemove(e)}
                      className="size-7 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center">
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {entries.length === 0 ? "אין רישומי סדר בחודש הזה" : "אין רישומים שתואמים לסינון"}
          </div>
        )}
      </div>
    </>
  );
}

/** The month's closing line: seder totals plus the learning minutes in it. */
function MonthClosingCard({
  closing, busy, disabled, onExport,
}: {
  closing: MonthClosing;
  busy: boolean;
  disabled: boolean;
  onExport: () => void;
}) {
  const { seder, learning } = closing;
  const { settings } = useSettings();
  const shasChavura = settings.seder.shasChavura;
  const erevTitle = learning.kollelErev !== learning.kollelErevRaw
    ? `${learning.kollelErevRaw} דק׳ בפועל · תענית דיבור נספרת כפול`
    : undefined;

  return (
    <div className="mt-4 card-surface border-t-2 border-t-primary/40 p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">
            {closing.closed ? "סיכום החודש" : "סיכום עד כה"} — {closing.gregorianLabel}
          </h3>
          <p className="text-2xs text-muted-foreground">
            {closing.hebrewLabel} · {seder.entries} רישומי סדר
            {!closing.closed && " · החודש טרם הסתיים"}
          </p>
        </div>
        <button onClick={onExport} disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
          ייצוא סיכום החודש ל-PDF
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <ClosingStat label="סה״כ דקות" value={seder.totalMissing} />
        <ClosingStat label="מוצדקות" value={seder.excused} />
        <ClosingStat label="חסר נטו" value={seder.netMissing} />
        <ClosingStat label="איחורים" value={seder.lateCount} />
        <ClosingStat label="חיסורים" value={seder.absenceCount} />
        <ClosingStat label="אוהבי ה׳" value={seder.oheveiCount} />
        <ClosingStat label="כולל ערב" value={learning.kollelErev} title={erevTitle} />
        {shasChavura && (
          <ClosingStat label="חבורת ש״ס" value={seder.shasCount}
            title={`הגעות לסדר ב׳ עד ${SHAS_ARRIVAL_DEADLINE}`} />
        )}
      </div>
      {learning.toratoBeyado > 0 || learning.beinHazmanim > 0 ? (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {learning.toratoBeyado > 0 && <ClosingStat label="תורתו בידו" value={learning.toratoBeyado} />}
          {learning.beinHazmanim > 0 && <ClosingStat label="בין הזמנים" value={learning.beinHazmanim} />}
        </div>
      ) : null}
    </div>
  );
}

function ClosingStat({ label, value, title }: { label: string; value: number; title?: string }) {
  return (
    <div className="rounded-lg border border-border p-3" title={title}>
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function LearningHistory({ items, onRemove }: { items: LearningEntry[]; onRemove: (item: LearningEntry) => void }) {
  const [q, setQ] = useState("");
  const [framework, setFramework] = useState<string>("all");

  const filtered = items.filter((i) => {
    if (framework !== "all" && i.framework !== framework) return false;
    if (q && !(i.date.includes(q) || (i.note || "").includes(q) || FRAMEWORK_LABELS[i.framework].includes(q))) return false;
    return true;
  });

  const totalMin = filtered.reduce((s, i) => s + i.minutes, 0);

  return (
    <>
      <div className="card-surface p-4 mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי תאריך, מסגרת או הערה..."
            className="w-full rounded-md border border-input bg-card ps-9 pe-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <select value={framework} onChange={(e) => setFramework(e.target.value)}
            className="field-input-sm">
            <option value="all">כל המסגרות</option>
            <option value="kollel-erev">כולל ערב</option>
            <option value="torato-beyado">תורתו בידו</option>
            <option value="bein-hazmanim">ישיבת בין הזמנים</option>
          </select>
          <div className="rounded-md border border-border px-2 py-1.5 text-center">
            סה״כ: <span className="font-semibold tabular-nums">{totalMin}</span> דק׳ · {filtered.length} רישומים
          </div>
        </div>
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-start px-3 py-3 font-medium">תאריך</th>
              <th className="text-start px-3 py-3 font-medium">מסגרת</th>
              <th className="text-start px-3 py-3 font-medium">דקות</th>
              <th className="text-start px-3 py-3 font-medium">נחשב</th>
              <th className="text-start px-3 py-3 font-medium">מקור</th>
              <th className="text-start px-3 py-3 font-medium">הערה</th>
              <th className="px-3 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className="border-t border-border hover:bg-accent/40">
                <td className="px-3 py-3 tabular-nums" title={formatHebrewDate(new Date(i.date))}>{i.date}</td>
                <td className="px-3 py-3">{FRAMEWORK_LABELS[i.framework]}</td>
                <td className="px-3 py-3 tabular-nums">{i.minutes}</td>
                <td className="px-3 py-3 tabular-nums">
                  {i.tanitDibur ? <span className="text-primary">{i.minutes * 2} ×2</span> : i.minutes}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{i.source === "timer" ? "טיימר" : i.source === "range" ? "טווח שעות" : "ידני"}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{i.note || "—"}</td>
                <td className="px-3 py-3">
                  <button onClick={() => onRemove(i)} title="מחק רישום"
                    className="size-7 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center">
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {items.length === 0 ? "אין רישומי לימוד בחודש הזה" : "אין רישומים שתואמים לסינון"}
          </div>
        )}
      </div>
    </>
  );
}
