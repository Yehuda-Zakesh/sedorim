import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import {
  Clock, TrendingUp, AlertTriangle, CalendarCheck, BookOpen, ChevronLeft,
  Sparkles, Bell, Flame, Target, FileDown, DatabaseBackup, Zap, Award,
} from "lucide-react";
import {
  useSeder, useLearning, monthlySummary, attendanceScore, currentDayStreak, todayISO, calcSeder,
} from "@/lib/kollel-store";
import { formatHebrewDate, isBeinHazmanim } from "@/lib/hebrew-calendar";
import { useSettings } from "@/lib/settings-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "לוח בקרה — המעקב שלי" },
      { name: "description", content: "מעקב אישי על נוכחות בסדרי הכולל" },
    ],
  }),
  component: Dashboard,
});

const toneStyles: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  destructive: "bg-destructive/10 text-destructive",
};

function fmtMin(m: number): string {
  if (!m) return "0";
  const h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? `${h}:${String(r).padStart(2, "0")}` : `${r}`;
}

function Dashboard() {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const { settings } = useSettings();

  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth();
  const summary = monthlySummary(y, m);
  const score = attendanceScore(y, m);
  const streak = currentDayStreak();
  const hasToday = entries.some((e) => e.date === todayISO());
  const hebrewDate = formatHebrewDate(today);
  const beinHazmanim = isBeinHazmanim(today);

  // weekly attendance score 0–100 per week (exact calcSeder)
  const weekBars = [1, 2, 3, 4, 5].map((w) => {
    let expected = 0, netMissing = 0;
    for (const e of entries) {
      if (!e.date.startsWith(`${y}-${String(m + 1).padStart(2, "0")}`)) continue;
      const day = parseInt(e.date.slice(8, 10), 10);
      if (Math.ceil(day / 7) !== w) continue;
      const c = calcSeder(e);
      expected += c.sederLengthMin;
      netMissing += c.netMissingMin;
    }
    if (expected === 0) return 0;
    return Math.max(0, 100 - Math.round((netMissing / expected) * 100));
  });

  const kpis = [
    { label: "ציון נוכחות החודש", value: `${score}`, delta: `יעד ${settings.goals.monthlyTarget}`, icon: Target, tone: "primary" as const },
    { label: "דקות חסרות (נטו)", value: fmtMin(summary.netMissing), delta: `${summary.entries} סדרים נרשמו`, icon: Clock, tone: summary.netMissing > settings.seder.alertMissingMinPerMonth ? "destructive" as const : "info" as const },
    { label: "סדרי אוהבי ה׳", value: summary.oheveiCount.toString(), delta: "החודש", icon: Award, tone: "success" as const },
    { label: "רצף ימים", value: streak.toString(), delta: streak > 0 ? "ימים ללא חיסור" : "התחל היום", icon: Flame, tone: "warning" as const },
  ];

  return (
    <AppShell title="לוח בקרה" subtitle={hebrewDate} actions={
      <div className="flex gap-2">
        <Link to="/quick" className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent">
          <Zap className="size-4" /> כניסה מהירה
        </Link>
        <Link to="/attendance" className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <CalendarCheck className="size-4" /> רישום סדר
        </Link>
      </div>
    }>
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="card-surface p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-medium text-muted-foreground">{k.label}</div>
                <div className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{k.value}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{k.delta}</div>
              </div>
              <div className={`size-10 rounded-lg grid place-items-center ${toneStyles[k.tone]}`}>
                <k.icon className="size-5" />
              </div>
            </div>
          </div>
        ))}
      </section>

      {beinHazmanim && (
        <div className="mt-5 card-surface p-4 flex items-center gap-3 border-r-4 border-r-info">
          <div className="size-9 rounded-md bg-info/10 text-info grid place-items-center">
            <BookOpen className="size-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">בין הזמנים</div>
            <p className="text-xs text-muted-foreground mt-0.5">מסגרת "ישיבת בין הזמנים" זמינה במסך לימוד נוסף.</p>
          </div>
          <Link to="/learning" className="text-xs text-info hover:underline inline-flex items-center gap-1">
            לפתיחה <ChevronLeft className="size-3" />
          </Link>
        </div>
      )}

      {!hasToday && (
        <div className="mt-5 card-surface p-4 flex items-center gap-3 border-r-4 border-r-warning">
          <div className="size-9 rounded-md bg-warning/10 text-warning grid place-items-center">
            <Bell className="size-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">לא רשמת סדר היום</div>
            <p className="text-xs text-muted-foreground mt-0.5">סמן הגעה/יציאה כדי לעקוב אחר הנוכחות.</p>
          </div>
          <Link to="/attendance" className="text-xs text-warning hover:underline inline-flex items-center gap-1">
            לרישום <ChevronLeft className="size-3" />
          </Link>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold mb-3">פירוט החודש</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "איחורים", value: summary.lateCount, tone: "var(--status-late)" },
              { label: "היעדרויות", value: summary.absenceCount, tone: "var(--status-absent)" },
              { label: "יציאה מוקדמת", value: summary.earlyDepCount, tone: "var(--status-late)" },
              { label: "בונוס (דק׳)", value: summary.bonus, tone: "var(--status-present)" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: s.tone }} />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="text-xs text-muted-foreground mb-2">ציון נוכחות לפי שבוע</div>
            <div className="flex items-end gap-2 h-28">
              {weekBars.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-md bg-primary/80" style={{ height: `${Math.max(v, 4)}%`, opacity: v ? 1 : 0.25 }} />
                  <span className="text-[10px] text-muted-foreground">שבוע {i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card-surface p-5">
          <h2 className="text-sm font-semibold mb-3">תזכורות</h2>
          <ul className="space-y-3">
            {!hasToday && (
              <li className="flex gap-3">
                <div className={`size-8 rounded-md grid place-items-center shrink-0 ${toneStyles.warning}`}>
                  <AlertTriangle className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">חסר רישום להיום</div>
                  <div className="text-xs text-muted-foreground">סמן הגעה לסדר הנוכחי</div>
                </div>
              </li>
            )}
            {summary.lateCount >= settings.goals.maxLatePerMonth && (
              <li className="flex gap-3">
                <div className={`size-8 rounded-md grid place-items-center shrink-0 ${toneStyles.destructive}`}>
                  <Clock className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">חרגת ממכסת האיחורים</div>
                  <div className="text-xs text-muted-foreground">{summary.lateCount} מתוך {settings.goals.maxLatePerMonth}</div>
                </div>
              </li>
            )}
            {streak >= 5 && (
              <li className="flex gap-3">
                <div className={`size-8 rounded-md grid place-items-center shrink-0 ${toneStyles.success}`}>
                  <Flame className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">רצף של {streak} ימים</div>
                  <div className="text-xs text-muted-foreground">המשך כך</div>
                </div>
              </li>
            )}
            {lessons[0] && (
              <li className="flex gap-3">
                <div className={`size-8 rounded-md grid place-items-center shrink-0 ${toneStyles.info}`}>
                  <BookOpen className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">שיעור אחרון</div>
                  <div className="text-xs text-muted-foreground">{lessons[0].minutes} דק׳ · {lessons[0].date}</div>
                </div>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-surface p-5 lg:col-span-2 bg-gradient-to-l from-primary/5 to-transparent">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">סיכום מהיר</h2>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <TrendingUp className="size-4 text-success mt-0.5 shrink-0" />
              <span>ציון הנוכחות החודש: <b className="tabular-nums">{score}</b> מתוך 100.</span>
            </li>
            <li className="flex items-start gap-2">
              <Award className="size-4 text-warning mt-0.5 shrink-0" />
              <span>סדרים מלאים (אוהבי ה׳) החודש: <b className="tabular-nums">{summary.oheveiCount}</b>.</span>
            </li>
            <li className="flex items-start gap-2">
              <BookOpen className="size-4 text-info mt-0.5 shrink-0" />
              <span>השלמת <b className="tabular-nums">{lessons.reduce((s, l) => s + l.minutes, 0)}</b> דקות לימוד נוסף.</span>
            </li>
          </ul>
        </div>

        <div className="card-surface p-5">
          <h2 className="text-sm font-semibold mb-3">פעולות מהירות</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "כניסה מהירה", icon: Zap, to: "/quick" as const },
              { label: "רישום סדר", icon: CalendarCheck, to: "/attendance" as const },
              { label: "ייצוא דוח", icon: FileDown, to: "/reports" as const },
              { label: "גיבוי", icon: DatabaseBackup, to: "/backup" as const },
            ].map((a) => (
              <Link key={a.label} to={a.to} className="rounded-lg border border-border bg-card hover:bg-accent transition p-3 text-right">
                <a.icon className="size-4 text-primary mb-2" />
                <div className="text-xs font-medium">{a.label}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
