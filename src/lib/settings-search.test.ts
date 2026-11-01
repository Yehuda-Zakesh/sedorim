import { describe, expect, it } from "vitest";
import { matches, tokensOf, visibleItems } from "./settings-search";

const group = {
  label: "מראה ופרופיל",
  hint: "השם בדוחות, צבעים",
  items: [{ label: "גודל גופן", keywords: "טקסט" }, { label: "שם תצוגה" }],
};

describe("settings search", () => {
  it("shows everything with no query", () => {
    expect(visibleItems(group, tokensOf("  "))).toEqual([true, true]);
  });

  it("shows only the rows whose label or keywords match", () => {
    expect(visibleItems(group, tokensOf("גופן"))).toEqual([true, false]);
    expect(visibleItems(group, tokensOf("טקסט"))).toEqual([true, false]);
  });

  it("shows a whole group when its own title matches", () => {
    expect(visibleItems(group, tokensOf("פרופיל"))).toEqual([true, true]);
  });

  it("ignores niqqud and quote marks", () => {
    expect(matches("חבורת ש״ס", tokensOf("שס"))).toBe(true);
  });

  it("returns to the full list when the query is cleared", () => {
    expect(visibleItems(group, tokensOf("גופן"))).toEqual([true, false]);
    expect(visibleItems(group, tokensOf(""))).toEqual([true, true]);
  });
});
