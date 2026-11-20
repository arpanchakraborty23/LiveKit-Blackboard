# Neural Cortex & Multi-Hand Autonomous Personal Assistant
## Architectural Blueprint, Tooling Stack & UI Proposals

> **Project:** LiveKit-Blackboard reimagined as an Executive Autonomous Personal Assistant OS  
> **Paradigm:** The Human Brain with Multiple Hands (Neural Cortex + Concurrent Subagent Limbs)  
> **Stack:** LiveKit WebRTC · Python `livekit-agents` · Next.js 15 · Tailwind CSS v4 · `@xyflow/react` · FastMCP

---

## 1. About The Project

### 1.1 The Problem with Existing Voice Agents
Most voice AI products today behave like simple **walkie-talkies** or conversational chatbots:
- The user speaks -> audio streams -> LLM generates text tokens -> TTS reads it aloud.
- The screen is dominated by simple text chat bubbles or a static pulsing ball.
- Heavy, multi-step tasks (searching documentation, verifying facts, calculating math, plotting system architectures) **block voice response**, causing uncomfortable multi-second dead silences.

### 1.2 The Paradigm Shift: The Human Brain with Multiple Hands
In human cognition, the conscious mind (the **Prefrontal Cortex**) maintains conversational fluency, listening, and intent understanding. It does not pause breathing or talking to move a hand or look something up. Instead, it delegates:
- The **Cortex** speaks and listens smoothly with sub-second latency.
- The **Hands & Senses (Subagents & Tool Limbs)** reach out into the digital and physical world simultaneously to do real work.

```
                         ┌─────────────────────────────────┐
                         │      CENTRAL NEURAL CORTEX      │
                         │   (Supervisor / Voice Stream)   │
                         └────────────────┬────────────────┘
                                          │
            ┌──────────────────┬──────────┴──────────┬──────────────────┐
            ▼                  ▼                     ▼                  ▼
   ┌─────────────────┐┌─────────────────┐   ┌─────────────────┐┌─────────────────┐
   │  Research Hand  ││   Canvas Hand   │   │ Action/MCP Hand ││   Memory Hand   │
   │  (Web & Docs)   ││ (Live Board)    │   │ (Code & APIs)   ││ (Temporal Graph)│
   └────────┬────────┘└────────┬────────┘   └────────┬────────┘└────────┬────────┘
            │                  │                     │                  │
            ▼                  ▼                     ▼                  ▼
      arXiv / Web       LiveKit Board Op      Python Sandbox        Pinecone /
      Vector Search     (WebRTC Data)         MCP Servers           Graphiti Memory
```

### 1.3 Key Objectives
1. **Zero Silence Voice UX:** Immediate vocal acknowledgment via speculative intent parsing.
2. **Real-Time Visual Assembly:** As subagents execute, their outputs materialize directly onto a **Shared Blackboard Workspace** (flowcharts, LaTeX, graphs, vector diagrams).
3. **Transparent Subagent Orchestration:** The user sees the brain fanning out subagents in real time via an interactive neural node graph (`@xyflow/react`).

---

## 2. Tools & Technology Stack Architecture

### 2.1 Backend & Agent Stack Overview

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **RTC Infrastructure** | **LiveKit Cloud / Local Server** | Sub-50ms audio streaming + dual data channels |
| **Voice Pipeline** | **Silero VAD + Whisper / Deepgram + Cartesia / Gemini Live** | Real-time speech-to-text, turn detection, voice synthesis |
| **Supervisor Cortex** | **Python `livekit-agents` + Gemini 4 / Claude 3.5 Sonnet** | Intent classification, DAG task decomposition, audio synthesis |
| **Subagent Workers** | **`asyncio.TaskGroup` / Dynamic Subagents** | Concurrent asynchronous worker hands |
| **Tool Protocol** | **Model Context Protocol (MCP) / FastMCP** | Standardized plug-and-play tool execution |
| **Vector & Memory** | **Pinecone / Graphiti (Neo4j)** | Semantic entity recall and episodic memory |
| **Frontend Framework** | **Next.js 15 (App Router) + React 19** | Modern SPA with fluid view transitions |
| **Visualizer & Graph** | **`@xyflow/react` (React Flow v12)** | Interactive neural node graph for subagent fan-out |
| **Blackboard Renderer**| **Native SVG + KaTeX + Math.js** | Lossless blackboard op renderer over WebRTC data channel |

---

### 2.2 The Specialized "Hands" (Subagent Tool Suite)

#### 🖐️ Hand 01: The Research & Data Hand (`hand-research`)
- **Purpose:** Deep-dive document scraping, live web search, arXiv retrieval, and data verification without interrupting voice dialogue.
- **Tools Stack:**
  - `web_search(query, recency)`: Real-time search engine integration (Brave / Google Search API).
  - `fetch_document(url_or_file)`: PDF, Word, and Markdown parser using `pdf-parse` & `mammoth`.
  - `vector_rag_query(embedding, top_k)`: Pinecone vector search over personal knowledge vault.
- **Behavior:** Executes concurrently; returns structured synthesized key takeaways directly to the Cortex.

#### 🖐️ Hand 02: The Blackboard & Canvas Hand (`hand-canvas`)
- **Purpose:** Translates ideas, mathematical proofs, and system designs into visual objects drawn sequentially on the blackboard.
- **Tools Stack:**
  - `board_draw_shape(shape, position, size, color)`: Circles, rectangles, triangles.
  - `board_draw_line(from_, to, color, strokeWidth)`: Connecting arrows, vector axes.
  - `board_render_latex(content, position, fontSize)`: Mathematical formulas via KaTeX.
  - `board_plot_graph(expr, domain, template)`: Algebraic curves, unit circles, parabolas.
  - `board_point_to(targetSeq, style, note, ttlMs)`: Temporary spotlight/arrow pointers.
- **Data Channel:** Streams lossless JSON operations on `topic="board"`.

#### 🖐️ Hand 03: The Action & Execution Hand (`hand-mcp`)
- **Purpose:** Manipulates files, runs code in isolated sandboxes, and interacts with third-party software.
- **Tools Stack:**
  - `mcp_call_tool(server, tool, args)`: FastMCP dynamic client connecting to local/remote tools.
  - `python_sandbox_run(code)`: Ephemeral Python code runner for data crunching.
  - `calendar_reschedule(event_id, new_slot)`: Direct calendar event manipulation.
  - `email_draft_reply(thread_id, draft_body)`: Generates draft responses in Gmail/Outlook.

#### 🖐️ Hand 04: The Memory & Recall Hand (`hand-memory`)
- **Purpose:** Manages long-term user preferences, past project context, and relationship graphs.
- **Tools Stack:**
  - `memory_recall_profile(user_id)`: Fetches user core context and habits.
  - `memory_search_episodic(query)`: Semantic search over past conversations.
  - `memory_extract_and_persist(facts)`: Background entity extraction without token pollution.

---

### 2.3 WebRTC Dual-Channel Architecture

Instead of multiplexing drawing commands inside audio or text packets, we partition channels:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        LIVEKIT ROOM SESSION                            │
├───────────────────────┬───────────────────────┬────────────────────────┤
│   Audio Track (RTC)   │  Data Channel "board" │ Data "agent-telemetry" │
├───────────────────────┼───────────────────────┼────────────────────────┤
│ • Opus audio stream   │ • BoardOp broadcasts  │ • Subagent spawn events│
│ • Sub-50ms latency    │ • Shape & graph ops   │ • Node state updates   │
│ • User speech & VAD   │ • Snapshot on join    │ • Tool progress & logs │
└───────────────────────┴───────────────────────┴────────────────────────┘
```

---

## 3. Visual UI Proposals

### 🌟 Concept 1: The Neural Brain with Multiple Hands (Flagship Concept)
> The central reasoning cortex (*Primary Cognition Core*) radiating synaptic connection lines outward to 4 specialized subagent hands operating simultaneously across Research, Live Drawing, Long-Term Memory, and Code Execution.

- **Central Core (Cortex):** Pulsing 3D neural brain displaying real-time cognitive activity.
- **Left Nodes:** `Agent 01: Research` & `Agent 03: Long-Term Memory`.
- **Right Nodes:** `Agent 02: Visual Drawing` & `Agent 04: Code Execution`.
- **Right Board Area:** Live system architecture diagram and performance metric chart.
- **Bottom HUD:** High-tech acoustic audio waveform bar with listening and status indicators.

### 🍱 Concept 2: Bento-Grid AI Copilot & Voice Command Center
> Modular Command Center on deep charcoal/obsidian, featuring an ambient acoustic orb, real-time background task execution ledger, and blackboard scratchpad.

### ⚡ Concept 3: Modern Autonomous Personal OS Workspace
> ChatGPT Canvas + Linear Dark Minimalist: Pure AMOLED black, 56px navigation dock, conversational stream with interactive action cards, and live interactive mindmap canvas.

### 🗂️ Concept 4: Split-Pane Ambient Assistant & Digital Canvas
> Canva Collaboration × ChatGPT Canvas: Fluid conversational stream on the left paired with an interactive visual roadmap on the right.

### 📅 Concept 5: Executive Daily Briefing & Timeline Dashboard
> Raycast × Linear Executive Command Center: Weather, morning summary card, horizontal 9 AM–6 PM schedule timeline, and blackboard architectural diagram.

### 🎙️ Concept 6: Voice-First Ambient HUD & Dynamic Canvas
> Apple Intelligence × Futuristic Cybernetic HUD: Multi-layer luminous acoustic orb, synthesized response cards, vector formula scratchpad, and floating pill controls.

---

## 4. UI Implementation Plan

### Step 1: Add Neural Flow Graph (`@xyflow/react`)
Build `ui/components/agents-ui/agent-neural-flow.tsx` connecting:
- A central **CortexNode** (representing the brain with active voice state).
- Dynamic **HandNodes** (Research, Canvas, MCP, Memory) connected via glowing bezier edges that pulse when active.

### Step 2: Split View Integration (`SessionSplitView`)
Integrate the neural flow graph side-by-side with the **Live Blackboard Canvas**:
- **Left 50%:** Real-time Neural Cortex & Subagent Activity Graph.
- **Right 50%:** Live Blackboard where the Drawing Hand paints diagrams and math in real time.
- **Bottom Bar:** Voice audio visualizer, mic controls, and ⌘K quick action palette.

### Step 3: Telemetry Channel (`topic="agent-telemetry"`)
Hook up the Python backend broadcaster in `my-agent` to emit live subagent lifecycle events:
- `hand_spawn` -> React Flow node animates in.
- `hand_progress` -> Node progress bar and live status update.
- `hand_complete` -> Node glows emerald green, blackboard refreshes.
