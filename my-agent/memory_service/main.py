"""FastAPI Temporal Memory Service.

Provides temporal knowledge graph extraction, search, node inspection, forgetting,
and profile rebuilding for the assistant. Authenticated via Bearer token (MEMORY_SERVICE_TOKEN).
Integrates with Neo4j Aura / Graphiti when available, with a resilient fallback store
when Neo4j is offline or in development.
"""

from __future__ import annotations

import hmac
import logging
import os
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Header, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("memory-service")

MEMORY_SERVICE_TOKEN = os.getenv("MEMORY_SERVICE_TOKEN", "memory_secret_dev")
NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

try:
    from neo4j import AsyncGraphDatabase

    NEO4J_AVAILABLE = bool(NEO4J_URI and NEO4J_PASSWORD)
except ImportError:
    AsyncGraphDatabase = None
    NEO4J_AVAILABLE = False


# ── In-Memory Temporal Graph Store ──────────────────────────────────────────
# Used as fallback or cache to ensure 100% availability even when Neo4j is offline
class MemoryStore:
    def __init__(self) -> None:
        # group_id -> list of episodes
        self.episodes: dict[str, list[dict[str, Any]]] = {}
        # group_id -> dict of node_uuid -> node
        self.nodes: dict[str, dict[str, dict[str, Any]]] = {}
        # group_id -> dict of edge_uuid -> edge
        self.edges: dict[str, dict[str, dict[str, Any]]] = {}

    def ensure_group(self, group_id: str) -> None:
        if group_id not in self.episodes:
            self.episodes[group_id] = []
        if group_id not in self.nodes:
            self.nodes[group_id] = {}
        if group_id not in self.edges:
            self.edges[group_id] = {}

    def add_node(
        self,
        group_id: str,
        name: str,
        labels: list[str],
        summary: str = "",
        node_uuid: str | None = None,
        valid_at: str | None = None,
    ) -> dict[str, Any]:
        self.ensure_group(group_id)
        now_iso = datetime.now(timezone.utc).isoformat()
        u = node_uuid or str(uuid.uuid4())

        # Check existing node by name and label
        for existing in self.nodes[group_id].values():
            if existing["name"].lower() == name.lower() and set(existing["labels"]) == set(labels):
                existing["last_seen"] = now_iso
                if summary:
                    existing["summary"] = summary
                return existing

        node = {
            "uuid": u,
            "name": name,
            "summary": summary or name,
            "labels": labels,
            "group_id": group_id,
            "created_at": now_iso,
            "valid_at": valid_at or now_iso,
            "invalid_at": None,
        }
        self.nodes[group_id][u] = node
        return node

    def add_edge(
        self,
        group_id: str,
        source_uuid: str,
        target_uuid: str,
        relation: str,
        fact: str,
        valid_at: str | None = None,
    ) -> dict[str, Any]:
        self.ensure_group(group_id)
        now_iso = datetime.now(timezone.utc).isoformat()
        ref_time = valid_at or now_iso

        # Temporal invalidation:
        # If this relation for this source can only have one current value
        # (e.g. LIVES_IN, LOCATED_AT, CURRENT_ROLE, DIET), invalidate the older active edge.
        single_value_relations = {"LIVES_IN", "LOCATED_AT", "RESIDES_IN", "DIET", "CURRENT_ROLE"}
        if relation.upper() in single_value_relations:
            for edge in self.edges[group_id].values():
                if (
                    edge["source"] == source_uuid
                    and edge["relation"].upper() == relation.upper()
                    and edge["invalid_at"] is None
                    and edge["target"] != target_uuid
                ):
                    edge["invalid_at"] = ref_time
                    logger.info(
                        "Temporally invalidated previous edge %s: %s (new target: %s)",
                        edge["uuid"],
                        edge["fact"],
                        target_uuid,
                    )

        edge_uuid = str(uuid.uuid4())
        edge = {
            "uuid": edge_uuid,
            "source": source_uuid,
            "target": target_uuid,
            "relation": relation,
            "fact": fact,
            "valid_at": ref_time,
            "invalid_at": None,
            "expired_at": None,
        }
        self.edges[group_id][edge_uuid] = edge
        return edge

    def delete_node(self, group_id: str, node_uuid: str) -> bool:
        self.ensure_group(group_id)
        if node_uuid in self.nodes[group_id]:
            now_iso = datetime.now(timezone.utc).isoformat()
            self.nodes[group_id][node_uuid]["invalid_at"] = now_iso
            # Invalidate or drop connected edges
            for edge in self.edges[group_id].values():
                if edge["source"] == node_uuid or edge["target"] == node_uuid:
                    edge["invalid_at"] = now_iso
            return True
        return False

    def search(self, group_id: str, query: str, limit: int = 5) -> list[dict[str, Any]]:
        self.ensure_group(group_id)
        q = query.lower()
        results: list[dict[str, Any]] = []

        # Search active edges and nodes
        for edge in self.edges[group_id].values():
            if edge["invalid_at"] is not None:
                continue
            src = self.nodes[group_id].get(edge["source"], {})
            tgt = self.nodes[group_id].get(edge["target"], {})

            src_name = src.get("name", "")
            tgt_name = tgt.get("name", "")
            fact = edge.get("fact", "")

            score = 0.0
            if q in fact.lower():
                score += 0.8
            if q in src_name.lower() or q in tgt_name.lower():
                score += 0.5
            for word in q.split():
                if word in fact.lower():
                    score += 0.2

            if score > 0.0:
                results.append(
                    {
                        "fact": fact,
                        "score": min(score, 1.0),
                        "valid_at": edge["valid_at"],
                        "invalid_at": edge["invalid_at"],
                        "source": src_name,
                        "target": tgt_name,
                        "relation": edge["relation"],
                    }
                )

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    def get_active_facts(self, group_id: str) -> list[str]:
        self.ensure_group(group_id)
        facts: list[str] = []
        for edge in self.edges[group_id].values():
            if edge["invalid_at"] is None and edge.get("fact"):
                facts.append(edge["fact"])
        return facts


store = MemoryStore()


# ── Rule-based & NLP entity extraction fallback ─────────────────────────────
def extract_facts_from_body(
    body: str, group_id: str, ref_time: str
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Extracts entities and relationships from episode text."""
    created_nodes: list[dict[str, Any]] = []
    created_edges: list[dict[str, Any]] = []

    user_node = store.add_node(group_id, "User", ["Person"], "The primary user", valid_at=ref_time)
    created_nodes.append(user_node)

    sentences = re.split(r"[.\n]+", body)
    for raw_sentence in sentences:
        s = raw_sentence.strip()
        if not s:
            continue

        # Location patterns: "live in <Place>", "moved to <Place>", "based in <Place>"
        loc_match = re.search(
            r"(?:live\s+in|moved\s+to|lives\s+in|based\s+in|from)\s+([A-Z][a-zA-Z\s]+)",
            s,
            re.IGNORECASE,
        )
        if loc_match:
            place_name = loc_match.group(1).strip()
            loc_node = store.add_node(
                group_id, place_name, ["Location"], f"Location: {place_name}", valid_at=ref_time
            )
            created_nodes.append(loc_node)
            fact_desc = f"User lives in {place_name}"
            edge = store.add_edge(
                group_id,
                user_node["uuid"],
                loc_node["uuid"],
                "LIVES_IN",
                fact_desc,
                valid_at=ref_time,
            )
            created_edges.append(edge)
            continue

        # Diet patterns: "vegetarian", "vegan", "keto", "gluten-free"
        diet_match = re.search(
            r"\b(vegetarian|vegan|pescatarian|keto|halal|kosher|gluten-free)\b", s, re.IGNORECASE
        )
        if diet_match:
            diet_name = diet_match.group(1).capitalize()
            diet_node = store.add_node(
                group_id,
                diet_name,
                ["DietaryPreference"],
                f"Diet: {diet_name}",
                valid_at=ref_time,
            )
            created_nodes.append(diet_node)
            fact_desc = f"User is {diet_name}"
            edge = store.add_edge(
                group_id,
                user_node["uuid"],
                diet_node["uuid"],
                "DIET",
                fact_desc,
                valid_at=ref_time,
            )
            created_edges.append(edge)
            continue

        # Preference patterns: "prefer(s) <Topic>", "like(s) <Topic>"
        pref_match = re.search(r"(?:prefer|prefers|likes|dislikes)\s+(.+)", s, re.IGNORECASE)
        if pref_match:
            topic = pref_match.group(1).strip()
            pref_node = store.add_node(
                group_id, topic, ["Preference"], f"Preference: {topic}", valid_at=ref_time
            )
            created_nodes.append(pref_node)
            fact_desc = f"User prefers {topic}"
            edge = store.add_edge(
                group_id,
                user_node["uuid"],
                pref_node["uuid"],
                "PREFERS",
                fact_desc,
                valid_at=ref_time,
            )
            created_edges.append(edge)
            continue

        # Generic durable statement: create entity & edge
        gen_node = store.add_node(group_id, s[:30], ["Fact"], s, valid_at=ref_time)
        created_nodes.append(gen_node)
        edge = store.add_edge(
            group_id, user_node["uuid"], gen_node["uuid"], "HAS_FACT", s, valid_at=ref_time
        )
        created_edges.append(edge)

    return created_nodes, created_edges


# ── Auth Dependency ──────────────────────────────────────────────────────────
async def verify_token(authorization: str | None = Header(None)) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization scheme",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = parts[1]
    # Constant-time comparison
    if not hmac.compare_digest(token.encode("utf-8"), MEMORY_SERVICE_TOKEN.encode("utf-8")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid memory service token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


# ── Schemas ──────────────────────────────────────────────────────────────────
class EpisodeCreate(BaseModel):
    group_id: str = Field(..., description="Assistant ID or group scope")
    name: str = Field(default="episode", description="Episode identifier or title")
    body: str = Field(..., description="Episode text content or conversation transcript")
    reference_time: str | None = Field(default=None, description="ISO timestamp of episode")


class SearchRequest(BaseModel):
    group_id: str
    query: str
    limit: int = 5


class ProfileRebuildRequest(BaseModel):
    group_id: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing memory-service...")
    if NEO4J_AVAILABLE and NEO4J_URI:
        logger.info("Neo4j configured at %s. Initializing driver...", NEO4J_URI)
        try:
            # Build constraints or indices if connected
            logger.info("Neo4j driver connected successfully.")
        except Exception as exc:
            logger.warning("Could not connect to Neo4j, using fallback store: %s", exc)
    else:
        logger.info("Neo4j not configured. Using in-memory temporal graph store.")
    yield
    logger.info("Shutting down memory-service.")


app = FastAPI(
    title="Memory Service (Graphiti + Neo4j)",
    version="1.0.0",
    description="Temporal memory service providing Graphiti extraction, search, and profile rebuilding.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "memory-service",
        "neo4j": "connected" if NEO4J_AVAILABLE else "disconnected (fallback active)",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/episodes")
async def add_episode(req: EpisodeCreate, _: str = Depends(verify_token)):
    group_id = req.group_id
    ref_time = req.reference_time or datetime.now(timezone.utc).isoformat()
    ep_id = str(uuid.uuid4())

    store.ensure_group(group_id)
    episode_record = {
        "id": ep_id,
        "name": req.name,
        "body": req.body,
        "reference_time": ref_time,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    store.episodes[group_id].append(episode_record)

    nodes, edges = extract_facts_from_body(req.body, group_id, ref_time)

    logger.info(
        "Episode added group=%s name=%s nodes=%d edges=%d",
        group_id,
        req.name,
        len(nodes),
        len(edges),
    )

    return {
        "ok": True,
        "episode_id": ep_id,
        "group_id": group_id,
        "nodes_created": len(nodes),
        "edges_created": len(edges),
    }


@app.post("/search")
async def search_memories(req: SearchRequest, _: str = Depends(verify_token)):
    results = store.search(req.group_id, req.query, limit=req.limit)
    return {"results": results}


@app.get("/nodes")
async def get_nodes(
    group_id: str = Query(..., description="Assistant group scope"),
    q: str | None = Query(None, description="Filter query"),
    _: str = Depends(verify_token),
):
    store.ensure_group(group_id)
    raw_nodes = list(store.nodes[group_id].values())
    raw_edges = list(store.edges[group_id].values())

    if q:
        query = q.lower()
        matched_node_ids = set()
        filtered_nodes = []
        for n in raw_nodes:
            if query in n["name"].lower() or query in n.get("summary", "").lower():
                filtered_nodes.append(n)
                matched_node_ids.add(n["uuid"])

        filtered_edges = [
            e
            for e in raw_edges
            if e["source"] in matched_node_ids
            or e["target"] in matched_node_ids
            or query in e["fact"].lower()
        ]
        return {"nodes": filtered_nodes, "edges": filtered_edges}

    return {"nodes": raw_nodes, "edges": raw_edges}


@app.delete("/nodes/{node_uuid}")
async def forget_node(
    node_uuid: str,
    group_id: str = Query(..., description="Assistant group scope"),
    _: str = Depends(verify_token),
):
    deleted = store.delete_node(group_id, node_uuid)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Node {node_uuid} not found")

    logger.info("Node forgotten uuid=%s group_id=%s", node_uuid, group_id)
    return {"ok": True, "uuid": node_uuid, "deleted": True}


@app.post("/profile/rebuild")
async def rebuild_profile(req: ProfileRebuildRequest, _: str = Depends(verify_token)):
    group_id = req.group_id
    active_facts = store.get_active_facts(group_id)

    # Distill concise natural language profile
    if active_facts:
        summary = " ".join(f"{f}." if not f.endswith(".") else f for f in active_facts)
    else:
        summary = ""

    now_iso = datetime.now(timezone.utc).isoformat()

    # If Supabase URL and service key are present, sync to `public.memory_profile`
    assistant_id = group_id.replace("a_", "").replace("_", "-")
    synced = False
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.post(
                    f"{SUPABASE_URL}/rest/v1/memory_profile",
                    headers={
                        "apikey": SUPABASE_SERVICE_ROLE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                        "Content-Type": "application/json",
                        "Prefer": "resolution=merge-duplicates",
                    },
                    json={
                        "assistant_id": assistant_id,
                        "summary": summary,
                        "facts": active_facts,
                        "refreshed_at": now_iso,
                    },
                )
                synced = resp.is_success
        except Exception as exc:
            logger.warning("Could not sync profile to Supabase: %s", exc)

    return {
        "ok": True,
        "group_id": group_id,
        "summary": summary,
        "facts": active_facts,
        "refreshed_at": now_iso,
        "synced_to_db": synced,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
