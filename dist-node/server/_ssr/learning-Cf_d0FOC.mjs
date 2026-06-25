import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { A as AppShell } from "./app-shell-B_F1yezE.mjs";
import { a as useLearning, F as FRAMEWORK_LABELS, g as getTimer, s as stopTimer, t as todayISO, n as newId, f as cancelTimer, h as hhmmToMin, i as startTimer } from "./kollel-store-C33FLcbV.mjs";
import { i as isBeinHazmanim } from "./hebrew-calendar-BCWobOHK.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { k as BookOpen, i as Trash2, s as TriangleAlert, t as Square, u as Plus, v as Play } from "../_libs/lucide-react.mjs";
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
const FRAMEWORKS = ["kollel-erev", "torato-beyado", "bein-hazmanim"];
function FrameworkPanel({
  fw,
  enabled
}) {
  const {
    add,
    items
  } = useLearning();
  const [minutes, setMinutes] = reactExports.useState(60);
  const [fromT, setFromT] = reactExports.useState("20:00");
  const [toT, setToT] = reactExports.useState("21:00");
  const [timer, setTimer] = reactExports.useState(getTimer());
  const [now, setNow] = reactExports.useState(Date.now());
  reactExports.useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 1e3);
    return () => clearInterval(id);
  }, [timer]);
  reactExports.useEffect(() => {
    if (!timer) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [timer]);
  const addManual = () => {
    if (!enabled) return;
    try {
      add({
        id: newId(),
        framework: fw,
        date: todayISO(),
        minutes,
        source: "manual"
      });
      toast.success("נוסף");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    }
  };
  const addRange = () => {
    if (!enabled) return;
    const a = hhmmToMin(fromT), b = hhmmToMin(toT);
    if (a === null || b === null || b <= a) {
      toast.error("טווח שעות לא תקין");
      return;
    }
    try {
      add({
        id: newId(),
        framework: fw,
        date: todayISO(),
        minutes: b - a,
        source: "range"
      });
      toast.success("נוסף");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    }
  };
  const onStartTimer = () => {
    if (!enabled) return;
    if (timer) {
      toast.warning("טיימר אחר פעיל");
      return;
    }
    setTimer(startTimer(fw));
    toast.success("הטיימר הופעל");
  };
  const onStopTimer = () => {
    const res = stopTimer();
    setTimer(null);
    if (res) {
      add({
        id: newId(),
        framework: res.framework,
        date: todayISO(),
        minutes: res.minutes,
        source: "timer"
      });
      toast.success(`נשמרו ${res.minutes} דקות`);
    }
  };
  const onCancelTimer = () => {
    cancelTimer();
    setTimer(null);
    toast("הטיימר בוטל ללא שמירה");
  };
  const myItems = items.filter((i) => i.framework === fw).slice(0, 8);
  const totalMin = items.filter((i) => i.framework === fw).reduce((s, i) => s + i.minutes, 0);
  const isMine = timer?.framework === fw;
  const elapsedMin = isMine ? Math.floor((now - timer.startedAt) / 6e4) : 0;
  const elapsedSec = isMine ? Math.floor((now - timer.startedAt) % 6e4 / 1e3) : 0;
  if (!enabled) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-6 text-center text-sm text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "size-5 mx-auto mb-2 text-warning" }),
      "מסגרת זו זמינה רק בתקופת בין הזמנים (אב, אלול ט׳-ל׳, תשרי יא׳-ל׳, ניסן)."
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5 lg:col-span-2 space-y-4", children: [
      isMine && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border-2 border-warning bg-warning/5 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-warning text-xs font-medium mb-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "size-4" }),
          "אל תסגור את האפליקציה — סגירה תעצור את הטיימר"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-3xl font-bold tabular-nums", children: [
          String(elapsedMin).padStart(2, "0"),
          ":",
          String(elapsedSec).padStart(2, "0")
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: onStopTimer, className: "inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-medium text-success-foreground", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Square, { className: "size-3.5" }),
            " עצור ושמור"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onCancelTimer, className: "rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent", children: "בטל" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground mb-2", children: "הוספה ידנית" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "number", min: 1, value: minutes, onChange: (e) => setMinutes(Math.max(1, +e.target.value || 1)), className: "flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-sm" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: addManual, className: "rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "size-3.5 inline" }),
              " הוסף"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground mb-2", children: "לפי טווח שעות" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "time", value: fromT, onChange: (e) => setFromT(e.target.value), className: "min-w-0 flex-1 basis-[6rem] rounded-md border border-input bg-card px-2 py-1.5 text-sm" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs shrink-0", children: "→" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "time", value: toT, onChange: (e) => setToT(e.target.value), className: "min-w-0 flex-1 basis-[6rem] rounded-md border border-input bg-card px-2 py-1.5 text-sm" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: addRange, className: "shrink-0 rounded-md bg-primary px-2 py-1.5 text-xs text-primary-foreground hover:bg-primary/90", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "size-3.5" }) })
          ] })
        ] })
      ] }),
      !isMine && /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: onStartTimer, disabled: !!timer, className: "w-full inline-flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary/40 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { className: "size-4" }),
        " ",
        timer ? "טיימר אחר פעיל" : "התחל טיימר"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "סה״כ במסגרת זו" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-3xl font-bold tabular-nums mt-1", children: [
        (totalMin / 60).toFixed(1),
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-muted-foreground", children: "שע׳" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-muted-foreground mt-1", children: [
        totalMin,
        " דקות · ",
        items.filter((i) => i.framework === fw).length,
        " שיעורים"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold mt-5 mb-2", children: "שיעורים אחרונים" }),
      myItems.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-2", children: myItems.map((i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-center gap-2 text-xs", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(BookOpen, { className: "size-3.5 text-muted-foreground" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 tabular-nums", children: i.date }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-medium", children: [
          i.minutes,
          " דק׳"
        ] })
      ] }, i.id)) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "אין שיעורים" })
    ] })
  ] });
}
function LearningPage() {
  const [active, setActive] = reactExports.useState("kollel-erev");
  const {
    items,
    remove
  } = useLearning();
  const beinHaz = isBeinHazmanim();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(AppShell, { title: "לימוד נוסף", subtitle: "מסגרות לימוד מחוץ לסדרים", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-surface p-1 mb-4 inline-flex gap-1", children: FRAMEWORKS.map((fw) => /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => setActive(fw), className: `px-4 py-2 rounded-md text-sm transition ${active === fw ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"}`, children: [
      FRAMEWORK_LABELS[fw],
      fw === "bein-hazmanim" && !beinHaz && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mr-1 text-[10px] opacity-60", children: "(לא בעונה)" })
    ] }, fw)) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(FrameworkPanel, { fw: active, enabled: active !== "bein-hazmanim" || beinHaz }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5 mt-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold mb-3", children: "כל השיעורים" }),
      items.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "divide-y divide-border", children: items.slice(0, 30).map((i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-center gap-3 py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-8 rounded-md bg-primary/10 text-primary grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(BookOpen, { className: "size-4" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium truncate", children: FRAMEWORK_LABELS[i.framework] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[11px] text-muted-foreground tabular-nums", children: [
            i.date,
            " · ",
            i.minutes,
            " דק׳ · ",
            i.source === "timer" ? "טיימר" : i.source === "range" ? "טווח" : "ידני"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => {
          remove(i.id);
          toast("נמחק");
        }, className: "size-8 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "size-4" }) })
      ] }, i.id)) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center text-sm text-muted-foreground py-6", children: "אין שיעורים" })
    ] })
  ] });
}
export {
  LearningPage as component
};
