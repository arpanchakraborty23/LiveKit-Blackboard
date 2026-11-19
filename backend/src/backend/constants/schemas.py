from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime


# Token
class TokenRequest(BaseModel):
    session_id: Optional[str] = None


class TokenResponse(BaseModel):
    serverUrl: str
    roomName: str
    participantName: str
    participantToken: str




# System prompt (static, always active)
class SystemPromptUpdate(BaseModel):
    content: str = ""


# Prompts
class PromptCreateRequest(BaseModel):
    name: str = "System Prompt"
    content: str
    is_active: bool = True


class PromptUpdateRequest(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    is_active: Optional[bool] = None




# Tools
class ToolCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str
    kind: Optional[str] = "custom"
    description: Optional[str] = None
    is_enabled: bool = True
    schema_def: Optional[Dict[str, Any]] = Field(default=None, alias="schema")
    sort_order: Optional[int] = 0


class ToolUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: Optional[str] = None
    kind: Optional[str] = None
    description: Optional[str] = None
    is_enabled: Optional[bool] = None
    schema_def: Optional[Dict[str, Any]] = Field(default=None, alias="schema")
    sort_order: Optional[int] = None


class ToolResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    assistant_id: str
    name: str
    kind: Optional[str] = "custom"
    description: Optional[str] = None
    is_enabled: bool
    schema_def: Optional[Dict[str, Any]] = Field(default=None, alias="schema")
    sort_order: Optional[int] = 0


# MCP
class McpServerCreate(BaseModel):
    name: str
    url: str
    transport: str = "sse"
    is_active: bool = True
    key : Optional[str] = None


class McpServerUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    transport: Optional[str] = None
    is_active: bool = True
    headers: Optional[Dict[str, Any]] = None


class McpToolResponse(BaseModel):
    id: str
    mcp_server_id: str
    name: str
    description: Optional[str] = None
    input_schema: Optional[Dict[str, Any]] = None
    is_enabled: bool
    created_at: Optional[datetime] = None


class McpServerResponse(BaseModel):
    id: str
    assistant_id: str
    name: str
    url: str
    transport: str
    is_active: bool
    headers: Optional[Dict[str, Any]] = None
    status: Optional[str] = "unknown"
    status_message: Optional[str] = None
    last_discovered_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    tools_count: Optional[int] = 0
    enabled_tools_count: Optional[int] = 0


class McpDiscoverRequest(BaseModel):
    server_id: str


class McpTestRequest(BaseModel):
    url: str
    transport: Optional[str] = "sse"
    headers: Optional[Dict[str, Any]] = None


class McpTestResponse(BaseModel):
    ok: bool
    status: str
    latency_ms: Optional[float] = None
    tools: Optional[List[Dict[str, Any]]] = None
    tools_count: Optional[int] = 0
    error: Optional[str] = None


# RAG & Documents
class DocumentCreate(BaseModel):
    title: str
    content: str
    doc_type: str = "text"


class DocumentResponse(BaseModel):
    id: str
    assistant_id: str
    title: str
    content: Optional[str] = None
    doc_type: str
    status: str
    chunk_count: int
    created_at: Optional[datetime] = None


class RagSearchRequest(BaseModel):
    query: str
    limit: Optional[int] = 5


class RagSearchResult(BaseModel):
    document_id: str
    title: str
    snippet: str
    score: float


# Memory
class MemoryUpdate(BaseModel):
    facts: Optional[List[Any]] = None
    preferences: Optional[Dict[str, Any]] = None
    summary: Optional[str] = None


class MemoryProfileResponse(BaseModel):
    id: str
    assistant_id: str
    user_id: Optional[str] = None
    facts: List[Any] = []
    preferences: Dict[str, Any] = {}
    summary: Optional[str] = ""
    updated_at: Optional[datetime] = None


class MemoryEpisodeCreate(BaseModel):
    content: str
    session_id: Optional[str] = None
    source: Optional[str] = "conversation"


class MemoryEpisodeResponse(BaseModel):
    id: str
    assistant_id: str
    session_id: Optional[str] = None
    content: str
    source: str
    created_at: Optional[datetime] = None


# Sessions
class SessionCreate(BaseModel):
    room_name: str
    summary: Optional[str] = None
    stats: Optional[Dict[str, Any]] = None


class SessionUpdate(BaseModel):
    status: Optional[str] = None
    ended_at: Optional[datetime] = None
    summary: Optional[str] = None
    stats: Optional[Dict[str, Any]] = None


class SessionResponse(BaseModel):
    id: str
    assistant_id: Optional[str] = None
    room_name: str
    status: str
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    summary: Optional[str] = None
    stats: Optional[Dict[str, Any]] = None


# Skills
class SkillCreate(BaseModel):
    name: str
    description: Optional[str] = None
    instructions: str
    is_enabled: bool = True
    sort_order: Optional[int] = 0


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    is_enabled: Optional[bool] = None
    sort_order: Optional[int] = None


class SkillResponse(BaseModel):
    id: str
    assistant_id: str
    name: str
    description: Optional[str] = None
    instructions: str
    is_enabled: bool
    sort_order: Optional[int] = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# Health
class HealthResponse(BaseModel):
    status: str
    database: str
    livekit: str
    timestamp: datetime
    details: Optional[Dict[str, Any]] = None
