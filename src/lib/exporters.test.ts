// Report export. The XLSX path is exercised for real — the workbook is written
// and parsed back — while the PDF path runs against stand-ins for html2canvas,
// jsPDF and the DOM, so the report HTML and the A4 pagination can still be
// checked without a browser.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as XLSX from "xlsx";

// ---- stand-ins -------------------------------------------------------------

const saveBinaryFile = vi.fn<(name: string, bytes: Uint8Array) => Promise<boolean>>();
vi.mock("./save-file", () => ({
  saveBinaryFile: (name: string, bytes: Uint8Array) => saveBinaryFile(name, bytes),
  saveBase64File: vi.fn(),
  saveTextFile: vi.fn(),
}));

/** Dimensions the fake html2canvas should report, and what it was handed. */
const canvasSize = { width: 1588, height: 1000 };
const rendered = { html: "" };

vi.mock("html2canvas", () => ({
  default: async (node: { innerHTML: string }) => {
    rendered.html = node.innerHTML;
    return {
      width: canvasSize.width,
      height: canvasSize.height,
      toDataURL: () => "data:image/jpeg;base64,AAAA",
    };
  },
}));

const pdfCalls = { addImage: 0, addPage: 0, constructed: [] as unknown[] };

vi.mock("jspdf", () => ({
  default: class FakeJsPDF {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    constructor(opts: unknown) {
      pdfCalls.constructed.push(opts);
    }
    addImage() {
      pdfCalls.addImage++;
    }
    addPage() {
      pdfCalls.addPage++;
    }
    output() {
      return new ArrayBuffer(64);
    }
  },
}));

import {
  DEFAULT_SECTIONS,
  exportPdfReport,
  exportXlsxWorkbook,
  exportMonthClosingsPdf,
  type ReportSections,
} from "./exporters";
import {
  hhmmToMin,
  replaceAllData,
  monthClosing,
  type SederEntry,
  type LearningEntry,
} from "./kollel-store";
import { DEFAULT_SETTINGS, resetSettings } from "./settings-store";
import { getAuditEntries, clearAudit } from "./audit-store";

const { s1Start, s1End } = DEFAULT_SETTINGS.seder;
const s1StartMin = hhmmToMin(s1Start)!;
const s1EndMin = hhmmToMin(s1End)!;

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

// ---- a document just rich enough for renderHtmlToPdf ----------------------

class FakeElement {
  innerHTML = "";
  style: { cssText: string } = { cssText: "" };
  width = 0;
  height = 0;
  private attrs = new Map<string, string>();
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  querySelector() {
    return null;
  }
  remove() {
    removed.push(this);
  }
  appendChild(child: unknown) {
    appended.push(child);
    return child;
  }
  getContext() {
    return { fillStyle: "", fillRect() {}, drawImage() {} };
  }
  toDataURL() {
    return "data:image/jpeg;base64,AAAA";
  }
}
let appended: unknown[] = [];
let removed: unknown[] = [];

function installFakeDom() {
  appended = [];
  removed = [];
  const body = new FakeElement();
  vi.stubGlobal("document", {
    createElement: () => new FakeElement(),
    body,
    fonts: { ready: Promise.resolve() },
  });
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
    fn();
    return 1;
  });
  return body;
}

beforeEach(() => {
  resetSettings();
  replaceAllData([], []);
  clearAudit();
  saveBinaryFile.mockReset();
  saveBinaryFile.mockResolvedValue(true);
  canvasSize.width = 1588;
  canvasSize.height = 1000;
  rendered.html = "";
  pdfCalls.addImage = 0;
  pdfCalls.addPage = 0;
  pdfCalls.constructed = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    const [, bytes] = saveBinaryFile.mock.calls.at(-1)!;
    return XLSX.read(bytes, { type: "array" });
  }

  it("writes the three expected sheets", async () => {
    const wb = await workbookFor([entry("2026-07-08")], [lesson()]);
    expect(wb.SheetNames).toEqual(["סדרים", "לימוד נוסף", "סיכום חודשי"]);
  });

  it("marks the workbook right-to-left", async () => {
    const entries = [entry("2026-07-08")];
    replaceAllData(entries, []);
    await exportXlsxWorkbook({ entries, lessons: [] });
    const [, bytes] = saveBinaryFile.mock.calls.at(-1)!;
    const wb = XLSX.read(bytes, { type: "array" });
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

  it("still writes all three sheets with nothing to export", async () => {
    const wb = await workbookFor([], []);
    expect(wb.SheetNames).toEqual(["סדרים", "לימוד נוסף", "סיכום חודשי"]);
  });

  it("defaults the filename to the date", async () => {
    replaceAllData([], []);
    await exportXlsxWorkbook({ entries: [], lessons: [] });
    expect(saveBinaryFile.mock.calls.at(-1)![0]).toBe("kollel_2026-07-15.xlsx");
  });

  it("uses a filename it was given", async () => {
    replaceAllData([], []);
    await exportXlsxWorkbook({ entries: [], lessons: [], filename: "דוח.xlsx" });
    expect(saveBinaryFile.mock.calls.at(-1)![0]).toBe("דוח.xlsx");
  });

  it("records the export in the audit log", async () => {
    replaceAllData([], []);
    await exportXlsxWorkbook({ entries: [], lessons: [] });
    const [logged] = getAuditEntries();
    expect(logged.action).toBe("report.export");
    expect(logged.detail).toContain("XLSX");
  });

  it("returns false and logs nothing when the user cancels", async () => {
    saveBinaryFile.mockResolvedValue(false);
    replaceAllData([], []);
    expect(await exportXlsxWorkbook({ entries: [], lessons: [] })).toBe(false);
    expect(getAuditEntries()).toEqual([]);
  });
});

// ============================================================================
// exportPdfReport
// ============================================================================

describe("exportPdfReport", () => {
  const base = { title: "דוח נוכחות", entries: [entry("2026-07-08")], lessons: [lesson()] };

  beforeEach(() => {
    installFakeDom();
  });

  it("saves a PDF and reports success", async () => {
    expect(await exportPdfReport(base)).toBe(true);
    expect(saveBinaryFile).toHaveBeenCalledOnce();
    expect(saveBinaryFile.mock.calls[0][0]).toMatch(/\.pdf$/);
  });

  it("defaults the filename to the title plus today's date", async () => {
    await exportPdfReport(base);
    expect(saveBinaryFile.mock.calls[0][0]).toBe("דוח_נוכחות_2026-07-15.pdf");
  });

  it("uses a filename it was given", async () => {
    await exportPdfReport({ ...base, filename: "custom" });
    expect(saveBinaryFile.mock.calls[0][0]).toBe("custom.pdf");
  });

  it("returns false and logs nothing when the user cancels", async () => {
    saveBinaryFile.mockResolvedValue(false);
    expect(await exportPdfReport(base)).toBe(false);
    expect(getAuditEntries()).toEqual([]);
  });

  it("records the export in the audit log", async () => {
    await exportPdfReport(base);
    const [logged] = getAuditEntries();
    expect(logged.action).toBe("report.export");
    expect(logged.detail).toContain("PDF");
  });

  it("cleans up the off-screen host even when rendering fails", async () => {
    saveBinaryFile.mockRejectedValue(new Error("disk full"));
    await expect(exportPdfReport(base)).rejects.toThrow("disk full");
    // A leaked host would sit invisibly in the live page for the rest of the
    // session, growing with every attempt.
    expect(removed).toHaveLength(1);
  });

  it("appends exactly one host to the page and removes it again", async () => {
    await exportPdfReport(base);
    expect(appended).toHaveLength(1);
    expect(removed).toHaveLength(1);
  });

  describe("the report HTML", () => {
    it("carries the title and the KPI figures", async () => {
      await exportPdfReport({
        ...base,
        entries: [entry("2026-07-08", { arrival: hhmm(s1StartMin + 30) })],
      });
      expect(rendered.html).toContain("דוח נוכחות");
      expect(rendered.html).toContain("דקות חסרות (נטו)");
    });

    it("includes every section by default", async () => {
      await exportPdfReport(base);
      for (const heading of [
        "פילוח דקות",
        "סיכום חודשי",
        "פירוט סדרים",
        "סיכום היעדרויות מוצדקות",
        "לימוד נוסף",
      ]) {
        expect(rendered.html, heading).toContain(heading);
      }
    });

    it("leaves out the sections that were switched off", async () => {
      const only: ReportSections = {
        kpis: true,
        monthlyTable: false,
        yearlyBreakdown: false,
        learning: false,
        charts: false,
        excusedSummary: false,
        oheveiList: false,
      };
      await exportPdfReport({ ...base, sections: only });
      expect(rendered.html).toContain("דקות חסרות (נטו)");
      expect(rendered.html).not.toContain("פילוח דקות");
      expect(rendered.html).not.toContain("פירוט סדרים");
      expect(rendered.html).not.toContain("סיכום היעדרויות מוצדקות");
    });

    it("can switch off the KPIs alone", async () => {
      await exportPdfReport({ ...base, sections: { ...DEFAULT_SECTIONS, kpis: false } });
      expect(rendered.html).not.toContain("דקות חסרות (נטו)");
      expect(rendered.html).toContain("פירוט סדרים");
    });

    it("honours a date range, dropping records outside it", async () => {
      await exportPdfReport({
        ...base,
        entries: [entry("2026-07-08"), entry("2026-09-08"), entry("2026-05-08")],
        range: { from: "2026-07-01", to: "2026-07-31" },
      });
      expect(rendered.html).toContain("2026-07-08");
      expect(rendered.html).not.toContain("2026-09-08");
      expect(rendered.html).not.toContain("2026-05-08");
    });

    it("shows the range it was given in the header", async () => {
      await exportPdfReport({ ...base, range: { from: "2026-07-01", to: "2026-07-31" } });
      expect(rendered.html).toContain("2026-07-01");
      expect(rendered.html).toContain("2026-07-31");
    });

    it("includes both endpoints of the range", async () => {
      await exportPdfReport({
        ...base,
        entries: [entry("2026-07-01"), entry("2026-07-31"), entry("2026-06-30")],
        range: { from: "2026-07-01", to: "2026-07-31" },
      });
      expect(rendered.html).toContain("2026-07-01");
      expect(rendered.html).toContain("2026-07-31");
      expect(rendered.html).not.toContain("2026-06-30");
    });

    it("caps the detail table and says how many were left out", async () => {
      const many = Array.from({ length: 250 }, (_, i) =>
        entry("2026-07-08", { seder: ((i % 2) + 1) as 1 | 2 }),
      );
      await exportPdfReport({ ...base, entries: many });
      expect(rendered.html).toContain("מוצגים 200 מתוך 250 רישומים");
    });

    it("says nothing about a cap when everything fits", async () => {
      await exportPdfReport(base);
      expect(rendered.html).not.toContain("מוצגים");
    });

    it("dates the report in the Hebrew calendar", async () => {
      await exportPdfReport(base);
      // Tammuz 5786 has 29 days and 8 July is כ״ג בו, so 15 July is א׳ אב.
      expect(rendered.html).toContain("א׳ אב תשפ״ו");
    });

    it("renders an absence as a dash rather than a blank time", async () => {
      await exportPdfReport({ ...base, entries: [entry("2026-07-08", { absent: true })] });
      expect(rendered.html).toContain("—");
    });

    it("produces valid enough HTML to have no unresolved template holes", async () => {
      await exportPdfReport(base);
      expect(rendered.html).not.toContain("undefined");
      expect(rendered.html).not.toContain("NaN");
      expect(rendered.html).not.toContain("[object Object]");
    });
  });

  describe("A4 pagination", () => {
    it("puts a short report on one page", async () => {
      canvasSize.height = 1000; // ~122mm tall, well inside a page
      await exportPdfReport(base);
      expect(pdfCalls.addImage).toBe(1);
      expect(pdfCalls.addPage).toBe(0);
    });

    it("slices a long report across pages", async () => {
      canvasSize.height = 10_000;
      await exportPdfReport(base);
      // 1588px wide over 194mm is 8.19px/mm, so a 281mm page holds 2300px:
      // ceil(10000 / 2300) = 5 pages, and 4 page breaks between them.
      expect(pdfCalls.addImage).toBe(5);
      expect(pdfCalls.addPage).toBe(4);
    });

    it("adds no page break for a report just over one page", async () => {
      canvasSize.height = 2301;
      await exportPdfReport(base);
      expect(pdfCalls.addImage).toBe(2);
      expect(pdfCalls.addPage).toBe(1);
    });

    it("asks for A4 portrait in millimetres", async () => {
      await exportPdfReport(base);
      expect(pdfCalls.constructed[0]).toEqual({
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      });
    });
  });
});

// ============================================================================
// exportMonthClosingsPdf
// ============================================================================

describe("exportMonthClosingsPdf", () => {
  beforeEach(() => {
    installFakeDom();
  });

  const july = () =>
    monthClosing(
      "2026-07",
      [
        entry("2026-07-08", { arrival: hhmm(s1StartMin + 30) }),
        entry("2026-07-07", { absent: true, excusedAll: true }),
      ],
      [lesson({ minutes: 45 })],
    );
  const june = () => monthClosing("2026-06", [entry("2026-06-10")], []);

  it("refuses an empty list without touching the save dialog", async () => {
    expect(await exportMonthClosingsPdf({ closings: [] })).toBe(false);
    expect(saveBinaryFile).not.toHaveBeenCalled();
  });

  it("renders a single month as a KPI card", async () => {
    expect(await exportMonthClosingsPdf({ closings: [july()] })).toBe(true);
    expect(rendered.html).toContain("יולי 2026");
    expect(rendered.html).toContain("סה״כ דקות");
    expect(rendered.html).not.toContain("שורות סיכום חודשי");
  });

  it("renders several months as a table with a totals row", async () => {
    await exportMonthClosingsPdf({ closings: [july(), june()] });
    expect(rendered.html).toContain("שורות סיכום חודשי");
    expect(rendered.html).toContain("סה״כ (2 חודשים)");
    expect(rendered.html).toContain("יולי 2026");
    expect(rendered.html).toContain("יוני 2026");
  });

  it("marks a month still in progress as an interim summary", async () => {
    // "Today" is 15 July 2026, so July has not closed yet.
    await exportMonthClosingsPdf({ closings: [july()] });
    expect(rendered.html).toContain("סיכום ביניים");
  });

  it("does not mark a closed month as interim", async () => {
    await exportMonthClosingsPdf({ closings: [june()] });
    expect(rendered.html).not.toContain("סיכום ביניים");
  });

  it("flags the open month in the multi-month table", async () => {
    await exportMonthClosingsPdf({ closings: [july(), june()] });
    expect(rendered.html).toContain("· פתוח");
  });

  it("notes when תענית דיבור doubled the kollel-erev minutes", async () => {
    const closing = monthClosing("2026-07", [], [lesson({ minutes: 45, tanitDibur: true })]);
    await exportMonthClosingsPdf({ closings: [closing] });
    expect(rendered.html).toContain("תענית דיבור נספרת כפול");
    expect(rendered.html).toContain("90");
  });

  it("says nothing about doubling when there was none", async () => {
    const closing = monthClosing("2026-07", [], [lesson({ minutes: 45 })]);
    await exportMonthClosingsPdf({ closings: [closing] });
    expect(rendered.html).not.toContain("תענית דיבור נספרת כפול");
  });

  it("titles a single month after that month", async () => {
    await exportMonthClosingsPdf({ closings: [july()] });
    expect(saveBinaryFile.mock.calls[0][0]).toContain("סיכום_חודש_יולי_2026");
  });

  it("titles several months generically", async () => {
    await exportMonthClosingsPdf({ closings: [july(), june()] });
    expect(saveBinaryFile.mock.calls[0][0]).toContain("סיכומי_חודשים");
  });

  it("uses a title it was given", async () => {
    await exportMonthClosingsPdf({ closings: [july()], title: "נעילת תמוז" });
    expect(rendered.html).toContain("נעילת תמוז");
  });

  it("uses a filename it was given", async () => {
    await exportMonthClosingsPdf({ closings: [july()], filename: "closing" });
    expect(saveBinaryFile.mock.calls[0][0]).toBe("closing.pdf");
  });

  it("records the months it exported in the audit log", async () => {
    await exportMonthClosingsPdf({ closings: [july(), june()] });
    const [logged] = getAuditEntries();
    expect(logged.action).toBe("report.export");
    expect(logged.newValue).toMatchObject({ months: ["2026-07", "2026-06"] });
  });

  it("returns false and logs nothing when the user cancels", async () => {
    saveBinaryFile.mockResolvedValue(false);
    expect(await exportMonthClosingsPdf({ closings: [july()] })).toBe(false);
    expect(getAuditEntries()).toEqual([]);
  });

  it("leaves no unresolved template holes", async () => {
    await exportMonthClosingsPdf({ closings: [july(), june()] });
    expect(rendered.html).not.toContain("undefined");
    expect(rendered.html).not.toContain("NaN");
    expect(rendered.html).not.toContain("[object Object]");
  });
});
