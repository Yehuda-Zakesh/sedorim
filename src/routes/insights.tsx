import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Sparkles, TrendingUp, TrendingDown, Lightbulb, Target } from "lucide-react";
import { useSeder, useLearning, attendanceScore, currentDayStreak } from "@/lib/kollel-store";
import { useSettings } from "@/lib/settings-store";
import { generateInsights, forecastMonthlyNetMissing, consistencyScore, type Insight } from "@/lib/insights";

export const Route = createFileRoute("/insights")({
  head: () => ({ meta: [{ title: "תובנות חכמות — המעקב שלי" }] }),
  component: InsightsPage,
});

const TONE: Record<Insight["tone"], { bg: string; text: string; icon: typeof TrendingUp }> = {
  success:     { bg: "bg-success/10",     text: "text-success",     icon: TrendingUp },
  warning:     { bg: "bg-warning/10",     text: "text-warning",     icon: TrendingDown },
  info:        { bg: "bg-info/10",        text: "text-info",        icon: Lightbulb },
  destructive: { bg: "bg-destructive/10", text: "text-destructive", icon: TrendingDown },
};

const CATEGORY_LABEL: Record<Insight["category"], string> = {
  trend: "מגמה", opportunity: "הזדמנות", recommendation: "המלצה",
};

function InsightsPage() {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const { settings } = useSettings();
  const insights = generateInsights(entries, lessons, {
    monthlyTarget: settings.goals.monthlyTarget,
    maxLatePerMonth: settings.goals.maxLatePerMonth,
    alertMissingMinPerMonth: settings.seder.alertMissingMinPerMonth,
  });
  const forecast = forecastMonthlyNetMissing();
  const consistency = consistencyScore();
  const now = new Date();
  const overall = attendanceScore(now.getFullYear(), now.getMonth());
  const streak = currentDayStreak();

  const grouped: Record<Insight["category"], Insight[]> = { trend: [], opportunity: [], recommendation: [] };
  for (const i of insights) grouped[i.category].push(i);

  return (
    <AppShell title="תובנות חכמות" subtitle="ניתוח אוטומטי של הנתונים שלך">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard label="ציון החודש" value={`${overall}`} icon={Target} />
        <KpiCard label="רצף ימים" value={streak.toString()} icon={Sparkles} />
        <KpiCard label="תחזית חסר חודשי" value={forecast !== null ? `${forecast}` : "—"} icon={TrendingUp} />
        <KpiCard label="ציון עקביות" value={`${consistency}`} icon={Lightbulb} />
      </section>

      {insights.length === 0 ? (
        <div className="card-surface p-10 text-center">
          <Sparkles className="size-8 text-primary mx-auto mb-3" />
          <h3 className="text-base font-semibold">אין עדיין מספיק נתונים</h3>
          <p className="text-sm text-muted-foreground mt-1">המשך לרשום סדרים כדי לקבל תובנות.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(["trend", "opportunity", "recommendation"] as const).map((cat) => (
            <div key={cat} className="card-surface p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> {CATEGORY_LABEL[cat]}
              </h2>
              {grouped[cat].length === 0 ? <p className="text-xs text-muted-foreground">אין כרגע</p> : (
                <ul className="space-y-3">
                  {grouped[cat].map((i) => {
                    const t = TONE[i.tone];
                    return (
                      <li key={i.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-start gap-2">
                          <div className={`size-8 rounded-md grid place-items-center shrink-0 ${t.bg} ${t.text}`}>
                            <t.icon className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{i.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{i.detail}</div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function KpiCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Target }) {
  return (
    <div className="card-surface p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
        </div>
        <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}
