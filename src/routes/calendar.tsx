import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ChevronRight, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "לוח שנה — המעקב שלי" }] }),
  component: CalendarPage,
});

type S = "present" | "late" | "absent" | "excused" | "none" | null;

const months = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const weekdays = ["א","ב","ג","ד","ה","ו","ש"];

// demo data for June 2026
const demo: Record<number, S> = {
  1:"excused",2:"present",3:"late",4:"present",5:"present",
  7:"present",8:"present",9:"present",10:"late",11:"present",12:"present",
  14:"present",15:"absent",16:"present",17:"present",18:"present",19:"present",
  21:"present",22:"present",
};

const colorOf = (s: S) =>
  s === "present" ? "var(--status-present)" :
  s === "late"    ? "var(--status-late)" :
  s === "absent"  ? "var(--status-absent)" :
  s === "excused" ? "var(--status-excused)" :
  s === "none"    ? "var(--status-none)" : "transparent";

const labelOf = (s: S) =>
  s === "present" ? "נוכח" : s === "late" ? "איחור" :
  s === "absent" ? "נעדר" : s === "excused" ? "מוצדק" :
  s === "none" ? "ללא רישום" : "—";

function CalendarPage() {
  const [month, setMonth] = useState(5); // June
  const [year, setYear] = useState(2026);

  const first = new Date(year, month, 1).getDay(); // 0=Sun
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
    setMonth(m); setYear(y);
  };

  const summary = Object.values(demo).reduce<Record<string, number>>((acc, s) => {
    if (s) acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell title="לוח שנה" subtitle="תצוגה חודשית בקידוד צבעוני">
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
              const status = day ? demo[day] ?? null : null;
              const color = colorOf(status);
              return (
                <div
                  key={i}
                  className={[
                    "aspect-square rounded-lg border p-1.5 flex flex-col",
                    day ? "border-border bg-card hover:border-primary cursor-pointer transition" : "border-transparent",
                  ].join(" ")}
                  style={status ? { backgroundColor: `color-mix(in oklch, ${color} 18%, var(--color-card))`, borderColor: `color-mix(in oklch, ${color} 50%, transparent)` } : undefined}
                >
                  {day && (
                    <>
                      <div className="text-xs font-semibold tabular-nums">{day}</div>
                      {status && (
                        <div className="mt-auto self-end size-2 rounded-full" style={{ backgroundColor: color }} />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-surface p-5">
            <h3 className="text-sm font-semibold mb-3">מקרא</h3>
            <ul className="space-y-2 text-sm">
              {(["present","late","absent","excused","none"] as S[]).map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ backgroundColor: colorOf(s) }} />
                  <span>{labelOf(s)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card-surface p-5">
            <h3 className="text-sm font-semibold mb-3">סיכום חודשי</h3>
            <ul className="space-y-2 text-sm">
              {(["present","late","absent","excused"] as S[]).map((s) => (
                <li key={s} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: colorOf(s) }} />
                    <span className="text-muted-foreground">{labelOf(s)}</span>
                  </div>
                  <span className="font-semibold tabular-nums">{summary[s as string] ?? 0}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
