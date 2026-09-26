"""Unit tests for the join greeting (Assistant.on_enter)."""


class FakeSession:
    def __init__(self) -> None:
        self.reply_instructions: list[str] = []

    async def generate_reply(self, instructions: str) -> None:
        self.reply_instructions.append(instructions)


async def test_greets_first_with_no_tools(monkeypatch):
    from agent import Assistant

    session = FakeSession()
    monkeypatch.setattr(Assistant, "session", session)

    await Assistant().on_enter()

    assert len(session.reply_instructions) == 1
    greeting = session.reply_instructions[0].lower()
    assert "exia" in greeting
    assert "no tools" in greeting
    assert any(
        part in greeting for part in ("good morning", "good afternoon", "good evening")
    )
