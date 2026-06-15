import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { A as AppShell } from "./app-shell-B_F1yezE.mjs";
import { u as useSeder, l as entriesByDate, m as monthlySummary, d as calcSeder } from "./kollel-store-0dSUrOIp.mjs";
import { f as formatHebrewMonthYear, h as hebrewFromGregorian, b as hebrewDayLetters } from "./hebrew-calendar-BCWobOHK.mjs";
import { y as ChevronRight, l as ChevronLeft } from "../_libs/lucide-react.mjs";
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
const months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const weekdays = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
function dayTone(list) {
  if (!list.length) return {
    color: "var(--status-none)",
    label: "ללא רישום"
  };
  let net = 0, hasOhevei = false, hasAbsent = false;
  for (const e of list) {
    const c = calcSeder(e);
    net += c.netMissingMin;
    if (c.isOhevei) hasOhevei = true;
    if (e.absent) hasAbsent = true;
  }
  if (hasAbsent) return {
    color: "var(--status-absent)",
    label: "היעדרות"
  };
  if (net === 0 && hasOhevei) return {
    color: "var(--status-present)",
    label: "אוהבי ה׳"
  };
  if (net === 0) return {
    color: "var(--status-present)",
    label: "נוכחות מלאה"
  };
  if (net < 30) return {
    color: "var(--status-late)",
    label: `${net} דק׳ חסר`
  };
  return {
    color: "var(--status-absent)",
    label: `${net} דק׳ חסר`
  };
}
function CalendarPage() {
  const today = /* @__PURE__ */ new Date();
  const [month, setMonth] = reactExports.useState(today.getMonth());
  const [year, setYear] = reactExports.useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = reactExports.useState(null);
  const {
    entries,
    remove
  } = useSeder();
  const byDate = reactExports.useMemo(() => entriesByDate(entries), [entries]);
  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({
    length: daysInMonth
  }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const goto = (delta) => {
    let m = month + delta, y = year;
    if (m < 0) {
      m = 11;
      y--;
    }
    if (m > 11) {
      m = 0;
      y++;
    }
    setMonth(m);
    setYear(y);
    setSelectedDate(null);
  };
  const summary = monthlySummary(year, month);
  const dateOf = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const selectedList = selectedDate ? byDate[selectedDate] || [] : [];
  const heMonth = formatHebrewMonthYear(hebrewFromGregorian(new Date(year, month, 15)));
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { title: "לוח שנה", subtitle: `${months[month]} ${year} · ${heMonth}`, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-4 gap-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5 lg:col-span-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => goto(-1), className: "size-9 rounded-md hover:bg-accent grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "size-4" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => goto(1), className: "size-9 rounded-md hover:bg-accent grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronLeft, { className: "size-4" }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-base font-semibold", children: [
          months[month],
          " ",
          year
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => {
          const d = /* @__PURE__ */ new Date();
          setMonth(d.getMonth());
          setYear(d.getFullYear());
        }, className: "text-xs rounded-md border border-border px-3 py-1.5 hover:bg-accent", children: "היום" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-7 gap-1.5 mb-2", children: weekdays.map((d) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center text-[11px] font-medium text-muted-foreground py-1", children: d }, d)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-7 gap-1.5", children: cells.map((day, i) => {
        if (!day) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "aspect-square" }, i);
        const dateStr = dateOf(day);
        const list = byDate[dateStr] || [];
        const t = dayTone(list);
        const isSelected = selectedDate === dateStr;
        const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
        const heDay = hebrewDayLetters(hebrewFromGregorian(new Date(year, month, day)).day);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => setSelectedDate(dateStr), className: ["aspect-square rounded-lg border p-1.5 flex flex-col items-stretch text-right transition", isSelected ? "ring-2 ring-primary border-primary" : "border-border hover:border-primary"].join(" "), style: list.length ? {
          backgroundColor: `color-mix(in oklch, ${t.color} 18%, var(--color-card))`,
          borderColor: isSelected ? "var(--color-primary)" : `color-mix(in oklch, ${t.color} 50%, transparent)`
        } : void 0, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] text-muted-foreground", children: heDay }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-xs font-semibold tabular-nums ${isToday ? "text-primary" : ""}`, children: day })
          ] }),
          list.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-auto self-end size-2 rounded-full", style: {
            backgroundColor: t.color
          } })
        ] }, i);
      }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
      selectedDate ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "תאריך נבחר" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-base font-semibold tabular-nums mt-0.5", children: selectedDate }),
        selectedList.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground mt-3", children: "אין רישומים" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-3 space-y-2", children: selectedList.map((e) => {
          const c = calcSeder(e);
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "rounded-md border border-border p-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm font-medium", children: [
                "סדר ",
                e.seder === 1 ? "א׳" : "ב׳"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => remove(e.id), className: "text-[10px] text-destructive hover:underline", children: "מחק" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground mt-1", children: e.absent ? "היעדרות" : `${e.arrival || "—"} → ${e.departure || "—"}` }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[11px] text-muted-foreground mt-1", children: [
              "חסר ",
              c.netMissingMin,
              " · בונוס ",
              c.bonusMin,
              c.isOhevei && " · אוהבי ה׳"
            ] })
          ] }, e.id);
        }) })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-surface p-5 text-xs text-muted-foreground", children: "לחץ על יום בלוח לפרטים." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold mb-3", children: "סיכום חודשי" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "space-y-2 text-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "רישומים", value: summary.entries }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "חסר נטו (דק׳)", value: summary.netMissing }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "מוצדק", value: summary.excused }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "בונוס", value: summary.bonus }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "איחורים", value: summary.lateCount }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "היעדרויות", value: summary.absenceCount }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "אוהבי ה׳", value: summary.oheveiCount })
        ] })
      ] })
    ] })
  ] }) });
}
function Row({
  label,
  value
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-center justify-between", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold tabular-nums", children: value })
  ] });
}
export {
  CalendarPage as component
};
