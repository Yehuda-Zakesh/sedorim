import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/reports")({
  component: () => <StubPage title="דוחות" subtitle="הפקת דוחות חודשיים ושנתיים" />,
});
