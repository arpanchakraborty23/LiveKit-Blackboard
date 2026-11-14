# Personal Assistant — 5 Phases

> Execution plan. Every phase ships **UI + backend + agent together**. No phase ends with a
> screen that isn't wired to real data or a backend route nobody calls.
>
> Companion: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## Phase map

| # | Phase | Ships | New pages | New tables | New libraries |
|---|---|---|---|---|---|
| 1 | Config plane & expressive UI | DB-driven prompt/model/voice, versioned prompts with rollback, visible theme toggle, mood aura | `/assistant`, `/prompts` | `assistants`, `assistant_config`, `prompts`, `prompt_versions`, `sessions`, `users` | `@supabase/*`, `zod`, `chroma-js`, `components-react@2.9.25` |
| 2 | Tools & MCP | Add a server, discover its tools, choose which the agent may use, budget guard | `/tools` | `mcp_servers`, `mcp_tools`, `tools`, `secrets` | `@modelcontextprotocol/sdk`, `livekit-agents[mcp]` |
| 3 | Knowledge (RAG) | Upload documents → embed via Ollama Cloud → search → agent cites them | `/knowledge` | `documents` | Ollama `/api/embed` (no SDK), `@pinecone-database/pinecone`, `pdf-parse`, `mammoth`, `gpt-tokenizer`, `pinecone` (py) |
| 4 | Memory (Graphiti) | Assistant remembers across sessions; inspect / edit / forget in a graph view | `/memory`, `/sessions` | `memory_profile` | `neo4j-driver`, `graphiti-core`, `fastapi`, `uvicorn` |
| 5 | Skills & ship-readiness | SKILL.md library with progressive disclosure, backup/restore, dashboards, polish | `/skills` | `skills`, `skill_files` | — (reuses stack) |

```
P1 ──► P2 ──► P3 ──► P4 ──► P5
 │      │      │      │      │
 └ each phase is independently demoable and leaves the app working
```

**Rule:** if a phase is interrupted halfway, the app must still run. Build backend → wire UI →
verify acceptance in that order *within* the phase, but never leave a merge point that breaks
starting a voice session.

---

# Phase 1 — Config plane & expressive UI

**Size:** ~4–6 days · **Risk:** low · **Blocks everything else**

### Goal

Make the agent's prompt, model, voice, and greeting **data**. After this phase you can rewrite
the assistant's personality in a web form and hear the change in the next call — with version
history and one-click rollback. Also land the two visible UI wins: an always-present theme
toggle and the mood-driven aura.

### Demo script

1. Open `/prompts`, edit the system prompt, save a draft, activate it.
2. Watch `config_version` increment.
3. Start a session → the assistant's behavior changed, no redeploy.
4. Roll back to v1 → next session reverts.
5. During the call, the aura shifts from teal toward warm orange on an excited line.
6. Stop the Edge Function, start a session → still works (snapshot).

### Pages

**`/assistant`** — assistant settings
- Name, greeting, LLM model, STT model, TTS model, voice, temperature, expressive toggle
- Read-only `config_version` chip + "last updated"
- Save via server action → revalidate; success toast
- Components: `SettingsForm`, `ModelSelect` (grouped by provider), `VersionBadge`, `VoicePreview` (optional TTS sample)

**`/prompts`** — prompt management
- Prompt list (name, active version, updated)
- Editor: markdown textarea + live preview (`streamdown`), token estimate
- Version history list: version, status, created, diff vs current
- Actions: **Save draft** · **Activate** · **Rollback** · **Duplicate**
- Unsaved-changes guard

**Shell** — `app/(app)/layout.tsx`
- Left rail: Assistant · Prompts · Tools · Skills · Knowledge · Memory · Sessions · Settings
- Top bar: assistant name, `config_version`, **always-visible theme toggle icon**
- Active route highlighting, collapsed rail on narrow widths

**Session view** — expression aura
- `useAgentExpression()` → `{ mood, expression }`
- mood → hex via `MOOD_COLORS`, `motion` animated into `<AgentAudioVisualizerAura color>`
- decay to neutral after 2 turns (SDK default), so one excited line doesn't tint the session
- neutral fallback when the agent hasn't expressed yet

### Backend

**Migrations**

```sql
-- 0001_init.sql
users, assistants, assistant_config, prompts, prompt_versions, sessions
bump_config_version()  -- trigger on every config table
RLS: owner_id = auth.uid() on every table
```

```sql
-- 0002_bundle.sql
get_assistant_bundle(p_assistant_id uuid) returns jsonb
revoke execute from anon, authenticated   -- service role only
```

**Edge Function** `supabase/functions/assistant-config/index.ts`
- `x-agent-key` check (constant-time compare)
- Parse `assistant_id`, read `If-None-Match`
- `rpc('get_assistant_bundle')` as service role
- `304` when version matches, else `200` + `ETag: W/"<version>"` + `Cache-Control: no-store`
- Structured log line per request: `assistant_id`, `version`, `hit|miss`

**`ui/app/api/token/route.ts`** (rewrite)
- Require Supabase session; `getClaims()` early
- Ownership query on `assistant_id`; `403` otherwise
- `RoomConfiguration.agents = [{ agentName, metadata }]`
- Remove the `NODE_ENV !== 'development'` throw — replaced by real auth
- Return `{ serverUrl, roomName, participantName, participantToken }` unchanged

**`ui/middleware.ts`** — session refresh with `getClaims()`, `Cache-Control: private, no-store`

**`ui/lib/supabase/{client,server}.ts`** — `createBrowserClient` / `createServerClient`

### Agent

- **Delete** `board_state.py`, `board_tools.py`, `tests/test_board.py`, and all imports in `agent.py`
- **`src/config.py`**
  - `ConfigBundle` dataclasses mirroring the contract in ARCHITECTURE §11
  - `fetch_bundle(assistant_id, etag)` → `httpx` with `If-None-Match`, `wait_for(1.5)`
  - resolution order: job memo → HTTP (ETag) → `config_snapshot.json` → raise
  - returns `(bundle, source)` where source ∈ `memo|etag|snapshot`
- **`src/agent.py`**
  - `@server.rtc_session()` entrypoint: parse + validate `ctx.job.metadata`
  - fetch in parallel with `ctx.connect()`
  - construct `Assistant(instructions=bundle.prompt, llm=…)`
  - `AgentSession(stt, tts, turn_handling, expressive)` from the bundle
  - remove the hardcoded blackboard section of the prompt
- **`scripts/snapshot.py`** → `config_snapshot.json`; `Dockerfile` runs it at build
- **`pyproject.toml`** → `httpx`

### Tools used in this phase

| Tool | Version | Responsibility here |
|---|---|---|
| Supabase Postgres | managed | config truth |
| Supabase Auth | managed | owner identity, RLS anchor |
| Supabase Edge Functions | managed | `assistant-config` door |
| Supabase CLI | latest | migrations, function deploy |
| `@supabase/supabase-js` / `@supabase/ssr` | `^2.119.0` / `^0.12.7` | JWT-scoped clients |
| `zod` | `^4.6.7` | validate metadata + form payloads |
| `next-themes` | present | theme switching |
| `@livekit/components-react` | **`^2.9.25`** | `useAgentExpression`, aura |
| `chroma-js` | `^3.3.0` | mood color interpolation |
| `motion` | present | color transitions |
| `livekit-server-sdk` | present | sign token + room config |
| `livekit-agents` | `1.8.x` | runtime |
| `httpx` | `^0.28` | bundle fetch |

### Acceptance

- [ ] Edit prompt → next session's behavior changes; `config_version` increments by exactly 1
- [ ] Second session with no edits → agent logs `source: etag` (304)
- [ ] Edge Function stopped → session starts with `source: snapshot`
- [ ] `POST /api/token` without a session → `401`
- [ ] `POST /api/token` with another owner's `assistant_id` → `403`
- [ ] Rollback to v1 → next session behaves like v1
- [ ] Theme toggle visible without hover; AMOLED default; choice persists across reload
- [ ] Aura color changes with agent mood on a real call; returns to neutral when idle
- [ ] `uv run pytest` passes with board tests removed
- [ ] `pnpm build` and `tsc --noEmit` clean

### Watch items

- `lk.expression` must actually be published — verify with `expressive=True` + Fish Audio
  before investing in the aura; if absent, check the TTS plugin's markup support
- Edge Function cold start (Deno) — measure; if >400 ms, switch to `supabase.rpc()` with a
  service key (same SQL function, no rewrite)
- **`ui/lib/` is git-ignored** by the root `lib/` Python rule — fix `.gitignore` in this phase
  or the new `ui/lib/supabase/*` files never get committed
- Deleting `board_*` may leave dead references in `app-config.ts` and session UI — grep first

---

# Phase 2 — Tools & MCP

**Size:** ~4–6 days · **Risk:** medium (third-party servers vary) · **Depends on P1**

### Goal

Add a remote MCP server from the UI, see the tools it offers, pick the ones the agent may use,
and have the agent actually call one — with a guard that stops the tool list from poisoning
the prompt.

### Demo script

1. Add `https://docs.livekit.io/mcp` in `/tools` → status turns green, 8 tools discovered.
2. Enable only 3 of them.
3. Start a session: "search the LiveKit docs for MCP toolsets" → agent calls `search_docs`.
4. Try enabling 40 tools → save is blocked with an explanation and the count.
5. Reload `/tools` → still instant (served from cache, no handshake).

### Pages

**`/tools`**
- **Builtin tools** section: registry rows (`search_knowledge`, `recall`, `read_skill`, …) with
  description and enable toggle
- **MCP servers** table: name, URL host, status dot (`ok`/`error`/`auth_failed`/`unknown`),
  enabled tool count / total, last discovered, enabled switch, row actions
- **Tool budget meter** (rail or header): `active / budget`, amber at 20, red above 30 with save disabled
- **Add server dialog**: name, URL, transport (`streamable_http` / `sse`), auth mode
  (`none` / `bearer` / `header`), header name, secret value, **Test connection** button
- **Server drawer**: searchable tool list with descriptions and input schemas (collapsed JSON),
  checkboxes, select all/none, "enable only these", save
- Empty state explaining what MCP is, with one example server

### Backend

**Migration** `0003_tools.sql`
```sql
mcp_servers(id, assistant_id, name, url, transport, auth_type, auth_header,
            secret_id, enabled, status, status_message, last_discovered_at)
mcp_tools(id, mcp_server_id, name, description, input_schema, enabled, discovered_at)
tools(id, assistant_id, kind, name, description, enabled, sort_order)
secrets(id, assistant_id, name, ciphertext bytea, hint, created_at)
-- + version triggers, + RLS
```

**Routes**

| Route | Behavior |
|---|---|
| `POST /api/mcp/discover` | decrypt secret → `Client(new StreamableHTTPClientTransport(url, {headers}))` → `listTools()` (20 s) → upsert `mcp_tools` → set status |
| `POST /api/mcp/test` | connect + `listTools`, return `{ ok, tools, latencyMs }`; does not persist |
| `POST /api/mcp/servers` | create/update server, encrypt secret, `hint` = last 4 |
| `POST /api/mcp/tools` | bulk set `mcp_tools.enabled` |
| `POST /api/tools` | toggle builtins |

**`ui/lib/secrets.ts`** — `encrypt(value)` → `pgp_sym_encrypt(value, SECRET_ENCRYPTION_KEY)`;
`mask(hint)` for display. Decryption happens **only** in the Edge Function.

**Edge Function** — bundle gains `mcp: [{ id, name, url, transport, headers, allowed_tools }]`
where `headers` is decrypted inside the SQL function.

**`ui/lib/tools/builtins.ts`** — static registry seeding `tools` rows per assistant on creation.

### Agent

**`src/tools_mcp.py`**
```python
mcp.MCPToolset(
    id=cfg.id,
    mcp_server=mcp.MCPServerHTTP(
        cfg.url,
        transport_type=cfg.transport,     # "streamable_http"
        headers=cfg.headers,
        allowed_tools=cfg.allowed_tools,  # ← the budget enforcement
    ),
)
```
- build all toolsets, `asyncio.gather(..., return_exceptions=True)`
- per-server `asyncio.wait_for(8)`
- failure → drop that server, collect a short spoken-safe notice, never crash the session
- log `mcp_connect_ms` per server

**`pyproject.toml`** → `livekit-agents[mcp]~=1.8`

### Tools used in this phase

| Tool | Version | Responsibility here |
|---|---|---|
| `@modelcontextprotocol/sdk` | `^1.32.2` | UI-side discovery client |
| `livekit-agents[mcp]` | `~=1.8` | agent-side `MCPToolset` / `MCPServerHTTP` |
| `pgcrypto` (Postgres ext) | built-in | secret encryption |
| `sonner` | present | discovery progress + errors |
| `zod` | `^4.6.7` | validate server payloads, secret shape |

### Acceptance

- [ ] Add the LiveKit docs MCP server → discovery lists its tools with descriptions
- [ ] Enable 3 tools → the agent calls one and **cannot** call the disabled ones
- [ ] Disable the server → its tools vanish from the LLM on the next session
- [ ] 40 enabled tools → save blocked, message names the budget
- [ ] Wrong API key → row shows `auth_failed` with a human-readable message
- [ ] Unreachable host → 20 s timeout, row shows `error`, UI stays responsive
- [ ] Reload `/tools` → no network call to any MCP server
- [ ] Secret round-trip: save, reload → masked; "Test" succeeds using stored secret
- [ ] Session with a dead MCP server still connects and speaks

### Watch items

- **Tool proliferation is the main product risk.** If a server exposes 60 tools, default to
  "none enabled" and force an explicit pick — never auto-enable everything.
- Streamable HTTP vs SSE: prefer `streamable_http`; keep `sse` for older servers.
- Some servers require OAuth rather than a bearer token — out of scope for v1; surface a clear
  "this server needs OAuth, not supported yet" message instead of a generic failure.
- `allowed_tools` names must match `listTools()` exactly; a typo silently drops the tool.

---

# Phase 3 — Knowledge (RAG)

**Size:** ~5–7 days · **Risk:** medium-high (embedding availability + parsing + eventual consistency)
· **Depends on P1–P2**

### Goal

Upload documents, see them embed and become searchable, and have the agent answer questions from
them with the source named out loud — scoped per assistant so nothing leaks.

Vectors come from **Ollama Cloud** (`POST /api/embed`), so Pinecone becomes classic vector storage
with an explicit, immutable dimension. Pinecone never embeds anything.

### Step 0 — verify the embedding gate (do this before writing any code)

Ollama Cloud is widely reported as **chat-only** through 2026 — see ARCHITECTURE §3.6 for the
issues. Probe your own key first:

```powershell
curl.exe -sS https://ollama.com/api/embed `
  -H "Authorization: Bearer $env:OLLAMA_API_KEY" `
  -H "Content-Type: application/json" `
  -d '{"model":"embeddinggemma","input":"ping"}' -w "`nHTTP %{http_code}`n"
```

| Probe result | Action |
|---|---|
| `200`, `embeddings[0].length === 768` | proceed: `EMBED_MODEL=embeddinggemma`, `EMBED_DIM=768` |
| `200`, different width | use that width as `EMBED_DIM` — it is immutable per index |
| `401` / `403` | plan-gated ⇒ **stop and switch provider** (see below) |
| `404` | no cloud embed route on this plan ⇒ switch provider |

**Fallback, if the gate is shut:** `EMBED_PROVIDER=openai` + `text-embedding-3-small`
(`EMBED_DIM=1536`). The blast radius is two files — `ui/lib/embed/index.ts` and
`my-agent/src/embed.py`. Pinecone, ingestion, retrieval, the UI, and the agent tools are all
provider-agnostic. Do not start the phase without a working provider.

Record the decision in `assistant_config.settings.embed = { provider, model, dim }` — the agent
compares its env against this at boot and refuses to start on disagreement.

### Demo script

1. Drag a PDF onto `/knowledge` → status moves `chunking → embedding → indexing → ready`.
2. Health chip in the header shows `Ollama · embeddinggemma · 768d` in green.
3. Playground: query returns ranked chunks with highlighted spans, scores, embed+query latency.
4. In a session: "what does the paper say about latency?" → agent answers and names the document.
5. Upload the same file again → rejected as duplicate (`sha256`).
6. Delete the document → the question now gets "I don't have that".

### Pages

**`/knowledge`**
- Drop zone (click or drag): pdf, docx, md, html, txt
- Document table: title, chunks, size, status chip, created, actions (re-index, delete)
- Status chip: `chunking` → `embedding` → `indexing` → `ready` / `failed` (reason on hover)
- **Embedding panel**: provider, model, dimension, probe status, "Test embedding" button
  (`200` / `401` / `404` rendered plainly — a 401 must say *"your Ollama plan doesn't include
  embeddings"*, not "something went wrong")
- Row-level progress; auto-refresh while any row is non-terminal
- **Search playground**: query box, `top_k` + `min_score`, ranked results with highlighted spans,
  score, embed latency, query latency, source
- **Assistant panel**: RAG enabled, `top_k`, `min_score`, documents in scope

### Backend

**`ui/lib/embed/index.ts`** — the whole provider surface, one function:
```ts
export async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${process.env.OLLAMA_BASE_URL}/api/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.OLLAMA_API_KEY
        ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({
      model: process.env.EMBED_MODEL,
      input: texts,          // array ⇒ one round trip per batch
      truncate: true,        // never 400 on a long chunk
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new EmbedError(res.status);   // 401/403 → plan gate
  const { embeddings } = await res.json();
  assertDims(embeddings);                          // length === EMBED_DIM
  return embeddings;                               // already L2-normalized
}
```
Batching: 32–64 texts per call. Never renormalize. Never send a single text in a loop.

**`scripts/pinecone-init.ts`** — classic index, dimension from `EMBED_DIM`:
```ts
const existing = await pc.indexes.describe(NAME).catch(() => null);
if (!existing) {
  await pc.indexes.create({
    name: NAME,
    dimension: Number(process.env.EMBED_DIM),   // 768 for embeddinggemma
    metric: 'cosine',                            // vectors are unit length
    spec: { serverless: { cloud: 'aws', region: process.env.PINECONE_REGION } },
    waitUntilReady: true,
  });
} else if (existing.dimension !== Number(process.env.EMBED_DIM)) {
  throw new Error(`dimension drift: index=${existing.dimension} env=${process.env.EMBED_DIM}`);
}
```

**Migration** `0004_knowledge.sql`
```sql
documents(id, assistant_id, title, source_uri, mime, sha256, bytes,
          chunk_count, embed_model, embed_dim, status, status_message, created_at)
status in ('pending','chunking','embedding','indexing','ready','failed')
unique (assistant_id, sha256)
-- + version trigger + RLS
```
`embed_model` / `embed_dim` are stored **per document** so a future migration can tell which
documents need re-embedding.

**Routes**

| Route | Behavior |
|---|---|
| `POST /api/rag/upload` | extract → chunk (700 tok, 15 % overlap) → insert row (`chunking`) → `embed()` in batches of 32 (`embedding`) → `index.namespace(ns).upsert()` batches of 50 (`indexing`) → poll → `ready` |
| `GET /api/rag/status` | per-document state for the poller |
| `POST /api/rag/search` | `embed([query])` → `index.namespace(ns).query({ vector, topK, includeMetadata: true })` |
| `POST /api/rag/delete` | delete by `doc_id` metadata filter, then delete the row |
| `POST /api/rag/config` | `rag_enabled`, `top_k`, `min_score`, writes `settings.embed` |
| `GET /api/rag/health` | probe `embed(["ping"])` → `{ ok, model, dim, latencyMs }` |

**Record shape** — `{ id: '<doc_id>:<ord>', values: number[768], metadata: { doc_id, title, ord, source_uri } }`

**Parsers** — `pdf-parse` (pdf), `mammoth` (docx), `marked`/`unified` (md/html), raw (txt);
`gpt-tokenizer` for chunk boundaries.

**Namespace** — `a_<assistant_id>`; one index, many namespaces.

### Agent

**`src/embed.py`** — Python twin of `ui/lib/embed/index.ts`, same contract via `httpx`.
Plus `probe_embed()` at boot: one `"ping"`, assert `len == EMBED_DIM`, abort otherwise.

**`src/tools_knowledge.py`**
```python
@function_tool
async def search_knowledge(query: str) -> str:
    """Search the user's uploaded documents. Use for questions about
    their files, notes, or any topic they have added to the knowledge base."""
```
- `embed([query])` → one vector (LRU-cached on `sha256(query)`)
- Pinecone `index.query(vector=..., top_k=rag.top_k, include_metadata=True, namespace=rag.namespace)`
- drop results below `rag.min_score`
- return `{title, text, score}`; on error return one plain sentence, never a stack trace
- **speak document titles, never IDs**
- `list_sources()` — "what do you have?" answers from `documents`

Tool only attached when `rag.enabled` — otherwise it doesn't exist in the prompt at all.
Combined budget: `~210 ms` for embed + query.

### Tools used in this phase

| Tool | Version | Responsibility here |
|---|---|---|
| **Ollama Cloud `/api/embed`** | API | **all vector generation** (plain `fetch` / `httpx` — no SDK) |
| `@pinecone-database/pinecone` | `^9.2.0` | upsert, query, delete (UI) |
| `pinecone` (Python) | `^10.3` | query from the agent |
| `pdf-parse` | `^2.4.5` | PDF text extraction |
| `mammoth` | `^1.13.0` | DOCX → text |
| `gpt-tokenizer` | `^4.1.2` | token-accurate chunking |
| `httpx` | `^0.28` | agent → Ollama |
| `zod` | `^4.6.7` | upload + query + embed response validation |
| `sonner` | present | upload/progress toasts |

### Acceptance

- [ ] `GET /api/rag/health` returns `{ ok: true, model, dim }` matching `EMBED_DIM`
- [ ] Upload a PDF → reaches `ready`; chunk count equals Pinecone record count
- [ ] Every stored vector is `EMBED_DIM` long (spot-check one record)
- [ ] Ask a question answerable only from that document → correct, source named
- [ ] Irrelevant question → "I don't have that", not a hallucination
- [ ] Same file twice → duplicate rejected, no second set of chunks
- [ ] Ingest into assistant B → assistant A cannot retrieve it (namespace isolation)
- [ ] Delete → no longer retrievable; records gone from Pinecone
- [ ] RAG disabled → `search_knowledge` absent from the prompt (verify tool count)
- [ ] Wrong `EMBED_DIM` → agent refuses to boot with a clear message
- [ ] `401` from Ollama → document `failed` with the plan-gate message; no partial vectors in Pinecone
- [ ] Malformed PDF → `failed` with a readable reason, no crash
- [ ] Playground shows separate embed and query latencies

### Watch items

- **The gate is the first risk.** Validate `/api/embed` before writing the pipeline; a 401 after
  building ingestion is a week lost.
- **Dimension is frozen per index.** `EMBED_DIM` cannot change without a new index and a full
  re-ingest. Assert it in three places: index creation, `embed()`, and agent boot.
- **`truncate: true` always** — `embeddinggemma` / `nomic-embed-text` are 2K context;
  `mxbai-embed-large` is only 512, so it will truncate hard on 700-token chunks.
- **All-or-nothing embedding.** Embed every batch before writing any vector. A half-embedded
  document retrieves nonsense and is invisible in the UI.
- **Eventual consistency** — upserts are not searchable immediately. The `indexing` state and the
  poller are mandatory; claiming "ready" from the upsert response is a bug.
- **Same provider and model on both sides.** A UI/agent mismatch degrades retrieval with no error.
- Chunk size matters more than model choice — keep 700 tok / 15 % overlap; tune only after measuring.


---

# Phase 4 — Memory (Graphiti)

**Size:** ~5–7 days · **Risk:** medium-high (new service, LLM extraction cost) · **Depends on P1**

### Goal

The assistant remembers durable facts about the user across sessions — and the user can see,
correct, and forget them in a graph view. Memory must never add latency to the first word.

### Demo script

1. Say "I'm vegetarian and I live in Dhaka" in a session.
2. Next session, without mentioning it: "suggest dinner" → it accounts for both facts.
3. Open `/memory` → the two facts are nodes with edges and timestamps.
4. Say "actually I moved to Berlin" → the UI shows the Dhaka edge invalidated, Berlin current.
5. Forget the food fact → next session no longer knows it.
6. Stop `memory-service` → session still starts and uses the cached profile.

### Pages

**`/memory`**
- **Profile card**: the denormalized facts the agent actually receives, each editable, with
  refresh age and a "rebuild profile" action
- **Graph explorer**: `neo4j-driver` read-only (or `GET /nodes`) — nodes and relationships,
  click a node for details (type, first seen, last seen, valid until)
- **Search**: semantic search over memories with scores
- **Add fact** manually (creates an episode)
- **Forget** with confirmation; shows what else references the node
- **History diff**: "previously X — now Y" using `invalid_at`

**`/sessions`**
- Session list: start/end, duration, turn count, tools used, citations, memories created
- Detail drawer: summary, tool call log, latency breakdown, source of config (`etag`/`snapshot`)
- Feeds the Phase 5 dashboard; built here because memory reviews need it

### Backend

**`my-agent/memory_service/`** — FastAPI + `graphiti-core` + Neo4j Aura
```python
POST   /episodes        { group_id, name, body, reference_time }  → add_episode
POST   /search          { group_id, query, limit }                → search
GET    /nodes           ?group_id=&q=                             → nodes + edges
DELETE /nodes/{uuid}                                              → forget
POST   /profile/rebuild { group_id }                              → summary → memory_profile
GET    /health
```
- bearer auth (`MEMORY_SERVICE_TOKEN`)
- `build_indices_and_constraints()` on boot
- all operations scoped by `group_id = assistant_id`
- extraction LLM configured via env (one provider key)

**Migration** `0005_memory.sql`
```sql
memory_profile(assistant_id pk, summary text, facts jsonb, refreshed_at)
alter table sessions add summary text, stats jsonb
```

**Bundle** gains `memory: { enabled, group_id, profile }` — the profile is a plain string, so
session start costs **0 ms**.

### Agent

**`src/memory.py`**
- `remember(fact)` → `POST /episodes` (fire-and-forget, never blocks a turn)
- `recall(query)` → `POST /search` (200–400 ms, model-initiated only)
- **session-end hook**: distill one summary → `POST /episodes` → `POST /profile/rebuild`
- profile is injected into instructions verbatim (short, bullet-free, TTS-safe)
- all memory calls wrapped in `wait_for`; failures are silent to the user

### Tools used in this phase

| Tool | Version | Responsibility here |
|---|---|---|
| `graphiti-core` | `^0.31.2` | temporal KG extraction + search |
| Neo4j Aura | free tier | graph storage |
| `neo4j-driver` | `^6.3.2` | read-only graph browsing in the UI |
| `fastapi` + `uvicorn` | `^0.162` / latest | memory service |
| `httpx` | `^0.28` | agent → service |
| Extraction LLM | provider key | entity/relation extraction |

### Acceptance

- [ ] State a durable fact → next session recalls it **without being prompted**
- [ ] Contradict it → old edge invalidated, new one current, both visible with dates
- [ ] `memory_profile` populated after a session; agent got it in the bundle (verify log)
- [ ] Forget a node → gone from recall and from the rebuilt profile
- [ ] `memory-service` down → session starts, profile tier still works
- [ ] Neo4j suspended → recall falls back to profile, no crash
- [ ] No per-turn write: exactly one episode per session (check service logs)
- [ ] First-word latency unchanged vs Phase 3 (measure both)

### Watch items

- **Cost**: Graphiti runs LLM extraction per episode. One episode per session, never per turn.
- **Latency**: never call Graphiti on the voice path. Profile at start, `recall` on demand.
- **Service is the only writer** — the UI's `neo4j-driver` access must be read-only; a manual
  "add fact" goes through `POST /episodes`.
- Neo4j free tier suspends idle instances — the profile cache is what keeps recall alive.
- Distillation quality decides everything: summarize *durable preferences and facts*, not the
  conversation.

---

# Phase 5 — Skills & ship-readiness

**Size:** ~4–6 days · **Risk:** low · **Depends on P1–P4**

### Goal

A SKILL.md library where only the skill's one-line description sits in the prompt, and the body
loads when the model asks for it. Plus the operational surface that makes this usable daily:
backup, restore, dashboards, and consistent states everywhere.

### Demo script

1. Upload a `SKILL.md` → it appears in the library with its description.
2. Install 30 skills → the prompt stays inside budget; the model only sees 30 one-liners.
3. Ask something that matches one skill → the agent reads only that body, then behaves accordingly.
4. Disable the skill → next session it's gone from the menu.
5. Export everything → reset → import → prompts, tools, skills, settings all restored.

### Pages

**`/skills`**
- Library grid: name, description, enabled, size, last modified
- Editor: SKILL.md body with frontmatter validation (`name`, `description` required) + preview
- Upload SKILL.md, or a zip for `skill_files`
- Enable/disable, reorder (order = menu order)
- **Selection simulator**: type a user utterance → shows which skill would be chosen and why
- Budget panel: total menu tokens, largest contributors

**`/sessions`** (extended)
- Dashboard: latency p50/p95, tool calls per session, retrieval hit rate, memories created,
  config source distribution (`etag` / `snapshot`)
- CSV export

**Settings**
- Backup: export JSON (no secrets) / import with diff preview
- Danger zone: reset assistant, delete documents, clear memory, rotate `SECRET_ENCRYPTION_KEY`
- Environment health: Supabase, Pinecone, memory-service, Neo4j reachability with latency

### Backend

**Migration** `0006_skills.sql`
```sql
skills(id, assistant_id, name, description, body, enabled, sort_order)
skill_files(id, skill_id, path, content)
-- + version triggers + RLS
```

**Routes**

| Route | Behavior |
|---|---|
| `POST /api/skills/import` | parse frontmatter → `skills` + `skill_files`; reject missing description |
| `POST /api/skills` | create/update/reorder/toggle |
| `GET /api/backup/export` | all config tables as JSON, secrets excluded |
| `POST /api/backup/import` | validate → transactional restore → version bump |

**Bundle** includes `skills: [{ name, description }]` only. **Bodies never enter the bundle.**

### Agent

**`src/tools_skills.py`**
```python
@function_tool
async def read_skill(name: str, path: str | None = None) -> str:
    """Load the full instructions for a skill. Call this when the user's
    request matches a skill description above."""
```
- skills menu appended to instructions: `- triage: Use when the user reports an incident.`
- body injected into the turn context only when invoked
- guard: total menu tokens > budget → truncate descriptions, warn in the UI

### Tools used in this phase

| Tool | Version | Responsibility here |
|---|---|---|
| existing stack | — | no new runtime deps |
| `streamdown` + `shiki` | present | markdown editing/preview |
| `recharts` (optional) | latest | session dashboard charts |

### Acceptance

- [ ] 30 skills installed → prompt token estimate stays under budget; verify only descriptions are sent
- [ ] Invoke a skill → its body reaches the LLM, and only then
- [ ] Disable → gone from the menu next session
- [ ] Missing `description` on import → rejected with a clear message
- [ ] Export → wipe → import → byte-identical config (excluding secrets)
- [ ] Every page has real loading, empty, error, and offline states
- [ ] Health panel correctly reports a stopped `memory-service`
- [ ] Key rotation re-encrypts and MCP tests still pass

### Watch items

- Progressive disclosure only works if descriptions are **specific**. Add a lint hint in the
  editor: "start with *Use when…*".
- Import must be transactional — a half-restored config is worse than a failed one.
- Don't let the menu silently exceed budget; surface it in the UI before the model degrades.

---

## Phase gates

| Gate | Must be true before the next phase starts |
|---|---|
| **P1 → P2** | A session runs with a DB prompt; `etag` and `snapshot` paths both proven; `/api/token` rejects unauthenticated calls |
| **P2 → P3** | One real MCP server works end-to-end; budget enforcement verified; discovery cached |
| **P3 → P4** | A document is retrievable with a citation; namespace isolation proven with two assistants; `/api/rag/health` green and every stored vector is `EMBED_DIM` wide |
| **P4 → P5** | A fact survives a session boundary; profile tier proven to add 0 ms |
| **P5 → ship** | Export/import round-trips; all four UI states present on every page |

---

## Cross-phase rules

1. **Never break the voice session.** Every phase ends with a working call.
2. **Backend before UI** inside a phase, but both in the same phase.
3. **No silent fallbacks in the UI.** If config came from a snapshot, show it.
4. **Every remote call has a timeout.** No unbounded `await`, anywhere.
5. **Every write bumps `config_version`.** If a table can change agent behavior, it needs the trigger.
6. **Speed to first word is sacred.** Anything slow becomes a tool the model can choose.
7. **Secrets never reach the browser.** `hint` only, decryption server-side.
8. **One embedding model, one width, asserted at boot.** A silent provider or dimension mismatch
   degrades retrieval with no error anywhere — the worst class of bug in this system.
