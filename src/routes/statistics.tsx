import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/statistics")({
  component: () => <StubPage title="סטטיסטיקות" subtitle="ניתוחי BI ומגמות נוכחות" />,
});
