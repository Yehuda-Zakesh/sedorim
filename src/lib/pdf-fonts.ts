// The Hebrew font the PDF exporter embeds into every document it writes.
//
// jsPDF ships only the 14 standard PDF fonts, none of which has a single
// Hebrew glyph — which is why the old exporter took a *screenshot* of the
// report instead of writing text. A real font, embedded, is what makes a
// vector PDF possible: selectable, searchable Hebrew text at any zoom.
//
// The TTFs live in public/fonts and are therefore inside the EXE, so this
// works with no network at all. They are the very same files the app's own UI
// renders with (@font-face in src/styles.css) — one font, one appearance on
// screen and on paper.
import { bytesToBase64 } from "./base64";

export type HeeboFonts = { regular: string; bold: string };

const FILES = {
  regular: "fonts/Heebo-Regular.ttf",
  bold: "fonts/Heebo-Bold.ttf",
};

let cached: Promise<HeeboFonts> | null = null;

async function fetchAsBase64(path: string): Promise<string> {
  const base = import.meta.env?.BASE_URL ?? "/";
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return bytesToBase64(new Uint8Array(await res.arrayBuffer()));
}

/**
 * Both weights, base64-encoded, ready for jsPDF's `addFileToVFS`.
 *
 * Cached for the life of the window: the files are ~44KB each and a user
 * exporting three reports in a row should not pay for them three times. A
 * failed load is *not* cached, so a transient error can be retried.
 */
export function loadHeeboFonts(): Promise<HeeboFonts> {
  if (!cached) {
    cached = Promise.all([fetchAsBase64(FILES.regular), fetchAsBase64(FILES.bold)])
      .then(([regular, bold]) => ({ regular, bold }))
      .catch((err) => {
        cached = null;
        throw err;
      });
  }
  return cached;
}
