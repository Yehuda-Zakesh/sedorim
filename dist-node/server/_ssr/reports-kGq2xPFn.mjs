import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { A as AppShell } from "./app-shell-B_F1yezE.mjs";
import { u as utils, w as writeFileSync } from "../_libs/xlsx.mjs";
import { l as logAudit } from "./settings-store-Dn4IHvuo.mjs";
import { u as useSeder, a as useLearning, d as calcSeder, F as FRAMEWORK_LABELS, m as monthlySummary, b as attendanceScore } from "./kollel-store-C33FLcbV.mjs";
import { a as formatHebrewDate } from "./hebrew-calendar-BCWobOHK.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { m as FileText, n as FileSpreadsheet, L as LoaderCircle, o as FileDown } from "../_libs/lucide-react.mjs";
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
const DEFAULT_SECTIONS = {
  kpis: true,
  monthlyTable: true,
  yearlyBreakdown: true,
  learning: true,
  charts: true,
  excusedSummary: true,
  oheveiList: true
};
function inRange(d, range) {
  return (!range?.from || d >= range.from) && (!range?.to || d <= range.to);
}
function buildReportHTML(title, entries, lessons, sections, range) {
  const ents = entries.filter((e) => inRange(e.date, range));
  const lsns = lessons.filter((l) => inRange(l.date, range));
  let excused = 0, nonExcused = 0, bonus = 0, oheveiCount = 0, netMissing = 0;
  for (const e of ents) {
    const c = calcSeder(e);
    excused += c.excusedMin;
    nonExcused += c.nonExcusedMin;
    bonus += c.bonusMin;
    netMissing += c.netMissingMin;
    if (e.absent) ;
    if (c.isOhevei) oheveiCount++;
  }
  const totalLearnMin = lsns.reduce((s, l) => s + l.minutes, 0);
  const monthly = {};
  for (const e of ents) (monthly[e.date.slice(0, 7)] = monthly[e.date.slice(0, 7)] || []).push(e);
  const monthKeys = Object.keys(monthly).sort();
  const today = /* @__PURE__ */ new Date();
  const heDate = formatHebrewDate(today);
  const kpiHtml = !sections.kpis ? "" : `
    <section class="grid">
      <div class="kpi"><div class="kpi-label">דקות חסרות (נטו)</div><div class="kpi-val">${netMissing}</div></div>
      <div class="kpi"><div class="kpi-label">דקות בונוס</div><div class="kpi-val">${bonus}</div></div>
      <div class="kpi"><div class="kpi-label">מוצדק</div><div class="kpi-val">${excused}</div></div>
      <div class="kpi"><div class="kpi-label">סדרי אוהבי ה׳</div><div class="kpi-val">${oheveiCount}</div></div>
    </section>
  `;
  const chartHtml = !sections.charts ? "" : `
    <section class="card">
      <h3>פילוח דקות</h3>
      <div class="bars">
        ${[
    { k: "missing", l: "חסרות (לא מוצדק)", v: nonExcused, color: "#F44336" },
    { k: "excused", l: "מוצדק", v: excused, color: "#2196F3" },
    { k: "bonus", l: "בונוס", v: bonus, color: "#4CAF50" }
  ].map((row) => {
    const max = Math.max(1, nonExcused + excused + bonus);
    const pct = Math.round(row.v / max * 100);
    return `<div class="bar-row">
            <span class="bar-label">${row.l}</span>
            <div class="bar"><div class="bar-fill" style="width:${pct}%; background:${row.color}"></div></div>
            <span class="bar-val">${row.v}</span>
          </div>`;
  }).join("")}
      </div>
    </section>
  `;
  const yearlyHtml = !sections.yearlyBreakdown ? "" : `
    <section class="card">
      <h3>סיכום חודשי</h3>
      <table>
        <thead><tr><th>חודש</th><th>רישומים</th><th>איחור</th><th>היעדרות</th><th>חסר נטו</th><th>בונוס</th><th>אוהבי ה׳</th><th>ציון</th></tr></thead>
        <tbody>
          ${monthKeys.map((k) => {
    const [y, m] = k.split("-").map(Number);
    const s = monthlySummary(y, m - 1);
    const score = attendanceScore(y, m - 1);
    return `<tr><td>${k}</td><td>${s.entries}</td><td>${s.lateCount}</td><td>${s.absenceCount}</td><td>${s.netMissing}</td><td>${s.bonus}</td><td>${s.oheveiCount}</td><td>${score}</td></tr>`;
  }).join("")}
        </tbody>
      </table>
    </section>
  `;
  const monthTableHtml = !sections.monthlyTable ? "" : `
    <section class="card">
      <h3>פירוט סדרים</h3>
      <table>
        <thead><tr><th>תאריך</th><th>סדר</th><th>הגעה</th><th>יציאה</th><th>חסר</th><th>בונוס</th><th>מוצדק</th><th>אוהבי ה׳</th></tr></thead>
        <tbody>
          ${ents.slice(0, 200).map((e) => {
    const c = calcSeder(e);
    return `<tr>
              <td>${e.date}</td>
              <td>${e.seder === 1 ? "א׳" : "ב׳"}</td>
              <td>${e.absent ? "—" : e.arrival || "—"}</td>
              <td>${e.absent ? "—" : e.departure || "—"}</td>
              <td>${c.missingMin}</td>
              <td>${c.bonusMin}</td>
              <td>${c.excusedMin}</td>
              <td>${c.isOhevei ? "✓" : ""}</td>
            </tr>`;
  }).join("")}
        </tbody>
      </table>
      ${ents.length > 200 ? `<p class="muted">מוצגים 200 מתוך ${ents.length} רישומים</p>` : ""}
    </section>
  `;
  const excusedHtml = !sections.excusedSummary ? "" : `
    <section class="card">
      <h3>סיכום היעדרויות מוצדקות</h3>
      <p>סה"כ דקות מוצדקות: <b>${excused}</b></p>
      <ul>
        ${ents.filter((e) => e.excusedAll || e.excusedMinutes > 0).slice(0, 30).map((e) => `<li>${e.date} · סדר ${e.seder === 1 ? "א׳" : "ב׳"} — ${e.excusedAll ? "כל הסדר" : `${e.excusedMinutes} דק׳`}${e.excusedReason ? ` — ${e.excusedReason}` : ""}</li>`).join("")}
      </ul>
    </section>
  `;
  const oheveiHtml = !sections.oheveiList ? "" : `
    <section class="card">
      <h3>רשימת סדרי "אוהבי ה׳"</h3>
      <p>סה"כ: <b>${oheveiCount}</b></p>
      <ul>
        ${ents.filter((e) => calcSeder(e).isOhevei).slice(0, 50).map((e) => `<li>${e.date} · סדר ${e.seder === 1 ? "א׳" : "ב׳"}</li>`).join("")}
      </ul>
    </section>
  `;
  const learnHtml = !sections.learning ? "" : `
    <section class="card">
      <h3>לימוד נוסף</h3>
      <p>סה"כ: <b>${totalLearnMin}</b> דק׳ (${(totalLearnMin / 60).toFixed(1)} שעות) · ${lsns.length} שיעורים</p>
      <table>
        <thead><tr><th>תאריך</th><th>מסגרת</th><th>דקות</th></tr></thead>
        <tbody>
          ${lsns.slice(0, 100).map((l) => `<tr><td>${l.date}</td><td>${FRAMEWORK_LABELS[l.framework]}</td><td>${l.minutes}</td></tr>`).join("")}
        </tbody>
      </table>
    </section>
  `;
  return `
<div id="__report" dir="rtl" lang="he" style="
  width:794px; padding:40px; background:#fff; color:#1a1a1a;
  font-family: 'Heebo', 'Segoe UI', Arial, sans-serif;">
  <style>
    #__report h1 { font-size:28px; margin:0 0 4px; color:#1E3A5F; }
    #__report .sub { color:#5a6478; margin-bottom:24px; font-size:13px; }
    #__report .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
    #__report .kpi { border:1px solid #e1e6ee; border-radius:10px; padding:14px; background:#f7f9fc; }
    #__report .kpi-label { font-size:11px; color:#5a6478; }
    #__report .kpi-val { font-size:24px; font-weight:700; color:#1565C0; margin-top:6px; }
    #__report .card { border:1px solid #e1e6ee; border-radius:12px; padding:18px; margin-bottom:16px; background:#fff; }
    #__report .card h3 { margin:0 0 12px; font-size:15px; color:#1E3A5F; border-bottom:1px solid #eef2f7; padding-bottom:8px; }
    #__report table { width:100%; border-collapse:collapse; font-size:12px; }
    #__report th, #__report td { padding:7px 10px; text-align:right; border-bottom:1px solid #eef2f7; }
    #__report th { background:#f7f9fc; font-weight:600; color:#3a4761; }
    #__report .bars { display:flex; flex-direction:column; gap:8px; }
    #__report .bar-row { display:grid; grid-template-columns: 130px 1fr 50px; align-items:center; gap:10px; font-size:12px; }
    #__report .bar { height:14px; background:#eef2f7; border-radius:7px; overflow:hidden; }
    #__report .bar-fill { height:100%; border-radius:7px; }
    #__report .muted { color:#5a6478; font-size:11px; margin-top:8px; }
    #__report .footer { margin-top:24px; padding-top:12px; border-top:1px solid #eef2f7; color:#5a6478; font-size:10px; display:flex; justify-content:space-between; }
    #__report ul { margin:0; padding-right:18px; font-size:12px; }
    #__report ul li { margin:4px 0; }
  </style>

  <header style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #1565C0; padding-bottom:14px; margin-bottom:20px;">
    <div>
      <h1>${title}</h1>
      <div class="sub">${range ? `טווח: ${range.from} → ${range.to}` : ""} · הופק ${heDate}</div>
    </div>
    <div style="text-align:left; color:#1E3A5F; font-weight:700;">המעקב שלי · כולל</div>
  </header>

  ${kpiHtml}
  ${chartHtml}
  ${yearlyHtml}
  ${monthTableHtml}
  ${excusedHtml}
  ${oheveiHtml}
  ${learnHtml}

  <div class="footer">
    <span>דוח אישי — מסמך פנימי</span>
    <span>הופק אוטומטית · המעקב שלי</span>
  </div>
</div>`;
}
async function exportPdfReport(opts) {
  const sections = opts.sections ?? DEFAULT_SECTIONS;
  const html = buildReportHTML(opts.title, opts.entries, opts.lessons, sections, opts.range);
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    throw new Error("חלון ההדפסה נחסם על ידי הדפדפן — אפשר חלונות קופצים ונסה שוב");
  }
  const fname = opts.filename || `${opts.title.replace(/\s+/g, "_")}_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`;
  win.document.open();
  win.document.write(`<!doctype html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <title>${fname}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 12mm; }
    html, body { margin:0; padding:0; background:#fff; }
    body { font-family: 'Heebo', 'Segoe UI', Arial, sans-serif; }
    #__report { width:auto !important; padding:0 !important; }
    @media print { .__no-print { display:none !important; } }
  </style>
</head>
<body>
  <div class="__no-print" style="position:fixed;top:8px;left:8px;display:flex;gap:6px;z-index:9999;">
    <button onclick="window.print()" style="padding:8px 14px;border:0;border-radius:6px;background:#1565C0;color:#fff;font:600 13px sans-serif;cursor:pointer;">הדפס / שמור כ-PDF</button>
    <button onclick="window.close()" style="padding:8px 14px;border:1px solid #ccc;border-radius:6px;background:#fff;font:13px sans-serif;cursor:pointer;">סגור</button>
  </div>
  ${html}
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { try { window.focus(); window.print(); } catch (e) {} }, 400);
    });
  <\/script>
</body>
</html>`);
  win.document.close();
  logAudit("report.export", { detail: `PDF · ${opts.title}`, newValue: { filename: fname } });
}
function exportXlsxWorkbook(opts) {
  const { entries, lessons } = opts;
  const wb = utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  const sederRows = entries.map((e) => {
    const c = calcSeder(e);
    return {
      "תאריך": e.date,
      "סדר": e.seder === 1 ? "א׳" : "ב׳",
      "הגעה": e.arrival || "",
      "יציאה": e.departure || "",
      "היעדרות": e.absent ? "כן" : "",
      "חסר (דק׳)": c.missingMin,
      "בונוס": c.bonusMin,
      "מוצדק": c.excusedMin,
      "חסר נטו": c.netMissingMin,
      "אוהבי ה׳": c.isOhevei ? "כן" : "",
      "סיבה": e.excusedReason || "",
      "תגיות": (e.tags || []).join(", "),
      "הערה": e.note || ""
    };
  });
  const wsSed = utils.json_to_sheet(sederRows);
  wsSed["!cols"] = [{ wch: 12 }, { wch: 6 }, { wch: 7 }, { wch: 7 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 9 }, { wch: 18 }, { wch: 16 }, { wch: 24 }];
  utils.book_append_sheet(wb, wsSed, "סדרים");
  const lrnRows = lessons.map((l) => ({
    "תאריך": l.date,
    "מסגרת": FRAMEWORK_LABELS[l.framework],
    "דקות": l.minutes,
    "שעות": +(l.minutes / 60).toFixed(2),
    "מקור": l.source === "timer" ? "טיימר" : l.source === "range" ? "טווח שעות" : "ידני"
  }));
  const wsLrn = utils.json_to_sheet(lrnRows);
  wsLrn["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 12 }];
  utils.book_append_sheet(wb, wsLrn, "לימוד נוסף");
  const monthly = {};
  for (const e of entries) (monthly[e.date.slice(0, 7)] = monthly[e.date.slice(0, 7)] || []).push(e);
  const monthRows = Object.keys(monthly).sort().map((k) => {
    const [y, m] = k.split("-").map(Number);
    const s = monthlySummary(y, m - 1);
    return {
      "חודש": k,
      "רישומים": s.entries,
      "איחור": s.lateCount,
      "היעדרות": s.absenceCount,
      "יציאה מוקדמת": s.earlyDepCount,
      "חסר": s.totalMissing,
      "מוצדק": s.excused,
      "בונוס": s.bonus,
      "חסר נטו": s.netMissing,
      "אוהבי ה׳": s.oheveiCount,
      "ציון": attendanceScore(y, m - 1)
    };
  });
  const wsMon = utils.json_to_sheet(monthRows);
  utils.book_append_sheet(wb, wsMon, "סיכום חודשי");
  const fname = opts.filename || `kollel_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`;
  writeFileSync(wb, fname);
  logAudit("report.export", { detail: `XLSX · ${fname}` });
}
const SECTION_LABELS = {
  kpis: "סיכומי KPI",
  charts: "תרשימי פילוח",
  yearlyBreakdown: "סיכום חודשי",
  monthlyTable: "פירוט סדרים",
  excusedSummary: "מוצדקים",
  learning: "לימוד נוסף",
  oheveiList: "רשימת אוהבי ה׳"
};
function ReportsPage() {
  const {
    entries
  } = useSeder();
  const {
    items: lessons
  } = useLearning();
  const [busy, setBusy] = reactExports.useState(null);
  const [sections, setSections] = reactExports.useState(DEFAULT_SECTIONS);
  const [from, setFrom] = reactExports.useState("");
  const [to, setTo] = reactExports.useState("");
  const [fmt, setFmt] = reactExports.useState("pdf");
  const presets = reactExports.useMemo(() => [{
    key: "monthly",
    title: "דוח חודשי",
    desc: "סיכום מלא של החודש הנוכחי",
    icon: FileText,
    format: "PDF",
    run: async () => {
      const now = /* @__PURE__ */ new Date();
      const y = now.getFullYear(), m = now.getMonth();
      const last = new Date(y, m + 1, 0).getDate();
      await exportPdfReport({
        title: "דוח נוכחות חודשי — כולל",
        entries,
        lessons,
        sections,
        range: {
          from: `${y}-${String(m + 1).padStart(2, "0")}-01`,
          to: `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`
        }
      });
    }
  }, {
    key: "yearly",
    title: "דוח שנתי",
    desc: "סקירה שנתית עם מגמות",
    icon: FileText,
    format: "PDF",
    run: async () => {
      const y = (/* @__PURE__ */ new Date()).getFullYear();
      await exportPdfReport({
        title: `דוח שנתי ${y}`,
        entries,
        lessons,
        sections,
        range: {
          from: `${y}-01-01`,
          to: `${y}-12-31`
        }
      });
    }
  }, {
    key: "exec",
    title: "תקציר מנהלים",
    desc: "KPI ותרשימים בלבד",
    icon: FileText,
    format: "PDF",
    run: async () => {
      await exportPdfReport({
        title: "תקציר מנהלים",
        entries,
        lessons,
        sections: {
          ...DEFAULT_SECTIONS,
          monthlyTable: false,
          learning: false,
          excusedSummary: false,
          oheveiList: false
        }
      });
    }
  }, {
    key: "learn",
    title: "דוח לימוד נוסף",
    desc: "כל המסגרות והשעות",
    icon: FileText,
    format: "PDF",
    run: async () => {
      await exportPdfReport({
        title: "דוח לימוד נוסף",
        entries,
        lessons,
        sections: {
          kpis: false,
          charts: false,
          yearlyBreakdown: false,
          monthlyTable: false,
          excusedSummary: false,
          oheveiList: false,
          learning: true
        }
      });
    }
  }, {
    key: "xlsx",
    title: "ייצוא לאקסל",
    desc: "סדרים, לימוד, סיכום חודשי",
    icon: FileSpreadsheet,
    format: "XLSX",
    run: async () => exportXlsxWorkbook({
      entries,
      lessons
    })
  }], [entries, lessons, sections]);
  const runPreset = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
      toast.success("הדוח הופק");
    } catch (e) {
      toast.error("ההפקה נכשלה");
      console.error(e);
    } finally {
      setBusy(null);
    }
  };
  const runCustom = async () => {
    if (from && to && from > to) {
      toast.error("טווח לא תקין");
      return;
    }
    setBusy("custom");
    try {
      if (fmt === "xlsx") {
        const inEnts = entries.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
        const inLsn = lessons.filter((l) => (!from || l.date >= from) && (!to || l.date <= to));
        exportXlsxWorkbook({
          entries: inEnts,
          lessons: inLsn
        });
      } else {
        await exportPdfReport({
          title: "דוח מותאם אישית",
          entries,
          lessons,
          sections,
          range: from && to ? {
            from,
            to
          } : void 0
        });
      }
      toast.success("הדוח הופק");
    } catch (e) {
      toast.error("ההפקה נכשלה");
      console.error(e);
    } finally {
      setBusy(null);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(AppShell, { title: "דוחות", subtitle: "הפקה וייצוא דוחות אישיים", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: presets.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-surface p-5 flex items-start gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-12 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(p.icon, { className: "size-6" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold", children: p.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground", children: p.format })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mt-1", children: p.desc }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => runPreset(p.key, p.run), disabled: busy !== null, className: "mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50", children: [
          busy === p.key ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "size-3.5 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(FileDown, { className: "size-3.5" }),
          busy === p.key ? "מפיק..." : "הורדה"
        ] })
      ] })
    ] }, p.key)) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 card-surface p-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold mb-3", children: "דוח מותאם אישית" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "מתאריך" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "date", value: from, onChange: (e) => setFrom(e.target.value), className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "עד תאריך" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "date", value: to, onChange: (e) => setTo(e.target.value), className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "פורמט" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: fmt, onChange: (e) => setFmt(e.target.value), className: "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "pdf", children: "PDF" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "xlsx", children: "Excel (XLSX)" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-medium text-muted-foreground mb-2", children: "סעיפים לכלול (PDF)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 gap-2", children: Object.keys(SECTION_LABELS).map((k) => /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-accent", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "checkbox", checked: sections[k], onChange: (e) => setSections({
            ...sections,
            [k]: e.target.checked
          }), className: "accent-primary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: SECTION_LABELS[k] })
        ] }, k)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: runCustom, disabled: busy !== null, className: "mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50", children: [
        busy === "custom" ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "size-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(FileDown, { className: "size-4" }),
        "הפקת דוח"
      ] })
    ] })
  ] });
}
export {
  ReportsPage as component
};
