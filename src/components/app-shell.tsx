import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";

export function AppShell({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
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
            <div className="flex items-center gap-2">{actions}</div>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
