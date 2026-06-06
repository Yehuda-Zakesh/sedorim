import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/learning")({
  component: () => <StubPage title="לימוד נוסף" subtitle="שיעורים ותגבורים מחוץ למערכת" />,
});
