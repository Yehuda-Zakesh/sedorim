import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/settings")({
  component: () => <StubPage title="הגדרות" subtitle="הגדרות מערכת, משתמשים והרשאות" />,
});
