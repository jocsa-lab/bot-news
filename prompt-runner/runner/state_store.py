from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from runner.models import PromptExecutionState, PromptFile, PromptStatus, RunnerState


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class StateStore:
    def __init__(self, state_file: Path, logger: logging.Logger) -> None:
        self.state_file = state_file
        self.logger = logger

    def load_or_create(
        self,
        prompts_dir: Path,
        prompts_signature: str,
        run_id: str,
    ) -> RunnerState:
        if self.state_file.exists():
            data = json.loads(self.state_file.read_text(encoding="utf-8"))
            state = RunnerState.from_dict(data)
        else:
            now = utc_now_iso()
            state = RunnerState(
                version=1,
                prompts_dir=str(prompts_dir),
                prompts_signature=prompts_signature,
                created_at=now,
                updated_at=now,
                current_prompt=None,
                last_run_id=run_id,
                prompts={},
            )

        state.prompts_dir = str(prompts_dir)
        state.prompts_signature = prompts_signature
        state.last_run_id = run_id
        self._recover_interrupted_prompts(state)
        self.save(state)
        return state

    def save(self, state: RunnerState) -> None:
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        state.updated_at = utc_now_iso()
        temp_file = self.state_file.with_suffix(".tmp")
        temp_file.write_text(
            json.dumps(state.to_dict(), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        temp_file.replace(self.state_file)

    def reconcile_prompts(self, state: RunnerState, prompts: list[PromptFile]) -> None:
        for prompt in prompts:
            self.ensure_prompt_entry(state, prompt)
        self.save(state)

    def ensure_prompt_entry(
        self,
        state: RunnerState,
        prompt: PromptFile,
    ) -> PromptExecutionState:
        existing = state.prompts.get(prompt.name)
        if existing is None:
            existing = PromptExecutionState(
                name=prompt.name,
                path=str(prompt.path),
                status=PromptStatus.PENDING,
            )
            state.prompts[prompt.name] = existing
        else:
            existing.path = str(prompt.path)
        return existing

    def reset_prompt(self, state: RunnerState, prompt_name: str) -> PromptExecutionState:
        prompt_state = state.prompts[prompt_name]
        prompt_state.status = PromptStatus.PENDING
        prompt_state.attempts = 0
        prompt_state.last_error = None
        prompt_state.started_at = None
        prompt_state.finished_at = None
        prompt_state.commit_hash = None
        prompt_state.last_run_log = None
        prompt_state.last_exit_code = None
        prompt_state.reexecution_count += 1
        self.save(state)
        return prompt_state

    def mark_running(
        self,
        state: RunnerState,
        prompt: PromptFile,
        log_path: Path,
    ) -> PromptExecutionState:
        prompt_state = self.ensure_prompt_entry(state, prompt)
        prompt_state.status = PromptStatus.RUNNING
        prompt_state.attempts += 1
        prompt_state.started_at = utc_now_iso()
        prompt_state.finished_at = None
        prompt_state.last_error = None
        prompt_state.last_run_log = str(log_path)
        prompt_state.last_exit_code = None
        state.current_prompt = prompt.name
        self.save(state)
        return prompt_state

    def mark_completed(
        self,
        state: RunnerState,
        prompt: PromptFile,
        log_path: Path,
        commit_hash: str | None,
    ) -> PromptExecutionState:
        prompt_state = self.ensure_prompt_entry(state, prompt)
        prompt_state.status = PromptStatus.COMPLETED
        prompt_state.finished_at = utc_now_iso()
        prompt_state.last_error = None
        prompt_state.commit_hash = commit_hash
        prompt_state.last_run_log = str(log_path)
        prompt_state.last_exit_code = 0
        state.current_prompt = None
        self.save(state)
        return prompt_state

    def mark_failed(
        self,
        state: RunnerState,
        prompt: PromptFile,
        log_path: Path,
        error_message: str,
        exit_code: int,
    ) -> PromptExecutionState:
        prompt_state = self.ensure_prompt_entry(state, prompt)
        prompt_state.status = PromptStatus.FAILED
        prompt_state.finished_at = utc_now_iso()
        prompt_state.last_error = error_message
        prompt_state.last_run_log = str(log_path)
        prompt_state.last_exit_code = exit_code
        state.current_prompt = None
        self.save(state)
        return prompt_state

    def _recover_interrupted_prompts(self, state: RunnerState) -> None:
        if state.current_prompt is None:
            return

        prompt_state = state.prompts.get(state.current_prompt)
        if prompt_state is not None and prompt_state.status == PromptStatus.RUNNING:
            prompt_state.status = PromptStatus.PENDING
            prompt_state.last_error = (
                "Previous runner execution ended before this prompt finished."
            )
        state.current_prompt = None
