import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

export function StubPage({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <AppShell title={title} subtitle={subtitle}>
      <div className="card-surface p-10">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-2">
          מסך זה יפותח בשלב הבא תוך שמירה על שפת העיצוב הקיימת.
        </p>
        {children}
      </div>
    </AppShell>
  );
}
