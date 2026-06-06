import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { TrendingUp, TrendingDown, Target, Flame, Award } from "lucide-react";

export const Route = createFileRoute("/statistics")({
  head: () => ({ meta: [{ title: "סטטיסטיקות — המעקב שלי" }] }),
  component: StatisticsPage,
});

const monthly = [
  { m: "ינו", v: 86 }, { m: "פבר", v: 88 }, { m: "מרץ", v: 90 },
  { m: "אפר", v: 84 }, { m: "מאי", v: 89 }, { m: "יוני", v: 92 },
];

const weekday = [
  { d: "ראשון", v: 78 }, { d: "שני", v: 92 }, { d: "שלישי", v: 95 },
  { d: "רביעי", v: 94 }, { d: "חמישי", v: 90 }, { d: "שישי", v: 88 },
];

// 7 weeks x 6 weekdays heat map
const heat = Array.from({ length: 7 }, () =>
  Array.from({ length: 6 }, () => Math.floor(Math.random() * 5))
);

function StatisticsPage() {
  return (
    <AppShell title="סטטיסטיקות" subtitle="ניתוח אישי של מגמות נוכחות">
      {/* KPI cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "ממוצע שנתי", value: "88%", icon: Target, trend: "+2%", up: true },
          { label: "החודש הטוב", value: "מרץ", icon: Award, trend: "94%", up: true },
          { label: "רצף נוכחי", value: "14", icon: Flame, trend: "ימים", up: true },
          { label: "מגמת חודש", value: "92%", icon: TrendingUp, trend: "+3%", up: true },
        ].map((k) => (
          <div key={k.label} className="card-surface p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="mt-2 text-3xl font-bold tabular-nums">{k.value}</div>
                <div className={`mt-1 text-[11px] inline-flex items-center gap-1 ${k.up ? "text-success" : "text-destructive"}`}>
                  {k.up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />} {k.trend}
                </div>
              </div>
              <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <k.icon className="size-5" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly trend */}
        <div className="card-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold mb-1">מגמה חודשית</h2>
          <p className="text-xs text-muted-foreground mb-5">אחוז נוכחות לפי חודש</p>

          <div className="relative h-56">
            <div className="absolute inset-0 grid grid-rows-4">
              {[100, 75, 50, 25].map((v) => (
                <div key={v} className="border-t border-border/60 text-[10px] text-muted-foreground -translate-y-2">
                  {v}%
                </div>
              ))}
            </div>
            <div className="absolute inset-0 flex items-end gap-3 pr-8">
              {monthly.map((m) => (
                <div key={m.m} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="text-[10px] tabular-nums font-medium">{m.v}%</div>
                  <div className="w-full rounded-t-md bg-gradient-to-t from-primary to-primary/60" style={{ height: `${m.v}%` }} />
                  <div className="text-[11px] text-muted-foreground">{m.m}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Weekday breakdown */}
        <div className="card-surface p-5">
          <h2 className="text-sm font-semibold mb-1">לפי יום בשבוע</h2>
          <p className="text-xs text-muted-foreground mb-4">ממוצע נוכחות</p>

          <ul className="space-y-3">
            {weekday.map((w) => (
              <li key={w.d}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>{w.d}</span>
                  <span className="tabular-nums font-medium">{w.v}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${w.v}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Heat map */}
      <div className="mt-5 card-surface p-5">
        <h2 className="text-sm font-semibold mb-1">מפת חום — נוכחות לפי שבוע ויום</h2>
        <p className="text-xs text-muted-foreground mb-5">צבע כהה יותר = נוכחות גבוהה יותר</p>

        <div className="flex gap-3">
          <div className="flex flex-col justify-around text-[10px] text-muted-foreground py-1">
            {["א","ב","ג","ד","ה","ו"].map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="flex-1 grid grid-cols-7 gap-1.5">
            {heat[0].map((_, weekIdx) =>
              <div key={weekIdx} className="contents">
                {heat.map((week, wi) => wi === 0 ? null : null)}
              </div>
            )}
            {Array.from({ length: 7 * 6 }).map((_, i) => {
              const week = i % 7;
              const day = Math.floor(i / 7);
              const v = heat[week][day];
              return (
                <div
                  key={i}
                  className="aspect-square rounded"
                  style={{ backgroundColor: `color-mix(in oklch, var(--color-status-present) ${(v + 1) * 18}%, var(--color-muted))` }}
                  title={`שבוע ${week + 1}`}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
          <span>פחות</span>
          {[0, 1, 2, 3, 4].map((v) => (
            <span key={v} className="size-3 rounded" style={{ backgroundColor: `color-mix(in oklch, var(--color-status-present) ${(v + 1) * 18}%, var(--color-muted))` }} />
          ))}
          <span>יותר</span>
        </div>
      </div>
    </AppShell>
  );
}
