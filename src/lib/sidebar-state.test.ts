import { describe, expect, it } from "vitest";
import { isNarrowWindow, resolveSidebarCollapsed } from "./sidebar-state";

describe("sidebar auto-collapse", () => {
  it("folds by itself only in a narrow window", () => {
    expect(isNarrowWindow(900)).toBe(true);
    expect(isNarrowWindow(1000)).toBe(false);
    expect(resolveSidebarCollapsed(null, 900)).toBe(true);
    expect(resolveSidebarCollapsed(null, 1400)).toBe(false);
  });
  it("lets the person's own choice win at any width", () => {
    expect(resolveSidebarCollapsed(false, 900)).toBe(false);
    expect(resolveSidebarCollapsed(true, 1400)).toBe(true);
  });
});
