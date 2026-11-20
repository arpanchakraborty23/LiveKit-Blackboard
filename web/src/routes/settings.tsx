import { createFileRoute } from "@tanstack/react-router";

import { AssistantShell } from "@/components/assistant-shell";
import { SettingsPage } from "@/components/assistant-pages";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Personal AI" },
      {
        name: "description",
        content:
          "Choose your theme, accent color, and interface density, and review your workspace preferences.",
      },
      { property: "og:title", content: "Settings · Personal AI" },
      {
        property: "og:description",
        content:
          "Choose your theme, accent color, and interface density, and review your workspace preferences.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsRoute,
});

function SettingsRoute() {
  return (
    <AssistantShell>
      <SettingsPage />
    </AssistantShell>
  );
}
