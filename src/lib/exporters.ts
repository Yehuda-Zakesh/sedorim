import * as XLSX from "xlsx";
import { logAudit } from "./audit-store";
import {
  type SederEntry, type LearningEntry,
  calcSeder, monthlySummary, attendanceScore, FRAMEWORK_LABELS,
} from "./kollel-store";
import { formatHebrewDate } from "./hebrew-calendar";

export type ReportSections = {
  kpis: boolean;
  monthlyTable: boolean;
  yearlyBreakdown: boolean;
  learning: boolean;
  charts: boolean;
  excusedSummary: boolean;
  oheveiList: boolean;
};

export const DEFAULT_SECTIONS: ReportSections = {
  kpis: true, monthlyTable: true, yearlyBreakdown: true,
  learning: true, charts: true, excusedSummary: true, oheveiList: true,
};

function fmtMin(m: number): string {
  if (!m) return "0";
  const h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? `${h}:${String(r).padStart(2, "0")}` : `${r} דק׳`;
}

function inRange(d: string, range?: { from: string; to: string }) {
  return (!range?.from || d >= range.from) && (!range?.to || d <= range.to);
}

function buildReportHTML(
  title: string,
  entries: SederEntry[],
  lessons: LearningEntry[],
  sections: ReportSections,
  range?: { from: string; to: string },
): string {
  const ents = entries.filter((e) => inRange(e.date, range));
  const lsns = lessons.filter((l) => inRange(l.date, range));

  let totalMissing = 0, excused = 0, nonExcused = 0, bonus = 0,
      lateCount = 0, absenceCount = 0, oheveiCount = 0, netMissing = 0,
      earlyDepCount = 0;
  for (const e of ents) {
    const c = calcSeder(e);
    totalMissing += c.missingMin; excused += c.excusedMin; nonExcused += c.nonExcusedMin;
    bonus += c.bonusMin; netMissing += c.netMissingMin;
    if (c.isLate) lateCount++;
    if (e.absent) absenceCount++;
    if (c.isOhevei) oheveiCount++;
    if (c.isEarlyDeparture) earlyDepCount++;
  }
  const totalLearnMin = lsns.reduce((s, l) => s + l.minutes, 0);

  // monthly breakdown
  const monthly: Record<string, SederEntry[]> = {};
  for (const e of ents) (monthly[e.date.slice(0, 7)] = monthly[e.date.slice(0, 7)] || []).push(e);
  const monthKeys = Object.keys(monthly).sort();

  const today = new Date();
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
          { k: "bonus", l: "בונוס", v: bonus, color: "#4CAF50" },
        ].map((row) => {
          const max = Math.max(1, nonExcused + excused + bonus);
          const pct = Math.round((row.v / max) * 100);
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
              <td>${e.absent ? "—" : (e.arrival || "—")}</td>
              <td>${e.absent ? "—" : (e.departure || "—")}</td>
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
        ${ents.filter((e) => e.excusedAll || e.excusedMinutes > 0).slice(0, 30).map((e) =>
          `<li>${e.date} · סדר ${e.seder === 1 ? "א׳" : "ב׳"} — ${e.excusedAll ? "כל הסדר" : `${e.excusedMinutes} דק׳`}${e.excusedReason ? ` — ${e.excusedReason}` : ""}</li>`).join("")}
      </ul>
    </section>
  `;

  const oheveiHtml = !sections.oheveiList ? "" : `
    <section class="card">
      <h3>רשימת סדרי "אוהבי ה׳"</h3>
      <p>סה"כ: <b>${oheveiCount}</b></p>
      <ul>
        ${ents.filter((e) => calcSeder(e).isOhevei).slice(0, 50).map((e) =>
          `<li>${e.date} · סדר ${e.seder === 1 ? "א׳" : "ב׳"}</li>`).join("")}
      </ul>
    </section>
  `;

  const learnHtml = !sections.learning ? "" : `
    <section class="card">
      <h3>לימוד נוסף</h3>
      <p>סה"כ: <b>${totalLearnMin}</b> דק׳ (${(totalLearnMin / 60).toFixed(1)} שעות) · ${lsns.length} רישומים</p>
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

export async function exportPdfReport(opts: {
  title: string;
  entries: SederEntry[];
  lessons: LearningEntry[];
  sections?: ReportSections;
  range?: { from: string; to: string };
  filename?: string;
}) {
  const sections = opts.sections ?? DEFAULT_SECTIONS;
  const html = buildReportHTML(opts.title, opts.entries, opts.lessons, sections, opts.range);

  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    throw new Error("חלון ההדפסה נחסם על ידי הדפדפן — אפשר חלונות קופצים ונסה שוב");
  }
  const fname = opts.filename || `${opts.title.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}`;
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
  </script>
</body>
</html>`);
  win.document.close();
  logAudit("report.export", { detail: `PDF · ${opts.title}`, newValue: { filename: fname } });
}

export function exportXlsxWorkbook(opts: {
  entries: SederEntry[];
  lessons: LearningEntry[];
  filename?: string;
}) {
  const { entries, lessons } = opts;
  const wb = XLSX.utils.book_new();
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
      "הערה": e.note || "",
    };
  });
  const wsSed = XLSX.utils.json_to_sheet(sederRows);
  wsSed["!cols"] = [{ wch: 12 }, { wch: 6 }, { wch: 7 }, { wch: 7 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 9 }, { wch: 18 }, { wch: 16 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsSed, "סדרים");

  const lrnRows = lessons.map((l) => ({
    "תאריך": l.date,
    "מסגרת": FRAMEWORK_LABELS[l.framework],
    "דקות": l.minutes,
    "שעות": +(l.minutes / 60).toFixed(2),
    "מקור": l.source === "timer" ? "טיימר" : l.source === "range" ? "טווח שעות" : "ידני",
  }));
  const wsLrn = XLSX.utils.json_to_sheet(lrnRows);
  wsLrn["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsLrn, "לימוד נוסף");

  const monthly: Record<string, SederEntry[]> = {};
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
      "ציון": attendanceScore(y, m - 1),
    };
  });
  const wsMon = XLSX.utils.json_to_sheet(monthRows);
  XLSX.utils.book_append_sheet(wb, wsMon, "סיכום חודשי");

  const fname = opts.filename || `kollel_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fname);
  logAudit("report.export", { detail: `XLSX · ${fname}` });
}
