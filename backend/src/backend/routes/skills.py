import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.services.database import get_db
from backend.constants.models import Skill
from backend.constants.schemas import SkillCreate, SkillUpdate

logger = logging.getLogger(__name__)

skills_router = APIRouter(
    prefix="/skills",
    tags=["Skills"],
)


@skills_router.get("/active", status_code=status.HTTP_200_OK)
async def list_active_skills(
    db: AsyncSession = Depends(get_db),
):
    try:
        stmt = (
            select(Skill)
            .where(Skill.is_enabled.is_(True))
            .order_by(Skill.sort_order.asc(), Skill.created_at.asc())
        )
        result = await db.execute(stmt)
        skills = result.scalars().all()

        formatted = [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "instructions": s.instructions,
                "is_enabled": s.is_enabled,
                "sort_order": s.sort_order,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in skills
        ]
        return {
            "count": len(formatted),
            "data": formatted,
            "skills": formatted,
        }
    except Exception as exc:
        logger.exception("Failed to retrieve active skills")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve active skills",
        ) from exc


@skills_router.get("", status_code=status.HTTP_200_OK)
@skills_router.get("/get", status_code=status.HTTP_200_OK)
async def list_skills(
    db: AsyncSession = Depends(get_db),
):
    try:
        stmt = select(Skill).order_by(Skill.sort_order.asc(), Skill.created_at.asc())
        result = await db.execute(stmt)
        skills = result.scalars().all()

        formatted = [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "instructions": s.instructions,
                "is_enabled": s.is_enabled,
                "sort_order": s.sort_order,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in skills
        ]
        return {
            "count": len(formatted),
            "data": formatted,
            "skills": formatted,
        }
    except Exception as exc:
        logger.exception("Failed to retrieve skills")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve skills",
        ) from exc


@skills_router.post("", status_code=status.HTTP_201_CREATED)
@skills_router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_skill(
    payload: SkillCreate,
    db: AsyncSession = Depends(get_db),
):
    try:
        if not payload.name or not payload.instructions:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Name and instructions are required",
            )

        new_skill = Skill(
            name=payload.name,
            description=payload.description or "",
            instructions=payload.instructions,
            is_enabled=payload.is_enabled if payload.is_enabled is not None else True,
            sort_order=payload.sort_order or 0,
        )
        db.add(new_skill)
        await db.commit()
        await db.refresh(new_skill)

        logger.info("Skill created: %s (%s)", new_skill.name, new_skill.id)
        return {
            "message": "Skill created successfully",
            "skill": {
                "id": new_skill.id,
                "name": new_skill.name,
                "description": new_skill.description,
                "instructions": new_skill.instructions,
                "is_enabled": new_skill.is_enabled,
                "sort_order": new_skill.sort_order,
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to create skill")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create skill",
        ) from exc


@skills_router.post("/toggle", status_code=status.HTTP_200_OK)
async def toggle_skill(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    try:
        body = await request.json()
        skill_id = body.get("id")
        is_enabled = body.get("is_enabled", body.get("enabled", True))

        if not skill_id:
            raise HTTPException(status_code=400, detail="Skill id is required")

        stmt = select(Skill).where(Skill.id == skill_id)
        result = await db.execute(stmt)
        skill = result.scalar_one_or_none()

        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")

        skill.is_enabled = bool(is_enabled)
        await db.commit()
        await db.refresh(skill)

        return {"success": True, "id": skill.id, "is_enabled": skill.is_enabled}
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to toggle skill")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to toggle skill",
        ) from exc


@skills_router.put("/{skill_id}", status_code=status.HTTP_200_OK)
@skills_router.put("/update/{skill_id}", status_code=status.HTTP_200_OK)
async def update_skill(
    skill_id: str,
    payload: SkillUpdate,
    db: AsyncSession = Depends(get_db),
):
    try:
        stmt = select(Skill).where(Skill.id == skill_id)
        result = await db.execute(stmt)
        skill = result.scalar_one_or_none()

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

        await db.commit()
        await db.refresh(skill)

        return {
            "message": "Skill updated successfully",
            "skill": {
                "id": skill.id,
                "name": skill.name,
                "description": skill.description,
                "instructions": skill.instructions,
                "is_enabled": skill.is_enabled,
                "sort_order": skill.sort_order,
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to update skill")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update skill",
        ) from exc


@skills_router.delete("/{skill_id}", status_code=status.HTTP_200_OK)
@skills_router.delete("/delete/{skill_id}", status_code=status.HTTP_200_OK)
async def delete_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        stmt = select(Skill).where(Skill.id == skill_id)
        result = await db.execute(stmt)
        skill = result.scalar_one_or_none()

        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")

        await db.delete(skill)
        await db.commit()

        logger.info("Skill deleted: %s", skill_id)
        return {"success": True, "message": "Skill deleted", "id": skill_id}
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to delete skill")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete skill",
        ) from exc
