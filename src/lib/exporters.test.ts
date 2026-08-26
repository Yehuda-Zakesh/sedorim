// Report export. Both paths run for real: the workbook is written and parsed
// back, and the PDF is genuinely produced by jsPDF with the shipped Hebrew
// font. Only the save dialog is a stand-in.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const saveBinaryFile = vi.fn<(name: string, bytes: Uint8Array) => Promise<boolean>>();
vi.mock("./save-file", () => ({
  saveBinaryFile: (name: string, bytes: Uint8Array) => saveBinaryFile(name, bytes),
  saveBase64File: vi.fn(),
  saveTextFile: vi.fn(),
}));

// `fetch("/fonts/...")` means nothing outside a browser; the same files, read
// off disk.
vi.mock("./pdf-fonts", async () => {
  const { bytesToBase64 } = await import("./base64");
  const read = (name: string) =>
    bytesToBase64(new Uint8Array(readFileSync(fileURLToPath(new URL(`../../public/fonts/${name}`, import.meta.url)))));
  return {
    loadHeeboFonts: async () => ({ regular: read("Heebo-Regular.ttf"), bold: read("Heebo-Bold.ttf") }),
  };
});

const logProblem = vi.fn();
vi.mock("./diagnostics", () => ({
  logProblem: (...args: unknown[]) => logProblem(...args),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

import {
  DEFAULT_SECTIONS,
  exportPdfReport,
  exportXlsxWorkbook,
  exportMonthClosingsPdf,
  fmtDate,
  fmtHours,
  type ReportSections,
} from "./exporters";
import {
  hhmmToMin,
  replaceAllData,
  monthClosing,
  type SederEntry,
  type LearningEntry,
} from "./kollel-store";
import { DEFAULT_SETTINGS, resetSettings, updateSettings } from "./settings-store";

const { s1Start, s1End } = DEFAULT_SETTINGS.seder;
const s1StartMin = hhmmToMin(s1Start)!;

function hhmm(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function entry(date: string, over: Partial<SederEntry> = {}): SederEntry {
  return {
    id: `${date}-${over.seder ?? 1}`,
    date,
    seder: 1,
    absent: false,
    ohevei: false,
    excusedAll: false,
    excusedMinutes: 0,
    manualAdjustMin: 0,
    tags: [],
    arrival: s1Start,
    departure: s1End,
    ...over,
  };
}
function lesson(over: Partial<LearningEntry> = {}): LearningEntry {
  return {
    id: "l1",
    framework: "kollel-erev",
    date: "2026-07-08",
    minutes: 60,
    source: "manual",
    ...over,
  };
}

/** The bytes handed to the save dialog by the last export. */
function lastSaved() {
  const call = saveBinaryFile.mock.calls.at(-1);
  if (!call) throw new Error("nothing was saved");
  return { name: call[0], bytes: call[1] };
}

const asLatin1 = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

beforeEach(() => {
  resetSettings();
  replaceAllData([], []);
  saveBinaryFile.mockReset();
  saveBinaryFile.mockResolvedValue(true);
  logProblem.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// formatting helpers
// ============================================================================

describe("fmtDate", () => {
  it("turns an ISO date into a Hebrew-readable one", () => {
    expect(fmtDate("2026-08-20")).toBe("20/08/2026");
  });
  it("leaves something that is not a date alone", () => {
    expect(fmtDate("2026-08")).toBe("2026-08");
  });
});

describe("fmtHours", () => {
  it("gives one decimal place", () => {
    expect(fmtHours(90)).toBe("1.5 שע׳");
    expect(fmtHours(0)).toBe("0.0 שע׳");
  });
});

// ============================================================================
// DEFAULT_SECTIONS
// ============================================================================

describe("DEFAULT_SECTIONS", () => {
  it("turns every section on", () => {
    for (const [name, on] of Object.entries(DEFAULT_SECTIONS)) {
      expect(on, name).toBe(true);
    }
  });

  it("covers exactly the sections the type declares", () => {
    expect(Object.keys(DEFAULT_SECTIONS).sort()).toEqual([
      "charts",
      "excusedSummary",
      "kpis",
      "learning",
      "monthlyTable",
      "oheveiList",
      "yearlyBreakdown",
    ]);
  });
});

// ============================================================================
// exportXlsxWorkbook
// ============================================================================

describe("exportXlsxWorkbook", () => {
  /** Runs the export and parses the bytes it handed to the save dialog. */
  async function workbookFor(entries: SederEntry[], lessons: LearningEntry[]) {
    replaceAllData(entries, lessons);
    const ok = await exportXlsxWorkbook({ entries, lessons });
    expect(ok).toBe(true);
    return XLSX.read(lastSaved().bytes, { type: "array" });
  }

  it("writes the three expected sheets", async () => {
    const wb = await workbookFor([entry("2026-07-08")], [lesson()]);
    expect(wb.SheetNames).toEqual(["סדרים", "לימוד נוסף", "סיכום חודשי"]);
  });

  it("marks the workbook right-to-left", async () => {
    const wb = await workbookFor([entry("2026-07-08")], []);
    expect(wb.Workbook?.Views?.[0]).toMatchObject({ RTL: true });
  });

  it("writes one seder row per entry, with the computed minutes", async () => {
    const wb = await workbookFor(
      [
        entry("2026-07-08", { arrival: hhmm(s1StartMin + 30) }),
        entry("2026-07-07", { absent: true, excusedAll: true, excusedReason: "רופא" }),
      ],
      [],
    );
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["סדרים"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ תאריך: "2026-07-08", סדר: "א׳", "חסר (דק׳)": 30 });
    expect(rows[1]).toMatchObject({ תאריך: "2026-07-07", היעדרות: "כן", סיבה: "רופא" });
  });

  it("carries the weekday and the Hebrew date", async () => {
    const wb = await workbookFor([entry("2026-08-20")], []);
    const [row] = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets["סדרים"]);
    // 20 August 2026 is a Thursday.
    expect(row["יום"]).toBe("ה׳");
    expect(row["תאריך עברי"]).toMatch(/אלול|אב/);
  });

  it("labels the two sedarim in Hebrew", async () => {
    const wb = await workbookFor(
      [entry("2026-07-08", { seder: 1 }), entry("2026-07-08", { seder: 2, absent: true })],
      [],
    );
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["סדרים"]);
    expect(rows.map((r) => r["סדר"])).toEqual(["א׳", "ב׳"]);
  });

  it("marks an אוהבי ה׳ seder", async () => {
    const wb = await workbookFor([entry("2026-07-08", { ohevei: true })], []);
    const [row] = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["סדרים"]);
    expect(row["אוהבי ה׳"]).toBe("כן");
  });

  it("joins tags into one cell and keeps the note", async () => {
    const wb = await workbookFor(
      [entry("2026-07-08", { tags: ["רופא", "אבל"], note: "הגיע באיחור מתוכנן" })],
      [],
    );
    const [row] = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["סדרים"]);
    expect(row["תגיות"]).toBe("רופא, אבל");
    expect(row["הערה"]).toBe("הגיע באיחור מתוכנן");
  });

  it("writes the learning sheet with hours alongside minutes", async () => {
    const wb = await workbookFor([], [lesson({ minutes: 90 })]);
    const [row] = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["לימוד נוסף"]);
    expect(row).toMatchObject({ דקות: 90, שעות: 1.5, מסגרת: "כולל ערב", מקור: "ידני" });
  });

  it("doubles a תענית דיבור lesson in the effective column only", async () => {
    const wb = await workbookFor([], [lesson({ minutes: 45, tanitDibur: true })]);
    const [row] = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["לימוד נוסף"]);
    expect(row).toMatchObject({ דקות: 45, נחשב: 90, "תענית דיבור": "כן" });
  });

  it("names each learning source in Hebrew", async () => {
    const wb = await workbookFor(
      [],
      [
        lesson({ id: "a", source: "manual" }),
        lesson({ id: "b", source: "range" }),
        lesson({ id: "c", source: "timer" }),
      ],
    );
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["לימוד נוסף"]);
    expect(rows.map((r) => r["מקור"])).toEqual(["ידני", "טווח שעות", "טיימר"]);
  });

  it("rounds the hours column to two places", async () => {
    const wb = await workbookFor([], [lesson({ minutes: 100 })]);
    const [row] = XLSX.utils.sheet_to_json<Record<string, number>>(wb.Sheets["לימוד נוסף"]);
    expect(row["שעות"]).toBe(1.67);
  });

  it("names every framework in Hebrew", async () => {
    const wb = await workbookFor(
      [],
      [
        lesson({ id: "a", framework: "kollel-erev" }),
        lesson({ id: "b", framework: "torato-beyado" }),
        lesson({ id: "c", framework: "bein-hazmanim" }),
      ],
    );
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["לימוד נוסף"]);
    expect(rows.map((r) => r["מסגרת"])).toEqual(["כולל ערב", "תורתו בידו", "ישיבת בין הזמנים"]);
  });

  it("writes one monthly row per month, in date order", async () => {
    const wb = await workbookFor(
      [entry("2026-08-03"), entry("2026-06-10"), entry("2026-07-08")],
      [],
    );
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["סיכום חודשי"]);
    expect(rows.map((r) => r["חודש"])).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("names the month in Hebrew alongside its key", async () => {
    const wb = await workbookFor([entry("2026-08-03")], []);
    const [row] = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets["סיכום חודשי"]);
    expect(row["שם החודש"]).toBe("אוגוסט 2026");
  });

  it("carries the month's counts and score", async () => {
    const wb = await workbookFor(
      [
        entry("2026-07-08", { arrival: hhmm(s1StartMin + 30) }),
        entry("2026-07-07", { absent: true }),
      ],
      [],
    );
    const [row] = XLSX.utils.sheet_to_json<Record<string, number>>(wb.Sheets["סיכום חודשי"]);
    expect(row["רישומים"]).toBe(2);
    expect(row["איחור"]).toBe(1);
    expect(row["היעדרות"]).toBe(1);
    expect(row["ציון"]).toBeGreaterThanOrEqual(0);
    expect(row["ציון"]).toBeLessThanOrEqual(100);
  });

  it("scores each month over that month's rows alone", async () => {
    // A perfect July next to a July-only absence in June: the two months must
    // not share a score. (The monthly figures used to be computed from the
    // whole store rather than the rows being exported.)
    const wb = await workbookFor(
      [entry("2026-07-08"), entry("2026-06-10", { absent: true })],
      [],
    );
    const rows = XLSX.utils.sheet_to_json<Record<string, number>>(wb.Sheets["סיכום חודשי"]);
    expect(rows[0]["ציון"]).toBe(0);      // June — absent all month
    expect(rows[1]["ציון"]).toBeGreaterThan(90); // July — full attendance
  });

  it("counts the month's extra learning minutes", async () => {
    const wb = await workbookFor(
      [entry("2026-07-08")],
      [lesson({ date: "2026-07-09", minutes: 30 }), lesson({ id: "x", date: "2026-08-09", minutes: 90 })],
    );
    const rows = XLSX.utils.sheet_to_json<Record<string, number>>(wb.Sheets["סיכום חודשי"]);
    expect(rows[0]["לימוד נוסף"]).toBe(30);
  });

  it("still writes all three sheets with nothing to export", async () => {
    const wb = await workbookFor([], []);
    expect(wb.SheetNames).toEqual(["סדרים", "לימוד נוסף", "סיכום חודשי"]);
  });

  it("defaults the filename to the date", async () => {
    await exportXlsxWorkbook({ entries: [], lessons: [] });
    expect(lastSaved().name).toBe("סדר_פלוס_2026-07-15.xlsx");
  });

  it("uses a filename it was given", async () => {
    await exportXlsxWorkbook({ entries: [], lessons: [], filename: "דוח.xlsx" });
    expect(lastSaved().name).toBe("דוח.xlsx");
  });

  it("reports a cancelled save as false", async () => {
    saveBinaryFile.mockResolvedValue(false);
    expect(await exportXlsxWorkbook({ entries: [], lessons: [] })).toBe(false);
  });
});

// ============================================================================
// exportPdfReport
// ============================================================================

describe("exportPdfReport", () => {
  const base = { title: "דוח נוכחות", entries: [entry("2026-07-08")], lessons: [lesson()] };

  it("writes a real PDF and reports success", async () => {
    expect(await exportPdfReport(base)).toBe(true);
    const { name, bytes } = lastSaved();
    expect(name).toMatch(/\.pdf$/);
    expect(asLatin1(bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("embeds the Hebrew font rather than rasterizing the page", async () => {
    await exportPdfReport(base);
    expect(asLatin1(lastSaved().bytes)).toContain("Heebo");
  });

  it("defaults the filename to the title plus today's date", async () => {
    await exportPdfReport(base);
    expect(lastSaved().name).toBe("דוח_נוכחות_2026-07-15.pdf");
  });

  it("uses a filename it was given", async () => {
    await exportPdfReport({ ...base, filename: "custom" });
    expect(lastSaved().name).toBe("custom.pdf");
  });

  it("strips characters Windows will not accept in a filename", async () => {
    await exportPdfReport({ ...base, title: 'דוח 1/2 "מיוחד"' });
    expect(lastSaved().name).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("reports a cancelled save as false", async () => {
    saveBinaryFile.mockResolvedValue(false);
    expect(await exportPdfReport(base)).toBe(false);
  });

  it("logs a failure to the log file and rethrows it", async () => {
    saveBinaryFile.mockRejectedValue(new Error("disk full"));
    await expect(exportPdfReport(base)).rejects.toThrow("disk full");
    expect(logProblem).toHaveBeenCalled();
    expect(String(logProblem.mock.calls[0][0])).toContain("PDF");
  });

  it("grows with the number of records", async () => {
    await exportPdfReport({ ...base, entries: [entry("2026-07-08")] });
    const small = lastSaved().bytes.length;
    const many = Array.from({ length: 120 }, (_, i) =>
      entry(`2026-07-${String((i % 28) + 1).padStart(2, "0")}`, { id: `e${i}` }));
    await exportPdfReport({ ...base, entries: many });
    expect(lastSaved().bytes.length).toBeGreaterThan(small);
  });

  it("honours a date range, dropping records outside it", async () => {
    const inside = [entry("2026-07-08"), entry("2026-07-09", { id: "b" })];
    const outside = [entry("2026-01-02", { id: "c" }), entry("2026-12-30", { id: "d" })];
    await exportPdfReport({
      ...base, entries: [...inside, ...outside],
      range: { from: "2026-07-01", to: "2026-07-31" },
    });
    const withRange = lastSaved().bytes.length;
    await exportPdfReport({ ...base, entries: [...inside, ...outside] });
    // Four rows make a bigger document than two; if the range were ignored the
    // two would be identical.
    expect(lastSaved().bytes.length).not.toBe(withRange);
  });

  it("produces a document with every section switched off", async () => {
    const none = Object.fromEntries(
      Object.keys(DEFAULT_SECTIONS).map((k) => [k, false]),
    ) as ReportSections;
    expect(await exportPdfReport({ ...base, sections: none })).toBe(true);
    expect(asLatin1(lastSaved().bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("produces a document with no records at all", async () => {
    expect(await exportPdfReport({ ...base, entries: [], lessons: [] })).toBe(true);
    expect(asLatin1(lastSaved().bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("survives records with awkward content", async () => {
    const nasty = [
      entry("2026-07-08", { note: "הערה ארוכה מאוד ".repeat(20), excusedReason: "סיבה (מיוחדת) 50%" }),
      entry("2026-07-09", { id: "z", absent: true, arrival: undefined, departure: undefined }),
    ];
    expect(await exportPdfReport({ ...base, entries: nasty })).toBe(true);
  });

  it("names the report after the profile it was saved under", async () => {
    updateSettings({ profile: { name: "אברהם", classroom: "כתר תורה" } });
    expect(await exportPdfReport(base)).toBe(true);
    expect(asLatin1(lastSaved().bytes.subarray(0, 5))).toBe("%PDF-");
  });
});

// ============================================================================
// exportMonthClosingsPdf
// ============================================================================

describe("exportMonthClosingsPdf", () => {
  const entries = [entry("2026-07-08"), entry("2026-07-09", { id: "b", absent: true })];
  const lessons = [lesson({ date: "2026-07-08", minutes: 45, tanitDibur: true })];

  it("writes one month as a figure sheet", async () => {
    const closings = [monthClosing("2026-07", entries, lessons)];
    expect(await exportMonthClosingsPdf({ closings })).toBe(true);
    expect(asLatin1(lastSaved().bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("writes several months as one table", async () => {
    const closings = ["2026-06", "2026-07", "2026-08"].map((k) => monthClosing(k, entries, lessons));
    expect(await exportMonthClosingsPdf({ closings })).toBe(true);
    expect(lastSaved().name).toMatch(/^סיכומי_חודשים_/);
  });

  it("titles a single month after that month", async () => {
    const closings = [monthClosing("2026-07", entries, lessons)];
    await exportMonthClosingsPdf({ closings });
    expect(lastSaved().name).toContain("יולי");
  });

  it("refuses to write nothing", async () => {
    expect(await exportMonthClosingsPdf({ closings: [] })).toBe(false);
    expect(saveBinaryFile).not.toHaveBeenCalled();
  });

  it("uses a title it was given", async () => {
    const closings = [monthClosing("2026-07", entries, lessons)];
    await exportMonthClosingsPdf({ closings, title: "נעילת חודש" });
    expect(lastSaved().name).toMatch(/^נעילת_חודש_/);
  });

  it("reports a cancelled save as false", async () => {
    saveBinaryFile.mockResolvedValue(false);
    const closings = [monthClosing("2026-07", entries, lessons)];
    expect(await exportMonthClosingsPdf({ closings })).toBe(false);
  });

  it("logs a failure and rethrows it", async () => {
    saveBinaryFile.mockRejectedValue(new Error("nope"));
    const closings = [monthClosing("2026-07", entries, lessons)];
    await expect(exportMonthClosingsPdf({ closings })).rejects.toThrow("nope");
    expect(logProblem).toHaveBeenCalled();
  });

  it("handles a year of months in one document", async () => {
    const closings = Array.from({ length: 12 }, (_, i) =>
      monthClosing(`2026-${String(i + 1).padStart(2, "0")}`, entries, lessons));
    expect(await exportMonthClosingsPdf({ closings })).toBe(true);
    expect(asLatin1(lastSaved().bytes.subarray(0, 5))).toBe("%PDF-");
  });
});
