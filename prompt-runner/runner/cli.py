from __future__ import annotations

import argparse


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run prompt files sequentially with Codex or Claude in isolated subprocesses.",
    )
    parser.add_argument(
        "--prompts-dir",
        required=True,
        help="Directory that contains the prompt files to execute.",
    )
    parser.add_argument(
        "--agent",
        choices=("claude", "codex"),
        help="Agent CLI to use. If omitted, the runner asks interactively.",
    )
    parser.add_argument(
        "--model",
        help="Model or alias to pass to the selected CLI. Leave empty to use the CLI default.",
    )
    parser.add_argument(
        "--state-dir",
        default=".prompt-runner",
        help="Directory where state, logs, and run artifacts are stored.",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=3,
        help="Maximum attempts per prompt before the prompt becomes a terminal failure.",
    )
    parser.add_argument(
        "--extensions",
        nargs="+",
        default=[".md", ".txt"],
        help="Supported prompt file extensions.",
    )
    parser.add_argument(
        "--independent-prompts",
        action="store_true",
        help="Skip to the next prompt after a prompt reaches the maximum number of failures.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show detailed execution information and stream agent output to the console.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Reduce console output to the minimum useful summary.",
    )
    parser.add_argument(
        "--yes",
        dest="assume_yes",
        action="store_true",
        help="Skip the final interactive confirmation step.",
    )

    rerun_group = parser.add_mutually_exclusive_group()
    rerun_group.add_argument(
        "--rerun-name",
        help="Reset and rerun one prompt by exact file name.",
    )
    rerun_group.add_argument(
        "--rerun-index",
        type=int,
        help="Reset and rerun one prompt by its 1-based index in the sorted queue.",
    )
    return parser


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    return build_parser().parse_args(argv)
