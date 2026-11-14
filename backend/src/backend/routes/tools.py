import time
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from datetime import datetime
from fastmcp import Client

try:
    from backend.src.services.database import get_db
    from backend.src.constants.models import Assistant, Tool, McpServer, McpTool
    from backend.schemas import (
        ToolCreate,
        ToolUpdate,
        ToolResponse,
        McpServerCreate,
        McpServerUpdate,
        McpServerResponse,
        McpToolResponse,
        McpDiscoverRequest,
        McpTestRequest,
        McpTestResponse,
    )
    from backend.src.routes.assistant import get_or_create_default_assistant
except ImportError:
    from backend.src.services.database import get_db
    from backend.src.constants.models import Assistant, Tool, McpServer, McpTool
    from schemas import (
        ToolCreate,
        ToolUpdate,
        ToolResponse,
        McpServerCreate,
        McpServerUpdate,
        McpServerResponse,
        McpToolResponse,
        McpDiscoverRequest,
        McpTestRequest,
        McpTestResponse,
    )
    from backend.src.routes.assistant import get_or_create_default_assistant

router = APIRouter(tags=["tools"])

BUILTIN_TOOLS = [
    {
        "name": "search_knowledge",
        "kind": "knowledge",
        "description": "Search indexed documents, notes, and references in the assistant knowledge base.",
        "default_enabled": True,
        "sort_order": 10,
    },
    {
        "name": "recall",
        "kind": "memory",
        "description": "Recall facts, personal preferences, and episodic history from past conversations.",
        "default_enabled": True,
        "sort_order": 20,
    },
    {
        "name": "read_skill",
        "kind": "skill",
        "description": "Read detailed skill instructions and domain guidelines on demand for specialized tasks.",
        "default_enabled": True,
        "sort_order": 30,
    },
]


def seed_builtin_tools(db: Session, assistant_id: str):
    existing = db.query(Tool).filter(Tool.assistant_id == assistant_id).all()
    existing_names = {t.name for t in existing}
    added = False
    for b in BUILTIN_TOOLS:
        if b["name"] not in existing_names:
            tool = Tool(
                assistant_id=assistant_id,
                name=b["name"],
                kind=b["kind"],
                description=b["description"],
                is_enabled=b["default_enabled"],
                sort_order=b["sort_order"],
            )
            db.add(tool)
            added = True
    if added:
        db.commit()


# --- Standard Tools ---

@router.get("/tools", response_model=Dict[str, Any])
def list_tools(
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        return {"tools": []}

    seed_builtin_tools(db, assistant.id)
    tools = (
        db.query(Tool)
        .filter(Tool.assistant_id == assistant.id)
        .order_by(Tool.sort_order.asc(), Tool.name.asc())
        .all()
    )

    formatted = [
        {
            "id": t.id,
            "assistant_id": t.assistant_id,
            "name": t.name,
            "kind": getattr(t, "kind", "custom") or "custom",
            "description": t.description,
            "enabled": t.is_enabled,
            "is_enabled": t.is_enabled,
            "schema": t.schema,
            "sort_order": t.sort_order,
        }
        for t in tools
    ]
    return {"tools": formatted}


@router.post("/tools", response_model=Dict[str, Any])
async def create_or_toggle_tool(
    request: Request,
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    body = await request.json()

    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    # Check if this is a toggle request (has 'id' or 'name' and 'enabled')
    if "enabled" in body and ("id" in body or "name" in body):
        tool_query = db.query(Tool).filter(Tool.assistant_id == assistant.id)
        if body.get("id"):
            tool = tool_query.filter(Tool.id == body["id"]).first()
        else:
            tool = tool_query.filter(Tool.name == body["name"]).first()

        if not tool:
            # If builtin tool not yet seeded, seed and look up again
            seed_builtin_tools(db, assistant.id)
            if body.get("id"):
                tool = db.query(Tool).filter(Tool.assistant_id == assistant.id, Tool.id == body["id"]).first()
            else:
                tool = db.query(Tool).filter(Tool.assistant_id == assistant.id, Tool.name == body["name"]).first()

        if not tool:
            raise HTTPException(status_code=404, detail="Tool not found")

        tool.is_enabled = bool(body["enabled"])
        db.commit()
        db.refresh(tool)
        return {"success": True, "tool": {
            "id": tool.id,
            "name": tool.name,
            "enabled": tool.is_enabled,
        }}

    # Standard tool creation
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Tool name is required")

    tool = Tool(
        assistant_id=assistant.id,
        name=name,
        kind=body.get("kind", "custom"),
        description=body.get("description"),
        is_enabled=body.get("is_enabled", body.get("enabled", True)),
        schema=body.get("schema"),
        sort_order=body.get("sort_order", 0),
    )
    db.add(tool)
    db.commit()
    db.refresh(tool)
    return {"success": True, "tool": {
        "id": tool.id,
        "assistant_id": tool.assistant_id,
        "name": tool.name,
        "kind": tool.kind,
        "description": tool.description,
        "enabled": tool.is_enabled,
        "is_enabled": tool.is_enabled,
        "schema": tool.schema,
    }}


@router.put("/tools/{tool_id}", response_model=ToolResponse)
def update_tool(
    tool_id: str,
    payload: ToolUpdate,
    db: Session = Depends(get_db),
):
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")

    if payload.name is not None:
        tool.name = payload.name
    if payload.kind is not None:
        tool.kind = payload.kind
    if payload.description is not None:
        tool.description = payload.description
    if payload.is_enabled is not None:
        tool.is_enabled = payload.is_enabled
    if payload.schema is not None:
        tool.schema = payload.schema
    if payload.sort_order is not None:
        tool.sort_order = payload.sort_order

    db.commit()
    db.refresh(tool)
    return tool


@router.delete("/tools/{tool_id}")
def delete_tool(
    tool_id: str,
    db: Session = Depends(get_db),
):
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    db.delete(tool)
    db.commit()
    return {"success": True, "message": "Tool deleted"}


# --- MCP Servers ---

@router.get("/mcp/servers", response_model=Dict[str, Any])
def list_mcp_servers(
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        return {"servers": []}

    servers = (
        db.query(McpServer)
        .filter(McpServer.assistant_id == assistant.id)
        .order_by(McpServer.created_at.asc())
        .all()
    )

    enriched = []
    for s in servers:
        total_tools = db.query(McpTool).filter(McpTool.mcp_server_id == s.id).count()
        enabled_tools = (
            db.query(McpTool)
            .filter(McpTool.mcp_server_id == s.id, McpTool.is_enabled == True)
            .count()
        )
        enriched.append({
            "id": s.id,
            "assistant_id": s.assistant_id,
            "name": s.name,
            "url": s.url,
            "transport": s.transport,
            "is_active": s.is_active,
            "enabled": s.is_active,
            "headers": s.headers,
            "status": s.status,
            "status_message": s.status_message,
            "last_discovered_at": s.last_discovered_at,
            "created_at": s.created_at,
            "tools_count": total_tools,
            "enabled_tools_count": enabled_tools,
        })

    return {"servers": enriched}


@router.post("/mcp/servers", response_model=Dict[str, Any])
async def create_or_manage_mcp_server(
    request: Request,
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    body = await request.json()

    # Handle delete action
    if body.get("action") == "delete":
        server_id = body.get("id")
        if not server_id:
            raise HTTPException(status_code=400, detail="Server id is required")
        server = db.query(McpServer).filter(McpServer.id == server_id).first()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        db.delete(server)
        db.commit()
        return {"success": True, "message": "Server deleted"}

    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    server_id = body.get("id")
    if server_id:
        server = db.query(McpServer).filter(McpServer.id == server_id).first()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        if "name" in body:
            server.name = body["name"]
        if "url" in body:
            server.url = body["url"]
        if "transport" in body:
            server.transport = body["transport"]
        if "is_active" in body or "enabled" in body:
            server.is_active = bool(body.get("is_active", body.get("enabled", True)))
        if "headers" in body:
            server.headers = body["headers"]
    else:
        name = body.get("name")
        url = body.get("url")
        if not name or not url:
            raise HTTPException(status_code=400, detail="name and url are required")
        server = McpServer(
            assistant_id=assistant.id,
            name=name,
            url=url,
            transport=body.get("transport", "sse"),
            is_active=bool(body.get("is_active", body.get("enabled", True))),
            headers=body.get("headers"),
            status="unknown",
        )
        db.add(server)

    db.commit()
    db.refresh(server)

    total_tools = db.query(McpTool).filter(McpTool.mcp_server_id == server.id).count()
    enabled_tools = (
        db.query(McpTool)
        .filter(McpTool.mcp_server_id == server.id, McpTool.is_enabled == True)
        .count()
    )

    return {
        "success": True,
        "server": {
            "id": server.id,
            "assistant_id": server.assistant_id,
            "name": server.name,
            "url": server.url,
            "transport": server.transport,
            "is_active": server.is_active,
            "enabled": server.is_active,
            "status": server.status,
            "status_message": server.status_message,
            "tools_count": total_tools,
            "enabled_tools_count": enabled_tools,
        },
    }


@router.delete("/mcp/servers/{server_id}")
def delete_mcp_server(
    server_id: str,
    db: Session = Depends(get_db),
):
    server = db.query(McpServer).filter(McpServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    db.delete(server)
    db.commit()
    return {"success": True, "message": "Server deleted"}


# --- FastMCP Tool Discovery & Testing ---

@router.post("/mcp/discover", response_model=Dict[str, Any])
async def discover_mcp(
    payload: McpDiscoverRequest,
    db: Session = Depends(get_db),
):
    server = db.query(McpServer).filter(McpServer.id == payload.server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    auth_token = None
    if server.headers and isinstance(server.headers, dict):
        auth_token = server.headers.get("Authorization") or server.headers.get("authorization")

    client_kwargs = {}
    if auth_token:
        client_kwargs["auth"] = auth_token

    try:
        async with Client(server.url, timeout=20, **client_kwargs) as client:
            tools_list = await client.list_tools()

        # Update server status to ok
        server.status = "ok"
        server.status_message = None
        server.last_discovered_at = datetime.utcnow()

        # Existing tools map to preserve is_enabled
        existing_tools = db.query(McpTool).filter(McpTool.mcp_server_id == server.id).all()
        existing_map = {t.name: t for t in existing_tools}

        saved_tools = []
        for t in tools_list:
            schema = getattr(t, "input_schema", None) or getattr(t, "inputSchema", None) or {}
            desc = getattr(t, "description", None) or ""
            if t.name in existing_map:
                existing = existing_map[t.name]
                existing.description = desc
                existing.input_schema = schema
                saved_tools.append(existing)
            else:
                new_tool = McpTool(
                    mcp_server_id=server.id,
                    name=t.name,
                    description=desc,
                    input_schema=schema,
                    is_enabled=False,
                )
                db.add(new_tool)
                saved_tools.append(new_tool)

        db.commit()

        # Return discovered tools
        refreshed_tools = db.query(McpTool).filter(McpTool.mcp_server_id == server.id).all()
        return {
            "ok": True,
            "status": "ok",
            "tools_count": len(refreshed_tools),
            "tools": [
                {
                    "id": t.id,
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.input_schema,
                    "enabled": t.is_enabled,
                    "is_enabled": t.is_enabled,
                }
                for t in refreshed_tools
            ],
        }
    except Exception as err:
        server.status = "error"
        server.status_message = str(err)
        db.commit()
        return {
            "ok": False,
            "status": "error",
            "error": str(err),
            "tools": [],
            "tools_count": 0,
        }


@router.post("/mcp/test", response_model=McpTestResponse)
async def test_mcp_server(
    payload: McpTestRequest,
):
    if not payload.url:
        raise HTTPException(status_code=400, detail="URL is required")

    auth_token = None
    if payload.headers and isinstance(payload.headers, dict):
        auth_token = payload.headers.get("Authorization") or payload.headers.get("authorization")

    client_kwargs = {}
    if auth_token:
        client_kwargs["auth"] = auth_token

    t0 = time.time()
    try:
        async with Client(payload.url, timeout=20, **client_kwargs) as client:
            tools_list = await client.list_tools()
        latency = round((time.time() - t0) * 1000, 2)

        formatted_tools = [
            {
                "name": t.name,
                "description": getattr(t, "description", None) or "",
                "input_schema": getattr(t, "input_schema", None) or getattr(t, "inputSchema", None) or {},
            }
            for t in tools_list
        ]

        return McpTestResponse(
            ok=True,
            status="ok",
            latency_ms=latency,
            tools=formatted_tools,
            tools_count=len(formatted_tools),
        )
    except Exception as err:
        latency = round((time.time() - t0) * 1000, 2)
        return McpTestResponse(
            ok=False,
            status="error",
            latency_ms=latency,
            tools=[],
            tools_count=0,
            error=str(err),
        )


@router.get("/mcp/tools", response_model=Dict[str, Any])
def list_mcp_tools(
    server_id: str = Query(...),
    db: Session = Depends(get_db),
):
    tools = (
        db.query(McpTool)
        .filter(McpTool.mcp_server_id == server_id)
        .order_by(McpTool.name.asc())
        .all()
    )
    return {
        "tools": [
            {
                "id": t.id,
                "mcp_server_id": t.mcp_server_id,
                "name": t.name,
                "description": t.description,
                "input_schema": t.input_schema,
                "enabled": t.is_enabled,
                "is_enabled": t.is_enabled,
                "created_at": t.created_at,
            }
            for t in tools
        ]
    }


@router.post("/mcp/tools", response_model=Dict[str, Any])
async def update_mcp_tools(
    request: Request,
    db: Session = Depends(get_db),
):
    body = await request.json()
    server_id = body.get("server_id")
    enabled_tool_ids = body.get("enabled_tool_ids")
    tool_id = body.get("tool_id")
    enabled = body.get("enabled")

    if server_id and enabled_tool_ids is not None:
        enabled_set = set(enabled_tool_ids)
        tools = db.query(McpTool).filter(McpTool.mcp_server_id == server_id).all()
        for t in tools:
            t.is_enabled = t.id in enabled_set
        db.commit()
        return {"success": True, "updated_count": len(tools)}

    if tool_id and enabled is not None:
        t = db.query(McpTool).filter(McpTool.id == tool_id).first()
        if not t:
            raise HTTPException(status_code=404, detail="Tool not found")
        t.is_enabled = bool(enabled)
        db.commit()
        return {"success": True, "tool_id": t.id, "enabled": t.is_enabled}

    raise HTTPException(status_code=400, detail="Invalid request parameters")
