import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/history")({
  component: () => <StubPage title="היסטוריה" subtitle="ארכיון רישומים ושינויים" />,
});
