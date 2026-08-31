import {
  type SederEntry,
  type LearningEntry,
  calcSeder,
  monthlySummary,
  attendanceScore,
  entriesInMonth,
  getSederSnapshot,
  currentDayStreak,
  hhmmToMin,
  FRAMEWORK_LABELS,
} from "./kollel-store";
import { getSederTimesFor, getSettings } from "./settings-store";
import { isLearningDay, isWeekend } from "./hebrew-calendar";

/**
 * The days of the week the kollel sits, Sunday(0) to Thursday(4).
 *
 * Friday and Shabbat are not short learning days, they are not learning days
 * at all — so they are left out of every weekday breakdown here rather than
 * being scored as days with nothing recorded on them. A stray record on one
 * (a make-up seder, a typo) still counts towards the month's minutes; it just
 * never becomes "your weakest day is Shabbat".
 */
export const LEARNING_WEEKDAYS = [0, 1, 2, 3, 4] as const;

/** Whether a date's weekday is one the kollel sits on. */
export function isLearningWeekday(dateISO: string): boolean {
  const d = new Date(dateISO);
  return !Number.isNaN(d.getTime()) && !isWeekend(d);
}

export const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;

/** Entries to look back over for a weekday breakdown — roughly two months. */
const WEAK_DAY_WINDOW = 120;
/** Entries needed overall before the breakdown is allowed to conclude anything. */
const WEAK_DAY_MIN_SAMPLE = 20;
/** Entries needed on one weekday before that day can be named. */
const WEAK_DAY_MIN_PER_DAY = 3;
/** A weekday counts as weak only below this share of complete sedarim. */
export const WEAK_DAY_MAX_RATE = 0.6;

/**
 * The weekday the user most often falls short on, or null when the record is
 * too thin to say.
 *
 * Both the sample floors matter. Without the per-day one, a single bad Tuesday
 * in a new install is "your weakest day is Tuesday"; without the overall one,
 * the answer changes every time an entry is added. Expects `entries` newest
 * first, as the store keeps them.
 */
export function weakestLearningWeekday(
  entries: SederEntry[],
): { day: number; rate: number } | null {
  const recent = entries.slice(0, WEAK_DAY_WINDOW);
  if (recent.length < WEAK_DAY_MIN_SAMPLE) return null;

  const stats: { good: number; total: number }[] = Array.from({ length: 7 }, () => ({
    good: 0,
    total: 0,
  }));
  for (const e of recent) {
    if (!isLearningWeekday(e.date)) continue; // שישי־שבת אינם ימי לימוד
    const d = new Date(e.date).getDay();
    stats[d].total++;
    if (!e.absent && calcSeder(e).netMissingMin === 0) stats[d].good++;
  }

  let day = -1,
    rate = 1;
  for (const i of LEARNING_WEEKDAYS) {
    if (stats[i].total < WEAK_DAY_MIN_PER_DAY) continue;
    const r = stats[i].good / stats[i].total;
    if (r < rate) {
      rate = r;
      day = i;
    }
  }
  return day >= 0 && rate < WEAK_DAY_MAX_RATE ? { day, rate } : null;
}

export type Insight = {
  id: string;
  tone: "success" | "warning" | "info" | "destructive";
  title: string;
  detail: string;
  category: "trend" | "opportunity" | "recommendation";
};

export function fmtMin(m: number): string {
  if (m < 60) return `${m} דק׳`;
  const h = Math.floor(m / 60),
    r = m % 60;
  return r === 0 ? `${h} שע׳` : `${h}:${String(r).padStart(2, "0")} שע׳`;
}

// ============ plain-language summary ============
// The screen used to open with four bare numbers and a 0–100 score, which says
// nothing on its own — 84 out of 100 is good or bad depending on the target.
// This turns the same figures into one sentence.

export type Verdict = {
  tone: "success" | "warning" | "destructive" | "info";
  headline: string;
  sentence: string;
};

export function monthVerdict(f: {
  score: number;
  target: number;
  entries: number;
  netMissing: number;
  lateCount: number;
  maxLatePerMonth: number;
}): Verdict {
  if (f.entries === 0) {
    return {
      tone: "info",
      headline: "אין עדיין רישומים החודש",
      sentence: "ברגע שתרשום סדר אחד, כאן תופיע תמונת המצב של החודש.",
    };
  }
  const gap = f.target - f.score;
  if (f.score >= f.target) {
    return {
      tone: "success",
      headline: "החודש הזה מעל היעד",
      sentence: `ציון ${f.score} מול יעד ${f.target}. חסרות לך ${fmtMin(f.netMissing)} בסך הכל — המשך כך.`,
    };
  }
  if (gap <= 5) {
    return {
      tone: "info",
      headline: "כמעט ביעד",
      sentence: `ציון ${f.score}, חסרות ${gap} נקודות ליעד ${f.target}. הגעה בזמן בימים הקרובים תסגור את הפער.`,
    };
  }
  if (f.lateCount > f.maxLatePerMonth) {
    return {
      tone: "destructive",
      headline: "האיחורים הם מה שמוריד את הציון",
      sentence: `${f.lateCount} איחורים החודש מול מכסה של ${f.maxLatePerMonth}, וציון ${f.score} מול יעד ${f.target}.`,
    };
  }
  return {
    tone: "warning",
    headline: "יש מה לשפר החודש",
    sentence: `ציון ${f.score} מול יעד ${f.target}, ובסך הכל חסרות ${fmtMin(f.netMissing)}.`,
  };
}

/**
 * Average distance between arrival and the start of the seder, in minutes:
 * negative means early, positive means late. Absences and rows with no
 * arrival time are left out — they say nothing about punctuality.
 */
export function averageArrivalOffsetMin(entries: SederEntry[]): number | null {
  let total = 0,
    count = 0;
  for (const e of entries) {
    if (e.absent) continue;
    const arrival = hhmmToMin(e.arrival);
    if (arrival === null) continue;
    const t = getSederTimesFor(e.date);
    const start = hhmmToMin(e.seder === 1 ? t.s1Start : t.s2Start);
    if (start === null) continue;
    total += arrival - start;
    count++;
  }
  return count === 0 ? null : Math.round(total / count);
}

/**
 * Bonus minutes left on the table: for each seder arrived at *on* time or late,
 * the bonus that arriving `earlyBy` minutes sooner would have earned.
 *
 * This is the one number that turns "you are behind" into something to do
 * about it.
 */
export function bonusOpportunityMin(entries: SederEntry[], earlyBy: number): number {
  const threshold = getSettings().seder.bonusThresholdMin;
  const perSeder = Math.min(earlyBy, threshold);
  let count = 0;
  for (const e of entries) {
    if (e.absent) continue;
    const arrival = hhmmToMin(e.arrival);
    if (arrival === null) continue;
    const t = getSederTimesFor(e.date);
    const start = hhmmToMin(e.seder === 1 ? t.s1Start : t.s2Start);
    if (start === null) continue;
    if (arrival >= start) count++;
  }
  return count * perSeder;
}

/** Net missing minutes over the last 7 days against the 7 before them. */
export function weekOverWeek(
  entries: SederEntry[],
  now = new Date(),
): {
  recent: number;
  previous: number;
  diff: number;
} | null {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dayBefore = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return iso(d);
  };
  const recentFrom = dayBefore(6),
    recentTo = iso(now);
  const prevFrom = dayBefore(13),
    prevTo = dayBefore(7);

  const sum = (from: string, to: string) => {
    let net = 0,
      count = 0;
    for (const e of entries) {
      if (e.date < from || e.date > to) continue;
      net += calcSeder(e).netMissingMin;
      count++;
    }
    return { net, count };
  };
  const recent = sum(recentFrom, recentTo);
  const previous = sum(prevFrom, prevTo);
  if (recent.count === 0 || previous.count === 0) return null;
  return { recent: recent.net, previous: previous.net, diff: recent.net - previous.net };
}

export function generateInsights(
  entries: SederEntry[],
  lessons: LearningEntry[],
  goals: { monthlyTarget: number; maxLatePerMonth: number; alertMissingMinPerMonth: number },
): Insight[] {
  const out: Insight[] = [];
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const cur = monthlySummary(y, m);
  const prevY = m === 0 ? y - 1 : y;
  const prevM = m === 0 ? 11 : m - 1;
  const prev = monthlySummary(prevY, prevM);
  const score = attendanceScore(y, m);
  const prevScore = attendanceScore(prevY, prevM);

  if (cur.entries === 0) {
    out.push({
      id: "no-data",
      tone: "info",
      category: "recommendation",
      title: "אין רישומים החודש",
      detail: "פתח את מסך הנוכחות ורשום את הסדרים של היום.",
    });
    return out;
  }

  if (prev.entries >= 5) {
    const diff = score - prevScore;
    if (diff >= 3)
      out.push({
        id: "trend-up",
        tone: "success",
        category: "trend",
        title: `שיפור של ${diff} נקודות בציון הנוכחות`,
        detail: `החודש: ${score} · חודש קודם: ${prevScore}. המשך כך!`,
      });
    else if (diff <= -3)
      out.push({
        id: "trend-down",
        tone: "warning",
        category: "trend",
        title: `ירידה של ${Math.abs(diff)} נקודות בציון הנוכחות`,
        detail: `החודש: ${score} · חודש קודם: ${prevScore}.`,
      });
  }

  if (score >= goals.monthlyTarget) {
    out.push({
      id: "goal-met",
      tone: "success",
      category: "trend",
      title: "היעד החודשי הושג",
      detail: `${score} מתוך יעד ${goals.monthlyTarget}.`,
    });
  } else if (cur.entries >= 5) {
    out.push({
      id: "goal-gap",
      tone: "info",
      category: "opportunity",
      title: `${goals.monthlyTarget - score} נקודות עד היעד החודשי`,
      detail: `יעד: ${goals.monthlyTarget} · נוכחי: ${score}. הקפד על הגעה מוקדמת בימים הקרובים.`,
    });
  }

  if (cur.lateCount >= goals.maxLatePerMonth) {
    out.push({
      id: "late-limit",
      tone: "destructive",
      category: "recommendation",
      title: "מכסת איחורים חודשית נחצתה",
      detail: `${cur.lateCount} איחורים מתוך ${goals.maxLatePerMonth} מותרים.`,
    });
  } else if (cur.lateCount === goals.maxLatePerMonth - 1) {
    out.push({
      id: "late-warn",
      tone: "warning",
      category: "opportunity",
      title: "מתקרב למכסת איחורים",
      detail: `${cur.lateCount} מתוך ${goals.maxLatePerMonth}. הימנע מאיחור נוסף.`,
    });
  }

  if (cur.netMissing >= goals.alertMissingMinPerMonth) {
    out.push({
      id: "missing-alert",
      tone: "destructive",
      category: "recommendation",
      title: `${fmtMin(cur.netMissing)} חסרים החודש (נטו)`,
      detail: `סף ההתראה: ${fmtMin(goals.alertMissingMinPerMonth)}. שקול תכנון מחדש לשבוע הקרוב.`,
    });
  }

  if (cur.bonus >= 60) {
    out.push({
      id: "bonus-great",
      tone: "success",
      category: "trend",
      title: `${fmtMin(cur.bonus)} דקות בונוס נצברו`,
      detail: "הגעות מוקדמות עוזרות להקטין דקות חסרות.",
    });
  }

  if (cur.oheveiCount >= 5) {
    out.push({
      id: "ohevei",
      tone: "success",
      category: "trend",
      title: `${cur.oheveiCount} סדרים של "אוהבי ה׳"`,
      detail: "השקעה משמעותית — כל הכבוד.",
    });
  }

  if (cur.absenceCount >= 3) {
    out.push({
      id: "absences",
      tone: "warning",
      category: "opportunity",
      title: `${cur.absenceCount} היעדרויות החודש`,
      detail: "סמן היעדרויות כמוצדקות כשהן זכאיות לכך.",
    });
  }

  const learnMinThisMonth = lessons
    .filter((l) => l.date.slice(0, 7) === `${y}-${String(m + 1).padStart(2, "0")}`)
    .reduce((s, l) => s + l.minutes, 0);
  if (learnMinThisMonth >= 300) {
    out.push({
      id: "learn-good",
      tone: "success",
      category: "trend",
      title: `${(learnMinThisMonth / 60).toFixed(1)} שעות לימוד נוסף החודש`,
      detail: "מעבר לסדרים הקבועים.",
    });
  } else if (learnMinThisMonth < 60 && lessons.length > 0) {
    out.push({
      id: "learn-low",
      tone: "info",
      category: "recommendation",
      title: "מעט שעות לימוד נוסף החודש",
      detail: "הוסף רישום קצר השבוע כדי לשמור על קצב.",
    });
  }

  // ===== Smart insights =====
  const monthEntries = entriesInMonth(entries, y, m);

  // Streak
  const streak = currentDayStreak();
  if (streak >= 3) {
    out.push({
      id: "streak",
      tone: "success",
      category: "trend",
      title: `רצף של ${streak} ימים רצופים של סדר מלא`,
      detail: "המשך לשמור על הרצף — עקביות היא הכל.",
    });
  }

  // The weekday that goes wrong most often. Shared with the reminder rules,
  // which bring the daily nudge forward on that day — see notifications.ts.
  const weak = weakestLearningWeekday(entries);
  if (weak) {
    out.push({
      id: "weak-day",
      tone: "info",
      category: "opportunity",
      title: `יום ${WEEKDAY_NAMES[weak.day]} הוא היום החלש שלך`,
      detail: `רק ${Math.round(weak.rate * 100)}% מהסדרים ביום זה מלאים. תכנן מראש להגעה בזמן.`,
    });
  }

  // Seder 1 vs Seder 2 comparison this month
  if (monthEntries.length >= 6) {
    const s1 = monthEntries.filter((e) => e.seder === 1);
    const s2 = monthEntries.filter((e) => e.seder === 2);
    if (s1.length >= 3 && s2.length >= 3) {
      const avg = (list: SederEntry[]) =>
        list.reduce((s, e) => s + calcSeder(e).netMissingMin, 0) / list.length;
      const a1 = avg(s1),
        a2 = avg(s2);
      const diff = Math.abs(a1 - a2);
      if (diff >= 5) {
        const weaker = a1 > a2 ? "א׳" : "ב׳";
        out.push({
          id: "seder-gap",
          tone: "info",
          category: "opportunity",
          title: `סדר ${weaker} חלש יותר החודש`,
          detail: `פער של ${Math.round(diff)} דק׳ ממוצע לחסר. מיקוד בסדר זה ישפר את הציון.`,
        });
      }
    }
  }

  // Average lateness improvement
  if (cur.lateCount >= 2 && prev.lateCount >= 2) {
    const avgLateCur = cur.totalMissing / Math.max(1, cur.lateCount + cur.earlyDepCount);
    const avgLatePrev = prev.totalMissing / Math.max(1, prev.lateCount + prev.earlyDepCount);
    const d = Math.round(avgLatePrev - avgLateCur);
    if (d >= 3) {
      out.push({
        id: "punctual-up",
        tone: "success",
        category: "trend",
        title: `שיפור בממוצע האיחור: ${d} דק׳ פחות`,
        detail: "מגמת דיוק חיובית — כל דקה נחשבת.",
      });
    }
  }

  // Forecast-based warning
  const forecast = forecastMonthlyNetMissing();
  if (
    forecast !== null &&
    forecast >= goals.alertMissingMinPerMonth &&
    cur.netMissing < goals.alertMissingMinPerMonth
  ) {
    out.push({
      id: "forecast-alert",
      tone: "warning",
      category: "recommendation",
      title: `תחזית: ${fmtMin(forecast)} חסר עד סוף החודש`,
      detail: `אם הקצב יימשך, תחצה את סף ההתראה (${fmtMin(goals.alertMissingMinPerMonth)}).`,
    });
  }

  // Excused ratio insight
  if (cur.totalMissing >= 60) {
    const excusedPct = Math.round((cur.excused / cur.totalMissing) * 100);
    if (excusedPct >= 70) {
      out.push({
        id: "excused-high",
        tone: "info",
        category: "trend",
        title: `${excusedPct}% מהחסר החודש מוצדק`,
        detail: "רוב ההיעדרויות מסומנות כמוצדקות — תיעוד טוב.",
      });
    } else if (excusedPct < 20 && cur.entries >= 8) {
      out.push({
        id: "excused-low",
        tone: "info",
        category: "opportunity",
        title: "מעט חסר מסומן כמוצדק",
        detail: "אם היו סיבות מוצדקות, סמן אותן כדי לקבל תמונה מדויקת.",
      });
    }
  }

  // Learning framework dominance
  const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthLessons = lessons.filter((l) => l.date.slice(0, 7) === monthKey);
  if (monthLessons.length >= 5) {
    const byFw: Record<string, number> = {};
    for (const l of monthLessons) byFw[l.framework] = (byFw[l.framework] || 0) + l.minutes;
    const top = Object.entries(byFw).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      out.push({
        id: "learn-top-fw",
        tone: "info",
        category: "trend",
        title: `המסגרת המובילה: ${FRAMEWORK_LABELS[top[0] as keyof typeof FRAMEWORK_LABELS]}`,
        detail: `${fmtMin(top[1])} החודש במסגרת זו.`,
      });
    }
  }

  // How the arrival habit actually looks, in one sentence. This is the figure
  // a user can act on directly, unlike a 0–100 score.
  const offset = averageArrivalOffsetMin(monthEntries);
  if (offset !== null && monthEntries.length >= 6) {
    if (offset <= -3) {
      out.push({
        id: "arrive-early",
        tone: "success",
        category: "trend",
        title: `אתה מגיע בממוצע ${Math.abs(offset)} דק׳ לפני תחילת הסדר`,
        detail: "הגעה מוקדמת צוברת דקות בונוס שמקטינות את החסר.",
      });
    } else if (offset >= 4) {
      out.push({
        id: "arrive-late",
        tone: "warning",
        category: "opportunity",
        title: `אתה מגיע בממוצע ${offset} דק׳ אחרי תחילת הסדר`,
        detail: "יציאה מהבית עשר דקות מוקדם יותר מבטלת כמעט את כל החסר הזה.",
      });
    }
  }

  // What earlier arrivals would be worth this month — the recommendation with
  // an actual number attached.
  const opportunity = bonusOpportunityMin(monthEntries, 10);
  if (opportunity >= 60) {
    out.push({
      id: "bonus-opportunity",
      tone: "info",
      category: "recommendation",
      title: `הגעה 10 דק׳ מוקדם יותר הייתה שווה ${fmtMin(opportunity)} החודש`,
      detail: "כל הגעה לפני תחילת הסדר נצברת כבונוס, עד לגובה הסף שבהגדרות.",
    });
  }

  // The last week against the one before it — a month-long average hides a
  // week that has just gone wrong.
  const week = weekOverWeek(entries, now);
  if (week && Math.abs(week.diff) >= 20) {
    out.push(
      week.diff < 0
        ? {
            id: "week-better",
            tone: "success",
            category: "trend",
            title: `השבוע האחרון טוב ב-${fmtMin(Math.abs(week.diff))} מקודמו`,
            detail: `${fmtMin(week.recent)} חסרות בשבוע האחרון, מול ${fmtMin(week.previous)} בשבוע שלפניו.`,
          }
        : {
            id: "week-worse",
            tone: "warning",
            category: "opportunity",
            title: `השבוע האחרון חלש ב-${fmtMin(week.diff)} מקודמו`,
            detail: `${fmtMin(week.recent)} חסרות בשבוע האחרון, מול ${fmtMin(week.previous)} בשבוע שלפניו.`,
          },
    );
  }

  // Missing entries — detect gap
  if (monthEntries.length >= 4) {
    const daysSoFar = now.getDate();
    let expectedEntries = 0;
    for (let d = 1; d <= daysSoFar; d++) {
      const dt = new Date(y, m, d);
      if (isLearningDay(dt)) expectedEntries += 2;
    }
    const missingCount = Math.max(0, expectedEntries - monthEntries.length);
    if (missingCount >= 4) {
      out.push({
        id: "gaps",
        tone: "warning",
        category: "recommendation",
        title: `${missingCount} סדרים ללא רישום החודש`,
        detail: "השלם את הרישומים החסרים לתמונה מדויקת של המצב.",
      });
    }
  }

  return out;
}

export function forecastMonthlyNetMissing(): number | null {
  const all = getSederSnapshot();
  const now = new Date();
  const y = now.getFullYear(),
    m = now.getMonth();
  const list = entriesInMonth(all, y, m);
  if (list.length < 3) return null;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let learningDaysElapsed = 0,
    learningDaysTotal = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(y, m, d);
    if (!isLearningDay(dt)) continue;
    learningDaysTotal++;
    if (d <= now.getDate()) learningDaysElapsed++;
  }
  if (learningDaysTotal === 0 || learningDaysElapsed === 0) return null;

  let net = 0;
  for (const e of list) net += calcSeder(e).netMissingMin;
  return Math.round((net / learningDaysElapsed) * learningDaysTotal);
}

export function consistencyScore(): number {
  const all = getSederSnapshot();
  if (all.length < 5) return 0;
  const monthly: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const e of all) {
    const k = e.date.slice(0, 7);
    const c = calcSeder(e);
    monthly[k] = (monthly[k] || 0) + c.netMissingMin;
    counts[k] = (counts[k] || 0) + 1;
  }
  const rates = Object.keys(monthly).map((k) => monthly[k] / Math.max(1, counts[k]));
  if (rates.length < 2) return 0;
  const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
  const variance = rates.reduce((s, v) => s + (v - avg) ** 2, 0) / rates.length;
  const stddev = Math.sqrt(variance);
  // Lower stddev = higher consistency. Map stddev (0–60min) → 100–0.
  return Math.max(0, Math.min(100, Math.round(100 - (stddev / 60) * 100)));
}
