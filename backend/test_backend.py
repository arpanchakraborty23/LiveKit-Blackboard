import os
import sys

# Ensure repository root is in sys.path
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from fastapi.testclient import TestClient
from backend.main import app
from backend.src.services.database import engine, Base

def run_tests():
    print("--- 1. Testing Table Creation ---")
    Base.metadata.create_all(bind=engine)
    print("Tables created successfully!")

    print("\n--- 2. Initializing TestClient ---")
    with TestClient(app) as client:
        # Test Root
        res = client.get("/")
        print("GET / ->", res.status_code, res.json())
        assert res.status_code == 200

        # Test Health
        res = client.get("/api/health")
        print("GET /api/health ->", res.status_code, res.json().get("status"))
        assert res.status_code == 200

        # Test Assistant GET
        res = client.get("/api/assistant")
        print("GET /api/assistant ->", res.status_code, res.json().get("name"))
        assert res.status_code == 200
        assistant_data = res.json()
        assert "font" in assistant_data
        assert "accent_color" in assistant_data

        # Test Assistant PUT (Font, Accent, Settings)
        res = client.put("/api/assistant", json={
            "name": "LiveKit Voice Tutor",
            "font": "CommitMono",
            "accent_color": "#10b981",
            "settings": {"theme": "dark", "fontSize": 14}
        })
        print("PUT /api/assistant ->", res.status_code, res.json().get("font"), res.json().get("accent_color"))
        assert res.status_code == 200
        assert res.json().get("font") == "CommitMono"
        assert res.json().get("accent_color") == "#10b981"
        assert res.json().get("settings", {}).get("theme") == "dark"

        # Test Prompts
        res = client.get("/api/prompts")
        print("GET /api/prompts ->", res.status_code, len(res.json()), "prompts")
        assert res.status_code == 200

        res = client.post("/api/prompts", json={
            "name": "Custom Tutor Prompt",
            "content": "You are an expert tutor in mathematics and science.",
            "is_active": True
        })
        print("POST /api/prompts ->", res.status_code, res.json().get("name"))
        assert res.status_code == 200

        # Test Tools
        res = client.get("/api/tools")
        print("GET /api/tools ->", res.status_code, len(res.json().get("tools", [])), "tools seeded")
        assert res.status_code == 200
        assert len(res.json().get("tools", [])) >= 3

        # Test Token
        res = client.post("/api/token", json={"room_name": "test_room_123"})
        print("POST /api/token ->", res.status_code, res.json().get("roomName"))
        assert res.status_code == 200
        assert res.json().get("participantToken") is not None

        # Test MCP Servers
        res = client.get("/api/mcp/servers")
        print("GET /api/mcp/servers ->", res.status_code, len(res.json().get("servers", [])), "servers")
        assert res.status_code == 200

        # Test RAG
        res = client.get("/api/rag/status")
        print("GET /api/rag/status ->", res.status_code, res.json().get("status"))
        assert res.status_code == 200

        res = client.post("/api/rag/upload", json={
            "title": "Quantum Physics Notes",
            "content": "Quantum entanglement is a physical phenomenon that occurs when a group of particles interact.",
            "doc_type": "text"
        })
        print("POST /api/rag/upload ->", res.status_code, res.json().get("document", {}).get("title"))
        assert res.status_code == 200

        res = client.post("/api/rag/search", json={"query": "entanglement particles", "limit": 3})
        print("POST /api/rag/search ->", res.status_code, len(res.json().get("matches", [])), "matches")
        assert res.status_code == 200
        assert len(res.json().get("matches", [])) > 0

        # Test Memory
        res = client.get("/api/memory/profile")
        print("GET /api/memory/profile ->", res.status_code)
        assert res.status_code == 200

        res = client.put("/api/memory/profile", json={
            "facts": ["Prefers visual explanations", "Interested in physics"],
            "preferences": {"voice_speed": "normal"}
        })
        print("PUT /api/memory/profile ->", res.status_code, len(res.json().get("facts", [])))
        assert res.status_code == 200

        # Test Skills
        res = client.get("/api/skills")
        print("GET /api/skills ->", res.status_code)
        assert res.status_code == 200

        res = client.post("/api/skills", json={
            "name": "socratic_dialogue",
            "description": "Guides the user using questions",
            "instructions": "Always ask guiding questions rather than giving immediate answers."
        })
        print("POST /api/skills ->", res.status_code, res.json().get("skill", {}).get("name"))
        assert res.status_code == 200

        # Test Sessions
        res = client.get("/api/sessions")
        print("GET /api/sessions ->", res.status_code)
        assert res.status_code == 200

        res = client.post("/api/sessions", json={
            "room_name": "room_session_abc",
            "status": "completed",
            "summary": "Reviewed basic quantum mechanics concepts."
        })
        print("POST /api/sessions ->", res.status_code, res.json().get("room_name"))
        assert res.status_code == 200

        # Test Vercel Entrypoint
        from backend.api.index import app as vercel_app
        assert vercel_app is not None
        print("backend.api.index import verified successfully!")

    print("\nALL BACKEND VERIFICATION TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
