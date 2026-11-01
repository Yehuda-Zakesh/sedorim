import type { ElementType, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Keyboard, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppSidebar } from "./app-sidebar";
import { useSidebarCollapsed } from "@/lib/sidebar-state";
import { SectionTabs } from "./section-tabs";
import { TimerBar } from "./timer-bar";
import { ShortcutsHelp } from "./shortcuts-help";
import { useTheme } from "@/lib/use-theme";
import { StoreGuard } from "@/components/store-recovery";
import { applyAppearance, useSettings, useNeedsOnboarding } from "@/lib/settings-store";
import { useGlobalShortcuts } from "@/lib/shortcuts";
import { useReminderNotifications } from "@/lib/notifications";
import { useBackgroundPlan } from "@/lib/background-plan";
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

/** The quiet icon control of the header — no box until it is pointed at. */
function HeaderButton({
  as: As = "button",
  label,
  children,
  ...rest
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
      className="pressable inline-grid size-10 [@media(max-height:640px)]:size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </Comp>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  useSettings(); // re-render on settings change
  const { collapsed } = useSidebarCollapsed();
  const [helpOpen, setHelpOpen] = useState(false);
  // Reads through to the shared data file, so finishing the wizard in one EXE
  // means the other one never shows it again.
  const needsOnboarding = useNeedsOnboarding();

  useEffect(() => {
    applyAppearance();
  }, []);
  useGlobalShortcuts(() => setHelpOpen((v) => !v));
  // The quick window raises reminders too (it renders its own shell) — a user
  // who only ever opens that one would otherwise never be reminded of
  // anything. Two open windows cannot double up: the "already sent" map lives
  // in the shared data file. See src/lib/notifications.ts.
  useReminderNotifications();
  // Keeps the timetable SederPlusAgent.exe reads current. A no-op unless the
  // user has asked for reminders while the app is closed.
  useBackgroundPlan();
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
      <div
        className={`${collapsed ? "ms-[64px]" : "ms-[208px]"} flex flex-col min-h-screen transition-[margin] duration-200 ease-[var(--ease-out-soft)]`}
      >
        {/* One solid band: the screen's name, what it is about, the tabs of its
            area, and — when a timer is running — the timer. It is a single
            sticky block so the timer is never scrolled out of reach, and it is
            opaque: nothing is read through it. */}
        <header
          data-scrolled={scrolled}
          className="sticky top-0 z-20 border-b border-border bg-background"
        >
          <div className="flex items-start justify-between gap-4 px-[var(--density-page)] pt-4 pb-2 [@media(max-height:640px)]:pt-1.5 [@media(max-height:640px)]:pb-1">
            <div className="min-w-0">
              <h1 className="title-serif text-2xl truncate [@media(max-height:640px)]:text-xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-0.5 text-sm text-muted-foreground [@media(max-height:640px)]:mt-0 [@media(max-height:640px)]:truncate">
                  {subtitle}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {actions}
              <HeaderButton as={Link} to="/search" title="חיפוש מתקדם (/)" label="חיפוש מתקדם">
                <Search className="size-[18px]" aria-hidden="true" />
              </HeaderButton>
              <HeaderButton
                onClick={() => setHelpOpen(true)}
                title="קיצורי מקלדת (?)"
                label="קיצורי מקלדת"
              >
                <Keyboard className="size-[18px]" aria-hidden="true" />
              </HeaderButton>
              <HeaderButton
                onClick={cycle}
                title={`ערכת נושא: ${label}`}
                label={`ערכת נושא: ${label}`}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
              </HeaderButton>
            </div>
          </div>
          <SectionTabs />
          <TimerBar />
        </header>
        <main className="page-pad flex-1">
          <div className="mx-auto w-full max-w-[80rem]">
            <StoreGuard>{children}</StoreGuard>
          </div>
        </main>
        <footer className="px-[var(--density-page)] py-3 text-xs text-muted-foreground">
          סדר פלוס · גרסה {APP_VERSION}
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
