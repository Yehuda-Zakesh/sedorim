import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Search, Trash2, History as HistoryIcon, CalendarDays } from "lucide-react";
import { useSeder, calcSeder, monthlySummary } from "@/lib/kollel-store";
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
  const [tab, setTab] = useState<"list" | "calendar">("list");
  const [q, setQ] = useState("");
  const [sederFilter, setSederFilter] = useState<"all" | "1" | "2">("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [excusedFilter, setExcusedFilter] = useState<ExcusedFilter>("all");
  const [month, setMonth] = useState("");

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

  return (
    <AppShell title="היסטוריה" subtitle={`${entries.length} רישומים סה״כ`}>
      <div className="mb-4 inline-flex rounded-lg border border-border bg-card p-1">
        <button onClick={() => setTab("list")}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium transition ${tab === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <HistoryIcon className="size-3.5" /> טבלת רישומים
        </button>
        <button onClick={() => setTab("calendar")}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium transition ${tab === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <CalendarDays className="size-3.5" /> לוח שנה
        </button>
      </div>

      {tab === "calendar" ? <CalendarView /> : (
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
                    <button onClick={() => { remove(e.id); toast("נמחק"); }}
                      className="size-7 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center">
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
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

function SumRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
