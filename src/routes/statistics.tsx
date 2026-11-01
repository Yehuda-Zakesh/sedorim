// Statistics and insights: the month summary page.
//
// Three periods live on this screen and each has its own section, titled for
// what is inside it, so a figure never sits under a heading that contradicts it:
//
//   1. the selected month  — everything that changes with the month picker;
//   2. as of today         — streak, forecast, consistency and the insights,
//                            which are always computed for the present;
//   3. trends              — twelve months, the weekday split and the heat map.
//
// Each datum appears once. The verdict says it in a sentence, the ledger beside
// it gives the measured figures, and the charts are folded away for whoever
// wants to look further.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ChevronDown } from "lucide-react";
import {
  useSeder,
  useLearning,
  summarizeEntries,
  entriesInMonth,
  scoreEntries,
  attendanceScore,
  calcSeder,
  currentDayStreak,
  effectiveLearningMin,
} from "@/lib/kollel-store";
import { useSettings, SHAS_ARRIVAL_DEADLINE } from "@/lib/settings-store";
import {
  generateInsights,
  forecastMonthlyNetMissing,
  consistencyScore,
  monthVerdict,
  averageArrivalOffsetMin,
  fmtMin,
  type Insight,
} from "@/lib/insights";
import { hebrewFromGregorian, formatHebrewMonthYear, isWeekend } from "@/lib/hebrew-calendar";
import { MonthPicker } from "@/components/month-picker";
import { PageSection, LedgerRow, StatusMark, Figure, Notice } from "@/components/ui/ledger";
import type { MarkTone } from "@/components/ui/ledger";
import { useSelectedMonth } from "@/lib/period";
import {
  classifyMonthScore,
  currentMonthKey,
  formatDateDots,
  monthKeyLabel,
  monthsWithData,
} from "@/lib/month-nav";
import { calcStipend } from "@/lib/stipend";

export const Route = createFileRoute("/statistics")({
  head: () => ({ meta: [{ title: "סטטיסטיקות ותובנות — סדר פלוס" }] }),
  component: StatisticsPage,
});

// Sunday to Thursday, indexed by getDay(). Friday and Shabbat are absent on
// purpose: the kollel does not sit on them, so they are not weak days with
// nothing recorded — they are not days the breakdown has anything to say about.
const LEARNING_WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];

const TONE_MARK: Record<Insight["tone"], MarkTone> = {
  success: "present",
  info: "none",
  warning: "late",
  destructive: "absent",
};

/** The three insight buckets, in the order they are worth reading. */
const BUCKETS = [
  { key: "trend", label: "מה קורה" },
  { key: "opportunity", label: "מה כדאי לשפר" },
  { key: "recommendation", label: "המלצות" },
] as const;

function StatisticsPage() {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const { settings } = useSettings();

  const [month, setMonth] = useSelectedMonth();
  const months = useMemo(() => monthsWithData(entries, lessons), [entries, lessons]);
  const [y, mNum] = month.split("-").map(Number);
  const m = mNum - 1;
  const monthLabel = monthKeyLabel(month);
  const monthEntries = entriesInMonth(entries, y, m);
  const summary = summarizeEntries(monthEntries);
  const score = scoreEntries(monthEntries);
  const arrivalOffset = averageArrivalOffsetMin(monthEntries);

  // Today's figures: they do not move with the month picker.
  const streak = currentDayStreak();
  const forecast = forecastMonthlyNetMissing();
  const consistency = consistencyScore();

  const verdict = monthVerdict({
    score,
    target: settings.goals.monthlyTarget,
    entries: summary.entries,
    netMissing: summary.netMissing,
    lateCount: summary.lateCount,
    maxLatePerMonth: settings.goals.maxLatePerMonth,
  });

  // generateInsights reads the present month, whatever month is selected.
  const insights = generateInsights(entries, lessons, {
    monthlyTarget: settings.goals.monthlyTarget,
    maxLatePerMonth: settings.goals.maxLatePerMonth,
    alertMissingMinPerMonth: settings.seder.alertMissingMinPerMonth,
  });
  const grouped: Record<Insight["category"], Insight[]> = {
    trend: [],
    opportunity: [],
    recommendation: [],
  };
  for (const i of insights) grouped[i.category].push(i);

  const monthLessons = lessons.filter((l) => l.date.startsWith(month));
  const learnMin = monthLessons.reduce((s, l) => s + effectiveLearningMin(l), 0);
  const learnRawMin = monthLessons.reduce((s, l) => s + l.minutes, 0);
  const priorApproval = (settings.stipend?.approvedMonths ?? []).includes(month);
  const stipend = calcStipend({
    monthKey: month,
    entries,
    lessons,
    shasChavura: settings.seder.shasChavura,
    priorApproval,
  });
  const nisFmt = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("he-IL")} ₪`;
  const hasAttendance = summary.entries > 0;
  const noData = !hasAttendance && monthLessons.length === 0;
  const hasInsights = insights.length > 0;

  return (
    <AppShell title="סטטיסטיקות ותובנות" subtitle="איך נראה החודש, ומה כדאי לעשות">
      <div className="stack-gap">
        <MonthPicker value={month} months={months} onChange={setMonth} />

        {/* 1 — the selected month: the conclusion, and the figures behind it. */}
        <PageSection title={`החודש הנבחר · ${monthLabel}`} aside="משתנה לפי בורר החודש">
          {noData ? (
            <Notice tone="info" title={`אין עדיין נתונים ל${monthLabel}`}>
              לא נרשמו סדרים או לימוד נוסף בחודש זה, ולכן אין מה לסכם. רשום סדר או לימוד, או עבור
              לחודש אחר.
            </Notice>
          ) : (
            <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
              <div className="min-w-0">
                {hasAttendance ? (
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <StatusMark tone={TONE_MARK[verdict.tone]}>מסקנת החודש</StatusMark>
                      <h3 className="title-serif mt-2 text-2xl">{verdict.headline}</h3>
                      <p className="mt-1.5 text-sm text-muted-foreground">{verdict.sentence}</p>
                    </div>
                    <ScoreRing score={score} target={settings.goals.monthlyTarget} />
                  </div>
                ) : (
                  <Notice tone="info" title={`אין רישומי סדר ב${monthLabel}`}>
                    יש רק לימוד נוסף. ציון הנוכחות מחושב מרישומי סדר, ולכן אין לו ערך לחודש זה.
                  </Notice>
                )}
              </div>

              <div className="min-w-0">
                <div className="ledger" role="group" aria-label={`נתוני בפועל, ${monthLabel}`}>
                  {hasAttendance && (
                    <>
                      <LedgerRow
                        label="חסר נטו"
                        note={
                          summary.excused > 0
                            ? `בנוסף ${summary.excused} דק׳ מוצדקות שאינן נכללות`
                            : "אחרי הפחתת הבונוס"
                        }
                      >
                        {summary.netMissing} דק׳
                      </LedgerRow>
                      <LedgerRow
                        label="איחורים"
                        note={`מכסה חודשית: ${settings.goals.maxLatePerMonth}`}
                      >
                        {summary.lateCount}
                      </LedgerRow>
                      <LedgerRow label="היעדרויות" note={`מתוך ${summary.entries} סדרים שנרשמו`}>
                        {summary.absenceCount}
                      </LedgerRow>
                      <LedgerRow label="סדרי אוהבי ה׳" note="סדר מתחילתו ועד סופו">
                        {summary.oheveiCount}
                      </LedgerRow>
                      {settings.seder.shasChavura && (
                        <LedgerRow
                          label="חבורת ש״ס"
                          note={`הגעות לסדר ב׳ עד ${SHAS_ARRIVAL_DEADLINE}`}
                        >
                          {summary.shasCount}
                        </LedgerRow>
                      )}
                      <LedgerRow
                        label="הרגל הגעה"
                        note={
                          arrivalOffset === null
                            ? "אין מספיק רישומים עם שעת הגעה"
                            : arrivalOffset <= 0
                              ? "דק׳ לפני תחילת הסדר, בממוצע"
                              : "דק׳ אחרי תחילת הסדר, בממוצע"
                        }
                      >
                        {arrivalOffset === null
                          ? "—"
                          : `${arrivalOffset <= 0 ? "" : "+"}${arrivalOffset}`}
                      </LedgerRow>
                    </>
                  )}
                  <LedgerRow
                    label="לימוד נוסף מזכה"
                    note={
                      learnRawMin !== learnMin
                        ? `${learnRawMin} דק׳ בפועל · תענית דיבור נספרת כפול`
                        : `${learnRawMin} דק׳ בפועל · ${(learnMin / 60).toFixed(1)} שעות`
                    }
                  >
                    {learnMin} דק׳
                  </LedgerRow>
                  <LedgerRow
                    label="מלגה מחושבת"
                    note={
                      <>
                        להמחשה בלבד ·{" "}
                        <Link to="/stipend" className="text-primary underline underline-offset-2">
                          לפירוט החישוב
                        </Link>
                      </>
                    }
                  >
                    <bdi dir="ltr">{nisFmt(stipend.totalNis)}</bdi>
                  </LedgerRow>
                </div>
                {(summary.lateCount > 0 || summary.absenceCount > 0) && (
                  <p className="mt-3 text-sm">
                    <Link
                      to="/history"
                      search={{ month, kind: "attendance", filter: "exceptions" }}
                      className="text-primary underline underline-offset-2"
                    >
                      לרישומי האיחורים וההיעדרויות ב{monthLabel}, ביומן
                    </Link>
                  </p>
                )}
              </div>
            </div>
          )}
        </PageSection>

        {/* 2 — today: independent of the month picker, and said so. */}
        <PageSection
          title="נכון להיום"
          aside={
            month === currentMonthKey()
              ? "מדדים שמתייחסים להווה"
              : `אינו תלוי ב${monthLabel}: מחושב להיום`
          }
        >
          <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
            <div className="ledger">
              <LedgerRow label="רצף ימים" note={streak > 0 ? "ימים ללא חיסור" : "מתחילים היום"}>
                {streak}
              </LedgerRow>
              <LedgerRow
                label="תחזית לסוף החודש הנוכחי"
                note={
                  forecast === null
                    ? "אין מספיק נתונים לתחזית (נדרשים 3 סדרים)"
                    : "תחזית, לא נתון בפועל: דק׳ חסרות לפי הקצב הנוכחי"
                }
              >
                {forecast === null ? "—" : <>{forecast} דק׳ (תחזית)</>}
              </LedgerRow>
              <LedgerRow
                label="ציון עקביות"
                note={consistency === 0 ? "אין מספיק חודשים" : "יציבות מחודש לחודש"}
              >
                {consistency === 0 ? "—" : consistency}
              </LedgerRow>
            </div>

            <div className="min-w-0">
              <div className="eyebrow mb-1">תובנות · נכון להיום, לחודש הנוכחי</div>
              {!hasInsights ? (
                <p className="text-sm text-muted-foreground">
                  {entries.length === 0
                    ? "אין עדיין נתונים לתובנות. רשום סדר אחד כדי להתחיל."
                    : "אין כרגע מה לדווח."}
                </p>
              ) : (
                BUCKETS.map((bucket) =>
                  grouped[bucket.key].length === 0 ? null : (
                    <div key={bucket.key} className="mb-3">
                      <h3 className="mt-3 text-sm font-semibold">{bucket.label}</h3>
                      <ul className="ledger">
                        {grouped[bucket.key].map((i) => (
                          <li key={i.id} className="row-pad">
                            <StatusMark tone={TONE_MARK[i.tone]}>{i.title}</StatusMark>
                            <div className="mt-0.5 text-xs text-muted-foreground">{i.detail}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        </PageSection>

        {/* 3 — the charts, folded away: useful, but not the first thing to read. */}
        <Charts
          entries={entries}
          lessons={lessons}
          year={y}
          monthIdx={m}
          monthLabel={monthLabel}
          target={settings.goals.monthlyTarget}
        />
      </div>
    </AppShell>
  );
}

/** The month's score as a ring — one glance instead of a number to interpret. */
function ScoreRing({ score, target }: { score: number; target: number }) {
  const ok = score >= target;
  const size = 60,
    stroke = 6,
    r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;

  // The target, marked *on* the ring rather than only spelled out underneath
  // it. Angle measured clockwise from twelve o'clock, matching the -90°
  // rotation the arc is drawn under.
  const theta = (Math.min(100, Math.max(0, target)) / 100) * 2 * Math.PI;
  const tick = (radius: number) => ({
    x: c + radius * Math.sin(theta),
    y: c - radius * Math.cos(theta),
  });
  const inner = tick(r - stroke / 2 - 1);
  const outer = tick(r + stroke / 2 + 1);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`ציון ${score} מתוך 100, יעד ${target}, ${ok ? "מעל היעד" : "מתחת ליעד"}`}
    >
      <svg width={size} height={size} aria-hidden="true">
        <g transform={`rotate(-90 ${c} ${c})`}>
          <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className={ok ? "stroke-success" : "stroke-primary"}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, score)) / 100)}
          />
        </g>
        <line
          x1={inner.x}
          y1={inner.y}
          x2={outer.x}
          y2={outer.y}
          strokeWidth={2}
          strokeLinecap="round"
          className="stroke-foreground/45"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center" aria-hidden="true">
        <div className="text-center leading-none">
          {/* No tabular figures here: equal-width digits look gappy at display size. */}
          <div className="text-base font-bold">{score}</div>
          <div className="mt-0.5 text-2xs text-muted-foreground">יעד {target}</div>
        </div>
      </div>
    </div>
  );
}

type ChartProps = {
  entries: ReturnType<typeof useSeder>["entries"];
  lessons: ReturnType<typeof useLearning>["items"];
  year: number;
  monthIdx: number;
  monthLabel: string;
  target: number;
};

function Charts({ entries, lessons, year: y, monthIdx: m, monthLabel, target }: ChartProps) {
  const [open, setOpen] = useState(false);

  // Twelve months of score, each computed over that month's own rows.
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, m - 11 + i, 1);
    const list = entriesInMonth(entries, d.getFullYear(), d.getMonth());
    return {
      label: d.toLocaleDateString("he-IL", { month: "short" }),
      hebLabel: formatHebrewMonthYear(
        hebrewFromGregorian(new Date(d.getFullYear(), d.getMonth(), 15)),
      ),
      score: scoreEntries(list),
      net: summarizeEntries(list).netMissing,
      entries: list.length,
    };
  });
  const best = [...months].filter((mo) => mo.entries > 0).sort((a, b) => b.score - a.score)[0];
  const yoyScore = attendanceScore(y - 1, m);
  const curScore = attendanceScore(y, m);

  // Average net missing per weekday, over the days the kollel sits.
  const weekday = LEARNING_WEEKDAY_NAMES.map((d) => ({ d, net: 0, count: 0 }));
  for (const e of entries) {
    const wd = new Date(e.date).getDay();
    if (Number.isNaN(wd) || wd > 4) continue; // שישי־שבת אינם ימי לימוד
    weekday[wd].net += calcSeder(e).netMissingMin;
    weekday[wd].count++;
  }
  // A fixed floor under the scale, and the scale is named in the caption.
  // Normalising purely to the observed maximum meant the worst day was drawn
  // full-width whatever the number was.
  const weekdayScaleMax = Math.max(
    30,
    Math.ceil(Math.max(0, ...weekday.map((w) => (w.count ? w.net / w.count : 0))) / 10) * 10,
  );

  const totalLearnHours = (lessons.reduce((s, l) => s + effectiveLearningMin(l), 0) / 60).toFixed(
    1,
  );
  const zeroLabels = months
    .filter((mo) => classifyMonthScore(mo.entries, mo.score) === "zero")
    .map((mo) => mo.hebLabel);
  const measured = months.filter((mo) => mo.entries > 0).length;

  return (
    <PageSection title="מגמות וגרפים">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-start pressable transition hover:bg-accent/40"
      >
        <span className="flex-1">
          <span className="block text-sm font-medium">
            {open ? "הסתר את הגרפים" : "הצג את הגרפים"}
          </span>
          <span className="block text-xs text-muted-foreground">
            ציון 12 חודשים, ימים חלשים, ומפת נוכחות
          </span>
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="mt-4 space-y-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Figure
              label={`ציון ${monthLabel}`}
              value={curScore}
              unit="מתוך 100"
              note={`${curScore - yoyScore >= 0 ? "+" : ""}${curScore - yoyScore} מול אשתקד`}
            />
            <Figure
              label="החודש המצטיין, 12 חודשים"
              value={best?.score ?? "—"}
              unit={best ? "מתוך 100" : undefined}
              note={best?.hebLabel || "אין נתונים"}
            />
            <Figure
              label="לימוד נוסף, כל התקופה"
              value={totalLearnHours}
              unit="שעות"
              note="מאז ההתחלה"
            />
          </div>

          <section aria-label={`ציון נוכחות, 12 חודשים עד ${monthLabel}`}>
            <h3 className="text-sm font-semibold">ציון נוכחות, 12 חודשים עד {monthLabel}</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              בפועל, לפי רישומי סדר. מסייע לראות אם החודש הנבחר מעל היעד ובאיזו מגמה.
            </p>
            {measured === 0 ? (
              <p className="text-sm text-muted-foreground">
                אין רישומי סדר ב־12 החודשים האלה, ולכן אין מה להציג.
              </p>
            ) : (
              <>
                <div
                  className="relative"
                  role="img"
                  aria-label={`ציון נוכחות לפי חודש, 12 חודשים עד ${monthLabel}. הציון בחודש הנבחר ${curScore}, היעד ${target}${best ? `, החודש המצטיין ${best.hebLabel} בציון ${best.score}` : ""}${zeroLabels.length ? `. ציון 0 — נמדד: ${zeroLabels.join(", ")}` : ""}`}
                >
                  <div className="flex h-36 items-end gap-1.5">
                    {months.map((mo, i) => {
                      const selected = i === months.length - 1;
                      const kind = classifyMonthScore(mo.entries, mo.score);
                      return (
                        <div
                          key={i}
                          className="relative h-full flex-1 rounded-sm bg-muted/60"
                          title={`${mo.hebLabel} · ${kind === "none" ? "אין רישומים" : kind === "zero" ? `ציון 0 — נמדד · ${fmtMin(mo.net)} חסרות` : `ציון ${mo.score} · ${fmtMin(mo.net)} חסרות`}`}
                        >
                          {kind === "score" && (
                            <div
                              className={`absolute bottom-0 w-full rounded-sm ${selected ? "bg-primary" : "bg-primary/50"}`}
                              style={{ height: `${mo.score}%`, minHeight: 2 }}
                            />
                          )}
                          {kind === "zero" && (
                            <span
                              role="img"
                              aria-label="ציון 0 — נמדד"
                              className="absolute inset-x-0 bottom-0 flex flex-col items-center"
                            >
                              <span className="size-1.5 rounded-full bg-foreground" />
                              <span className="h-0.5 w-full bg-foreground" />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-36"
                    aria-hidden="true"
                  >
                    <div
                      className="absolute inset-x-0 border-t-2 border-dashed border-foreground/50"
                      style={{ bottom: `${Math.min(100, Math.max(0, target))}%` }}
                    />
                  </div>
                </div>
                <div className="mt-1 flex gap-1.5" aria-hidden="true">
                  {months.map((mo, i) => {
                    const selected = i === months.length - 1;
                    const isBest = best && mo.hebLabel === best.hebLabel;
                    return (
                      <div key={i} className="flex-1 text-center text-xs text-muted-foreground">
                        <div>{mo.label}</div>
                        <div className="figure h-4 font-semibold text-foreground">
                          {mo.entries > 0 && (selected || isBest) ? mo.score : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-3 rounded-sm bg-primary" aria-hidden="true" />
                    {monthLabel} (הנבחר)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-3 rounded-sm bg-primary/50" aria-hidden="true" />
                    חודשים קודמים
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-4 border-t-2 border-dashed border-foreground/50"
                      aria-hidden="true"
                    />
                    יעד ({target})
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="flex flex-col items-center" aria-hidden="true">
                      <span className="size-1.5 rounded-full bg-foreground" />
                      <span className="h-0.5 w-4 bg-foreground" />
                    </span>
                    • = ציון אפס שנמדד
                  </span>
                  <span>עמודה ריקה = אין רישומים · הסולם 0–100</span>
                </p>
              </>
            )}
          </section>

          <section className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">באילו ימים חסר הכי הרבה · כל התקופה</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                ממוצע דקות חסרות לסדר, בימי א׳–ה׳ · הסולם: 0–{weekdayScaleMax} דק׳
              </p>
              <ul className="space-y-2.5">
                {weekday.map((w) => {
                  const avg = w.count ? Math.round(w.net / w.count) : 0;
                  return (
                    <li key={w.d}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span>
                          {w.d}
                          {w.count === 0 && (
                            <span className="text-muted-foreground"> — אין רישומים</span>
                          )}
                        </span>
                        <span className="figure font-medium">{w.count ? `${avg} דק׳` : "—"}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, (avg / weekdayScaleMax) * 100)}%` }}
                        />
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
    </PageSection>
  );
}

/** Six weeks of days, darker where less was missed. */
function AttendanceHeatmap({ entries }: { entries: ChartProps["entries"] }) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 6 * 7 + 1);

  // The five bands the cells are painted in, named.
  const LEVELS = [
    { label: "60 דק׳ ומעלה" },
    { label: "30–59 דק׳" },
    { label: "15–29 דק׳" },
    { label: "עד 15 דק׳" },
    { label: "סדר שלם" },
  ];
  const levelFill = (level: number) =>
    `color-mix(in oklch, var(--color-status-present) ${(level + 1) * 18}%, var(--color-muted))`;

  // A Friday or Shabbat with nothing on it is not a gap in the record, so it
  // is drawn as what it is — a day off — rather than sharing the grey that
  // means "a learning day nobody filled in".
  const cells: { iso: string; level: number; net: number; offDay: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const offDay = isWeekend(dt);
    const list = entries.filter((e) => e.date === iso);
    if (!list.length) {
      cells.push({ iso, level: -1, net: 0, offDay });
      continue;
    }
    const net = list.reduce((s, e) => s + calcSeder(e).netMissingMin, 0);
    cells.push({
      iso,
      net,
      offDay,
      level: net === 0 ? 4 : net < 15 ? 3 : net < 30 ? 2 : net < 60 ? 1 : 0,
    });
  }
  const recorded = cells.filter((c) => c.level >= 0);
  const full = recorded.filter((c) => c.level === 4).length;

  return (
    <div>
      <h3 className="text-sm font-semibold">ששת השבועות האחרונים · נכון להיום</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        ככל שהריבוע ירוק יותר, חסר פחות באותו יום
      </p>
      <div
        className="grid max-w-xs grid-cols-7 gap-1.5"
        role="img"
        aria-label={`ששת השבועות האחרונים: ${recorded.length} ימים עם רישום, מתוכם ${full} עם סדר שלם`}
      >
        {cells.map((c) => (
          <div
            key={c.iso}
            title={
              c.offDay
                ? `${formatDateDots(c.iso)} — שישי/שבת, אינו יום לימודים`
                : c.level < 0
                  ? `${formatDateDots(c.iso)} — אין רישום`
                  : `${formatDateDots(c.iso)} · ${c.net} דק׳ חסרות`
            }
            className={`aspect-square rounded-sm ${c.offDay && c.level < 0 ? "border border-dashed border-border" : ""}`}
            style={{
              backgroundColor:
                c.offDay && c.level < 0
                  ? "transparent"
                  : c.level < 0
                    ? "var(--color-muted)"
                    : levelFill(c.level),
            }}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-3 rounded-sm border border-dashed border-border"
            aria-hidden="true"
          />
          שישי־שבת
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-3 rounded-sm"
            style={{ backgroundColor: "var(--color-muted)" }}
            aria-hidden="true"
          />
          לא נרשם
        </span>
        <span className="inline-flex items-center gap-1">
          {LEVELS.map((l, i) => (
            <span
              key={i}
              title={l.label}
              className="size-3 rounded-sm"
              style={{ backgroundColor: levelFill(i) }}
              aria-hidden="true"
            />
          ))}
        </span>
        <span>הרבה חסר ← סדר שלם</span>
      </div>
    </div>
  );
}
