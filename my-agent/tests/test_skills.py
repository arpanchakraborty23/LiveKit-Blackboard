"""Tests for skills progressive disclosure and tools_skills."""

import pytest

from tools_skills import (
    append_skills_prompt,
    clear_skills_cache,
    estimate_tokens,
    format_skills_menu,
    read_skill,
    register_skill_cache,
    set_current_assistant,
)


@pytest.fixture(autouse=True)
def _clean_skills():
    clear_skills_cache()
    set_current_assistant("00000000-0000-0000-0000-000000000001")
    yield
    clear_skills_cache()
    set_current_assistant(None)


def test_format_skills_menu_empty() -> None:
    assert format_skills_menu([]) == ""


def test_format_skills_menu_basic() -> None:
    skills = [
        {"name": "triage", "description": "Use when the user reports an incident."},
        {"name": "order_lookup", "description": "Use when the user asks about an existing order."},
    ]
    menu = format_skills_menu(skills)
    assert "# Skills" in menu
    assert "- triage: Use when the user reports an incident." in menu
    assert "- order_lookup: Use when the user asks about an existing order." in menu
    assert "read_skill" in menu


def test_format_skills_menu_budget_truncation() -> None:
    long_desc = "Use when the user needs extensive troubleshooting across complex distributed systems " * 15
    skills = [
        {"name": "heavy_skill_1", "description": long_desc},
        {"name": "heavy_skill_2", "description": long_desc},
    ]

    # Set very small budget
    menu = format_skills_menu(skills, token_budget=40)
    assert "..." in menu
    tokens = estimate_tokens(menu)
    assert tokens <= 60


def test_append_skills_prompt() -> None:
    base = "You are a helpful assistant."
    skills = [{"name": "calc", "description": "Use when the user asks for math calculations."}]
    prompt = append_skills_prompt(base, skills)
    assert prompt.startswith(base)
    assert "- calc: Use when the user asks for math calculations." in prompt


@pytest.mark.asyncio
async def test_read_skill_from_cache() -> None:
    assistant_id = "00000000-0000-0000-0000-000000000001"
    set_current_assistant(assistant_id)
    register_skill_cache(
        assistant_id,
        "triage",
        "# Triage Procedure\nStep 1: Check server logs.\nStep 2: Notify on-call.",
    )

    result = await read_skill("triage")
    assert "Step 1: Check server logs." in result
    assert "Step 2: Notify on-call." in result


@pytest.mark.asyncio
async def test_read_skill_file_from_cache() -> None:
    assistant_id = "00000000-0000-0000-0000-000000000001"
    set_current_assistant(assistant_id)
    register_skill_cache(
        assistant_id,
        "triage",
        "SCHEMA: { error_code: int, status: str }",
        path="schema.json",
    )

    result = await read_skill("triage", path="schema.json")
    assert "SCHEMA:" in result


@pytest.mark.asyncio
async def test_read_skill_missing_graceful() -> None:
    result = await read_skill("nonexistent_skill")
    assert "could not be loaded" in result
    assert "nonexistent_skill" in result
