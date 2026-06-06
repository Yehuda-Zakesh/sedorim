import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Search, Check, Clock, X, FileText, Trash2 } from "lucide-react";
import { useAttendance, type AttendanceStatus } from "@/lib/tracker-store";
import { toast } from "sonner";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "היסטוריה — המעקב שלי" }] }),
  component: HistoryPage,
});

const meta: Record<AttendanceStatus, { label: string; icon: typeof Check; color: string }> = {
  present: { label: "נוכח",   icon: Check,    color: "text-status-present" },
  late:    { label: "איחור",  icon: Clock,    color: "text-status-late" },
  absent:  { label: "נעדר",   icon: X,        color: "text-status-absent" },
  excused: { label: "מוצדק",  icon: FileText, color: "text-status-excused" },
};

const filters: { key: "all" | AttendanceStatus; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "present", label: "נוכח" },
  { key: "late", label: "איחור" },
  { key: "absent", label: "נעדר" },
  { key: "excused", label: "מוצדק" },
];

function HistoryPage() {
  const { records, remove } = useAttendance();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | AttendanceStatus>("all");

  const filtered = records.filter((r) =>
    (filter === "all" || r.status === filter) &&
    (r.date.includes(q) || (r.note ?? "").includes(q))
  );

  return (
    <AppShell title="היסטוריה" subtitle={`${records.length} רישומים סה״כ`}>
      <div className="card-surface p-4 mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי תאריך או הערה..."
            className="w-full rounded-md border border-input bg-card pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs transition ${filter === f.key ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground border border-border"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-right px-4 py-3 font-medium">תאריך</th>
              <th className="text-right px-4 py-3 font-medium">סטטוס</th>
              <th className="text-right px-4 py-3 font-medium">הערה</th>
              <th className="px-4 py-3 w-12"></th>
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
                  <td className="px-4 py-3">
                    <button onClick={() => { remove(r.date); toast("הרישום נמחק"); }}
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
    </AppShell>
  );
}
