import { useEffect, useState } from "react";

// The collapsed/expanded state of the main sidebar.
//
// This lives apart from AppSidebar on purpose: a file that exports both a
// component and a hook loses Fast Refresh, so editing the nav list would
// remount the tree and drop the state of whatever screen is open. See
// react-refresh/only-export-components in eslint.config.js.
//
// Kept in localStorage rather than the shared data file: it is per-window
// chrome, not data, and the quick window has its own WebView profile and no
// sidebar at all.
const SB_KEY = "sederplus.sidebar.collapsed.v1";
const SB_LEGACY_KEY = "kollel.sidebar.collapsed.v1";

// The choice made in this session, so the toggle works even when localStorage
// is unavailable (private window, blocked site data) — it just is not remembered.
let sessionChoice: boolean | null = null;

/** Below this window width the rail folds by itself. */
export const SIDEBAR_AUTO_COLLAPSE_PX = 1000;

/**
 * The person's own choice: true/false once they have pressed the toggle, null
 * while they never have. It is stored apart from the automatic fold — a narrow
 * window must not overwrite it, and it wins over the window width.
 */
export function getSidebarChoice(): boolean | null {
  if (typeof window === "undefined") return null;
  if (sessionChoice !== null) return sessionChoice;
  try {
    // Pre-rename installs still carry the old key; read it once as a fallback.
    const v = localStorage.getItem(SB_KEY) ?? localStorage.getItem(SB_LEGACY_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function isNarrowWindow(width: number): boolean {
  return width < SIDEBAR_AUTO_COLLAPSE_PX;
}

/** Choice if there is one, otherwise whatever the window width asks for. */
export function resolveSidebarCollapsed(choice: boolean | null, width: number): boolean {
  return choice ?? isNarrowWindow(width);
}

export function getSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return resolveSidebarCollapsed(getSidebarChoice(), window.innerWidth);
}

export function useSidebarCollapsed() {
  const [c, setC] = useState<boolean>(() => getSidebarCollapsed());
  useEffect(() => {
    const h = () => setC(getSidebarCollapsed());
    window.addEventListener("kollel:sidebar", h);
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("kollel:sidebar", h);
      window.removeEventListener("resize", h);
    };
  }, []);
  const toggle = () => {
    const next = !getSidebarCollapsed();
    sessionChoice = next;
    try {
      localStorage.setItem(SB_KEY, next ? "1" : "0");
    } catch {
      /* unavailable storage: sessionChoice above still carries it for this session */
    }
    window.dispatchEvent(new Event("kollel:sidebar"));
  };
  return { collapsed: c, toggle };
}
