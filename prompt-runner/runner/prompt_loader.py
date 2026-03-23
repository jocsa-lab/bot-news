from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Sequence

from runner.models import PromptFile


def discover_prompts(prompts_dir: Path, supported_extensions: Sequence[str]) -> list[PromptFile]:
    if not prompts_dir.exists():
        raise FileNotFoundError(f"Prompt directory does not exist: {prompts_dir}")
    if not prompts_dir.is_dir():
        raise NotADirectoryError(f"Prompt directory is not a directory: {prompts_dir}")

    extensions = {extension.lower() for extension in supported_extensions}
    prompt_paths = [
        path
        for path in prompts_dir.iterdir()
        if path.is_file() and path.suffix.lower() in extensions
    ]
    prompt_paths.sort(key=lambda path: path.name)

    prompts: list[PromptFile] = []
    for index, path in enumerate(prompt_paths, start=1):
        content = path.read_text(encoding="utf-8", errors="replace")
        title = extract_title(content, path.stem)
        prompts.append(
            PromptFile(
                index=index,
                name=path.name,
                path=path,
                title=title,
                content=content,
            ),
        )
    return prompts


def extract_title(content: str, fallback: str) -> str:
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            stripped = stripped.lstrip("#").strip()
        if stripped:
            return re.sub(r"\s+", " ", stripped)
    return fallback


def build_prompts_signature(prompts: Sequence[PromptFile]) -> str:
    digest = hashlib.sha256()
    for prompt in prompts:
        digest.update(prompt.name.encode("utf-8"))
        digest.update(b"\x00")
        digest.update(hashlib.sha256(prompt.content.encode("utf-8")).digest())
        digest.update(b"\x00")
    return digest.hexdigest()
