import { describe, it, expect } from "vitest";
import { fmtMin } from "./insights";

describe("fmtMin", () => {
  it("formats under an hour as minutes", () => {
    expect(fmtMin(0)).toBe("0 דק׳");
    expect(fmtMin(45)).toBe("45 דק׳");
  });

  it("formats exact hours without a minutes remainder", () => {
    expect(fmtMin(60)).toBe("1 שע׳");
    expect(fmtMin(120)).toBe("2 שע׳");
  });

  it("formats hours + minutes as H:MM", () => {
    expect(fmtMin(90)).toBe("1:30 שע׳");
    expect(fmtMin(125)).toBe("2:05 שע׳");
  });
});
