# Personal Assistant — Architecture

> Complete technical reference: every component, what it is responsible for, how it
> talks to every other component, and what happens when it fails.
>
> Companions: [`PHASES.md`](./PHASES.md) (build plan) · plan notes in
> `~/.opencode/plan/personal-assistant-plan.md`

---

## 1. Purpose

A **personal voice assistant** with three properties:

1. **Local-first UI** — the app runs on the user's desktop (`localhost:3000`).
2. **Cloud runtime** — the LiveKit agent runs in LiveKit Cloud, reachable from any device.
3. **Data-driven agent** — prompts, tools, MCP servers, skills, knowledge, and memory are
   **rows in a database**, not Python literals. Changing them takes effect on the next
   session with no redeploy.

The current codebase is a blackboard voice tutor: `agent.py` hardcodes its instructions and
its eight drawing tools. This architecture replaces that with hydration from a config bundle.

### Scope

| In scope | Out of scope (v1) |
|---|---|
| Single owner, single assistant per account (schema allows many) | Teams, sharing, orgs |
| Voice pipeline (STT → LLM → TTS) | Realtime speech-to-speech models |
| Local Next.js app | Tauri/Electron packaging |
| Pinecone knowledge, Graphiti memory | Fine-tuning, embeddings training |
| Desktop browser client | Mobile, native clients, telephony (SIP) |

---

## 2. System at a glance

```
                          ┌───────────────────────────────┐
                          │        USER'S DESKTOP         │
                          │                               │
                          │  ┌─────────────────────────┐  │
                          │  │ Next.js 15 UI :3000     │  │
                          │  │  React 19 · App Router  │  │
                          │  │  Tailwind 4 · shadcn    │  │
                          │  └───────────┬─────────────┘  │
                          └──────────────┼────────────────┘
                    ┌────────────────────┼─────────────────────┐
                    │ browser session    │ server-side calls   │
                    ▼                    ▼                     ▼
          ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
          │  LiveKit Cloud   │  │ Supabase         │  │ Pinecone         │
          │                  │  │  Postgres + RLS  │  │  knowledge index │
          │  SFU / room      │  │  Auth            │  │  namespaced per  │
          │  agent dispatch  │  │  Edge Functions  │  │  assistant       │
          └────────┬─────────┘  └────────▲─────────┘  └────────▲─────────┘
                   │ job                 │ bundle              │ query
                   ▼                     │                     │
          ┌──────────────────┐           │                     │
          │ Agent worker     │───────────┘                     │
          │ Python 3.11      │─────────────────────────────────┘
          │ livekit-agents   │
          │ 1.8 · inference  │───────────┐
          └────────┬─────────┘           │
                   │ MCP                 │ HTTP
                   ▼                     ▼
          ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
          │ User MCP servers │  │ memory-service   │  │ Neo4j Aura       │  │ Ollama Cloud     │
          │ (streamable http)│  │ FastAPI+Graphiti │─►│ temporal graph   │  │ /api/embed       │
          └──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘
```

Vector flow: **Ollama embeds → Pinecone stores → both UI and agent embed before they query.**
Pinecone never sees a vector it did not receive from Ollama.

### Three planes

| Plane | Components | Responsibility | Trust level |
|---|---|---|---|
| **Presentation** | Next.js UI in the browser | Read/write config, start sessions, browse knowledge and memory | Authenticated user |
| **Control** | Next.js server routes, Supabase, Pinecone writes, memory writes | All *configuration* writes, all ingestion | Trusted (owner's machine) |
| **Runtime** | LiveKit agent worker, MCP servers, retrieval, memory reads | Serve one conversation | Trusted but **untrusted input** |

**The boundary rule:** the agent has **no database credentials**. It holds one shared key to
one read-only HTTP endpoint. Configuration writes can never originate from the runtime plane.

---

## 3. Component inventory

### 3.1 Next.js control plane

| | |
|---|---|
| **Where** | `ui/`, process on `localhost:3000` |
| **Runtime** | Node 24, Next 15.5 App Router, React 19 |
| **Owns** | All config CRUD, document ingestion, MCP discovery, session minting |
| **Talks to** | Supabase (user JWT), Pinecone (API key), memory-service (bearer), MCP servers (their auth), LiveKit (JWT signing, local only) |
| **Never does** | Hold the Supabase service-role key; call the agent directly; store plaintext secrets in the browser |

Key routes (server-side, no client SDK keys leak):

```
POST /api/token              mint participant JWT + agent dispatch metadata
POST /api/mcp/discover       MCP handshake → listTools → cache rows
POST /api/mcp/test           connectivity/auth check for one server
POST /api/rag/upload         parse → chunk → Pinecone upsert
POST /api/rag/search         Pinecone query (playground)
POST /api/rag/delete         delete by document filter
POST /api/skills/import      SKILL.md → skills + skill_files
GET  /api/backup/export      JSON dump (no secrets)
POST /api/backup/import      restore + version bump
```

### 3.2 Supabase

| | |
|---|---|
| **Where** | Managed Postgres + Auth + Edge Functions |
| **Owns** | **Source of truth for all configuration**: assistants, prompts, tool registry, MCP servers, skills, secret ciphertext, document metadata, sessions |
| **Talks to** | Pinecone (no), Neo4j (no) — deliberately isolated |
| **Why** | RLS gives per-row ownership without writing an auth layer; Edge Functions give the agent a single HTTP door |

Three surfaces:

- **PostgREST** — `supabase-js` with the user's JWT; RLS enforces `owner_id = auth.uid()`
- **RLS** — every table; no service-role client ever ships to the browser
- **Edge Function `assistant-config`** — the agent's only door. Verifies `x-agent-key`,
  calls `get_assistant_bundle()` as service role, returns JSON with an `ETag`

### 3.3 LiveKit Cloud

| | |
|---|---|
| **Where** | Managed SFU + agent dispatch |
| **Owns** | Rooms, participant media, job lifecycle, dispatch |
| **Talks to** | Browser (WebRTC), agent worker (job websocket) |
| **Why** | Already in place; handles NAT, jitter, echo cancellation, turn detection transport |

Dispatch metadata (inside the signed participant JWT):

```json
{ "a": "<assistant_id>", "u": "<user_id>", "v": 42 }
```

`v` is informational for the ETag; `a` and `u` are validated server-side in the bundle
function. **Nothing secret goes in metadata** — the browser holds that token.

### 3.4 Agent worker (`my-agent`)

| | |
|---|---|
| **Where** | LiveKit Cloud, one **new process per job** |
| **Runtime** | Python 3.11, `livekit-agents` 1.8, LiveKit Inference for STT/LLM/TTS |
| **Owns** | One conversation: prompt assembly, tool exposure, MCP connections, retrieval, memory |
| **Talks to** | LiveKit (WebRTC + job context), Supabase Edge Fn (config), Pinecone (query), memory-service (recall/remember), MCP servers |
| **Never does** | Write configuration, connect to Postgres, cache across sessions |

Because every job is a fresh process, **there is no cross-session memory in the worker**.
All continuity lives in Postgres, Pinecone, and Graphiti.

Modules:

```
src/agent.py             entrypoint: parse metadata → fetch bundle → build → start
src/config.py            ConfigBundle dataclasses, ETag fetch, snapshot fallback
src/embed.py             Ollama /api/embed client + boot-time dimension probe
src/tools_mcp.py         MCPToolset construction, parallel connect, timeouts
src/tools_knowledge.py   Pinecone retrieval tool
src/tools_skills.py      read_skill(name, path?) progressive disclosure
src/memory.py            recall/remember, session-end episode distillation
src/memory_service/      FastAPI wrapper around graphiti-core
```

### 3.5 Pinecone

| | |
|---|---|
| **Where** | Managed vector index |
| **Owns** | **Vectors + chunk metadata** (no text generation, no embedding) |
| **Talks to** | UI (upsert/delete), agent (query) |
| **Why** | Namespaces isolate assistants structurally; one index serves all of them |

**Classic index, explicit vectors.** Integrated embedding is not used, because the vectors must
come from Ollama Cloud — Pinecone's hosted embedders would make Ollama decorative.

```
index:     assistant-knowledge
dimension: 768                  (must equal EMBED_DIM — immutable)
metric:    cosine               (Ollama /api/embed returns L2-normalized vectors)
namespace: a_<assistant_id>
record:    { id: "<doc_id>:<ord>", values: [...], metadata: { doc_id, title, ord, source_uri } }
```

Two operational truths:

1. **Pinecone is dumb storage here.** It never embeds. Every `values` array originates from
   Ollama, in either the UI (documents) or the agent (queries).
2. **Upserts are eventually consistent.** A document needs an explicit `indexing` state until it
   is searchable. Never claim "ready" on the upsert response.

`dimension` is immutable. Changing `EMBED_MODEL` to a model of a different width means a new
index and a full re-ingest — which is why the dimension is asserted at startup (§3.6).

### 3.6 Embeddings — Ollama Cloud

| | |
|---|---|
| **Where** | `https://ollama.com/api` (cloud) · `http://localhost:11434/api` (dev only) |
| **Owns** | **All vector generation** — documents at ingest, queries at retrieval |
| **Talks to** | UI (batch ingest), agent (single query) |
| **Why** | User-selected provider; keeps one embedding space for both sides |
| **Auth** | `Authorization: Bearer $OLLAMA_API_KEY` (cloud only; local needs none) |

```
POST {OLLAMA_BASE_URL}/api/embed
{ "model": "embeddinggemma", "input": ["text A", "text B"], "truncate": true }

→ { "model": "...", "embeddings": [[...768], [...768]], "prompt_eval_count": 42 }
```

Rules, all of them load-bearing:

1. **One model, one width.** `EMBED_MODEL` and `EMBED_DIM` are read by both the UI and the agent,
   and the agent **probes `/api/embed` on boot** and aborts if `embeddings[0].length !== EMBED_DIM`.
   A silent dimension mismatch is the worst possible bug here: writes succeed, retrieval returns
   nonsense.
2. **Batch on ingest, single on query.** Ollama accepts an array in `input`; use 32–64 texts per
   request to keep ingestion fast over the network.
3. **`truncate: true` always.** Without it, a chunk past the model's context (2K for
   `embeddinggemma` / `nomic-embed-text`) returns `400` and kills the batch.
4. **Vectors are already L2-normalized** — do not renormalize, and use `cosine` (or `dotproduct`,
   equivalent for unit vectors).
5. **Same provider both sides, always.** If the UI embeds with Ollama and the agent somehow embeds
   with something else, retrieval silently degrades to keyword-ish noise.

Model choice (`EMBED_DIM` is fixed at index creation):

| Model | Dim | Ctx | Notes |
|---|---|---|---|
| `embeddinggemma` | 768 (MRL → 512/256/128) | 2K | multilingual, newest, good default |
| `nomic-embed-text` | 768 | 2K | long-standing RAG default |
| `mxbai-embed-large` | 1024 | 512 | higher recall, English-leaning, short ctx |
| `bge-m3` | 1024 | 8K | multilingual + long docs (+ sparse for hybrid) |

> ⚠️ **Availability check.** As of Nov 2026, Ollama Cloud is widely reported as chat-only:
> [ollama/ollama#17129](https://github.com/ollama/ollama/issues/17129) (open, updated
> 2026-09-21) states cloud `/api/tags` lists only chat models and there is no cloud
> `/v1/embeddings`; [#14496](https://github.com/ollama/ollama/issues/14496) says embedding models
> are not in Cloud. Community integrations report `/api/embed` is **plan-gated** (401 with a valid
> key) as of 2026-09-13. Probe your own account before Phase 3 (PHASES §Phase 3). Because of this,
> `lib/embed/` is written behind a one-function provider interface — a 401 swaps `EMBED_PROVIDER`,
> not the architecture.

### 3.7 Graphiti + Neo4j

| | |
|---|---|
| **Where** | `memory_service/` container + Neo4j Aura Free |
| **Owns** | **Durable user facts**, temporally versioned |
| **Talks to** | Agent + UI (HTTP), Neo4j (bolt), an LLM provider (extraction) |
| **Why** | Bitemporal edges: "moved to Berlin" *invalidates* "lives in Lisbon" instead of overwriting it |

Graphiti is a Python framework whose write path is an **LLM extraction pipeline**. Duplicating
it in TypeScript would fork the graph schema. Therefore:

- `memory_service` is the **single writer** to Neo4j
- the UI browses via `neo4j-driver` (read-only) or `GET /nodes`
- the agent never writes inline on the voice path

```
POST /episodes        { group_id, name, body, reference_time }  → add_episode
POST /search          { group_id, query, limit }                → search
GET  /nodes           ?group_id=&q=                             → nodes + edges
DELETE /nodes/:uuid                                             → forget
POST /profile/rebuild { group_id }                              → summarize → memory_profile
```

`group_id = assistant_id` scopes every operation.

### 3.8 MCP servers

| | |
|---|---|
| **Where** | Anywhere the user points them, usually vendor-hosted |
| **Owns** | Third-party capabilities (docs search, calendar, GitHub, …) |
| **Talks to** | UI (discovery), agent (execution) |
| **Why** | The whole point of "add a tool without redeploying" |

Two separate clients for the same servers, because they run in different languages:

- **UI discovery** — `@modelcontextprotocol/sdk` `Client` + `StreamableHTTPClientTransport`,
  `listTools()`, cached into `mcp_tools`
- **Agent execution** — `livekit.agents.mcp.MCPToolset` + `MCPServerHTTP(..., allowed_tools=[...])`

Same server, two consumers, one shared `mcp_servers` row. Discovery results are cached so the
Tools page never handshakes on load.

### 3.9 UI library stack

| Package | Responsibility |
|---|---|
| `tailwindcss@4` + `shadcn/ui` (Radix) | Design system, accessible primitives |
| `next-themes` | AMOLED/light switching, persisted |
| `@livekit/components-react@^2.9.25` | Room, session state, `useAgentExpression`, visualizers |
| `motion` | Mood-color transitions, layout animation |
| `chroma-js` | Perceptual color interpolation between moods and theme |
| `lucide-react` / `@phosphor-icons/react` | Icons (rail, theme toggle, status) |
| `sonner` | Toasts for async jobs (discovery, ingestion, indexing) |
| `streamdown` + `shiki` | Markdown rendering in the prompt/skill editor preview |
| `zod` | Runtime validation at every trust boundary |

---

## 4. Full communication matrix

| # | From → To | Protocol | Auth | Payload | On failure |
|---|---|---|---|---|---|
| 1 | Browser → Next server | HTTPS (localhost), server actions | Supabase session cookie | forms, mutations | inline error, form preserved |
| 2 | Next → Supabase PostgREST | HTTPS | user JWT (`@supabase/ssr`) | CRUD rows | toast + retry; **no silent success** |
| 3 | Next → Supabase Auth | HTTPS | publishable key | OTP / refresh | redirect to sign-in |
| 4 | Next → **Ollama Cloud** | HTTPS `POST /api/embed` | `OLLAMA_API_KEY` | chunk batch (32–64 texts) → vectors | document → `failed`, nothing written to Pinecone |
| 5 | Next → Pinecone | HTTPS | `PINECONE_API_KEY` | upsert / delete / query (vectors only) | job marked `failed` with message |
| 6 | Next → memory-service | HTTPS | bearer token | episodes, search, nodes | memory page read-only banner |
| 7 | Next → MCP server (discover) | Streamable HTTP | server's own auth | `tools/list` | row → `error` / `auth_failed` |
| 8 | Next → LiveKit (sign only) | local crypto | `LIVEKIT_API_SECRET` | JWT + room config | `500`, session not started |
| 9 | Browser ↔ LiveKit Cloud | WSS / WebRTC | participant JWT | audio, data, transcripts | reconnect UI, agent resumes |
| 10 | LiveKit → Agent worker | job websocket | worker registration | job + metadata | worker restarts, job retried |
| 11 | Agent → Edge Function | HTTPS | `x-agent-key` | `GET ?assistant_id` + `If-None-Match` | **snapshot fallback** |
| 12 | Edge Fn → Postgres | SQL RPC | service role | `get_assistant_bundle()` | `500` → agent falls back |
| 13 | Agent → **Ollama Cloud** | HTTPS `POST /api/embed` | `OLLAMA_API_KEY` | query text → 1 vector | "I can't search your documents right now" |
| 14 | Agent → Pinecone | HTTPS | `PINECONE_API_KEY` | vector query + namespace | "I can't reach the knowledge base" |
| 15 | Agent → MCP servers | Streamable HTTP | headers from bundle | `tools/call` | tool returns an error to the LLM |
| 16 | Agent → memory-service | HTTPS | bearer | recall / remember | falls back to cached profile |
| 17 | memory-service → Neo4j | bolt | password | Cypher | profile rebuild skipped |
| 18 | memory-service → LLM API | HTTPS | provider key | entity extraction | episode dropped, logged |

**Anti-patterns this matrix forbids:** browser → Pinecone direct; browser → Neo4j direct;
agent → Postgres; agent → UI; agent embedding with a different model than the UI
(silently destroys retrieval quality, no error raised).

---

## 5. Sequence: session start

The critical path. Everything here is measured in milliseconds.

```
 UI          Next /api/token      LiveKit Cloud        Agent worker         Supabase
 │                  │                  │                    │                  │
 │─ start ────────►│                  │                    │                  │
 │                  │ 1. getClaims()   │                    │                  │
 │                  │ 2. own(assistant)?                    │                  │
 │                  │ 3. sign JWT + dispatch metadata       │                  │
 │◄── token ────────│                  │                    │                  │
 │─ WebRTC ─────────────────────────► │                    │                  │
 │                  │                  │─ dispatch job ────►│                  │
 │                  │                  │                    │ 4. parse metadata│
 │                  │                  │                    │ 5. GET +ETag ───►│
 │                  │                  │                    │◄── 304 / 200 ────│
 │                  │                  │                    │ 6. build agent   │
 │                  │                  │◄─ join room ───────│                  │
 │◄──────────────────── agent audio ──────────────────────│                  │
```

**Step detail**

1. `getClaims()` runs early in middleware so token refresh can write cookies.
2. Ownership: `select 1 from assistants where id = $1 and owner_id = auth.uid()`.
   Fails closed with `403` — never trust the body.
3. `RoomConfiguration.agents = [{ agentName, metadata }]`. Signing locally means **no network
   hop** and the metadata is inside the signed token.
4. Metadata is **untrusted input**: `zod` on TypeScript side; explicit UUID + range checks in
   Python. A malformed value must not crash the job.
5. Fetch starts **in parallel with `ctx.connect()`**, wrapped in `asyncio.wait_for(1.5)`.
6. Build, then `session.start()`. First agent word is dominated by model warmup, not config.

**Fallback chain**

```
job memo ──miss──► Edge Function (ETag) ──error/timeout──► config_snapshot.json ──missing──► spoken apology
2025-01           2025-01                1.5 s               baked at Docker build          degraded mode
```

---

## 6. Sequence: editing the prompt

```
UI form ──► server action ──► insert prompt_versions(v+1, status='draft')
                              └─► update assistant_config.active_prompt_id
                                    └─► trigger bumps assistants.config_version
```
The UI's **Activate** and **Rollback** are the same mutation: point `active_prompt_id` at a
version, set that version `active`, archive the previous. Rollback is therefore O(1) and
lossless. The next session sees a new `config_version`, misses the ETag, and re-hydrates.

---

## 7. Sequence: MCP discovery

```
UI "Discover" ──► /api/mcp/discover { server_id }
                     │ 1. decrypt secret (pgcrypto, server-side)
                     │ 2. Client(new StreamableHTTPClientTransport(url, { headers }))
                     │ 3. await client.listTools()   (20 s hard timeout)
                     │ 4. upsert mcp_tools (name, description, input_schema)
                     │ 5. update mcp_servers.status / last_discovered_at
                     ▼
                  rows cached → Tools page is instant on reload
```

Discovery and execution are **independent**: discovery failures never affect a live session,
and a live session never triggers discovery.

---

## 8. Sequence: document ingestion

```
upload ─► extract text ─► chunk (700 tok / 15% overlap) ─► Ollama embed (batches of 32)
   │            │                    │                          │
   │            └─ pdf/docx/md/html/txt                        └─ POST /api/embed, truncate:true
   │                                                           │
   └─► documents row: pending → chunking → embedding → indexing → ready
                                                          ▲
                                          readiness poll ─┘  (Pinecone upserts are not instant)

                        Pinecone upsert (batches of 50, vectors from Ollama)
                        record: { id: "<doc_id>:<ord>", values, metadata }
```

Two states, not one, because two things are asynchronous:

| State | Waiting on | Failure looks like |
|---|---|---|
| `embedding` | Ollama Cloud | 401/404 = plan gate closed; 400 = chunk too long (`truncate` off) |
| `indexing` | Pinecone | upsert accepted but not yet searchable |

`documents.sha256` is unique per assistant → re-uploading the same file is a no-op, not a
duplicate. Deletion is by `doc_id` metadata filter, so it works even while indexing.

**Never write partially-embedded documents.** Embed the whole batch first; if any batch fails,
mark the document `failed` and write nothing to Pinecone. A half-embedded document is invisible
garbage that retrieves random chunks.

---

## 9. Sequence: memory

**Write** (never on the voice path):

```
session ends ─► agent distills one summary ─► POST /episodes ─► Graphiti extraction
                                                                  └─► Neo4j nodes/edges
                └─► POST /profile/rebuild ─► memory_profile (denormalized top facts)
```

**Read** (two tiers):

| Tier | When | Cost | Source |
|---|---|---|---|
| Profile | every session start | **0 ms** (already in the bundle) | `memory_profile` |
| `recall(query)` | agent decides it needs detail | 200–400 ms | Graphiti `/search` |

The profile tier is what makes memory feel instant: the common case ("who is this person")
never waits on a graph query.

---

## 10. Data ownership

| Data | Source of truth | Derived / rebuildable | Written by |
|---|---|---|---|
| Prompts, settings, tools, skills | **Postgres** | — | UI only |
| Secret ciphertext | **Postgres** (`pgp_sym_encrypt`) | — | UI only |
| Document metadata | **Postgres** | — | UI only |
| Document text + vectors | **Pinecone** | — | UI only |
| Embedding model / dimension | **Postgres** (`assistant_config.settings.embed`) | — | UI only (index creation) |
| Memory graph | **Neo4j** | — | memory-service only |
| `mcp_tools` | — | ✅ discovery cache | UI |
| `memory_profile` | — | ✅ rebuildable | memory-service |
| `config_snapshot.json` | — | ✅ build artifact | CI/Docker |
| `sessions` | **Postgres** | — | agent (append-only) |

Anything marked *derived* can be deleted and reconstructed. Nothing marked *source of truth*
may be edited by the agent.

---

## 11. Config bundle contract

`GET /functions/v1/assistant-config?assistant_id=<uuid>`

Headers: `x-agent-key` (required), `If-None-Match: W/"<version>"` (optional)

```jsonc
{
  "version": 42,
  "assistant": { "id": "…", "name": "…" },
  "prompt": "You are a personal assistant…",
  "models": {
    "llm": "google/gemma-4-31b-it",
    "stt": "assemblyai/universal-3-5-pro",
    "tts": "fishaudio/s2.1-pro",
    "voice": "fa4c9eb3dccc4806b382b40d61c6b10a",
    "expressive": true,
    "temperature": 0.7
  },
  "greeting": "Hey, welcome back.",
  "tools": { "builtin": ["search_knowledge", "recall", "read_skill"] },
  "mcp": [
    {
      "id": "…", "name": "docs",
      "url": "https://docs.livekit.io/mcp",
      "transport": "streamable_http",
      "headers": { "Authorization": "Bearer …" },
      "allowed_tools": ["search_docs", "get_page"]
    }
  ],
  "skills": [{ "name": "triage", "description": "Use when the user reports an incident." }],
  "rag":    { "enabled": true, "namespace": "a_…", "top_k": 5, "min_score": 0.35,
              "embed": { "provider": "ollama", "model": "embeddinggemma", "dim": 768 } },
  "memory": { "enabled": true, "group_id": "a_…", "profile": "Lives in Dhaka…" }
}
```

| Response | Meaning |
|---|---|
| `200` + `ETag: W/"42"` + `Cache-Control: no-store` | fresh bundle |
| `304` | unchanged; agent uses its snapshot/memo |
| `401` | bad `x-agent-key` |
| `404` | unknown assistant |
| `500` | assembly error → agent falls back to snapshot |

Assembly lives in **one** SQL function (`get_assistant_bundle`), so the Edge Function stays a
thin wrapper and can be swapped for `supabase.rpc()` without touching the agent.

`rag.embed` is the **authoritative** embedding configuration: it is written by the UI when the
index is created and read back by the agent. Env vars are only a bootstrap default. If the
agent's `EMBED_DIM` disagrees with this field, the agent refuses to start rather than querying
with the wrong width.

---

## 12. Security model

### Trust boundaries

```
[ browser ]  ← untrusted input (forms, metadata echo)
     │ session cookie
[ Next server ]  ← trusted; holds Pinecone + memory keys; NOT the service role
     │ user JWT (RLS)
[ Supabase ]  ← service role used only inside Edge Functions
     │ x-agent-key
[ agent worker ]  ← trusted code, untrusted inputs (user speech, MCP output, job metadata)
```

### Controls

| Threat | Control |
|---|---|
| Anyone mints a token and burns LiveKit minutes | `/api/token` requires a session and verifies ownership |
| Browser reads another assistant's config | RLS `owner_id = auth.uid()` on all tables |
| MCP keys visible in DevTools | `pgp_sym_encrypt` at rest; only `hint` (last 4) is readable |
| Agent compromised → full DB | Agent has **no DB credentials**, only one read endpoint |
| Metadata spoofing | Validated shape + ownership re-check inside the bundle function |
| RAG cross-contamination | Pinecone namespace per assistant (structural, not a filter) |
| Memory cross-contamination | Graphiti `group_id` per assistant |
| Prompt injection via MCP output | MCP results framed as data; never instructions (see §14) |
| Secrets in logs | Structured logging with a redaction list |

### Secret lifecycle

```
UI input ──► pgp_sym_encrypt(value, SECRET_ENCRYPTION_KEY) ──► bytea in Postgres
                                                                   │
Agent request ──► Edge Function decrypts ──► TLS ──► agent memory ──► MCP header
                                                                   │
                                                    never logged, never returned to browser
```

The key lives in **two** places by necessity: the Edge Function (to decrypt) and — nothing
else. The agent never needs it, because decryption happens before the bundle is returned.

---

## 13. Latency budget

| Hop | p50 target | p95 ceiling | Mitigation |
|---|---|---|---|
| `/api/token` | 40 ms | 150 ms | local sign, one ownership query |
| Config bundle | 80 ms | 400 ms | Edge Fn + ETag; 1.5 s hard timeout |
| MCP connect ×n (parallel) | 600 ms | 8 s | only enabled servers, `wait_for`, degrade |
| **Ollama embed (query)** | **120 ms** | **400 ms** | one short string; cache repeated queries |
| Pinecone query | 90 ms | 300 ms | tool-based, lazy; **runs after embed** |
| Graphiti search | 300 ms | 900 ms | profile preloaded; graph only on demand |
| **Agent's first word** | **1.2 s** | **2.0 s** | dominated by model warmup, unchanged by this design |

`search_knowledge` therefore costs **~210 ms** end to end (embed + query), which is fine because
it is a tool the model chooses, not a fixed startup cost. Ingestion embedding is never on the
hot path — it runs in the UI, in batches of 32, and the user watches a status chip.

Rules that protect the budget:

- No Pinecone **or** Ollama call on the session-start path
- Config fetch and `ctx.connect()` run concurrently
- MCP connects are parallel and individually capped
- Anything slow is a **tool the model can choose**, not a fixed cost
- Repeat queries hit an LRU cache on `sha256(query)` → vector (identical questions are common)

---

## 14. Failure & degradation

| Failure | User experience | System behavior |
|---|---|---|
| Supabase Edge Fn down | session works, config possibly stale | snapshot fallback, warning logged |
| Postgres unreachable | UI read-only error state | no partial writes; forms keep input |
| MCP server unreachable | agent says it can't use that tool, once | server dropped for the session |
| MCP tool throws | model narrates the failure | error string returned to LLM, no crash |
| Pinecone down | "I can't reach the knowledge base" | retrieval tool returns empty + reason |
| **Ollama `/api/embed` 401/404** | "I can't search your documents right now" | startup probe fails → RAG marked unavailable, `documents` ingestion blocked with a plan-gate message |
| **Ollama embed times out** | agent says it can't search, once | tool returns a reason string; other tools unaffected |
| **`EMBED_DIM` mismatch** | session refuses to start | **fail fast** on boot; never silently write wrong-width vectors |
| Pinecone still indexing | UI shows *Indexing…* | poll until `ready`; search excluded |
| memory-service down | memory page read-only banner | agent falls back to `memory_profile` |
| Neo4j suspended (free tier) | memory writes queued/skipped | profile cache keeps recall working |
| LiveKit disconnect | reconnecting overlay | agent resumes in the same room |
| Model provider error | "Sorry, say that again" | session survives, retry on next turn |

**Principle:** a degraded session always beats a failed session. Every remote call on the hot
path has a timeout and a fallback — no unbounded `await`.

---

## 15. Deployment topology

| Environment | UI | Agent | Supabase | Pinecone | memory-service | Neo4j |
|---|---|---|---|---|---|---|
| **Dev** | `next dev` localhost | `uv run agent.py dev` local worker | cloud project (dev branch) | cloud index | `uv run` local | Aura Free |
| **Prod (personal)** | `next start` localhost | LiveKit Cloud | cloud project | cloud index | Fly/Render container | Aura Free |

Notes:

- The agent must run in LiveKit Cloud (or any publicly reachable worker) — a local worker
  cannot receive jobs for a cloud room.
- The UI never needs to be reachable from the internet. It only makes outbound calls.
- `memory-service` is the only extra container; it must be reachable from LiveKit Cloud and
  from the desktop.
- `.env.local` files are the whole config surface; no build-time secrets.

### Environment variables

```
# ── shared by UI and agent (must agree) ──────────────────────────────
EMBED_PROVIDER=ollama                     # swap here if the cloud gate is shut
OLLAMA_BASE_URL=https://ollama.com/api    # dev only: http://localhost:11434/api
OLLAMA_API_KEY=                           # required for cloud; omit for local
EMBED_MODEL=embeddinggemma
EMBED_DIM=768                             # must equal the Pinecone index dimension

# ── ui/.env.local ────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
AGENT_NAME=my-agent
PINECONE_API_KEY=
PINECONE_INDEX=assistant-knowledge
PINECONE_REGION=
MEMORY_SERVICE_URL=
MEMORY_SERVICE_TOKEN=

# ── supabase function secrets ────────────────────────────────────────
AGENT_API_KEY=                            # shared with the agent worker
SECRET_ENCRYPTION_KEY=                    # pgp_sym_encrypt key

# ── my-agent/.env.local (cloud worker) ───────────────────────────────
AGENT_CONFIG_URL=https://<ref>.supabase.co/functions/v1/assistant-config
AGENT_API_KEY=
OLLAMA_BASE_URL=
OLLAMA_API_KEY=
EMBED_MODEL=
EMBED_DIM=
PINECONE_API_KEY=
MEMORY_SERVICE_URL=
MEMORY_SERVICE_TOKEN=
```

`EMBED_MODEL` / `EMBED_DIM` appearing in **both** envs is deliberate duplication with a guard:
the agent compares them against `rag.embed` in the bundle and aborts on disagreement.

**Deploying on a different embedding provider** touches exactly one file —
`ui/lib/embed/index.ts` (`embed(texts) → number[][]`) and its Python twin
`my-agent/src/embed.py`. Pinecone, ingestion, retrieval, and the UI never change.

---

## 16. Observability

| Signal | Where | Why |
|---|---|---|
| `config_version` + `source: etag\|snapshot\|memo` | agent log, per session | proves the hydration path works |
| `mcp_connect_ms` per server | agent log | catches a slow server |
| `tools_attached` count | `sessions.stats` | catches tool sprawl |
| `retrieval_hits`, `top_score` | `sessions.stats` | catches a broken index |
| `embed_probe` + `embed_dims` | agent boot log | proves the Ollama gate is open and the width matches |
| `embed_ms` per query | agent log | catches a slow/rate-limited embed provider |
| `memory_episodes`, `profile_age` | `sessions.stats` | catches a silently dead memory |
| `ingestion_ms`, `chunk_count` | `documents` | catches a bad parser |
| Tool-call failures | agent log | catches auth drift on MCP |

Every session writes one `sessions` row. That row is the product's analytics: latency,
tools used, citations, memories created.

---

## 17. Cost model

| Item | Driver | Control |
|---|---|---|
| LiveKit minutes | session length | the real cost; everything else is noise |
| STT/LLM/TTS | tokens + audio seconds | LiveKit Inference, no extra keys |
| Pinecone | index + read/write units | one index, namespaces not indexes |
| **Ollama Cloud** | embed calls (ingest + per query) | batch ingest 32–64; LRU on repeated queries; truncate to keep tokens low |
| Graphiti | **LLM calls per episode** | one distilled episode per session, never per turn |
| Supabase | rows, edge invocations | free tier is ample for one user |
| Neo4j Aura | one free instance | profile cache survives suspension |

---

## 18. Decisions and rejected alternatives

| Decision | Rejected | Why |
|---|---|---|
| Supabase | Neon + own auth; local Postgres + tunnel | RLS + Auth + Edge Fn in one; a local DB cannot serve a cloud agent |
| One Edge Function door | Agent → Postgres direct; agent → Next route | No DB creds in the worker; one request; the UI is not publicly reachable |
| Metadata in signed JWT | Separate dispatch REST call | Zero extra hop, cannot be spoofed |
| Snapshot + ETag + memo | Redis/Upstash shared cache | New process per job makes in-process caches useless; Redis is a service with no payoff at n=1 |
| **Ollama Cloud** for embeddings | Pinecone integrated embedding; OpenAI embeddings | User-selected provider; one embedding space shared by UI and agent. Accepted cost: an extra hop plus a hard `EMBED_DIM` contract |
| Pinecone **classic** index (explicit vectors) | Pinecone document API with `embed` on a field | Forced by the choice above — Pinecone must not embed if Ollama does |
| Pinecone vector search | pgvector in Supabase | Chosen for horizontal scale; pgvector would be simpler but was explicitly overridden |
| Graphiti behind a thin service | Direct Graphiti from the UI | No TS client; duplicating the extraction pipeline would fork the schema |
| SKILL.md progressive disclosure | All skill bodies in the prompt | 30 skills would cost ~20k tokens per turn |
| `allowed_tools` + budget | Attach every tool | 100 tools ≈ 30k tokens/turn and worse tool choice |
| Plain localhost Next | Tauri/Electron now | Packaging is orthogonal to the features; revisit after Phase 5 |

---

## 19. Open questions

1. **Ollama Cloud `/api/embed` access** → does your key return `200` on the probe, or `401`
   (plan-gated)? This gates Phase 3 entirely. Verify before starting; the fallback provider is a
   one-file swap in `lib/embed/`, but the *index* is sized to `EMBED_DIM` at creation.
2. **Embedding model** → `embeddinggemma` (768, multilingual, 2K ctx) is the default pick;
   `bge-m3` (1024, 8K ctx) if long multilingual documents dominate. `EMBED_DIM` is immutable per
   index, so this locks at Phase 3 index creation.
2. **Desktop sign-in UX** → email OTP each cold start, or a persisted refresh token.
3. **Neo4j hosting** → Aura Free vs a bolt container beside `memory-service`.
4. **`memory_service` host** → LiveKit-adjacent container vs Fly/Render.
5. **Builtin tool list** → frozen in Phase 2; `search_knowledge`, `recall`, `read_skill` are
   guaranteed, everything else is optional.
6. **Embedding fallback, if the gate is shut** → OpenAI `text-embedding-3-small` (1536d),
   Voyage, or a local Ollama container as a service. Decide only after the probe fails.
