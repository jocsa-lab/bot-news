from __future__ import annotations

from runner.adapters.claude_adapter import ClaudeAdapter
from runner.adapters.codex_adapter import CodexAdapter


def get_adapter(name: str):
    adapters = {
        "claude": ClaudeAdapter(),
        "codex": CodexAdapter(),
    }
    try:
        return adapters[name]
    except KeyError as error:
        raise ValueError(f"Unsupported agent: {name}") from error
