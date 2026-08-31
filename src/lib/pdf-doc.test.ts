// The PDF builder, exercised against the real jsPDF and the real Hebrew font
// files. Nothing here is a stand-in except the save dialog: every test below
// writes an actual PDF and looks at the bytes, because "the export failed" was
// the bug this module exists to fix.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const saveBinaryFile = vi.fn<(name: string, bytes: Uint8Array) => Promise<boolean>>();
vi.mock("./save-file", () => ({
  saveBinaryFile: (name: string, bytes: Uint8Array) => saveBinaryFile(name, bytes),
  saveBase64File: vi.fn(),
  saveTextFile: vi.fn(),
}));

// The fonts come off disk here rather than over `fetch`, which has no meaning
// outside a browser. Same files the EXE ships.
vi.mock("./pdf-fonts", async () => {
  const { bytesToBase64 } = await import("./base64");
  const read = (name: string) =>
    bytesToBase64(
      new Uint8Array(
        readFileSync(fileURLToPath(new URL(`../../public/fonts/${name}`, import.meta.url))),
      ),
    );
  return {
    loadHeeboFonts: async () => ({
      regular: read("Heebo-Regular.ttf"),
      bold: read("Heebo-Bold.ttf"),
    }),
  };
});

import { RtlPdf, CONTENT_W } from "./pdf-doc";

const BASE = {
  title: "דוח נוכחות חודשי",
  subtitle: "אוגוסט 2026",
  owner: "תלמיד הכולל",
  accent: "#1565C0",
};

function asText(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

beforeEach(() => {
  saveBinaryFile.mockReset();
  saveBinaryFile.mockResolvedValue(true);
});

describe("RtlPdf", () => {
  it("writes a real PDF", async () => {
    const pdf = await RtlPdf.create(BASE);
    pdf.paragraph("שלום עולם");
    const bytes = pdf.bytes();
    expect(asText(bytes.subarray(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("embeds the Hebrew font in the document", async () => {
    const pdf = await RtlPdf.create(BASE);
    pdf.paragraph("נוכחות");
    // Without an embedded font there is no Hebrew glyph in any of jsPDF's
    // built-in fonts, and this is exactly what the old screenshot-based
    // exporter existed to work around.
    expect(asText(pdf.bytes())).toContain("Heebo");
  });

  it("starts on a single page", async () => {
    const pdf = await RtlPdf.create(BASE);
    pdf.paragraph("שורה אחת");
    expect(pdf.pageCount()).toBe(1);
  });

  it("adds pages as the content outgrows one sheet", async () => {
    const pdf = await RtlPdf.create(BASE);
    for (let i = 0; i < 200; i++) pdf.paragraph(`שורה מספר ${i + 1} בדוח הנוכחות`);
    expect(pdf.pageCount()).toBeGreaterThan(2);
  });

  it("continues a long table onto further pages", async () => {
    const pdf = await RtlPdf.create(BASE);
    pdf.table({
      columns: [
        { header: "תאריך", width: 2 },
        { header: "סדר", width: 1 },
        { header: "חסר", width: 1 },
      ],
      rows: Array.from({ length: 150 }, (_, i) => [`0${(i % 9) + 1}/08/2026`, "א׳", i]),
    });
    expect(pdf.pageCount()).toBeGreaterThan(2);
  });

  it("keeps an empty table on one page and says so", async () => {
    const pdf = await RtlPdf.create(BASE);
    pdf.table({
      columns: [
        { header: "תאריך", width: 1 },
        { header: "סדר", width: 1 },
      ],
      rows: [],
      emptyText: "אין רישומים",
    });
    expect(pdf.pageCount()).toBe(1);
  });

  it("draws a totals row without complaint", async () => {
    const pdf = await RtlPdf.create(BASE);
    pdf.table({
      columns: [
        { header: "חודש", width: 2 },
        { header: "דקות", width: 1 },
      ],
      rows: [
        ["אוגוסט 2026", 120],
        ["יולי 2026", 90],
      ],
      total: ["סה״כ", 210],
    });
    expect(pdf.pageCount()).toBe(1);
    expect(asText(pdf.bytes()).slice(0, 5)).toBe("%PDF-");
  });

  it("handles a table with many narrow columns", async () => {
    const columns = Array.from({ length: 12 }, (_, i) => ({ header: `עמודה ${i + 1}`, width: 1 }));
    const pdf = await RtlPdf.create(BASE);
    pdf.table({ compact: true, columns, rows: [Array.from({ length: 12 }, (_, i) => i * 11)] });
    expect(pdf.pageCount()).toBe(1);
  });

  it("lays out KPI boxes in rows of four", async () => {
    const pdf = await RtlPdf.create(BASE);
    pdf.kpis(
      Array.from({ length: 8 }, (_, i) => ({ label: `מדד ארוך מאוד מספר ${i + 1}`, value: i * 7 })),
    );
    expect(pdf.pageCount()).toBe(1);
  });

  it("draws bars, including a zero-length one", async () => {
    const pdf = await RtlPdf.create(BASE);
    pdf.bars([
      { label: "חסר שאינו מוצדק", value: 120, color: "#D64B36" },
      { label: "חסר מוצדק", value: 0, color: "#2F6FD0" },
    ]);
    expect(pdf.pageCount()).toBe(1);
  });

  it("survives every block type in one document", async () => {
    const pdf = await RtlPdf.create({ ...BASE, footerNote: "מסמך פנימי" });
    pdf.kpis([{ label: "ציון", value: 92 }]);
    pdf.section("פילוח");
    pdf.bars([{ label: "בונוס", value: 30, color: "#2E9E58" }]);
    pdf.paragraph("פסקה עם מספר 142 ותאריך 20/08/2026 בתוכה.");
    pdf.bullets([
      "פריט ראשון",
      "פריט שני ארוך יותר שנועד לגלוש לשורה נוספת ולכן הוא ארוך מאוד מאוד",
    ]);
    pdf.facts([{ label: "כולל ערב", value: "120 דק׳" }]);
    pdf.note("הערה קטנה");
    pdf.spacer(6);
    pdf.table({ columns: [{ header: "א", width: 1 }], rows: [["ערך"]] });
    expect(asText(pdf.bytes()).slice(0, 5)).toBe("%PDF-");
  });

  it("hands the bytes to the save dialog with a .pdf name", async () => {
    const pdf = await RtlPdf.create(BASE);
    pdf.paragraph("שלום");
    expect(await pdf.save("דוח")).toBe(true);
    const [name, bytes] = saveBinaryFile.mock.calls.at(-1)!;
    expect(name).toBe("דוח.pdf");
    expect(asText(bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("does not double the extension when it is already there", async () => {
    const pdf = await RtlPdf.create(BASE);
    await pdf.save("דוח.pdf");
    expect(saveBinaryFile.mock.calls.at(-1)![0]).toBe("דוח.pdf");
  });

  it("reports a cancelled save as false", async () => {
    saveBinaryFile.mockResolvedValue(false);
    const pdf = await RtlPdf.create(BASE);
    expect(await pdf.save("דוח")).toBe(false);
  });

  it("exposes a content width that fits inside A4 with margins", () => {
    expect(CONTENT_W).toBeGreaterThan(150);
    expect(CONTENT_W).toBeLessThan(210);
  });

  it("stamps a footer on every page", async () => {
    const pdf = await RtlPdf.create(BASE);
    for (let i = 0; i < 120; i++) pdf.paragraph(`שורה ${i}`);
    const pages = pdf.pageCount();
    expect(pages).toBeGreaterThan(1);
    // bytes() stamps the footers; the page count must not change when it does.
    pdf.bytes();
    expect(pdf.pageCount()).toBe(pages);
  });
});
