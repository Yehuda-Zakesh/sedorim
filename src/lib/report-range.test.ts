import { describe, expect, it } from "vitest";
import { describeContents, monthBounds, planReport, type ReportPlanInput } from "./report-range";

const base: ReportPlanInput = {
  kind: "custom",
  fmt: "pdf",
  rangeMode: "dates",
  month: "2026-02",
  from: "",
  to: "",
};

describe("planReport", () => {
  it("monthBounds handles a short month", () => {
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("monthly and yearly reports fix their own period", () => {
    const m = planReport({ ...base, kind: "monthly" });
    expect(m.pdfRange).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    const y = planReport({ ...base, kind: "yearly" });
    expect(y.pdfRange).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(y.periodLabel).toBe("שנת 2026");
  });

  it("exec, learn and xlsx cover the whole period", () => {
    for (const kind of ["exec", "learn", "xlsx"] as const) {
      const p = planReport({ ...base, kind });
      expect(p.pdfRange).toBeUndefined();
      expect(p.problem).toBeNull();
    }
    expect(planReport({ ...base, kind: "xlsx" }).format).toBe("xlsx");
  });

  it("a custom PDF with one end filled is blocked, not silently widened", () => {
    const p = planReport({ ...base, from: "2026-02-10" });
    expect(p.pdfRange).toBeUndefined();
    expect(p.problem).toMatch(/שני תאריכים/);
    expect(p.periodLabel).toContain("ואילך");
  });

  it("a custom XLSX with one end filled applies that bound and says so", () => {
    const p = planReport({ ...base, fmt: "xlsx", to: "2026-02-10" });
    expect(p.problem).toBeNull();
    expect(p.xlsxFrom).toBe("");
    expect(p.xlsxTo).toBe("2026-02-10");
    expect(p.periodLabel).toContain("עד");
  });

  it("an empty or inverted range is blocked for both formats", () => {
    for (const fmt of ["pdf", "xlsx"] as const) {
      expect(planReport({ ...base, fmt }).problem).toMatch(/לא הוזן/);
      expect(planReport({ ...base, fmt, from: "2026-03-01", to: "2026-02-01" }).problem).toMatch(
        /מאוחר/,
      );
    }
  });

  it("a full range reaches the PDF and the workbook alike", () => {
    const p = planReport({ ...base, from: "2026-02-01", to: "2026-02-09" });
    expect(p.problem).toBeNull();
    expect(p.pdfRange).toEqual({ from: "2026-02-01", to: "2026-02-09" });
    const x = planReport({ ...base, fmt: "xlsx", from: "2026-02-01", to: "2026-02-09" });
    expect([x.xlsxFrom, x.xlsxTo]).toEqual(["2026-02-01", "2026-02-09"]);
  });

  it("the selected-month mode matches in both formats", () => {
    const pdf = planReport({ ...base, rangeMode: "month" });
    const xl = planReport({ ...base, fmt: "xlsx", rangeMode: "month" });
    expect(pdf.pdfRange).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect([xl.xlsxFrom, xl.xlsxTo]).toEqual(["2026-02-01", "2026-02-28"]);
    expect(planReport({ ...base, rangeMode: "all" }).pdfRange).toBeUndefined();
  });
});

describe("describeContents", () => {
  it("names what each format contains", () => {
    expect(describeContents("custom", "xlsx", [])).toMatch(/כל הסעיפים/);
    expect(describeContents("custom", "pdf", ["א", "ב"])).toBe("א, ב");
    expect(describeContents("custom", "pdf", [])).toBe("לא נבחרו סעיפים");
    expect(describeContents("learn", "pdf", ["x"])).toMatch(/לימוד נוסף/);
  });
});
