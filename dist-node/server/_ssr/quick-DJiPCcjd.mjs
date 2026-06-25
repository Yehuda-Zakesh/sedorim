import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { d as useNavigate, L as Link } from "../_libs/tanstack__react-router.mjs";
import { u as useSeder, t as todayISO, d as calcSeder, h as hhmmToMin, n as newId } from "./kollel-store-C33FLcbV.mjs";
import { u as useSettings } from "./settings-store-Dn4IHvuo.mjs";
import { a as formatHebrewDate } from "./hebrew-calendar-BCWobOHK.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { Z as Zap, p as CalendarCheck, m as FileText, q as Check, X, r as ArrowLeft } from "../_libs/lucide-react.mjs";
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
function nowHHMM() {
  const d = /* @__PURE__ */ new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function detectSeder(timeStr, cfg) {
  const t = hhmmToMin(timeStr) ?? hhmmToMin(nowHHMM());
  const s2 = hhmmToMin(cfg.s2Start) ?? 960;
  return t >= s2 - 30 ? 2 : 1;
}
function QuickPage() {
  const navigate = useNavigate();
  const {
    settings
  } = useSettings();
  const {
    upsert,
    entries
  } = useSeder();
  const [arrival, setArrival] = reactExports.useState(nowHHMM());
  const date = todayISO();
  const seder = detectSeder(arrival, settings.seder);
  const startStr = seder === 1 ? settings.seder.s1Start : settings.seder.s2Start;
  const endStr = seder === 1 ? settings.seder.s1End : settings.seder.s2End;
  const existing = entries.find((e) => e.date === date && e.seder === seder);
  const buildBase = (over = {}) => ({
    id: existing?.id || newId(),
    date,
    seder,
    arrival,
    departure: endStr,
    absent: false,
    ohevei: false,
    excusedAll: false,
    excusedMinutes: 0,
    manualAdjustMin: 0,
    tags: [],
    ...over
  });
  const save = (e, label) => {
    try {
      upsert(e);
      toast.success(`${label} נשמר · סדר ${seder === 1 ? "א׳" : "ב׳"}`);
    } catch (er) {
      toast.error(er instanceof Error ? er.message : "שגיאה");
    }
  };
  const calc = calcSeder(buildBase());
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-screen bg-background grid place-items-center p-6", dir: "rtl", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-md card-surface p-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-10 rounded-lg bg-primary text-primary-foreground grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Zap, { className: "size-5" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold", children: "כניסה מהירה" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: formatHebrewDate(/* @__PURE__ */ new Date()) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border p-3 mb-4 bg-muted/30", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "זוהה כסדר" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-base font-semibold", children: [
        seder === 1 ? "א׳" : "ב׳",
        " (",
        startStr,
        "–",
        endStr,
        ")"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "שעת הגעה" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "time", value: arrival, onChange: (e) => setArrival(e.target.value), className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-3 text-lg tabular-nums" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid grid-cols-2 gap-2 text-center text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md border border-border p-2", children: [
        "חסר: ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "tabular-nums", children: calc.missingMin })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md border border-border p-2", children: [
        "בונוס: ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "tabular-nums", children: calc.bonusMin })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => save(buildBase(), "סדר רגיל"), className: "mt-4 w-full rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarCheck, { className: "size-4 inline ml-1" }),
      " שמור הגעה (יציאה ברירת מחדל)"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid grid-cols-3 gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => save(buildBase({
        excusedAll: true
      }), "מוצדק"), className: "rounded-md border-2 border-status-excused bg-status-excused/10 text-status-excused py-2 text-xs font-medium", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "size-3.5 inline ml-1" }),
        " מוצדק"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => save(buildBase({
        ohevei: true
      }), "אוהבי ה׳"), className: "rounded-md border-2 border-status-present bg-status-present/10 text-status-present py-2 text-xs font-medium", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "size-3.5 inline ml-1" }),
        " אוהבי ה׳"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => save(buildBase({
        absent: true,
        arrival: void 0,
        departure: void 0
      }), "היעדרות"), className: "rounded-md border-2 border-status-absent bg-status-absent/10 text-status-absent py-2 text-xs font-medium", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "size-3.5 inline ml-1" }),
        " היעדרות"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/", className: "text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-3" }),
        " חזרה"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => navigate({
        to: "/attendance"
      }), className: "text-xs text-primary hover:underline", children: "פתח אפליקציה ראשית" })
    ] })
  ] }) });
}
export {
  QuickPage as component
};
