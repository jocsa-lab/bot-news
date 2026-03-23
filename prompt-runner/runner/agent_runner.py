from __future__ import annotations

import logging
import shlex
import subprocess
import time
from collections import Counter, deque
from pathlib import Path

from runner.adapters import get_adapter
from runner.models import AppConfig, PromptFile, PromptRunResult, PromptStatus, RunnerState


MEMORY_INSTRUCTIONS = """Mandatory execution rules:
- Use the MCP `server-memory` exhaustively.
- Consult `server-memory` before taking action.
- Record useful memory in `server-memory` after taking action.
- Preserve continuity with previous prompts.
- Apply changes only in the current project workspace.
"""

# Verbose stage header refresh settings
_VERBOSE_HEADER_LINE_INTERVAL = 10
_VERBOSE_HEADER_TIME_INTERVAL = 5.0  # seconds


class AgentRunner:
    def __init__(self, config: AppConfig, logger: logging.Logger, ui) -> None:
        self.config = config
        self.logger = logger
        self.ui = ui
        self.adapter = get_adapter(config.agent)

    def run_prompt(
        self,
        prompt: PromptFile,
        prompt_files: list[PromptFile],
        state: RunnerState,
        *,
        attempt: int = 1,
    ) -> PromptRunResult:
        prompt_text = build_execution_prompt(prompt, prompt_files, state)
        invocation = self.adapter.build_invocation(
            model=self.config.model,
            cwd=self.config.project_root,
            prompt_text=prompt_text,
        )

        run_dir = self.config.runs_dir / self.config.run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        log_path = run_dir / f"{prompt.index:03d}_{safe_file_name(prompt.name)}.log"
        display_command = invocation.display_command or invocation.command

        self.logger.info(
            "Running prompt %s with %s",
            prompt.name,
            shlex.join(display_command),
        )

        total = len(prompt_files)
        start_time = time.monotonic()
        tail: deque[str] = deque(maxlen=40)

        # Verbose tracking counters
        lines_since_header = 0
        last_header_time = start_time

        # Print the initial stage header in verbose mode
        if self.config.verbose and not self.config.quiet:
            self.ui.print_verbose_stage_header(prompt, total, attempt, 0.0)

        with log_path.open("w", encoding="utf-8") as handle:
            handle.write(f"$ {shlex.join(display_command)}\n\n")
            process = subprocess.Popen(
                invocation.command,
                cwd=self.config.project_root,
                stdin=subprocess.PIPE if invocation.stdin_text is not None else None,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )

            if invocation.stdin_text is not None and process.stdin is not None:
                process.stdin.write(invocation.stdin_text)
                process.stdin.close()

            assert process.stdout is not None
            for line in process.stdout:
                handle.write(line)
                tail.append(line.rstrip())

                if self.config.verbose and not self.config.quiet:
                    self.ui.stream_agent_output(line.rstrip())

                    # Refresh stage header periodically
                    lines_since_header += 1
                    now = time.monotonic()
                    elapsed = now - start_time
                    time_since_header = now - last_header_time

                    if (
                        lines_since_header >= _VERBOSE_HEADER_LINE_INTERVAL
                        or time_since_header >= _VERBOSE_HEADER_TIME_INTERVAL
                    ):
                        self.ui.print_verbose_stage_header(
                            prompt, total, attempt, elapsed,
                        )
                        lines_since_header = 0
                        last_header_time = now

            exit_code = process.wait()

        duration = time.monotonic() - start_time
        excerpt = "\n".join(line for line in tail if line.strip())
        if not excerpt:
            excerpt = f"{self.adapter.name} exited with code {exit_code}"

        return PromptRunResult(
            success=exit_code == 0,
            exit_code=exit_code,
            duration_seconds=duration,
            output_excerpt=excerpt,
            log_path=log_path,
        )


def build_execution_prompt(
    prompt: PromptFile,
    prompt_files: list[PromptFile],
    state: RunnerState,
) -> str:
    counts = Counter(
        prompt_state.status.value for prompt_state in state.prompts.values()
    )
    completed_prompts = [
        prompt_file.name
        for prompt_file in prompt_files
        if state.prompts.get(prompt_file.name)
        and state.prompts[prompt_file.name].status == PromptStatus.COMPLETED
    ]

    completed_preview = completed_prompts[-10:]
    if completed_preview:
        completed_block = "\n".join(f"- {name}" for name in completed_preview)
    else:
        completed_block = "- none"

    return f"""{MEMORY_INSTRUCTIONS}
Execution context:
- Current prompt position: {prompt.index}/{len(prompt_files)}
- Current prompt file: {prompt.name}
- Prompt title: {prompt.title}
- Prompts directory: {state.prompts_dir}
- Completed prompts: {len(completed_prompts)}
- State summary: pending={counts.get('pending', 0)}, running={counts.get('running', 0)}, completed={counts.get('completed', 0)}, failed={counts.get('failed', 0)}, skipped={counts.get('skipped', 0)}

Recently completed prompts:
{completed_block}

Instructions:
- Work only in the current project.
- Use the prompt file below as the task to execute now.
- Make changes directly in the repository when the task requires it.
- Be explicit and consistent with memory usage.

Prompt file content:
```text
{prompt.content}
```
"""


def safe_file_name(name: str) -> str:
    return "".join(character if character.isalnum() or character in {"-", "_", "."} else "_" for character in name)
