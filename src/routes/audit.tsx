import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/audit")({
  component: () => <StubPage title="יומן ביקורת" subtitle="תיעוד מלא של פעולות במערכת" />,
});
