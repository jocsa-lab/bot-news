from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any


class PromptStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass(slots=True)
class PromptFile:
    index: int
    name: str
    path: Path
    title: str
    content: str


@dataclass(slots=True)
class AgentInvocation:
    command: list[str]
    stdin_text: str | None = None
    display_command: list[str] | None = None


@dataclass(slots=True)
class PromptExecutionState:
    name: str
    path: str
    status: PromptStatus = PromptStatus.PENDING
    attempts: int = 0
    reexecution_count: int = 0
    last_error: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    commit_hash: str | None = None
    last_run_log: str | None = None
    last_exit_code: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "path": self.path,
            "status": self.status.value,
            "attempts": self.attempts,
            "reexecution_count": self.reexecution_count,
            "last_error": self.last_error,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "commit_hash": self.commit_hash,
            "last_run_log": self.last_run_log,
            "last_exit_code": self.last_exit_code,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PromptExecutionState":
        raw_status = data.get("status", PromptStatus.PENDING.value)
        try:
            status = PromptStatus(raw_status)
        except ValueError:
            status = PromptStatus.PENDING

        return cls(
            name=data["name"],
            path=data["path"],
            status=status,
            attempts=int(data.get("attempts", 0)),
            reexecution_count=int(data.get("reexecution_count", 0)),
            last_error=data.get("last_error"),
            started_at=data.get("started_at"),
            finished_at=data.get("finished_at"),
            commit_hash=data.get("commit_hash"),
            last_run_log=data.get("last_run_log"),
            last_exit_code=data.get("last_exit_code"),
        )


@dataclass(slots=True)
class RunnerState:
    version: int
    prompts_dir: str
    prompts_signature: str
    created_at: str
    updated_at: str
    current_prompt: str | None = None
    last_run_id: str | None = None
    prompts: dict[str, PromptExecutionState] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "prompts_dir": self.prompts_dir,
            "prompts_signature": self.prompts_signature,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "current_prompt": self.current_prompt,
            "last_run_id": self.last_run_id,
            "prompts": {
                name: prompt_state.to_dict()
                for name, prompt_state in sorted(self.prompts.items())
            },
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RunnerState":
        prompts = {
            name: PromptExecutionState.from_dict(prompt_state)
            for name, prompt_state in data.get("prompts", {}).items()
        }
        return cls(
            version=int(data.get("version", 1)),
            prompts_dir=data.get("prompts_dir", ""),
            prompts_signature=data.get("prompts_signature", ""),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
            current_prompt=data.get("current_prompt"),
            last_run_id=data.get("last_run_id"),
            prompts=prompts,
        )


@dataclass(slots=True)
class AppConfig:
    project_root: Path
    prompts_dir: Path
    agent: str
    model: str
    verbose: bool
    quiet: bool
    independent_prompts: bool
    state_dir: Path
    logs_dir: Path
    runs_dir: Path
    state_file: Path
    run_id: str
    max_retries: int
    supported_extensions: tuple[str, ...]
    rerun_name: str | None = None
    rerun_index: int | None = None
    assume_yes: bool = False


@dataclass(slots=True)
class PromptRunResult:
    success: bool
    exit_code: int
    duration_seconds: float
    output_excerpt: str
    log_path: Path


@dataclass(slots=True)
class GitCommitResult:
    committed: bool
    commit_hash: str | None
    message: str | None
    reason: str | None = None
