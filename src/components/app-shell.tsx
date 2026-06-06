import type { ReactNode } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { AppSidebar } from "./app-sidebar";
import { useTheme } from "@/lib/use-theme";

export function AppShell({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  const cycle = () => setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = theme === "light" ? "בהיר" : theme === "dark" ? "כהה" : "מערכת";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar />
      <div className="mr-[220px] flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 bg-card/80 backdrop-blur border-b border-border">
          <div className="flex items-center justify-between gap-4 px-6 py-3.5">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {actions}
              <button
                onClick={cycle}
                title={`ערכת נושא: ${label}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 text-xs hover:bg-accent transition"
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
