import { createFileRoute } from "@tanstack/react-router";

import { AssistantShell } from "@/components/assistant-shell";
import { UsagePage } from "@/components/assistant-pages";

export const Route = createFileRoute("/usage")({
  head: () => ({
    meta: [
      { title: "Usage & activity · Personal AI" },
      {
        name: "description",
        content:
          "Explore assistant activity over time: sessions, conversation time, token use, and estimated spend.",
      },
      { property: "og:title", content: "Usage & activity · Personal AI" },
      {
        property: "og:description",
        content:
          "Explore assistant activity over time: sessions, conversation time, token use, and estimated spend.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsageRoute,
});

function UsageRoute() {
  return (
    <AssistantShell>
      <UsagePage />
    </AssistantShell>
  );
}
