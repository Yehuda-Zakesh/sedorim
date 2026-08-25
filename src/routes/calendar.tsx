import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useSeder, calcSeder, monthlySummary, entriesByDate, type SederEntry } from "@/lib/kollel-store";
import { hebrewFromGregorian, hebrewDayLetters, formatHebrewMonthYear } from "@/lib/hebrew-calendar";
import { MonthSummaryCard } from "@/components/month-summary";
import { toastUndo } from "@/lib/undo";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "לוח שנה — המעקב שלי" }] }),
  component: CalendarPage,
});

const months = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const weekdays = ["א","ב","ג","ד","ה","ו","ש"];

function dayTone(list: SederEntry[]): { color: string; label: string } {
  if (!list.length) return { color: "var(--status-none)", label: "ללא רישום" };
  let net = 0, hasOhevei = false, hasAbsent = false;
  for (const e of list) {
    const c = calcSeder(e);
    net += c.netMissingMin;
    if (c.isOhevei) hasOhevei = true;
    if (e.absent) hasAbsent = true;
  }
  if (hasAbsent) return { color: "var(--status-absent)", label: "היעדרות" };
  if (net === 0 && hasOhevei) return { color: "var(--status-present)", label: "אוהבי ה׳" };
  if (net === 0) return { color: "var(--status-present)", label: "נוכחות מלאה" };
  if (net < 30) return { color: "var(--status-late)", label: `${net} דק׳ חסר` };
  return { color: "var(--status-absent)", label: `${net} דק׳ חסר` };
}

function CalendarPage() {
  return (
    <AppShell title="לוח שנה" subtitle="ניווט מהיר בין חודשים">
      <CalendarView />
    </AppShell>
  );
}

function CalendarView() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { entries, remove, upsert } = useSeder();
  const byDate = useMemo(() => entriesByDate(entries), [entries]);

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

  const summary = monthlySummary(year, month);
  const dateOf = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const selectedList = selectedDate ? (byDate[selectedDate] || []) : [];
  const heMonth = formatHebrewMonthYear(hebrewFromGregorian(new Date(year, month, 15)));

  return (
    <>
      <div className="text-xs text-muted-foreground mb-3">{months[month]} {year} · {heMonth}</div>
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
            <div className="flex items-center gap-2">
              <select
                value={month}
                onChange={(e) => { setMonth(Number(e.target.value)); setSelectedDate(null); }}
                className="rounded-md border border-border bg-card px-2 py-1.5 text-sm font-semibold hover:bg-accent"
              >
                {months.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => { setYear(Number(e.target.value)); setSelectedDate(null); }}
                className="rounded-md border border-border bg-card px-2 py-1.5 text-sm font-semibold hover:bg-accent tabular-nums"
              >
                {Array.from({ length: 21 }, (_, i) => today.getFullYear() - 10 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button onClick={() => { const d = new Date(); setMonth(d.getMonth()); setYear(d.getFullYear()); }}
              className="text-xs rounded-md border border-border px-3 py-1.5 hover:bg-accent">היום</button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 mb-2">
            {weekdays.map((d) => (
              <div key={d} className="text-center text-2xs font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} className="aspect-square" />;
              const dateStr = dateOf(day);
              const list = byDate[dateStr] || [];
              const t = dayTone(list);
              const isSelected = selectedDate === dateStr;
              const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
              const heDay = hebrewDayLetters(hebrewFromGregorian(new Date(year, month, day)).day);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(dateStr)}
                  className={[
                    "aspect-square rounded-lg border p-1.5 flex flex-col items-stretch text-start pressable transition",
                    isSelected ? "ring-2 ring-primary border-primary" : "border-border hover:border-primary",
                  ].join(" ")}
                  style={list.length ? {
                    backgroundColor: `color-mix(in oklch, ${t.color} 18%, var(--color-card))`,
                    borderColor: isSelected ? "var(--color-primary)" : `color-mix(in oklch, ${t.color} 50%, transparent)`,
                  } : undefined}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xs text-muted-foreground">{heDay}</span>
                    <span className={`text-xs font-semibold tabular-nums ${isToday ? "text-primary" : ""}`}>{day}</span>
                  </div>
                  {list.length > 0 && (
                    <div className="mt-auto self-end size-2 rounded-full" style={{ backgroundColor: t.color }} />
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
              {selectedList.length === 0 ? (
                <div className="text-xs text-muted-foreground mt-3">אין רישומים</div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {selectedList.map((e) => {
                    const c = calcSeder(e);
                    return (
                      <li key={e.id} className="rounded-md border border-border p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">סדר {e.seder === 1 ? "א׳" : "ב׳"}</div>
                          <button
                            onClick={() => {
                              remove(e.id);
                              toastUndo(`הרישום מ-${e.date} נמחק`, () => upsert(e));
                            }}
                            className="text-2xs text-destructive hover:underline">מחק</button>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {e.absent ? "היעדרות" : `${e.arrival || "—"} → ${e.departure || "—"}`}
                        </div>
                        <div className="text-2xs text-muted-foreground mt-1">
                          חסר {c.netMissingMin} · בונוס {c.bonusMin}{c.isOhevei && " · אוהבי ה׳"}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <div className="card-surface p-5 text-xs text-muted-foreground">לחץ על יום בלוח לפרטים.</div>
          )}

        </div>
      </div>

      <div className="mt-4">
        <MonthSummaryCard title={`סיכום ${months[month]} ${year}`} summary={summary} />
      </div>
    </>
  );
}
