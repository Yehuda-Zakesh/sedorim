import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/calendar")({
  component: () => <StubPage title="לוח שנה" subtitle="תצוגה חודשית בקידוד צבעוני" />,
});
