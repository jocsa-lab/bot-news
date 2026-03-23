from __future__ import annotations

import logging
import re
import subprocess
from pathlib import Path

from runner.models import GitCommitResult, PromptFile


class GitServiceError(RuntimeError):
    pass


class GitService:
    def __init__(self, project_root: Path, logger: logging.Logger) -> None:
        self.project_root = project_root
        self.logger = logger
        self._is_repository: bool | None = None

    def is_repository(self) -> bool:
        if self._is_repository is not None:
            return self._is_repository

        process = self._run_git(["rev-parse", "--is-inside-work-tree"], check=False)
        self._is_repository = process.returncode == 0 and process.stdout.strip() == "true"
        return self._is_repository

    def current_dirty_files(self) -> list[str]:
        if not self.is_repository():
            return []

        process = self._run_git(["status", "--porcelain"], check=True)
        files: list[str] = []
        for line in process.stdout.splitlines():
            if len(line) >= 4:
                files.append(line[3:])
        return files

    def commit_prompt_changes(self, prompt: PromptFile) -> GitCommitResult:
        if not self.is_repository():
            return GitCommitResult(
                committed=False,
                commit_hash=None,
                message=None,
                reason="not_a_git_repository",
            )

        dirty_files = self.current_dirty_files()
        if not dirty_files:
            return GitCommitResult(
                committed=False,
                commit_hash=None,
                message=None,
                reason="no_changes",
            )

        self._run_git(["add", "-A"], check=True)
        message = build_commit_message(prompt)
        commit_process = self._run_git(["commit", "-m", message], check=False)
        if commit_process.returncode != 0:
            output = commit_process.stderr.strip() or commit_process.stdout.strip()
            raise GitServiceError(output or "git commit failed")

        commit_hash = self._run_git(["rev-parse", "HEAD"], check=True).stdout.strip()
        return GitCommitResult(
            committed=True,
            commit_hash=commit_hash,
            message=message,
        )

    def _run_git(self, args: list[str], check: bool) -> subprocess.CompletedProcess[str]:
        process = subprocess.run(
            ["git", *args],
            cwd=self.project_root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if check and process.returncode != 0:
            output = process.stderr.strip() or process.stdout.strip()
            raise GitServiceError(output or f"git {' '.join(args)} failed")
        return process


def build_commit_message(prompt: PromptFile) -> str:
    title = prompt.title or prompt.path.stem
    normalized = title.strip().lower()
    normalized = normalized.replace("_", " ").replace("-", " ")
    normalized = re.sub(r"[^\w\s]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if not normalized:
        normalized = prompt.path.stem.replace("_", " ").replace("-", " ")
    normalized = normalized[:60].rstrip()
    return f"chore: apply prompt {normalized}"
