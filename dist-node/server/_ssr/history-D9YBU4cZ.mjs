import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { A as AppShell } from "./app-shell-B_F1yezE.mjs";
import { u as useSeder, d as calcSeder, m as monthlySummary } from "./kollel-store-C33FLcbV.mjs";
import { a as formatHebrewDate } from "./hebrew-calendar-BCWobOHK.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { d as Search, i as Trash2 } from "../_libs/lucide-react.mjs";
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
function HistoryPage() {
  const {
    entries,
    remove
  } = useSeder();
  const [q, setQ] = reactExports.useState("");
  const [sederFilter, setSederFilter] = reactExports.useState("all");
  const [typeFilter, setTypeFilter] = reactExports.useState("all");
  const [excusedFilter, setExcusedFilter] = reactExports.useState("all");
  const [month, setMonth] = reactExports.useState("");
  const filtered = entries.filter((e) => {
    if (sederFilter !== "all" && String(e.seder) !== sederFilter) return false;
    if (month && !e.date.startsWith(month)) return false;
    const c = calcSeder(e);
    if (typeFilter === "late" && !c.isLate) return false;
    if (typeFilter === "absent" && !e.absent) return false;
    if (typeFilter === "early" && !c.isEarlyDeparture) return false;
    if (typeFilter === "ohevei" && !c.isOhevei) return false;
    if (typeFilter === "bonus" && c.bonusMin === 0) return false;
    if (excusedFilter === "excused" && c.excusedMin === 0) return false;
    if (excusedFilter === "non-excused" && c.excusedMin > 0) return false;
    if (q && !(e.date.includes(q) || (e.note || "").includes(q) || (e.excusedReason || "").includes(q) || (e.tags || []).some((t) => t.includes(q)))) return false;
    return true;
  });
  const now = /* @__PURE__ */ new Date();
  const summary = monthlySummary(now.getFullYear(), now.getMonth());
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(AppShell, { title: "היסטוריה", subtitle: `${entries.length} רישומים סה״כ`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-4 mb-4 space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "חיפוש לפי תאריך, הערה, סיבה או תגית...", className: "w-full rounded-md border border-input bg-card pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2 text-xs", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: sederFilter, onChange: (e) => setSederFilter(e.target.value), className: "rounded-md border border-input bg-card px-2 py-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "all", children: "כל הסדרים" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "1", children: "סדר א׳" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "2", children: "סדר ב׳" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: typeFilter, onChange: (e) => setTypeFilter(e.target.value), className: "rounded-md border border-input bg-card px-2 py-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "all", children: "כל הסוגים" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "late", children: "איחור" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "absent", children: "היעדרות" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "early", children: "יציאה מוקדמת" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "ohevei", children: "אוהבי ה׳" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "bonus", children: "בונוס" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: excusedFilter, onChange: (e) => setExcusedFilter(e.target.value), className: "rounded-md border border-input bg-card px-2 py-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "all", children: "הכל" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "excused", children: "מוצדק" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "non-excused", children: "לא מוצדק" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "month", value: month, onChange: (e) => setMonth(e.target.value), className: "rounded-md border border-input bg-card px-2 py-1.5" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface overflow-x-auto", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm min-w-[800px]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-muted/50 text-xs text-muted-foreground", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-3 font-medium", children: "תאריך" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-3 font-medium", children: "סדר" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-3 font-medium", children: "הגעה" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-3 font-medium", children: "יציאה" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-3 font-medium", children: "חסר" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-3 font-medium", children: "בונוס" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-3 font-medium", children: "מוצדק" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-3 font-medium", children: "סטטוס" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-3 w-12" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: filtered.map((e) => {
          const c = calcSeder(e);
          const tags = [];
          if (e.absent) tags.push("היעדרות");
          if (c.isLate) tags.push("איחור");
          if (c.isEarlyDeparture) tags.push("יצא מוקדם");
          if (c.isOhevei) tags.push("אוהבי ה׳");
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-t border-border hover:bg-accent/40", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-3 tabular-nums", title: formatHebrewDate(new Date(e.date)), children: e.date }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-3", children: e.seder === 1 ? "א׳" : "ב׳" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-3 tabular-nums", children: e.absent ? "—" : e.arrival || "—" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-3 tabular-nums", children: e.absent ? "—" : e.departure || "—" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-3 tabular-nums", children: c.netMissingMin }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-3 tabular-nums", children: c.bonusMin }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-3 tabular-nums", children: c.excusedMin }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-3 text-xs text-muted-foreground", children: tags.join(", ") || "מלא" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => {
              remove(e.id);
              toast("נמחק");
            }, className: "size-7 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "size-3.5" }) }) })
          ] }, e.id);
        }) })
      ] }),
      !filtered.length && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-10 text-center text-sm text-muted-foreground", children: "לא נמצאו רישומים" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5 mt-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold mb-3", children: "סיכום החודש הנוכחי" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3 text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SumRow, { label: "חסר סה״כ", value: summary.totalMissing }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SumRow, { label: "מוצדק", value: summary.excused }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SumRow, { label: "לא מוצדק", value: summary.nonExcused }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SumRow, { label: "חסר נטו", value: summary.netMissing }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SumRow, { label: "בונוס", value: summary.bonus }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SumRow, { label: "איחורים", value: summary.lateCount }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SumRow, { label: "היעדרויות", value: summary.absenceCount }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SumRow, { label: "אוהבי ה׳", value: summary.oheveiCount })
      ] })
    ] })
  ] });
}
function SumRow({
  label,
  value
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md border border-border p-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-muted-foreground", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-bold tabular-nums", children: value })
  ] });
}
export {
  HistoryPage as component
};
