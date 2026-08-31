import { describe, it, expect, beforeEach } from "vitest";

import {
  formatMonthKey,
  isReportDue,
  isReported,
  monthKey,
  reportedMonthFor,
  setReported,
  REPORT_WINDOW_LAST_DAY,
} from "./phone-report";

beforeEach(() => {
  // Each test starts with nothing reported.
  for (const month of ["2026-07", "2026-08", "2025-12"]) setReported(month, false);
});

describe("which month a report is about", () => {
  it("is the month before the one we are in", () => {
    expect(reportedMonthFor(new Date(2026, 8, 3))).toBe("2026-08");
  });

  it("crosses the year boundary backwards", () => {
    expect(reportedMonthFor(new Date(2026, 0, 2))).toBe("2025-12");
  });

  it("agrees with monthKey", () => {
    expect(monthKey(new Date(2026, 7, 31))).toBe("2026-08");
  });
});

describe("when the reminder is due", () => {
  it("runs from the 1st to the 5th", () => {
    for (let day = 1; day <= REPORT_WINDOW_LAST_DAY; day++) {
      expect(isReportDue(new Date(2026, 8, day), []), `day ${day}`).toBe(true);
    }
  });

  it("stops after the 5th — by then it is late, and saying so again helps nobody", () => {
    expect(isReportDue(new Date(2026, 8, REPORT_WINDOW_LAST_DAY + 1), [])).toBe(false);
    expect(isReportDue(new Date(2026, 8, 28), [])).toBe(false);
  });

  it("stops the moment the month is marked as reported", () => {
    expect(isReportDue(new Date(2026, 8, 2), ["2026-08"])).toBe(false);
    // A different month having been reported changes nothing.
    expect(isReportDue(new Date(2026, 8, 2), ["2026-07"])).toBe(true);
  });
});

describe("marking a month", () => {
  it("records it, and undoing takes it back", () => {
    expect(isReported("2026-08")).toBe(false);
    setReported("2026-08", true);
    expect(isReported("2026-08")).toBe(true);
    setReported("2026-08", false);
    expect(isReported("2026-08")).toBe(false);
  });

  it("does not record the same month twice", () => {
    setReported("2026-08", true);
    setReported("2026-08", true);
    setReported("2026-07", true);
    expect(isReportDue(new Date(2026, 8, 1))).toBe(false);
    expect(isReported("2026-07")).toBe(true);
  });
});

describe("formatMonthKey", () => {
  it("reads as a month, not as a sort key", () => {
    expect(formatMonthKey("2026-08")).toBe("08/2026");
  });

  it("leaves anything it does not recognise alone", () => {
    expect(formatMonthKey("whatever")).toBe("whatever");
  });
});
