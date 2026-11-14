/**
 * Helper client for the FastAPI Memory Service (Graphiti + Neo4j).
 * Handles communication between Next.js server routes/components and the memory service.
 */

const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:8000';
const MEMORY_SERVICE_TOKEN = process.env.MEMORY_SERVICE_TOKEN || 'memory_secret_dev';

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

export interface NodesResponse {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

export interface HealthResponse {
  status: string;
  service: string;
  neo4j: string;
  timestamp: string;
}

function getHeaders() {
  return {
    Authorization: `Bearer ${MEMORY_SERVICE_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

export async function checkMemoryServiceHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${MEMORY_SERVICE_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchNodesFromService(
  groupId: string,
  query?: string
): Promise<NodesResponse> {
  try {
    const url = new URL(`${MEMORY_SERVICE_URL}/nodes`);
    url.searchParams.set('group_id', groupId);
    if (query) url.searchParams.set('q', query);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: getHeaders(),
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });

    if (!res.ok) {
      return { nodes: [], edges: [] };
    }
    return await res.json();
  } catch (err) {
    console.warn('Could not reach memory-service for /nodes:', err);
    return { nodes: [], edges: [] };
  }
}

export async function addEpisodeToService(
  groupId: string,
  name: string,
  body: string,
  referenceTime?: string
) {
  const res = await fetch(`${MEMORY_SERVICE_URL}/episodes`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      group_id: groupId,
      name,
      body,
      reference_time: referenceTime || new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to add episode: ${res.status} ${errText}`);
  }
  return await res.json();
}

export async function deleteNodeFromService(groupId: string, nodeUuid: string) {
  const url = new URL(`${MEMORY_SERVICE_URL}/nodes/${nodeUuid}`);
  url.searchParams.set('group_id', groupId);

  const res = await fetch(url.toString(), {
    method: 'DELETE',
    headers: getHeaders(),
    signal: AbortSignal.timeout(4000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to delete node: ${res.status} ${errText}`);
  }
  return await res.json();
}

export async function rebuildProfileFromService(groupId: string) {
  const res = await fetch(`${MEMORY_SERVICE_URL}/profile/rebuild`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ group_id: groupId }),
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to rebuild profile: ${res.status} ${errText}`);
  }
  return await res.json();
}
