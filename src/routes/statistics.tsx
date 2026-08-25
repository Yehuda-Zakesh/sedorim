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
  TrendingUp,
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
  success:     { border: "border-s-success",     badge: "success",     icon: CheckCircle2 },
  info:        { border: "border-s-info",        badge: "info",        icon: Lightbulb },
  warning:     { border: "border-s-warning",     badge: "warning",     icon: AlertTriangle },
  destructive: { border: "border-s-destructive", badge: "destructive", icon: AlertTriangle },
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
      <section className={`card-surface p-5 border-s-4 ${style.border}`}>
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
  const c = size / 2;
  const circumference = 2 * Math.PI * r;

  // The target, marked *on* the ring rather than only spelled out underneath
  // it. The ring's whole job is to answer "am I there yet" without reading a
  // number, and it couldn't do that while the thing being aimed at was absent
  // from the picture. Angle measured clockwise from twelve o'clock, matching
  // the -90° rotation the arc is drawn under.
  const theta = (Math.min(100, Math.max(0, target)) / 100) * 2 * Math.PI;
  const tick = (radius: number) => ({
    x: c + radius * Math.sin(theta),
    y: c - radius * Math.cos(theta),
  });
  const inner = tick(r - stroke / 2 - 1);
  const outer = tick(r + stroke / 2 + 1);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}
      title={`ציון ${score} מתוך 100 · יעד ${target}`}>
      <svg width={size} height={size} aria-hidden="true">
        <g transform={`rotate(-90 ${c} ${c})`}>
          <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
          <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke}
            strokeLinecap="round"
            className={ok ? "stroke-success" : "stroke-primary"}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, score)) / 100)} />
        </g>
        <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
          strokeWidth={2} strokeLinecap="round" className="stroke-foreground/45" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center leading-none">
          {/* No `tabular-nums` here: equal-width digits make a two-digit
              number look gappy at display size. */}
          <div className="text-xl font-bold">{score}</div>
          <div className="text-2xs text-muted-foreground mt-0.5">יעד {target}</div>
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
  // A fixed floor under the scale, and the scale is named in the caption.
  // Normalising purely to the observed maximum meant the worst day was drawn
  // full-width whatever the number was — a month where the very worst day
  // averaged three missing minutes looked exactly like a catastrophe.
  const weekdayScaleMax = Math.max(
    30,
    Math.ceil(Math.max(0, ...weekday.map((w) => (w.count ? w.net / w.count : 0))) / 10) * 10,
  );

  const totalLearnHours = (lessons.reduce((s, l) => s + effectiveLearningMin(l), 0) / 60).toFixed(1);

  return (
    <div className="mt-5 card-surface overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-4 text-start hover:bg-accent/40 pressable transition">
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
            {/* Twelve bars with a number over every one of them is a wall of
                digits nobody reads. Only the best month and the current one
                are labelled; the tooltip carries the rest, and the tiles above
                carry the same two figures in full. */}
            <div className="flex items-end gap-1.5 h-40">
              {months.map((mo, i) => {
                const isCurrent = i === months.length - 1;
                const isBest = best && mo.hebLabel === best.hebLabel;
                const labelled = mo.entries > 0 && (isCurrent || isBest);
                return (
                  <div key={i} className="flex-1 h-full flex flex-col justify-end gap-1.5"
                    title={`${mo.hebLabel} · ${mo.entries ? `ציון ${mo.score} · ${fmtMin(mo.net)} דק׳ חסרות` : "אין רישומים"}`}>
                    <div className="text-2xs tabular-nums text-center text-muted-foreground h-4">
                      {labelled ? mo.score : ""}
                    </div>
                    {/* A track behind each bar, so a month scored at zero is
                        still visibly a month that was measured. The old chart
                        floored every bar at 2% and faded empty months to 20%
                        opacity, which made "no data" and "very bad" the same
                        picture. */}
                    <div className="flex-1 flex items-end rounded-md bg-muted/50">
                      {mo.entries > 0 && (
                        <div className={`w-full rounded-md ${isBest ? "bg-primary" : "bg-primary/70"}`}
                          style={{ height: `${mo.score}%`, minHeight: mo.score > 0 ? 2 : 0 }} />
                      )}
                    </div>
                    <div className="text-2xs text-center text-muted-foreground">{mo.label}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <h3 className="text-sm font-semibold">באילו ימים אתה מפסיד הכי הרבה</h3>
              <p className="text-xs text-muted-foreground mb-3">
                ממוצע דקות חסרות לסדר · הסולם: 0–{weekdayScaleMax} דק׳
              </p>
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
                          style={{ width: `${Math.min(100, (avg / weekdayScaleMax) * 100)}%` }} />
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

  // The five bands the cells are painted in, named. The chart used to use these
  // levels without ever saying what they meant.
  const LEVELS = [
    { label: "60 דק׳ ומעלה" },
    { label: "30–59 דק׳" },
    { label: "15–29 דק׳" },
    { label: "עד 15 דק׳" },
    { label: "סדר שלם" },
  ];
  const levelFill = (level: number) =>
    `color-mix(in oklch, var(--color-status-present) ${(level + 1) * 18}%, var(--color-muted))`;

  const cells: { iso: string; level: number; net: number }[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const list = entries.filter((e) => e.date === iso);
    if (!list.length) { cells.push({ iso, level: -1, net: 0 }); continue; }
    const net = list.reduce((s, e) => s + calcSeder(e).netMissingMin, 0);
    cells.push({ iso, net, level: net === 0 ? 4 : net < 15 ? 3 : net < 30 ? 2 : net < 60 ? 1 : 0 });
  }

  return (
    <div>
      <h3 className="text-sm font-semibold">ששת השבועות האחרונים</h3>
      <p className="text-xs text-muted-foreground mb-3">ככל שהריבוע ירוק יותר — נשמט פחות באותו יום</p>
      <div className="grid grid-cols-7 gap-1.5 max-w-xs">
        {cells.map((c) => (
          <div key={c.iso}
            title={c.level < 0 ? `${c.iso} — אין רישום` : `${c.iso} · ${c.net} דק׳ חסרות`}
            className="aspect-square rounded"
            style={{ backgroundColor: c.level < 0 ? "var(--color-muted)" : levelFill(c.level) }} />
        ))}
      </div>

      {/* A scale legend, reading from "most missed" to "a full seder", plus the
          grey that means nothing was recorded at all.
          What stood here before was four icons — a flame, a medal, a clock and
          a calendar — that mapped to none of the five colours on the grid and
          so explained nothing about it. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded" style={{ backgroundColor: "var(--color-muted)" }} />
          לא נרשם
        </span>
        <span className="inline-flex items-center gap-1">
          {LEVELS.map((l, i) => (
            <span key={i} title={l.label} className="size-3 rounded" style={{ backgroundColor: levelFill(i) }} />
          ))}
        </span>
        <span>הרבה חסר ← סדר שלם</span>
      </div>
    </div>
  );
}
