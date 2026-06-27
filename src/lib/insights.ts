import {
  type SederEntry, type LearningEntry,
  calcSeder, monthlySummary, attendanceScore, entriesInMonth, getSederSnapshot,
} from "./kollel-store";

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

  return out;
}

export function forecastMonthlyNetMissing(): number | null {
  const all = getSederSnapshot();
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const list = entriesInMonth(all, y, m);
  if (list.length < 3) return null;
  const day = now.getDate();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  let net = 0;
  for (const e of list) net += calcSeder(e).netMissingMin;
  return Math.round((net / Math.max(1, day)) * daysInMonth);
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
