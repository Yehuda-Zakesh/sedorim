import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("returns an empty string for nothing", () => {
    expect(cn()).toBe("");
    expect(cn("")).toBe("");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, 0, "", "b")).toBe("a b");
  });

  it("takes conditional objects", () => {
    expect(cn({ a: true, b: false, c: true })).toBe("a c");
  });

  it("flattens arrays, however deeply nested", () => {
    expect(cn(["a", ["b", ["c"]]])).toBe("a b c");
  });

  it("mixes strings, arrays and objects", () => {
    expect(cn("a", ["b"], { c: true, d: false })).toBe("a b c");
  });

  it("lets the last of two conflicting Tailwind utilities win", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("keeps utilities that do not actually conflict", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
    expect(cn("mt-2", "mb-2")).toBe("mt-2 mb-2");
  });

  it("resolves a shorthand against its longhand", () => {
    expect(cn("p-2", "px-4")).toBe("p-2 px-4");
    expect(cn("px-4", "p-2")).toBe("p-2");
  });

  it("keeps variants separate from the base utility", () => {
    expect(cn("hover:bg-red-500", "bg-blue-500")).toBe("hover:bg-red-500 bg-blue-500");
    expect(cn("hover:bg-red-500", "hover:bg-blue-500")).toBe("hover:bg-blue-500");
  });

  it("lets a conditional override an earlier class", () => {
    expect(cn("bg-white", { "bg-black": true })).toBe("bg-black");
    expect(cn("bg-white", { "bg-black": false })).toBe("bg-white");
  });

  it("collapses repeated whitespace", () => {
    expect(cn("  a   b  ", "c")).toBe("a b c");
  });

  it("leaves non-Tailwind class names alone", () => {
    expect(cn("hc", "compact", "hc")).toContain("compact");
  });

  it("is the identity for a single class", () => {
    expect(cn("flex")).toBe("flex");
  });
});
