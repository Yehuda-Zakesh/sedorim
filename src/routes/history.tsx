import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Search, Filter, Check, Clock, X, FileText, MinusCircle } from "lucide-react";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "היסטוריה — המעקב שלי" }] }),
  component: HistoryPage,
});

type S = "present" | "late" | "absent" | "excused" | "none";
const rows: { date: string; status: S; note?: string }[] = [
  { date: "2026-06-05", status: "present" },
  { date: "2026-06-04", status: "present" },
  { date: "2026-06-03", status: "late", note: "תחבורה ציבורית" },
  { date: "2026-06-02", status: "present" },
  { date: "2026-06-01", status: "excused", note: "תור רפואי" },
  { date: "2026-05-31", status: "present" },
  { date: "2026-05-30", status: "present" },
  { date: "2026-05-29", status: "absent", note: "מחלה" },
  { date: "2026-05-28", status: "present" },
  { date: "2026-05-27", status: "present" },
  { date: "2026-05-26", status: "late" },
  { date: "2026-05-25", status: "present" },
];

const meta: Record<S, { label: string; icon: typeof Check; color: string }> = {
  present: { label: "נוכח",   icon: Check,       color: "text-status-present" },
  late:    { label: "איחור",  icon: Clock,       color: "text-status-late" },
  absent:  { label: "נעדר",   icon: X,           color: "text-status-absent" },
  excused: { label: "מוצדק",  icon: FileText,    color: "text-status-excused" },
  none:    { label: "ללא",    icon: MinusCircle, color: "text-status-none" },
};

function HistoryPage() {
  const [q, setQ] = useState("");
  const filtered = rows.filter((r) => r.date.includes(q) || (r.note ?? "").includes(q));

  return (
    <AppShell title="היסטוריה" subtitle="כל הרישומים שלך">
      <div className="card-surface p-4 mb-4 flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי תאריך או הערה..."
            className="w-full rounded-md border border-input bg-card pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
          <Filter className="size-4" /> סינון
        </button>
      </div>

      <div className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-right px-4 py-3 font-medium">תאריך</th>
              <th className="text-right px-4 py-3 font-medium">סטטוס</th>
              <th className="text-right px-4 py-3 font-medium">הערה</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const m = meta[r.status];
              return (
                <tr key={r.date} className="border-t border-border hover:bg-accent/40">
                  <td className="px-4 py-3 tabular-nums">{r.date}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <m.icon className={`size-4 ${m.color}`} />
                      <span>{m.label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.note ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && <div className="p-10 text-center text-sm text-muted-foreground">לא נמצאו רישומים</div>}
      </div>
    </AppShell>
  );
}
