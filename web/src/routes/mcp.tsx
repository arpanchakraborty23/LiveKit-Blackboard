import { createFileRoute } from "@tanstack/react-router";

import { AssistantShell } from "@/components/assistant-shell";
import { McpPage } from "@/components/assistant-pages";

export const Route = createFileRoute("/mcp")({
  head: () => ({
    meta: [
      { title: "MCP connections · Personal AI" },
      {
        name: "description",
        content:
          "Manage the external tool servers your assistant can use, review the tools each one offers, and control which are enabled.",
      },
      { property: "og:title", content: "MCP connections · Personal AI" },
      {
        property: "og:description",
        content:
          "Manage the external tool servers your assistant can use and control which are enabled.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: McpRoute,
});

function McpRoute() {
  return (
    <AssistantShell>
      <McpPage />
    </AssistantShell>
  );
}
