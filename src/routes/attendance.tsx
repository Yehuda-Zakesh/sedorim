import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/attendance")({
  component: () => <StubPage title="__TITLE__" subtitle="__SUB__" />,
});
