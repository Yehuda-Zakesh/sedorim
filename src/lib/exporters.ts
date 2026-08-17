import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { logAudit } from "./audit-store";
import { saveBinaryFile } from "./save-file";
import {
  type SederEntry, type LearningEntry, type MonthClosing,
  calcSeder, monthlySummary, attendanceScore, FRAMEWORK_LABELS,
} from "./kollel-store";
import { formatHebrewDate } from "./hebrew-calendar";
import { getSettings } from "./settings-store";
import { colorThemeHex } from "./theme-colors";

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

/** A4 width at 96dpi. The report is laid out at exactly this width so the
 *  rasterized image maps 1:1 onto the page with no rescaling blur. */
const REPORT_WIDTH_PX = 794;

/** Escapes text coming from user records before it goes into report HTML. */
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  ));
}

// Shared print shell for every PDF this module produces.
//
// Two rules govern everything in here, both learned the hard way:
//
//  1. Every colour is a hex literal, and `border-color` is forced with
//     !important. The app's own base layer sets `* { border-color:
//     var(--color-border) }`, which computes to an oklch() colour — and
//     html2canvas 1.4.1 throws outright on any colour function it doesn't
//     know. Since the report is rendered inside the live document, it
//     inherits that rule unless we override it here.
//  2. Nothing may be wider than the shell. Anything overflowing 794px is
//     simply cropped out of the canvas, which is what made the wide
//     month-closing table come out cut off. Hence table-layout:fixed,
//     wrapping headers, and no white-space:nowrap anywhere.
function reportShell(title: string, subtitle: string, body: string): string {
  const settings = getSettings();
  const accent = colorThemeHex(settings.appearance?.colorTheme);
  const owner = [settings.profile?.name, settings.profile?.classroom]
    .filter((s) => s && s.trim())
    .join(" · ") || "המעקב שלי";

  return `
<div id="__report" dir="rtl" lang="he">
  <style>
    #__report, #__report *, #__report *::before, #__report *::after {
      box-sizing:border-box;
      border-color:#dfe5ee !important;
      outline-color:#dfe5ee !important;
      box-shadow:none !important;
      text-shadow:none !important;
      background-image:none !important;
      -webkit-text-stroke-color:#1f2430 !important;
      text-decoration-color:#1f2430 !important;
      overflow-wrap:break-word;
    }
    #__report {
      width:${REPORT_WIDTH_PX}px; padding:34px 38px; background:#ffffff; color:#1f2430;
      font-family:'Heebo','Segoe UI',Arial,sans-serif; font-size:12.5px; line-height:1.55;
    }
    #__report h1 { font-size:25px; line-height:1.25; margin:0 0 4px; color:#1c2536; font-weight:700; }
    #__report .sub { color:#5a6478; font-size:12px; }
    #__report .brand { text-align:left; font-weight:700; color:${accent}; font-size:13px; }
    #__report .brand small { display:block; font-weight:400; color:#5a6478; font-size:10.5px; margin-top:2px; }

    #__report .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:18px; }
    #__report .kpi { border:1px solid #dfe5ee; border-radius:10px; padding:12px; background:#f7f9fc; }
    #__report .kpi-label { font-size:10.5px; color:#5a6478; line-height:1.35; }
    #__report .kpi-val { font-size:22px; font-weight:700; color:${accent}; margin-top:4px; }

    #__report .card { border:1px solid #dfe5ee; border-radius:12px; padding:16px 18px; margin-bottom:14px; background:#ffffff; }
    #__report .card h3 { margin:0 0 10px; font-size:14.5px; color:#1c2536; border-bottom:1px solid #eef2f7; padding-bottom:8px; font-weight:700; }
    #__report .card > p { margin:0 0 10px; }

    #__report table { width:100%; table-layout:fixed; border-collapse:collapse; font-size:11.5px; word-break:break-word; }
    #__report th, #__report td { padding:6px 8px; text-align:right; border-bottom:1px solid #eef2f7; vertical-align:top; }
    #__report th { background:#f4f7fb; font-weight:600; color:#3a4761; font-size:11px; line-height:1.3; }
    #__report td.num, #__report th.num { text-align:center; }
    #__report table.compact { font-size:10px; }
    #__report table.compact th, #__report table.compact td { padding:5px 3px; }
    #__report table.compact th { font-size:9.5px; }
    #__report tr.total td { background:#f4f7fb; font-weight:700; border-top:2px solid #c8d3e4; }
    #__report tbody tr:nth-child(even) td { background:#fbfcfe; }
    #__report tbody tr.total:nth-child(even) td { background:#f4f7fb; }

    #__report .bars { display:flex; flex-direction:column; gap:8px; }
    #__report .bar-row { display:grid; grid-template-columns:135px 1fr 56px; align-items:center; gap:10px; font-size:11.5px; }
    #__report .bar { height:13px; background:#eef2f7; border-radius:7px; overflow:hidden; }
    #__report .bar-fill { height:100%; border-radius:7px; }
    #__report .bar-val { text-align:left; font-weight:600; }

    #__report .muted { color:#5a6478; font-size:10.5px; margin:8px 0 0; }
    #__report ul { margin:0; padding-right:18px; font-size:11.5px; }
    #__report ul li { margin:3px 0; }
    #__report .empty { color:#8a93a6; font-size:11.5px; font-style:italic; }
    #__report .footer { margin-top:20px; padding-top:10px; border-top:1px solid #eef2f7; color:#7a8398; font-size:10px; display:flex; justify-content:space-between; }
  </style>

  <header style="display:flex; justify-content:space-between; align-items:flex-end; gap:20px; border-bottom:3px solid ${accent}; padding-bottom:12px; margin-bottom:18px;">
    <div style="min-width:0;">
      <h1>${esc(title)}</h1>
      <div class="sub">${subtitle}</div>
    </div>
    <div class="brand">סדר פלוס<small>${esc(owner)}</small></div>
  </header>

  ${body}

  <div class="footer">
    <span>דוח אישי — מסמך פנימי</span>
    <span>הופק אוטומטית · סדר פלוס</span>
  </div>
</div>`;
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
          { k: "missing", l: "חסרות (לא מוצדק)", v: nonExcused, color: "#E5533D" },
          { k: "excused", l: "מוצדק", v: excused, color: "#2F80ED" },
          { k: "bonus", l: "בונוס", v: bonus, color: "#3EA55E" },
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
        <colgroup><col style="width:16%"><col span="7"></colgroup>
        <thead><tr><th>חודש</th><th class="num">רישומים</th><th class="num">איחור</th><th class="num">היעדרות</th><th class="num">חסר נטו</th><th class="num">בונוס</th><th class="num">אוהבי ה׳</th><th class="num">ציון</th></tr></thead>
        <tbody>
          ${monthKeys.length === 0 ? `<tr><td colspan="8" class="empty">אין נתונים בטווח</td></tr>` : monthKeys.map((k) => {
            const [y, m] = k.split("-").map(Number);
            const s = monthlySummary(y, m - 1);
            const score = attendanceScore(y, m - 1);
            return `<tr><td>${k}</td><td class="num">${s.entries}</td><td class="num">${s.lateCount}</td><td class="num">${s.absenceCount}</td><td class="num">${s.netMissing}</td><td class="num">${s.bonus}</td><td class="num">${s.oheveiCount}</td><td class="num">${score}</td></tr>`;
          }).join("")}
        </tbody>
      </table>
    </section>
  `;

  const monthTableHtml = !sections.monthlyTable ? "" : `
    <section class="card">
      <h3>פירוט סדרים</h3>
      <table>
        <colgroup><col style="width:17%"><col style="width:8%"><col style="width:11%"><col style="width:11%"><col span="4"></colgroup>
        <thead><tr><th>תאריך</th><th class="num">סדר</th><th class="num">הגעה</th><th class="num">יציאה</th><th class="num">חסר</th><th class="num">בונוס</th><th class="num">מוצדק</th><th class="num">אוהבי ה׳</th></tr></thead>
        <tbody>
          ${ents.length === 0 ? `<tr><td colspan="8" class="empty">אין רישומים בטווח</td></tr>` : ents.slice(0, 200).map((e) => {
            const c = calcSeder(e);
            return `<tr>
              <td>${e.date}</td>
              <td class="num">${e.seder === 1 ? "א׳" : "ב׳"}</td>
              <td class="num">${e.absent ? "—" : (e.arrival || "—")}</td>
              <td class="num">${e.absent ? "—" : (e.departure || "—")}</td>
              <td class="num">${c.missingMin}</td>
              <td class="num">${c.bonusMin}</td>
              <td class="num">${c.excusedMin}</td>
              <td class="num">${c.isOhevei ? "✓" : ""}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      ${ents.length > 200 ? `<p class="muted">מוצגים 200 מתוך ${ents.length} רישומים</p>` : ""}
    </section>
  `;

  const excusedRows = ents.filter((e) => e.excusedAll || e.excusedMinutes > 0);
  const excusedHtml = !sections.excusedSummary ? "" : `
    <section class="card">
      <h3>סיכום היעדרויות מוצדקות</h3>
      <p>סה"כ דקות מוצדקות: <b>${excused}</b></p>
      ${excusedRows.length === 0 ? `<p class="empty">אין היעדרויות מוצדקות בטווח</p>` : `<ul>
        ${excusedRows.slice(0, 30).map((e) =>
          `<li>${e.date} · סדר ${e.seder === 1 ? "א׳" : "ב׳"} — ${e.excusedAll ? "כל הסדר" : `${e.excusedMinutes} דק׳`}${e.excusedReason ? ` — ${esc(e.excusedReason)}` : ""}</li>`).join("")}
      </ul>`}
      ${excusedRows.length > 30 ? `<p class="muted">מוצגים 30 מתוך ${excusedRows.length} רישומים</p>` : ""}
    </section>
  `;

  const oheveiRows = ents.filter((e) => calcSeder(e).isOhevei);
  const oheveiHtml = !sections.oheveiList ? "" : `
    <section class="card">
      <h3>רשימת סדרי "אוהבי ה׳"</h3>
      <p>סה"כ: <b>${oheveiCount}</b></p>
      ${oheveiRows.length === 0 ? `<p class="empty">אין סדרי אוהבי ה׳ בטווח</p>` : `<ul>
        ${oheveiRows.slice(0, 50).map((e) =>
          `<li>${e.date} · סדר ${e.seder === 1 ? "א׳" : "ב׳"}</li>`).join("")}
      </ul>`}
      ${oheveiRows.length > 50 ? `<p class="muted">מוצגים 50 מתוך ${oheveiRows.length} רישומים</p>` : ""}
    </section>
  `;

  const learnHtml = !sections.learning ? "" : `
    <section class="card">
      <h3>לימוד נוסף</h3>
      <p>סה"כ: <b>${totalLearnMin}</b> דק׳ (${(totalLearnMin / 60).toFixed(1)} שעות) · ${lsns.length} רישומים</p>
      <table>
        <colgroup><col style="width:22%"><col><col style="width:18%"></colgroup>
        <thead><tr><th>תאריך</th><th>מסגרת</th><th class="num">דקות</th></tr></thead>
        <tbody>
          ${lsns.length === 0 ? `<tr><td colspan="3" class="empty">אין רישומי לימוד בטווח</td></tr>` : lsns.slice(0, 100).map((l) =>
            `<tr><td>${l.date}</td><td>${FRAMEWORK_LABELS[l.framework]}</td><td class="num">${l.minutes}</td></tr>`).join("")}
        </tbody>
      </table>
      ${lsns.length > 100 ? `<p class="muted">מוצגים 100 מתוך ${lsns.length} רישומים</p>` : ""}
    </section>
  `;

  return reportShell(
    title,
    `${range ? `טווח: ${range.from} → ${range.to} · ` : ""}הופק ${heDate}`,
    `${kpiHtml}
  ${chartHtml}
  ${yearlyHtml}
  ${monthTableHtml}
  ${excusedHtml}
  ${oheveiHtml}
  ${learnHtml}`,
  );
}

/** How much the canvas is oversampled relative to CSS pixels. */
const RASTER_SCALE = 2;

/**
 * Y positions (in canvas pixels, measured from the top of the report) where a
 * page may be cut without slicing through content.
 *
 * Only whole blocks count: the bottom edge of a section, a table, a table body
 * row, a list item, a bar. Headings and paragraphs are deliberately left out —
 * breaking straight after a heading would strand it alone at the foot of a
 * page.
 */
function pageBreakOffsets(root: HTMLElement): number[] {
  if (typeof root.querySelectorAll !== "function" || typeof root.getBoundingClientRect !== "function") {
    return []; // not a real layout (tests) — fall back to fixed-height slices
  }
  const top = root.getBoundingClientRect().top;
  const offsets = new Set<number>();
  const blocks = root.querySelectorAll<HTMLElement>("section, table, tbody tr, ul li, .bar-row, .grid");
  blocks.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return;
    offsets.add(Math.round((rect.bottom - top) * RASTER_SCALE));
  });
  return [...offsets].sort((a, b) => a - b);
}

/**
 * Splits the rasterized report into page-sized slices, preferring to cut on one
 * of `breaks` so no row or card is severed mid-way. Falls back to a full-height
 * cut when a single block is taller than a page (nothing else can be done) or
 * when the only available break would leave the page mostly empty.
 */
export function sliceIntoPages(totalPx: number, pageSlicePx: number, breaks: number[]): { from: number; to: number }[] {
  const pages: { from: number; to: number }[] = [];
  // Never waste more than this much of a page hunting for a clean break.
  const minFill = pageSlicePx * 0.55;
  let y = 0;
  while (y < totalPx) {
    const hardEnd = Math.min(y + pageSlicePx, totalPx);
    let end = hardEnd;
    if (hardEnd < totalPx) {
      let best = -1;
      for (const b of breaks) {
        if (b <= y) continue;
        if (b > hardEnd) break;
        if (b - y >= minFill) best = b;
      }
      // A couple of pixels past the edge so the block's own border is not
      // shaved off by the cut.
      if (best > 0) end = Math.min(best + RASTER_SCALE * 2, hardEnd);
    }
    if (end <= y) end = hardEnd; // safety: always make progress
    pages.push({ from: y, to: end });
    y = end;
  }
  return pages;
}

/**
 * Rasterizes report HTML (a #__report block from reportShell) into a paginated
 * A4 PDF and hands the bytes to the native save dialog.
 * Resolves false when the user cancels that dialog.
 */
async function renderHtmlToPdf(html: string, fname: string): Promise<boolean> {
  // Render the report HTML into a hidden off-screen container in the current
  // page, rasterize it with html2canvas, and write a real PDF file with jsPDF.
  // No new window, no print dialog. Fonts are whatever the app already loads
  // (Heebo via the app shell), so Hebrew/RTL renders correctly.
  //
  // The host is only *visually* off-screen, never `display:none` and never
  // zero-width: html2canvas measures real layout, and a hidden host rasterizes
  // to nothing.
  const host = document.createElement("div");
  host.setAttribute("dir", "rtl");
  host.setAttribute("lang", "he");
  host.style.cssText =
    `position:fixed;top:0;left:-10000px;width:${REPORT_WIDTH_PX}px;background:#fff;z-index:-1;pointer-events:none;`;
  host.innerHTML = html;
  document.body.appendChild(host);

  try {
    // Wait for fonts (Heebo) before rasterizing so glyphs are correct.
    if ((document as any).fonts?.ready) {
      try { await (document as any).fonts.ready; } catch { /* ignore */ }
    }
    // Give layout a tick.
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const target = host.querySelector("#__report") as HTMLElement | null;
    const node = target || host;

    const canvas = await html2canvas(node, {
      scale: RASTER_SCALE,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: REPORT_WIDTH_PX,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8; // mm
    const imgW = pageW - margin * 2;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pageH - margin * 2) {
      // PNG, not JPEG: at this size the chroma subsampling in a JPEG visibly
      // furs the edges of Hebrew text, and a mostly-white page compresses well.
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin, margin, imgW, imgH);
    } else {
      const pxPerMm = canvas.width / imgW;
      const pageSlicePx = Math.floor((pageH - margin * 2) * pxPerMm);
      const pages = sliceIntoPages(canvas.height, pageSlicePx, pageBreakOffsets(node));

      pages.forEach(({ from, to }, i) => {
        const sliceH = to - from;
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, from, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        if (i > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/png"), "PNG", margin, margin, imgW, sliceH / pxPerMm);
        // Digits and "/" only — jsPDF's built-in fonts have no Hebrew glyphs,
        // so anything else would come out as boxes.
        if (typeof pdf.text === "function") {
          pdf.setFontSize(8);
          pdf.setTextColor(140);
          pdf.text(`${i + 1} / ${pages.length}`, pageW / 2, pageH - 3, { align: "center" });
        }
      });
    }

    // Not pdf.save(): that builds an <a download>, which does nothing inside
    // a WebView. Hand the bytes to the native save dialog instead.
    const bytes = new Uint8Array(pdf.output("arraybuffer") as ArrayBuffer);
    return await saveBinaryFile(`${fname}.pdf`, bytes); // false = cancelled
  } finally {
    host.remove();
  }
}

function defaultPdfName(title: string): string {
  return `${title.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}`;
}

/** Resolves false when the user cancels the save dialog. */
export async function exportPdfReport(opts: {
  title: string;
  entries: SederEntry[];
  lessons: LearningEntry[];
  sections?: ReportSections;
  range?: { from: string; to: string };
  filename?: string;
}): Promise<boolean> {
  const sections = opts.sections ?? DEFAULT_SECTIONS;
  const html = buildReportHTML(opts.title, opts.entries, opts.lessons, sections, opts.range);
  const fname = opts.filename || defaultPdfName(opts.title);
  if (!(await renderHtmlToPdf(html, fname))) return false;
  logAudit("report.export", { detail: `PDF · ${opts.title}`, newValue: { filename: fname } });
  return true;
}

function closingKpiHtml(c: MonthClosing): string {
  const kpi = (label: string, value: string | number) =>
    `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-val">${value}</div></div>`;
  return `
    <section class="card">
      <h3>${c.gregorianLabel} · ${c.hebrewLabel}${c.closed ? "" : " — סיכום ביניים (החודש טרם הסתיים)"}</h3>
      <div class="grid">
        ${kpi("סה״כ דקות", c.seder.totalMissing)}
        ${kpi("מתוכן מוצדקות", c.seder.excused)}
        ${kpi("סדרי אוהבי ה׳", c.seder.oheveiCount)}
        ${kpi("איחורים", c.seder.lateCount)}
        ${kpi("חיסורים", c.seder.absenceCount)}
        ${kpi("דקות כולל ערב", c.learning.kollelErev)}
        ${kpi("דקות תורתו בידו", c.learning.toratoBeyado)}
        ${kpi("חסר נטו", c.seder.netMissing)}
      </div>
      <p class="muted">${c.seder.entries} רישומי סדר · בונוס ${c.seder.bonus} דק׳ · לא מוצדק ${c.seder.nonExcused} דק׳${
        c.learning.kollelErev !== c.learning.kollelErevRaw
          ? ` · כולל ערב בפועל ${c.learning.kollelErevRaw} דק׳ (תענית דיבור נספרת כפול)`
          : ""
      }</p>
    </section>`;
}

function closingTableHtml(closings: MonthClosing[]): string {
  const t = closings.reduce((a, c) => ({
    entries: a.entries + c.seder.entries,
    totalMissing: a.totalMissing + c.seder.totalMissing,
    excused: a.excused + c.seder.excused,
    bonus: a.bonus + c.seder.bonus,
    netMissing: a.netMissing + c.seder.netMissing,
    ohevei: a.ohevei + c.seder.oheveiCount,
    late: a.late + c.seder.lateCount,
    absent: a.absent + c.seder.absenceCount,
    erev: a.erev + c.learning.kollelErev,
    torato: a.torato + c.learning.toratoBeyado,
  }), { entries: 0, totalMissing: 0, excused: 0, bonus: 0, netMissing: 0, ohevei: 0, late: 0, absent: 0, erev: 0, torato: 0 });

  return `
    <section class="card">
      <h3>שורות סיכום חודשי</h3>
      <table class="compact">
        <colgroup><col style="width:19%"><col span="10"></colgroup>
        <thead><tr>
          <th>חודש</th><th class="num">רישומים</th><th class="num">סה״כ דקות</th><th class="num">מוצדקות</th><th class="num">בונוס</th><th class="num">חסר נטו</th>
          <th class="num">אוהבי ה׳</th><th class="num">איחורים</th><th class="num">חיסורים</th><th class="num">כולל ערב</th><th class="num">תורתו בידו</th>
        </tr></thead>
        <tbody>
          ${closings.map((c) => `<tr>
            <td>${c.gregorianLabel}<br><span class="muted">${c.hebrewLabel}${c.closed ? "" : " · פתוח"}</span></td>
            <td class="num">${c.seder.entries}</td>
            <td class="num">${c.seder.totalMissing}</td>
            <td class="num">${c.seder.excused}</td>
            <td class="num">${c.seder.bonus}</td>
            <td class="num">${c.seder.netMissing}</td>
            <td class="num">${c.seder.oheveiCount}</td>
            <td class="num">${c.seder.lateCount}</td>
            <td class="num">${c.seder.absenceCount}</td>
            <td class="num">${c.learning.kollelErev}</td>
            <td class="num">${c.learning.toratoBeyado}</td>
          </tr>`).join("")}
          <tr class="total">
            <td>סה״כ (${closings.length} חודשים)</td>
            <td class="num">${t.entries}</td><td class="num">${t.totalMissing}</td><td class="num">${t.excused}</td><td class="num">${t.bonus}</td>
            <td class="num">${t.netMissing}</td><td class="num">${t.ohevei}</td><td class="num">${t.late}</td><td class="num">${t.absent}</td>
            <td class="num">${t.erev}</td><td class="num">${t.torato}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted">דקות כולל ערב ותורתו בידו — דקות אפקטיביות, כאשר לימוד בתענית דיבור נספר כפול.</p>
    </section>`;
}

/**
 * Monthly closing lines only — no per-seder detail. One month renders as a KPI
 * card, several render as one summary row each plus a totals row.
 * Resolves false when the user cancels the save dialog.
 */
export async function exportMonthClosingsPdf(opts: {
  closings: MonthClosing[];
  title?: string;
  filename?: string;
}): Promise<boolean> {
  const { closings } = opts;
  if (!closings.length) return false;
  const single = closings.length === 1;
  const title = opts.title || (single ? `סיכום חודש ${closings[0].gregorianLabel}` : "סיכומי חודשים");
  const body = single ? closingKpiHtml(closings[0]) : closingTableHtml(closings);
  const html = reportShell(title, `נעילת חודש · הופק ${formatHebrewDate(new Date())}`, body);
  const fname = opts.filename || defaultPdfName(title);
  if (!(await renderHtmlToPdf(html, fname))) return false;
  logAudit("report.export", { detail: `PDF · ${title}`, newValue: { filename: fname, months: closings.map((c) => c.monthKey) } });
  return true;
}

/** Resolves false when the user cancels the save dialog. */
export async function exportXlsxWorkbook(opts: {
  entries: SederEntry[];
  lessons: LearningEntry[];
  filename?: string;
}): Promise<boolean> {
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
  // Not XLSX.writeFile(): like jsPDF's save() it relies on <a download>,
  // which a WebView ignores. Serialize here and save through Rust instead.
  const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  if (!(await saveBinaryFile(fname, bytes))) return false; // cancelled
  logAudit("report.export", { detail: `XLSX · ${fname}` });
  return true;
}
