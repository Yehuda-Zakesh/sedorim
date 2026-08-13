import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Search, Trash2, History as HistoryIcon, CalendarDays, BookOpen, FileDown, Loader2, Lock, LockOpen } from "lucide-react";
import {
  useSeder, useLearning, calcSeder, monthlySummary, monthClosing, groupEntriesByMonth,
  FRAMEWORK_LABELS, type MonthClosing,
} from "@/lib/kollel-store";
import { exportMonthClosingsPdf } from "@/lib/exporters";
import { formatHebrewDate } from "@/lib/hebrew-calendar";
import { toast } from "sonner";
import { CalendarView } from "./calendar";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "היסטוריה — המעקב שלי" }] }),
  component: HistoryPage,
});

type TypeFilter = "all" | "late" | "absent" | "early" | "ohevei" | "bonus";
type ExcusedFilter = "all" | "excused" | "non-excused";

function HistoryPage() {
  const { entries, remove } = useSeder();
  const learning = useLearning();
  const [tab, setTab] = useState<"list" | "learning" | "calendar">("list");
  const [q, setQ] = useState("");
  const [sederFilter, setSederFilter] = useState<"all" | "1" | "2">("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [excusedFilter, setExcusedFilter] = useState<ExcusedFilter>("all");
  const [month, setMonth] = useState("");
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const filtered = entries.filter((e) => {
    if (sederFilter !== "all" && String(e.seder) !== sederFilter) return false;
    if (month && !e.date.startsWith(month)) return false;
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

  const now = new Date();
  const summary = monthlySummary(now.getFullYear(), now.getMonth());

  // Each month gets closed at its end with a summary row under its rows. The
  // closing is computed over the *displayed* rows so the numbers always add up
  // to what's on screen, even with filters active.
  const monthGroups = groupEntriesByMonth(filtered)
    .map((g) => ({ ...g, closing: monthClosing(g.monthKey, g.items, learning.items) }));

  const exportClosings = async (closings: MonthClosing[], busyKey: string) => {
    setPdfBusy(busyKey);
    try {
      // False means the save dialog was cancelled, not that anything failed.
      if (await exportMonthClosingsPdf({ closings })) toast.success("הסיכום יוצא ל-PDF");
    } catch (e) { toast.error("הייצוא נכשל"); console.error(e); }
    finally { setPdfBusy(null); }
  };

  return (
    <AppShell title="היסטוריה" subtitle={`${entries.length} רישומים סה״כ`}>
      <div className="mb-4 inline-flex rounded-lg border border-border bg-card p-1">
        <button onClick={() => setTab("list")}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium transition ${tab === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <HistoryIcon className="size-3.5" /> נוכחות
        </button>
        <button onClick={() => setTab("learning")}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium transition ${tab === "learning" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <BookOpen className="size-3.5" /> לימוד נוסף
        </button>
        <button onClick={() => setTab("calendar")}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium transition ${tab === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <CalendarDays className="size-3.5" /> לוח שנה
        </button>
      </div>

      {tab === "calendar" ? <CalendarView /> : tab === "learning" ? (
        <LearningHistory items={learning.items} onRemove={(id) => { learning.remove(id); toast("נמחק"); }} />
      ) : (
      <>
      <div className="card-surface p-4 mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי תאריך, הערה, סיבה או תגית..."
            className="w-full rounded-md border border-input bg-card pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <select value={sederFilter} onChange={(e) => setSederFilter(e.target.value as "all" | "1" | "2")}
            className="rounded-md border border-input bg-card px-2 py-1.5">
            <option value="all">כל הסדרים</option>
            <option value="1">סדר א׳</option>
            <option value="2">סדר ב׳</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="rounded-md border border-input bg-card px-2 py-1.5">
            <option value="all">כל הסוגים</option>
            <option value="late">איחור</option>
            <option value="absent">היעדרות</option>
            <option value="early">יציאה מוקדמת</option>
            <option value="ohevei">אוהבי ה׳</option>
            <option value="bonus">בונוס</option>
          </select>
          <select value={excusedFilter} onChange={(e) => setExcusedFilter(e.target.value as ExcusedFilter)}
            className="rounded-md border border-input bg-card px-2 py-1.5">
            <option value="all">הכל</option>
            <option value="excused">מוצדק</option>
            <option value="non-excused">לא מוצדק</option>
          </select>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="rounded-md border border-input bg-card px-2 py-1.5" />
        </div>
      </div>

      {monthGroups.length > 1 && (
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{monthGroups.length} חודשים · שורת סיכום בסיום כל חודש</span>
          <button onClick={() => exportClosings(monthGroups.map((g) => g.closing), "__all")}
            disabled={pdfBusy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 font-medium text-foreground hover:bg-accent disabled:opacity-50">
            {pdfBusy === "__all" ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
            ייצוא שורות הסיכום ל-PDF
          </button>
        </div>
      )}

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-right px-3 py-3 font-medium">תאריך</th>
              <th className="text-right px-3 py-3 font-medium">סדר</th>
              <th className="text-right px-3 py-3 font-medium">הגעה</th>
              <th className="text-right px-3 py-3 font-medium">יציאה</th>
              <th className="text-right px-3 py-3 font-medium">חסר</th>
              <th className="text-right px-3 py-3 font-medium">בונוס</th>
              <th className="text-right px-3 py-3 font-medium">מוצדק</th>
              <th className="text-right px-3 py-3 font-medium">סטטוס</th>
              <th className="px-3 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {monthGroups.map((g) => (
              <Fragment key={g.monthKey}>
                <tr className="border-t border-border bg-muted/40">
                  <td colSpan={9} className="px-3 py-2">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      {g.closing.closed
                        ? <Lock className="size-3 text-muted-foreground" />
                        : <LockOpen className="size-3 text-primary" />}
                      {g.closing.gregorianLabel}
                      <span className="font-normal text-muted-foreground">· {g.closing.hebrewLabel}</span>
                      {!g.closing.closed && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">חודש פתוח</span>
                      )}
                    </div>
                  </td>
                </tr>

                {g.items.map((e) => {
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
                        <button onClick={() => { remove(e.id); toast("נמחק"); }}
                          className="size-7 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center">
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                <MonthClosingRow
                  closing={g.closing}
                  busy={pdfBusy === g.monthKey}
                  disabled={pdfBusy !== null}
                  onExport={() => exportClosings([g.closing], g.monthKey)}
                />
              </Fragment>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className="p-10 text-center text-sm text-muted-foreground">לא נמצאו רישומים</div>}
      </div>

      <div className="card-surface p-5 mt-4">
        <h3 className="text-sm font-semibold mb-3">סיכום החודש הנוכחי</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <SumRow label="חסר סה״כ" value={summary.totalMissing} />
          <SumRow label="מוצדק" value={summary.excused} />
          <SumRow label="לא מוצדק" value={summary.nonExcused} />
          <SumRow label="חסר נטו" value={summary.netMissing} />
          <SumRow label="בונוס" value={summary.bonus} />
          <SumRow label="איחורים" value={summary.lateCount} />
          <SumRow label="היעדרויות" value={summary.absenceCount} />
          <SumRow label="אוהבי ה׳" value={summary.oheveiCount} />
        </div>
      </div>
      </>
      )}
    </AppShell>
  );
}

// Closing line for one month: the seder totals plus the extra-learning minutes
// logged in it, with a PDF export of this summary alone.
function MonthClosingRow({ closing, busy, disabled, onExport }: {
  closing: MonthClosing;
  busy: boolean;
  disabled: boolean;
  onExport: () => void;
}) {
  const { seder, learning } = closing;
  const erevTitle = learning.kollelErev !== learning.kollelErevRaw
    ? `${learning.kollelErevRaw} דק׳ בפועל · תענית דיבור נספרת כפול`
    : undefined;
  return (
    <tr className="border-t-2 border-primary/40 bg-primary/5">
      <td colSpan={9} className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-xs font-semibold">
            {closing.closed ? "סיכום חודש" : "סיכום עד כה"} — {closing.gregorianLabel}
          </span>
          <ClosingStat label="סה״כ דקות" value={seder.totalMissing} />
          <ClosingStat label="מוצדקות" value={seder.excused} />
          <ClosingStat label="אוהבי ה׳" value={seder.oheveiCount} />
          <ClosingStat label="איחורים" value={seder.lateCount} />
          <ClosingStat label="חיסורים" value={seder.absenceCount} />
          <ClosingStat label="כולל ערב" value={learning.kollelErev} title={erevTitle} />
          <ClosingStat label="תורתו בידו" value={learning.toratoBeyado} />
          <button onClick={onExport} disabled={disabled}
            title="ייצוא שורת הסיכום של החודש ל-PDF"
            className="ms-auto inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
            PDF
          </button>
        </div>
      </td>
    </tr>
  );
}

function ClosingStat({ label, value, title }: { label: string; value: number; title?: string }) {
  return (
    <span className="flex items-baseline gap-1.5 text-xs" title={title}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </span>
  );
}

function SumRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function LearningHistory({ items, onRemove }: { items: ReturnType<typeof useLearning>["items"]; onRemove: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [framework, setFramework] = useState<string>("all");
  const [month, setMonth] = useState("");

  const filtered = items.filter((i) => {
    if (framework !== "all" && i.framework !== framework) return false;
    if (month && !i.date.startsWith(month)) return false;
    if (q && !(i.date.includes(q) || (i.note || "").includes(q) || FRAMEWORK_LABELS[i.framework].includes(q))) return false;
    return true;
  });

  const totalMin = filtered.reduce((s, i) => s + i.minutes, 0);

  return (
    <>
      <div className="card-surface p-4 mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי תאריך, מסגרת או הערה..."
            className="w-full rounded-md border border-input bg-card pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
          <select value={framework} onChange={(e) => setFramework(e.target.value)}
            className="rounded-md border border-input bg-card px-2 py-1.5">
            <option value="all">כל המסגרות</option>
            <option value="kollel-erev">כולל ערב</option>
            <option value="torato-beyado">תורתו בידו</option>
            <option value="bein-hazmanim">ישיבת בין הזמנים</option>
          </select>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="rounded-md border border-input bg-card px-2 py-1.5" />
          <div className="rounded-md border border-border px-2 py-1.5 text-center">
            סה״כ: <span className="font-semibold tabular-nums">{totalMin}</span> דק׳ · {filtered.length} רישומים
          </div>
        </div>
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-right px-3 py-3 font-medium">תאריך</th>
              <th className="text-right px-3 py-3 font-medium">מסגרת</th>
              <th className="text-right px-3 py-3 font-medium">דקות</th>
              <th className="text-right px-3 py-3 font-medium">מקור</th>
              <th className="text-right px-3 py-3 font-medium">הערה</th>
              <th className="px-3 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className="border-t border-border hover:bg-accent/40">
                <td className="px-3 py-3 tabular-nums" title={formatHebrewDate(new Date(i.date))}>{i.date}</td>
                <td className="px-3 py-3">{FRAMEWORK_LABELS[i.framework]}</td>
                <td className="px-3 py-3 tabular-nums">{i.minutes}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{i.source === "timer" ? "טיימר" : i.source === "range" ? "טווח שעות" : "ידני"}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{i.note || "—"}</td>
                <td className="px-3 py-3">
                  <button onClick={() => onRemove(i.id)}
                    className="size-7 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center">
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className="p-10 text-center text-sm text-muted-foreground">לא נמצאו רישומי לימוד</div>}
      </div>
    </>
  );
}
