import { describe, expect, it } from "vitest";
import {
  dayLabelWithDate,
  monthPrefixOf,
  parseISODate,
  relativeDayName,
  shiftISO,
  shortDate,
} from "./quick-day";

const now = new Date(2026, 9, 31, 0, 30);

describe("quick-day", () => {
  it("shifts across month boundaries", () => {
    expect(shiftISO(now, -1)).toBe("2026-10-30");
    expect(shiftISO(new Date(2026, 2, 1), -1)).toBe("2026-02-28");
  });
  it("rejects impossible dates", () => {
    expect(parseISODate("2026-02-30")).toBeNull();
    expect(parseISODate("x")).toBeNull();
    expect(parseISODate("2026-10-30")).not.toBeNull();
  });
  it("names days", () => {
    expect(relativeDayName("2026-10-31", now)).toBe("היום");
    expect(relativeDayName("2026-10-30", now)).toBe("אתמול");
    expect(relativeDayName("2026-10-12", now)).toBe("12.10");
    expect(dayLabelWithDate("2026-10-30", now)).toBe("אתמול, 30.10");
    expect(dayLabelWithDate("2026-10-12", now)).toBe("12.10");
    expect(dayLabelWithDate("2026-10-31", now)).toBe("היום");
    expect(shortDate("2026-01-05")).toBe("05.01");
  });
  it("month prefix", () => {
    expect(monthPrefixOf("2026-10-30")).toBe("2026-10");
  });
});
