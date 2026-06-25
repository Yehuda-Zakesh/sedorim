import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { A as AppShell } from "./app-shell-B_F1yezE.mjs";
import { u as useSettings, a as updateSettings, r as resetOnboarding, D as DEFAULT_SETTINGS } from "./settings-store-Dn4IHvuo.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { U as User, C as Clock, T as Target, B as Bell, P as Palette, c as Type, G as Globe, S as Shield, D as Database, d as Search, e as ChevronDown, f as Contrast, R as RotateCcw } from "../_libs/lucide-react.mjs";
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
const SECTIONS = [{
  id: "profile",
  label: "פרופיל אישי",
  icon: User
}, {
  id: "seder",
  label: "שעות סדרים",
  icon: Clock
}, {
  id: "goals",
  label: "יעדים והתראות",
  icon: Target
}, {
  id: "notifications",
  label: "התראות",
  icon: Bell
}, {
  id: "appearance",
  label: "מראה ועיצוב",
  icon: Palette
}, {
  id: "dashboard",
  label: "לוח בקרה",
  icon: Type
}, {
  id: "language",
  label: "שפה ואזור",
  icon: Globe
}, {
  id: "privacy",
  label: "פרטיות",
  icon: Shield
}, {
  id: "data",
  label: "נתונים וגיבוי",
  icon: Database
}];
function SettingsPage() {
  const {
    settings,
    update
  } = useSettings();
  const [open, setOpen] = reactExports.useState("seder");
  const [q, setQ] = reactExports.useState("");
  const visible = SECTIONS.filter((s) => s.label.includes(q));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(AppShell, { title: "הגדרות", subtitle: "העדפות אישיות נשמרות אוטומטית", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-3 mb-4 relative", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute right-5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "חיפוש בהגדרות...", className: "w-full rounded-md bg-transparent pr-9 pl-3 py-1.5 text-sm focus:outline-none" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: visible.map((s) => {
      const isOpen = open === s.id;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface overflow-hidden", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => setOpen(isOpen ? null : s.id), className: "w-full flex items-center gap-3 px-5 py-4 text-right hover:bg-accent/40 transition", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-9 rounded-md bg-primary/10 text-primary grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(s.icon, { className: "size-4" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 text-sm font-semibold", children: s.label }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: `size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}` })
        ] }),
        isOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-5 pb-5 border-t border-border pt-4 space-y-3", children: [
          s.id === "profile" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "שם תצוגה", value: settings.profile.name, onChange: (v) => update({
              profile: {
                ...settings.profile,
                name: v
              }
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "כולל / קבוצה", value: settings.profile.classroom, onChange: (v) => update({
              profile: {
                ...settings.profile,
                classroom: v
              }
            }) })
          ] }),
          s.id === "seder" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(TimeField, { label: "סדר א׳ — תחילה", value: settings.seder.s1Start, onChange: (v) => update({
                seder: {
                  ...settings.seder,
                  s1Start: v
                }
              }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(TimeField, { label: "סדר א׳ — סיום", value: settings.seder.s1End, onChange: (v) => update({
                seder: {
                  ...settings.seder,
                  s1End: v
                }
              }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(TimeField, { label: "סדר ב׳ — תחילה", value: settings.seder.s2Start, onChange: (v) => update({
                seder: {
                  ...settings.seder,
                  s2Start: v
                }
              }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(TimeField, { label: "סדר ב׳ — סיום", value: settings.seder.s2End, onChange: (v) => update({
                seder: {
                  ...settings.seder,
                  s2End: v
                }
              }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(NumberField, { label: "סף בונוס להגעה מוקדמת (דק׳)", min: 0, max: 60, value: settings.seder.bonusThresholdMin, onChange: (v) => update({
              seder: {
                ...settings.seder,
                bonusThresholdMin: v
              }
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(NumberField, { label: "סף התראה לדקות חסרות בחודש", min: 0, max: 1440, value: settings.seder.alertMissingMinPerMonth, onChange: (v) => update({
              seder: {
                ...settings.seder,
                alertMissingMinPerMonth: v
              }
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectField, { label: "ברירת מחדל לשעת יציאה", value: settings.seder.defaultDeparture, options: [{
              v: "seder_end",
              l: "סוף הסדר"
            }, {
              v: "blank",
              l: "ריק"
            }], onChange: (v) => update({
              seder: {
                ...settings.seder,
                defaultDeparture: v
              }
            }) })
          ] }),
          s.id === "goals" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(NumberField, { label: "יעד ציון נוכחות חודשי", min: 50, max: 100, value: settings.goals.monthlyTarget, onChange: (v) => update({
              goals: {
                ...settings.goals,
                monthlyTarget: v
              }
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(NumberField, { label: "מקסימום איחורים בחודש", min: 0, max: 31, value: settings.goals.maxLatePerMonth, onChange: (v) => update({
              goals: {
                ...settings.goals,
                maxLatePerMonth: v
              }
            }) })
          ] }),
          s.id === "notifications" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Toggle, { label: "תזכורת יומית", on: settings.notifications.dailyReminder, onChange: (v) => update({
              notifications: {
                ...settings.notifications,
                dailyReminder: v
              }
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Toggle, { label: "התראה כשמתקרב למכסת איחורים", on: settings.notifications.latenessAlert, onChange: (v) => update({
              notifications: {
                ...settings.notifications,
                latenessAlert: v
              }
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Toggle, { label: "סיכום שבועי", on: settings.notifications.weeklySummary, onChange: (v) => update({
              notifications: {
                ...settings.notifications,
                weeklySummary: v
              }
            }) })
          ] }),
          s.id === "appearance" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectField, { label: "גודל גופן", value: settings.appearance.fontSize, options: [{
              v: "small",
              l: "קטן"
            }, {
              v: "normal",
              l: "רגיל"
            }, {
              v: "large",
              l: "גדול"
            }, {
              v: "xlarge",
              l: "גדול מאוד"
            }], onChange: (v) => update({
              appearance: {
                ...settings.appearance,
                fontSize: v
              }
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Toggle, { label: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Contrast, { className: "size-4" }),
              " ניגודיות גבוהה"
            ] }), on: settings.appearance.highContrast, onChange: (v) => update({
              appearance: {
                ...settings.appearance,
                highContrast: v
              }
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Toggle, { label: "תצוגה צפופה", on: settings.appearance.compactMode, onChange: (v) => update({
              appearance: {
                ...settings.appearance,
                compactMode: v
              }
            }) })
          ] }),
          s.id === "dashboard" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Toggle, { label: "הצג תובנות", on: settings.dashboard.showInsights, onChange: (v) => update({
              dashboard: {
                ...settings.dashboard,
                showInsights: v
              }
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Toggle, { label: "הצג תזכורות", on: settings.dashboard.showReminders, onChange: (v) => update({
              dashboard: {
                ...settings.dashboard,
                showReminders: v
              }
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Toggle, { label: "הצג פעולות מהירות", on: settings.dashboard.showQuickActions, onChange: (v) => update({
              dashboard: {
                ...settings.dashboard,
                showQuickActions: v
              }
            }) })
          ] }),
          s.id === "language" && /* @__PURE__ */ jsxRuntimeExports.jsx(SelectField, { label: "פורמט תאריך", value: settings.language.dateFormat, options: [{
            v: "iso",
            l: "ISO (YYYY-MM-DD)"
          }, {
            v: "he",
            l: "עברי גרגוריאני"
          }, {
            v: "hebrew",
            l: "עברי (יט סיון תשפ״ו)"
          }, {
            v: "mixed",
            l: "מעורב"
          }], onChange: (v) => update({
            language: {
              dateFormat: v
            }
          }) }),
          s.id === "privacy" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Toggle, { label: "תיעוד פעולות ביומן ביקורת", on: settings.privacy.enableAudit, onChange: (v) => update({
              privacy: {
                ...settings.privacy,
                enableAudit: v
              }
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Toggle, { label: "נעילת מסך באזורים רגישים", on: settings.privacy.lockScreen, onChange: (v) => update({
              privacy: {
                ...settings.privacy,
                lockScreen: v
              }
            }) })
          ] }),
          s.id === "data" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectField, { label: "תדירות גיבוי אוטומטי", value: settings.data.autoBackup, options: [{
              v: "off",
              l: "כבוי"
            }, {
              v: "daily",
              l: "יומי"
            }, {
              v: "weekly",
              l: "שבועי"
            }], onChange: (v) => update({
              data: {
                ...settings.data,
                autoBackup: v
              }
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(NumberField, { label: "מספר גיבויים לשמור", min: 1, max: 20, value: settings.data.backupRetention, onChange: (v) => update({
              data: {
                ...settings.data,
                backupRetention: v
              }
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Toggle, { label: "גיבוי לפני פעולות גדולות", on: settings.data.autoBackupBeforeOps, onChange: (v) => update({
              data: {
                ...settings.data,
                autoBackupBeforeOps: v
              }
            }) })
          ] })
        ] })
      ] }, s.id);
    }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 flex flex-wrap gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => {
        updateSettings(DEFAULT_SETTINGS);
        toast.success("ההגדרות אופסו");
      }, className: "inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { className: "size-3.5" }),
        " אפס הגדרות לברירת מחדל"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => {
        resetOnboarding();
        toast("האשף יוצג בטעינה הבאה");
      }, className: "inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent", children: "הפעל מחדש אשף התקנה" })
    ] })
  ] });
}
function Field({
  label,
  value,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3 items-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value, onChange: (e) => onChange(e.target.value), maxLength: 80, className: "col-span-2 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" })
  ] });
}
function TimeField({
  label,
  value,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "time", value, onChange: (e) => onChange(e.target.value), className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm tabular-nums" })
  ] });
}
function NumberField({
  label,
  value,
  min,
  max,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3 items-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "number", min, max, value, onChange: (e) => onChange(Math.max(min, Math.min(max, +e.target.value || 0))), className: "col-span-2 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" })
  ] });
}
function SelectField({
  label,
  value,
  options,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3 items-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("select", { value, onChange: (e) => onChange(e.target.value), className: "col-span-2 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring", children: options.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: o.v, children: o.l }, o.v)) })
  ] });
}
function Toggle({
  label,
  on,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between rounded-lg border border-border px-4 py-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onChange(!on), className: `relative h-6 w-11 rounded-full transition ${on ? "bg-primary" : "bg-muted"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `absolute top-0.5 size-5 rounded-full bg-card shadow transition-all ${on ? "right-0.5" : "right-[22px]"}` }) })
  ] });
}
export {
  SettingsPage as component
};
