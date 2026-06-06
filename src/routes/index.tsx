import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import {
  UserCheck, Clock, TrendingUp, AlertTriangle,
  CalendarCheck, BookOpen, ChevronLeft, Sparkles, Bell,
  Flame, Target, FileDown, DatabaseBackup,
} from "lucide-react";
import {
  useAttendance, useLearning, inMonth, countByStatus,
  attendanceRate, currentStreak, todayISO,
} from "@/lib/tracker-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "לוח בקרה — המעקב שלי" },
      { name: "description", content: "מעקב אישי אחר נוכחות, רצפים והתקדמות" },
    ],
  }),
  component: Dashboard,
});

const toneStyles: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
};

function Dashboard() {
  const { records } = useAttendance();
  const { items: lessons } = useLearning();

  const today = new Date();
  const monthRecs = inMonth(records, today.getFullYear(), today.getMonth());
  const counts = countByStatus(monthRecs);
  const rate = attendanceRate(monthRecs);
  const streak = currentStreak(records);
  const hasToday = records.some((r) => r.date === todayISO());

  const hebrewDate = today.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Group by week within month
  const weeks: Record<number, { total: number; good: number }> = {};
  for (const r of monthRecs) {
    const day = parseInt(r.date.slice(8, 10), 10);
    const w = Math.ceil(day / 7);
    weeks[w] = weeks[w] || { total: 0, good: 0 };
    weeks[w].total++;
    if (r.status === "present" || r.status === "excused") weeks[w].good++;
  }
  const weekBars = [1, 2, 3, 4, 5].map((w) => {
    const x = weeks[w];
    return x ? Math.round((x.good / x.total) * 100) : 0;
  });

  const kpis = [
    { label: "נוכחות החודש", value: `${rate}%`, delta: `${monthRecs.length} ימים נרשמו`, icon: UserCheck, tone: "success" as const },
    { label: "רצף נוכחי", value: streak.toString(), delta: streak > 0 ? "ימים רצופים" : "התחל מהיום", icon: Flame, tone: "warning" as const },
    { label: "איחורים החודש", value: counts.late.toString(), delta: "מתוך יעד: עד 3", icon: Clock, tone: "info" as const },
    { label: "יעד חודשי", value: "95%", delta: rate >= 95 ? "הושג!" : `נותרו ${95 - rate} נקודות`, icon: Target, tone: "primary" as const },
  ];

  return (
    <AppShell title="לוח בקרה" subtitle={hebrewDate} actions={
      <Link to="/attendance" className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition">
        <CalendarCheck className="size-4" /> רישום נוכחות להיום
      </Link>
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

      {!hasToday && (
        <div className="mt-5 card-surface p-4 flex items-center gap-3 border-r-4 border-r-info">
          <div className="size-9 rounded-md bg-info/10 text-info grid place-items-center">
            <Bell className="size-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">לא רשמת נוכחות להיום</div>
            <p className="text-xs text-muted-foreground mt-0.5">סמן את הסטטוס היומי שלך כדי לשמור על רצף הרישומים.</p>
          </div>
          <Link to="/attendance" className="text-xs text-info hover:underline inline-flex items-center gap-1">
            לרישום <ChevronLeft className="size-3" />
          </Link>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-surface p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">פילוח החודש</h2>
            <span className="text-xs text-muted-foreground">{today.toLocaleDateString("he-IL", { month: "long", year: "numeric" })}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "נוכח",  value: counts.present, color: "var(--status-present)" },
              { label: "איחור", value: counts.late,    color: "var(--status-late)" },
              { label: "נעדר",  value: counts.absent,  color: "var(--status-absent)" },
              { label: "מוצדק", value: counts.excused, color: "var(--status-excused)" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="text-xs text-muted-foreground mb-2">אחוז נוכחות לפי שבוע בחודש</div>
            <div className="flex items-end gap-2 h-28">
              {weekBars.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-md bg-primary/80 transition-all" style={{ height: `${Math.max(v, 4)}%`, opacity: v ? 1 : 0.25 }} />
                  <span className="text-[10px] text-muted-foreground">שבוע {i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">תזכורות אישיות</h2>
          </div>
          <ul className="space-y-3">
            {!hasToday && (
              <li className="flex gap-3">
                <div className={`size-8 rounded-md grid place-items-center shrink-0 ${toneStyles.warning}`}>
                  <AlertTriangle className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">חסר רישום להיום</div>
                  <div className="text-xs text-muted-foreground">סמן עכשיו לשמירת הרצף</div>
                </div>
              </li>
            )}
            {counts.late >= 2 && (
              <li className="flex gap-3">
                <div className={`size-8 rounded-md grid place-items-center shrink-0 ${toneStyles.warning}`}>
                  <Clock className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">מתקרב למכסת איחורים</div>
                  <div className="text-xs text-muted-foreground">{counts.late} איחורים החודש (מתוך 3)</div>
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
                  <div className="text-xs text-muted-foreground">המשך כך!</div>
                </div>
              </li>
            )}
            {lessons[0] && (
              <li className="flex gap-3">
                <div className={`size-8 rounded-md grid place-items-center shrink-0 ${toneStyles.info}`}>
                  <BookOpen className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{lessons[0].topic}</div>
                  <div className="text-xs text-muted-foreground">שיעור אחרון · {lessons[0].minutes} דק׳</div>
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
            <h2 className="text-sm font-semibold">תובנות אישיות</h2>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <TrendingUp className="size-4 text-success mt-0.5 shrink-0" />
              <span>שיעור הנוכחות שלך החודש: <b className="tabular-nums">{rate}%</b>.</span>
            </li>
            <li className="flex items-start gap-2">
              <Flame className="size-4 text-warning mt-0.5 shrink-0" />
              <span>אתה בתוך רצף נוכחי של <b className="tabular-nums">{streak}</b> ימים.</span>
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
              { label: "רישום נוכחות", icon: CalendarCheck, to: "/attendance" },
              { label: "הוספת לימוד",  icon: BookOpen,      to: "/learning" },
              { label: "ייצוא דוח",    icon: FileDown,      to: "/reports" },
              { label: "גיבוי נתונים", icon: DatabaseBackup, to: "/backup" },
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
