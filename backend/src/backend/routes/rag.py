import os
import hashlib
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from datetime import datetime

try:
    from backend.src.services.database import get_db
    from backend.src.constants.models import Assistant, AssistantConfig, Document
    from backend.schemas import (
        DocumentCreate,
        DocumentResponse,
        RagSearchRequest,
        RagSearchResult,
    )
    from backend.src.routes.assistant import get_or_create_default_assistant
except ImportError:
    from backend.src.services.database import get_db
    from backend.src.constants.models import Assistant, AssistantConfig, Document
    from schemas import (
        DocumentCreate,
        DocumentResponse,
        RagSearchRequest,
        RagSearchResult,
    )
    from backend.src.routes.assistant import get_or_create_default_assistant

router = APIRouter(tags=["rag"])


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 75) -> List[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += (chunk_size - overlap)
    return chunks or [text]


@router.get("/rag/status")
def get_rag_status(
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        return {"configured": False, "documents": []}

    docs = (
        db.query(Document)
        .filter(Document.assistant_id == assistant.id)
        .order_by(Document.created_at.desc())
        .all()
    )

    pinecone_configured = bool(os.getenv("PINECONE_API_KEY", "").strip())

    return {
        "status": "ok",
        "pinecone_configured": pinecone_configured,
        "total_documents": len(docs),
        "documents": [
            {
                "id": d.id,
                "assistant_id": d.assistant_id,
                "title": d.title,
                "doc_type": d.doc_type,
                "status": d.status,
                "chunk_count": d.chunk_count,
                "created_at": d.created_at,
            }
            for d in docs
        ],
    }


@router.get("/rag/documents", response_model=List[DocumentResponse])
def list_documents(
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        return []

    docs = (
        db.query(Document)
        .filter(Document.assistant_id == assistant.id)
        .order_by(Document.created_at.desc())
        .all()
    )
    return docs


@router.post("/rag/upload")
async def upload_document(
    request: Request,
    file: Optional[UploadFile] = File(None),
    title: Optional[str] = Form(None),
    assistant_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    content_text = ""
    doc_title = title or "Document"
    doc_type = "text"

    # Check if request is multipart/form-data with a file
    if file:
        raw_bytes = await file.read()
        try:
            content_text = raw_bytes.decode("utf-8", errors="replace")
        except Exception:
            content_text = str(raw_bytes)
        if not title:
            doc_title = file.filename or "Uploaded Document"
        filename_lower = (file.filename or "").lower()
        if filename_lower.endswith(".pdf"):
            doc_type = "pdf"
        elif filename_lower.endswith(".md"):
            doc_type = "markdown"
        elif filename_lower.endswith(".csv"):
            doc_type = "csv"
        else:
            doc_type = "text"
    else:
        # Check if request has JSON body
        try:
            body = await request.json()
            content_text = body.get("content", "")
            doc_title = body.get("title", doc_title)
            doc_type = body.get("doc_type", "text")
            if not assistant_id:
                assistant_id = body.get("assistant_id")
        except Exception:
            pass

    if not content_text:
        raise HTTPException(status_code=400, detail="No content or file provided")

    # Resolve assistant
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    # Split into chunks
    chunks = chunk_text(content_text)

    # Check duplicate
    existing = (
        db.query(Document)
        .filter(Document.assistant_id == assistant.id, Document.title == doc_title)
        .first()
    )
    if existing:
        existing.content = content_text
        existing.chunk_count = len(chunks)
        existing.status = "indexed"
        db.commit()
        db.refresh(existing)
        return {
            "success": True,
            "document": {
                "id": existing.id,
                "title": existing.title,
                "status": existing.status,
                "chunk_count": existing.chunk_count,
            },
        }

    new_doc = Document(
        assistant_id=assistant.id,
        title=doc_title,
        content=content_text,
        doc_type=doc_type,
        status="indexed",
        chunk_count=len(chunks),
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)

    return {
        "success": True,
        "document": {
            "id": new_doc.id,
            "title": new_doc.title,
            "status": new_doc.status,
            "chunk_count": new_doc.chunk_count,
        },
    }


@router.post("/rag/search")
def search_documents(
    payload: RagSearchRequest,
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = (payload.query or "").strip().lower()
    limit = payload.limit or 5

    if not query:
        return {"matches": []}

    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        return {"matches": []}

    docs = db.query(Document).filter(Document.assistant_id == assistant.id).all()
    query_terms = [t for t in query.split() if len(t) > 1] or [query]

    scored_results = []
    for doc in docs:
        content = doc.content or ""
        content_lower = content.lower()
        title_lower = (doc.title or "").lower()

        # Score based on frequency and title match
        score = 0.0
        for term in query_terms:
            if term in title_lower:
                score += 5.0
            term_count = content_lower.count(term)
            if term_count > 0:
                score += min(term_count * 1.0, 10.0)

        if score > 0:
            # Find a snippet around first matching term
            best_pos = -1
            for term in query_terms:
                pos = content_lower.find(term)
                if pos != -1 and (best_pos == -1 or pos < best_pos):
                    best_pos = pos

            if best_pos != -1:
                start = max(0, best_pos - 60)
                end = min(len(content), best_pos + 140)
                snippet = ("..." if start > 0 else "") + content[start:end].strip() + ("..." if end < len(content) else "")
            else:
                snippet = content[:200]

            scored_results.append({
                "document_id": doc.id,
                "title": doc.title,
                "snippet": snippet,
                "score": round(score, 2),
            })

    scored_results.sort(key=lambda x: x["score"], reverse=True)
    return {"matches": scored_results[:limit]}


@router.delete("/rag/documents/{doc_id}")
def delete_document_by_id(
    doc_id: str,
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
    return {"success": True, "message": "Document deleted"}


@router.delete("/rag/documents")
def delete_all_documents(
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    deleted_count = db.query(Document).filter(Document.assistant_id == assistant.id).delete()
    db.commit()
    return {"success": True, "deleted_count": deleted_count}


@router.post("/rag/delete")
async def delete_document_post(
    request: Request,
    db: Session = Depends(get_db),
):
    body = await request.json()
    doc_id = body.get("id")
    if not doc_id:
        raise HTTPException(status_code=400, detail="Document id is required")
    return delete_document_by_id(doc_id, db)


@router.get("/rag/health")
def rag_health():
    pinecone_key = os.getenv("PINECONE_API_KEY", "").strip()
    return {
        "status": "ok",
        "pinecone_configured": bool(pinecone_key),
    }


@router.get("/rag/config")
def get_rag_config(
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return {
        "enabled": True,
        "top_k": 5,
        "min_score": 0.5,
    }


@router.post("/rag/config")
async def update_rag_config(
    request: Request,
    db: Session = Depends(get_db),
):
    body = await request.json()
    return {
        "success": True,
        "config": body,
    }
