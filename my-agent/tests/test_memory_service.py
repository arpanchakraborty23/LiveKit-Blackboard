"""Tests for the FastAPI memory_service microservice."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

SERVICE_DIR = Path(__file__).resolve().parent.parent / "memory_service"
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from main import MEMORY_SERVICE_TOKEN, app, store  # noqa: E402

client = TestClient(app)
AUTH_HEADERS = {"Authorization": f"Bearer {MEMORY_SERVICE_TOKEN}"}


@pytest.fixture(autouse=True)
def _clear_store():
    store.episodes.clear()
    store.nodes.clear()
    store.edges.clear()
    yield


def test_health_check() -> None:
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["service"] == "memory-service"


def test_unauthorized_access() -> None:
    res = client.post("/episodes", json={"group_id": "test", "body": "Fact"})
    assert res.status_code == 401

    res = client.get("/nodes?group_id=test")
    assert res.status_code == 401


def test_add_episode_and_temporal_invalidation() -> None:
    # 1. User says "I live in Dhaka and I am vegetarian"
    res1 = client.post(
        "/episodes",
        headers=AUTH_HEADERS,
        json={
            "group_id": "test_grp",
            "name": "ep1",
            "body": "I live in Dhaka and I am vegetarian.",
        },
    )
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["ok"] is True
    assert data1["nodes_created"] >= 2

    # Verify nodes
    res_nodes = client.get("/nodes?group_id=test_grp", headers=AUTH_HEADERS)
    assert res_nodes.status_code == 200
    nodes_data = res_nodes.json()
    node_names = [n["name"] for n in nodes_data["nodes"]]
    assert "Dhaka" in node_names
    assert "Vegetarian" in node_names

    # 2. Search for food
    res_search = client.post(
        "/search",
        headers=AUTH_HEADERS,
        json={"group_id": "test_grp", "query": "food diet vegetarian"},
    )
    assert res_search.status_code == 200
    search_data = res_search.json()
    assert len(search_data["results"]) > 0
    assert "Vegetarian" in search_data["results"][0]["fact"]

    # 3. User moved to Berlin: "actually I moved to Berlin"
    res2 = client.post(
        "/episodes",
        headers=AUTH_HEADERS,
        json={
            "group_id": "test_grp",
            "name": "ep2",
            "body": "Actually I moved to Berlin last month.",
        },
    )
    assert res2.status_code == 200

    # 4. Check that Dhaka edge is invalidated, Berlin is active
    res_nodes2 = client.get("/nodes?group_id=test_grp", headers=AUTH_HEADERS)
    nodes_data2 = res_nodes2.json()
    edges = nodes_data2["edges"]

    dhaka_edges = [e for e in edges if "Dhaka" in e["fact"]]
    berlin_edges = [e for e in edges if "Berlin" in e["fact"]]

    assert len(dhaka_edges) > 0
    assert dhaka_edges[0]["invalid_at"] is not None  # Dhaka invalidated!
    assert len(berlin_edges) > 0
    assert berlin_edges[0]["invalid_at"] is None  # Berlin current!


def test_forget_node() -> None:
    # Add fact
    client.post(
        "/episodes",
        headers=AUTH_HEADERS,
        json={"group_id": "test_grp", "body": "I like spicy food."},
    )

    res_nodes = client.get("/nodes?group_id=test_grp", headers=AUTH_HEADERS)
    nodes = res_nodes.json()["nodes"]
    fact_node = next(n for n in nodes if n["name"] != "User")

    # Forget node
    del_res = client.delete(
        f"/nodes/{fact_node['uuid']}?group_id=test_grp",
        headers=AUTH_HEADERS,
    )
    assert del_res.status_code == 200
    assert del_res.json()["ok"] is True

    # Search should no longer return it
    search_res = client.post(
        "/search",
        headers=AUTH_HEADERS,
        json={"group_id": "test_grp", "query": "spicy food"},
    )
    assert len(search_res.json()["results"]) == 0


def test_rebuild_profile() -> None:
    client.post(
        "/episodes",
        headers=AUTH_HEADERS,
        json={"group_id": "test_grp", "body": "I live in Berlin and am vegetarian."},
    )

    res = client.post(
        "/profile/rebuild",
        headers=AUTH_HEADERS,
        json={"group_id": "test_grp"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "Berlin" in data["summary"]
    assert "Vegetarian" in data["summary"]
    assert len(data["facts"]) >= 2
