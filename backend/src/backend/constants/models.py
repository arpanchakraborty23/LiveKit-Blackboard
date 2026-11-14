import uuid
from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Text,
    Boolean,
    Integer,
    Float,
    DateTime,
    ForeignKey,
    JSON,
)
from sqlalchemy.orm import relationship
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def generate_uuid():
    return str(uuid.uuid4())

class Session(Base):
    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(64), nullable=True)
    room_name = Column(String(128), nullable=False)
    token = Column(Text, nullable=False)
    summary = Column(String(1000), nullable=True)
    status = Column(String(32), default="active")
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)


class Prompt(Base):
    __tablename__ = "prompts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(128), nullable=False, default="System Prompt")
    content = Column(Text, nullable=False)
    version = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



class Tool(Base):
    __tablename__ = "tools"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(64), nullable=False)
    kind = Column(String(32), default="custom")
    description = Column(Text, nullable=True)
    is_enabled = Column(Boolean, default=True)
    schema = Column(JSON, nullable=True)
    sort_order = Column(Integer, default=0)



class McpServer(Base):
    __tablename__ = "mcp_servers"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(64), nullable=False)
    url = Column(String(255), nullable=False)
    transport = Column(String(32), default="sse")
    is_active = Column(Boolean, default=True)
    headers = Column(JSON, nullable=True)
    status = Column(String(32), default="unknown")
    status_message = Column(Text, nullable=True)
    last_discovered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    tools = relationship("McpTool", back_populates="server", cascade="all, delete-orphan")


class McpTool(Base):
    __tablename__ = "mcp_tools"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    mcp_server_id = Column(String(36), ForeignKey("mcp_servers.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    input_schema = Column(JSON, nullable=True)
    is_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    server = relationship("McpServer", back_populates="tools")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=True)
    doc_type = Column(String(32), default="text")
    status = Column(String(32), default="indexed")
    chunk_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)



class MemoryProfile(Base):
    __tablename__ = "memory_profile"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(64), nullable=True)
    facts = Column(JSON, default=list)
    preferences = Column(JSON, default=dict)
    summary = Column(Text, nullable=True, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



class MemoryEpisode(Base):
    __tablename__ = "memory_episodes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), nullable=True)
    content = Column(Text, nullable=False)
    source = Column(String(32), default="conversation")
    created_at = Column(DateTime, default=datetime.utcnow)




class Skill(Base):
    __tablename__ = "skills"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(64), nullable=False)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=False)
    is_enabled = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

