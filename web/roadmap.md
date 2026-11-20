# Roadmap

- [x] Keyboard command menu and quick search shortcuts — verified: Ctrl/⌘+K opens the palette and navigates; `/` focuses the on-page search field.
- [x] Clear empty and filtered states — verified on Knowledgebase, Memory, and Usage (no-match message plus a clear-search action).
- [x] Narrow-screen controls and navigation — verified at 390px: menu opens, navigates, and closes on Escape.
- [x] Appearance changes apply immediately — theme, accent, and density now update the workspace at once instead of on the next reload (test: `src/test/appearance.test.tsx`).
- [ ] Connect a backend so sign-in works and memories, documents, and settings persist — waiting on your pick of direction.
- [ ] Connect the voice session to the user's already-configured LiveKit backend and agent — waiting for its token-server URL or development token-server ID.
- [x] Make the desktop sidebar collapsible to an icon rail, with an accessible toggle.
- [ ] Fix and verify theme switching; appearance writes now preserve existing settings and apply immediately, with clicks gated until saved settings load.
