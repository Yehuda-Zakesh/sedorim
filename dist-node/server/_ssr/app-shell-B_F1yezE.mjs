import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { d as useNavigate, e as useRouterState, L as Link } from "../_libs/tanstack__react-router.mjs";
import { u as useSettings, d as applyAppearance, i as isOnboarded, g as getSettings, a as updateSettings, m as markOnboarded } from "./settings-store-Dn4IHvuo.mjs";
import { a0 as Keyboard, a1 as Sun, a2 as Moon, a3 as Monitor, a4 as LayoutDashboard, a5 as ClipboardCheck, Z as Zap, _ as CalendarDays, a6 as History, k as BookOpen, a7 as ChartColumn, w as Sparkles, m as FileText, d as Search, Q as ShieldCheck, V as Settings, $ as DatabaseBackup, X, U as User, T as Target, B as Bell, D as Database, q as Check, y as ChevronRight, l as ChevronLeft } from "../_libs/lucide-react.mjs";
const navItems = [
  { to: "/", label: "לוח בקרה", icon: LayoutDashboard },
  { to: "/attendance", label: "נוכחות סדרים", icon: ClipboardCheck },
  { to: "/quick", label: "כניסה מהירה", icon: Zap },
  { to: "/calendar", label: "לוח שנה", icon: CalendarDays },
  { to: "/history", label: "היסטוריה", icon: History },
  { to: "/learning", label: "לימוד נוסף", icon: BookOpen },
  { to: "/statistics", label: "סטטיסטיקות", icon: ChartColumn },
  { to: "/insights", label: "תובנות חכמות", icon: Sparkles },
  { to: "/reports", label: "דוחות", icon: FileText },
  { to: "/search", label: "חיפוש", icon: Search },
  { to: "/audit", label: "יומן ביקורת", icon: ShieldCheck },
  { to: "/settings", label: "הגדרות", icon: Settings },
  { to: "/backup", label: "גיבוי ושחזור", icon: DatabaseBackup }
];
function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "fixed inset-y-0 right-0 z-30 flex w-[220px] flex-col bg-sidebar text-sidebar-foreground border-l border-sidebar-border", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-5 py-5 border-b border-sidebar-border", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-9 rounded-lg bg-sidebar-primary grid place-items-center text-sidebar-primary-foreground font-bold", children: "כ" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold leading-tight", children: "המעקב שלי" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-sidebar-foreground/60 leading-tight", children: "מעקב נוכחות כולל" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("nav", { className: "flex-1 overflow-y-auto px-2 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-0.5", children: navItems.map(({ to, label, icon: Icon }) => {
      const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
      return /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        Link,
        {
          to,
          className: [
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          ].join(" "),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "size-4 shrink-0" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: label })
          ]
        }
      ) }, to);
    }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 py-3 border-t border-sidebar-border text-[11px] text-sidebar-foreground/60", children: "גרסה 2.0 · כולל" })
  ] });
}
const SHORTCUTS = [
  { keys: "g d", label: "לוח בקרה", to: "/" },
  { keys: "g a", label: "נוכחות", to: "/attendance" },
  { keys: "g c", label: "לוח שנה", to: "/calendar" },
  { keys: "g h", label: "היסטוריה", to: "/history" },
  { keys: "g l", label: "לימוד נוסף", to: "/learning" },
  { keys: "g s", label: "סטטיסטיקות", to: "/statistics" },
  { keys: "g i", label: "תובנות", to: "/insights" },
  { keys: "g r", label: "דוחות", to: "/reports" },
  { keys: "g b", label: "גיבוי", to: "/backup" },
  { keys: "g u", label: "יומן ביקורת", to: "/audit" },
  { keys: "g ,", label: "הגדרות", to: "/settings" },
  { keys: "/", label: "חיפוש", to: "/search" },
  { keys: "?", label: "הצג קיצורי דרך" }
];
function useGlobalShortcuts(toggleHelp) {
  const navigate = useNavigate();
  reactExports.useEffect(() => {
    let chord = null;
    let chordTimer = null;
    const clearChord = () => {
      chord = null;
      if (chordTimer) {
        clearTimeout(chordTimer);
        chordTimer = null;
      }
    };
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === "?" || k === "/" && e.shiftKey) {
        e.preventDefault();
        toggleHelp();
        return;
      }
      if (k === "/") {
        e.preventDefault();
        navigate({ to: "/search" });
        return;
      }
      if (chord === "g") {
        const map = {
          d: "/",
          a: "/attendance",
          c: "/calendar",
          h: "/history",
          l: "/learning",
          s: "/statistics",
          i: "/insights",
          r: "/reports",
          b: "/backup",
          u: "/audit",
          ",": "/settings"
        };
        if (map[k]) {
          e.preventDefault();
          navigate({ to: map[k] });
        }
        clearChord();
        return;
      }
      if (k === "g") {
        chord = "g";
        chordTimer = window.setTimeout(clearChord, 1200);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearChord();
    };
  }, [navigate, toggleHelp]);
}
function ShortcutsHelp({ open, onClose }) {
  if (!open) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4",
      onClick: onClose,
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface w-full max-w-md p-5", onClick: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Keyboard, { className: "size-5 text-primary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-semibold flex-1", children: "קיצורי מקלדת" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onClose, className: "size-8 rounded-md hover:bg-accent grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "size-4" }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "divide-y divide-border text-sm", children: SHORTCUTS.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-center justify-between py-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: s.label }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-xs px-2 py-1 rounded bg-muted", children: s.keys })
        ] }, s.keys)) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-4 text-xs text-muted-foreground", children: [
          "קיצורים כפולים (כמו ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono", children: "g d" }),
          ") — הקש בזה אחר זה תוך שנייה."
        ] })
      ] })
    }
  );
}
const KEY = "tracker.theme";
function apply(theme) {
  if (typeof document === "undefined") return;
  const isDark = theme === "dark" || theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", isDark);
}
function useTheme() {
  const [theme, setThemeState] = reactExports.useState(() => {
    if (typeof window === "undefined") return "system";
    return localStorage.getItem(KEY) || "system";
  });
  reactExports.useEffect(() => {
    apply(theme);
  }, [theme]);
  reactExports.useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => apply("system");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [theme]);
  const setTheme = (t) => {
    localStorage.setItem(KEY, t);
    setThemeState(t);
  };
  return { theme, setTheme };
}
const STEPS = [
  { id: "welcome", title: "ברוכים הבאים", icon: User },
  { id: "goals", title: "יעדים אישיים", icon: Target },
  { id: "notifications", title: "התראות", icon: Bell },
  { id: "backup", title: "גיבויים", icon: Database },
  { id: "done", title: "הכל מוכן", icon: Check }
];
function OnboardingWizard({ onComplete }) {
  const initial = getSettings();
  const [step, setStep] = reactExports.useState(0);
  const [name, setName] = reactExports.useState(initial.profile.name);
  const [classroom, setClassroom] = reactExports.useState(initial.profile.classroom);
  const [target, setTarget] = reactExports.useState(initial.goals.monthlyTarget);
  const [maxLate, setMaxLate] = reactExports.useState(initial.goals.maxLatePerMonth);
  const [reminder, setReminder] = reactExports.useState(initial.notifications.dailyReminder);
  const [lateAlert, setLateAlert] = reactExports.useState(initial.notifications.latenessAlert);
  const [auto, setAuto] = reactExports.useState(initial.data.autoBackup);
  const [retention, setRetention] = reactExports.useState(initial.data.backupRetention);
  const finish = () => {
    updateSettings({
      profile: { name: name.trim() || "המשתמש שלי", classroom: classroom.trim() },
      goals: { monthlyTarget: target, maxLatePerMonth: maxLate },
      notifications: { dailyReminder: reminder, latenessAlert: lateAlert, weeklySummary: initial.notifications.weeklySummary },
      data: { autoBackup: auto, backupRetention: retention, autoBackupBeforeOps: initial.data.autoBackupBeforeOps }
    });
    markOnboarded();
    onComplete();
  };
  const StepIcon = STEPS[step].icon;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-[60] bg-background grid place-items-center p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface w-full max-w-lg overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-primary text-primary-foreground p-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-10 rounded-lg bg-primary-foreground/10 grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(StepIcon, { className: "size-5" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs opacity-80", children: [
            "שלב ",
            step + 1,
            " מתוך ",
            STEPS.length
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold", children: STEPS[step].title })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 flex gap-1.5", children: STEPS.map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-1 flex-1 rounded-full ${i <= step ? "bg-primary-foreground" : "bg-primary-foreground/20"}` }, i)) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 min-h-[260px]", children: [
      step === 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: 'ברוכים הבאים ל"המעקב שלי" — כלי אישי לניהול נוכחות ולימוד. נגדיר יחד מספר העדפות בסיסיות. תוכל לשנות הכל מאוחר יותר בהגדרות.' }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "שם תצוגה" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: name,
              onChange: (e) => setName(e.target.value),
              maxLength: 60,
              className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "כיתה / קבוצה (אופציונלי)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: classroom,
              onChange: (e) => setClassroom(e.target.value),
              maxLength: 40,
              className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
            }
          )
        ] })
      ] }),
      step === 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "יעד נוכחות חודשי (%)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "number",
              min: 50,
              max: 100,
              value: target,
              onChange: (e) => setTarget(Math.max(50, Math.min(100, +e.target.value || 0))),
              className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "מקסימום איחורים בחודש" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "number",
              min: 0,
              max: 31,
              value: maxLate,
              onChange: (e) => setMaxLate(Math.max(0, Math.min(31, +e.target.value || 0))),
              className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
            }
          )
        ] })
      ] }),
      step === 2 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "תזכורת יומית לרישום נוכחות", on: reminder, set: setReminder }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "התראה כשמתקרב למכסת איחורים", on: lateAlert, set: setLateAlert }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: "התראות הן ויזואליות בלבד בתוך הממשק." })
      ] }),
      step === 3 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "תדירות גיבוי אוטומטי" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "select",
            {
              value: auto,
              onChange: (e) => setAuto(e.target.value),
              className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "off", children: "כבוי" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "daily", children: "יומי" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "weekly", children: "שבועי" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "מספר גיבויים לשמור" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "number",
              min: 1,
              max: 20,
              value: retention,
              onChange: (e) => setRetention(Math.max(1, Math.min(20, +e.target.value || 1))),
              className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
            }
          )
        ] })
      ] }),
      step === 4 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center py-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-14 rounded-full bg-success/15 text-success grid place-items-center mx-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "size-7" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mt-4 text-lg font-semibold", children: "הגדרת ראשונית הושלמה" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "הכל מוכן. המעקב שלך מתחיל עכשיו." })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-5 border-t border-border bg-muted/30", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setStep((s) => Math.max(0, s - 1)),
          disabled: step === 0,
          className: "inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "size-4" }),
            " חזור"
          ]
        }
      ),
      step < STEPS.length - 1 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setStep((s) => s + 1),
          className: "inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90",
          children: [
            "המשך ",
            /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronLeft, { className: "size-4" })
          ]
        }
      ) : /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: finish,
          className: "inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90",
          children: [
            "סיום ",
            /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "size-4" })
          ]
        }
      )
    ] })
  ] }) });
}
function Row({ label, on, set }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between rounded-lg border border-border px-4 py-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => set(!on),
        className: `relative h-6 w-11 rounded-full transition ${on ? "bg-primary" : "bg-muted"}`,
        children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `absolute top-0.5 size-5 rounded-full bg-card shadow transition-all ${on ? "right-0.5" : "right-[22px]"}` })
      }
    )
  ] });
}
function AppShell({ title, subtitle, actions, children }) {
  const { theme, setTheme } = useTheme();
  useSettings();
  const [helpOpen, setHelpOpen] = reactExports.useState(false);
  const [needsOnboarding, setNeedsOnboarding] = reactExports.useState(false);
  reactExports.useEffect(() => {
    applyAppearance();
  }, []);
  reactExports.useEffect(() => {
    setNeedsOnboarding(!isOnboarded());
  }, []);
  useGlobalShortcuts(() => setHelpOpen((v) => !v));
  const cycle = () => setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = theme === "light" ? "בהיר" : theme === "dark" ? "כהה" : "מערכת";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-screen bg-background text-foreground", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(AppSidebar, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mr-[220px] flex flex-col min-h-screen", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "sticky top-0 z-20 bg-card/80 backdrop-blur border-b border-border", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-4 px-6 py-3.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold tracking-tight", children: title }),
          subtitle && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: subtitle })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          actions,
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setHelpOpen(true),
              title: "קיצורי מקלדת (?)",
              className: "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 text-xs hover:bg-accent transition",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(Keyboard, { className: "size-4" })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: cycle,
              title: `ערכת נושא: ${label}`,
              className: "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 text-xs hover:bg-accent transition",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "size-4" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden sm:inline", children: label })
              ]
            }
          )
        ] })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("main", { className: "flex-1 p-6", children })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ShortcutsHelp, { open: helpOpen, onClose: () => setHelpOpen(false) }),
    needsOnboarding && /* @__PURE__ */ jsxRuntimeExports.jsx(OnboardingWizard, { onComplete: () => setNeedsOnboarding(false) })
  ] });
}
export {
  AppShell as A
};
