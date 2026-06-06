import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Check, Clock, X, FileText, Save, CalendarDays } from "lucide-react";
import { useAttendance, todayISO, type AttendanceStatus } from "@/lib/tracker-store";
import { toast } from "sonner";

export const Route = createFileRoute("/attendance")({
  head: () => ({ meta: [{ title: "נוכחות — המעקב שלי" }] }),
  component: AttendancePage,
});

const statuses: { key: AttendanceStatus; label: string; icon: typeof Check; color: string; bg: string }[] = [
  { key: "present", label: "נוכח",  icon: Check,    color: "text-status-present", bg: "bg-status-present/15  hover:bg-status-present/25" },
  { key: "late",    label: "איחור", icon: Clock,    color: "text-status-late",    bg: "bg-status-late/15     hover:bg-status-late/25" },
  { key: "absent",  label: "נעדר",  icon: X,        color: "text-status-absent",  bg: "bg-status-absent/15   hover:bg-status-absent/25" },
  { key: "excused", label: "מוצדק", icon: FileText, color: "text-status-excused", bg: "bg-status-excused/15  hover:bg-status-excused/25" },
];

function AttendancePage() {
  const { records, upsert } = useAttendance();
  const today = todayISO();
  const existing = records.find((r) => r.date === today);
  const [selected, setSelected] = useState<AttendanceStatus | null>(existing?.status ?? null);
  const [note, setNote] = useState(existing?.note ?? "");

  const save = () => {
    if (!selected) return;
    upsert({ date: today, status: selected, note: note.trim() || undefined });
    toast.success("הרישום נשמר", { description: today });
  };

  const recent = records.slice(0, 6);

  return (
    <AppShell title="נוכחות" subtitle="רישום נוכחות יומי" actions={
      <button onClick={save} disabled={!selected}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50">
        <Save className="size-4" /> שמירה
      </button>
    }>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-surface p-6 lg:col-span-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" />
            <span>{new Date(today).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          </div>
          <h2 className="text-xl font-semibold mt-1">
            {existing ? "עדכון רישום היומי" : "מה הסטטוס שלך היום?"}
          </h2>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statuses.map((s) => {
              const active = selected === s.key;
              return (
                <button key={s.key} onClick={() => setSelected(s.key)}
                  className={[
                    "rounded-xl border-2 p-4 text-center transition flex flex-col items-center gap-2",
                    s.bg,
                    active ? "ring-2 ring-primary border-primary" : "border-transparent",
                  ].join(" ")}>
                  <s.icon className={`size-6 ${s.color}`} />
                  <span className="text-sm font-medium">{s.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            <label className="text-xs font-medium text-muted-foreground">הערה (אופציונלי)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder="הוסף הקשר לרישום זה..."
              className="mt-1 w-full rounded-md border border-input bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
        </div>

        <div className="card-surface p-5">
          <h3 className="text-sm font-semibold mb-3">רישומים אחרונים</h3>
          <ul className="space-y-2">
            {recent.map((d) => {
              const s = statuses.find((x) => x.key === d.status)!;
              return (
                <li key={d.date} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <div className={`size-9 rounded-md grid place-items-center ${s.bg.split(" ")[0]} ${s.color}`}>
                    <s.icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium tabular-nums">{d.date}</div>
                    {d.note && <div className="text-[11px] text-muted-foreground truncate">{d.note}</div>}
                  </div>
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
