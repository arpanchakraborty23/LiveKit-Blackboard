import { createFileRoute } from "@tanstack/react-router";

import { AssistantShell } from "@/components/assistant-shell";
import { DashboardPage } from "@/components/assistant-pages";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview · Personal AI" },
      {
        name: "description",
        content:
          "Your Personal AI workspace at a glance: recent conversations, assistant activity, and quick ways to shape how it works.",
      },
      { property: "og:title", content: "Overview · Personal AI" },
      {
        property: "og:description",
        content:
          "Recent conversations, assistant activity, and quick ways to shape how your assistant works.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OverviewRoute,
});

function OverviewRoute() {
  return (
    <AssistantShell>
      <DashboardPage />
    </AssistantShell>
  );
}
