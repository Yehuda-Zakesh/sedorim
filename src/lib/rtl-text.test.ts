// Hebrew in a PDF is drawn glyph by glyph in the order handed over, so this
// reordering is the difference between a readable report and a mirrored one.
// Each case below is written the way it must come out *on paper*, read left
// to right.
import { describe, it, expect } from "vitest";
import { toVisual, wrapVisual } from "./rtl-text";

/** Reading a Hebrew word right-to-left — what the eye sees on the page. */
const rev = (s: string) => Array.from(s).reverse().join("");

describe("toVisual", () => {
  it("lays a Hebrew word out from the right", () => {
    expect(toVisual("שלום")).toBe(rev("שלום"));
  });

  it("leaves a string with no Hebrew in it alone", () => {
    for (const s of ["2026-08-20", "142", "PDF", "12:30", ""]) {
      expect(toVisual(s)).toBe(s);
    }
  });

  it("keeps a time inside Hebrew text readable", () => {
    // "סדר א׳ 09:00" → the time stays "09:00", not "00:90".
    expect(toVisual("סדר א׳ 09:00")).toBe(`09:00 ${rev("סדר א׳")}`);
  });

  it("keeps a date inside Hebrew text readable", () => {
    expect(toVisual("הופק 20/08/2026")).toBe(`20/08/2026 ${rev("הופק")}`);
  });

  it("puts the words of a sentence right to left but each number forward", () => {
    expect(toVisual("סדר א׳ — 09:00 עד 13:00")).toBe(
      `13:00 ${rev("עד")} 09:00 — ${rev("סדר א׳")}`,
    );
  });

  it("keeps a Latin word in its own reading order", () => {
    expect(toVisual("PDF · סדר פלוס")).toBe(`${rev("סדר פלוס")} · PDF`);
  });

  it("mirrors brackets that sit in Hebrew text", () => {
    expect(toVisual("(איחורים)")).toBe(`(${rev("איחורים")})`);
  });

  it("mirrors brackets around a number in Hebrew text", () => {
    expect(toVisual('סה"כ 142 דק׳ (3 איחורים)')).toBe(
      `(${rev("איחורים")} 3) ${rev("דק׳")} 142 ${rev('סה"כ')}`,
    );
  });

  it("keeps gershayim attached to the Hebrew word", () => {
    expect(toVisual("תשפ״ו")).toBe(rev("תשפ״ו"));
  });

  it("keeps a number and a Latin word joined by punctuation as one run", () => {
    // "1 · SederPlus" is a single left-to-right run — the separator between
    // two Latin/number characters belongs to that run — so it moves to the
    // left of the Hebrew as a unit, unreversed.
    expect(toVisual("גרסה 1 · SederPlus")).toBe(`1 · SederPlus ${rev("גרסה")}`);
  });

  it("returns an empty string untouched", () => {
    expect(toVisual("")).toBe("");
  });

  it("is its own inverse for a single Hebrew word", () => {
    // Reordering twice is the identity — a cheap check that nothing is lost.
    expect(toVisual(toVisual("נוכחות"))).toBe("נוכחות");
  });

  it("loses no characters", () => {
    const s = 'דוח נוכחות חודשי — 20/08/2026 · סה"כ (142 דק׳)';
    expect(Array.from(toVisual(s)).sort().join("")).toBe(
      Array.from(s.replace("(", ")").replace(")", "(")).sort().join(""),
    );
  });
});

describe("wrapVisual", () => {
  // One "unit" of width per character, so the arithmetic in the tests is
  // obvious.
  const measure = (s: string) => s.length;

  it("keeps a short line on one line", () => {
    expect(wrapVisual("שלום עולם", 100, measure)).toEqual([toVisual("שלום עולם")]);
  });

  it("breaks on a space rather than mid-word", () => {
    const out = wrapVisual("אחד שתיים שלוש", 10, measure);
    expect(out).toEqual([toVisual("אחד שתיים"), toVisual("שלוש")]);
  });

  it("puts a word wider than the column on its own line", () => {
    const out = wrapVisual("א ארוכהמאודמאוד ב", 5, measure);
    expect(out).toEqual([toVisual("א"), toVisual("ארוכהמאודמאוד"), toVisual("ב")]);
  });

  it("honours explicit newlines", () => {
    expect(wrapVisual("אחד\nשתיים", 100, measure)).toEqual([
      toVisual("אחד"),
      toVisual("שתיים"),
    ]);
  });

  it("collapses runs of whitespace", () => {
    expect(wrapVisual("אחד    שתיים", 100, measure)).toEqual([toVisual("אחד שתיים")]);
  });

  it("returns one empty line for empty input", () => {
    expect(wrapVisual("", 100, measure)).toEqual([""]);
  });
});
