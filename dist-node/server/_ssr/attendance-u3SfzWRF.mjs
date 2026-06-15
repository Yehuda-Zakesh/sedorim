import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { A as AppShell } from "./app-shell-B_F1yezE.mjs";
import { t as todayISO, u as useSeder, n as newId, d as calcSeder } from "./kollel-store-0dSUrOIp.mjs";
import { u as useSettings } from "./settings-store-Dn4IHvuo.mjs";
import { a as formatHebrewDate } from "./hebrew-calendar-BCWobOHK.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { _ as CalendarDays, g as Save, X, m as FileText, q as Check, s as TriangleAlert } from "../_libs/lucide-react.mjs";
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
function defaultsFor(seder, sederCfg) {
  return {
    arrival: seder === 1 ? sederCfg.s1Start : sederCfg.s2Start,
    departure: seder === 1 ? sederCfg.s1End : sederCfg.s2End,
    absent: false,
    ohevei: false,
    excusedAll: false,
    excusedMinutes: 0,
    excusedReason: "",
    manualAdjustMin: 0,
    note: ""
  };
}
function fromEntry(e) {
  return {
    arrival: e.arrival || "",
    departure: e.departure || "",
    absent: e.absent,
    ohevei: e.ohevei,
    excusedAll: e.excusedAll,
    excusedMinutes: e.excusedMinutes,
    excusedReason: e.excusedReason || "",
    manualAdjustMin: e.manualAdjustMin,
    note: e.note || ""
  };
}
function SederCard({
  num,
  date,
  existing,
  onSaved
}) {
  const {
    settings
  } = useSettings();
  const {
    upsert,
    remove
  } = useSeder();
  const [form, setForm] = reactExports.useState(() => existing ? fromEntry(existing) : defaultsFor(num, settings.seder));
  reactExports.useEffect(() => {
    setForm(existing ? fromEntry(existing) : defaultsFor(num, settings.seder));
  }, [existing?.id, num, date]);
  const preview = {
    id: existing?.id || newId(),
    date,
    seder: num,
    arrival: form.absent ? void 0 : form.arrival || void 0,
    departure: form.absent ? void 0 : form.departure || void 0,
    absent: form.absent,
    ohevei: form.ohevei,
    excusedAll: form.excusedAll,
    excusedMinutes: form.excusedMinutes,
    excusedReason: form.excusedReason || void 0,
    manualAdjustMin: form.manualAdjustMin,
    tags: existing?.tags || [],
    note: form.note || void 0
  };
  const calc = calcSeder(preview);
  const save = () => {
    try {
      upsert(preview);
      toast.success(`סדר ${num === 1 ? "א׳" : "ב׳"} נשמר`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    }
  };
  const startStr = num === 1 ? settings.seder.s1Start : settings.seder.s2Start;
  const endStr = num === 1 ? settings.seder.s1End : settings.seder.s2End;
  const tryOhevei = () => {
    if (!calc.isOhevei && form.ohevei) {
      toast.warning("לא ניתן לסמן אוהבי ה׳ — הסדר לא נכח מתחילתו ועד סופו");
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-base font-semibold", children: [
        "סדר ",
        num === 1 ? "א׳" : "ב׳",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-muted-foreground font-normal", children: [
          "(",
          startStr,
          "–",
          endStr,
          ")"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        existing && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => {
          remove(existing.id);
          toast("הרישום נמחק");
          onSaved();
        }, className: "text-xs text-muted-foreground hover:text-destructive", children: "מחק" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: save, className: "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "size-3.5" }),
          " שמור"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "שעת הגעה" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "time", disabled: form.absent, value: form.arrival, onChange: (e) => setForm({
          ...form,
          arrival: e.target.value
        }), className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm disabled:opacity-50" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "שעת יציאה" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "time", disabled: form.absent, value: form.departure, onChange: (e) => setForm({
          ...form,
          departure: e.target.value
        }), className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm disabled:opacity-50" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid grid-cols-3 gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => setForm({
        ...form,
        absent: !form.absent,
        ohevei: false
      }), className: `rounded-md border-2 px-3 py-2 text-xs font-medium transition ${form.absent ? "bg-status-absent/15 border-status-absent text-status-absent" : "border-border hover:border-status-absent"}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "size-3.5 inline ml-1" }),
        " היעדרות"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => setForm({
        ...form,
        excusedAll: !form.excusedAll
      }), className: `rounded-md border-2 px-3 py-2 text-xs font-medium transition ${form.excusedAll ? "bg-status-excused/15 border-status-excused text-status-excused" : "border-border hover:border-status-excused"}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "size-3.5 inline ml-1" }),
        " כל המוצדק"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => {
        const v = !form.ohevei;
        setForm({
          ...form,
          ohevei: v
        });
        setTimeout(tryOhevei, 0);
      }, disabled: form.absent, className: `rounded-md border-2 px-3 py-2 text-xs font-medium transition disabled:opacity-50 ${form.ohevei ? "bg-status-present/15 border-status-present text-status-present" : "border-border hover:border-status-present"}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "size-3.5 inline ml-1" }),
        " אוהבי ה׳"
      ] })
    ] }),
    !form.excusedAll && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "דקות מוצדקות (חלקי)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "number", min: 0, value: form.excusedMinutes, onChange: (e) => setForm({
          ...form,
          excusedMinutes: Math.max(0, +e.target.value || 0)
        }), className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "סיבה (אופציונלי)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: form.excusedReason, maxLength: 100, onChange: (e) => setForm({
          ...form,
          excusedReason: e.target.value
        }), className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "התאמה ידנית (דק׳, חתום)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "number", value: form.manualAdjustMin, onChange: (e) => setForm({
          ...form,
          manualAdjustMin: Math.max(-1440, Math.min(1440, +e.target.value || 0))
        }), className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "הערה" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: form.note, maxLength: 200, onChange: (e) => setForm({
          ...form,
          note: e.target.value
        }), className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 grid grid-cols-4 gap-2 text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Mini, { label: "חסר", value: calc.missingMin, tone: "text-destructive" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Mini, { label: "בונוס", value: calc.bonusMin, tone: "text-success" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Mini, { label: "מוצדק", value: calc.excusedMin, tone: "text-info" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Mini, { label: "נטו", value: calc.netMissingMin, tone: "text-foreground" })
    ] }),
    form.ohevei && !calc.isOhevei && !form.absent && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 text-xs text-warning flex items-center gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "size-3.5" }),
      " אוהבי ה׳ לא יוחל — שעת ההגעה/יציאה לא תואמות את גבולות הסדר."
    ] })
  ] });
}
function Mini({
  label,
  value,
  tone
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md border border-border p-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-muted-foreground", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `text-base font-bold tabular-nums ${tone}`, children: value })
  ] });
}
function AttendancePage() {
  const [date, setDate] = reactExports.useState(todayISO());
  const {
    entries
  } = useSeder();
  const dayEntries = entries.filter((e) => e.date === date);
  const e1 = dayEntries.find((x) => x.seder === 1);
  const e2 = dayEntries.find((x) => x.seder === 2);
  const heDate = formatHebrewDate(new Date(date));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(AppShell, { title: "נוכחות סדרים", subtitle: heDate, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-4 mb-4 flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarDays, { className: "size-4 text-muted-foreground" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "date", value: date, onChange: (e) => setDate(e.target.value), className: "rounded-md border border-input bg-card px-3 py-1.5 text-sm" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: heDate })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-2 gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SederCard, { num: 1, date, existing: e1, onSaved: () => {
      } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SederCard, { num: 2, date, existing: e2, onSaved: () => {
      } })
    ] })
  ] });
}
export {
  AttendancePage as component
};
