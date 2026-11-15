import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.services.database import get_db
from backend.constants.models import Prompts
from backend.constants.schemas import (
    PromptCreateRequest,
    PromptUpdateRequest,
    SystemPromptUpdate,
)

logger = logging.getLogger(__name__)

prompt_route = APIRouter(
    prefix="/prompts",
    tags=["Prompts"],
)

# The static system prompt is a reserved row inside the existing prompts table.
SYSTEM_PROMPT_ID = "system"
SYSTEM_PROMPT_NAME = "System Prompt"


async def get_or_create_system_prompt(db: AsyncSession) -> Prompts:
    stmt = select(Prompts).where(Prompts.id == SYSTEM_PROMPT_ID)
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()

    if record is None:
        record = Prompts(
            id=SYSTEM_PROMPT_ID,
            name=SYSTEM_PROMPT_NAME,
            content="",
            is_active=True,
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)

    return record


def _serialize_system_prompt(record: Prompts) -> dict:
    return {
        "id": record.id,
        "name": record.name,
        "content": record.content or "",
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
    }


# GET: Retrieve the static system prompt (always active, never deletable)
@prompt_route.get("/system", status_code=status.HTTP_200_OK)
async def read_system_prompt(
    db: AsyncSession = Depends(get_db),
):
    try:
        record = await get_or_create_system_prompt(db)
        data = _serialize_system_prompt(record)
        return {"data": data, **data}
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to retrieve system prompt")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve system prompt",
        ) from exc


# PUT: Save the static system prompt
@prompt_route.put("/system", status_code=status.HTTP_200_OK)
async def update_system_prompt(
    payload: SystemPromptUpdate,
    db: AsyncSession = Depends(get_db),
):
    try:
        record = await get_or_create_system_prompt(db)

        record.content = payload.content or ""
        record.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(record)

        logger.info("System prompt updated")

        data = _serialize_system_prompt(record)
        return {"message": "System prompt saved", "data": data, **data}
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to update system prompt")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update system prompt",
        ) from exc


# GET: Retrieve all active prompts specifically for agent execution
@prompt_route.get("/active", status_code=status.HTTP_200_OK)
async def list_active_prompts(
    db: AsyncSession = Depends(get_db),
):
    try:
        stmt = (
            select(Prompts)
            .where(Prompts.is_active.is_(True))
            .order_by(Prompts.created_at.asc())
        )
        result = await db.execute(stmt)
        all_active = result.scalars().all()

        # The reserved system prompt row is reported separately and always comes first.
        system_prompt = next((p for p in all_active if p.id == SYSTEM_PROMPT_ID), None)
        prompts = [p for p in all_active if p.id != SYSTEM_PROMPT_ID]

        system_content = (system_prompt.content or "").strip() if system_prompt else ""

        combined = "\n\n".join(
            part
            for part in [system_content, *(p.content.strip() for p in prompts if p.content)]
            if part
        )

        return {
            "count": len(prompts),
            "data": prompts,
            "system_prompt": system_content,
            "combined_prompt": combined,
        }
    except Exception as exc:
        logger.exception("Failed to retrieve active prompts")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve active prompts",
        ) from exc


# GET: Retrieve prompts (all or active only)
@prompt_route.get("", status_code=status.HTTP_200_OK)
@prompt_route.get("/get", status_code=status.HTTP_200_OK)
async def list_of_prompts(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    try:
        stmt = (
            select(Prompts)
            .where(Prompts.id != SYSTEM_PROMPT_ID)
            .order_by(Prompts.updated_at.desc())
        )
        if active_only:
            stmt = stmt.where(Prompts.is_active.is_(True))

        result = await db.execute(stmt)
        prompts = result.scalars().all()

        return {
            "count": len(prompts),
            "data": prompts,
        }

    except Exception as exc:
        logger.exception("Failed to retrieve prompts")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve prompts",
        ) from exc


# POST: Create a prompt (multiple prompts can be active at the same time)
@prompt_route.post("", status_code=status.HTTP_201_CREATED)
@prompt_route.post("/create", status_code=status.HTTP_201_CREATED)
async def create_prompts(
    payload: PromptCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        if not payload.content or not payload.content.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Prompt content is required",
            )

        name = (payload.name or "").strip() or "Untitled Prompt"

        new_prompt = Prompts(
            name=name,
            content=payload.content.strip(),
            is_active=payload.is_active if payload.is_active is not None else True,
        )

        db.add(new_prompt)
        await db.commit()
        await db.refresh(new_prompt)

        logger.info("New prompt created: %s (%s, active=%s)", name, new_prompt.id, new_prompt.is_active)

        return {
            "message": "Prompt created successfully",
            "data": new_prompt,
        }

    except HTTPException:
        raise

    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to create prompt")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create prompt",
        ) from exc


# POST: Toggle prompt active state independently (multiple active prompts supported)
@prompt_route.post("/toggle", status_code=status.HTTP_200_OK)
async def toggle_prompt(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    try:
        body = await request.json()
        prompt_id = body.get("id")
        target_state = body.get("is_active")

        if not prompt_id:
            raise HTTPException(status_code=400, detail="Prompt ID is required")

        if prompt_id == SYSTEM_PROMPT_ID:
            raise HTTPException(
                status_code=400,
                detail="The system prompt is always active",
            )

        stmt = select(Prompts).where(Prompts.id == prompt_id)
        result = await db.execute(stmt)
        prompt = result.scalar_one_or_none()

        if prompt is None:
            raise HTTPException(status_code=404, detail="Prompt not found")

        if target_state is not None:
            prompt.is_active = bool(target_state)
        else:
            prompt.is_active = not prompt.is_active

        prompt.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(prompt)

        logger.info("Prompt %s toggled active=%s", prompt.id, prompt.is_active)

        return {
            "message": "Prompt active status toggled",
            "data": prompt,
            "id": prompt.id,
            "is_active": prompt.is_active,
        }
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to toggle prompt")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to toggle prompt",
        ) from exc


# PUT: Set prompt as active
@prompt_route.put("/activate/{prompt_id}", status_code=status.HTTP_200_OK)
async def activate_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        stmt = select(Prompts).where(Prompts.id == prompt_id)
        result = await db.execute(stmt)
        target = result.scalar_one_or_none()

        if target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Prompt not found",
            )

        target.is_active = True
        target.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(target)

        logger.info("Prompt activated: %s", prompt_id)

        return {
            "message": "Prompt activated successfully",
            "data": target,
        }

    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to activate prompt")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to activate prompt",
        ) from exc


# PUT: Set prompt as inactive
@prompt_route.put("/deactivate/{prompt_id}", status_code=status.HTTP_200_OK)
async def deactivate_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        if prompt_id == SYSTEM_PROMPT_ID:
            raise HTTPException(
                status_code=400,
                detail="The system prompt cannot be deactivated",
            )

        stmt = select(Prompts).where(Prompts.id == prompt_id)
        result = await db.execute(stmt)
        target = result.scalar_one_or_none()

        if target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Prompt not found",
            )

        target.is_active = False
        target.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(target)

        logger.info("Prompt deactivated: %s", prompt_id)

        return {
            "message": "Prompt deactivated successfully",
            "data": target,
        }

    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to deactivate prompt")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to deactivate prompt",
        ) from exc


# PUT: Update an existing prompt
@prompt_route.put("/{prompt_id}", status_code=status.HTTP_200_OK)
@prompt_route.put("/update/{prompt_id}", status_code=status.HTTP_200_OK)
async def update_prompt(
    prompt_id: str,
    payload: PromptUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        stmt = select(Prompts).where(Prompts.id == prompt_id)
        result = await db.execute(stmt)
        existing_prompt = result.scalar_one_or_none()

        if existing_prompt is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Prompt not found",
            )

        if payload.name is not None:
            existing_prompt.name = payload.name

        if payload.content is not None:
            existing_prompt.content = payload.content

        if payload.is_active is not None:
            existing_prompt.is_active = payload.is_active

        existing_prompt.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing_prompt)

        logger.info("Prompt updated: %s", prompt_id)

        return {
            "message": "Prompt updated successfully",
            "data": existing_prompt,
        }

    except HTTPException:
        raise

    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to update prompt")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update prompt",
        ) from exc


@prompt_route.delete("/{prompt_id}", status_code=status.HTTP_200_OK)
@prompt_route.delete("/delete/{prompt_id}", status_code=status.HTTP_200_OK)
async def delete_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        if prompt_id == SYSTEM_PROMPT_ID:
            raise HTTPException(
                status_code=400,
                detail="The system prompt cannot be deleted",
            )

        stmt = select(Prompts).where(Prompts.id == prompt_id)
        result = await db.execute(stmt)
        prompt = result.scalar_one_or_none()

        if prompt is None:
            raise HTTPException(
                status_code=404,
                detail="Prompt not found",
            )

        await db.delete(prompt)
        await db.commit()

        logger.info("Prompt deleted: %s", prompt_id)

        return {
            "message": "Prompt deleted successfully",
            "id": prompt_id,
        }

    except HTTPException:
        raise

    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to delete prompt")

        raise HTTPException(
            status_code=500,
            detail="Failed to delete prompt",
        ) from exc


# GET: Export all prompts as JSON
@prompt_route.get("/export/json")
async def export_prompts_json(
    db: AsyncSession = Depends(get_db),
):
    try:
        stmt = select(Prompts).order_by(Prompts.created_at)
        result = await db.execute(stmt)
        prompts = result.scalars().all()

        export_data = []
        for prompt in prompts:
            export_data.append({
                "id": str(prompt.id),
                "name": prompt.name,
                "content": prompt.content,
                "is_active": prompt.is_active,
                "created_at": prompt.created_at.isoformat() if prompt.created_at else None,
                "updated_at": prompt.updated_at.isoformat() if prompt.updated_at else None,
            })

        export_payload = {
            "exported_at": datetime.utcnow().isoformat(),
            "total_prompts": len(export_data),
            "prompts": export_data,
        }

        json_content = json.dumps(
            export_payload,
            indent=4,
            ensure_ascii=False,
        )

        return Response(
            content=json_content,
            media_type="application/json",
            headers={
                "Content-Disposition": 'attachment; filename="prompts_export.json"'
            },
        )

    except Exception as exc:
        logger.exception("Failed to export prompts")
        raise HTTPException(
            status_code=500,
            detail="Failed to export prompts",
        ) from exc
