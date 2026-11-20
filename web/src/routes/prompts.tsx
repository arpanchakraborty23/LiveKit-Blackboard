import { createFileRoute } from "@tanstack/react-router";

import { AssistantShell } from "@/components/assistant-shell";
import { PromptsPage } from "@/components/assistant-pages";

export const Route = createFileRoute("/prompts")({
  head: () => ({
    meta: [
      { title: "Prompt & Skills · Personal AI" },
      {
        name: "description",
        content:
          "Write your assistant's system prompt, review prompt versions, and turn skills on or off.",
      },
      { property: "og:title", content: "Prompt & Skills · Personal AI" },
      {
        property: "og:description",
        content:
          "Write your assistant's system prompt, review prompt versions, and turn skills on or off.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PromptsRoute,
});

function PromptsRoute() {
  return (
    <AssistantShell>
      <PromptsPage />
    </AssistantShell>
  );
}
