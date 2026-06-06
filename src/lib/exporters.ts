import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { logAudit } from "./audit-store";
import {
  type AttendanceRecord, type LearningItem,
  attendanceRate, countByStatus, currentStreak, inMonth,
} from "./tracker-store";

const STATUS_LABEL: Record<string, string> = {
  present: "נוכח",
  late: "איחור",
  absent: "נעדר",
  excused: "מוצדק",
};

export type ReportSections = {
  kpis: boolean;
  monthlyTable: boolean;
  yearlyBreakdown: boolean;
  learning: boolean;
  charts: boolean;
  excusedSummary: boolean;
};

export const DEFAULT_SECTIONS: ReportSections = {
  kpis: true, monthlyTable: true, yearlyBreakdown: true,
  learning: true, charts: true, excusedSummary: true,
};

function buildReportHTML(
  title: string,
  records: AttendanceRecord[],
  lessons: LearningItem[],
  sections: ReportSections,
  range?: { from: string; to: string },
): string {
  const inRange = records.filter((r) =>
    (!range?.from || r.date >= range.from) && (!range?.to || r.date <= range.to),
  );
  const lessonsInRange = lessons.filter((l) =>
    (!range?.from || l.date >= range.from) && (!range?.to || l.date <= range.to),
  );

  const c = countByStatus(inRange);
  const rate = attendanceRate(inRange);
  const streak = currentStreak(records);

  const now = new Date();
  const y = now.getFullYear();

  // monthly breakdown
  const monthly: Record<string, AttendanceRecord[]> = {};
  for (const r of inRange) {
    const k = r.date.slice(0, 7);
    (monthly[k] = monthly[k] || []).push(r);
  }
  const monthKeys = Object.keys(monthly).sort();

  const totalExcusedMin = inRange.filter((r) => r.status === "excused").length * 0; // unknown
  const totalLearnMin = lessonsInRange.reduce((s, l) => s + l.minutes, 0);

  const kpiHtml = !sections.kpis ? "" : `
    <section class="grid">
      <div class="kpi"><div class="kpi-label">נוכחות</div><div class="kpi-val">${rate}%</div></div>
      <div class="kpi"><div class="kpi-label">סה"כ ימים</div><div class="kpi-val">${inRange.length}</div></div>
      <div class="kpi"><div class="kpi-label">רצף נוכחי</div><div class="kpi-val">${streak}</div></div>
      <div class="kpi"><div class="kpi-label">איחורים</div><div class="kpi-val">${c.late}</div></div>
    </section>
  `;

  const chartHtml = !sections.charts ? "" : `
    <section class="card">
      <h3>פילוח סטטוסים</h3>
      <div class="bars">
        ${(["present","late","absent","excused"] as const).map((k) => {
          const v = c[k]; const max = Math.max(1, c.present + c.late + c.absent + c.excused);
          const pct = Math.round((v / max) * 100);
          return `<div class="bar-row">
            <span class="bar-label">${STATUS_LABEL[k]}</span>
            <div class="bar"><div class="bar-fill bf-${k}" style="width:${pct}%"></div></div>
            <span class="bar-val">${v}</span>
          </div>`;
        }).join("")}
      </div>
    </section>
  `;

  const monthTableHtml = !sections.monthlyTable ? "" : `
    <section class="card">
      <h3>פירוט רישומים</h3>
      <table>
        <thead><tr><th>תאריך</th><th>סטטוס</th><th>הערה</th></tr></thead>
        <tbody>
          ${inRange.slice(0, 200).map((r) => `
            <tr>
              <td>${r.date}</td>
              <td><span class="pill p-${r.status}">${STATUS_LABEL[r.status]}</span></td>
              <td>${(r.note || "").replace(/</g, "&lt;")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      ${inRange.length > 200 ? `<p class="muted">מוצגים 200 מתוך ${inRange.length} רישומים</p>` : ""}
    </section>
  `;

  const yearlyHtml = !sections.yearlyBreakdown ? "" : `
    <section class="card">
      <h3>סיכום חודשי</h3>
      <table>
        <thead><tr><th>חודש</th><th>סה"כ</th><th>נוכח</th><th>איחור</th><th>נעדר</th><th>מוצדק</th><th>%</th></tr></thead>
        <tbody>
          ${monthKeys.map((k) => {
            const recs = monthly[k];
            const mc = countByStatus(recs);
            const mr = attendanceRate(recs);
            return `<tr><td>${k}</td><td>${recs.length}</td><td>${mc.present}</td><td>${mc.late}</td><td>${mc.absent}</td><td>${mc.excused}</td><td>${mr}%</td></tr>`;
          }).join("")}
        </tbody>
      </table>
    </section>
  `;

  const excusedHtml = !sections.excusedSummary ? "" : `
    <section class="card">
      <h3>סיכום היעדרויות מוצדקות</h3>
      <p>סה"כ ימים מוצדקים: <b>${c.excused}</b></p>
      <ul>
        ${inRange.filter((r) => r.status === "excused").slice(0, 20).map((r) =>
          `<li>${r.date}${r.note ? ` — ${r.note}` : ""}</li>`).join("")}
      </ul>
    </section>
  `;

  const learnHtml = !sections.learning ? "" : `
    <section class="card">
      <h3>שיעורי לימוד נוסף</h3>
      <p>סה"כ דקות: <b>${totalLearnMin}</b> (${(totalLearnMin / 60).toFixed(1)} שעות) · ${lessonsInRange.length} שיעורים</p>
      <table>
        <thead><tr><th>תאריך</th><th>נושא</th><th>דקות</th></tr></thead>
        <tbody>
          ${lessonsInRange.slice(0, 100).map((l) => `<tr><td>${l.date}</td><td>${l.topic.replace(/</g, "&lt;")}</td><td>${l.minutes}</td></tr>`).join("")}
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
    #__report .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; }
    #__report .p-present { background:#e8f5e9; color:#2e7d32; }
    #__report .p-late    { background:#fff8e1; color:#a76300; }
    #__report .p-absent  { background:#ffebee; color:#c62828; }
    #__report .p-excused { background:#e3f2fd; color:#1565c0; }
    #__report .bars { display:flex; flex-direction:column; gap:8px; }
    #__report .bar-row { display:grid; grid-template-columns: 70px 1fr 40px; align-items:center; gap:10px; font-size:12px; }
    #__report .bar { height:14px; background:#eef2f7; border-radius:7px; overflow:hidden; }
    #__report .bar-fill { height:100%; border-radius:7px; }
    #__report .bf-present { background:#4CAF50; }
    #__report .bf-late    { background:#FFC107; }
    #__report .bf-absent  { background:#F44336; }
    #__report .bf-excused { background:#2196F3; }
    #__report .muted { color:#5a6478; font-size:11px; margin-top:8px; }
    #__report .footer { margin-top:24px; padding-top:12px; border-top:1px solid #eef2f7; color:#5a6478; font-size:10px; display:flex; justify-content:space-between; }
    #__report ul { margin:0; padding-right:18px; font-size:12px; }
    #__report ul li { margin:4px 0; }
  </style>

  <header style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #1565C0; padding-bottom:14px; margin-bottom:20px;">
    <div>
      <h1>${title}</h1>
      <div class="sub">${range ? `טווח: ${range.from} → ${range.to}` : `שנה ${y}`} · הופק בתאריך ${new Date().toLocaleDateString("he-IL")}</div>
    </div>
    <div style="text-align:left; color:#1E3A5F; font-weight:700;">המעקב שלי</div>
  </header>

  ${kpiHtml}
  ${chartHtml}
  ${yearlyHtml}
  ${monthTableHtml}
  ${excusedHtml}
  ${learnHtml}

  <div class="footer">
    <span>דוח אישי — מסמך פנימי</span>
    <span>עמוד יצירה אוטומטית · המעקב שלי</span>
  </div>
</div>`;
}

export async function exportPdfReport(opts: {
  title: string;
  records: AttendanceRecord[];
  lessons: LearningItem[];
  sections?: ReportSections;
  range?: { from: string; to: string };
  filename?: string;
}) {
  const sections = opts.sections ?? DEFAULT_SECTIONS;
  const html = buildReportHTML(opts.title, opts.records, opts.lessons, sections, opts.range);

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;top:-99999px;right:-99999px;pointer-events:none;";
  host.innerHTML = html;
  document.body.appendChild(host);
  const node = host.firstElementChild as HTMLElement;

  try {
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
    }

    const fname = opts.filename || `${opts.title.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(fname);
    logAudit("report.export", { detail: `PDF · ${opts.title}`, newValue: { filename: fname } });
  } finally {
    document.body.removeChild(host);
  }
}

export function exportXlsxWorkbook(opts: {
  records: AttendanceRecord[];
  lessons: LearningItem[];
  filename?: string;
}) {
  const { records, lessons } = opts;
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };

  const attRows = records.map((r) => ({
    "תאריך": r.date,
    "סטטוס": STATUS_LABEL[r.status] || r.status,
    "הערה": r.note || "",
    "תגיות": (r.tags || []).join(", "),
  }));
  const wsAtt = XLSX.utils.json_to_sheet(attRows);
  wsAtt["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 40 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsAtt, "נוכחות");

  const lrnRows = lessons.map((l) => ({
    "תאריך": l.date,
    "נושא": l.topic,
    "דקות": l.minutes,
    "שעות": +(l.minutes / 60).toFixed(2),
  }));
  const wsLrn = XLSX.utils.json_to_sheet(lrnRows);
  wsLrn["!cols"] = [{ wch: 14 }, { wch: 30 }, { wch: 8 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, wsLrn, "לימוד");

  const monthly: Record<string, AttendanceRecord[]> = {};
  for (const r of records) (monthly[r.date.slice(0, 7)] = monthly[r.date.slice(0, 7)] || []).push(r);
  const monthRows = Object.keys(monthly).sort().map((k) => {
    const recs = monthly[k];
    const c = countByStatus(recs);
    return {
      "חודש": k,
      'סה"כ ימים': recs.length,
      "נוכח": c.present,
      "איחור": c.late,
      "נעדר": c.absent,
      "מוצדק": c.excused,
      "אחוז נוכחות": `${attendanceRate(recs)}%`,
    };
  });
  const wsMon = XLSX.utils.json_to_sheet(monthRows);
  wsMon["!cols"] = [{ wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsMon, "סיכום חודשי");

  const now = new Date();
  const curMonth = inMonth(records, now.getFullYear(), now.getMonth());
  const overall = countByStatus(records);
  const statRows = [
    { "מדד": 'סה"כ רישומים', "ערך": records.length },
    { "מדד": "אחוז נוכחות כולל", "ערך": `${attendanceRate(records)}%` },
    { "מדד": "אחוז נוכחות החודש", "ערך": `${attendanceRate(curMonth)}%` },
    { "מדד": "רצף נוכחי", "ערך": currentStreak(records) },
    { "מדד": "נוכח (סה״כ)", "ערך": overall.present },
    { "מדד": "איחור (סה״כ)", "ערך": overall.late },
    { "מדד": "נעדר (סה״כ)", "ערך": overall.absent },
    { "מדד": "מוצדק (סה״כ)", "ערך": overall.excused },
    { "מדד": "שעות לימוד נוסף", "ערך": +(lessons.reduce((s, l) => s + l.minutes, 0) / 60).toFixed(1) },
  ];
  const wsStat = XLSX.utils.json_to_sheet(statRows);
  wsStat["!cols"] = [{ wch: 24 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsStat, "סטטיסטיקות");

  const fname = opts.filename || `tracker_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fname);
  logAudit("report.export", { detail: `XLSX · ${fname}` });
}
