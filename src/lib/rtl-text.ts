// Turning a Hebrew string into the order a PDF has to draw it in.
//
// A PDF has no notion of direction: `Tj` paints glyphs left to right in
// exactly the order they are handed over. A browser runs the Unicode
// bidirectional algorithm for us; a PDF writer has to do it itself, or Hebrew
// comes out backwards and embedded numbers come out backwards twice.
//
// This is a deliberately small subset of UAX #9, enough for what the reports
// actually contain: Hebrew, Latin, digits, times ("09:00"), dates
// ("20/08/2026"), punctuation and brackets, always inside a right-to-left
// paragraph. No Arabic shaping, no explicit direction marks, no nesting
// beyond one level of Latin/number runs inside Hebrew.

/** Character direction classes we care about. */
type Dir = "R" | "L" | "N";

// Hebrew block, Hebrew presentation forms, and the geresh/gershayim.
const RTL_RE = /[֐-׿יִ-ﭏ‏]/;
// Latin letters and digits both lay out left-to-right inside Hebrew text.
const LTR_RE = /[A-Za-zÀ-ɏ0-9‎]/;

function classify(ch: string): Dir {
  if (RTL_RE.test(ch)) return "R";
  if (LTR_RE.test(ch)) return "L";
  return "N";
}

/** Brackets and friends flip when they sit in right-to-left text. */
const MIRROR: Record<string, string> = {
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
  "<": ">",
  ">": "<",
  "«": "»",
  "»": "«",
  "‹": "›",
  "›": "‹",
};

/**
 * Reorders a logical-order string into the visual order a PDF must paint,
 * assuming a right-to-left paragraph.
 *
 * Latin words, numbers, times and dates keep their own left-to-right reading
 * order; everything else is laid out from the right. Brackets around Hebrew
 * are mirrored so "(3 איחורים)" still reads as a parenthesis on paper.
 */
export function toVisual(text: string): string {
  if (!text) return "";
  // Nothing Hebrew in it — a pure number, an ISO date, a Latin word. Leave it
  // exactly as it is; reordering would only risk breaking it.
  if (!RTL_RE.test(text)) return text;

  const chars = Array.from(text);
  const classes = chars.map(classify);

  // Neutrals (spaces, punctuation) belong to the run around them: between two
  // Latin/number characters they are part of that left-to-right run, and
  // anywhere else they follow the paragraph and go right-to-left.
  const resolved: ("R" | "L")[] = classes.map((c, i) => {
    if (c !== "N") return c;
    let prev: Dir = "R";
    for (let j = i - 1; j >= 0; j--)
      if (classes[j] !== "N") {
        prev = classes[j];
        break;
      }
    let next: Dir = "R";
    for (let j = i + 1; j < classes.length; j++)
      if (classes[j] !== "N") {
        next = classes[j];
        break;
      }
    return prev === "L" && next === "L" ? "L" : "R";
  });

  // Mirror the brackets that ended up in right-to-left text, before anything
  // is reordered — mirroring is about the character, not its position.
  const mirrored = chars.map((ch, i) => (resolved[i] === "R" && MIRROR[ch] ? MIRROR[ch] : ch));

  // Lay the whole line out from the right...
  const out = mirrored.reverse();
  const dirs = resolved.slice().reverse();

  // ...then put each left-to-right run back the way round it was read.
  for (let i = 0; i < out.length; i++) {
    if (dirs[i] !== "L") continue;
    let j = i;
    while (j + 1 < out.length && dirs[j + 1] === "L") j++;
    // A run of trailing neutrals that got pulled into an L run — e.g. the
    // space after a number — would otherwise be reversed on its own; that is
    // harmless (a space reversed is a space) and keeps this loop simple.
    for (let a = i, b = j; a < b; a++, b--) {
      const t = out[a];
      out[a] = out[b];
      out[b] = t;
    }
    i = j;
  }

  return out.join("");
}

/**
 * Splits a logical-order string into lines that each fit `maxWidth`, then
 * converts every line to visual order.
 *
 * Wrapping has to happen on the logical string — breaking a visual one would
 * cut words in half — and `measure` is order-independent, so measuring the
 * logical text is safe.
 */
export function wrapVisual(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const paragraphs = String(text ?? "").split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= maxWidth || !current) {
        // A single word wider than the column still goes on its own line —
        // there is nowhere better to put it, and hard-breaking mid-word reads
        // worse than a little overflow.
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines.map(toVisual);
}
