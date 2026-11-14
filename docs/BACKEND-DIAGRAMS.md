# Backend — Diagram Source

> Hand this file to a diagram generator. Every section contains one Mermaid block that
> renders standalone. Prose exists only to explain what the diagram means.
>
> Sources of truth used to build this file:
> `docs/ARCHITECTURE.md`, `docs/PHASES.md`, `idea.md`,
> `my-agent/src/*.py`, `supabase/migrations/*.sql`,
> `supabase/functions/assistant-config/index.ts`, `ui/app/api/token/route.ts`,
> `ui/lib/actions/assistant.ts`.

---

## 0. Prompt to paste into the diagram generator

````
Read docs/BACKEND-DIAGRAMS.md. Render every ```mermaid block as a separate diagram.
Keep node labels exactly as written. Use the status colours from the legend:
green = implemented, amber = partial, grey dashed = planned only.
Produce the diagrams in the order they appear.
````

### Status legend

| Marker | Meaning |
|---|---|
| ✅ **implemented** | Code exists and runs today |
| 🟡 **partial** | Scaffolded, or implemented without its full contract |
| ⬜ **planned** | Described in the docs, no code yet |

---

## 1. What the backend actually is

Two planes, one runtime:

1. **Control plane (✅ implemented, Phase 1)** — Next.js 15 server routes/server actions in
   `ui/`, a Supabase Postgres database with RLS, and one Edge Function that is the agent's
   only door. It stores the assistant's configuration (prompt versions, model names, voice,
   greeting, flags) and serves it as a JSON *bundle* with an `ETag`.
2. **Runtime plane (✅ blackboard, 🟡 config-assisted)** — a Python 3.11/3.14
   `livekit-agents` worker in LiveKit Cloud. One process per job. It joins a LiveKit room,
   runs STT → LLM → TTS, and exposes eight **blackboard function tools** that broadcast
   structured drawing operations over LiveKit's data channel.

The blackboard is the only feature with a complete end-to-end backend today. The config
plane exists and is queryable, but the agent does **not** yet fetch the bundle
(`my-agent/src/config.py` does not exist), and `/api/token` is still the starter's
unauthenticated dev route.

> Rule that shapes everything: **the agent has no database credentials.** Configuration
> writes can never originate from the runtime plane.

---

## 2. System context

```mermaid
flowchart LR
    subgraph Desktop["User desktop"]
        Browser["Browser<br/>Next.js UI :3000<br/>React 19 · App Router"]
    end

    subgraph Control["Control plane ✅"]
        Next["Next.js server<br/>routes + server actions"]
        DB[("Supabase Postgres<br/>config truth + RLS")]
        Auth["Supabase Auth<br/>JWT / getClaims"]
        Edge["Edge Function<br/>assistant-config<br/>x-agent-key + ETag"]
    end

    subgraph Runtime["Runtime plane"]
        LK["LiveKit Cloud<br/>SFU · room · dispatch"]
        Agent["Agent worker<br/>Python · livekit-agents<br/>one process per job"]
        Board[("In-memory board state<br/>keyed by room name")]
    end

    subgraph External["Remote services"]
        Ollama["Ollama Cloud<br/>/api/embed ⬜"]
        Pinecone[("Pinecone<br/>knowledge index ⬜")]
        MemorySvc["memory-service<br/>FastAPI + Graphiti ⬜"]
        Neo4j[("Neo4j Aura<br/>temporal graph ⬜")]
        MCP["User MCP servers<br/>streamable HTTP ⬜"]
    end

    Browser -->|"HTTPS · session cookie"| Next
    Next -->|"PostgREST · user JWT"| DB
    Next -->|"sign-in / refresh"| Auth
    Next -->|"JWT signing only"| LK
    Browser <-->|"WSS / WebRTC · audio + data topic board"| LK
    LK -->|"dispatch job + metadata"| Agent
    Agent -->|"HTTPS · x-agent-key · If-None-Match"| Edge
    Edge -->|"service role · get_assistant_bundle"| DB
    Agent --- Board
    Agent -.->|"query vectors"| Pinecone
    Agent -.->|"single query vector"| Ollama
    Agent -.->|"recall / remember"| MemorySvc
    Agent -.->|"tools/call"| MCP
    MemorySvc -.->|"Cypher"| Neo4j
    Next -.->|"ingest documents"| Ollama
    Next -.->|"upsert / query"| Pinecone

    classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef partial fill:#fef3c7,stroke:#d97706,color:#78350f
    classDef plan fill:#f1f5f9,stroke:#94a3b8,color:#334155,stroke-dasharray:4 3
    class Browser,Next,DB,Auth,Edge,LK,Agent,Board done
    class Ollama,Pinecone,MemorySvc,Neo4j,MCP plan
```

---

## 3. Backend code map

Where the behaviour in the rest of this document lives.

```mermaid
flowchart TB
    subgraph UI["ui/ — Next.js 15 server + client"]
        Token["app/api/token/route.ts<br/>signs participant JWT 🟡"]
        Middleware["middleware.ts<br/>session refresh"]
        Actions["lib/actions/assistant.ts<br/>server actions"]
        AuthLib["lib/auth.ts<br/>getSessionUser · getAssistantContext"]
        SbServer["lib/supabase/server.ts<br/>createServerClient"]
        SbClient["lib/supabase/client.ts<br/>createBrowserClient"]
        Pages["app/(app)/*<br/>assistant · prompts ✅<br/>tools · skills · knowledge<br/>memory · sessions · settings ⬜"]
        SessionUI["components/app/app.tsx<br/>useSession + TokenSource"]
    end

    subgraph DB["supabase/"]
        M1["migrations/0001_init.sql<br/>tables · triggers · RLS · RPCs"]
        M2["migrations/0002_bundle.sql<br/>get_assistant_bundle()"]
        Fn["functions/assistant-config/index.ts<br/>the agent's only door"]
    end

    subgraph AG["my-agent/ — Python worker"]
        Entry["src/agent.py<br/>rtc_session entrypoint"]
        Tools["src/board_tools.py<br/>8 function tools"]
        State["src/board_state.py<br/>seq · history · publish_data"]
        ConfigPy["src/config.py ⬜<br/>bundle fetch + snapshot"]
        EmbedPy["src/embed.py ⬜"]
        McpPy["src/tools_mcp.py ⬜"]
        KnowPy["src/tools_knowledge.py ⬜"]
        SkillPy["src/tools_skills.py ⬜"]
        MemPy["src/memory.py ⬜"]
        MemSvc["memory_service/ ⬜<br/>FastAPI + Graphiti"]
    end

    Pages --> Actions --> SbServer --> DB
    Pages --> AuthLib --> SbServer
    SessionUI --> Token
    Entry --> Tools --> State
    Entry -.-> ConfigPy
    Entry -.-> McpPy
    Entry -.-> KnowPy
    Entry -.-> SkillPy
    Entry -.-> MemPy
    Entry -.-> EmbedPy
    MemPy -.-> MemSvc
    ConfigPy -.-> Fn

    classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef partial fill:#fef3c7,stroke:#d97706,color:#78350f
    classDef plan fill:#f1f5f9,stroke:#94a3b8,color:#334155,stroke-dasharray:4 3
    class M1,M2,Fn,Entry,Tools,State,AuthLib,SbServer,SbClient,Actions,Middleware done
    class Token,SessionUI,Pages partial
    class ConfigPy,EmbedPy,McpPy,KnowPy,SkillPy,MemPy,MemSvc plan
```

---

## 4. Voice session + blackboard, end to end (✅ agent side · ⬜ canvas renderer)

The single most important flow: a student speaks, the model decides to draw, the drawing
lands on the student's canvas through the same LiveKit room.

> Accuracy note: everything left of the LiveKit publish is implemented. The **Board UI
> consumer** does not exist in `ui/` yet — no `RoomEvent.DataReceived` listener, no reducer,
> no canvas. The wire contract below is what a renderer must implement.

```mermaid
sequenceDiagram
    autonumber
    actor Student
    participant LK as LiveKit Cloud
    participant Agent as Agent worker
    participant LLM as Inference LLM
    participant BS as board_state
    participant UI as Board UI

    Student->>LK: join room with participant JWT
    LK->>Agent: dispatch job · agent_name my-agent
    Agent->>LK: ctx.connect · join room

    rect rgb(240, 249, 255)
    Note over Student,LLM: Turn loop
    Student->>LK: microphone audio
    LK->>Agent: audio track
    Agent->>Agent: ai_coustics noise cancellation
    Agent->>LLM: STT transcript + instructions + tool schema
    LLM-->>Agent: tool_call draw_shape circle 100 200
    Agent->>BS: emit_op room op
    BS->>BS: seq = next counter for room.name
    BS->>BS: append op to room history
    BS->>LK: publish_data topic board reliable
    LK-->>UI: {type: op, op: {...}}
    UI->>UI: reducer appends operation
    UI->>UI: render shape on canvas
    Agent-->>LLM: tool result "Drew a circle at (100, 200) (item 1)"
    LLM-->>Agent: spoken confirmation
    Agent->>LK: TTS audio
    LK-->>Student: agent voice
    end

    rect rgb(248, 250, 252)
    Note over Agent,UI: Late joiner / reconnect
    LK->>Agent: participant_connected
    Agent->>BS: get_snapshot room.name
    BS-->>Agent: copy of visible ops
    Agent->>LK: publish_data topic board to one identity
    LK-->>UI: {type: snapshot, ops: [...]}
    UI->>UI: replace local board with snapshot
    end
```

### Why it is shaped this way

- **The room is the session.** No second socket, no MCP server, no external store.
  `room.name` is the only key.
- **State lives in the worker process**, so it dies with the job. That is acceptable
  because a job *is* the conversation.
- **`reliable: true`** on every publish, so a dropped op cannot silently desync the canvas.
- **The snapshot is targeted** (`destination_identities`) — one participant, not a broadcast.
- **The clear op is broadcast but not persisted**, so a replayed snapshot can never
  resurrect a cleared board.

---

## 5. Blackboard message contract

Two message types, both JSON, both on topic `board`.

```mermaid
stateDiagram-v2
    [*] --> Empty
    Empty --> Drawing: op kind shape / line / text / latex / graph / geometry
    Drawing --> Drawing: op kind highlight
    Drawing --> Empty: op kind clear (history reset, seq reset to 1)
    Drawing --> Replaying: participant_connected
    Replaying --> Drawing: snapshot delivered
    note right of Drawing
        Every op carries a seq assigned by
        board_state.emit_op, never by the tool.
    end note
```

```mermaid
flowchart LR
    subgraph Live["Live traffic"]
        OP["{ type: 'op', op: BoardOp }"]
    end
    subgraph Join["Join / reconnect"]
        SNAP["{ type: 'snapshot', ops: BoardOp[] }"]
    end
    OP --> Reducer
    SNAP --> Reducer
    Reducer -->|"op, not clear"| Append["ops = [...ops, op]"]
    Reducer -->|"op, clear"| Reset["ops = [] · seq counter reset"]
    Reducer -->|"snapshot"| Replace["ops = message.ops"]
    Append --> Canvas["Canvas render"]
    Reset --> Canvas
    Replace --> Canvas
```

### Operation vocabulary (fixed, 8 kinds)

| `kind` | Emitted by | Payload fields |
|---|---|---|
| `shape` | `draw_shape` | `shape` circle/rect/triangle, `position` [x,y], `size`, `color` |
| `line` | `draw_line` | `from_` [x,y], `to` [x,y], `color` |
| `text` | `write_text` | `content`, `position` [x,y], `fontSize` |
| `latex` | `write_equation` | `content` (LaTeX), `position` [x,y] |
| `graph` | `plot_function` | `expr`, `domain` [x_min,x_max], optional `template` |
| `geometry` | `draw_labeled_geometry` | `pack`, `shape_id`, `position` [x,y], `size` |
| `highlight` | `highlight` | `targetSeq`, `color` |
| `clear` | `clear_board` | none — resets history and sequence counter |

Canvas coordinate space is roughly **0–800 x, 0–600 y**. Tool results are deliberately
short human sentences (e.g. `Drew a white circle at (100, 200) (item 1)`) so the LLM can
speak the outcome and later reference `item N` when calling `highlight`.

`geometry` packs: `geometry`, `algebra`, `statistics`, `physics`, `biology`, `chemistry`.
Unknown shape or pack raises `ToolError` inside the tool — the model sees a failure, the
session survives.

---

## 6. Session start — what runs today vs what the docs require

### 6.1 Today (🟡 partial)

```mermaid
sequenceDiagram
    autonumber
    participant UI as Browser
    participant Next as Next /api/token
    participant LK as LiveKit Cloud
    participant Agent as Agent worker

    UI->>Next: POST /api/token
    Next->>Next: NODE_ENV must be development<br/>or IS_VERCEL_PREVIEW
    Next->>Next: read LIVEKIT_URL · API_KEY · API_SECRET
    Next->>Next: AccessToken 15m TTL<br/>roomJoin · canPublish · canPublishData · canSubscribe
    Next->>Next: random room voice_assistant_room_N<br/>random identity voice_assistant_user_N
    Next-->>UI: serverUrl · roomName · participantToken
    UI->>LK: WebRTC connect
    LK->>Agent: dispatch job
    Agent->>Agent: build Assistant + AgentSession
    Agent->>LK: join room
    LK-->>UI: agent audio
    Note over Next: No Supabase session check.<br/>No assistant ownership check.<br/>No dispatch metadata.
```

### 6.2 Target (⬜ per ARCHITECTURE §5)

```mermaid
sequenceDiagram
    autonumber
    participant UI as Browser
    participant Next as Next /api/token
    participant SB as Supabase
    participant LK as LiveKit Cloud
    participant Agent as Agent worker
    participant Edge as Edge Function

    UI->>Next: POST /api/token · assistant_id
    Next->>SB: getClaims · verify session
    Next->>SB: select 1 from assistants<br/>where id = assistant_id and owner_id = auth.uid()
    alt not authenticated
        Next-->>UI: 401
    else not owner
        Next-->>UI: 403
    else owner
        Next->>Next: sign JWT + dispatch metadata a u v
        Next-->>UI: participantToken
    end
    UI->>LK: WebRTC connect
    LK->>Agent: dispatch job + metadata
    Agent->>Agent: validate metadata UUID + range
    par fetch config
        Agent->>Edge: GET assistant_id · x-agent-key · If-None-Match
        Edge->>SB: rpc get_assistant_bundle service role
        SB-->>Edge: jsonb bundle
        Edge-->>Agent: 200 + ETag or 304
    and connect room
        Agent->>LK: ctx.connect
    end
    Agent->>Agent: build Assistant + AgentSession from bundle
    LK-->>UI: agent audio
```

### 6.3 Config resolution fallback chain (⬜ agent side)

```mermaid
flowchart LR
    Start["Session start"] --> Memo{"job memo hit?"}
    Memo -->|yes| Use["Use bundle"]
    Memo -->|no| Edge{"Edge Function<br/>ETag fetch · 1.5 s cap"}
    Edge -->|200 or 304| Use
    Edge -->|error / timeout| Snap{"config_snapshot.json<br/>baked into image?"}
    Snap -->|yes| Use
    Snap -->|no| Apology["Speak a degraded-mode apology<br/>session still starts"]
    Use --> Build["Build agent + start session"]

    classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef plan fill:#f1f5f9,stroke:#94a3b8,color:#334155,stroke-dasharray:4 3
    class Start,Build done
    class Memo,Edge,Snap,Apology,Use plan
```

---

## 7. Config plane — read path (✅ Edge Function, ⬜ agent caller)

The agent never touches Postgres. It presents one shared key to one endpoint.

```mermaid
sequenceDiagram
    autonumber
    participant Agent as Agent worker
    participant Fn as Edge Function assistant-config
    participant DB as Postgres

    Agent->>Fn: GET ?assistant_id=uuid<br/>x-agent-key · If-None-Match W/"42"
    Fn->>Fn: timing-safe compare x-agent-key
    alt key invalid or missing
        Fn-->>Agent: 401 unauthorized
    end
    Fn->>Fn: validate UUID shape
    alt malformed
        Fn-->>Agent: 400 invalid_assistant_id
    end
    Fn->>DB: rpc get_assistant_bundle(p_assistant_id)<br/>service role
    DB-->>Fn: jsonb bundle with version
    alt no row
        Fn-->>Agent: 404 not_found
    end
    alt If-None-Match equals W/"version"
        Fn-->>Agent: 304 · Cache-Control no-store
    else changed
        Fn-->>Agent: 200 · body · ETag W/"version" · no-store
    end
    Note over Fn: One structured log line per request:<br/>assistant_id · version · hit or miss · ms
```

### Bundle contract returned by `get_assistant_bundle()`

```jsonc
{
  "version": 42,
  "assistant": { "id": "…", "name": "…" },
  "prompt": "You are a personal voice assistant…",
  "greeting": "Hey, I am ready when you are.",
  "llm": { "provider": "livekit-inference", "model": "google/gemma-4-31b-it", "temperature": 0.7 },
  "stt": { "model": "assemblyai/universal-3-5-pro", "language": "en" },
  "tts": { "model": "fishaudio/s2.1-pro", "voice": "fa4c9eb3…" },
  "expressive": true,
  "settings": {},
  "rag": { "enabled": false },
  "mcp": [],
  "skills": [],
  "memory": { "enabled": false }
}
```

`version` is the ETag source. `rag`, `mcp`, `skills`, `memory` are forward-compatible slots
read out of `assistant_config.settings`; they are empty until Phase 2–5.

---

## 8. Config plane — write path (✅ implemented)

Editing a prompt is the reference mutation. Note that **Activate and Rollback are the same
call**: point `active_version_id` at an existing version.

```mermaid
flowchart TD
    Form["UI form · /prompts"] --> Action["server action<br/>savePromptAction"]
    Action --> RPC["rpc save_prompt_version<br/>prompt_id · content · activate"]
    RPC --> Check{"content empty?"}
    Check -->|yes| Err["return error · form preserved"]
    Check -->|no| Last["find max version"]
    Last --> Reuse{"trailing row is draft?"}
    Reuse -->|yes| Update["update that draft content"]
    Reuse -->|no| Insert["insert version = max + 1<br/>status draft"]
    Update --> ActQ
    Insert --> ActQ
    ActQ{"activate?"}
    ActQ -->|no| DraftDone["draft saved"]
    ActQ -->|yes| Activate["rpc activate_prompt_version"]
    Activate --> Archive["archive previous active<br/>partial unique index allows one"]
    Archive --> SetActive["set new version active"]
    SetActive --> Point["prompts.active_version_id<br/>assistant_config.active_prompt_id"]
    Point --> Trigger["trigger bump_config_version<br/>on prompt_versions"]
    Trigger --> Bump["assistant_config.config_version + 1"]
    Bump --> Next["next session: ETag miss<br/>rehydrate bundle"]
    DraftDone --> Trigger
    Err --> Form
    Next --> Form
```

Three database guarantees behind it:

1. `prompt_versions` rows are **immutable in content once active** — rollback never rewrites text.
2. `prompt_versions_one_active_idx` is a partial unique index, so two active versions cannot exist.
3. `bump_config_version()` is attached to `prompts` and `prompt_versions`, so any change
   increments the single monotonic counter the agent compares.

Other server actions on the same pattern: `provisionAssistantAction` (first-run RPC that
creates assistant + config + prompt v1), `updateAssistantNameAction`,
`updateAssistantConfigAction` (model/voice/greeting; the row's own `BEFORE UPDATE` trigger
bumps the version).

---

## 9. Data model

### 9.1 Implemented tables (✅)

```mermaid
erDiagram
    USERS ||--o{ ASSISTANTS : owns
    ASSISTANTS ||--|| ASSISTANT_CONFIG : "has one"
    ASSISTANTS ||--o{ PROMPTS : has
    PROMPTS ||--o{ PROMPT_VERSIONS : "version history"
    PROMPT_VERSIONS ||--o| PROMPTS : "active_version_id"
    ASSISTANTS ||--o{ SESSIONS : logs

    USERS {
        uuid id PK
        text email
        timestamptz created_at
    }
    ASSISTANTS {
        uuid id PK
        uuid owner_id FK
        text name
        timestamptz created_at
        timestamptz updated_at
    }
    ASSISTANT_CONFIG {
        uuid assistant_id PK
        int config_version
        text greeting
        text llm_provider
        text llm_model
        numeric temperature
        text stt_model
        text stt_language
        text tts_model
        text tts_voice
        boolean expressive
        uuid active_prompt_id FK
        jsonb settings
        timestamptz updated_at
    }
    PROMPTS {
        uuid id PK
        uuid assistant_id FK
        text name
        uuid active_version_id FK
    }
    PROMPT_VERSIONS {
        uuid id PK
        uuid prompt_id FK
        uuid assistant_id FK
        int version
        text content
        text status
        uuid created_by FK
        timestamptz created_at
    }
    SESSIONS {
        uuid id PK
        uuid assistant_id FK
        text room_name
        int config_version
        text config_source
        timestamptz started_at
        timestamptz ended_at
        jsonb stats
    }
```

Notes that matter for a reader of the diagram:

- `SESSIONS.config_source` is constrained to `memo | etag | snapshot` — it records which
  hydration path a session actually used.
- `prompt_versions.status` is `draft | active | archived`.
- Every child table inherits ownership through `assistant_id`; `is_assistant_owner()` is the
  RLS predicate. There is no `owner_id` duplication except on `assistants`.

### 9.2 Planned tables (⬜ Phase 2–5)

```mermaid
erDiagram
    ASSISTANTS ||--o{ MCP_SERVERS : registers
    ASSISTANTS ||--o{ TOOLS : enables
    ASSISTANTS ||--o{ SECRETS : stores
    ASSISTANTS ||--o{ DOCUMENTS : uploads
    ASSISTANTS ||--o{ SKILLS : installs
    ASSISTANTS ||--|| MEMORY_PROFILE : caches
    MCP_SERVERS ||--o{ MCP_TOOLS : discovers
    SKILLS ||--o{ SKILL_FILES : bundles

    MCP_SERVERS {
        uuid id PK
        uuid assistant_id FK
        text name
        text url
        text transport
        text auth_type
        text auth_header
        uuid secret_id FK
        boolean enabled
        text status
        timestamptz last_discovered_at
    }
    MCP_TOOLS {
        uuid id PK
        uuid mcp_server_id FK
        text name
        text description
        jsonb input_schema
        boolean enabled
    }
    TOOLS {
        uuid id PK
        uuid assistant_id FK
        text kind
        text name
        boolean enabled
    }
    SECRETS {
        uuid id PK
        uuid assistant_id FK
        text name
        bytea ciphertext
        text hint
    }
    DOCUMENTS {
        uuid id PK
        uuid assistant_id FK
        text title
        text sha256
        int chunk_count
        text embed_model
        int embed_dim
        text status
    }
    SKILLS {
        uuid id PK
        uuid assistant_id FK
        text name
        text description
        text body
        boolean enabled
        int sort_order
    }
    SKILL_FILES {
        uuid id PK
        uuid skill_id FK
        text path
        text content
    }
    MEMORY_PROFILE {
        uuid assistant_id PK
        text summary
        jsonb facts
        timestamptz refreshed_at
    }
```

---

## 10. Ingest and memory pipelines (⬜ planned, Phase 3–4)

```mermaid
flowchart LR
    subgraph Ingest["Document ingestion · Phase 3"]
        Up["Upload<br/>pdf · docx · md · html · txt"] --> Extract["Extract text"]
        Extract --> Chunk["Chunk 700 tok<br/>15 percent overlap"]
        Chunk --> Embed["Ollama /api/embed<br/>batches of 32 · truncate true"]
        Embed --> Upsert["Pinecone upsert<br/>batches of 50"]
        Upsert --> Poll["Poll until searchable"]
        Poll --> Ready["documents.status = ready"]
        Embed -->|"any batch fails"| Failed["status = failed<br/>nothing written"]
    end

    subgraph States["Document status"]
        P["pending"] --> C["chunking"] --> E["embedding"] --> I["indexing"] --> R["ready"]
        E --> F["failed"]
        I --> F
    end

    subgraph Recall["Query path"]
        Q["search_knowledge query"] --> QE["embed one vector<br/>LRU on sha256 query"]
        QE --> PQ["Pinecone query<br/>namespace a_assistant_id"]
        PQ --> Drop["drop below min_score"]
        Drop --> Cite["return title · text · score"]
    end

    subgraph Memory["Memory · Phase 4"]
        SessEnd["Session ends"] --> Distill["Distill one summary"]
        Distill --> Episode["POST /episodes"]
        Episode --> Graphiti["Graphiti LLM extraction"]
        Graphiti --> Neo["Neo4j nodes and edges"]
        Episode --> Rebuild["POST /profile/rebuild"]
        Rebuild --> Profile["memory_profile<br/>injected into bundle at 0 ms"]
        RecallM["recall query"] --> Search["POST /search<br/>200 to 400 ms"]
    end

    classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef plan fill:#f1f5f9,stroke:#94a3b8,color:#334155,stroke-dasharray:4 3
    class Up,Extract,Chunk,Embed,Upsert,Poll,Ready,Failed,P,C,E,I,R,F,Q,QE,PQ,Drop,Cite,SessEnd,Distill,Episode,Graphiti,Neo,Rebuild,Profile,RecallM,Search plan
```

Two invariants worth drawing explicitly:

- **All-or-nothing embedding.** Every chunk of a document is embedded before any vector is
  written. A half-embedded document is invisible garbage that retrieves random chunks.
- **One embedding model, one width.** `EMBED_DIM` must equal the Pinecone index dimension.
  The agent probes `/api/embed` at boot and refuses to start on disagreement.

---

## 11. Deployment topology

```mermaid
flowchart TB
    subgraph UserMachine["Owner's machine (not publicly reachable)"]
        DevNext["next dev · localhost:3000"]
        ProdNext["next start · localhost:3000"]
        LocalWorker["uv run src/agent.py dev<br/>local dev worker 🟡"]
    end

    subgraph Cloud["Managed cloud"]
        Supa["Supabase project<br/>Postgres · Auth · Edge Functions"]
        LKc["LiveKit Cloud<br/>rooms · dispatch"]
        Pine["Pinecone index<br/>assistant-knowledge"]
    end

    subgraph Containers["Extra containers"]
        MemSvc["memory-service<br/>Fly or Render ⬜"]
        Aura[("Neo4j Aura Free ⬜")]
    end

    subgraph AgentImage["Agent image (Docker)"]
        Docker["uv sync locked<br/>download-files<br/>uv run src/agent.py start"]
    end

    DevNext --> Supa
    DevNext --> LKc
    ProdNext --> Supa
    ProdNext --> LKc
    ProdNext --> Pine
    DevNext --> Pine
    LocalWorker --> LKc
    Docker --> LKc
    Docker --> Supa
    Docker --> Pine
    Docker -.-> MemSvc
    MemSvc -.-> Aura
    ProdNext -.-> MemSvc

    classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef partial fill:#fef3c7,stroke:#d97706,color:#78350f
    classDef plan fill:#f1f5f9,stroke:#94a3b8,color:#334155,stroke-dasharray:4 3
    class DevNext,ProdNext,Supa,LKc,Docker done
    class LocalWorker partial
    class Pine,MemSvc,Aura plan
```

Hard constraint: **the agent must run somewhere publicly reachable** (LiveKit Cloud or a
container). A laptop worker cannot receive jobs for a cloud room. The UI never needs to be
reachable from the internet — it only makes outbound calls.

---

## 12. Phase roadmap

```mermaid
flowchart LR
    P1["Phase 1 · Config plane ✅<br/>DB-driven prompt · models · voice<br/>prompt versions + rollback<br/>bundle + ETag + RLS"]
    P2["Phase 2 · Tools and MCP ⬜<br/>add server · discover tools<br/>allowed_tools budget"]
    P3["Phase 3 · Knowledge ⬜<br/>upload · chunk · embed<br/>Pinecone search + citations"]
    P4["Phase 4 · Memory ⬜<br/>Graphiti episodes<br/>profile tier at 0 ms"]
    P5["Phase 5 · Skills and ship ⬜<br/>SKILL.md progressive disclosure<br/>backup · restore · dashboards"]

    P1 --> P2 --> P3 --> P4 --> P5

    P1 -.- G1["Gate<br/>session runs on DB prompt<br/>etag and snapshot proven"]
    P2 -.- G2["Gate<br/>one real MCP server works<br/>budget enforced"]
    P3 -.- G3["Gate<br/>citation from a document<br/>namespace isolation proven"]
    P4 -.- G4["Gate<br/>fact survives a session<br/>profile adds 0 ms"]

    classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef plan fill:#f1f5f9,stroke:#94a3b8,color:#334155,stroke-dasharray:4 3
    class P1 done
    class P2,P3,P4,P5 plan
    class G1,G2,G3,G4 plan
```

> Current reality check: Phase 1's **schema, triggers, RLS, RPCs, Edge Function and UI CRUD
> are done**; the **agent-side consumer** (`src/config.py`, bundle fetch, snapshot fallback)
> is not. The blackboard was built ahead of the phase plan and is fully working.

---

## 13. Failure and degradation map

Principle: **a degraded session always beats a failed session.** Every remote call on the
hot path has a timeout and a fallback.

```mermaid
flowchart TD
    S["Session running"] --> F1{"Edge Function down?"}
    F1 -->|yes| R1["Snapshot fallback<br/>session works · warning logged"]
    F1 -->|no| F2{"MCP server unreachable?"}
    F2 -->|yes| R2["Drop that server for the session<br/>agent says it once"]
    F2 -->|no| F3{"MCP tool throws?"}
    F3 -->|yes| R3["Error string returned to LLM<br/>session survives"]
    F3 -->|no| F4{"Pinecone down?"}
    F4 -->|yes| R4["Retrieval returns empty + reason<br/>I can't reach the knowledge base"]
    F4 -->|no| F5{"Ollama embed 401 or timeout?"}
    F5 -->|yes| R5["RAG marked unavailable<br/>other tools unaffected"]
    F5 -->|no| F6{"EMBED_DIM mismatch?"}
    F6 -->|yes| R6["Refuse to start<br/>fail fast · never write wrong-width vectors"]
    F6 -->|no| F7{"memory-service down?"}
    F7 -->|yes| R7["Use cached memory_profile"]
    F7 -->|no| F8{"LiveKit disconnect?"}
    F8 -->|yes| R8["Reconnect overlay<br/>agent resumes in same room"]
    F8 -->|no| F9{"Model provider error?"}
    F9 -->|yes| R9["Sorry, say that again<br/>retry next turn"]
    F9 -->|no| OK["Normal turn"]

    classDef ok fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef warn fill:#fef3c7,stroke:#d97706,color:#78350f
    class OK ok
    class R1,R2,R3,R4,R5,R6,R7,R8,R9 warn
```

Blackboard-specific failures (implemented behaviour):

| Failure | Effect |
|---|---|
| Unknown `shape` value | `ToolError` raised; model told valid values; nothing published |
| Unknown `geometry` pack | `ToolError` raised; nothing published |
| `highlight` with an out-of-range seq | Op is still emitted; the renderer has no target and draws nothing |
| Participant joins before the agent | After `ctx.connect()`, the worker replays a snapshot to every participant already in the room |
| Clear board | History array reset **and** sequence counter reset to 1, so later snapshots contain only visible ops |

---

## 14. Security boundaries

```mermaid
flowchart TB
    B["Browser · untrusted input<br/>forms · metadata echo"] -->|"session cookie"| N["Next server · trusted<br/>holds Pinecone + memory keys<br/>NOT the service role"]
    N -->|"user JWT · RLS owner_id = auth.uid()"| S["Supabase<br/>service role only inside Edge Functions"]
    S -->|"x-agent-key · one read endpoint"| A["Agent worker · trusted code<br/>untrusted inputs: speech · MCP output · job metadata"]

    N -.->|"forbidden"| X1["browser direct to Pinecone"]
    A -.->|"forbidden"| X2["agent to Postgres"]
    A -.->|"forbidden"| X3["agent to UI"]

    classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef bad fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    class B,N,S,A done
    class X1,X2,X3 bad
```

| Threat | Control |
|---|---|
| Anyone mints a token and burns LiveKit minutes | `/api/token` must require a session and verify assistant ownership (⬜ not yet wired) |
| Browser reads another assistant's config | RLS `owner_id = auth.uid()` on every table |
| MCP keys visible in DevTools | `pgp_sym_encrypt` at rest; only `hint` readable |
| Agent compromised gives full DB access | Agent has no DB credentials, only one read endpoint |
| Metadata spoofing | Validated shape + ownership re-check inside the bundle function |
| RAG cross-contamination | Pinecone namespace per assistant `a_<assistant_id>` |
| Memory cross-contamination | Graphiti `group_id` per assistant |
| Prompt injection via MCP output | MCP results framed as data, never instructions |

---

## 15. Environment surface

```mermaid
flowchart LR
    subgraph Shared["Shared by UI and agent — must agree"]
        E1["EMBED_PROVIDER"]
        E2["OLLAMA_BASE_URL"]
        E3["OLLAMA_API_KEY"]
        E4["EMBED_MODEL"]
        E5["EMBED_DIM"]
    end

    subgraph UIE["ui/.env.local"]
        U1["NEXT_PUBLIC_SUPABASE_URL"]
        U2["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
        U3["LIVEKIT_URL · API_KEY · API_SECRET"]
        U4["AGENT_NAME"]
        U5["PINECONE_API_KEY · PINECONE_INDEX"]
        U6["MEMORY_SERVICE_URL · TOKEN"]
    end

    subgraph FnE["Edge Function secrets"]
        F1["AGENT_API_KEY"]
        F2["SECRET_ENCRYPTION_KEY"]
    end

    subgraph AgentE["my-agent/.env.local"]
        A1["AGENT_CONFIG_URL"]
        A2["AGENT_API_KEY"]
        A3["LIVEKIT_URL · API_KEY · API_SECRET"]
        A4["PINECONE_API_KEY"]
        A5["MEMORY_SERVICE_URL · TOKEN"]
    end

    Shared --> UIE
    Shared --> AgentE
    UIE -->|"x-agent-key shared"| FnE
    FnE -->|"same value"| AgentE

    classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef plan fill:#f1f5f9,stroke:#94a3b8,color:#334155,stroke-dasharray:4 3
    class E1,E2,E3,E4,E5,U1,U2,U3,U4,F1,A1,A2,A3 done
    class U5,U6,F2,A4,A5 plan
```

`EMBED_MODEL` / `EMBED_DIM` deliberately appear in two places. The guard: the agent
compares them against `rag.embed` in the bundle and aborts on disagreement, because a silent
dimension mismatch produces writes that succeed and retrieval that returns nonsense.

---

## 16. One-glance summary table

| Layer | Component | Implemented | Talks to |
|---|---|---|---|
| Presentation | Next.js UI, React 19 | ✅ assistant + prompts, ⬜ rest | Next server, LiveKit (WebRTC) |
| Control | Next server actions | ✅ | Supabase PostgREST |
| Control | Supabase tables + RLS + triggers | ✅ | — |
| Control | `get_assistant_bundle()` | ✅ | Edge Function |
| Control | Edge Function `assistant-config` | ✅ | Postgres (service role), agent |
| Runtime | Agent worker (`src/agent.py`) | ✅ | LiveKit, LLM/STT/TTS inference |
| Runtime | Blackboard tools + state | ✅ | LiveKit data channel |
| Runtime | Config hydration (`src/config.py`) | ⬜ | Edge Function, snapshot |
| Runtime | RAG (`search_knowledge`) | ⬜ | Ollama, Pinecone |
| Runtime | Memory (`recall` / session-end) | ⬜ | memory-service |
| Runtime | MCP toolset | ⬜ | MCP servers |
| Runtime | Skills progressive disclosure | ⬜ | Postgres via bundle |

---

*Generated from the repository on 2026-11-14. If a section disagrees with the code, the
code wins — update this file.*
