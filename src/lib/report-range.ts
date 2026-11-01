// What a report run will actually send to the exporter.
//
// The reports screen used to build its "what will be produced" line from one
// set of rules and the exporter's arguments from another: a PDF with only one
// date filled showed "from X onwards" while the exporter was handed no range
// at all. Both now come from this one function, so the line the user reads is
// the same thing the exporter receives. Pure — no store, no clock.

export type ReportKind = "monthly" | "yearly" | "exec" | "learn" | "xlsx" | "custom";
export type RangeMode = "month" | "all" | "dates";
export type ReportFormat = "pdf" | "xlsx";

export type DateRange = { from: string; to: string };

export type ReportPlanInput = {
  kind: ReportKind;
  /** Only read for the custom report; every other kind fixes its format. */
  fmt: ReportFormat;
  rangeMode: RangeMode;
  /** The month chosen on the shared picker, YYYY-MM. */
  month: string;
  /** The two date fields of the custom range, "" when empty. */
  from: string;
  to: string;
};

export type ReportPlan = {
  format: ReportFormat;
  /** Passed to exportPdfReport as `range`. Undefined means the whole period. */
  pdfRange: DateRange | undefined;
  /** Lower / upper bound applied to the workbook rows; "" means unbounded. */
  xlsxFrom: string;
  xlsxTo: string;
  /** The period, in words, as it will really be applied. */
  periodLabel: string;
  /** Set when the run must not start; says what is missing. */
  problem: string | null;
};

export function monthBounds(month: string): DateRange {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

const isoLabel = (iso: string) => iso.split("-").reverse().join(".");

export function planReport(i: ReportPlanInput): ReportPlan {
  const format: ReportFormat = i.kind === "xlsx" ? "xlsx" : i.kind === "custom" ? i.fmt : "pdf";
  const base = { format, problem: null as string | null };
  const whole = (periodLabel: string): ReportPlan => ({
    ...base,
    pdfRange: undefined,
    xlsxFrom: "",
    xlsxTo: "",
    periodLabel,
  });
  const bounded = (r: DateRange, periodLabel: string): ReportPlan => ({
    ...base,
    pdfRange: r,
    xlsxFrom: r.from,
    xlsxTo: r.to,
    periodLabel,
  });

  switch (i.kind) {
    case "monthly":
      return bounded(monthBounds(i.month), "החודש הנבחר");
    case "yearly": {
      const y = i.month.slice(0, 4);
      return bounded({ from: `${y}-01-01`, to: `${y}-12-31` }, `שנת ${y}`);
    }
    case "exec":
    case "learn":
    case "xlsx":
      return whole("כל התקופה");
    case "custom":
      break;
  }

  if (i.rangeMode === "month") return bounded(monthBounds(i.month), "החודש הנבחר");
  if (i.rangeMode === "all") return whole("כל התקופה");

  // A free date range.
  const { from, to } = i;
  const none: ReportPlan = {
    ...base,
    pdfRange: undefined,
    xlsxFrom: from,
    xlsxTo: to,
    periodLabel: "טרם נבחר טווח",
  };
  if (!from && !to) return { ...none, problem: "לא הוזן טווח. מלא תאריך התחלה וסיום." };
  if (from && to && from > to) {
    return {
      ...none,
      periodLabel: `${isoLabel(from)} עד ${isoLabel(to)}`,
      problem: "תאריך ההתחלה מאוחר מתאריך הסיום.",
    };
  }
  if (from && to) {
    return {
      ...base,
      pdfRange: { from, to },
      xlsxFrom: from,
      xlsxTo: to,
      periodLabel: `${isoLabel(from)} עד ${isoLabel(to)}`,
    };
  }
  // One end only. The workbook filters each bound on its own; the PDF
  // exporter takes a range only with both ends, so a PDF is held back.
  const label = from ? `מ-${isoLabel(from)} ואילך` : `עד ${isoLabel(to)}`;
  if (format === "pdf") {
    return {
      ...none,
      periodLabel: label,
      problem: `דוח PDF דורש שני תאריכים. מלא גם את ${from ? "תאריך הסיום" : "תאריך ההתחלה"}, או עבור לקובץ Excel שתומך בטווח פתוח.`,
    };
  }
  return { ...base, pdfRange: undefined, xlsxFrom: from, xlsxTo: to, periodLabel: label };
}

/** What the file will contain, for the line shown before producing it. */
export function describeContents(
  kind: ReportKind,
  format: ReportFormat,
  sectionLabels: string[],
): string {
  if (format === "xlsx") return "סדרים, לימוד נוסף וסיכום חודשי. הקובץ כולל תמיד את כל הסעיפים";
  switch (kind) {
    case "exec":
      return "סיכומי KPI ותרשימים בלבד";
    case "learn":
      return "לימוד נוסף בלבד, כל המסגרות";
    default:
      return sectionLabels.length ? sectionLabels.join(", ") : "לא נבחרו סעיפים";
  }
}
