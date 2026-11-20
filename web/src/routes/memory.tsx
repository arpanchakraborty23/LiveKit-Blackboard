import { createFileRoute } from "@tanstack/react-router";

import { AssistantShell } from "@/components/assistant-shell";
import { MemoryPage } from "@/components/assistant-pages";

export const Route = createFileRoute("/memory")({
  head: () => ({
    meta: [
      { title: "Memory · Personal AI" },
      {
        name: "description",
        content:
          "Review what your assistant remembers, add your own notes, and search or clear saved context.",
      },
      { property: "og:title", content: "Memory · Personal AI" },
      {
        property: "og:description",
        content:
          "Review what your assistant remembers, add your own notes, and search or clear saved context.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MemoryRoute,
});

function MemoryRoute() {
  return (
    <AssistantShell>
      <MemoryPage />
    </AssistantShell>
  );
}
