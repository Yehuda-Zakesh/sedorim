import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { A as AppShell } from "./app-shell-B_F1yezE.mjs";
import { u as useSeder, a as useLearning, b as attendanceScore, c as currentDayStreak, m as monthlySummary, j as entriesInMonth, d as calcSeder, k as getSederSnapshot } from "./kollel-store-C33FLcbV.mjs";
import { u as useSettings } from "./settings-store-Dn4IHvuo.mjs";
import { T as Target, w as Sparkles, a as TrendingUp, x as Lightbulb, b as TrendingDown } from "../_libs/lucide-react.mjs";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
function fmtMin(m) {
  if (m < 60) return `${m} דק׳`;
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 ? `${h} שע׳` : `${h}:${String(r).padStart(2, "0")} שע׳`;
}
function generateInsights(entries, lessons, goals) {
  const out = [];
  const now = /* @__PURE__ */ new Date();
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
      detail: "פתח את מסך הנוכחות ורשום את הסדרים של היום."
    });
    return out;
  }
  if (prev.entries >= 5) {
    const diff = score - prevScore;
    if (diff >= 3) out.push({
      id: "trend-up",
      tone: "success",
      category: "trend",
      title: `שיפור של ${diff} נקודות בציון הנוכחות`,
      detail: `החודש: ${score} · חודש קודם: ${prevScore}. המשך כך!`
    });
    else if (diff <= -3) out.push({
      id: "trend-down",
      tone: "warning",
      category: "trend",
      title: `ירידה של ${Math.abs(diff)} נקודות בציון הנוכחות`,
      detail: `החודש: ${score} · חודש קודם: ${prevScore}.`
    });
  }
  if (score >= goals.monthlyTarget) {
    out.push({
      id: "goal-met",
      tone: "success",
      category: "trend",
      title: "היעד החודשי הושג",
      detail: `${score} מתוך יעד ${goals.monthlyTarget}.`
    });
  } else if (cur.entries >= 5) {
    out.push({
      id: "goal-gap",
      tone: "info",
      category: "opportunity",
      title: `${goals.monthlyTarget - score} נקודות עד היעד החודשי`,
      detail: `יעד: ${goals.monthlyTarget} · נוכחי: ${score}. הקפד על הגעה מוקדמת בימים הקרובים.`
    });
  }
  if (cur.lateCount >= goals.maxLatePerMonth) {
    out.push({
      id: "late-limit",
      tone: "destructive",
      category: "recommendation",
      title: "מכסת איחורים חודשית נחצתה",
      detail: `${cur.lateCount} איחורים מתוך ${goals.maxLatePerMonth} מותרים.`
    });
  } else if (cur.lateCount === goals.maxLatePerMonth - 1) {
    out.push({
      id: "late-warn",
      tone: "warning",
      category: "opportunity",
      title: "מתקרב למכסת איחורים",
      detail: `${cur.lateCount} מתוך ${goals.maxLatePerMonth}. הימנע מאיחור נוסף.`
    });
  }
  if (cur.netMissing >= goals.alertMissingMinPerMonth) {
    out.push({
      id: "missing-alert",
      tone: "destructive",
      category: "recommendation",
      title: `${fmtMin(cur.netMissing)} חסרים החודש (נטו)`,
      detail: `סף ההתראה: ${fmtMin(goals.alertMissingMinPerMonth)}. שקול תכנון מחדש לשבוע הקרוב.`
    });
  }
  if (cur.bonus >= 60) {
    out.push({
      id: "bonus-great",
      tone: "success",
      category: "trend",
      title: `${fmtMin(cur.bonus)} דקות בונוס נצברו`,
      detail: "הגעות מוקדמות עוזרות להקטין דקות חסרות."
    });
  }
  if (cur.oheveiCount >= 5) {
    out.push({
      id: "ohevei",
      tone: "success",
      category: "trend",
      title: `${cur.oheveiCount} סדרים של "אוהבי ה׳"`,
      detail: "השקעה משמעותית — כל הכבוד."
    });
  }
  if (cur.absenceCount >= 3) {
    out.push({
      id: "absences",
      tone: "warning",
      category: "opportunity",
      title: `${cur.absenceCount} היעדרויות החודש`,
      detail: "סמן היעדרויות כמוצדקות כשהן זכאיות לכך."
    });
  }
  const learnMinThisMonth = lessons.filter((l) => l.date.slice(0, 7) === `${y}-${String(m + 1).padStart(2, "0")}`).reduce((s, l) => s + l.minutes, 0);
  if (learnMinThisMonth >= 300) {
    out.push({
      id: "learn-good",
      tone: "success",
      category: "trend",
      title: `${(learnMinThisMonth / 60).toFixed(1)} שעות לימוד נוסף החודש`,
      detail: "מעבר לסדרים הקבועים."
    });
  } else if (learnMinThisMonth < 60 && lessons.length > 0) {
    out.push({
      id: "learn-low",
      tone: "info",
      category: "recommendation",
      title: "מעט שעות לימוד נוסף החודש",
      detail: "הוסף שיעור קצר השבוע כדי לשמור על קצב."
    });
  }
  return out;
}
function forecastMonthlyNetMissing() {
  const all = getSederSnapshot();
  const now = /* @__PURE__ */ new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const list = entriesInMonth(all, y, m);
  if (list.length < 3) return null;
  const day = now.getDate();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  let net = 0;
  for (const e of list) net += calcSeder(e).netMissingMin;
  return Math.round(net / Math.max(1, day) * daysInMonth);
}
function consistencyScore() {
  const all = getSederSnapshot();
  if (all.length < 5) return 0;
  const monthly = {};
  const counts = {};
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
  return Math.max(0, Math.min(100, Math.round(100 - stddev / 60 * 100)));
}
const TONE = {
  success: {
    bg: "bg-success/10",
    text: "text-success",
    icon: TrendingUp
  },
  warning: {
    bg: "bg-warning/10",
    text: "text-warning",
    icon: TrendingDown
  },
  info: {
    bg: "bg-info/10",
    text: "text-info",
    icon: Lightbulb
  },
  destructive: {
    bg: "bg-destructive/10",
    text: "text-destructive",
    icon: TrendingDown
  }
};
const CATEGORY_LABEL = {
  trend: "מגמה",
  opportunity: "הזדמנות",
  recommendation: "המלצה"
};
function InsightsPage() {
  const {
    entries
  } = useSeder();
  const {
    items: lessons
  } = useLearning();
  const {
    settings
  } = useSettings();
  const insights = generateInsights(entries, lessons, {
    monthlyTarget: settings.goals.monthlyTarget,
    maxLatePerMonth: settings.goals.maxLatePerMonth,
    alertMissingMinPerMonth: settings.seder.alertMissingMinPerMonth
  });
  const forecast = forecastMonthlyNetMissing();
  const consistency = consistencyScore();
  const now = /* @__PURE__ */ new Date();
  const overall = attendanceScore(now.getFullYear(), now.getMonth());
  const streak = currentDayStreak();
  const grouped = {
    trend: [],
    opportunity: [],
    recommendation: []
  };
  for (const i of insights) grouped[i.category].push(i);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(AppShell, { title: "תובנות חכמות", subtitle: "ניתוח אוטומטי של הנתונים שלך", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(KpiCard, { label: "ציון החודש", value: `${overall}`, icon: Target }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(KpiCard, { label: "רצף ימים", value: streak.toString(), icon: Sparkles }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(KpiCard, { label: "תחזית חסר חודשי", value: forecast !== null ? `${forecast}` : "—", icon: TrendingUp }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(KpiCard, { label: "ציון עקביות", value: `${consistency}`, icon: Lightbulb })
    ] }),
    insights.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-10 text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Sparkles, { className: "size-8 text-primary mx-auto mb-3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-base font-semibold", children: "אין עדיין מספיק נתונים" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground mt-1", children: "המשך לרשום סדרים כדי לקבל תובנות." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-4", children: ["trend", "opportunity", "recommendation"].map((cat) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-sm font-semibold mb-3 flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Sparkles, { className: "size-4 text-primary" }),
        " ",
        CATEGORY_LABEL[cat]
      ] }),
      grouped[cat].length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: "אין כרגע" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-3", children: grouped[cat].map((i) => {
        const t = TONE[i.tone];
        return /* @__PURE__ */ jsxRuntimeExports.jsx("li", { className: "rounded-lg border border-border p-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `size-8 rounded-md grid place-items-center shrink-0 ${t.bg} ${t.text}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(t.icon, { className: "size-4" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium", children: i.title }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground mt-0.5", children: i.detail })
          ] })
        ] }) }, i.id);
      }) })
    ] }, cat)) })
  ] });
}
function KpiCard({
  label,
  value,
  icon: Icon
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-surface p-5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-3xl font-bold tabular-nums", children: value })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-10 rounded-lg bg-primary/10 text-primary grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "size-5" }) })
  ] }) });
}
export {
  InsightsPage as component
};
