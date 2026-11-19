import json
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport

from backend.services.database import get_db
from backend.constants.models import MCPServer, MCPTools
from backend.constants.schemas import McpServerCreate


mcp_router = APIRouter(prefix="/mcp",tags=["mcp"])
logger = logging.getLogger(__name__)



@mcp_router.post("/create", status_code=status.HTTP_200_OK)
async def add_mcp(
    payload: McpServerCreate,
    db: AsyncSession = Depends(get_db)
):
    if not payload.url:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Missing Url"
        )

    # database lookup
    stm = select(MCPServer).where(MCPServer.url == payload.url)
    result = await db.execute(stm)

    if result.scalars().first() is not None:
        return {
            "url": payload.url,
            "message": "MCP Server Alreday Exist"
        }


    transport = StreamableHttpTransport(
        url=payload.url,
        headers={
            "Authorization": f"Bearer {payload.key}"
        } if payload.key else {}
    )

    client = Client(transport)

    try:
        async with client:
            tools_response = await client.list_tools()

            # Create MCP server record
            mcp_server = MCPServer(
                name=payload.name,
                url=payload.url,
                key=payload.key,
                is_enabled=True,
                tool_count=len(tools_response)
            )

            # Flush to database
            db.add(mcp_server)
            await db.flush()

            logger.info(f"New MCP server {payload.name} Add to mcp table")

            tool_list = []

            for tool in tools_response:

                mcp_tool = MCPTools(
                    mcp_server=payload.name,
                    name=tool.name,
                    description=tool.description,
                    input_schema=tool.input_schema,
                )

                db.add(mcp_tool)

                tool_list.append({
                    "name": tool.name,
                    "description": tool.description,
                    "is_enabled": True,
                    "schema": tool.input_schema
                })

            await db.commit()

            logger.info(f"All mcp tool are added")

        return {
            "created": "ok",
            "name": payload.name,
            "url": payload.url,
            "status": "initialized",
            "tool_count": len(tools_response),
            "tools": tool_list
        }

    except Exception:
        await db.rollback()
        raise



@mcp_router.get("/mcpservers",status_code=status.HTTP_202_ACCEPTED)
async def list_of_mcp(
    db: AsyncSession = Depends(get_db),
    ):
    try:
        # get all tools
        stm = select(MCPServer)
        result = await db.execute(stm)
        mcp_servers = result.scalars().all()

        if not mcp_servers:
            return{
                "message": "MCP Server Not Found"
            }

        logging.info(f"Fetch all mcp servrs from databse")

        formatted = []
        seen = set()
        for t in mcp_servers:
            # Repeated /mcp/create calls can leave duplicate rows for one url.
            if t.url in seen:
                continue
            seen.add(t.url)

            formatted.append({
                "name": t.name,
                "url": t.url,
                "tool_count": t.tool_count,
                "is_enabled": t.is_enabled,
            })

        return {
            "server_count": len(formatted),
            "servers": formatted,
            }
    
    except HTTPException as e:
        logger.error(e)
        raise




@mcp_router.get("/tools",status_code=status.HTTP_202_ACCEPTED)
async def list_of_tools(
    db: AsyncSession = Depends(get_db),
    ):
    try:
        # MCPTools has no is_enabled column, so resolve it from the owning
        # MCPServer with a scalar subquery (a JOIN would multiply rows when
        # the same server name exists more than once).
        server_enabled = (
            select(MCPServer.is_enabled)
            .where(MCPServer.name == MCPTools.mcp_server)
            .order_by(MCPServer.created_at.desc())
            .limit(1)
            .scalar_subquery()
        )

        stm = (
            select(MCPTools, server_enabled.label("server_enabled"))
            .order_by(MCPTools.mcp_server, MCPTools.name)
        )

        rows = (await db.execute(stm)).all()

        logging.info(f"Fetch all mcp tools from databse")

        formatted = []
        seen = set()
        for tool, enabled in rows:
            # Rows can be duplicated by repeated /mcp/create calls.
            key = (tool.mcp_server, tool.name)
            if key in seen:
                continue
            seen.add(key)

            formatted.append({
                "id": tool.id,
                "mcp_server": tool.mcp_server,
                "name": tool.name,
                "description": tool.description,
                "is_enabled": bool(enabled) if enabled is not None else False,
                "schema": tool.input_schema,
            })

        return {
            "tool_count": len(formatted),
            "tools": formatted,
            }
    
    except HTTPException as e:
        logger.error(e)
        raise

