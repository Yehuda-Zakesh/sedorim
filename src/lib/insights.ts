import {
  type AttendanceRecord, type LearningItem,
  countByStatus, attendanceRate, currentStreak, inMonth,
} from "./tracker-store";

export type Insight = {
  id: string;
  tone: "success" | "warning" | "info" | "destructive";
  title: string;
  detail: string;
  category: "trend" | "opportunity" | "recommendation";
};

export function generateInsights(
  records: AttendanceRecord[],
  lessons: LearningItem[],
  goals: { monthlyTarget: number; maxLatePerMonth: number },
): Insight[] {
  const out: Insight[] = [];
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const cur = inMonth(records, y, m);
  const prev = inMonth(records, m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1);
  const curRate = attendanceRate(cur);
  const prevRate = attendanceRate(prev);
  const streak = currentStreak(records);
  const curCounts = countByStatus(cur);

  if (cur.length >= 3 && prev.length >= 3) {
    const diff = curRate - prevRate;
    if (diff >= 3) {
      out.push({
        id: "trend-up",
        tone: "success",
        title: `שיפור של ${diff} נקודות בנוכחות`,
        detail: `החודש: ${curRate}% · חודש קודם: ${prevRate}%. המשך כך!`,
        category: "trend",
      });
    } else if (diff <= -3) {
      out.push({
        id: "trend-down",
        tone: "warning",
        title: `ירידה של ${Math.abs(diff)} נקודות בנוכחות`,
        detail: `החודש: ${curRate}% · חודש קודם: ${prevRate}%. כדאי לבדוק מה השתנה.`,
        category: "trend",
      });
    }
  }

  if (curRate < goals.monthlyTarget && cur.length >= 5) {
    out.push({
      id: "goal-gap",
      tone: "info",
      title: `${goals.monthlyTarget - curRate} נקודות עד היעד החודשי`,
      detail: `היעד: ${goals.monthlyTarget}%. תכנן יום נוכחות נוסף לשבוע הקרוב לסגירת הפער.`,
      category: "opportunity",
    });
  } else if (curRate >= goals.monthlyTarget && cur.length >= 5) {
    out.push({
      id: "goal-met",
      tone: "success",
      title: "היעד החודשי הושג",
      detail: `${curRate}% מתוך יעד של ${goals.monthlyTarget}%.`,
      category: "trend",
    });
  }

  if (curCounts.late >= goals.maxLatePerMonth) {
    out.push({
      id: "late-limit",
      tone: "destructive",
      title: "מכסת איחורים חודשית נחצתה",
      detail: `${curCounts.late} איחורים מתוך ${goals.maxLatePerMonth} מותרים. שקול הקדמת היציאה ב-10 דקות.`,
      category: "recommendation",
    });
  } else if (curCounts.late === goals.maxLatePerMonth - 1) {
    out.push({
      id: "late-warn",
      tone: "warning",
      title: "מתקרב למכסת איחורים",
      detail: `${curCounts.late} מתוך ${goals.maxLatePerMonth}. הימנע מאיחור נוסף החודש.`,
      category: "opportunity",
    });
  }

  if (streak >= 7) {
    out.push({
      id: "streak",
      tone: "success",
      title: `רצף מצוין של ${streak} ימים`,
      detail: "עקביות גבוהה. שמור על השגרה הנוכחית.",
      category: "trend",
    });
  } else if (streak === 0 && records.length > 0) {
    out.push({
      id: "streak-broken",
      tone: "info",
      title: "התחל רצף חדש היום",
      detail: "סמן נוכחות כדי לפתוח רצף.",
      category: "recommendation",
    });
  }

  const weekdayPresence: number[] = Array(7).fill(0);
  const weekdayTotal: number[] = Array(7).fill(0);
  for (const r of records) {
    const d = new Date(r.date).getDay();
    weekdayTotal[d]++;
    if (r.status === "present" || r.status === "excused") weekdayPresence[d]++;
  }
  let worstDay = -1, worstRate = 101;
  const names = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  for (let i = 0; i < 7; i++) {
    if (weekdayTotal[i] >= 3) {
      const rate = (weekdayPresence[i] / weekdayTotal[i]) * 100;
      if (rate < worstRate) { worstRate = rate; worstDay = i; }
    }
  }
  if (worstDay >= 0 && worstRate < 80) {
    out.push({
      id: "weak-day",
      tone: "warning",
      title: `יום ${names[worstDay]} חלש בנוכחות`,
      detail: `ממוצע נוכחות ב${names[worstDay]}: ${Math.round(worstRate)}%. שקול תכנון מוקדם לימים אלו.`,
      category: "opportunity",
    });
  }

  const learnMinThisMonth = lessons
    .filter((l) => l.date.slice(0, 7) === `${y}-${String(m + 1).padStart(2, "0")}`)
    .reduce((s, l) => s + l.minutes, 0);
  if (learnMinThisMonth >= 300) {
    out.push({
      id: "learn-good",
      tone: "success",
      title: `${(learnMinThisMonth / 60).toFixed(1)} שעות לימוד נוסף החודש`,
      detail: "השקעה משמעותית — כל הכבוד.",
      category: "trend",
    });
  } else if (learnMinThisMonth < 60 && lessons.length > 0) {
    out.push({
      id: "learn-low",
      tone: "info",
      title: "מעט שעות לימוד נוסף החודש",
      detail: "הוסף שיעור קצר השבוע כדי לשמור על קצב.",
      category: "recommendation",
    });
  }

  return out;
}

export function forecastMonthRate(records: AttendanceRecord[]): number | null {
  const now = new Date();
  const cur = inMonth(records, now.getFullYear(), now.getMonth());
  if (cur.length < 3) return null;
  const rate = attendanceRate(cur);
  // simple persistence forecast with bias toward yearly average
  const all = attendanceRate(records);
  return Math.round(rate * 0.7 + all * 0.3);
}

export function consistencyScore(records: AttendanceRecord[]): number {
  if (records.length < 5) return 0;
  const monthly: Record<string, number[]> = {};
  for (const r of records) {
    const k = r.date.slice(0, 7);
    monthly[k] = monthly[k] || [];
    monthly[k].push(r.status === "present" || r.status === "excused" ? 1 : 0);
  }
  const rates = Object.values(monthly).map((arr) => arr.reduce((s, v) => s + v, 0) / arr.length);
  if (rates.length < 2) return Math.round(rates[0] * 100);
  const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
  const variance = rates.reduce((s, v) => s + (v - avg) ** 2, 0) / rates.length;
  const stddev = Math.sqrt(variance);
  return Math.max(0, Math.round((1 - stddev) * 100));
}
