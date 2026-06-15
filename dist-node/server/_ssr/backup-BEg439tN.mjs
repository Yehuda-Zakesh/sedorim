import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { A as AppShell } from "./app-shell-B_F1yezE.mjs";
import { u as useSeder, a as useLearning, o as useSnapshots, p as getLastAutoBackupTs, v as verifySnapshot, q as deleteSnapshot, r as clearAllSnapshots, w as createSnapshot } from "./kollel-store-0dSUrOIp.mjs";
import { u as useSettings, l as logAudit, b as resetSettings } from "./settings-store-Dn4IHvuo.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { c as createServerFn, T as TSS_SERVER_FUNCTION, g as getServerFnById } from "./server-CaWtMibl.mjs";
import "../_libs/seroval.mjs";
import { z as CircleCheck, E as FileBraces, H as HardDrive, C as Clock, I as Download, J as Upload, R as RotateCcw, K as FileArchive, M as ShieldAlert, i as Trash2, s as TriangleAlert } from "../_libs/lucide-react.mjs";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
import "node:http";
import "node:stream/promises";
import "node:https";
import "node:http2";
var createSsrRpc = (functionId) => {
  const url = "/_serverFn/" + functionId;
  const serverFnMeta = { id: functionId };
  const fn = async (...args) => {
    return (await getServerFnById(functionId))(...args);
  };
  return Object.assign(fn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true
  });
};
const generateSourceZip = createServerFn({
  method: "GET"
}).handler(createSsrRpc("8b42bb4332a2cf93f09a94255696b6a6435303e98ac657d3cbe2765ef63c1cbf"));
function formatTs(ts) {
  return new Date(ts).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function formatSize(n) {
  return n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}
function BackupPage() {
  const {
    entries,
    replaceAll: replaceSeder,
    clearAll: clearSeder
  } = useSeder();
  const {
    items,
    replaceAll: replaceLrn,
    clearAll: clearLrn
  } = useLearning();
  const snapshots = useSnapshots();
  const {
    settings
  } = useSettings();
  const fileRef = reactExports.useRef(null);
  const [confirmDelete, setConfirmDelete] = reactExports.useState(false);
  const [confirmReset, setConfirmReset] = reactExports.useState(false);
  const exportData = () => {
    const payload = {
      version: 3,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      kind: "kollel",
      seder: entries,
      learning: items
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kollel-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    logAudit("backup.export", {
      detail: formatSize(blob.size)
    });
    toast.success("הגיבוי הורד");
  };
  const handleImport = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const sederArr = data.seder || data.attendance || [];
      const lrnArr = data.learning || [];
      if (!Array.isArray(sederArr) || !Array.isArray(lrnArr)) throw new Error("invalid");
      createSnapshot({
        attendance: entries,
        learning: items
      }, "before-op");
      replaceSeder(sederArr);
      replaceLrn(lrnArr);
      logAudit("backup.import", {
        detail: `${sederArr.length} סדרים · ${lrnArr.length} שיעורים`
      });
      toast.success("השחזור הושלם");
    } catch {
      toast.error("קובץ לא תקין");
    }
  };
  const handleDownloadSource = async () => {
    try {
      const result = await generateSourceZip();
      const binary = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([binary], {
        type: "application/zip"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      logAudit("backup.download_source", {
        detail: result.filename
      });
      toast.success("הקוד הורד בהצלחה");
    } catch {
      toast.error("ההורדה נכשלה — נסה שוב");
    }
  };
  const snapshotNow = () => {
    const snap = createSnapshot({
      attendance: entries,
      learning: items
    }, "manual");
    logAudit("backup.export", {
      recordId: snap.id,
      detail: "תמונת מצב מקומית"
    });
    toast.success("נוצרה תמונת מצב");
  };
  const restoreSnap = (id) => {
    const snap = snapshots.find((s) => s.id === id);
    if (!snap) return;
    if (!verifySnapshot(snap)) {
      toast.error("גיבוי פגום — checksum לא תואם");
      return;
    }
    createSnapshot({
      attendance: entries,
      learning: items
    }, "before-op");
    replaceSeder(snap.payload.attendance || []);
    replaceLrn(snap.payload.learning || []);
    logAudit("backup.restore", {
      recordId: id,
      detail: `שוחזר מ-${formatTs(snap.ts)}`
    });
    toast.success("הגיבוי שוחזר");
  };
  const doDelete = () => {
    createSnapshot({
      attendance: entries,
      learning: items
    }, "before-op");
    clearSeder();
    clearLrn();
    logAudit("backup.delete_db", {
      detail: "כל הנתונים נמחקו"
    });
    toast.success("הנתונים נמחקו");
    setConfirmDelete(false);
  };
  const doReset = () => {
    resetSettings();
    toast.success("ההגדרות אופסו");
    setConfirmReset(false);
  };
  const totalBytes = JSON.stringify({
    entries,
    items
  }).length;
  const lastAuto = getLastAutoBackupTs();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(AppShell, { title: "גיבוי ושחזור", subtitle: "ייצוא, ייבוא ופעולות מערכת", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-4 mb-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Kpi, { icon: CircleCheck, tone: "success", label: "רישומי סדרים", value: entries.length.toString() }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Kpi, { icon: FileBraces, tone: "info", label: "שיעורי לימוד", value: items.length.toString() }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Kpi, { icon: HardDrive, tone: "primary", label: "נפח נתונים", value: formatSize(totalBytes) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Kpi, { icon: Clock, tone: "warning", label: "גיבוי אחרון", value: lastAuto ? formatTs(lastAuto).split(",")[0] : "אין" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4 mb-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: exportData, className: "card-surface p-6 text-right hover:border-primary transition", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { className: "size-6 text-primary mb-3" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold", children: "ייצוא גיבוי" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground mt-1", children: "הורדת קובץ JSON" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => fileRef.current?.click(), className: "card-surface p-6 text-right hover:border-primary transition", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Upload, { className: "size-6 text-primary mb-3" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold", children: "שחזור מקובץ" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground mt-1", children: "העלאת קובץ גיבוי" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { ref: fileRef, type: "file", accept: "application/json", className: "hidden", onChange: (e) => {
          const f = e.target.files?.[0];
          if (f) handleImport(f);
          e.target.value = "";
        } })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: snapshotNow, className: "card-surface p-6 text-right hover:border-primary transition", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { className: "size-6 text-primary mb-3" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold", children: "תמונת מצב" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground mt-1", children: "שמירה מקומית מהירה" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5 mb-5 border border-primary/20", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-10 rounded-lg bg-primary/10 grid place-items-center text-primary", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FileArchive, { className: "size-5" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold", children: "הורדת קוד מקור" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "אריזת כל קבצי הפרויקט לקובץ ZIP ישירות מהשרת" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: handleDownloadSource, className: "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { className: "size-4" }),
        "הורד ZIP מעודכן"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5 mb-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold", children: "היסטוריית גיבויים מקומיים" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-muted-foreground", children: [
          "אוטומטי: ",
          settings.data.autoBackup === "off" ? "כבוי" : settings.data.autoBackup === "daily" ? "יומי" : "שבועי",
          " · שמור ",
          settings.data.backupRetention
        ] })
      ] }),
      snapshots.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "divide-y divide-border", children: snapshots.map((s) => {
        const valid = verifySnapshot(s);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-center gap-3 py-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `size-9 rounded-md grid place-items-center ${valid ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`, children: valid ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "size-4" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { className: "size-4" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium tabular-nums", children: formatTs(s.ts) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[11px] text-muted-foreground", children: [
              s.trigger === "auto" ? "אוטומטי" : s.trigger === "before-op" ? "לפני פעולה" : "ידני",
              " · ",
              formatSize(s.size)
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => restoreSnap(s.id), className: "rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent", children: "שחזר" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => {
            deleteSnapshot(s.id);
            toast("נמחק");
          }, className: "size-8 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "size-4" }) })
        ] }, s.id);
      }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-8 text-center text-sm text-muted-foreground", children: "אין עדיין תמונות מצב" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5 border-r-4 border-r-destructive", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "size-4 text-destructive" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold", children: "פעולות הרסניות" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold", children: "איפוס הגדרות לברירת מחדל" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground mt-1", children: "שעות סדרים, יעדים והעדפות." }),
          !confirmReset ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setConfirmReset(true), className: "mt-3 rounded-md border border-warning text-warning px-3 py-1.5 text-xs hover:bg-warning/10", children: "אפס הגדרות" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: doReset, className: "rounded-md bg-warning px-3 py-1.5 text-xs text-warning-foreground", children: "אישור איפוס" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setConfirmReset(false), className: "rounded-md border border-border px-3 py-1.5 text-xs", children: "בטל" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-destructive/40 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold text-destructive", children: "מחיקת בסיס נתונים" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground mt-1", children: "מוחק את כל הסדרים והשיעורים. תיווצר תמונת מצב אוטומטית לפני המחיקה." }),
          !confirmDelete ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setConfirmDelete(true), className: "mt-3 rounded-md border border-destructive text-destructive px-3 py-1.5 text-xs hover:bg-destructive/10", children: "מחק נתונים" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: doDelete, className: "rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground", children: "אישור מחיקה" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setConfirmDelete(false), className: "rounded-md border border-border px-3 py-1.5 text-xs", children: "בטל" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => {
        clearAllSnapshots();
        toast("תמונות המצב נמחקו");
      }, className: "mt-3 text-xs text-muted-foreground hover:text-destructive", children: "מחיקת כל תמונות המצב" })
    ] })
  ] });
}
function Kpi({
  icon: Icon,
  tone,
  label,
  value
}) {
  const tones = {
    success: "bg-success/10 text-success",
    info: "bg-info/10 text-info",
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/10 text-warning"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-surface p-5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `size-10 rounded-lg grid place-items-center ${tones[tone]}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "size-5" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold tabular-nums", children: value })
    ] })
  ] }) });
}
export {
  BackupPage as component
};
