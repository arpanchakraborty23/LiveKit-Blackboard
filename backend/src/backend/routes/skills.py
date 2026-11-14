from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from sqlalchemy.orm import Session
from datetime import datetime

try:
    from backend.src.services.database import get_db
    from backend.src.constants.models import Assistant, Skill
    from backend.schemas import SkillCreate, SkillUpdate, SkillResponse
    from backend.src.routes.assistant import get_or_create_default_assistant
except ImportError:
    from backend.src.services.database import get_db
    from backend.src.constants.models import Assistant, Skill
    from schemas import SkillCreate, SkillUpdate, SkillResponse
    from backend.src.routes.assistant import get_or_create_default_assistant

router = APIRouter(tags=["skills"])


def parse_skill_markdown(text: str) -> Dict[str, str]:
    name = "Imported Skill"
    description = ""
    body = text.strip()
    if body.startswith("---"):
        parts = body.split("---", 2)
        if len(parts) >= 3:
            fm = parts[1]
            body = parts[2].strip()
            for line in fm.strip().splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    k = k.strip().lower()
                    v = v.strip().strip("\"'")
                    if k == "name":
                        name = v
                    elif k == "description":
                        description = v
    return {"name": name, "description": description, "body": body}


@router.get("/skills", response_model=Dict[str, Any])
def list_skills(
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        return {"skills": []}

    skills = (
        db.query(Skill)
        .filter(Skill.assistant_id == assistant.id)
        .order_by(Skill.sort_order.asc(), Skill.created_at.asc())
        .all()
    )

    formatted = [
        {
            "id": s.id,
            "assistant_id": s.assistant_id,
            "name": s.name,
            "description": s.description,
            "instructions": s.instructions,
            "body": s.instructions,
            "enabled": s.is_enabled,
            "is_enabled": s.is_enabled,
            "sort_order": s.sort_order,
            "created_at": s.created_at,
            "updated_at": s.updated_at,
            "files_count": 0,
            "files": [],
        }
        for s in skills
    ]
    return {"skills": formatted}


@router.post("/skills", response_model=Dict[str, Any])
async def manage_or_create_skill(
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

    action = body.get("action")

    # Handle batch action: reorder
    if action == "reorder" and isinstance(body.get("orders"), list):
        for item in body["orders"]:
            if "id" in item and "sort_order" in item:
                db.query(Skill).filter(
                    Skill.id == item["id"],
                    Skill.assistant_id == assistant.id,
                ).update({"sort_order": int(item["sort_order"])})
        db.commit()
        return {"success": True}

    # Handle batch action: toggle
    if action == "toggle" and "id" in body and "enabled" in body:
        skill = (
            db.query(Skill)
            .filter(Skill.id == body["id"], Skill.assistant_id == assistant.id)
            .first()
        )
        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")
        skill.is_enabled = bool(body["enabled"])
        skill.updated_at = datetime.utcnow()
        db.commit()
        return {"success": True, "enabled": skill.is_enabled}

    # Parse raw content if provided
    name = body.get("name")
    description = body.get("description", "")
    instructions = body.get("instructions") or body.get("body", "")

    if body.get("raw_content") and (not name or not instructions):
        parsed = parse_skill_markdown(body["raw_content"])
        name = name or parsed["name"]
        description = description or parsed["description"]
        instructions = instructions or parsed["body"]

    if not name or not instructions:
        raise HTTPException(status_code=400, detail="Skill name and instructions/body are required")

    is_enabled = bool(body.get("is_enabled", body.get("enabled", True)))
    sort_order = int(body.get("sort_order", 0))

    new_skill = Skill(
        assistant_id=assistant.id,
        name=name,
        description=description,
        instructions=instructions,
        is_enabled=is_enabled,
        sort_order=sort_order,
    )
    db.add(new_skill)
    db.commit()
    db.refresh(new_skill)

    return {
        "success": True,
        "skill": {
            "id": new_skill.id,
            "assistant_id": new_skill.assistant_id,
            "name": new_skill.name,
            "description": new_skill.description,
            "instructions": new_skill.instructions,
            "body": new_skill.instructions,
            "enabled": new_skill.is_enabled,
            "is_enabled": new_skill.is_enabled,
            "sort_order": new_skill.sort_order,
            "created_at": new_skill.created_at,
        },
    }


@router.put("/skills/{skill_id}", response_model=SkillResponse)
def update_skill(
    skill_id: str,
    payload: SkillUpdate,
    db: Session = Depends(get_db),
):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    if payload.name is not None:
        skill.name = payload.name
    if payload.description is not None:
        skill.description = payload.description
    if payload.instructions is not None:
        skill.instructions = payload.instructions
    if payload.is_enabled is not None:
        skill.is_enabled = payload.is_enabled
    if payload.sort_order is not None:
        skill.sort_order = payload.sort_order

    skill.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(skill)
    return skill


@router.delete("/skills/{skill_id}")
def delete_skill(
    skill_id: str,
    db: Session = Depends(get_db),
):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    db.delete(skill)
    db.commit()
    return {"success": True, "message": "Skill deleted"}


@router.post("/skills/import")
async def import_skills(
    request: Request,
    file: Optional[UploadFile] = File(None),
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    file_text = ""
    if file:
        raw_bytes = await file.read()
        file_text = raw_bytes.decode("utf-8", errors="replace")
    else:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            body = await request.json()
            if isinstance(body, list):
                # Batch list of skills
                count = 0
                for item in body:
                    s = Skill(
                        assistant_id=assistant.id,
                        name=item.get("name", "Imported Skill"),
                        description=item.get("description", ""),
                        instructions=item.get("instructions") or item.get("body", ""),
                        is_enabled=bool(item.get("is_enabled", item.get("enabled", True))),
                    )
                    db.add(s)
                    count += 1
                db.commit()
                return {"success": True, "imported_count": count}
            file_text = body.get("content", "")
        else:
            file_text = (await request.body()).decode("utf-8", errors="replace")

    if not file_text.strip():
        raise HTTPException(status_code=400, detail="Skill content is empty")

    parsed = parse_skill_markdown(file_text)
    skill = Skill(
        assistant_id=assistant.id,
        name=parsed["name"],
        description=parsed["description"],
        instructions=parsed["body"],
        is_enabled=True,
    )
    db.add(skill)
    db.commit()
    db.refresh(skill)

    return {
        "success": True,
        "skill": {
            "id": skill.id,
            "name": skill.name,
            "description": skill.description,
            "instructions": skill.instructions,
            "enabled": skill.is_enabled,
        },
    }


@router.get("/skills/export")
def export_skills(
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        return {"skills": []}

    skills = (
        db.query(Skill)
        .filter(Skill.assistant_id == assistant.id)
        .order_by(Skill.sort_order.asc())
        .all()
    )

    return {
        "assistant_id": assistant.id,
        "exported_at": datetime.utcnow().isoformat(),
        "skills": [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "instructions": s.instructions,
                "is_enabled": s.is_enabled,
                "sort_order": s.sort_order,
            }
            for s in skills
        ],
    }
