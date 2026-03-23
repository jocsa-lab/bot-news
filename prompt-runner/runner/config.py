from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from runner.models import AppConfig


def normalize_extensions(extensions: list[str]) -> tuple[str, ...]:
    normalized: list[str] = []
    for extension in extensions:
        cleaned = extension.strip().lower()
        if not cleaned:
            continue
        if not cleaned.startswith("."):
            cleaned = f".{cleaned}"
        normalized.append(cleaned)
    return tuple(dict.fromkeys(normalized))


def _resolve_path(project_root: Path, raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = project_root / path
    return path.resolve()


def build_config(args, project_root: Path) -> AppConfig:
    prompts_dir = _resolve_path(project_root, args.prompts_dir)
    state_dir = _resolve_path(project_root, args.state_dir)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    return AppConfig(
        project_root=project_root.resolve(),
        prompts_dir=prompts_dir,
        agent=args.agent or "",
        model=args.model or "",
        verbose=bool(args.verbose),
        quiet=bool(args.quiet),
        independent_prompts=bool(args.independent_prompts),
        state_dir=state_dir,
        logs_dir=state_dir / "logs",
        runs_dir=state_dir / "runs",
        state_file=state_dir / "state.json",
        run_id=run_id,
        max_retries=max(args.max_retries, 1),
        supported_extensions=normalize_extensions(args.extensions),
        rerun_name=args.rerun_name,
        rerun_index=args.rerun_index,
        assume_yes=bool(args.assume_yes),
    )
