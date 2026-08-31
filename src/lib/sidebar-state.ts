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

export function getSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  // Pre-rename installs still carry the old key; read it once as a fallback.
  const v = localStorage.getItem(SB_KEY) ?? localStorage.getItem(SB_LEGACY_KEY);
  return v === "1";
}

export function useSidebarCollapsed() {
  const [c, setC] = useState<boolean>(() => getSidebarCollapsed());
  useEffect(() => {
    const h = () => setC(getSidebarCollapsed());
    window.addEventListener("kollel:sidebar", h);
    return () => window.removeEventListener("kollel:sidebar", h);
  }, []);
  const toggle = () => {
    const next = !getSidebarCollapsed();
    localStorage.setItem(SB_KEY, next ? "1" : "0");
    window.dispatchEvent(new Event("kollel:sidebar"));
  };
  return { collapsed: c, toggle };
}
