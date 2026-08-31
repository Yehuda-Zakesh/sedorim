// Report export — PDF and Excel.
//
// The PDF side is written as real text through src/lib/pdf-doc.ts. It used to
// be a screenshot of a hidden HTML block, which failed outright once the app
// moved to Tailwind 4 (html2canvas cannot parse `oklch()` colours) and, even
// when it worked, produced an image rather than a document. See pdf-doc.ts.
import * as XLSX from "xlsx";
import { saveBinaryFile } from "./save-file";
import {
  type SederEntry,
  type LearningEntry,
  type MonthClosing,
  type MonthlySummary,
  calcSeder,
  summarizeEntries,
  scoreEntries,
  effectiveLearningMin,
  FRAMEWORK_LABELS,
} from "./kollel-store";
import {
  formatHebrewDate,
  hebrewDayLetters,
  hebrewFromGregorian,
  hebrewMonthName,
} from "./hebrew-calendar";
import { getSettings, SHAS_ARRIVAL_DEADLINE } from "./settings-store";
import { colorThemeHex } from "./theme-colors";
import { RtlPdf } from "./pdf-doc";
import { logProblem } from "./diagnostics";

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
  kpis: true,
  monthlyTable: true,
  yearlyBreakdown: true,
  learning: true,
  charts: true,
  excusedSummary: true,
  oheveiList: true,
};

/** How many rows of each detail table a report will carry. */
const ROW_CAPS = { seder: 400, excused: 120, ohevei: 120, learning: 200 };

/**
 * Whether to carry the חבורת ש"ס figures into a report at all.
 *
 * To someone not in the חבורה the count is a column of numbers that mean
 * nothing, so it is left out of the document entirely rather than printed and
 * ignored.
 */
function shasEnabled(): boolean {
  return getSettings().seder.shasChavura === true;
}

const GREGORIAN_MONTHS_HE = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];
const WEEKDAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

const BAR_COLORS = { missing: "#D64B36", excused: "#2F6FD0", bonus: "#2E9E58" };

// ---- formatting -------------------------------------------------------------

/** "20/08/2026" — a Hebrew reader does not want an ISO date in a table. */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d ? `${d}/${m}/${y}` : iso;
}

/** "3.5 שע׳" — minutes are the unit everywhere in the tables, so this is only
 *  used where an hour figure is easier to picture than a four-digit minute
 *  count. */
export function fmtHours(min: number): string {
  return `${(min / 60).toFixed(1)} שע׳`;
}

function weekdayLetter(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : WEEKDAY_LETTERS[d.getDay()];
}

/** "י״ט סיון" — day and month, no year; the year is in the report header. */
function shortHebrewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const h = hebrewFromGregorian(d);
  return `${hebrewDayLetters(h.day)} ${hebrewMonthName(h.month, h.year)}`;
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${GREGORIAN_MONTHS_HE[m - 1] ?? monthKey} ${y}`;
}

function sederLetter(seder: 1 | 2): string {
  return seder === 1 ? "א׳" : "ב׳";
}

function inRange(d: string, range?: { from: string; to: string }) {
  return (!range?.from || d >= range.from) && (!range?.to || d <= range.to);
}

function groupByMonth<T extends { date: string }>(list: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of list) {
    const key = item.date.slice(0, 7);
    const bucket = out.get(key);
    if (bucket) bucket.push(item);
    else out.set(key, [item]);
  }
  return new Map([...out.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
}

function ownerLine(): string {
  const s = getSettings();
  return (
    [s.profile?.name, s.profile?.classroom].filter((v) => v && v.trim()).join(" · ") || "המעקב שלי"
  );
}

function accentColor(): string {
  return colorThemeHex(getSettings().appearance?.colorTheme);
}

function defaultPdfName(title: string): string {
  return `${title.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}`;
}

// ---- the main report --------------------------------------------------------

type LearningTotals = { total: number; effective: number; byFramework: Map<string, number> };

function learningTotals(lessons: LearningEntry[]): LearningTotals {
  const byFramework = new Map<string, number>();
  let total = 0,
    effective = 0;
  for (const l of lessons) {
    total += l.minutes;
    const eff = effectiveLearningMin(l);
    effective += eff;
    byFramework.set(l.framework, (byFramework.get(l.framework) || 0) + eff);
  }
  return { total, effective, byFramework };
}

function writeKpis(pdf: RtlPdf, s: MonthlySummary, learn: LearningTotals, score: number) {
  pdf.kpis([
    { label: "ציון נוכחות (מתוך 100)", value: score },
    { label: "סה״כ דקות חסרות", value: s.totalMissing },
    { label: "מתוכן מוצדקות (דק׳)", value: s.excused },
    { label: "חסר נטו (דק׳)", value: s.netMissing },
    { label: "דקות בונוס", value: s.bonus },
    { label: "מספר איחורים", value: s.lateCount },
    { label: "מספר היעדרויות", value: s.absenceCount },
    { label: "סדרי אוהבי ה׳", value: s.oheveiCount },
    ...(shasEnabled()
      ? [{ label: `חבורת ש״ס — הגעות עד ${SHAS_ARRIVAL_DEADLINE}`, value: s.shasCount }]
      : []),
  ]);
  pdf.note(
    `${s.entries} רישומי סדר · יציאה מוקדמת ${s.earlyDepCount} · ` +
      `חסר נטו ${fmtHours(s.netMissing)} · לימוד נוסף ${fmtHours(learn.effective)}`,
  );
}

function writeBars(pdf: RtlPdf, s: MonthlySummary) {
  pdf.section("פילוח הדקות");
  pdf.bars([
    { label: "חסר שאינו מוצדק", value: s.nonExcused, color: BAR_COLORS.missing },
    { label: "חסר מוצדק", value: s.excused, color: BAR_COLORS.excused },
    { label: "בונוס הגעה מוקדמת", value: s.bonus, color: BAR_COLORS.bonus },
  ]);
  pdf.note("הבונוס מקטין את החסר נטו עד לגובה הסף שהוגדר בהגדרות.");
}

function writeMonthlyBreakdown(
  pdf: RtlPdf,
  byMonth: Map<string, SederEntry[]>,
  lessons: LearningEntry[],
) {
  pdf.section("סיכום לפי חודש");
  const shas = shasEnabled();
  const rows: (string | number)[][] = [];
  const totals = { entries: 0, late: 0, absent: 0, net: 0, bonus: 0, ohevei: 0, shas: 0, learn: 0 };

  for (const [monthKey, entries] of byMonth) {
    const s = summarizeEntries(entries);
    const learn = lessons
      .filter((l) => l.date.startsWith(monthKey))
      .reduce((sum, l) => sum + effectiveLearningMin(l), 0);
    rows.push([
      monthLabel(monthKey),
      s.entries,
      s.lateCount,
      s.absenceCount,
      s.netMissing,
      s.bonus,
      s.oheveiCount,
      ...(shas ? [s.shasCount] : []),
      learn,
      scoreEntries(entries),
    ]);
    totals.entries += s.entries;
    totals.late += s.lateCount;
    totals.absent += s.absenceCount;
    totals.net += s.netMissing;
    totals.bonus += s.bonus;
    totals.ohevei += s.oheveiCount;
    totals.shas += s.shasCount;
    totals.learn += learn;
  }

  pdf.table({
    columns: [
      { header: "חודש", width: 2.1, align: "right" },
      { header: "רישומים", width: 1 },
      { header: "איחורים", width: 1 },
      { header: "היעדרויות", width: 1.1 },
      { header: "חסר נטו (דק׳)", width: 1.05 },
      { header: "בונוס (דק׳)", width: 1 },
      { header: "אוהבי ה׳", width: 1 },
      ...(shas ? [{ header: "חבורת ש״ס", width: 1 }] : []),
      { header: "לימוד נוסף (דק׳)", width: 1.15 },
      { header: "ציון", width: 0.8 },
    ],
    rows,
    total:
      rows.length > 1
        ? [
            `סה״כ (${rows.length} חודשים)`,
            totals.entries,
            totals.late,
            totals.absent,
            totals.net,
            totals.bonus,
            totals.ohevei,
            ...(shas ? [totals.shas] : []),
            totals.learn,
            "",
          ]
        : undefined,
    emptyText: "אין רישומים בטווח שנבחר",
  });
}

function writeSederDetail(pdf: RtlPdf, entries: SederEntry[]) {
  pdf.section("פירוט הסדרים");
  const shown = entries.slice(0, ROW_CAPS.seder);
  pdf.table({
    compact: true,
    columns: [
      { header: "תאריך", width: 1.5, align: "right" },
      { header: "יום", width: 0.6 },
      { header: "תאריך עברי", width: 1.7, align: "right" },
      { header: "סדר", width: 0.6 },
      { header: "הגעה", width: 0.9 },
      { header: "יציאה", width: 0.9 },
      { header: "חסר", width: 0.75 },
      { header: "בונוס", width: 0.75 },
      { header: "מוצדק", width: 0.8 },
      { header: "נטו", width: 0.75 },
      { header: "הערה", width: 1.9, align: "right" },
    ],
    rows: shown.map((e) => {
      const c = calcSeder(e);
      const marks = [
        e.absent ? "היעדרות" : "",
        c.isLate ? "איחור" : "",
        c.isEarlyDeparture ? "יצא מוקדם" : "",
        c.isOhevei ? "אוהבי ה׳" : "",
      ]
        .filter(Boolean)
        .join(", ");
      return [
        fmtDate(e.date),
        weekdayLetter(e.date),
        shortHebrewDate(e.date),
        sederLetter(e.seder),
        e.absent ? "—" : e.arrival || "—",
        e.absent ? "—" : e.departure || "—",
        c.missingMin,
        c.bonusMin,
        c.excusedMin,
        c.netMissingMin,
        [marks, e.note].filter(Boolean).join(" · ") || "—",
      ];
    }),
    emptyText: "אין רישומי סדר בטווח שנבחר",
  });
  if (entries.length > shown.length) {
    pdf.note(
      `מוצגים ${shown.length} רישומים מתוך ${entries.length}. לרשימה המלאה השתמש בייצוא לאקסל.`,
    );
  }
}

function writeExcused(pdf: RtlPdf, entries: SederEntry[], excusedTotal: number) {
  pdf.section("היעדרויות מוצדקות");
  const rows = entries.filter((e) => e.excusedAll || e.excusedMinutes > 0);
  const shown = rows.slice(0, ROW_CAPS.excused);
  pdf.paragraph(`סה״כ דקות מוצדקות בטווח: ${excusedTotal} (${fmtHours(excusedTotal)}).`);
  pdf.table({
    columns: [
      { header: "תאריך", width: 1.2, align: "right" },
      { header: "סדר", width: 0.55 },
      { header: "היקף ההצדקה", width: 1.2 },
      { header: "דקות מוצדקות", width: 1 },
      { header: "סיבה", width: 3, align: "right" },
    ],
    rows: shown.map((e) => [
      fmtDate(e.date),
      sederLetter(e.seder),
      e.excusedAll ? "כל הסדר" : "חלקי",
      calcSeder(e).excusedMin,
      e.excusedReason || "—",
    ]),
    emptyText: "לא נרשמו היעדרויות מוצדקות בטווח",
  });
  if (rows.length > shown.length) pdf.note(`מוצגים ${shown.length} מתוך ${rows.length} רישומים.`);
}

function writeOhevei(pdf: RtlPdf, entries: SederEntry[]) {
  pdf.section("סדרי אוהבי ה׳");
  const rows = entries.filter((e) => calcSeder(e).isOhevei);
  const shown = rows.slice(0, ROW_CAPS.ohevei);
  pdf.paragraph(`סדר שנכח בו מתחילתו ועד סופו — סה״כ ${rows.length} סדרים בטווח.`);
  pdf.table({
    columns: [
      { header: "תאריך", width: 1.3, align: "right" },
      { header: "תאריך עברי", width: 1.7, align: "right" },
      { header: "סדר", width: 0.6 },
      { header: "הגעה", width: 0.9 },
      { header: "יציאה", width: 0.9 },
      { header: "בונוס", width: 0.8 },
    ],
    rows: shown.map((e) => [
      fmtDate(e.date),
      shortHebrewDate(e.date),
      sederLetter(e.seder),
      e.arrival || "—",
      e.departure || "—",
      calcSeder(e).bonusMin,
    ]),
    emptyText: "אין סדרי אוהבי ה׳ בטווח",
  });
  if (rows.length > shown.length) pdf.note(`מוצגים ${shown.length} מתוך ${rows.length} סדרים.`);
}

function writeLearning(pdf: RtlPdf, lessons: LearningEntry[], learn: LearningTotals) {
  pdf.section("לימוד נוסף");
  pdf.facts([
    { label: "סה״כ דקות שנרשמו", value: `${learn.total} (${fmtHours(learn.total)})` },
    {
      label: "דקות אפקטיביות (תענית דיבור נספרת כפול)",
      value: `${learn.effective} (${fmtHours(learn.effective)})`,
    },
    { label: "מספר רישומים", value: String(lessons.length) },
  ]);

  if (learn.byFramework.size) {
    const max = Math.max(...learn.byFramework.values());
    pdf.bars(
      [...learn.byFramework.entries()].map(([fw, minutes]) => ({
        label: FRAMEWORK_LABELS[fw as keyof typeof FRAMEWORK_LABELS] ?? fw,
        value: minutes,
        color: minutes === max ? BAR_COLORS.bonus : BAR_COLORS.excused,
      })),
    );
  }

  const shown = lessons.slice(0, ROW_CAPS.learning);
  pdf.table({
    columns: [
      { header: "תאריך", width: 1.2, align: "right" },
      { header: "מסגרת", width: 2, align: "right" },
      { header: "דקות", width: 0.8 },
      { header: "נחשב", width: 0.8 },
      { header: "מקור", width: 1 },
      { header: "הערה", width: 2, align: "right" },
    ],
    rows: shown.map((l) => [
      fmtDate(l.date),
      FRAMEWORK_LABELS[l.framework],
      l.minutes,
      effectiveLearningMin(l),
      l.source === "timer" ? "טיימר" : l.source === "range" ? "טווח שעות" : "ידני",
      [l.tanitDibur ? "תענית דיבור" : "", l.note].filter(Boolean).join(" · ") || "—",
    ]),
    emptyText: "אין רישומי לימוד בטווח",
  });
  if (lessons.length > shown.length)
    pdf.note(`מוצגים ${shown.length} מתוך ${lessons.length} רישומים.`);
}

/**
 * The full attendance report.
 * Resolves false when the user cancels the save dialog — that is not an error.
 */
export async function exportPdfReport(opts: {
  title: string;
  entries: SederEntry[];
  lessons: LearningEntry[];
  sections?: ReportSections;
  range?: { from: string; to: string };
  filename?: string;
}): Promise<boolean> {
  const sections = opts.sections ?? DEFAULT_SECTIONS;
  const entries = opts.entries.filter((e) => inRange(e.date, opts.range));
  const lessons = opts.lessons.filter((l) => inRange(l.date, opts.range));
  const summary = summarizeEntries(entries);
  const learn = learningTotals(lessons);
  const score = scoreEntries(entries);

  const subtitleParts = [
    opts.range ? `טווח: ${fmtDate(opts.range.from)} – ${fmtDate(opts.range.to)}` : "כל הרישומים",
    `הופק ${formatHebrewDate(new Date())} (${fmtDate(new Date().toISOString().slice(0, 10))})`,
  ];

  try {
    const pdf = await RtlPdf.create({
      title: opts.title,
      subtitle: subtitleParts.join(" · "),
      owner: ownerLine(),
      accent: accentColor(),
    });

    if (sections.kpis) writeKpis(pdf, summary, learn, score);
    if (sections.charts) writeBars(pdf, summary);
    if (sections.yearlyBreakdown) writeMonthlyBreakdown(pdf, groupByMonth(entries), lessons);
    if (sections.monthlyTable) writeSederDetail(pdf, entries);
    if (sections.excusedSummary) writeExcused(pdf, entries, summary.excused);
    if (sections.oheveiList) writeOhevei(pdf, entries);
    if (sections.learning) writeLearning(pdf, lessons, learn);

    return await pdf.save(opts.filename || defaultPdfName(opts.title));
  } catch (err) {
    logProblem(`ייצוא PDF (${opts.title})`, err);
    throw err;
  }
}

// ---- monthly closing lines --------------------------------------------------

function closingRow(c: MonthClosing, shas: boolean): (string | number)[] {
  return [
    `${c.gregorianLabel}${c.closed ? "" : " (פתוח)"}`,
    c.hebrewLabel,
    c.seder.entries,
    c.seder.totalMissing,
    c.seder.excused,
    c.seder.bonus,
    c.seder.netMissing,
    c.seder.oheveiCount,
    ...(shas ? [c.seder.shasCount] : []),
    c.seder.lateCount,
    c.seder.absenceCount,
    c.learning.kollelErev,
    c.learning.toratoBeyado,
  ];
}

/**
 * The month-closing lines — no per-seder detail. One month gets the headline
 * figures in full; several get one row each plus a totals line.
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
  const title =
    opts.title || (single ? `סיכום חודש ${closings[0].gregorianLabel}` : "סיכומי חודשים");

  try {
    const pdf = await RtlPdf.create({
      title,
      subtitle: `נעילת חודש · הופק ${formatHebrewDate(new Date())}`,
      owner: ownerLine(),
      accent: accentColor(),
      footerNote: "שורות סיכום חודשי — מסמך פנימי",
    });

    if (single) {
      const c = closings[0];
      pdf.paragraph(
        `${c.gregorianLabel} · ${c.hebrewLabel}${c.closed ? "" : " — סיכום ביניים, החודש טרם הסתיים"}`,
        { size: 11, weight: "bold" },
      );
      pdf.kpis([
        { label: "סה״כ דקות חסרות", value: c.seder.totalMissing },
        { label: "מתוכן מוצדקות (דק׳)", value: c.seder.excused },
        { label: "חסר נטו (דק׳)", value: c.seder.netMissing },
        { label: "דקות בונוס", value: c.seder.bonus },
        { label: "מספר איחורים", value: c.seder.lateCount },
        { label: "מספר היעדרויות", value: c.seder.absenceCount },
        { label: "סדרי אוהבי ה׳", value: c.seder.oheveiCount },
        ...(shasEnabled()
          ? [{ label: `חבורת ש״ס — הגעות עד ${SHAS_ARRIVAL_DEADLINE}`, value: c.seder.shasCount }]
          : []),
        { label: "רישומי סדר", value: c.seder.entries },
      ]);
      pdf.section("לימוד נוסף בחודש");
      pdf.facts([
        {
          label: "כולל ערב",
          value: `${c.learning.kollelErev} דק׳${
            c.learning.kollelErev !== c.learning.kollelErevRaw
              ? ` (${c.learning.kollelErevRaw} בפועל)`
              : ""
          }`,
        },
        { label: "תורתו בידו", value: `${c.learning.toratoBeyado} דק׳` },
        { label: "ישיבת בין הזמנים", value: `${c.learning.beinHazmanim} דק׳` },
      ]);
      if (c.learning.kollelErev !== c.learning.kollelErevRaw) {
        pdf.note("לימוד בבית בתענית דיבור נספר כפול בסיכום.");
      }
    } else {
      const shas = shasEnabled();
      const t = closings.reduce(
        (a, c) => ({
          entries: a.entries + c.seder.entries,
          totalMissing: a.totalMissing + c.seder.totalMissing,
          excused: a.excused + c.seder.excused,
          bonus: a.bonus + c.seder.bonus,
          net: a.net + c.seder.netMissing,
          ohevei: a.ohevei + c.seder.oheveiCount,
          shas: a.shas + c.seder.shasCount,
          late: a.late + c.seder.lateCount,
          absent: a.absent + c.seder.absenceCount,
          erev: a.erev + c.learning.kollelErev,
          torato: a.torato + c.learning.toratoBeyado,
        }),
        {
          entries: 0,
          totalMissing: 0,
          excused: 0,
          bonus: 0,
          net: 0,
          ohevei: 0,
          shas: 0,
          late: 0,
          absent: 0,
          erev: 0,
          torato: 0,
        },
      );

      pdf.table({
        compact: true,
        columns: [
          { header: "חודש", width: 1.7, align: "right" },
          { header: "חודש עברי", width: 1.7, align: "right" },
          { header: "רישומים", width: 0.9 },
          { header: "סה״כ דק׳", width: 1 },
          { header: "מוצדקות", width: 1 },
          { header: "בונוס", width: 0.85 },
          { header: "חסר נטו", width: 0.95 },
          { header: "אוהבי ה׳", width: 0.95 },
          ...(shas ? [{ header: "חבורת ש״ס", width: 1 }] : []),
          { header: "איחורים", width: 0.95 },
          { header: "היעדרויות", width: 1 },
          { header: "כולל ערב", width: 1 },
          { header: "תורתו בידו", width: 1.05 },
        ],
        rows: closings.map((c) => closingRow(c, shas)),
        total: [
          `סה״כ (${closings.length} חודשים)`,
          "",
          t.entries,
          t.totalMissing,
          t.excused,
          t.bonus,
          t.net,
          t.ohevei,
          ...(shas ? [t.shas] : []),
          t.late,
          t.absent,
          t.erev,
          t.torato,
        ],
      });
      pdf.note("דקות כולל ערב ותורתו בידו — דקות אפקטיביות, כאשר לימוד בתענית דיבור נספר כפול.");
    }

    return await pdf.save(opts.filename || defaultPdfName(title));
  } catch (err) {
    logProblem(`ייצוא PDF (${title})`, err);
    throw err;
  }
}

// ---- Excel ------------------------------------------------------------------

/** Resolves false when the user cancels the save dialog. */
export async function exportXlsxWorkbook(opts: {
  entries: SederEntry[];
  lessons: LearningEntry[];
  filename?: string;
}): Promise<boolean> {
  const { entries, lessons } = opts;
  try {
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    const shas = shasEnabled();

    const sederRows = entries.map((e) => {
      const c = calcSeder(e);
      return {
        תאריך: e.date,
        יום: weekdayLetter(e.date),
        "תאריך עברי": shortHebrewDate(e.date),
        סדר: sederLetter(e.seder),
        הגעה: e.arrival || "",
        יציאה: e.departure || "",
        היעדרות: e.absent ? "כן" : "",
        "חסר (דק׳)": c.missingMin,
        בונוס: c.bonusMin,
        מוצדק: c.excusedMin,
        "חסר נטו": c.netMissingMin,
        "אוהבי ה׳": c.isOhevei ? "כן" : "",
        ...(shas ? { "חבורת ש״ס": c.isShasArrival ? "כן" : "" } : {}),
        סיבה: e.excusedReason || "",
        תגיות: (e.tags || []).join(", "),
        הערה: e.note || "",
      };
    });
    const wsSed = XLSX.utils.json_to_sheet(sederRows);
    // Positional — must track the key order of `sederRows` above, including
    // the optional חבורת ש"ס column.
    wsSed["!cols"] = [
      { wch: 12 },
      { wch: 5 },
      { wch: 16 },
      { wch: 6 },
      { wch: 7 },
      { wch: 7 },
      { wch: 8 },
      { wch: 10 },
      { wch: 8 },
      { wch: 8 },
      { wch: 10 },
      { wch: 9 },
      ...(shas ? [{ wch: 11 }] : []),
      { wch: 18 },
      { wch: 16 },
      { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(wb, wsSed, "סדרים");

    const lrnRows = lessons.map((l) => ({
      תאריך: l.date,
      מסגרת: FRAMEWORK_LABELS[l.framework],
      דקות: l.minutes,
      נחשב: effectiveLearningMin(l),
      שעות: +(l.minutes / 60).toFixed(2),
      "תענית דיבור": l.tanitDibur ? "כן" : "",
      מקור: l.source === "timer" ? "טיימר" : l.source === "range" ? "טווח שעות" : "ידני",
      הערה: l.note || "",
    }));
    const wsLrn = XLSX.utils.json_to_sheet(lrnRows);
    wsLrn["!cols"] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 12 },
      { wch: 12 },
      { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(wb, wsLrn, "לימוד נוסף");

    const monthRows = [...groupByMonth(entries).entries()].map(([monthKey, list]) => {
      const s = summarizeEntries(list);
      const learn = lessons
        .filter((l) => l.date.startsWith(monthKey))
        .reduce((sum, l) => sum + effectiveLearningMin(l), 0);
      return {
        חודש: monthKey,
        "שם החודש": monthLabel(monthKey),
        רישומים: s.entries,
        איחור: s.lateCount,
        היעדרות: s.absenceCount,
        "יציאה מוקדמת": s.earlyDepCount,
        חסר: s.totalMissing,
        מוצדק: s.excused,
        בונוס: s.bonus,
        "חסר נטו": s.netMissing,
        "אוהבי ה׳": s.oheveiCount,
        ...(shas ? { "חבורת ש״ס": s.shasCount } : {}),
        "לימוד נוסף": learn,
        ציון: scoreEntries(list),
      };
    });
    const wsMon = XLSX.utils.json_to_sheet(monthRows);
    XLSX.utils.book_append_sheet(wb, wsMon, "סיכום חודשי");

    const fname = opts.filename || `סדר_פלוס_${new Date().toISOString().slice(0, 10)}.xlsx`;
    // Not XLSX.writeFile(): like jsPDF's save() it relies on `<a download>`,
    // which a WebView ignores. Serialize here and save through Rust instead.
    const bytes = new Uint8Array(
      XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );
    return await saveBinaryFile(fname, bytes);
  } catch (err) {
    logProblem("ייצוא לאקסל", err);
    throw err;
  }
}
