import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads the real stylesheet, so a palette edit that drops text below AA on any
// surface it is drawn on fails here rather than in someone's window.
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  const end = css.indexOf("\n}", start);
  const vars: Record<string, string> = {};
  for (const m of css.slice(start, end).matchAll(/--([a-z-]+):\s*([^;]+?);/g)) vars[m[1]] = m[2];
  return vars;
}

type Rgb = [number, number, number]; // linear

function parse(value: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const n = hex[1];
    return [0, 2, 4].map((i) => {
      const v = parseInt(n.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as Rgb;
  }
  const ok = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value.trim());
  if (!ok) throw new Error(`cannot parse colour: ${value}`);
  const [L, C, h] = [+ok[1], +ok[2], (+ok[3] * Math.PI) / 180];
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const lum = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function ratio(fg: string, bg: string): number {
  const x = lum(parse(fg));
  const y = lum(parse(bg));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TEXT = [
  "status-present-fg",
  "status-late-fg",
  "status-absent-fg",
  "status-excused-fg",
  "status-none-fg",
  "warning-fg",
  "muted-foreground",
  "copper",
];

describe.each([
  { name: "light", selector: ":root", surfaces: ["background", "card", "secondary", "accent"] },
  { name: "dark", selector: ".dark", surfaces: ["background", "card", "secondary", "accent"] },
])("text colours on the $name surfaces", ({ selector, surfaces }) => {
  const vars = block(selector);
  for (const fg of TEXT) {
    for (const bg of surfaces) {
      it(`${fg} on ${bg} reaches 4.5:1`, () => {
        expect(ratio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("accent on its own text", () => {
  for (const [name, selector] of [
    ["light", ":root"],
    ["dark", ".dark"],
  ] as const) {
    it(`${name}: primary-foreground on primary reaches 4.5:1`, () => {
      const v = block(selector);
      expect(ratio(v["primary-foreground"], v["primary"])).toBeGreaterThanOrEqual(4.5);
    });
  }
});

// Every colour theme replaces --primary, and the app uses it three ways: as a
// button fill under a label, as text (links, "פעיל"), and as a focus ring. So a
// theme has to hold as text on the page and the sheet, and carry its label.
const themeBlocks = [...css.matchAll(/html(\.dark)?\[data-theme="(\w+)"\] \{([^}]*)\}/g)].map(
  (m) => {
    const primary = /--primary:\s*([^;]+);/.exec(m[3])?.[1];
    const fg = /--primary-foreground:\s*([^;]+);/.exec(m[3])?.[1];
    return { dark: !!m[1], name: m[2], primary, fg };
  },
);

describe("colour themes", () => {
  it("finds every theme in the stylesheet", () => {
    expect(themeBlocks.length).toBeGreaterThanOrEqual(22);
  });
  for (const t of themeBlocks.filter((b) => b.primary)) {
    const base = block(t.dark ? ".dark" : ":root");
    const label = `${t.dark ? "dark" : "light"} ${t.name}`;
    it(`${label}: primary reads as text on the page and the sheet`, () => {
      for (const surface of ["background", "card"]) {
        expect(ratio(t.primary!, base[surface])).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${label}: the button label reads on the primary fill`, () => {
      expect(ratio(t.fg ?? base["primary-foreground"], t.primary!)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
