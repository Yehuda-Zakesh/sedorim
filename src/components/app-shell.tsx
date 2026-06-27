import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Keyboard } from "lucide-react";
import { AppSidebar, useSidebarCollapsed } from "./app-sidebar";
import { ShortcutsHelp } from "./shortcuts-help";
import { useTheme } from "@/lib/use-theme";
import { applyAppearance, useSettings, isOnboarded } from "@/lib/settings-store";
import { useGlobalShortcuts } from "@/lib/shortcuts";
import { OnboardingWizard } from "./onboarding-wizard";

export const APP_VERSION = "1.0.0";

export function AppShell({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  useSettings(); // re-render on settings change
  const { collapsed } = useSidebarCollapsed();
  const [helpOpen, setHelpOpen] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => { applyAppearance(); }, []);
  useEffect(() => { setNeedsOnboarding(!isOnboarded()); }, []);
  useGlobalShortcuts(() => setHelpOpen((v) => !v));

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
      {needsOnboarding && <OnboardingWizard onComplete={() => setNeedsOnboarding(false)} />}
    </div>
  );
}
