import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/calendar")({
  component: () => <StubPage title="__TITLE__" subtitle="__SUB__" />,
});
