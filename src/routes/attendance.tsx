import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/attendance")({
  component: () => <StubPage title="נוכחות" subtitle="רישום נוכחות יומי וניהול סטטוסים" />,
});
