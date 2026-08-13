import { useEffect } from "react";

import { sharedValue } from "./shared-state";

type Theme = "light" | "dark" | "system";

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

// Shared, like the rest of the appearance settings: the two EXEs have
// separate WebView profiles, so a per-window copy would leave the quick
// window in light mode while the full app is dark. See shared-state.ts.
const store = sharedValue<Theme>({
  key: "theme",
  legacyKey: "tracker.theme",
  fallback: "system",
  parse: (raw) => (raw === "light" || raw === "dark" || raw === "system" ? raw : "system"),
  // Also fires when the other EXE changes it, or on hydration.
  onChange: apply,
});

// Applied at module load, before React mounts, so the first paint is already
// in the right mode instead of flashing.
apply(store.get());

export function useTheme() {
  const theme = store.use();

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => apply("system");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [theme]);

  return { theme, setTheme: (t: Theme) => store.set(t) };
}
