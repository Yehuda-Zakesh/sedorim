import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export type Shortcut = { keys: string; label: string; to?: string; action?: () => void };

export const SHORTCUTS: Shortcut[] = [
  { keys: "g d", label: "לוח בקרה",     to: "/" },
  { keys: "g a", label: "נוכחות",        to: "/attendance" },
  { keys: "g c", label: "לוח שנה",       to: "/calendar" },
  { keys: "g h", label: "היסטוריה",      to: "/history" },
  { keys: "g l", label: "לימוד נוסף",    to: "/learning" },
  { keys: "g s", label: "סטטיסטיקות",   to: "/statistics" },
  { keys: "g i", label: "תובנות",         to: "/insights" },
  { keys: "g r", label: "דוחות",          to: "/reports" },
  { keys: "g b", label: "גיבוי",          to: "/backup" },
  { keys: "g u", label: "יומן ביקורת",   to: "/audit" },
  { keys: "g ,", label: "הגדרות",         to: "/settings" },
  { keys: "/",   label: "חיפוש",          to: "/search" },
  { keys: "?",   label: "הצג קיצורי דרך" },
];

export function useGlobalShortcuts(toggleHelp: () => void) {
  const navigate = useNavigate();
  useEffect(() => {
    let chord: string | null = null;
    let chordTimer: number | null = null;
    const clearChord = () => { chord = null; if (chordTimer) { clearTimeout(chordTimer); chordTimer = null; } };

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const k = e.key;
      if (k === "?" || (k === "/" && e.shiftKey)) { e.preventDefault(); toggleHelp(); return; }
      if (k === "/") { e.preventDefault(); navigate({ to: "/search" }); return; }

      if (chord === "g") {
        const map: Record<string, string> = {
          d: "/", a: "/attendance", c: "/calendar", h: "/history",
          l: "/learning", s: "/statistics", i: "/insights",
          r: "/reports", b: "/backup", u: "/audit", ",": "/settings",
        };
        if (map[k]) { e.preventDefault(); navigate({ to: map[k] }); }
        clearChord();
        return;
      }
      if (k === "g") {
        chord = "g";
        chordTimer = window.setTimeout(clearChord, 1200);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearChord(); };
  }, [navigate, toggleHelp]);
}
