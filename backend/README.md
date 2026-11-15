# FastAPI Control Plane Backend

A high-performance, asynchronous REST backend for the LiveKit Voice Assistant Control Plane, built with **FastAPI**, **SQLAlchemy**, **FastMCP**, and **LiveKit Server SDK**.

Deployable to **Vercel Serverless** or runnable locally as a standalone service with `uvicorn` / `uv`.

---

## 🌟 Key Features

- **Decoupled Architecture**: Separated from Next.js to eliminate heavy compilation overhead, Edge middleware bottlenecks, and high CPU usage.
- **Connection String Flexibility (`DATABASE_URL`)**:
  - Works with **any PostgreSQL provider**: Supabase, Neon, Railway, Tembo, AWS RDS, or local PostgreSQL.
  - Automatic zero-config fallback to **SQLite (`sqlite:///./blackboard.db`)** if `DATABASE_URL` is omitted.
  - Automatic schema creation on startup (`Base.metadata.create_all`).
- **FastMCP Integration**: Connects to Model Context Protocol (MCP) servers via FastMCP Client for tool discovery, capability testing, and runtime execution.
- **LiveKit Room & Token Management**: Issues signed JWT participant tokens with video grants and attaches assistant agent dispatch metadata.
- **Customizable Appearance**: Stores button accent colors (`#38bdf8`, `#10b981`, etc.) and typography font preferences (`CommitMono`, `Inter`, `Geist`, etc.).
- **Vercel Deployable**: Includes `api/index.py` and `vercel.json` for one-click Vercel Python serverless deployment.

---

## 🚀 Quick Start

### 1. Requirements & Setup with `uv`

Ensure you have `uv` installed, or use standard Python 3.10+:

```bash
# Clone and navigate to backend directory
cd backend

# Install dependencies using uv
uv pip install -r requirements.txt
```

### 2. Configuration (`.env`)

Create or edit `backend/.env`:

```env
# Database Connection String (optional - defaults to local SQLite if empty)
# Supabase: postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
# Neon:     postgresql://USER:PASSWORD@ep-proj.us-east-2.aws.neon.tech/neondb?sslmode=require
DATABASE_URL=

# LiveKit Credentials
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
AGENT_NAME=my-agent

# Optional RAG Vector Store
PINECONE_API_KEY=
PINECONE_INDEX=
OPENAI_API_KEY=
```

### 3. Run Locally

```bash
# Run with uvicorn via uv
uv run uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.  
Interactive OpenAPI / Swagger docs are at **`http://localhost:8000/docs`**.

---

## 📡 API Endpoints Reference

All endpoints are prefixed with `/api`.

### 1. LiveKit Voice Session (`/api/token`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/token` | Generates a signed LiveKit participant token with room grants (`join`, `publish`, `subscribe`). Automatically binds the active assistant dispatch metadata if configured. |

**Request Body** (optional):
```json
{
  "assistant_id": "optional-uuid"
}
```

**Response (`200 OK`)**:
```json
{
  "serverUrl": "wss://real-eastate-liu6mkir.livekit.cloud",
  "roomName": "assistant_f1437ff2_k92lx8",
  "participantName": "user",
  "participantToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

### 2. Assistant & Configuration (`/api/assistant`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/assistant` | Retrieves the primary assistant record and configuration. Auto-creates default if none exists. |
| `PUT` | `/api/assistant` | Updates assistant properties (name). |
| `GET` | `/api/assistant/config` | Retrieves current assistant settings, prompt, voice, model parameters, accent color, and font. |
| `PUT` | `/api/assistant/config` | Updates configuration, font, button accent color, and auto-increments `config_version`. |

**Request Body (`PUT /api/assistant/config`)**:
```json
{
  "system_prompt": "You are an encouraging AI voice tutor.",
  "voice": "alloy",
  "temperature": 0.7,
  "turn_detection": "server_vad",
  "font": "CommitMono",
  "accent_color": "#38bdf8",
  "settings": {
    "speed": 1.0
  }
}
```

---

### 3. Prompts Revision Workbench (`/api/prompts`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/prompts` | Lists all prompt revisions. |
| `POST` | `/api/prompts` | Creates a new prompt revision. If marked `is_active: true`, synchronizes the assistant's active prompt. |
| `PUT` | `/api/prompts/{prompt_id}` | Updates an existing prompt or activates it. |

---

### 4. Tools & Built-ins (`/api/tools`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tools` | Lists all enabled and available tools (including built-ins: `search_knowledge`, `recall`, `read_skill`). |
| `POST` | `/api/tools` | Creates a new custom tool or toggles an existing tool (`{ "name": "recall", "enabled": false }`). |
| `PUT` | `/api/tools/{id}` | Updates tool metadata or schema. |
| `DELETE` | `/api/tools/{id}` | Deletes a custom tool. |

---

### 5. FastMCP Server Discovery & Tools (`/api/mcp`)

Powered by **FastMCP Client** for robust MCP standard compliance.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/mcp/servers` | Lists configured MCP servers with discovered tool counts. |
| `POST` | `/api/mcp/servers` | Registers a new external MCP server (`url`, `transport`, `headers`). |
| `DELETE` | `/api/mcp/servers/{id}` | Unregisters an MCP server and removes its associated cached tools. |
| `POST` | `/api/mcp/discover` | Uses **FastMCP** to connect to an MCP server, query its tool catalog, and persist tool schemas. |
| `POST` | `/api/mcp/test` | Uses **FastMCP** to test connectivity, measure response latency, and return server capabilities. |
| `GET` | `/api/mcp/tools` | Lists all discovered MCP tools across servers. |
| `POST` | `/api/mcp/tools` | Toggles an individual MCP tool on or off. |

**Request Body (`POST /api/mcp/discover`)**:
```json
{
  "server_id": "server-uuid-or-empty-for-all",
  "url": "http://localhost:8001/sse"
}
```

---

### 6. Knowledge / Vector RAG (`/api/rag`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/rag/status` | Returns index status, document count, and Pinecone vector store readiness. |
| `GET` | `/api/rag/documents` | Lists indexed knowledge documents with chunk counts and statuses. |
| `POST` | `/api/rag/upload` | Ingests documents (via JSON payload or multipart file upload). Chunks and indexes text. |
| `POST` | `/api/rag/search` | Performs semantic search against documents or vector embeddings. |
| `DELETE` | `/api/rag/documents/{id}` | Deletes a document from the knowledge base. |
| `GET` | `/api/rag/config` | Retrieves RAG chunking and vector store settings. |
| `POST` | `/api/rag/config` | Updates RAG settings. |
| `GET` | `/api/rag/health` | Verifies RAG pipeline health. |

---

### 7. Memory Profile & Sessions (`/api/memory`, `/api/sessions`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/memory/profile` | Retrieves user profile memory (extracted facts, preferences, summary). |
| `PUT` | `/api/memory/profile` | Updates facts and user preferences. |
| `GET` | `/api/memory/episodes` | Retrieves conversation memory episodes and logs. |
| `POST` | `/api/memory/episodes` | Logs a new memory episode. |
| `GET` | `/api/sessions` | Lists previous voice session history with start/end times and summaries. |
| `POST` | `/api/sessions` | Logs a new voice session. |
| `PUT` | `/api/sessions/{id}` | Concludes a session and writes duration and conversation summary. |

---

### 8. Skills Workbench (`/api/skills`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/skills` | Lists all skills with priority sorting. |
| `POST` | `/api/skills` | Creates a new skill or reorders skills (`action: "reorder"`). |
| `PUT` | `/api/skills/{id}` | Updates skill name, instructions, or toggle status. |
| `DELETE` | `/api/skills/{id}` | Deletes a skill. |
| `POST` | `/api/skills/import` | Imports Markdown `SKILL.md` files (with YAML frontmatter) or JSON skill bundles. |
| `GET` | `/api/skills/export` | Exports all skills as a portable JSON bundle. |

---

### 9. System Diagnostics (`/api/health`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Probes system health: Database connectivity, LiveKit credentials, RAG vector store, and Memory service. |

**Response (`200 OK`)**:
```json
{
  "status": "healthy",
  "timestamp": "2026-11-14T12:35:00.000000",
  "database": "connected (sqlite)",
  "livekit": "configured",
  "rag": "ready",
  "memory": "active"
}
```

---

## ☁️ Deploying to Vercel

The backend includes native support for Vercel Serverless Functions:

1. **`backend/api/index.py`**: Exports the ASGI `app` instance.
2. **`backend/vercel.json`**:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/index.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "api/index.py"
    }
  ]
}
```

To deploy:
```bash
cd backend
vercel deploy
```

In the Vercel Project Dashboard, set:
- `DATABASE_URL`: Your hosted PostgreSQL connection string (Supabase, Neon, Railway, etc.).
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

---

## 🔗 Connecting with Next.js UI

In the `ui/` directory:
Set `NEXT_PUBLIC_BACKEND_URL` in `ui/.env.local`:
```env
# Local Development
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

# Production on Vercel
# NEXT_PUBLIC_BACKEND_URL=https://your-backend.vercel.app
```


