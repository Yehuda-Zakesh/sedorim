// The picker swatches, shared so the Settings screen and the PDF exporter agree
// on what "the user's colour" actually is.
//
// These are plain hex on purpose. The live app themes itself through the
// oklch() custom properties in styles.css, but a PDF has no stylesheet and no
// colour functions — anything that has to survive an export needs a literal
// value. Keep the two in step: each hex here is the light-mode `--primary` of
// the matching `html[data-theme=...]` block.
import type { ColorTheme, BgTheme } from "./settings-store";

export const COLOR_THEMES: { id: ColorTheme; label: string; hex: string }[] = [
  { id: "blue", label: "כחול", hex: "#1565C0" },
  { id: "indigo", label: "אינדיגו", hex: "#3F51B5" },
  { id: "violet", label: "סגול", hex: "#7C3AED" },
  { id: "pink", label: "ורוד", hex: "#DB2777" },
  { id: "rose", label: "רוז", hex: "#E11D48" },
  { id: "crimson", label: "אדום", hex: "#C62828" },
  { id: "amber", label: "ענבר", hex: "#D97706" },
  { id: "lime", label: "ליים", hex: "#65A30D" },
  { id: "emerald", label: "ירוק", hex: "#059669" },
  { id: "teal", label: "טורקיז", hex: "#0D9488" },
  { id: "slate", label: "אפור", hex: "#475569" },
];

export const BG_THEMES: { id: BgTheme; label: string; hex: string }[] = [
  { id: "white", label: "לבן (ברירת מחדל)", hex: "#F5F5F5" },
  { id: "paper", label: "נייר", hex: "#FAF8F1" },
  { id: "cream", label: "שמנת", hex: "#F8F1DE" },
  { id: "sand", label: "חול", hex: "#F1E9D2" },
  { id: "peach", label: "אפרסק", hex: "#FAE3D0" },
  { id: "blush", label: "ורדרד", hex: "#F8E1E0" },
  { id: "lavender", label: "לבנדר", hex: "#E5DEF5" },
  { id: "sky", label: "תכלת", hex: "#D9EAF6" },
  { id: "mint", label: "מנטה", hex: "#D9F0E1" },
  { id: "gray", label: "אפור", hex: "#E5E5E5" },
];

const FALLBACK_ACCENT = "#1565C0";

/** The chosen theme's accent as hex, for contexts that cannot read oklch. */
export function colorThemeHex(id: ColorTheme | undefined): string {
  return COLOR_THEMES.find((t) => t.id === id)?.hex ?? FALLBACK_ACCENT;
}
