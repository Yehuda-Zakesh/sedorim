import type { ElementType, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Keyboard, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppSidebar, useSidebarCollapsed } from "./app-sidebar";
import { ShortcutsHelp } from "./shortcuts-help";
import { useTheme } from "@/lib/use-theme";
import { applyAppearance, useSettings, useNeedsOnboarding } from "@/lib/settings-store";
import { useGlobalShortcuts } from "@/lib/shortcuts";
import { useReminderNotifications } from "@/lib/notifications";
import { OnboardingWizard } from "./onboarding-wizard";
import { useAutoUpdateCheck } from "@/lib/updater";
import { UpdatePrompt } from "./update-prompt";
import { BUILD_COMMIT, BUILD_TIME } from "@/lib/build-info";
import pkg from "../../package.json";

// Versions are whole numbers, starting from 1: this is "גרסה 1", the next
// release is 2. package.json still holds a semver string because npm requires
// one, but only the major part carries meaning — scripts/set-version.mjs
// stamps the release number into it (and into the Tauri and Cargo manifests)
// at build time.
//
// BUILD_COMMIT/BUILD_TIME (from build-info.ts) are only meaningful in a
// packaged EXE — see that file for why. Together with the version they let you
// check, from the About screen, exactly what code a given install has.
export const APP_VERSION = pkg.version.split(".")[0];
export { BUILD_COMMIT, BUILD_TIME };

/**
 * Whether the page has been scrolled at all.
 *
 * The header uses it to decide whether there is anything underneath it worth
 * separating from. Passive listener, and the state only ever flips between two
 * values, so this re-renders the shell twice per document at most.
 */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 2);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}

/** The identical bordered icon control the header had written out three times. */
function HeaderButton({
  as: As = "button", label, children, ...rest
}: {
  as?: typeof Link | "button";
  label: string;
  children: ReactNode;
  [key: string]: unknown;
}) {
  const Comp = As as ElementType;
  return (
    <Comp
      {...rest}
      aria-label={label}
      className="pressable inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 text-xs hover:bg-accent"
    >
      {children}
    </Comp>
  );
}

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
  // The quick window raises reminders too (it renders its own shell) — a user
  // who only ever opens that one would otherwise never be reminded of
  // anything. Two open windows cannot double up: the "already sent" map lives
  // in the shared data file. See src/lib/notifications.ts.
  useReminderNotifications();
  const { update, dismiss } = useAutoUpdateCheck();

  const cycle = () => setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = theme === "light" ? "בהיר" : theme === "dark" ? "כהה" : "מערכת";

  const scrolled = useScrolled();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar />
      {/* `ms-`, not `mr-`: the rail is pinned to the inline start, which is the
          right only because the document is RTL. */}
      <div className={`${collapsed ? "ms-[64px]" : "ms-[220px]"} flex flex-col min-h-screen transition-[margin] duration-200 ease-[var(--ease-out-soft)]`}>
        {/* A translucent layer with the page passing underneath it, and a seam
            that only appears once there is something to separate from — a
            permanent 1px rule under a header floating over blank space is a
            line drawn for no reason. */}
        <header data-scrolled={scrolled} className="sticky top-0 z-20 glass-regular scroll-edge">
          <div className="flex items-center justify-between gap-4 px-6 py-3.5">
            <div>
              <h1 className="text-lg font-semibold">{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              {actions}
              <HeaderButton as={Link} to="/search" title="חיפוש" label="חיפוש">
                <Search className="size-4" />
              </HeaderButton>
              <HeaderButton onClick={() => setHelpOpen(true)} title="קיצורי מקלדת (?)" label="קיצורי מקלדת">
                <Keyboard className="size-4" />
              </HeaderButton>
              <HeaderButton onClick={cycle} title={`ערכת נושא: ${label}`} label={`ערכת נושא: ${label}`}>
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </HeaderButton>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
        <footer className="border-t border-border glass-thin px-6 py-3 text-center text-2xs text-muted-foreground">
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
