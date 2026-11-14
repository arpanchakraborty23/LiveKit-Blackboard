/**
 * Shared shapes for the config plane. These mirror `public`'s tables and the bundle
 * contract in `supabase/migrations/0002_bundle.sql`.
 */

export interface Assistant {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface AssistantConfig {
  assistant_id: string;
  config_version: number;
  greeting: string;
  llm_provider: string;
  llm_model: string;
  temperature: number;
  stt_model: string;
  stt_language: string;
  tts_model: string;
  tts_voice: string;
  expressive: boolean;
  active_prompt_id: string | null;
  settings: Record<string, unknown>;
  updated_at: string;
}

export interface Prompt {
  id: string;
  assistant_id: string;
  name: string;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromptVersion {
  id: string;
  prompt_id: string;
  assistant_id: string;
  version: number;
  content: string;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  created_by: string | null;
}

export interface McpServer {
  id: string;
  assistant_id: string;
  name: string;
  url: string;
  transport: 'streamable_http' | 'sse';
  auth_type: 'none' | 'bearer' | 'header';
  auth_header: string | null;
  secret_id: string | null;
  enabled: boolean;
  status: 'unknown' | 'ok' | 'error' | 'auth_failed';
  status_message: string | null;
  last_discovered_at: string | null;
  created_at: string;
  tools_count?: number;
  enabled_tools_count?: number;
  secret_hint?: string | null;
}

export interface McpTool {
  id: string;
  mcp_server_id: string;
  name: string;
  description: string | null;
  input_schema: Record<string, unknown> | null;
  enabled: boolean;
  discovered_at: string;
}

export interface BuiltinTool {
  id: string;
  assistant_id: string;
  kind: string;
  name: string;
  description: string | null;
  enabled: boolean;
  sort_order: number;
  created_at: string;
}

export interface Secret {
  id: string;
  assistant_id: string;
  name: string;
  hint: string;
  created_at: string;
}

export type DocumentStatus = 'pending' | 'chunking' | 'embedding' | 'indexing' | 'ready' | 'failed';

export interface DocumentRow {
  id: string;
  assistant_id: string;
  title: string;
  source_uri: string | null;
  mime: string | null;
  sha256: string;
  bytes: number;
  chunk_count: number;
  embed_model: string;
  embed_dim: number;
  status: DocumentStatus;
  status_message: string | null;
  created_at: string;
}

export interface RagSettings {
  enabled: boolean;
  top_k?: number;
  min_score?: number;
  namespace?: string;
  [key: string]: unknown;
}

/** The agent-facing bundle. Kept in sync with `get_assistant_bundle()`. */
export interface ConfigBundle {
  version: number;
  assistant: { id: string; name: string };
  prompt: string;
  greeting: string;
  llm: { provider: string; model: string; temperature: number };
  stt: { model: string; language: string };
  tts: { model: string; voice: string };
  expressive: boolean;
  settings: Record<string, unknown>;
  rag: { enabled: boolean } & Record<string, unknown>;
  mcp: unknown[];
  skills: Array<{ name: string; description: string }>;
  memory: {
    enabled: boolean;
    group_id?: string;
    profile?: string;
    facts?: string[];
  } & Record<string, unknown>;
}

export interface MemoryProfile {
  assistant_id: string;
  summary: string;
  facts: string[];
  refreshed_at: string | null;
}

export interface MemoryNode {
  uuid: string;
  name: string;
  summary?: string;
  labels: string[];
  group_id?: string;
  valid_at?: string | null;
  invalid_at?: string | null;
  created_at?: string | null;
}

export interface MemoryEdge {
  uuid: string;
  source: string;
  target: string;
  relation: string;
  fact: string;
  valid_at?: string | null;
  invalid_at?: string | null;
  expired_at?: string | null;
}

export interface SessionStats {
  turns?: number;
  user_turns?: number;
  agent_turns?: number;
  tool_calls?: Array<{
    name: string;
    duration_ms?: number;
    success?: boolean;
    error?: string;
  }>;
  memories_created?: number;
  tokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  [key: string]: unknown;
}

export interface SessionRecord {
  id: string;
  assistant_id: string;
  room_name: string;
  config_version: number;
  config_source: 'memo' | 'etag' | 'snapshot' | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds?: number | null;
  summary?: string | null;
  stats: SessionStats;
}

export interface Skill {
  id: string;
  assistant_id: string;
  name: string;
  description: string;
  body: string;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  files_count?: number;
  files?: SkillFile[];
}

export interface SkillFile {
  id: string;
  skill_id: string;
  path: string;
  content: string;
  created_at: string;
}

export interface BackupData {
  version: number;
  exported_at: string;
  assistant: Assistant;
  config: AssistantConfig;
  prompts: Prompt[];
  prompt_versions: PromptVersion[];
  skills: Array<{
    name: string;
    description: string;
    body: string;
    enabled: boolean;
    sort_order: number;
    files?: Array<{ path: string; content: string }>;
  }>;
}
