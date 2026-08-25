import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import {
  Clock, TrendingUp, CalendarCheck, BookOpen, ChevronLeft,
  Sparkles, Bell, Flame, Target, FileDown, DatabaseBackup, Award,
} from "lucide-react";
import {
  useSeder, useLearning, monthlySummary, attendanceScore, currentDayStreak, todayISO, calcSeder,
  entriesInMonth, scoreEntries,
  FRAMEWORK_LABELS, type LearningFramework,
} from "@/lib/kollel-store";
import { forecastMonthlyNetMissing } from "@/lib/insights";
import { formatHebrewDate, isBeinHazmanim } from "@/lib/hebrew-calendar";
import { useSettings } from "@/lib/settings-store";
import { KpiCard, StatTile, IconBadge } from "@/components/ui/stat";

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

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

  // Weekly attendance score, over the month's real calendar weeks.
  //
  // It used to bucket by `Math.ceil(day / 7)`, which is not a week: it puts the
  // 1st–7th together whatever weekdays those are, and always leaves a fifth
  // "week" holding the two or three days past the 28th — a permanently stunted
  // last bar that read as a collapse in attendance every single month. Weeks
  // here start on Sunday and the month spans however many of them it spans.
  const leadingBlanks = new Date(y, m, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const weekCount = Math.ceil((leadingBlanks + daysInMonth) / 7);

  const weekBars = Array.from({ length: weekCount }, (_, w) => {
    let expected = 0, netMissing = 0, count = 0;
    const firstDay = Math.max(1, w * 7 - leadingBlanks + 1);
    const lastDay = Math.min(daysInMonth, (w + 1) * 7 - leadingBlanks);
    for (const e of entries) {
      if (!e.date.startsWith(monthPrefix)) continue;
      const day = parseInt(e.date.slice(8, 10), 10);
      if (day < firstDay || day > lastDay) continue;
      const c = calcSeder(e);
      expected += c.sederLengthMin;
      netMissing += c.netMissingMin;
      count++;
    }
    return {
      firstDay, lastDay, count,
      // null, not 0 — "nothing was recorded" and "recorded, scored zero" are
      // different answers and the chart has to be able to tell them apart.
      score: expected === 0 ? null : Math.max(0, 100 - Math.round((netMissing / expected) * 100)),
    };
  });

  // The three facts the quick-summary card carries. Each one is something no
  // other card on this screen states.
  const prev = new Date(y, m - 1, 1);
  const prevEntries = entriesInMonth(entries, prev.getFullYear(), prev.getMonth());
  const vsLastMonth = prevEntries.length === 0 ? null : score - scoreEntries(prevEntries);

  const forecast = forecastMonthlyNetMissing();

  const worstWeekday = (() => {
    const acc = WEEKDAYS.map((day) => ({ day, net: 0, count: 0 }));
    for (const e of entries) {
      const wd = new Date(e.date).getDay();
      if (Number.isNaN(wd)) continue;
      acc[wd].net += calcSeder(e).netMissingMin;
      acc[wd].count++;
    }
    // Two sedarim is not a pattern; don't name a day off one bad morning.
    const ranked = acc
      .filter((d) => d.count >= 3)
      .map((d) => ({ day: d.day, avg: Math.round(d.net / d.count) }))
      .sort((a, b) => b.avg - a.avg);
    return ranked[0]?.avg ? ranked[0] : null;
  })();

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
        <Link to="/attendance" className="pressable inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
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
        <div className="mt-5 card-surface p-4 flex items-center gap-3 border-s-4 border-s-info">
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
        <div className="mt-5 card-surface p-4 flex items-center gap-3 border-s-4 border-s-warning">
          <IconBadge icon={Bell} tone="warning" size="md" />
          <div className="flex-1">
            <div className="text-sm font-semibold">לא רשמת סדר היום</div>
            <p className="text-xs text-muted-foreground mt-0.5">סמן הגעה/יציאה כדי לעקוב אחר הנוכחות.</p>
          </div>
          <Link to="/attendance" className="text-xs text-warning-fg hover:underline inline-flex items-center gap-1">
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
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <div className="text-xs text-muted-foreground">ציון נוכחות לפי שבוע</div>
              <div className="text-2xs text-muted-foreground">היעד: {settings.goals.monthlyTarget}</div>
            </div>
            {/* The values, on their own row, so nothing sits on top of the
                target line. */}
            <div className="flex gap-2">
              {weekBars.map((w, i) => (
                <div key={i} className="flex-1 text-center text-2xs tabular-nums text-muted-foreground">
                  {w.score === null ? "" : w.score}
                </div>
              ))}
            </div>

            {/* Each bar sits in its own track, so a week that scored zero still
                shows as a measured week rather than vanishing. The old chart
                gave every bar a 4% floor, which made a score of 0 and a score
                of 4 exactly the same height. */}
            <div className="relative h-24 flex items-end gap-2">
              {/* The target, drawn where it actually falls on the scale — a
                  solid hairline, not a dashed one: dashes read as a projection
                  when this is a fixed threshold. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 border-t border-foreground/25"
                style={{ bottom: `${settings.goals.monthlyTarget}%` }}
              />
              {weekBars.map((w, i) => (
                <div key={i} className="flex-1 h-full flex items-end rounded-md bg-muted/50"
                  title={`${w.firstDay}–${w.lastDay} בחודש · ${w.score === null ? "אין רישומים" : `ציון ${w.score} מתוך 100`}`}>
                  {w.score !== null && (
                    <div
                      className="w-full rounded-md bg-primary"
                      style={{ height: `${w.score}%`, minHeight: w.score > 0 ? 2 : 0 }}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-1.5 flex gap-2">
              {weekBars.map((w, i) => (
                <div key={i} className="flex-1 text-center text-2xs tabular-nums text-muted-foreground">
                  {w.firstDay}–{w.lastDay}
                </div>
              ))}
            </div>
          </div>
        </div>

        {showReminders && (
          <div className="card-surface p-5">
            <h2 className="text-sm font-semibold mb-3">תזכורות</h2>
            <ul className="space-y-3">
              {/* "חסר רישום להיום" is deliberately not repeated here — the
                  banner higher up this same screen already says it, with a
                  link. The same sentence twice, three inches apart, doesn't
                  make it twice as noticeable; it makes the list look like
                  filler. */}
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
              {summary.lateCount < settings.goals.maxLatePerMonth && streak < 5 && (
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
                <Link to="/statistics" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  לסטטיסטיקות <ChevronLeft className="size-3" />
                </Link>
              </div>
              {/* This card used to restate the score, the אוהבי ה׳ count and
                  the learning minutes — all three of which are already on this
                  screen, two of them in the KPI row at the top. A summary that
                  summarises what is visible two inches above it is noise. It
                  now carries the three things the screen does *not* otherwise
                  say: where the month is heading, how it compares with the one
                  before it, and where the time is actually being lost. */}
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <TrendingUp className={`size-4 mt-0.5 shrink-0 ${vsLastMonth === null || vsLastMonth >= 0 ? "text-success" : "text-destructive"}`} />
                  <span>
                    {vsLastMonth === null
                      ? "אין נתונים מהחודש שעבר להשוואה."
                      : <>מול החודש שעבר: <b className="tabular-nums">{vsLastMonth >= 0 ? "+" : ""}{vsLastMonth}</b> נקודות ציון.</>}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Target className="size-4 text-info mt-0.5 shrink-0" />
                  <span>
                    {forecast === null
                      ? "עוד מעט רישומים ואפשר יהיה לחזות את סוף החודש."
                      : <>בקצב הזה החודש ייסגר על <b className="tabular-nums">{fmtMin(forecast)}</b> דקות חסרות.</>}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Clock className="size-4 text-warning-fg mt-0.5 shrink-0" />
                  <span>
                    {worstWeekday === null
                      ? "אין עדיין מספיק רישומים כדי לזהות יום חלש."
                      : <>הכי הרבה נשמט בימי <b>{worstWeekday.day}</b> — {worstWeekday.avg} דק׳ לסדר בממוצע.</>}
                  </span>
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
                  <Link key={a.label} to={a.to} className="rounded-lg border border-border bg-card hover:bg-accent pressable-lg p-3 text-start">
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
