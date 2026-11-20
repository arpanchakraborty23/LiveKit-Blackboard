import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
const pagePaths = [
  "/",
  "/prompts",
  "/mcp",
  "/knowledgebase",
  "/memory",
  "/usage",
  "/settings",
] as const;

describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("has a real page for every workspace path", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    for (const path of pagePaths) {
      const matched = router.matchRoutes(path).at(-1);

      expect(matched?.routeId, `${path} should resolve to its own page`).toBe(path);
    }
  });
});
