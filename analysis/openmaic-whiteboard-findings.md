# OpenMAIC Whiteboard Subsystem — Findings

Source: [THU-MAIC/OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) (MIT), analyzed at commit on `main`, Aug 2026.
Scope: `lib/action/engine.ts`, `packages/@openmaic/dsl/src/action.ts`, `components/whiteboard/*`,
`lib/playback/*`, `lib/api/stage-api*`. All paths below are relative to the OpenMAIC repo.

---

## 1. `lib/action/` — the Action Engine

### 1.1 Architecture in one paragraph

`ActionEngine.execute(action)` is a single dispatcher: a `switch` over ~21 action
types, split into two categories declared explicitly in the DSL
(`FIRE_AND_FORGET_ACTIONS` vs `SYNC_ACTIONS`). Fire-and-forget effects (spotlight,
laser) return immediately and auto-clear after **5 s** (`EFFECT_AUTO_CLEAR_MS`).
Synchronous actions return a Promise that resolves when the action is *done*
(speech → TTS finished; whiteboard draw → element added + fade-in delay of
**800 ms** (`WB_DRAW_MS`) so the playback engine paces itself to the animation).

### 1.2 Whiteboard-relevant action types (ignoring slide/quiz/PBL/widget ones)

| Action | Payload fields (from `@openmaic/dsl/src/action.ts`) |
|---|---|
| `wb_draw_text` | `elementId?`, `content` (HTML or plain text — auto-promoted to LaTeX if it looks like math via `getLikelyLatexMath`), `x`, `y`, `width?=400`, `height?=100`, `fontSize?=18`, `color?='#333333'` |
| `wb_draw_shape` | `elementId?`, `shape: 'rectangle'\|'circle'\|'triangle'`, `x`, `y`, `width`, `height`, `fillColor?` |
| `wb_draw_line` | `elementId?`, `startX/startY/endX/endY` (0–1000 × 0–562 grid), `color?`, `width?=2`, `style?: 'solid'\|'dashed'`, `points?: ['', 'arrow']` endpoint markers (arrows!) |
| `wb_draw_latex` | `elementId?`, `latex`, `x`, `y`, `width?=400`, `height?` (auto from aspect ratio), `color?` |
| `wb_draw_chart` | `elementId?`, `chartType: 'bar'\|'column'\|'line'\|'pie'\|'ring'\|'area'\|'radar'\|'scatter'`, `x/y/width/height`, `data: {labels[], legends[], series: number[][]}`, `themeColors?` |
| `wb_draw_table` | `elementId?`, `x/y/w/h`, `data: string[][]`, outline/theme options |
| `wb_draw_code` / `wb_edit_code` | typed-in code block; edit ops are line-level (`insert_after`, `insert_before`, `delete_lines`, `replace_lines`) referencing line IDs |
| `wb_delete` | `elementId` — delete exactly one existing element |
| `wb_clear` | none — wipe board |
| `wb_open` / `wb_close` | open/close animation gating |
| `spotlight` | `elementId`, `dimOpacity?=0.5` — fire-and-forget |
| `laser` | `elementId`, `color?='#ff0000'` — fire-and-forget |

Notable engine behaviors:
- Any `wb_*` draw action **auto-opens the whiteboard** first (`ensureWhiteboardOpen`).
- `wb_draw_text` content is sniffed for LaTeX and silently re-routed to the LaTeX path.
- Every element carries an optional caller-supplied `elementId` ("Custom element ID
  for later reference (e.g. wb_delete)") — this is their equivalent of our `seq`.

### 1.3 Spotlight & laser — how "point at something that exists" works

Both target an **existing `elementId`**, not coordinates. Rendering:

- **Spotlight** (`SpotlightOverlay.tsx`): finds the DOM node
  `#screen-element-<id>`, measures it with `getBoundingClientRect()`, converts the
  rect to 0–100 percentage coordinates, then renders a full-canvas SVG overlay:
  dim layer + SVG `<mask>` with a cutout hole over the element + animated border
  rect. Auto-clears after 5 s.
- **Laser** (`LaserOverlay.tsx`): same element targeting, but renders an animated
  dot that *flies in from the nearest corner to the element center*, with a
  pulsing ring + glow core. Also auto-clears after 5 s.

Key insight for us: OpenMAIC never stores pointer geometry — the pointer is a
**transient overlay resolved against the current bounding box of the referenced
element at render time**. The op only needs `{targetElementId}` (+ style/color).
This maps directly onto our `highlight` op, except theirs (a) targets by stable
ID, (b) has multiple visual styles, (c) is ephemeral (auto-expires).

### 1.4 Chart vs shape

Yes, chart is a distinct action type — but it is a **business-chart renderer**
(bar/pie/radar/scatter fed with pre-computed `labels[]`/`series[][]` numbers).
It is *not* a function plotter. There is no expression-string plotting anywhere.
Our existing `graph` op (mathjs-compiled expression sampling) is strictly more
capable for our use case. Nothing to port here.

### 1.5 Relative positioning

**None for whiteboard elements.** Everything is absolute `(x, y, width, height)`
on a fixed 1000×562 canvas — exactly like our v1. (The word "anchor" appears only
in `runtime.ts` as timeline anchors for streaming events, unrelated to layout.)
So the flow-cursor and anchor-label ideas in Phase 2 are **ours to design**;
OpenMAIC offers no prior art beyond confirming absolute coords don't scale.

Also notable: no freehand/path drawing exists — structured elements only.

---

## 2. `components/whiteboard/` — the renderer

### 2.1 Structure

Three components:
- `index.tsx` (~217 lines) — top-level shell deciding slide-vs-whiteboard surface.
- `whiteboard-canvas.tsx` — the meat: fixed logical canvas (default **1000×562.5**,
  i.e. 16:9, matching our 800×600 choice), CSS-transform-based pan/zoom
  (wheel zoom-to-cursor, drag pan, double-click reset, clamped boundaries),
  ResizeObserver-driven fit-to-container scaling.
- Elements are **DOM nodes positioned absolutely inside the scaled canvas div**
  (`motion.div` wrappers around per-type `ScreenElement` components) — *not* raw
  SVG children like ours. Element type map: image/text/shape/line/chart/latex/
  table/video/code.

### 2.2 Incremental reveal / animation (`AnimatedElementBase`)

Every new element animates in:
```
initial: { opacity: 0, scale: 0.92, y: 8, filter: 'blur(4px)' }
animate: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }
transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: index * 0.05 }
```
i.e. **fade + slight scale-up + upward drift + blur-out, staggered 50 ms per
existing element** when several appear together. There is also a delightful
`wb_clear` animation: elements fly off one-by-one in reverse order
(`delay = (total - 1 - index) * 0.055`, alternating small rotation, scale-down,
blur). No stroke-draw-on animation (no SVG path-length tricks) — entrance is
opacity/transform only. The ActionEngine complements this by pacing itself:
each draw waits `WB_DRAW_MS = 800ms` before the next action fires.

### 2.3 Text & equations

- Text: HTML strings inside styled DOM blocks (not SVG `<text>`).
- Equations: **KaTeX** (`katex ^0.16.33`), rendered to HTML
  (`[&_.katex-display]:!m-0` override), with a legacy SVG fallback path.
  We already render KaTeX into `<foreignObject>` — same library, compatible choice.

### 2.4 Freehand

None. Structured elements only (code blocks have a typing animation, which is
the closest thing to "drawing progress").

---

## 3. `lib/playback/` — the playback state machine

### 3.1 How actions are sequenced

`PlaybackEngine` (902 lines) walks `Scene.actions[]` with an explicit mode
machine: `idle → playing ⇄ paused`, plus a `live` mode for interactive
discussion sessions. The pacing mechanism is simple and worth copying in spirit:

- Each action is executed through the same `ActionEngine`.
- **Speech actions block** until TTS audio ends (or an estimated reading-time
  timer expires if audio generation is disabled) — so drawing is naturally
  synchronized to narration.
- Draw actions block for their animation duration (800 ms) — "action in
  progress" is just "the awaited Promise hasn't resolved".
- Effects (spotlight/laser) don't block; they fire and self-expire.
- Supports pause/resume mid-speech, speed multiplier, jump-to-action with
  state reconstruction (`action-navigation.ts` validates you can only jump
  within a *reconstructable prefix* — i.e. they replay wb ops from scratch,
  like our snapshot replay).

### 3.2 Reusable concepts

- **"In-progress vs complete"** = awaited vs fire-and-forget action classes.
  For us: draw ops could be emitted with the tool awaiting a short reveal delay;
  but since our transport is push-only data-channel events (no round-trip ack),
  we'd approximate with client-side animation only. That's fine — OpenMAIC's
  server-side wait exists mainly to sync with TTS, and LiveKit already gives us
  speech/text synchronization for free (the LLM narrates between tool calls).
- Their cursor persistence (`cursor.ts`) is *playback position* persistence
  (KV store), not a writing-position flow cursor. Confirms: **no prior art for
  write-flow cursors — we design our own.**

---

## 4. `lib/api/` — Stage API facade & data flow

### 4.1 Call chain, agent decision → pixels

```
LLM agent (LangGraph, server)
  → streams Action JSON (SSE / runtime envelope in packages/@openmaic/dsl/runtime.ts)
    → client PlaybackEngine.execute(action)          [lib/playback/engine.ts]
      → ActionEngine.execute(action)                 [lib/action/engine.ts]
        → stageAPI.whiteboard.addElement(el, wbId)   [lib/api/stage-api-whiteboard.ts]
          → zustand store.setState(immutable update) [in-memory store]
            → React subscription re-render
              → WhiteboardCanvas → AnimatedElement → ScreenElement
```

The Stage API is a thin, validated facade over immutable updates to a single
in-memory document tree (`stage.whiteboard[].elements[]`). `addElement` appends
with a generated ID if absent; `deleteElement` filters by ID; `clear` replaces
elements with `[]`.

### 4.2 Comparison to our `emit_op()` pattern

Structurally analogous: both funnel every mutation through **one small set of
verbs** applied to an ordered element list, and both keep a replayable history.
Differences:
- OpenMAIC's transport is SSE-to-self (single viewer, client-side store); ours
  is LiveKit data-channel broadcast (multi-viewer rooms, snapshot replay for
  late joiners). Ours is actually the harder problem and already solved.
- OpenMAIC's ActionEngine runs *client-side* and paces execution against
  animations/TTS; ours runs *agent-side* and pushes instantly. We should NOT
  port the client-side engine — but we should steal its insight that **the op
  vocabulary separates blocking draws from transient effects**, rendering
  effects as self-expiring overlays.

---

## Design decisions to PORT

1. **Pointers reference elements, not coordinates** — `point_to` takes a target
   `seq`; the renderer resolves the target's bounding box at draw time (we
   already compute `estimateOpRect`s; formalize them into a shared resolver).
   Multiple styles (arrow / circle / underline / box) ≈ laser + spotlight border.
2. **Transient effects are self-expiring overlays**, separate from persistent
   board content — pointer/highlight ops must not pollute snapshots; either
   expire client-side after N seconds or exclude effect kinds from history
   replay. (OpenMAIC: 5 s auto-clear, excluded from whiteboard element list.)
3. **Staggered fade/scale/blur entrance animation** for new elements
   (their exact curve: opacity 0→1, scale .92→1, y+8→0, blur 4→0, 450 ms,
   ease `[0.16, 1, 0.3, 1]`); reverse-order cascade fly-off for `clear`.
4. **KaTeX for equations** — confirms our existing choice; keep it.
5. **Caller-supplied stable IDs** on elements for later reference — our
   monotonic `seq` already provides this; keep referencing by `seq`.
6. **Auto-open/auto-context behaviors**: any draw implies the board is visible;
   minor for us (board always visible) — skip.
7. **Line arrows as endpoint markers** on the generic line op (`points: ['','arrow']`)
   — cheap addition to our `line` op if needed later; not required now since
   `point_to` covers pointing.
8. **Vocabulary hygiene**: fixed enum + exhaustiveness check + narrow validator
   function (`isActionType` pattern) — mirror in our TS `BoardOp` union +
   Python schema docs.

## Things that DON'T apply to us

- Next.js/zustand/SSE/LangGraph machinery — replaced by LiveKit data channel.
- Client-side ActionEngine with awaited draw delays — our agent-side tools push
  instantly; LiveKit's own turn-taking gives narration sync.
- Business charts (`wb_draw_chart`), tables, code blocks, video/image/PPTX
  export, multi-agent discussion, widget iframes — out of scope.
- Pan/zoom viewport — nice-to-have, skip for now (our board fits on screen).
- DOM-based element rendering — we stay pure-SVG (better fit for chalk-style
  strokes and our existing geometry packs).
- Relative positioning / flow cursors — **they don't have it either**; we design
  our own minimal versions (server-side cursor in `board_state.py`,
  `anchor`-based labels).
