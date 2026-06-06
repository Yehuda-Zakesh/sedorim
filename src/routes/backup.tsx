import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/backup")({
  component: () => <StubPage title="גיבוי ושחזור" subtitle="ניהול עותקי גיבוי ושחזור נתונים" />,
});
