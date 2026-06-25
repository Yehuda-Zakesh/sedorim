import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { A as AppShell } from "./app-shell-B_F1yezE.mjs";
import { u as useSeder, a as useLearning, m as monthlySummary, b as attendanceScore, c as currentDayStreak, t as todayISO, d as calcSeder } from "./kollel-store-C33FLcbV.mjs";
import { a as formatHebrewDate, i as isBeinHazmanim } from "./hebrew-calendar-BCWobOHK.mjs";
import { u as useSettings } from "./settings-store-Dn4IHvuo.mjs";
import { T as Target, C as Clock, A as Award, F as Flame, k as BookOpen, l as ChevronLeft, B as Bell, s as TriangleAlert, w as Sparkles, a as TrendingUp, Z as Zap, p as CalendarCheck, o as FileDown, $ as DatabaseBackup } from "../_libs/lucide-react.mjs";
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
const toneStyles = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  destructive: "bg-destructive/10 text-destructive"
};
function fmtMin(m) {
  if (!m) return "0";
  const h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? `${h}:${String(r).padStart(2, "0")}` : `${r}`;
}
function Dashboard() {
  const {
    entries
  } = useSeder();
  const {
    items: lessons
  } = useLearning();
  const {
    settings
  } = useSettings();
  const today = /* @__PURE__ */ new Date();
  const y = today.getFullYear(), m = today.getMonth();
  const summary = monthlySummary(y, m);
  const score = attendanceScore(y, m);
  const streak = currentDayStreak();
  const hasToday = entries.some((e) => e.date === todayISO());
  const hebrewDate = formatHebrewDate(today);
  const beinHazmanim = isBeinHazmanim(today);
  const weekBars = [1, 2, 3, 4, 5].map((w) => {
    let expected = 0, netMissing = 0;
    for (const e of entries) {
      if (!e.date.startsWith(`${y}-${String(m + 1).padStart(2, "0")}`)) continue;
      const day = parseInt(e.date.slice(8, 10), 10);
      if (Math.ceil(day / 7) !== w) continue;
      const c = calcSeder(e);
      expected += c.sederLengthMin;
      netMissing += c.netMissingMin;
    }
    if (expected === 0) return 0;
    return Math.max(0, 100 - Math.round(netMissing / expected * 100));
  });
  const kpis = [{
    label: "ציון נוכחות החודש",
    value: `${score}`,
    delta: `יעד ${settings.goals.monthlyTarget}`,
    icon: Target,
    tone: "primary"
  }, {
    label: "דקות חסרות (נטו)",
    value: fmtMin(summary.netMissing),
    delta: `${summary.entries} סדרים נרשמו`,
    icon: Clock,
    tone: summary.netMissing > settings.seder.alertMissingMinPerMonth ? "destructive" : "info"
  }, {
    label: "סדרי אוהבי ה׳",
    value: summary.oheveiCount.toString(),
    delta: "החודש",
    icon: Award,
    tone: "success"
  }, {
    label: "רצף ימים",
    value: streak.toString(),
    delta: streak > 0 ? "ימים ללא חיסור" : "התחל היום",
    icon: Flame,
    tone: "warning"
  }];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(AppShell, { title: "לוח בקרה", subtitle: hebrewDate, actions: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/quick", className: "inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Zap, { className: "size-4" }),
      " כניסה מהירה"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/attendance", className: "inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarCheck, { className: "size-4" }),
      " רישום סדר"
    ] })
  ] }), children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("section", { className: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4", children: kpis.map((k) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-surface p-5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-medium text-muted-foreground", children: k.label }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-3xl font-bold tracking-tight tabular-nums", children: k.value }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[11px] text-muted-foreground", children: k.delta })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `size-10 rounded-lg grid place-items-center ${toneStyles[k.tone]}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(k.icon, { className: "size-5" }) })
    ] }) }, k.label)) }),
    beinHazmanim && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 card-surface p-4 flex items-center gap-3 border-r-4 border-r-info", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-9 rounded-md bg-info/10 text-info grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(BookOpen, { className: "size-4" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold", children: "בין הזמנים" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: 'מסגרת "ישיבת בין הזמנים" זמינה במסך לימוד נוסף.' })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/learning", className: "text-xs text-info hover:underline inline-flex items-center gap-1", children: [
        "לפתיחה ",
        /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronLeft, { className: "size-3" })
      ] })
    ] }),
    !hasToday && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 card-surface p-4 flex items-center gap-3 border-r-4 border-r-warning", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-9 rounded-md bg-warning/10 text-warning grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Bell, { className: "size-4" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold", children: "לא רשמת סדר היום" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: "סמן הגעה/יציאה כדי לעקוב אחר הנוכחות." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/attendance", className: "text-xs text-warning hover:underline inline-flex items-center gap-1", children: [
        "לרישום ",
        /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronLeft, { className: "size-3" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5 lg:col-span-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold mb-3", children: "פירוט החודש" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [{
          label: "איחורים",
          value: summary.lateCount,
          tone: "var(--status-late)"
        }, {
          label: "היעדרויות",
          value: summary.absenceCount,
          tone: "var(--status-absent)"
        }, {
          label: "יציאה מוקדמת",
          value: summary.earlyDepCount,
          tone: "var(--status-late)"
        }, {
          label: "בונוס (דק׳)",
          value: summary.bonus,
          tone: "var(--status-present)"
        }].map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "size-2.5 rounded-full", style: {
              backgroundColor: s.tone
            } }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: s.label })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-2xl font-bold tabular-nums", children: s.value })
        ] }, s.label)) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground mb-2", children: "ציון נוכחות לפי שבוע" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-end gap-2 h-28", children: weekBars.map((v, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex flex-col items-center gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full rounded-t-md bg-primary/80", style: {
              height: `${Math.max(v, 4)}%`,
              opacity: v ? 1 : 0.25
            } }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-muted-foreground", children: [
              "שבוע ",
              i + 1
            ] })
          ] }, i)) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold mb-3", children: "תזכורות" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "space-y-3", children: [
          !hasToday && /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `size-8 rounded-md grid place-items-center shrink-0 ${toneStyles.warning}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "size-4" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium", children: "חסר רישום להיום" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "סמן הגעה לסדר הנוכחי" })
            ] })
          ] }),
          summary.lateCount >= settings.goals.maxLatePerMonth && /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `size-8 rounded-md grid place-items-center shrink-0 ${toneStyles.destructive}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "size-4" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium", children: "חרגת ממכסת האיחורים" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-muted-foreground", children: [
                summary.lateCount,
                " מתוך ",
                settings.goals.maxLatePerMonth
              ] })
            ] })
          ] }),
          streak >= 5 && /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `size-8 rounded-md grid place-items-center shrink-0 ${toneStyles.success}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Flame, { className: "size-4" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm font-medium", children: [
                "רצף של ",
                streak,
                " ימים"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "המשך כך" })
            ] })
          ] }),
          lessons[0] && /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `size-8 rounded-md grid place-items-center shrink-0 ${toneStyles.info}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(BookOpen, { className: "size-4" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium", children: "שיעור אחרון" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-muted-foreground", children: [
                lessons[0].minutes,
                " דק׳ · ",
                lessons[0].date
              ] })
            ] })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5 lg:col-span-2 bg-gradient-to-l from-primary/5 to-transparent", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Sparkles, { className: "size-4 text-primary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold", children: "סיכום מהיר" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "space-y-2 text-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { className: "size-4 text-success mt-0.5 shrink-0" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              "ציון הנוכחות החודש: ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "tabular-nums", children: score }),
              " מתוך 100."
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Award, { className: "size-4 text-warning mt-0.5 shrink-0" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              "סדרים מלאים (אוהבי ה׳) החודש: ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "tabular-nums", children: summary.oheveiCount }),
              "."
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(BookOpen, { className: "size-4 text-info mt-0.5 shrink-0" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              "השלמת ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "tabular-nums", children: lessons.reduce((s, l) => s + l.minutes, 0) }),
              " דקות לימוד נוסף."
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold mb-3", children: "פעולות מהירות" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 gap-2", children: [{
          label: "כניסה מהירה",
          icon: Zap,
          to: "/quick"
        }, {
          label: "רישום סדר",
          icon: CalendarCheck,
          to: "/attendance"
        }, {
          label: "ייצוא דוח",
          icon: FileDown,
          to: "/reports"
        }, {
          label: "גיבוי",
          icon: DatabaseBackup,
          to: "/backup"
        }].map((a) => /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: a.to, className: "rounded-lg border border-border bg-card hover:bg-accent transition p-3 text-right", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(a.icon, { className: "size-4 text-primary mb-2" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-medium", children: a.label })
        ] }, a.label)) })
      ] })
    ] })
  ] });
}
export {
  Dashboard as component
};
