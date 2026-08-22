# Blackboard Test Plan — v2 (write_next / point_to / label / erase)

Companion to `analysis/openmaic-whiteboard-findings.md`. Unit-level checks live in
`my-agent/tests/test_board.py` (run: `cd my-agent && uv run pytest`).

## 1. Automated unit tests (implemented)

| Test | Verifies |
|---|---|
| `test_flow_cursor_advances_line_by_line` | cursor moves down by line height, x stays at margin |
| `test_flow_cursor_wraps_to_second_column` | bottom-of-board wraps into right column, top row |
| `test_broadcast_clear_resets_flow_cursor` | clear returns cursor to top-left writing position |
| `test_write_next_flows_without_coordinates` | consecutive calls stack vertically; items persisted in snapshot |
| `test_write_next_supports_latex_and_rejects_bad_kind` | latex routing + ToolError on unknown kind |
| `test_point_to_is_transient_not_persisted` | effect message shape, ttlMs present, **excluded** from snapshot; bad style raises |
| `test_label_anchors_to_item` | label op references targetSeq + anchor/offset, persisted; bad anchor raises |
| `test_erase_removes_only_targeted_item` | history drops only target seq; `{type: "erase", targetSeq}` broadcast |
| `test_erase_unknown_item_is_noop` | no publish, friendly tool return |

All existing v1 tests (emit/clear/snapshot/tools) still pass — nothing regressed.

## 2. Manual scenarios (voice or dev trigger)

Run agent (`uv run src/agent.py dev`) + UI, join from https://ui-eta-jet.vercel.app.

### 2a. Sequential explanation via `write_next`
1. Ask: "derive the quadratic formula step by step on the board".
2. Expect: lines appear one under another starting near the top-left margin;
   no overlapping text; LLM never receives/sends coordinates.
3. Continue past ~10 lines → expect wrap into a second column instead of
   falling off the bottom edge.
4. Mid-explanation ask it to switch to equations → lines render as KaTeX.

### 2b. `point_to` gesture
1. With an item on the board, say "point at the first equation".
2. Expect: arrow overlay animates toward that item's bounding box and
   **disappears after ~6 s** without any other item moving.
3. Repeat with styles: "circle the triangle", "underline the result",
   "put a box around the formula" → matching overlays render anchored correctly,
   including when the target is a graph (rect resolution through graph slots).
4. Reload the page (snapshot replay) → pointers must NOT reappear (not persisted),
   but all persistent content must.

### 2c. `label`
1. Draw a circle, then "label the center of the circle".
2. Expect italic green text anchored above/right of the circle per anchor arg;
   move nothing else.
3. Erase the circle afterwards → its label disappears too (dangling-anchor cleanup).

### 2d. `erase`
1. Board has ≥3 items; say "erase item #2" (or "erase the last thing you wrote").
2. Expect exactly that item gone; others untouched; counter badge decrements.
3. Say "erase item #99" → agent replies it's not on the board; no board change.

### 2e. Reconnect / late-joiner replay with new ops
1. Fill the board using a mix of `write_next`, `draw_shape`, `plot_function`, `label`.
2. Open a second tab (late joiner) → snapshot replays identical content,
   including labels positioned relative to their targets.
3. Erase an item, then reconnect tab 1 → erased item stays gone after replay.

## 3. Playwright automation (to lock down once manual pass is clean)

Highest-value cases per idea.md's guidance — the snapshot/reconnect path:
1. Two contexts: tutor emits ops sequence [text, label(target=text), point_to(target=text), erase(text)] →
   assert second context shows only surviving items + label cleanup after erase.
2. Reconnect assertion: reload page mid-session → DOM item count matches server snapshot length.
3. Effect expiry: assert pointer element removed from SVG within ttl + 1 s.
