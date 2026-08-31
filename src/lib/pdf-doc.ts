// A small right-to-left document builder on top of jsPDF.
//
// This replaces the previous approach, which laid the report out as HTML in a
// hidden div, rasterized it with html2canvas and pasted the bitmap into a
// PDF. That could not work: html2canvas 1.4.1 throws on any colour it cannot
// parse, and Tailwind 4 writes every colour in the app as `oklch(...)` — so
// *every* export failed. It also produced a picture of a report rather than a
// report: no selectable text, no search, fuzzy at any zoom, and page breaks
// that fell wherever the pixels happened to land.
//
// Here the PDF is written directly: real text in a real embedded Hebrew font
// (see pdf-fonts.ts), measured and placed in millimetres, with page breaks
// chosen per block and per table row. Nothing touches the DOM, so an export
// cannot be broken by a stylesheet again — and it works from any window,
// visible or not.
//
// Everything is laid out from the right: `x` for text means the right edge
// unless stated otherwise, and the first table column is the rightmost one.
import jsPDF from "jspdf";
import { toVisual, wrapVisual } from "./rtl-text";
import { loadHeeboFonts } from "./pdf-fonts";
import { saveBinaryFile } from "./save-file";

const PAGE = { w: 210, h: 297 }; // A4 portrait, millimetres
const MARGIN = { x: 14, top: 13, bottom: 16 };
export const CONTENT_W = PAGE.w - MARGIN.x * 2;

// One flat palette for every report, all literal hex — a PDF has no
// stylesheet to inherit from, which is exactly why this is reliable.
const INK = "#1F2430";
const MUTED = "#5A6478";
const FAINT = "#8A93A6";
const LINE = "#D9E1EC";
const LINE_SOFT = "#ECF0F6";
const FILL_SOFT = "#F7F9FC";
const FILL_HEAD = "#F0F4FA";
const ZEBRA = "#FBFCFE";
const WHITE = "#FFFFFF";

const PT_TO_MM = 25.4 / 72;
/** Baseline-to-baseline distance as a multiple of the font size. */
const LINE_FACTOR = 1.34;

export type Weight = "normal" | "bold";
export type Align = "right" | "center" | "left";

export type Column = {
  header: string;
  /** Relative weight; the columns are scaled to fill the content width. */
  width: number;
  align?: Align;
};

export type TableSpec = {
  columns: Column[];
  rows: (string | number)[][];
  /** Rendered as a bold summary line under the body. */
  total?: (string | number)[];
  emptyText?: string;
  /** Smaller type — for tables with many columns. */
  compact?: boolean;
};

export type BarRow = { label: string; value: number; color: string };

export type DocOptions = {
  title: string;
  subtitle?: string;
  /** Shown top-left on the first page — who the report is about. */
  owner?: string;
  accent: string;
  /** Bottom-left of every page. */
  footerNote?: string;
};

type TextOptions = {
  size?: number;
  weight?: Weight;
  color?: string;
  align?: Align;
};

/**
 * One report being written.
 *
 * `await RtlPdf.create(...)` loads the Hebrew font — it can reject, and a
 * caller must let that surface rather than write a document full of missing
 * glyphs.
 */
export class RtlPdf {
  private doc: jsPDF;
  private y = MARGIN.top;
  private opts: DocOptions;

  private constructor(doc: jsPDF, opts: DocOptions) {
    this.doc = doc;
    this.opts = opts;
  }

  static async create(opts: DocOptions): Promise<RtlPdf> {
    const fonts = await loadHeeboFonts();
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    doc.addFileToVFS("Heebo-Regular.ttf", fonts.regular);
    doc.addFont("Heebo-Regular.ttf", "Heebo", "normal");
    doc.addFileToVFS("Heebo-Bold.ttf", fonts.bold);
    doc.addFont("Heebo-Bold.ttf", "Heebo", "bold");
    doc.setFont("Heebo", "normal");
    // Hebrew, RTL — declared so a reader announces the document correctly.
    doc.setLanguage("he");
    if (typeof doc.setProperties === "function") {
      doc.setProperties({
        title: opts.title,
        creator: "סדר פלוס",
        author: opts.owner || "סדר פלוס",
      });
    }

    const pdf = new RtlPdf(doc, opts);
    pdf.drawTitleBlock();
    return pdf;
  }

  // ---- primitives ---------------------------------------------------------

  /** The x of the right margin — where a right-aligned line starts. */
  private get right() {
    return PAGE.w - MARGIN.x;
  }
  private get left() {
    return MARGIN.x;
  }

  private setFont(size: number, weight: Weight = "normal") {
    this.doc.setFont("Heebo", weight);
    this.doc.setFontSize(size);
  }

  private measure(text: string, size: number, weight: Weight = "normal"): number {
    this.setFont(size, weight);
    return this.doc.getTextWidth(text);
  }

  private lineHeight(size: number): number {
    return size * PT_TO_MM * LINE_FACTOR;
  }

  /** Draws one already-visual line. `y` is the baseline. */
  private line(text: string, x: number, y: number, o: TextOptions = {}) {
    const size = o.size ?? 9.5;
    this.setFont(size, o.weight);
    this.doc.setTextColor(o.color ?? INK);
    this.doc.text(text, x, y, {
      align: o.align ?? "right",
      // jsPDF runs its own bidi pass over every string it draws, and would
      // undo the reordering rtl-text.ts just did. Declaring the input as
      // already-visual makes that pass a no-op.
      isInputVisual: true,
      isOutputVisual: true,
    });
  }

  /** Wraps logical text to `width` and draws it; returns the height used. */
  private block(text: string, xRight: number, width: number, o: TextOptions = {}): number {
    const size = o.size ?? 9.5;
    const lh = this.lineHeight(size);
    this.setFont(size, o.weight);
    const lines = wrapVisual(text, width, (s) => this.doc.getTextWidth(s));
    lines.forEach((l, i) => {
      const x =
        o.align === "center" ? xRight - width / 2 : o.align === "left" ? xRight - width : xRight;
      this.line(l, x, this.y + lh * (i + 1) - lh * 0.28, { ...o, size });
    });
    return lh * lines.length;
  }

  private rule(y: number, color = LINE, thickness = 0.2) {
    this.doc.setDrawColor(color);
    this.doc.setLineWidth(thickness);
    this.doc.line(this.left, y, this.right, y);
  }

  /** Starts a new page when `height` would not fit on the current one. */
  private ensure(height: number) {
    if (this.y + height <= PAGE.h - MARGIN.bottom) return false;
    this.newPage();
    return true;
  }

  private newPage() {
    this.doc.addPage();
    this.y = MARGIN.top;
    this.drawRunningHeader();
  }

  // ---- page furniture -----------------------------------------------------

  private drawTitleBlock() {
    const { title, subtitle, owner, accent } = this.opts;
    this.y = MARGIN.top + 2;

    // Brand block on the left, so the title has the whole right side.
    this.line(toVisual("סדר פלוס"), this.left, this.y + 5, {
      size: 12,
      weight: "bold",
      color: accent,
      align: "left",
    });
    if (owner) {
      this.line(toVisual(owner), this.left, this.y + 9.6, { size: 8, color: MUTED, align: "left" });
    }

    const titleH = this.block(title, this.right, CONTENT_W - 55, { size: 18, weight: "bold" });
    this.y += Math.max(titleH, 9);
    if (subtitle) {
      this.y += this.block(subtitle, this.right, CONTENT_W - 45, { size: 8.8, color: MUTED }) - 1;
    }

    this.y += 3.2;
    this.rule(this.y, accent, 0.9);
    this.y += 6;
  }

  private drawRunningHeader() {
    const { title, accent } = this.opts;
    this.line(toVisual(title), this.right, this.y + 3.4, {
      size: 8.6,
      weight: "bold",
      color: MUTED,
    });
    this.line(toVisual("סדר פלוס"), this.left, this.y + 3.4, {
      size: 8.6,
      weight: "bold",
      color: accent,
      align: "left",
    });
    this.y += 5.2;
    this.rule(this.y, LINE, 0.3);
    this.y += 5;
  }

  /**
   * Page numbers, stamped once everything is written — the total is not known
   * before then.
   */
  private stampFooters() {
    const total = this.doc.getNumberOfPages();
    for (let page = 1; page <= total; page++) {
      this.doc.setPage(page);
      const y = PAGE.h - MARGIN.bottom + 7;
      this.doc.setDrawColor(LINE_SOFT);
      this.doc.setLineWidth(0.2);
      this.doc.line(this.left, y - 4, this.right, y - 4);
      this.line(toVisual(this.opts.footerNote || "דוח אישי — מסמך פנימי"), this.right, y, {
        size: 7.6,
        color: FAINT,
      });
      this.line(toVisual(`עמוד ${page} מתוך ${total}`), PAGE.w / 2, y, {
        size: 7.6,
        color: FAINT,
        align: "center",
      });
      this.line(toVisual("הופק אוטומטית · סדר פלוס"), this.left, y, {
        size: 7.6,
        color: FAINT,
        align: "left",
      });
    }
  }

  // ---- blocks -------------------------------------------------------------

  spacer(height = 4) {
    this.y += height;
  }

  /** A heading with a hairline under it. Never left stranded at a page foot. */
  section(title: string) {
    this.ensure(18);
    this.y += 1.5;
    this.y += this.block(title, this.right, CONTENT_W, { size: 11.5, weight: "bold" });
    this.y += 1.2;
    this.rule(this.y, LINE, 0.3);
    this.y += 4.4;
  }

  paragraph(text: string, o: TextOptions = {}) {
    const size = o.size ?? 9.3;
    this.ensure(this.lineHeight(size) * 2);
    this.y += this.block(text, this.right, CONTENT_W, { ...o, size });
    this.y += 1.6;
  }

  /** Small muted text — a caption, a caveat, a "showing 30 of 120". */
  note(text: string) {
    this.paragraph(text, { size: 7.9, color: MUTED });
  }

  bullets(items: string[]) {
    const size = 9;
    const lh = this.lineHeight(size);
    for (const item of items) {
      this.ensure(lh + 1);
      const bulletX = this.right;
      this.line("•", bulletX, this.y + lh * 0.72, { size, color: this.opts.accent });
      const used = this.block(item, this.right - 3.6, CONTENT_W - 3.6, { size });
      this.y += used + 0.6;
    }
    this.y += 1.4;
  }

  /**
   * The headline figures, in boxes across the page.
   *
   * Four per row: enough room for a Hebrew label on one or two lines without
   * the numbers shrinking to nothing.
   */
  kpis(items: { label: string; value: string | number }[], perRow = 4) {
    if (!items.length) return;
    const gap = 3.2;
    const boxW = (CONTENT_W - gap * (perRow - 1)) / perRow;
    const boxH = 18;

    for (let i = 0; i < items.length; i += perRow) {
      const row = items.slice(i, i + perRow);
      this.ensure(boxH + 2.5);
      row.forEach((item, j) => {
        const xRight = this.right - j * (boxW + gap);
        const xLeft = xRight - boxW;
        this.doc.setFillColor(FILL_SOFT);
        this.doc.setDrawColor(LINE);
        this.doc.setLineWidth(0.25);
        this.doc.roundedRect(xLeft, this.y, boxW, boxH, 1.8, 1.8, "FD");

        const labelSize = 7.4;
        this.setFont(labelSize);
        const labelLines = wrapVisual(item.label, boxW - 5, (s) => this.doc.getTextWidth(s)).slice(
          0,
          2,
        );
        labelLines.forEach((l, k) => {
          this.line(l, xRight - 2.5, this.y + 4.4 + k * this.lineHeight(labelSize), {
            size: labelSize,
            color: MUTED,
          });
        });
        this.line(toVisual(String(item.value)), xRight - 2.5, this.y + boxH - 4.2, {
          size: 15,
          weight: "bold",
          color: this.opts.accent,
        });
      });
      this.y += boxH + gap;
    }
    this.y += 1;
  }

  /** Horizontal bars — the one chart shape that survives a page break. */
  bars(rows: BarRow[]) {
    if (!rows.length) return;
    const labelW = 46;
    const valueW = 18;
    const trackW = CONTENT_W - labelW - valueW - 6;
    const max = Math.max(1, ...rows.map((r) => r.value));
    const rowH = 7.2;

    for (const r of rows) {
      this.ensure(rowH);
      const mid = this.y + rowH / 2;
      this.line(toVisual(r.label), this.right, mid + 1.1, { size: 8.6 });
      const trackRight = this.right - labelW;
      this.doc.setFillColor(LINE_SOFT);
      this.doc.roundedRect(trackRight - trackW, mid - 2.1, trackW, 4.2, 2.1, 2.1, "F");
      const fill = Math.max(0, Math.min(1, r.value / max)) * trackW;
      if (fill > 0.4) {
        this.doc.setFillColor(r.color);
        // Bars grow leftwards from the right edge of the track, like the text.
        this.doc.roundedRect(trackRight - fill, mid - 2.1, fill, 4.2, 2.1, 2.1, "F");
      }
      this.line(toVisual(String(r.value)), trackRight - trackW - 2.5, mid + 1.1, {
        size: 8.4,
        weight: "bold",
        align: "left",
      });
      this.y += rowH;
    }
    this.y += 2;
  }

  /**
   * A table, right-to-left: the first column is the rightmost one.
   *
   * Rows are measured before they are drawn, so a row is never sliced in half
   * by a page break, and the header is repeated at the top of every page the
   * table continues onto.
   */
  table(spec: TableSpec) {
    const { columns, rows, compact } = spec;
    const size = compact ? 7.6 : 8.5;
    const headSize = compact ? 7.3 : 8.1;
    const padX = compact ? 1.4 : 2.2;
    const padY = 1.5;

    const totalWeight = columns.reduce((s, c) => s + c.width, 0) || 1;
    const widths = columns.map((c) => (c.width / totalWeight) * CONTENT_W);
    // Right edge of each column, walking leftwards from the page's right edge.
    const rightEdges: number[] = [];
    let cursor = this.right;
    for (const w of widths) {
      rightEdges.push(cursor);
      cursor -= w;
    }

    const cellLines = (text: string, colIndex: number, fontSize: number) => {
      this.setFont(fontSize);
      return wrapVisual(String(text ?? ""), widths[colIndex] - padX * 2, (s) =>
        this.doc.getTextWidth(s),
      );
    };

    const drawRow = (
      cells: (string | number)[],
      o: { fontSize: number; weight: Weight; fill?: string; topBorder?: boolean; color?: string },
    ) => {
      const lh = this.lineHeight(o.fontSize);
      const lines = cells.map((c, i) => cellLines(String(c ?? ""), i, o.fontSize));
      const height = Math.max(...lines.map((l) => l.length), 1) * lh + padY * 2;

      if (this.ensure(height)) drawHeader();

      if (o.fill) {
        this.doc.setFillColor(o.fill);
        this.doc.rect(this.left, this.y, CONTENT_W, height, "F");
      }
      if (o.topBorder) {
        this.doc.setDrawColor(LINE);
        this.doc.setLineWidth(0.4);
        this.doc.line(this.left, this.y, this.right, this.y);
      }

      lines.forEach((cell, i) => {
        const align = columns[i]?.align ?? (i === 0 ? "right" : "center");
        const xRight = rightEdges[i];
        const x =
          align === "center"
            ? xRight - widths[i] / 2
            : align === "left"
              ? xRight - widths[i] + padX
              : xRight - padX;
        cell.forEach((l, k) => {
          this.line(l, x, this.y + padY + lh * (k + 1) - lh * 0.28, {
            size: o.fontSize,
            weight: o.weight,
            color: o.color ?? INK,
            align,
          });
        });
      });

      this.y += height;
      this.doc.setDrawColor(LINE_SOFT);
      this.doc.setLineWidth(0.2);
      this.doc.line(this.left, this.y, this.right, this.y);
    };

    const drawHeader = () => {
      drawRow(
        columns.map((c) => c.header),
        {
          fontSize: headSize,
          weight: "bold",
          fill: FILL_HEAD,
          color: "#3A4761",
        },
      );
    };

    this.ensure(24); // don't start a table at the very bottom of a page
    drawHeader();

    if (!rows.length) {
      drawRow([spec.emptyText || "אין נתונים בטווח", ...columns.slice(1).map(() => "")], {
        fontSize: size,
        weight: "normal",
        color: FAINT,
      });
    } else {
      rows.forEach((row, i) => {
        drawRow(row, { fontSize: size, weight: "normal", fill: i % 2 === 1 ? ZEBRA : WHITE });
      });
    }

    if (spec.total) {
      drawRow(spec.total, { fontSize: size, weight: "bold", fill: FILL_HEAD, topBorder: true });
    }

    this.y += 3;
  }

  /** A framed panel of label/value pairs — a compact alternative to a table. */
  facts(items: { label: string; value: string }[]) {
    if (!items.length) return;
    const size = 8.8;
    const lh = this.lineHeight(size);
    for (const item of items) {
      this.ensure(lh + 1.2);
      this.line(toVisual(item.label), this.right, this.y + lh * 0.78, { size, color: MUTED });
      this.line(toVisual(item.value), this.left, this.y + lh * 0.78, {
        size,
        weight: "bold",
        align: "left",
      });
      this.y += lh + 0.8;
    }
    this.y += 1.6;
  }

  // ---- output -------------------------------------------------------------

  /** Pages written so far. */
  pageCount(): number {
    return this.doc.getNumberOfPages();
  }

  /** Bytes of the finished document, footers included. */
  bytes(): Uint8Array {
    this.stampFooters();
    return new Uint8Array(this.doc.output("arraybuffer") as ArrayBuffer);
  }

  /**
   * Hands the document to the native save dialog.
   * Resolves false when the user cancels — that is not a failure.
   */
  save(filename: string): Promise<boolean> {
    // Not doc.save(): that builds an `<a download>`, which does nothing at
    // all inside a WebView.
    return saveBinaryFile(filename.endsWith(".pdf") ? filename : `${filename}.pdf`, this.bytes());
  }
}
