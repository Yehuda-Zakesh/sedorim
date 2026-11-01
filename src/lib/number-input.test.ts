import { describe, expect, it } from "vitest";
import { finalNumber, liveNumber } from "./number-input";

describe("liveNumber", () => {
  it("accepts in-range text", () => {
    expect(liveNumber("45", 30, 120)).toBe(45);
    expect(liveNumber("30", 30, 120)).toBe(30);
  });
  it("leaves mid-typing text alone", () => {
    expect(liveNumber("", 30, 120)).toBeNull();
    expect(liveNumber("4", 30, 120)).toBeNull();
    expect(liveNumber("500", 30, 120)).toBeNull();
    expect(liveNumber("-", 30, 120)).toBeNull();
  });
});

describe("finalNumber", () => {
  it("clamps to the business range when editing ends", () => {
    expect(finalNumber("4", 30, 120)).toBe(30);
    expect(finalNumber("500", 30, 120)).toBe(120);
    expect(finalNumber("60", 30, 120)).toBe(60);
  });
  it("treats empty or garbage as 0, then clamps", () => {
    expect(finalNumber("", 0, 10)).toBe(0);
    expect(finalNumber("", 5, 10)).toBe(5);
    expect(finalNumber("abc", 5, 10)).toBe(5);
  });
});
