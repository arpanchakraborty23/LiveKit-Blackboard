import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.services.database import get_db
from backend.constants.models import Prompts
from backend.constants.schemas import (
    PromptCreateRequest,
    PromptUpdateRequest,
)

logger = logging.getLogger(__name__)

prompt_route = APIRouter(
    prefix="/prompts",
    tags=["Prompts"],
)


# GET: Retrieve all active prompts
@prompt_route.get("/get", status_code=status.HTTP_200_OK)
async def list_of_prompts(
    db: AsyncSession = Depends(get_db),
):
    try:
        stmt = select(Prompts).where(
            Prompts.is_active.is_(True)
        )

        result = await db.execute(stmt)
        prompts = result.scalars().all()

        if not prompts:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No prompts found in database",
            )

        return {
            "count": len(prompts),
            "data": prompts,
        }

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception("Failed to retrieve prompts")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve prompts",
        ) from exc


# POST: Create a prompt
@prompt_route.post("/create",status_code=status.HTTP_201_CREATED,)
async def create_prompts(
    payload: PromptCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        if not payload.name or not payload.content:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Name and content are required",
            )

        new_prompt = Prompts(
            name=payload.name,
            content=payload.content,
            is_active=True,
        )

        db.add(new_prompt)

        await db.commit()
        await db.refresh(new_prompt)

        logger.info("New prompt created: %s", payload.name)

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


# PUT: Update an existing prompt
@prompt_route.put("/update/{prompt_id}",status_code=status.HTTP_200_OK,)
async def update_prompt(prompt_id: str,payload: PromptUpdateRequest,db: AsyncSession = Depends(get_db)):
    try:
        # Find existing prompt
        stmt = select(Prompts).where(
            Prompts.id == prompt_id
        )

        result = await db.execute(stmt)
        existing_prompt = result.scalar_one_or_none()

        if existing_prompt is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Prompt not found",
            )

        # Update existing object
        if payload.name is not None:
            existing_prompt.name = payload.name

        if payload.content is not None:
            existing_prompt.content = payload.content

        if payload.is_active is not None:
            existing_prompt.is_active = payload.is_active

        await db.commit()
        await db.refresh(existing_prompt)

        logger.info("Prompt updated: %s", id)

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


@prompt_route.delete("/delete/{prompt_id}",status_code=status.HTTP_200_OK,)
async def delete_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_db),
):
    try:
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
        stmt = select(Prompts).order_by(Prompts.id)

        result = await db.execute(stmt)
        prompts = result.scalars().all()

        export_data = []

        for prompt in prompts:
            export_data.append({
                "id": str(prompt.id),
                "name": prompt.name,
                "content": prompt.content,
                "is_active": prompt.is_active,
            })

        export_payload = {
            "exported_at": datetime.now().astimezone().isoformat(),
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
                "Content-Disposition":
                    'attachment; filename="prompts_export.json"'
            },
        )

    except Exception as exc:
        logger.exception("Failed to export prompts")

        raise HTTPException(
            status_code=500,
            detail="Failed to export prompts",
        ) from exc
