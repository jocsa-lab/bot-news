from __future__ import annotations

from pathlib import Path

from runner.models import AgentInvocation


class ClaudeAdapter:
    name = "claude"

    def build_invocation(self, model: str, cwd: Path, prompt_text: str) -> AgentInvocation:
        command = ["claude", "-p", "--dangerously-skip-permissions", "--add-dir", str(cwd)]
        if model:
            command.extend(["--model", model])
        display_command = command.copy()
        command.append(prompt_text)
        return AgentInvocation(
            command=command,
            stdin_text=None,
            display_command=display_command,
        )
