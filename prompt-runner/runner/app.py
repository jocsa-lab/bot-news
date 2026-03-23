from __future__ import annotations

import json
import logging
import shutil
import os
from pathlib import Path

from runner.agent_runner import AgentRunner
from runner.cli import parse_args
from runner.config import build_config
from runner.git_service import GitService, GitServiceError
from runner.logger import configure_logging
from runner.models import PromptFile, PromptStatus
from runner.notifier import TelegramNotifier, create_notifier
from runner.prompt_loader import build_prompts_signature, discover_prompts
from runner.retry_policy import can_retry, is_terminal_failure, remaining_retries
from runner.state_store import StateStore
from runner.ui import RunnerUI


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    project_root = _resolve_project_root()
    config = build_config(args, project_root)

    config.state_dir.mkdir(parents=True, exist_ok=True)
    config.logs_dir.mkdir(parents=True, exist_ok=True)
    config.runs_dir.mkdir(parents=True, exist_ok=True)
    run_log = config.logs_dir / f"runner-{config.run_id}.log"

    ui = RunnerUI(verbose=config.verbose, quiet=config.quiet)
    ui.print_banner()

    logger = configure_logging(run_log, config.verbose)
    try:
        prompts = discover_prompts(config.prompts_dir, config.supported_extensions)
    except (FileNotFoundError, NotADirectoryError) as error:
        ui.print_error(str(error))
        return 1

    if not prompts:
        ui.print_error("No supported prompt files were found in the provided directory.")
        return 1

    config.agent = _resolve_agent(config.agent, ui)
    config.model = _resolve_model(config.model, ui)
    if not _confirm_environment(ui, config):
        return 1

    if shutil.which(config.agent) is None:
        ui.print_error(f"The selected CLI is not available in PATH: {config.agent}")
        return 1

    signature = build_prompts_signature(prompts)
    store = StateStore(config.state_file, logger)
    state = store.load_or_create(config.prompts_dir, signature, config.run_id)
    store.reconcile_prompts(state, prompts)

    try:
        rerun_target = _resolve_rerun_target(config, prompts)
    except ValueError as error:
        ui.print_error(str(error))
        return 1

    if rerun_target is not None:
        store.reset_prompt(state, rerun_target)
        ui.print_rerun_notice(rerun_target)

    git_service = GitService(config.project_root, logger)
    if git_service.is_repository():
        dirty_files = git_service.current_dirty_files()
        if dirty_files:
            ui.print_dirty_repo_warning(dirty_files)
            if not config.assume_yes and not ui.confirm(
                "Continue even though the repository already has uncommitted changes?",
                default=False,
            ):
                return 0
    else:
        ui.print_non_git_notice()

    ui.print_configuration_summary(config, prompts, state)
    ui.print_prompt_queue(prompts, state)
    if not config.assume_yes and not ui.confirm("Start execution now?", default=True):
        return 0

    runner = AgentRunner(config, logger, ui)
    notifier = create_notifier()
    if notifier:
        ui.print_info("[blue]Telegram notifications enabled[/blue]")
        notifier.notify_pipeline_started(
            agent=config.agent,
            model=config.model,
            total_prompts=len(prompts),
            run_id=config.run_id,
        )
    should_stop = False

    for prompt in prompts:
        prompt_state = store.ensure_prompt_entry(state, prompt)

        if prompt_state.status == PromptStatus.COMPLETED:
            ui.print_skip_notice(prompt, "already completed")
            continue

        if (
            prompt_state.status == PromptStatus.FAILED
            and is_terminal_failure(prompt_state.attempts, config.max_retries)
        ):
            if config.independent_prompts:
                ui.print_skip_notice(prompt, "already exhausted retries")
                continue
            ui.print_terminal_failure(prompt, independent=False)
            should_stop = True
            break

        while True:
            run_log_path = config.runs_dir / config.run_id / f"{prompt.index:03d}_{prompt.name}.log"
            prompt_state = store.mark_running(state, prompt, run_log_path)
            ui.print_prompt_start(prompt, len(prompts), prompt_state.attempts)

            result = runner.run_prompt(
                prompt, prompts, state, attempt=prompt_state.attempts,
            )
            logger.info("Prompt %s finished with exit code %s", prompt.name, result.exit_code)

            if result.success:
                try:
                    commit_result = git_service.commit_prompt_changes(prompt)
                except GitServiceError as error:
                    prompt_state = store.mark_failed(
                        state,
                        prompt,
                        result.log_path,
                        str(error),
                        exit_code=1,
                    )
                    ui.print_prompt_failure(
                        prompt,
                        result,
                        str(error),
                        prompt_state.attempts,
                        config.max_retries,
                    )
                else:
                    store.mark_completed(
                        state,
                        prompt,
                        result.log_path,
                        commit_hash=commit_result.commit_hash,
                    )
                    commit_message = _describe_commit(commit_result)
                    ui.print_prompt_success(prompt, result, commit_message)

                    # Verbose progress mini-summary + Telegram notification
                    counts = _count_statuses(prompts, state)
                    _print_verbose_progress(
                        ui, prompt, prompts, state, result,
                    )
                    if notifier:
                        notifier.notify_prompt_success(
                            prompt_name=prompt.name,
                            index=prompt.index,
                            total=len(prompts),
                            duration=result.duration_seconds,
                            completed=counts["completed"],
                            remaining=counts["remaining"],
                            failed=counts["failed"],
                        )

                    break
            else:
                prompt_state = store.mark_failed(
                    state,
                    prompt,
                    result.log_path,
                    result.output_excerpt,
                    result.exit_code,
                )
                ui.print_prompt_failure(
                    prompt,
                    result,
                    result.output_excerpt,
                    prompt_state.attempts,
                    config.max_retries,
                )

            prompt_state = state.prompts[prompt.name]
            if can_retry(prompt_state.attempts, config.max_retries):
                ui.print_retry_notice(
                    prompt,
                    remaining_retries(prompt_state.attempts, config.max_retries),
                )
                continue

            ui.print_terminal_failure(prompt, independent=config.independent_prompts)
            if notifier:
                notifier.notify_terminal_failure(
                    prompt_name=prompt.name,
                    index=prompt.index,
                    total=len(prompts),
                    independent=config.independent_prompts,
                )
            if not config.independent_prompts:
                should_stop = True
            break

        if should_stop:
            break

    _write_run_summary(config, prompts, state, logger)
    ui.print_final_summary(prompts, state)

    # Telegram notification: pipeline finished
    if notifier:
        counts = _count_statuses(prompts, state)
        notifier.notify_pipeline_finished(
            completed=counts["completed"],
            failed=counts["failed"],
            skipped=counts["skipped"],
            pending=counts["pending"],
            total=len(prompts),
        )

    has_failed_prompts = any(
        state.prompts[prompt.name].status == PromptStatus.FAILED
        for prompt in prompts
        if prompt.name in state.prompts
    )
    return 1 if has_failed_prompts else 0


def _count_statuses(prompts: list[PromptFile], state) -> dict[str, int]:
    """Count prompt statuses for notifications and progress summaries."""
    completed = 0
    failed = 0
    skipped = 0
    pending = 0
    for p in prompts:
        ps = state.prompts.get(p.name)
        if ps is None:
            pending += 1
            continue
        if ps.status == PromptStatus.COMPLETED:
            completed += 1
        elif ps.status == PromptStatus.FAILED:
            failed += 1
        elif ps.status == PromptStatus.SKIPPED:
            skipped += 1
        else:
            pending += 1
    remaining = len(prompts) - completed - failed
    return {
        "completed": completed,
        "failed": failed,
        "skipped": skipped,
        "pending": pending,
        "remaining": remaining,
    }


def _print_verbose_progress(
    ui: RunnerUI,
    prompt: PromptFile,
    prompts: list[PromptFile],
    state,
    result,
) -> None:
    """Print the verbose progress mini-summary after a successful prompt."""
    counts = _count_statuses(prompts, state)
    ui.print_verbose_progress_summary(
        prompt=prompt,
        total=len(prompts),
        duration_seconds=result.duration_seconds,
        completed=counts["completed"],
        remaining=counts["remaining"],
        failed=counts["failed"],
    )


def _resolve_project_root() -> Path:
    env_value = os.environ.get("PROMPT_RUNNER_WORKSPACE_ROOT")
    if env_value:
        return Path(env_value).expanduser().resolve()

    install_root = Path(__file__).resolve().parents[1]
    return install_root.parent.resolve()


def _resolve_agent(current_value: str, ui: RunnerUI) -> str:
    return current_value or ui.ask_agent()


def _resolve_model(current_value: str, ui: RunnerUI) -> str:
    if current_value:
        return current_value
    return ui.ask_text("Model or alias to pass to the CLI (blank uses the CLI default): ")


def _confirm_environment(ui: RunnerUI, config) -> bool:
    if config.assume_yes:
        return True

    if not ui.confirm("Has the selected CLI already been installed and authenticated?", default=True):
        return False
    if not ui.confirm("Is the desired model already configured or available?", default=True):
        return False
    return True


def _resolve_rerun_target(config, prompts: list[PromptFile]) -> str | None:
    if config.rerun_name:
        prompt_names = {prompt.name for prompt in prompts}
        if config.rerun_name not in prompt_names:
            raise ValueError(f"Unknown prompt for rerun: {config.rerun_name}")
        return config.rerun_name

    if config.rerun_index is not None:
        if config.rerun_index < 1 or config.rerun_index > len(prompts):
            raise ValueError(
                f"--rerun-index must be between 1 and {len(prompts)}",
            )
        return prompts[config.rerun_index - 1].name

    return None


def _describe_commit(commit_result) -> str:
    if commit_result.committed and commit_result.message:
        if commit_result.commit_hash:
            return f"{commit_result.message} ({commit_result.commit_hash[:8]})"
        return commit_result.message
    if commit_result.reason == "no_changes":
        return "no changes detected"
    if commit_result.reason == "not_a_git_repository":
        return "git commit skipped because the current directory is not a git repository"
    return "commit skipped"


def _write_run_summary(config, prompts, state, logger: logging.Logger) -> None:
    summary_path = config.runs_dir / config.run_id / "summary.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "run_id": config.run_id,
        "agent": config.agent,
        "model": config.model,
        "prompts_dir": str(config.prompts_dir),
        "state_file": str(config.state_file),
        "prompts": [
            state.prompts[prompt.name].to_dict()
            for prompt in prompts
            if prompt.name in state.prompts
        ],
    }
    summary_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    logger.info("Wrote run summary to %s", summary_path)
