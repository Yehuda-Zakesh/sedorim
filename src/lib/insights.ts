import {
  type SederEntry, type LearningEntry,
  calcSeder, monthlySummary, attendanceScore, entriesInMonth, getSederSnapshot,
  currentDayStreak, FRAMEWORK_LABELS,
} from "./kollel-store";
import { isLearningDay } from "./hebrew-calendar";

export type Insight = {
  id: string;
  tone: "success" | "warning" | "info" | "destructive";
  title: string;
  detail: string;
  category: "trend" | "opportunity" | "recommendation";
};

function fmtMin(m: number): string {
  if (m < 60) return `${m} דק׳`;
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 ? `${h} שע׳` : `${h}:${String(r).padStart(2, "0")} שע׳`;
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
      id: "no-data", tone: "info", category: "recommendation",
      title: "אין רישומים החודש",
      detail: "פתח את מסך הנוכחות ורשום את הסדרים של היום.",
    });
    return out;
  }

  if (prev.entries >= 5) {
    const diff = score - prevScore;
    if (diff >= 3) out.push({
      id: "trend-up", tone: "success", category: "trend",
      title: `שיפור של ${diff} נקודות בציון הנוכחות`,
      detail: `החודש: ${score} · חודש קודם: ${prevScore}. המשך כך!`,
    });
    else if (diff <= -3) out.push({
      id: "trend-down", tone: "warning", category: "trend",
      title: `ירידה של ${Math.abs(diff)} נקודות בציון הנוכחות`,
      detail: `החודש: ${score} · חודש קודם: ${prevScore}.`,
    });
  }

  if (score >= goals.monthlyTarget) {
    out.push({
      id: "goal-met", tone: "success", category: "trend",
      title: "היעד החודשי הושג",
      detail: `${score} מתוך יעד ${goals.monthlyTarget}.`,
    });
  } else if (cur.entries >= 5) {
    out.push({
      id: "goal-gap", tone: "info", category: "opportunity",
      title: `${goals.monthlyTarget - score} נקודות עד היעד החודשי`,
      detail: `יעד: ${goals.monthlyTarget} · נוכחי: ${score}. הקפד על הגעה מוקדמת בימים הקרובים.`,
    });
  }

  if (cur.lateCount >= goals.maxLatePerMonth) {
    out.push({
      id: "late-limit", tone: "destructive", category: "recommendation",
      title: "מכסת איחורים חודשית נחצתה",
      detail: `${cur.lateCount} איחורים מתוך ${goals.maxLatePerMonth} מותרים.`,
    });
  } else if (cur.lateCount === goals.maxLatePerMonth - 1) {
    out.push({
      id: "late-warn", tone: "warning", category: "opportunity",
      title: "מתקרב למכסת איחורים",
      detail: `${cur.lateCount} מתוך ${goals.maxLatePerMonth}. הימנע מאיחור נוסף.`,
    });
  }

  if (cur.netMissing >= goals.alertMissingMinPerMonth) {
    out.push({
      id: "missing-alert", tone: "destructive", category: "recommendation",
      title: `${fmtMin(cur.netMissing)} חסרים החודש (נטו)`,
      detail: `סף ההתראה: ${fmtMin(goals.alertMissingMinPerMonth)}. שקול תכנון מחדש לשבוע הקרוב.`,
    });
  }

  if (cur.bonus >= 60) {
    out.push({
      id: "bonus-great", tone: "success", category: "trend",
      title: `${fmtMin(cur.bonus)} דקות בונוס נצברו`,
      detail: "הגעות מוקדמות עוזרות להקטין דקות חסרות.",
    });
  }

  if (cur.oheveiCount >= 5) {
    out.push({
      id: "ohevei", tone: "success", category: "trend",
      title: `${cur.oheveiCount} סדרים של "אוהבי ה׳"`,
      detail: "השקעה משמעותית — כל הכבוד.",
    });
  }

  if (cur.absenceCount >= 3) {
    out.push({
      id: "absences", tone: "warning", category: "opportunity",
      title: `${cur.absenceCount} היעדרויות החודש`,
      detail: "סמן היעדרויות כמוצדקות כשהן זכאיות לכך.",
    });
  }

  const learnMinThisMonth = lessons
    .filter((l) => l.date.slice(0, 7) === `${y}-${String(m + 1).padStart(2, "0")}`)
    .reduce((s, l) => s + l.minutes, 0);
  if (learnMinThisMonth >= 300) {
    out.push({
      id: "learn-good", tone: "success", category: "trend",
      title: `${(learnMinThisMonth / 60).toFixed(1)} שעות לימוד נוסף החודש`,
      detail: "מעבר לסדרים הקבועים.",
    });
  } else if (learnMinThisMonth < 60 && lessons.length > 0) {
    out.push({
      id: "learn-low", tone: "info", category: "recommendation",
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
      id: "streak", tone: "success", category: "trend",
      title: `רצף של ${streak} ימים רצופים של סדר מלא`,
      detail: "המשך לשמור על הרצף — עקביות היא הכל.",
    });
  }

  // Best day of week (last 60 entries)
  const recent = entries.slice(0, 120);
  if (recent.length >= 20) {
    const dayStats: { good: number; total: number }[] = Array.from({ length: 7 }, () => ({ good: 0, total: 0 }));
    for (const e of recent) {
      const d = new Date(e.date).getDay();
      const c = calcSeder(e);
      dayStats[d].total++;
      if (!e.absent && c.netMissingMin === 0) dayStats[d].good++;
    }
    const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
    let worst = -1, worstRate = 1;
    for (let i = 0; i < 7; i++) {
      if (dayStats[i].total < 3) continue;
      const rate = dayStats[i].good / dayStats[i].total;
      if (rate < worstRate) { worstRate = rate; worst = i; }
    }
    if (worst >= 0 && worstRate < 0.6) {
      out.push({
        id: "weak-day", tone: "info", category: "opportunity",
        title: `יום ${dayNames[worst]} הוא היום החלש שלך`,
        detail: `רק ${Math.round(worstRate * 100)}% מהסדרים ביום זה מלאים. תכנן מראש להגעה בזמן.`,
      });
    }
  }

  // Seder 1 vs Seder 2 comparison this month
  if (monthEntries.length >= 6) {
    const s1 = monthEntries.filter((e) => e.seder === 1);
    const s2 = monthEntries.filter((e) => e.seder === 2);
    if (s1.length >= 3 && s2.length >= 3) {
      const avg = (list: SederEntry[]) => list.reduce((s, e) => s + calcSeder(e).netMissingMin, 0) / list.length;
      const a1 = avg(s1), a2 = avg(s2);
      const diff = Math.abs(a1 - a2);
      if (diff >= 5) {
        const weaker = a1 > a2 ? "א׳" : "ב׳";
        out.push({
          id: "seder-gap", tone: "info", category: "opportunity",
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
        id: "punctual-up", tone: "success", category: "trend",
        title: `שיפור בממוצע האיחור: ${d} דק׳ פחות`,
        detail: "מגמת דיוק חיובית — כל דקה נחשבת.",
      });
    }
  }

  // Forecast-based warning
  const forecast = forecastMonthlyNetMissing();
  if (forecast !== null && forecast >= goals.alertMissingMinPerMonth && cur.netMissing < goals.alertMissingMinPerMonth) {
    out.push({
      id: "forecast-alert", tone: "warning", category: "recommendation",
      title: `תחזית: ${fmtMin(forecast)} חסר עד סוף החודש`,
      detail: `אם הקצב יימשך, תחצה את סף ההתראה (${fmtMin(goals.alertMissingMinPerMonth)}).`,
    });
  }

  // Excused ratio insight
  if (cur.totalMissing >= 60) {
    const excusedPct = Math.round((cur.excused / cur.totalMissing) * 100);
    if (excusedPct >= 70) {
      out.push({
        id: "excused-high", tone: "info", category: "trend",
        title: `${excusedPct}% מהחסר החודש מוצדק`,
        detail: "רוב ההיעדרויות מסומנות כמוצדקות — תיעוד טוב.",
      });
    } else if (excusedPct < 20 && cur.entries >= 8) {
      out.push({
        id: "excused-low", tone: "info", category: "opportunity",
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
        id: "learn-top-fw", tone: "info", category: "trend",
        title: `המסגרת המובילה: ${FRAMEWORK_LABELS[top[0] as keyof typeof FRAMEWORK_LABELS]}`,
        detail: `${fmtMin(top[1])} החודש במסגרת זו.`,
      });
    }
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
        id: "gaps", tone: "warning", category: "recommendation",
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
  const y = now.getFullYear(), m = now.getMonth();
  const list = entriesInMonth(all, y, m);
  if (list.length < 3) return null;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let learningDaysElapsed = 0, learningDaysTotal = 0;
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
