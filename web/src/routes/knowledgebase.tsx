import { createFileRoute } from "@tanstack/react-router";

import { AssistantShell } from "@/components/assistant-shell";
import { KnowledgebasePage } from "@/components/assistant-pages";

export const Route = createFileRoute("/knowledgebase")({
  head: () => ({
    meta: [
      { title: "Knowledgebase · Personal AI" },
      {
        name: "description",
        content:
          "Add documents and web pages your assistant can reference, and track which sources are ready.",
      },
      { property: "og:title", content: "Knowledgebase · Personal AI" },
      {
        property: "og:description",
        content:
          "Add documents and web pages your assistant can reference, and track which sources are ready.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KnowledgebaseRoute,
});

function KnowledgebaseRoute() {
  return (
    <AssistantShell>
      <KnowledgebasePage />
    </AssistantShell>
  );
}
