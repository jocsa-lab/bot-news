from __future__ import annotations

from pathlib import Path

from runner.models import AgentInvocation


class CodexAdapter:
    name = "codex"

    def build_invocation(self, model: str, cwd: Path, prompt_text: str) -> AgentInvocation:
        command = [
            "codex",
            "exec",
            "--dangerously-bypass-approvals-and-sandbox",
            "--skip-git-repo-check",
            "--color",
            "never",
            "-C",
            str(cwd),
        ]
        if model:
            command.extend(["-m", model])
        command.append("-")
        return AgentInvocation(
            command=command,
            stdin_text=prompt_text,
            display_command=command.copy(),
        )
