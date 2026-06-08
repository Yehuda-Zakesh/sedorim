import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { TrendingUp, TrendingDown, Target, Flame, Award } from "lucide-react";
import { useSeder, useLearning, monthlySummary, attendanceScore, calcSeder, currentDayStreak } from "@/lib/kollel-store";
import { hebrewFromGregorian, formatHebrewMonthYear } from "@/lib/hebrew-calendar";

export const Route = createFileRoute("/statistics")({
  head: () => ({ meta: [{ title: "סטטיסטיקות — המעקב שלי" }] }),
  component: StatisticsPage,
});

function StatisticsPage() {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();

  // 12-month trend of score
  const months: { label: string; hebLabel: string; score: number; net: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(y, m - i, 1);
    const ms = monthlySummary(d.getFullYear(), d.getMonth());
    const mid = new Date(d.getFullYear(), d.getMonth(), 15);
    const h = hebrewFromGregorian(mid);
    months.push({
      label: d.toLocaleDateString("he-IL", { month: "short" }),
      hebLabel: formatHebrewMonthYear(h),
      score: attendanceScore(d.getFullYear(), d.getMonth()),
      net: ms.netMissing,
    });
  }

  const curScore = attendanceScore(y, m);
  const yoyScore = attendanceScore(y - 1, m);
  const streak = currentDayStreak();
  const bestMonth = [...months].sort((a, b) => b.score - a.score)[0];

  // weekday breakdown
  const weekday: { d: string; net: number; count: number }[] =
    ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"].map((d) => ({ d, net: 0, count: 0 }));
  for (const e of entries) {
    const wd = new Date(e.date).getDay();
    weekday[wd].net += calcSeder(e).netMissingMin;
    weekday[wd].count++;
  }

  // heat map 6 weeks x 7 days of recent days
  const heat: number[][] = Array.from({ length: 6 }, () => Array(7).fill(-1));
  const today = new Date();
  const start = new Date(today); start.setDate(today.getDate() - 6 * 7 + 1);
  for (let w = 0; w < 6; w++) {
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d);
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const list = entries.filter((e) => e.date === iso);
      if (!list.length) { heat[w][d] = -1; continue; }
      const net = list.reduce((s, e) => s + calcSeder(e).netMissingMin, 0);
      heat[w][d] = net === 0 ? 4 : net < 15 ? 3 : net < 30 ? 2 : net < 60 ? 1 : 0;
    }
  }

  const totalLearnHours = (lessons.reduce((s, l) => s + l.minutes, 0) / 60).toFixed(1);

  return (
    <AppShell title="סטטיסטיקות" subtitle="ניתוח אישי של מגמות נוכחות">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="ציון החודש" value={`${curScore}`} icon={Target} trend={`${curScore - yoyScore >= 0 ? "+" : ""}${curScore - yoyScore} מול אשתקד`} up={curScore >= yoyScore} />
        <Kpi label="חודש מצטיין" value={bestMonth?.label || "—"} icon={Award} trend={`${bestMonth?.score || 0} נק׳`} up />
        <Kpi label="רצף ימים" value={streak.toString()} icon={Flame} trend="ימים" up={streak > 0} />
        <Kpi label="שעות לימוד" value={totalLearnHours} icon={TrendingUp} trend="סך הכל" up />
      </section>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold mb-1">מגמת ציון 12 חודשים</h2>
          <p className="text-xs text-muted-foreground mb-5">ציון 0–100</p>
          <div className="relative h-56">
            <div className="absolute inset-0 grid grid-rows-4">
              {[100, 75, 50, 25].map((v) => (
                <div key={v} className="border-t border-border/60 text-[10px] text-muted-foreground -translate-y-2">{v}</div>
              ))}
            </div>
            <div className="absolute inset-0 flex items-end gap-2 pr-8">
              {months.map((mo, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="text-[10px] tabular-nums">{mo.score}</div>
                  <div className="w-full rounded-t-md bg-gradient-to-t from-primary to-primary/60" style={{ height: `${mo.score}%` }} />
                  <div className="text-[11px] text-muted-foreground">{mo.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card-surface p-5">
          <h2 className="text-sm font-semibold mb-1">חסר נטו לפי יום בשבוע</h2>
          <p className="text-xs text-muted-foreground mb-4">ממוצע דקות</p>
          <ul className="space-y-3">
            {weekday.map((w) => {
              const avg = w.count ? Math.round(w.net / w.count) : 0;
              const max = Math.max(1, ...weekday.map((x) => x.count ? x.net / x.count : 0));
              return (
                <li key={w.d}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>{w.d}</span>
                    <span className="tabular-nums font-medium">{avg}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(avg / max) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mt-5 card-surface p-5">
        <h2 className="text-sm font-semibold mb-1">מפת חום נוכחות — 6 השבועות האחרונים</h2>
        <p className="text-xs text-muted-foreground mb-5">צבע כהה = פחות חסר</p>
        <div className="grid grid-cols-7 gap-1.5 max-w-md">
          {heat.flat().map((v, i) => (
            <div key={i} className="aspect-square rounded"
              style={{ backgroundColor: v < 0 ? "var(--color-muted)" : `color-mix(in oklch, var(--color-status-present) ${(v + 1) * 18}%, var(--color-muted))` }} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, icon: Icon, trend, up }: { label: string; value: string; icon: typeof Target; trend: string; up: boolean }) {
  return (
    <div className="card-surface p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
          <div className={`mt-1 text-[11px] inline-flex items-center gap-1 ${up ? "text-success" : "text-destructive"}`}>
            {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />} {trend}
          </div>
        </div>
        <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}
