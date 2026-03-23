#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd -- "$ROOT_DIR/.." && pwd)"
STATUS_PYTHON_BIN="${PYTHON_BIN:-python3}"


die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}


usage() {
  cat <<EOF_USAGE
Uso:
  ./$SCRIPT_NAME [--state-dir <caminho>] [--json]
  ./$SCRIPT_NAME --help

Opcoes:
  --state-dir <caminho>  Pasta do estado do runner (padrao: .prompt-runner no workspace).
  --json                 Imprime o state.json bruto.
  --help                 Mostra esta ajuda.
EOF_USAGE
}


resolve_workspace_path() {
  local raw_path="$1"
  if [[ "$raw_path" = /* ]]; then
    printf '%s\n' "$raw_path"
  else
    printf '%s\n' "$WORKSPACE_DIR/$raw_path"
  fi
}


resolve_python_bin() {
  local -a candidates=("$STATUS_PYTHON_BIN" python3 python)
  local candidate=""

  for candidate in "${candidates[@]}"; do
    [[ -n "$candidate" ]] || continue
    if command -v "$candidate" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}


main() {
  local state_dir_raw=".prompt-runner"
  local show_json="0"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --state-dir)
        [[ -n "${2:-}" ]] || die "faltou valor para --state-dir"
        state_dir_raw="$2"
        shift 2
        ;;
      --json)
        show_json="1"
        shift
        ;;
      --help|-h|help)
        usage
        exit 0
        ;;
      *)
        die "opcao desconhecida: $1"
        ;;
    esac
  done

  local python_bin=""
  python_bin="$(resolve_python_bin)" || die "nenhum interpretador Python foi encontrado (PYTHON_BIN/python3/python)"

  local state_dir=""
  local state_file=""
  state_dir="$(resolve_workspace_path "$state_dir_raw")"
  state_file="$state_dir/state.json"

  [[ -f "$state_file" ]] || die "arquivo de estado nao encontrado: $state_file"

  if [[ "$show_json" == "1" ]]; then
    cat "$state_file"
    exit 0
  fi

  "$python_bin" - "$state_file" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

state_file = Path(sys.argv[1])
state = json.loads(state_file.read_text(encoding="utf-8"))
prompts = state.get("prompts", {})

counts: dict[str, int] = {}
for prompt_state in prompts.values():
    status = str(prompt_state.get("status", "unknown"))
    counts[status] = counts.get(status, 0) + 1


def count(name: str) -> int:
    return int(counts.get(name, 0))


def format_brasilia_datetime(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        return "-"

    raw = value.strip()
    if raw.endswith("Z"):
        raw = f"{raw[:-1]}+00:00"

    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return value

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(ZoneInfo("America/Sao_Paulo")).isoformat()


current_prompt = state.get("current_prompt")
ordered_names = sorted(prompts.keys())
position = "-"
if current_prompt and current_prompt in ordered_names:
    position = f"{ordered_names.index(current_prompt) + 1}/{len(ordered_names)}"

print(f"state_file: {state_file}")
print(f"last_run_id: {state.get('last_run_id') or '-'}")
print(f"updated_at: {state.get('updated_at') or '-'}")
print(f"current_prompt: {current_prompt or '-'}")
print(f"position: {position}")
print(
    "summary: "
    f"pending={count('pending')} "
    f"running={count('running')} "
    f"completed={count('completed')} "
    f"failed={count('failed')} "
    f"skipped={count('skipped')} "
    f"total={len(prompts)}"
)

if current_prompt and current_prompt in prompts:
    current = prompts[current_prompt]
    attempts = current.get("attempts")
    attempts_value = "-" if attempts is None else attempts
    print(f"current_status: {current.get('status') or '-'}")
    print(f"current_attempts: {attempts_value}")
    print(f"current_started_at: {format_brasilia_datetime(current.get('started_at'))}")
    print(f"current_log: {current.get('last_run_log') or '-'}")
PY
}


main "$@"
