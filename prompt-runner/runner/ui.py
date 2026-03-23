from __future__ import annotations

from collections import Counter

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, Prompt
from rich.table import Table

from runner.models import AppConfig, PromptFile, PromptRunResult, PromptStatus, RunnerState


STATUS_STYLES = {
    PromptStatus.PENDING: "yellow",
    PromptStatus.RUNNING: "cyan",
    PromptStatus.COMPLETED: "green",
    PromptStatus.FAILED: "red",
    PromptStatus.SKIPPED: "magenta",
}


def _format_elapsed(seconds: float) -> str:
    minutes, secs = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


class RunnerUI:
    def __init__(self, verbose: bool, quiet: bool) -> None:
        self.verbose = verbose
        self.quiet = quiet
        self.console = Console()

    def print_banner(self) -> None:
        if self.quiet:
            return
        self.console.print(
            Panel.fit(
                "Prompt Runner\nSequential execution for Claude/Codex in dangerous mode",
                border_style="blue",
            ),
        )

    def ask_agent(self) -> str:
        return Prompt.ask(
            "Which agent should be used",
            choices=["claude", "codex"],
            default="codex",
            console=self.console,
        )

    def ask_text(self, question: str, default: str = "") -> str:
        answer = self.console.input(f"[bold]{question}[/bold]")
        answer = answer.strip()
        if answer:
            return answer
        return default

    def confirm(self, question: str, default: bool = True) -> bool:
        return Confirm.ask(question, default=default, console=self.console)

    def print_configuration_summary(
        self,
        config: AppConfig,
        prompts: list[PromptFile],
        state: RunnerState,
    ) -> None:
        if self.quiet:
            return
        table = Table(title="Execution Summary", show_header=False)
        table.add_column(style="bold")
        table.add_column()
        table.add_row("Agent", config.agent)
        table.add_row("Model", config.model or "(CLI default)")
        table.add_row("Prompts dir", str(config.prompts_dir))
        table.add_row("Prompts found", str(len(prompts)))
        table.add_row(
            "Mode",
            "independent" if config.independent_prompts else "dependent",
        )
        table.add_row("Verbose", "yes" if config.verbose else "no")
        table.add_row("State file", str(config.state_file))
        table.add_row("Run id", config.run_id)
        table.add_row("Queue signature", state.prompts_signature[:12])
        self.console.print(table)

    def print_dirty_repo_warning(self, dirty_files: list[str]) -> None:
        if self.quiet:
            return
        preview = "\n".join(f"- {path}" for path in dirty_files[:8])
        if len(dirty_files) > 8:
            preview = f"{preview}\n- ... and {len(dirty_files) - 8} more"
        self.console.print(
            Panel.fit(
                "Repository already has uncommitted changes.\n"
                "Automatic commits may include them.\n\n"
                f"{preview}",
                border_style="yellow",
                title="Warning",
            ),
        )

    def print_non_git_notice(self) -> None:
        self.console.print(
            "[yellow]No git repository detected. The runner will execute prompts but skip automatic commits.[/yellow]"
        )

    def print_prompt_queue(self, prompts: list[PromptFile], state: RunnerState) -> None:
        if self.quiet:
            return
        table = Table(title="Prompt Queue")
        table.add_column("#", justify="right")
        table.add_column("Status")
        table.add_column("File")
        table.add_column("Attempts", justify="right")
        for prompt in prompts:
            prompt_state = state.prompts.get(prompt.name)
            status = prompt_state.status if prompt_state else PromptStatus.PENDING
            attempts = str(prompt_state.attempts) if prompt_state else "0"
            table.add_row(
                str(prompt.index),
                self._format_status(status),
                prompt.name,
                attempts,
            )
        self.console.print(table)

    def print_prompt_start(
        self,
        prompt: PromptFile,
        total: int,
        attempt: int,
    ) -> None:
        if self.quiet:
            return
        self.console.print(
            f"[cyan]{self._progress_bar(prompt.index, total)}[/cyan] "
            f"[bold]{prompt.index}/{total}[/bold] "
            f"[cyan]RUNNING[/cyan] {prompt.name} "
            f"(attempt {attempt})"
        )

    # ── Verbose stage header ─────────────────────────────────────────────

    def print_verbose_stage_header(
        self,
        prompt: PromptFile,
        total: int,
        attempt: int,
        elapsed: float,
    ) -> None:
        """Print a persistent header showing the current stage in verbose mode."""
        if not self.verbose or self.quiet:
            return
        elapsed_str = _format_elapsed(elapsed)
        self.console.print(
            f"[bold cyan]━━━ [{prompt.index}/{total}] {prompt.name} "
            f"━━━ attempt {attempt} ━━━ elapsed {elapsed_str} ━━━[/bold cyan]"
        )

    # ── Verbose progress mini-summary ────────────────────────────────────

    def print_verbose_progress_summary(
        self,
        prompt: PromptFile,
        total: int,
        duration_seconds: float,
        completed: int,
        remaining: int,
        failed: int,
    ) -> None:
        """Print a one-line mini-summary after each prompt completes in verbose mode."""
        if not self.verbose or self.quiet:
            return
        duration_str = _format_elapsed(duration_seconds)
        self.console.print(
            f"[green]✓[/green] [{prompt.index}/{total}] done in {duration_str} "
            f"| completed: {completed} | remaining: {remaining} | failed: {failed}"
        )

    # ── Existing output methods ──────────────────────────────────────────

    def stream_agent_output(self, line: str) -> None:
        if not line or self.quiet:
            return
        self.console.print(f"[dim]{line}[/dim]")

    def print_prompt_success(
        self,
        prompt: PromptFile,
        result: PromptRunResult,
        commit_message: str,
    ) -> None:
        if self.quiet:
            self.console.print(
                f"[green]completed[/green] {prompt.name} ({result.duration_seconds:.1f}s)"
            )
            return

        self.console.print(
            f"[green]COMPLETED[/green] {prompt.name} in {result.duration_seconds:.1f}s"
        )
        self.console.print(f"[green]Commit:[/green] {commit_message}")
        self.console.print(f"[green]Log:[/green] {result.log_path}")

    def print_prompt_failure(
        self,
        prompt: PromptFile,
        result: PromptRunResult,
        error_message: str,
        attempt: int,
        max_retries: int,
    ) -> None:
        self.console.print(
            f"[red]FAILED[/red] {prompt.name} "
            f"(attempt {attempt}/{max_retries}, exit={result.exit_code})"
        )
        self.console.print(f"[red]Error:[/red] {error_message}")
        self.console.print(f"[red]Log:[/red] {result.log_path}")

    def print_retry_notice(self, prompt: PromptFile, remaining: int) -> None:
        if self.quiet:
            return
        self.console.print(
            f"[yellow]Retrying[/yellow] {prompt.name}. Remaining retries: {remaining}"
        )

    def print_skip_notice(self, prompt: PromptFile, reason: str) -> None:
        if self.quiet:
            return
        self.console.print(f"[magenta]SKIPPED[/magenta] {prompt.name} ({reason})")

    def print_rerun_notice(self, prompt_name: str) -> None:
        if self.quiet:
            return
        self.console.print(f"[blue]Reset state for rerun:[/blue] {prompt_name}")

    def print_terminal_failure(self, prompt: PromptFile, independent: bool) -> None:
        action = "Skipping and continuing." if independent else "Stopping execution."
        self.console.print(
            f"[red]Prompt reached the maximum number of failures:[/red] {prompt.name}. {action}"
        )

    def print_final_summary(self, prompts: list[PromptFile], state: RunnerState) -> None:
        counts = Counter()
        for prompt in prompts:
            prompt_state = state.prompts.get(prompt.name)
            status = prompt_state.status if prompt_state else PromptStatus.PENDING
            counts[status.value] += 1

        table = Table(title="Final Summary")
        table.add_column("Metric")
        table.add_column("Value", justify="right")
        table.add_row("Completed", str(counts.get(PromptStatus.COMPLETED.value, 0)))
        table.add_row("Failed", str(counts.get(PromptStatus.FAILED.value, 0)))
        table.add_row("Pending", str(counts.get(PromptStatus.PENDING.value, 0)))
        table.add_row("Skipped", str(counts.get(PromptStatus.SKIPPED.value, 0)))
        self.console.print(table)

        if not self.quiet:
            self.print_prompt_queue(prompts, state)

    def print_info(self, message: str) -> None:
        if self.quiet:
            return
        self.console.print(message)

    def print_error(self, message: str) -> None:
        self.console.print(f"[red]{message}[/red]")

    def _format_status(self, status: PromptStatus) -> str:
        style = STATUS_STYLES[status]
        return f"[{style}]{status.value}[/{style}]"

    def _progress_bar(self, current: int, total: int, width: int = 24) -> str:
        if total <= 0:
            return "[" + ("-" * width) + "]"
        completed = int((current / total) * width)
        completed = min(max(completed, 0), width)
        return "[" + ("#" * completed) + ("-" * (width - completed)) + "]"
