import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { ChevronRight, ChevronLeft, Trash2 } from "lucide-react";
import {
  useAttendance, inMonth, countByStatus,
  type AttendanceStatus, type AttendanceRecord,
} from "@/lib/tracker-store";
import { toast } from "sonner";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "לוח שנה — המעקב שלי" }] }),
  component: CalendarPage,
});

const months = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const weekdays = ["א","ב","ג","ד","ה","ו","ש"];

const colorOf = (s: AttendanceStatus | null) =>
  s === "present" ? "var(--status-present)" :
  s === "late"    ? "var(--status-late)" :
  s === "absent"  ? "var(--status-absent)" :
  s === "excused" ? "var(--status-excused)" :
  "var(--status-none)";

const labelOf = (s: AttendanceStatus | null) =>
  s === "present" ? "נוכח" : s === "late" ? "איחור" :
  s === "absent" ? "נעדר" : s === "excused" ? "מוצדק" : "ללא רישום";

function CalendarPage() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { records, upsert, remove } = useAttendance();

  const map = useMemo(() => {
    const m: Record<string, AttendanceRecord> = {};
    for (const r of records) m[r.date] = r;
    return m;
  }, [records]);

  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(first).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const goto = (delta: number) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y); setSelectedDate(null);
  };

  const counts = countByStatus(inMonth(records, year, month));
  const selectedRec = selectedDate ? map[selectedDate] : null;

  const dateOf = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const setStatus = (s: AttendanceStatus) => {
    if (!selectedDate) return;
    upsert({ date: selectedDate, status: s, note: selectedRec?.note });
    toast.success(`עודכן ל${labelOf(s)}`, { description: selectedDate });
  };

  const clear = () => {
    if (!selectedDate) return;
    remove(selectedDate);
    toast("הרישום נמחק");
  };

  return (
    <AppShell title="לוח שנה" subtitle="תצוגה חודשית בקידוד צבעוני — לחץ על יום לעריכה">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="card-surface p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-1">
              <button onClick={() => goto(-1)} className="size-9 rounded-md hover:bg-accent grid place-items-center">
                <ChevronRight className="size-4" />
              </button>
              <button onClick={() => goto(1)} className="size-9 rounded-md hover:bg-accent grid place-items-center">
                <ChevronLeft className="size-4" />
              </button>
            </div>
            <h2 className="text-base font-semibold">{months[month]} {year}</h2>
            <button onClick={() => { const d = new Date(); setMonth(d.getMonth()); setYear(d.getFullYear()); }}
              className="text-xs rounded-md border border-border px-3 py-1.5 hover:bg-accent">היום</button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 mb-2">
            {weekdays.map((d) => (
              <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} className="aspect-square" />;
              const dateStr = dateOf(day);
              const status = map[dateStr]?.status ?? null;
              const color = colorOf(status);
              const isSelected = selectedDate === dateStr;
              const isToday =
                year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(dateStr)}
                  className={[
                    "aspect-square rounded-lg border p-1.5 flex flex-col items-stretch text-right transition",
                    isSelected ? "ring-2 ring-primary border-primary" : "border-border hover:border-primary",
                  ].join(" ")}
                  style={status ? {
                    backgroundColor: `color-mix(in oklch, ${color} 18%, var(--color-card))`,
                    borderColor: isSelected ? "var(--color-primary)" : `color-mix(in oklch, ${color} 50%, transparent)`,
                  } : undefined}
                >
                  <div className={`text-xs font-semibold tabular-nums ${isToday ? "text-primary" : ""}`}>
                    {day}{isToday && <span className="mr-1 text-[9px]">היום</span>}
                  </div>
                  {status && (
                    <div className="mt-auto self-end size-2 rounded-full" style={{ backgroundColor: color }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {selectedDate ? (
            <div className="card-surface p-5">
              <div className="text-xs text-muted-foreground">תאריך נבחר</div>
              <div className="text-base font-semibold tabular-nums mt-0.5">{selectedDate}</div>
              <div className="text-xs text-muted-foreground mt-2">
                סטטוס נוכחי: <span className="font-medium">{labelOf(selectedRec?.status ?? null)}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {(["present","late","absent","excused"] as AttendanceStatus[]).map((s) => (
                  <button key={s} onClick={() => setStatus(s)}
                    className="rounded-md border border-border px-2 py-2 text-xs hover:border-primary transition flex items-center gap-2"
                    style={{ borderColor: selectedRec?.status === s ? colorOf(s) : undefined }}>
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: colorOf(s) }} />
                    {labelOf(s)}
                  </button>
                ))}
              </div>
              {selectedRec && (
                <button onClick={clear}
                  className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:text-destructive hover:border-destructive transition">
                  <Trash2 className="size-3" /> מחיקת רישום
                </button>
              )}
            </div>
          ) : (
            <div className="card-surface p-5 text-xs text-muted-foreground">
              לחץ על יום בלוח כדי לערוך את הסטטוס שלו.
            </div>
          )}

          <div className="card-surface p-5">
            <h3 className="text-sm font-semibold mb-3">סיכום חודשי</h3>
            <ul className="space-y-2 text-sm">
              {(["present","late","absent","excused"] as AttendanceStatus[]).map((s) => (
                <li key={s} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: colorOf(s) }} />
                    <span className="text-muted-foreground">{labelOf(s)}</span>
                  </div>
                  <span className="font-semibold tabular-nums">{counts[s]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
