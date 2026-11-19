import uuid
from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Text,
    Boolean,
    Integer,
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
    __tablename__ = "Sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(64), nullable=True)
    room_name = Column(String(128), nullable=False)
    token = Column(Text, nullable=False)
    summary = Column(String(1000), nullable=True)
    status = Column(String(32), default="active")
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)


class Prompts(Base):
    __tablename__ = "Prompts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(128), nullable=False, default="System Prompt")
    content = Column(Text, nullable=False)
    version = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class MCPServer(Base):
    __tablename__ = "MCPServer"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(26),nullable=False)
    url = Column(String(100),nullable=False)
    key = Column(String(26),nullable=False)
    tool_count = Column(Integer,nullable=False)
    is_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)



class MCPTools(Base):
    __tablename__ = "MCPTools"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    mcp_server = Column(String(255),nullable=False)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    input_schema = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.now)




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

