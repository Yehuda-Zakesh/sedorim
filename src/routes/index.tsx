import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import {
  Clock, TrendingUp, AlertTriangle, CalendarCheck, BookOpen, ChevronLeft,
  Sparkles, Bell, Flame, Target, FileDown, DatabaseBackup, Award,
} from "lucide-react";
import {
  useSeder, useLearning, monthlySummary, attendanceScore, currentDayStreak, todayISO, calcSeder,
  FRAMEWORK_LABELS, type LearningFramework,
} from "@/lib/kollel-store";
import { formatHebrewDate, isBeinHazmanim } from "@/lib/hebrew-calendar";
import { useSettings } from "@/lib/settings-store";
import { KpiCard, StatTile, IconBadge } from "@/components/ui/stat";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "לוח בקרה — המעקב שלי" },
      { name: "description", content: "מעקב אישי על נוכחות בסדרי הכולל" },
    ],
  }),
  component: Dashboard,
});

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

  // Additional-learning totals for the current month, grouped by framework
  const monthPrefix = `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthLessons = lessons.filter((l) => l.date.startsWith(monthPrefix));
  const learningTotalMin = monthLessons.reduce((s, l) => s + l.minutes, 0);
  const learningByFw = (["kollel-erev", "torato-beyado", "bein-hazmanim"] as LearningFramework[])
    .map((fw) => ({ fw, minutes: monthLessons.filter((l) => l.framework === fw).reduce((s, l) => s + l.minutes, 0) }));

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
    { label: "ציון נוכחות החודש", value: `${score}`, hint: `יעד ${settings.goals.monthlyTarget}`, icon: Target, tone: "primary" as const },
    { label: "דקות חסרות (נטו)", value: fmtMin(summary.netMissing), hint: `${summary.entries} סדרים נרשמו`, icon: Clock, tone: summary.netMissing > settings.seder.alertMissingMinPerMonth ? "destructive" as const : "info" as const },
    { label: "סדרי אוהבי ה׳", value: summary.oheveiCount.toString(), hint: "החודש", icon: Award, tone: "success" as const },
    { label: "רצף ימים", value: streak.toString(), hint: streak > 0 ? "ימים ללא חיסור" : "התחל היום", icon: Flame, tone: "warning" as const },
  ];

  // These three switches sit in Settings → "לוח בקרה" and, until now, changed
  // nothing at all on this screen.
  const { showInsights, showReminders, showQuickActions } = settings.dashboard;

  return (
    <AppShell title="לוח בקרה" subtitle={hebrewDate} actions={
      <div className="flex gap-2">
        <Link to="/attendance" className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <CalendarCheck className="size-4" /> רישום סדר
        </Link>
      </div>
    }>
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} hint={k.hint} icon={k.icon} tone={k.tone} />
        ))}
      </section>

      {beinHazmanim && (
        <div className="mt-5 card-surface p-4 flex items-center gap-3 border-r-4 border-r-info">
          <IconBadge icon={BookOpen} tone="info" size="md" />
          <div className="flex-1">
            <div className="text-sm font-semibold">בין הזמנים</div>
            <p className="text-xs text-muted-foreground mt-0.5">מסגרת "ישיבת בין הזמנים" זמינה במסך לימוד נוסף.</p>
          </div>
          <Link to="/learning" className="text-xs text-info hover:underline inline-flex items-center gap-1">
            לפתיחה <ChevronLeft className="size-3" />
          </Link>
        </div>
      )}

      {!hasToday && showReminders && (
        <div className="mt-5 card-surface p-4 flex items-center gap-3 border-r-4 border-r-warning">
          <IconBadge icon={Bell} tone="warning" size="md" />
          <div className="flex-1">
            <div className="text-sm font-semibold">לא רשמת סדר היום</div>
            <p className="text-xs text-muted-foreground mt-0.5">סמן הגעה/יציאה כדי לעקוב אחר הנוכחות.</p>
          </div>
          <Link to="/attendance" className="text-xs text-warning hover:underline inline-flex items-center gap-1">
            לרישום <ChevronLeft className="size-3" />
          </Link>
        </div>
      )}

      <div className={`mt-5 grid grid-cols-1 gap-4 ${showReminders ? "lg:grid-cols-3" : ""}`}>
        <div className={`card-surface p-5 ${showReminders ? "lg:col-span-2" : ""}`}>
          <h2 className="text-sm font-semibold mb-3">פירוט החודש</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="איחורים" value={summary.lateCount} dot="var(--status-late)" />
            <StatTile label="היעדרויות" value={summary.absenceCount} dot="var(--status-absent)" />
            <StatTile label="יציאה מוקדמת" value={summary.earlyDepCount} dot="var(--status-late)" />
            <StatTile label="בונוס (דק׳)" value={summary.bonus} dot="var(--status-present)" />
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

        {showReminders && (
          <div className="card-surface p-5">
            <h2 className="text-sm font-semibold mb-3">תזכורות</h2>
            <ul className="space-y-3">
              {!hasToday && (
                <li className="flex gap-3">
                  <IconBadge icon={AlertTriangle} tone="warning" size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">חסר רישום להיום</div>
                    <div className="text-xs text-muted-foreground">סמן הגעה לסדר הנוכחי</div>
                  </div>
                </li>
              )}
              {summary.lateCount >= settings.goals.maxLatePerMonth && (
                <li className="flex gap-3">
                  <IconBadge icon={Clock} tone="destructive" size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">חרגת ממכסת האיחורים</div>
                    <div className="text-xs text-muted-foreground">{summary.lateCount} מתוך {settings.goals.maxLatePerMonth}</div>
                  </div>
                </li>
              )}
              {streak >= 5 && (
                <li className="flex gap-3">
                  <IconBadge icon={Flame} tone="success" size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">רצף של {streak} ימים</div>
                    <div className="text-xs text-muted-foreground">המשך כך</div>
                  </div>
                </li>
              )}
              {hasToday && summary.lateCount < settings.goals.maxLatePerMonth && streak < 5 && (
                <li className="text-xs text-muted-foreground">אין תזכורות פתוחות.</li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-5 card-surface p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">לימוד נוסף החודש</h2>
          </div>
          <Link to="/learning" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            לפרטים <ChevronLeft className="size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="סה״כ דקות" value={learningTotalMin} hint={`${(learningTotalMin / 60).toFixed(1)} שע׳`} />
          {learningByFw.map(({ fw, minutes }) => (
            <StatTile key={fw} label={FRAMEWORK_LABELS[fw]} value={minutes} hint="דקות" />
          ))}
        </div>
      </div>

      {(showInsights || showQuickActions) && (
        <div className={`mt-5 grid grid-cols-1 gap-4 ${showInsights && showQuickActions ? "lg:grid-cols-3" : ""}`}>
          {showInsights && (
            <div className={`card-surface p-5 bg-gradient-to-l from-primary/5 to-transparent ${showQuickActions ? "lg:col-span-2" : ""}`}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">סיכום מהיר</h2>
                </div>
                <Link to="/insights" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  לתובנות <ChevronLeft className="size-3" />
                </Link>
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
                  <span>לימוד נוסף החודש: <b className="tabular-nums">{learningTotalMin}</b> דקות.</span>
                </li>
              </ul>
            </div>
          )}

          {showQuickActions && (
            <div className="card-surface p-5">
              <h2 className="text-sm font-semibold mb-3">פעולות מהירות</h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "רישום סדר", icon: CalendarCheck, to: "/attendance" as const },
                  { label: "לימוד נוסף", icon: BookOpen, to: "/learning" as const },
                  { label: "ייצוא דוח", icon: FileDown, to: "/reports" as const },
                  { label: "גיבוי ושחזור", icon: DatabaseBackup, to: "/backup" as const },
                ].map((a) => (
                  <Link key={a.label} to={a.to} className="rounded-lg border border-border bg-card hover:bg-accent transition p-3 text-right">
                    <a.icon className="size-4 text-primary mb-2" />
                    <div className="text-xs font-medium">{a.label}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
