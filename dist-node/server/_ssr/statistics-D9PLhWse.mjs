import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { A as AppShell } from "./app-shell-B_F1yezE.mjs";
import { u as useSeder, a as useLearning, m as monthlySummary, b as attendanceScore, c as currentDayStreak, d as calcSeder } from "./kollel-store-0dSUrOIp.mjs";
import { h as hebrewFromGregorian, f as formatHebrewMonthYear } from "./hebrew-calendar-BCWobOHK.mjs";
import { T as Target, A as Award, F as Flame, a as TrendingUp, b as TrendingDown } from "../_libs/lucide-react.mjs";
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
import "./settings-store-Dn4IHvuo.mjs";
function StatisticsPage() {
  const {
    entries
  } = useSeder();
  const {
    items: lessons
  } = useLearning();
  const now = /* @__PURE__ */ new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(y, m - i, 1);
    const ms = monthlySummary(d.getFullYear(), d.getMonth());
    const mid = new Date(d.getFullYear(), d.getMonth(), 15);
    const h = hebrewFromGregorian(mid);
    months.push({
      label: d.toLocaleDateString("he-IL", {
        month: "short"
      }),
      hebLabel: formatHebrewMonthYear(h),
      score: attendanceScore(d.getFullYear(), d.getMonth()),
      net: ms.netMissing
    });
  }
  const curScore = attendanceScore(y, m);
  const yoyScore = attendanceScore(y - 1, m);
  const streak = currentDayStreak();
  const bestMonth = [...months].sort((a, b) => b.score - a.score)[0];
  const weekday = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"].map((d) => ({
    d,
    net: 0,
    count: 0
  }));
  for (const e of entries) {
    const wd = new Date(e.date).getDay();
    weekday[wd].net += calcSeder(e).netMissingMin;
    weekday[wd].count++;
  }
  const heat = Array.from({
    length: 6
  }, () => Array(7).fill(-1));
  const today = /* @__PURE__ */ new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 6 * 7 + 1);
  for (let w = 0; w < 6; w++) {
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + w * 7 + d);
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const list = entries.filter((e) => e.date === iso);
      if (!list.length) {
        heat[w][d] = -1;
        continue;
      }
      const net = list.reduce((s, e) => s + calcSeder(e).netMissingMin, 0);
      heat[w][d] = net === 0 ? 4 : net < 15 ? 3 : net < 30 ? 2 : net < 60 ? 1 : 0;
    }
  }
  const totalLearnHours = (lessons.reduce((s, l) => s + l.minutes, 0) / 60).toFixed(1);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(AppShell, { title: "סטטיסטיקות", subtitle: "ניתוח אישי של מגמות נוכחות", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Kpi, { label: "ציון החודש", value: `${curScore}`, icon: Target, trend: `${curScore - yoyScore >= 0 ? "+" : ""}${curScore - yoyScore} מול אשתקד`, up: curScore >= yoyScore }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Kpi, { label: "חודש מצטיין", value: bestMonth?.hebLabel || "—", icon: Award, trend: `${bestMonth?.score || 0} נק׳`, up: true }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Kpi, { label: "רצף ימים", value: streak.toString(), icon: Flame, trend: "ימים", up: streak > 0 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Kpi, { label: "שעות לימוד", value: totalLearnHours, icon: TrendingUp, trend: "סך הכל", up: true })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5 lg:col-span-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold mb-1", children: "מגמת ציון 12 חודשים" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mb-5", children: "ציון 0–100" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative h-56", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 grid grid-rows-4", children: [100, 75, 50, 25].map((v) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-border/60 text-[10px] text-muted-foreground -translate-y-2", children: v }, v)) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 flex items-end gap-2 pr-8", children: months.map((mo, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex flex-col items-center gap-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] tabular-nums", children: mo.score }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full rounded-t-md bg-gradient-to-t from-primary to-primary/60", style: {
              height: `${mo.score}%`
            } }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-muted-foreground", children: mo.label })
          ] }, i)) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold mb-1", children: "חסר נטו לפי יום בשבוע" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mb-4", children: "ממוצע דקות" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-3", children: weekday.map((w) => {
          const avg = w.count ? Math.round(w.net / w.count) : 0;
          const max = Math.max(1, ...weekday.map((x) => x.count ? x.net / x.count : 0));
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-xs mb-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: w.d }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tabular-nums font-medium", children: avg })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-2 rounded-full bg-muted overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full rounded-full bg-primary", style: {
              width: `${avg / max * 100}%`
            } }) })
          ] }, w.d);
        }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 card-surface p-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold mb-1", children: "מפת חום נוכחות — 6 השבועות האחרונים" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mb-5", children: "צבע כהה = פחות חסר" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-7 gap-1.5 max-w-md", children: heat.flat().map((v, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "aspect-square rounded", style: {
        backgroundColor: v < 0 ? "var(--color-muted)" : `color-mix(in oklch, var(--color-status-present) ${(v + 1) * 18}%, var(--color-muted))`
      } }, i)) })
    ] })
  ] });
}
function Kpi({
  label,
  value,
  icon: Icon,
  trend,
  up
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-surface p-5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-3xl font-bold tabular-nums break-words leading-tight", style: {
        fontSize: value.length > 8 ? "1.25rem" : void 0
      }, children: value }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `mt-1 text-[11px] inline-flex items-center gap-1 ${up ? "text-success" : "text-destructive"}`, children: [
        up ? /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { className: "size-3" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingDown, { className: "size-3" }),
        " ",
        trend
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-10 rounded-lg bg-primary/10 text-primary grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "size-5" }) })
  ] }) });
}
export {
  StatisticsPage as component
};
