import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export type Shortcut = { keys: string; label: string; to?: string; action?: () => void };

// Every target here is a tab of one of the areas in src/lib/nav.ts.
export const SHORTCUTS: Shortcut[] = [
  { keys: "g d", label: "היום", to: "/" },
  { keys: "g a", label: "רישום נוכחות", to: "/attendance" },
  { keys: "g h", label: "היומן שלי — רשימה", to: "/history" },
  { keys: "g c", label: "היומן שלי — לוח שנה", to: "/calendar" },
  { keys: "g l", label: "לימוד נוסף", to: "/learning" },
  { keys: "g s", label: "סיכום חודש", to: "/statistics" },
  { keys: "g m", label: "מלגה", to: "/stipend" },
  { keys: "g r", label: "דוחות", to: "/reports" },
  { keys: "g b", label: "נתונים וגיבוי", to: "/backup" },
  { keys: "g ,", label: "הגדרות", to: "/settings" },
  { keys: "/", label: "חיפוש מתקדם", to: "/search" },
  { keys: "?", label: "הצג קיצורי דרך" },
];

export function useGlobalShortcuts(toggleHelp: () => void) {
  const navigate = useNavigate();
  useEffect(() => {
    let chord: string | null = null;
    let chordTimer: number | null = null;
    const clearChord = () => {
      chord = null;
      if (chordTimer) {
        clearTimeout(chordTimer);
        chordTimer = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const k = e.key;
      if (k === "?" || (k === "/" && e.shiftKey)) {
        e.preventDefault();
        toggleHelp();
        return;
      }
      if (k === "/") {
        e.preventDefault();
        navigate({ to: "/search" });
        return;
      }

      if (chord === "g") {
        const map: Record<string, string> = {
          d: "/",
          a: "/attendance",
          c: "/calendar",
          h: "/history",
          l: "/learning",
          s: "/statistics",
          m: "/stipend",
          r: "/reports",
          b: "/backup",
          ",": "/settings",
        };
        if (map[k]) {
          e.preventDefault();
          navigate({ to: map[k] });
        }
        clearChord();
        return;
      }
      if (k === "g") {
        chord = "g";
        chordTimer = window.setTimeout(clearChord, 1200);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearChord();
    };
  }, [navigate, toggleHelp]);
}
