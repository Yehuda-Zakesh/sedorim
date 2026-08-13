import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Keyboard, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppSidebar, useSidebarCollapsed } from "./app-sidebar";
import { ShortcutsHelp } from "./shortcuts-help";
import { useTheme } from "@/lib/use-theme";
import { applyAppearance, useSettings, useNeedsOnboarding } from "@/lib/settings-store";
import { useGlobalShortcuts } from "@/lib/shortcuts";
import { OnboardingWizard } from "./onboarding-wizard";
import { useAutoUpdateCheck } from "@/lib/updater";
import { UpdatePrompt } from "./update-prompt";
import { BUILD_COMMIT, BUILD_TIME } from "@/lib/build-info";
import pkg from "../../package.json";

// Single source of truth: package.json's "version" field. BUILD_COMMIT/
// BUILD_TIME (from build-info.ts) are only meaningful in a packaged EXE —
// see that file for why. Together these let you check, from the About
// screen, exactly what code a given install actually has — no more
// guessing whether a repackage picked up the latest fixes.
export const APP_VERSION = pkg.version;
export { BUILD_COMMIT, BUILD_TIME };

export function AppShell({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  useSettings(); // re-render on settings change
  const { collapsed } = useSidebarCollapsed();
  const [helpOpen, setHelpOpen] = useState(false);
  // Reads through to the shared data file, so finishing the wizard in one EXE
  // means the other one never shows it again.
  const needsOnboarding = useNeedsOnboarding();

  useEffect(() => { applyAppearance(); }, []);
  useGlobalShortcuts(() => setHelpOpen((v) => !v));
  const { update, dismiss } = useAutoUpdateCheck();

  const cycle = () => setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = theme === "light" ? "בהיר" : theme === "dark" ? "כהה" : "מערכת";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar />
      <div className={`${collapsed ? "mr-[64px]" : "mr-[220px]"} flex flex-col min-h-screen transition-[margin] duration-200`}>
        <header className="sticky top-0 z-20 bg-card/80 backdrop-blur border-b border-border">
          <div className="flex items-center justify-between gap-4 px-6 py-3.5">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              {actions}
              <Link to="/search" title="חיפוש"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 text-xs hover:bg-accent transition">
                <Search className="size-4" />
              </Link>
              <button onClick={() => setHelpOpen(true)} title="קיצורי מקלדת (?)"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 text-xs hover:bg-accent transition">
                <Keyboard className="size-4" />
              </button>
              <button onClick={cycle} title={`ערכת נושא: ${label}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 text-xs hover:bg-accent transition">
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
        <footer className="border-t border-border bg-card/40 px-6 py-3 text-center text-[11px] text-muted-foreground">
          התוכנה נוצרה ע"י יהודה זקש · כל הזכויות לא שמורות · גרסה {APP_VERSION}
        </footer>
      </div>
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      {/* No local state to clear: the wizard's own markOnboarded() flips the
          shared flag, which is what re-renders this and hides it. */}
      {needsOnboarding && <OnboardingWizard onComplete={() => {}} />}
      {update && <UpdatePrompt info={update} onClose={dismiss} />}
    </div>
  );
}
