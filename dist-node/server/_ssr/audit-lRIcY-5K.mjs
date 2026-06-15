import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { A as AppShell } from "./app-shell-B_F1yezE.mjs";
import { c as useAudit, A as ACTION_LABELS } from "./settings-store-Dn4IHvuo.mjs";
import { d as Search, s as TriangleAlert, m as FileText, N as Archive, R as RotateCcw, O as Trash, J as Upload, Q as ShieldCheck, I as Download, V as Settings, t as Square, v as Play, i as Trash2, u as Plus, W as Pencil, Y as Eraser } from "../_libs/lucide-react.mjs";
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
const ICONS = {
  "seder.create": {
    icon: Plus,
    tone: "success"
  },
  "seder.update": {
    icon: Pencil,
    tone: "warning"
  },
  "seder.delete": {
    icon: Trash2,
    tone: "destructive"
  },
  "learning.create": {
    icon: Plus,
    tone: "info"
  },
  "learning.delete": {
    icon: Trash2,
    tone: "destructive"
  },
  "learning.timer_start": {
    icon: Play,
    tone: "info"
  },
  "learning.timer_stop": {
    icon: Square,
    tone: "success"
  },
  "settings.update": {
    icon: Settings,
    tone: "info"
  },
  "backup.export": {
    icon: Download,
    tone: "info"
  },
  "backup.import": {
    icon: Upload,
    tone: "info"
  },
  "backup.auto": {
    icon: ShieldCheck,
    tone: "success"
  },
  "backup.restore": {
    icon: Upload,
    tone: "warning"
  },
  "backup.delete_db": {
    icon: Trash,
    tone: "destructive"
  },
  "backup.reset_settings": {
    icon: RotateCcw,
    tone: "warning"
  },
  "backup.download_source": {
    icon: Archive,
    tone: "info"
  },
  "report.export": {
    icon: FileText,
    tone: "info"
  },
  "data.validation_failed": {
    icon: TriangleAlert,
    tone: "destructive"
  }
};
const TONES = {
  success: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive"
};
function formatTs(ts) {
  return new Date(ts).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function AuditPage() {
  const entries = useAudit();
  const [q, setQ] = reactExports.useState("");
  const [filter, setFilter] = reactExports.useState("all");
  const types = reactExports.useMemo(() => {
    const set = /* @__PURE__ */ new Set();
    entries.forEach((e) => set.add(e.action));
    return [...set];
  }, [entries]);
  const filtered = entries.filter((e) => (filter === "all" || e.action === filter) && (q === "" || ACTION_LABELS[e.action].includes(q) || (e.recordId || "").includes(q) || (e.detail || "").includes(q)));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(AppShell, { title: "יומן ביקורת", subtitle: `${entries.length} פעולות מתועדות · רישומים אינם ניתנים לעריכה`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-4 mb-4 space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "חיפוש בפעולה, מזהה או פרטים...", className: "w-full rounded-md border border-input bg-card pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setFilter("all"), className: `px-3 py-1.5 rounded-md text-xs ${filter === "all" ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent text-muted-foreground"}`, children: "הכל" }),
        types.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setFilter(t), className: `px-3 py-1.5 rounded-md text-xs ${filter === t ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent text-muted-foreground"}`, children: ACTION_LABELS[t] }, t))
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-surface p-6", children: filtered.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("ol", { className: "relative border-r-2 border-border pr-6 space-y-5", children: filtered.map((e) => {
      const ic = ICONS[e.action];
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "relative", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `absolute -right-[34px] top-1 size-7 rounded-full grid place-items-center ${TONES[ic.tone]}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(ic.icon, { className: "size-3.5" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-baseline gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold", children: ACTION_LABELS[e.action] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground tabular-nums", children: formatTs(e.ts) }),
          e.recordId && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground", children: e.recordId })
        ] }),
        e.detail && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: e.detail })
      ] }, e.id);
    }) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center py-12 text-sm text-muted-foreground flex flex-col items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Eraser, { className: "size-6 opacity-50" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "אין רישומים תואמים" })
    ] }) })
  ] });
}
export {
  AuditPage as component
};
