import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { A as AppShell } from "./app-shell-B_F1yezE.mjs";
import { u as useSeder, a as useLearning, e as allTags, d as calcSeder, F as FRAMEWORK_LABELS } from "./kollel-store-C33FLcbV.mjs";
import { d as Search, g as Save, h as Star, i as Trash2, j as Calendar, k as BookOpen, l as ChevronLeft } from "../_libs/lucide-react.mjs";
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
const EMPTY = {
  q: "",
  type: "all",
  from: "",
  to: "",
  tag: ""
};
const SAVED_KEY = "tracker.savedFilters.v2";
function loadSaved() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
  } catch {
    return [];
  }
}
function persistSaved(list) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
  }
}
function SearchPage() {
  const {
    entries
  } = useSeder();
  const {
    items: lessons
  } = useLearning();
  const [f, setF] = reactExports.useState(EMPTY);
  const [saved, setSaved] = reactExports.useState(loadSaved());
  const [saveName, setSaveName] = reactExports.useState("");
  reactExports.useEffect(() => {
    persistSaved(saved);
  }, [saved]);
  const tags = reactExports.useMemo(() => allTags(), [entries]);
  const results = reactExports.useMemo(() => {
    const out = [];
    const inRange = (d) => (!f.from || d >= f.from) && (!f.to || d <= f.to);
    const tagMatch = (t) => !f.tag || (t || []).includes(f.tag);
    if (f.type === "all" || f.type === "seder") {
      for (const e of entries) {
        if (!inRange(e.date)) continue;
        if (!tagMatch(e.tags)) continue;
        const c = calcSeder(e);
        const txt = `${e.date} ${e.note || ""} ${e.excusedReason || ""} ${(e.tags || []).join(" ")}`;
        if (f.q && !txt.includes(f.q)) continue;
        out.push({
          kind: "seder",
          date: e.date,
          key: `s-${e.id}`,
          title: `סדר ${e.seder === 1 ? "א׳" : "ב׳"} · ${e.date}`,
          desc: e.absent ? "היעדרות" : `${e.arrival || "—"} → ${e.departure || "—"} · חסר ${c.netMissingMin}`
        });
      }
    }
    if (f.type === "all" || f.type === "learning") {
      for (const l of lessons) {
        if (!inRange(l.date)) continue;
        if (f.tag) continue;
        const txt = `${FRAMEWORK_LABELS[l.framework]} ${l.date} ${l.note || ""}`;
        if (f.q && !txt.includes(f.q)) continue;
        out.push({
          kind: "learning",
          date: l.date,
          key: `l-${l.id}`,
          title: FRAMEWORK_LABELS[l.framework],
          desc: `${l.minutes} דק׳ · ${l.date}`
        });
      }
    }
    return out.sort((a, b) => a.date < b.date ? 1 : -1);
  }, [entries, lessons, f]);
  const saveCurrent = () => {
    if (!saveName.trim()) return;
    setSaved((s) => [...s, {
      id: Date.now().toString(),
      name: saveName.trim(),
      filter: f
    }]);
    setSaveName("");
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(AppShell, { title: "חיפוש מתקדם", subtitle: "חיפוש בכל הנתונים האישיים שלך", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-4 relative mb-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute right-7 top-7 size-5 text-muted-foreground" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { autoFocus: true, value: f.q, onChange: (e) => setF({
        ...f,
        q: e.target.value
      }), placeholder: "חיפוש לפי מילה, תאריך, סיבה, הערה...", className: "w-full rounded-md bg-transparent pr-10 pl-3 py-2 text-base focus:outline-none border-b border-border" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: f.type, onChange: (e) => setF({
          ...f,
          type: e.target.value
        }), className: "rounded-md border border-input bg-card px-2 py-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "all", children: "כל הסוגים" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "seder", children: "סדרים" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "learning", children: "לימוד נוסף" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "date", value: f.from, onChange: (e) => setF({
          ...f,
          from: e.target.value
        }), className: "rounded-md border border-input bg-card px-2 py-1.5" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "date", value: f.to, onChange: (e) => setF({
          ...f,
          to: e.target.value
        }), className: "rounded-md border border-input bg-card px-2 py-1.5" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: f.tag, onChange: (e) => setF({
          ...f,
          tag: e.target.value
        }), className: "rounded-md border border-input bg-card px-2 py-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "כל התגיות" }),
          tags.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: t, children: t }, t))
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: saveName, onChange: (e) => setSaveName(e.target.value), placeholder: "שם לסינון מועדף...", className: "flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-xs" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: saveCurrent, disabled: !saveName.trim(), className: "inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "size-3.5" }),
          " שמור"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setF(EMPTY), className: "rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent", children: "איפוס" })
      ] })
    ] }),
    saved.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-3 mb-4 flex flex-wrap items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-muted-foreground inline-flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Star, { className: "size-3.5" }),
        " מועדפים:"
      ] }),
      saved.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setF(s.filter), className: "hover:underline", children: s.name }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setSaved((list) => list.filter((x) => x.id !== s.id)), className: "text-muted-foreground hover:text-destructive", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "size-3" }) })
      ] }, s.id))
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface divide-y divide-border", children: [
      results.map((r) => /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: r.kind === "seder" ? "/history" : "/learning", className: "flex items-center gap-3 p-4 hover:bg-accent/40 transition", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-10 rounded-lg bg-primary/10 text-primary grid place-items-center", children: r.kind === "seder" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "size-5" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(BookOpen, { className: "size-5" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium truncate", children: r.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground truncate", children: r.desc })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronLeft, { className: "size-4 text-muted-foreground" })
      ] }, r.key)),
      !results.length && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-12 text-center text-sm text-muted-foreground", children: "לא נמצאו תוצאות" })
    ] })
  ] });
}
export {
  SearchPage as component
};
