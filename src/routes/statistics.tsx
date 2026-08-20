// Statistics and insights, on one screen.
//
// They used to be two: /statistics with the charts and /insights with the
// sentences — both opening with the same four figures (score, streak,
// forecast, consistency), so the app answered "how am I doing" twice, in two
// places, slightly differently.
//
// The order here is deliberate, and it is the order a person actually asks in:
// how am I doing → what happened this month → what should I do → and then the
// charts, for whoever wants to look further.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  TrendingUp, Flame, Award, Clock, CalendarClock,
  Lightbulb, CheckCircle2, AlertTriangle, Target, BarChart3, ChevronDown,
} from "lucide-react";
import {
  useSeder, useLearning, summarizeEntries, entriesInMonth, scoreEntries,
  attendanceScore, calcSeder, currentDayStreak, effectiveLearningMin,
} from "@/lib/kollel-store";
import { useSettings } from "@/lib/settings-store";
import {
  generateInsights, forecastMonthlyNetMissing, consistencyScore, monthVerdict,
  averageArrivalOffsetMin, fmtMin, type Insight,
} from "@/lib/insights";
import { hebrewFromGregorian, formatHebrewMonthYear } from "@/lib/hebrew-calendar";
import { StatTile, IconBadge, type Tone } from "@/components/ui/stat";

export const Route = createFileRoute("/statistics")({
  head: () => ({ meta: [{ title: "סטטיסטיקות ותובנות — סדר פלוס" }] }),
  component: StatisticsPage,
});

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const VERDICT_STYLES: Record<Insight["tone"], { border: string; badge: Tone; icon: typeof CheckCircle2 }> = {
  success:     { border: "border-r-success",     badge: "success",     icon: CheckCircle2 },
  info:        { border: "border-r-info",        badge: "info",        icon: Lightbulb },
  warning:     { border: "border-r-warning",     badge: "warning",     icon: AlertTriangle },
  destructive: { border: "border-r-destructive", badge: "destructive", icon: AlertTriangle },
};

/** The three insight buckets, in the order they are worth reading. */
const BUCKETS = [
  { key: "trend", label: "מה קורה", icon: TrendingUp },
  { key: "opportunity", label: "מה כדאי לשפר", icon: Target },
  { key: "recommendation", label: "המלצות", icon: Lightbulb },
] as const;

function StatisticsPage() {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const { settings } = useSettings();

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const monthEntries = entriesInMonth(entries, y, m);
  const summary = summarizeEntries(monthEntries);
  const score = scoreEntries(monthEntries);
  const streak = currentDayStreak();
  const forecast = forecastMonthlyNetMissing();
  const consistency = consistencyScore();
  const arrivalOffset = averageArrivalOffsetMin(monthEntries);

  const verdict = monthVerdict({
    score,
    target: settings.goals.monthlyTarget,
    entries: summary.entries,
    netMissing: summary.netMissing,
    lateCount: summary.lateCount,
    maxLatePerMonth: settings.goals.maxLatePerMonth,
  });

  const insights = generateInsights(entries, lessons, {
    monthlyTarget: settings.goals.monthlyTarget,
    maxLatePerMonth: settings.goals.maxLatePerMonth,
    alertMissingMinPerMonth: settings.seder.alertMissingMinPerMonth,
  });
  const grouped: Record<Insight["category"], Insight[]> = { trend: [], opportunity: [], recommendation: [] };
  for (const i of insights) grouped[i.category].push(i);

  const monthPrefix = `${y}-${String(m + 1).padStart(2, "0")}`;
  const learnMin = lessons
    .filter((l) => l.date.startsWith(monthPrefix))
    .reduce((s, l) => s + effectiveLearningMin(l), 0);

  const style = VERDICT_STYLES[verdict.tone];

  return (
    <AppShell title="סטטיסטיקות ותובנות" subtitle="איך נראה החודש, ומה כדאי לעשות">
      {/* 1 — the answer, in a sentence. */}
      <section className={`card-surface p-5 border-r-4 ${style.border}`}>
        <div className="flex items-start gap-4">
          <IconBadge icon={style.icon} tone={style.badge} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{verdict.headline}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{verdict.sentence}</p>
          </div>
          <ScoreRing score={score} target={settings.goals.monthlyTarget} />
        </div>
      </section>

      {/* 2 — the figures behind it, each with its unit spelled out. */}
      <section className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="דקות שחסרות החודש" value={summary.netMissing}
          hint={summary.excused > 0 ? `${summary.excused} דק׳ נוספות מוצדקות` : "אחרי הפחתת הבונוס"} />
        <StatTile label="איחורים" value={summary.lateCount}
          dot="var(--status-late)" hint={`מכסה חודשית: ${settings.goals.maxLatePerMonth}`} />
        <StatTile label="היעדרויות" value={summary.absenceCount}
          dot="var(--status-absent)" hint={`${summary.entries} סדרים נרשמו`} />
        <StatTile label="סדרי אוהבי ה׳" value={summary.oheveiCount}
          dot="var(--status-present)" hint="סדר מתחילתו ועד סופו" />
      </section>

      <section className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="רצף ימים" value={streak} hint={streak > 0 ? "ימים ללא חיסור" : "מתחילים היום"} />
        <StatTile
          label="הרגל ההגעה"
          value={arrivalOffset === null ? "—" : `${arrivalOffset <= 0 ? "" : "+"}${arrivalOffset}`}
          hint={
            arrivalOffset === null ? "אין מספיק רישומים"
            : arrivalOffset <= 0 ? `דק׳ לפני תחילת הסדר, בממוצע`
            : "דק׳ אחרי תחילת הסדר, בממוצע"
          }
        />
        <StatTile
          label="צפי לסוף החודש"
          value={forecast === null ? "—" : forecast}
          hint={forecast === null ? "אין מספיק נתונים החודש" : "דק׳ חסרות, לפי הקצב הנוכחי"}
        />
        <StatTile label="לימוד נוסף החודש" value={learnMin} hint={`${(learnMin / 60).toFixed(1)} שעות`} />
      </section>

      {/* 3 — what to do about it. */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {BUCKETS.map((bucket) => (
          <div key={bucket.key} className="card-surface p-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <bucket.icon className="size-4 text-primary" /> {bucket.label}
            </h2>
            {grouped[bucket.key].length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {summary.entries === 0 ? "רשום סדר אחד כדי להתחיל." : "אין כרגע מה לדווח כאן."}
              </p>
            ) : (
              <ul className="space-y-3">
                {grouped[bucket.key].map((i) => {
                  const s = VERDICT_STYLES[i.tone];
                  return (
                    <li key={i.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-start gap-2">
                        <IconBadge icon={s.icon} tone={s.badge} size="sm" />
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

      {/* 4 — the charts, folded away: useful, but not the first thing to read. */}
      <Charts entries={entries} lessons={lessons} consistency={consistency} />
    </AppShell>
  );
}

/** The month's score as a ring — one glance instead of a number to interpret. */
function ScoreRing({ score, target }: { score: number; target: number }) {
  const ok = score >= target;
  const size = 78, stroke = 7, r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}
      title={`ציון ${score} מתוך 100 · יעד ${target}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          className="stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          strokeLinecap="round"
          className={ok ? "stroke-success" : "stroke-primary"}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, score)) / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center leading-none">
          <div className="text-xl font-bold tabular-nums">{score}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">יעד {target}</div>
        </div>
      </div>
    </div>
  );
}

type ChartProps = {
  entries: ReturnType<typeof useSeder>["entries"];
  lessons: ReturnType<typeof useLearning>["items"];
  consistency: number;
};

function Charts({ entries, lessons, consistency }: ChartProps) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();

  // Twelve months of score, each computed over that month's own rows.
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, m - 11 + i, 1);
    const list = entriesInMonth(entries, d.getFullYear(), d.getMonth());
    return {
      label: d.toLocaleDateString("he-IL", { month: "short" }),
      hebLabel: formatHebrewMonthYear(hebrewFromGregorian(new Date(d.getFullYear(), d.getMonth(), 15))),
      score: scoreEntries(list),
      net: summarizeEntries(list).netMissing,
      entries: list.length,
    };
  });
  const best = [...months].filter((mo) => mo.entries > 0).sort((a, b) => b.score - a.score)[0];
  const yoyScore = attendanceScore(y - 1, m);
  const curScore = attendanceScore(y, m);

  // Average net missing per weekday.
  const weekday = WEEKDAYS.map((d) => ({ d, net: 0, count: 0 }));
  for (const e of entries) {
    const wd = new Date(e.date).getDay();
    if (Number.isNaN(wd)) continue;
    weekday[wd].net += calcSeder(e).netMissingMin;
    weekday[wd].count++;
  }
  const weekdayMax = Math.max(1, ...weekday.map((w) => (w.count ? w.net / w.count : 0)));

  const totalLearnHours = (lessons.reduce((s, l) => s + effectiveLearningMin(l), 0) / 60).toFixed(1);

  return (
    <div className="mt-5 card-surface overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-4 text-right hover:bg-accent/40 transition">
        <IconBadge icon={BarChart3} size="md" />
        <span className="flex-1">
          <span className="block text-sm font-semibold">גרפים ומגמות</span>
          <span className="block text-xs text-muted-foreground">
            12 חודשים אחרונים, חלוקה לפי יום בשבוע, ומפת נוכחות
          </span>
        </span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-border p-5 space-y-5">
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="ציון החודש" value={curScore}
              hint={`${curScore - yoyScore >= 0 ? "+" : ""}${curScore - yoyScore} מול אשתקד`} />
            <StatTile label="החודש המצטיין" value={best?.score ?? "—"} hint={best?.hebLabel || "אין נתונים"} />
            <StatTile label="ציון עקביות" value={consistency === 0 ? "—" : consistency}
              hint={consistency === 0 ? "אין מספיק חודשים" : "יציבות מחודש לחודש"} />
            <StatTile label="שעות לימוד נוסף" value={totalLearnHours} hint="מאז ההתחלה" />
          </section>

          <section>
            <h3 className="text-sm font-semibold">ציון נוכחות, 12 החודשים האחרונים</h3>
            <p className="text-xs text-muted-foreground mb-4">עמודה גבוהה = חודש טוב יותר</p>
            <div className="flex items-end gap-2 h-44">
              {months.map((mo, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5" title={`${mo.hebLabel} · ציון ${mo.score} · ${fmtMin(mo.net)} חסרות`}>
                  <div className="text-[10px] tabular-nums text-muted-foreground">{mo.entries ? mo.score : ""}</div>
                  <div className="w-full rounded-t-md bg-gradient-to-t from-primary to-primary/60"
                    style={{ height: `${Math.max(mo.score, 2)}%`, opacity: mo.entries ? 1 : 0.2 }} />
                  <div className="text-[11px] text-muted-foreground">{mo.label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <h3 className="text-sm font-semibold">באילו ימים אתה מפסיד הכי הרבה</h3>
              <p className="text-xs text-muted-foreground mb-3">ממוצע דקות חסרות לסדר</p>
              <ul className="space-y-2.5">
                {weekday.map((w) => {
                  const avg = w.count ? Math.round(w.net / w.count) : 0;
                  return (
                    <li key={w.d}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>{w.d}{w.count === 0 && <span className="text-muted-foreground"> — אין רישומים</span>}</span>
                        <span className="tabular-nums font-medium">{w.count ? avg : "—"}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary"
                          style={{ width: `${(avg / weekdayMax) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <AttendanceHeatmap entries={entries} />
          </section>
        </div>
      )}
    </div>
  );
}

/** Six weeks of days, darker where less was missed. */
function AttendanceHeatmap({ entries }: { entries: ChartProps["entries"] }) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 6 * 7 + 1);

  const cells: { iso: string; level: number }[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const list = entries.filter((e) => e.date === iso);
    if (!list.length) { cells.push({ iso, level: -1 }); continue; }
    const net = list.reduce((s, e) => s + calcSeder(e).netMissingMin, 0);
    cells.push({ iso, level: net === 0 ? 4 : net < 15 ? 3 : net < 30 ? 2 : net < 60 ? 1 : 0 });
  }

  return (
    <div>
      <h3 className="text-sm font-semibold">ששת השבועות האחרונים</h3>
      <p className="text-xs text-muted-foreground mb-3">ירוק מלא = סדר שלם · אפור = לא נרשם דבר</p>
      <div className="grid grid-cols-7 gap-1.5 max-w-xs">
        {cells.map((c) => (
          <div key={c.iso} title={c.level < 0 ? `${c.iso} — אין רישום` : c.iso}
            className="aspect-square rounded"
            style={{
              backgroundColor: c.level < 0
                ? "var(--color-muted)"
                : `color-mix(in oklch, var(--color-status-present) ${(c.level + 1) * 18}%, var(--color-muted))`,
            }} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Flame className="size-3" /> רצף</span>
        <span className="inline-flex items-center gap-1"><Award className="size-3" /> סדר שלם</span>
        <span className="inline-flex items-center gap-1"><Clock className="size-3" /> חסר</span>
        <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" /> לא נרשם</span>
      </div>
    </div>
  );
}
