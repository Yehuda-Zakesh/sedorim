import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export function makeStubRoute(title: string, subtitle: string) {
  return function StubPage() {
    return (
      <AppShell title={title} subtitle={subtitle}>
        <div className="card-surface p-10 text-center">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground mt-2">
            מסך זה יבנה בשלב הבא תוך שמירה על שפת העיצוב הקיימת.
          </p>
        </div>
      </AppShell>
    );
  };
}

export { createFileRoute };
