#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_DIR_NAME="$(basename "$ROOT_DIR")"
WORKSPACE_DIR="$(cd -- "$ROOT_DIR/.." && pwd)"
RUNNER_PY="$ROOT_DIR/run_prompt_runner.py"
PYTHON_BIN="${PYTHON_BIN:-python3}"
AUTO_INSTALL_PYTHON="${PROMPT_RUNNER_AUTO_INSTALL_PYTHON:-1}"


die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}


warn() {
  printf 'warn: %s\n' "$1" >&2
}


usage() {
  cat <<EOF
Uso:
  ./$SCRIPT_NAME run <prompts_dir> [opcoes]
  ./$SCRIPT_NAME resume <prompts_dir> [opcoes]
  ./$SCRIPT_NAME rerun-name <prompts_dir> <prompt_file> [opcoes]
  ./$SCRIPT_NAME rerun-index <prompts_dir> <indice> [opcoes]
  ./$SCRIPT_NAME --example
  ./$SCRIPT_NAME --help

Comandos:
  run           Executa a fila de prompts.
  resume        Mesmo comportamento de run; o estado salvo decide de onde continuar.
  rerun-name    Reseta e reexecuta um prompt pelo nome exato do arquivo.
  rerun-index   Reseta e reexecuta um prompt pelo indice da fila ordenada.

Opcoes:
  --agent <claude|codex>   Define o agente.
  --model <modelo>         Define o modelo ou alias do CLI.
  --state-dir <caminho>    Pasta para estado, logs e historico.
  --max-retries <n>        Maximo de tentativas por prompt.
  --independent            Continua para o proximo prompt apos falha terminal.
  --verbose                Mostra mais detalhes da execucao.
  --quiet                  Reduz a saida do console.
  --yes                    Pula a confirmacao final.
  --ext <extensao>         Adiciona extensoes suportadas. Pode repetir.
  --                       Encaminha argumentos extras diretamente ao runner Python.

Observacoes:
  - O runner Python faz bootstrap do .venv automaticamente.
  - Se o .venv estiver quebrado ou sem pip, o bootstrap tenta reparar ou recriar.
  - Se faltar um Python 3.11+ com venv/ensurepip, o wrapper pode instalar python3, python3-venv e python3-pip automaticamente em ambientes com apt-get.
  - Claude e Codex sao executados sempre em dangerous mode.
  - A pasta de prompts e obrigatoria para run, resume, rerun-name e rerun-index.
  - O workspace real e assumido como a pasta pai da pasta onde este runner foi extraido.
  - Pasta do runner: $ROOT_DIR
  - Workspace alvo: $WORKSPACE_DIR
EOF
}


examples() {
  cat <<EOF
Exemplos completos com valores ficticios:

1. Executar a fila inteira com Codex:
  ./$RUNNER_DIR_NAME/$SCRIPT_NAME run ./fake-prompts --agent codex --model gpt-5 --yes

2. Executar a fila inteira com Claude em modo verboso:
  ./$RUNNER_DIR_NAME/$SCRIPT_NAME run ./fake-prompts --agent claude --model opus --verbose

3. Continuar uma execucao anterior:
  ./$RUNNER_DIR_NAME/$SCRIPT_NAME resume ./fake-prompts --agent codex --model gpt-5

4. Reexecutar um prompt especifico pelo nome:
  ./$RUNNER_DIR_NAME/$SCRIPT_NAME rerun-name ./fake-prompts 07_finalize.md --agent claude --model opus --yes

5. Reexecutar um prompt especifico pelo indice:
  ./$RUNNER_DIR_NAME/$SCRIPT_NAME rerun-index ./fake-prompts 7 --agent codex --model gpt-5 --verbose

6. Rodar em modo de prompts independentes:
  ./$RUNNER_DIR_NAME/$SCRIPT_NAME run ./fake-prompts --agent codex --model gpt-5 --independent

7. Usar uma pasta de estado customizada:
  ./$RUNNER_DIR_NAME/$SCRIPT_NAME run ./fake-prompts --agent claude --state-dir ./.fake-runner-state --yes

8. Aceitar extensoes extras:
  ./$RUNNER_DIR_NAME/$SCRIPT_NAME run ./fake-prompts --agent codex --ext .md --ext .txt --ext .prompt

Comando Python equivalente de um exemplo:
  python3 $RUNNER_DIR_NAME/run_prompt_runner.py --prompts-dir ./fake-prompts --agent codex --model gpt-5 --yes
EOF
}


require_value() {
  local flag="$1"
  local value="${2:-}"
  [[ -n "$value" ]] || die "faltou valor para $flag"
}


python_meets_runner_requirements() {
  local python_bin="$1"
  command -v "$python_bin" >/dev/null 2>&1 || return 1
  "$python_bin" -c 'import ensurepip, sys, venv; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' >/dev/null 2>&1
}


install_python_runtime() {
  [[ "$AUTO_INSTALL_PYTHON" == "1" ]] || return 1
  command -v apt-get >/dev/null 2>&1 || return 1

  local -a prefix=()
  local -a package_sets=(
    "python3.12 python3.12-venv python3-pip"
    "python3.11 python3.11-venv python3-pip"
    "python3 python3-venv python3-pip"
  )
  local package_set=""
  if [[ "$(id -u)" -eq 0 ]]; then
    prefix=()
  elif command -v sudo >/dev/null 2>&1; then
    prefix=(sudo)
  else
    return 1
  fi

  warn "nenhum Python 3.11+ com venv/ensurepip foi encontrado; tentando instalar python3, python3-venv e python3-pip"
  if ! "${prefix[@]}" apt-get update; then
    return 1
  fi

  for package_set in "${package_sets[@]}"; do
    local -a packages=()
    read -r -a packages <<<"$package_set"
    if "${prefix[@]}" apt-get install -y "${packages[@]}"; then
      return 0
    fi
  done

  return 1
}


resolve_python_bin() {
  local -a candidates=("$PYTHON_BIN" python3 python3.12 python3.11 python)
  local candidate=""

  for candidate in "${candidates[@]}"; do
    [[ -n "$candidate" ]] || continue
    if python_meets_runner_requirements "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  if install_python_runtime; then
    for candidate in "${candidates[@]}"; do
      [[ -n "$candidate" ]] || continue
      if python_meets_runner_requirements "$candidate"; then
        printf '%s\n' "$candidate"
        return 0
      fi
    done
  fi

  return 1
}


main() {
  [[ -f "$RUNNER_PY" ]] || die "arquivo nao encontrado: $RUNNER_PY"

  local resolved_python_bin=""
  resolved_python_bin="$(resolve_python_bin)" || die "nenhum Python 3.11+ com suporte a venv/ensurepip foi encontrado. Instale python3, python3-venv e python3-pip, ou defina PYTHON_BIN para um interpretador compativel."
  PYTHON_BIN="$resolved_python_bin"

  if [[ $# -eq 0 ]]; then
    usage
    exit 1
  fi

  case "${1:-}" in
    --help|-h|help)
      usage
      exit 0
      ;;
    --example|example)
      examples
      exit 0
      ;;
  esac

  local subcommand="${1:-run}"
  local prompts_dir=""
  local rerun_name=""
  local rerun_index=""
  local -a python_args=()
  local -a extensions=()

  case "$subcommand" in
    run|resume)
      shift
      prompts_dir="${1:-}"
      [[ -n "$prompts_dir" ]] || die "informe a pasta de prompts"
      shift || true
      python_args+=(--prompts-dir "$prompts_dir")
      ;;
    rerun-name)
      shift
      prompts_dir="${1:-}"
      rerun_name="${2:-}"
      [[ -n "$prompts_dir" ]] || die "informe a pasta de prompts"
      [[ -n "$rerun_name" ]] || die "informe o nome do arquivo do prompt"
      shift 2 || true
      python_args+=(--prompts-dir "$prompts_dir" --rerun-name "$rerun_name")
      ;;
    rerun-index)
      shift
      prompts_dir="${1:-}"
      rerun_index="${2:-}"
      [[ -n "$prompts_dir" ]] || die "informe a pasta de prompts"
      [[ -n "$rerun_index" ]] || die "informe o indice do prompt"
      shift 2 || true
      python_args+=(--prompts-dir "$prompts_dir" --rerun-index "$rerun_index")
      ;;
    *)
      die "comando desconhecido: $subcommand"
      ;;
  esac

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h)
        usage
        exit 0
        ;;
      --example)
        examples
        exit 0
        ;;
      --agent)
        require_value "$1" "${2:-}"
        python_args+=(--agent "$2")
        shift 2
        ;;
      --model)
        require_value "$1" "${2:-}"
        python_args+=(--model "$2")
        shift 2
        ;;
      --state-dir)
        require_value "$1" "${2:-}"
        python_args+=(--state-dir "$2")
        shift 2
        ;;
      --max-retries)
        require_value "$1" "${2:-}"
        python_args+=(--max-retries "$2")
        shift 2
        ;;
      --independent|--independent-prompts)
        python_args+=(--independent-prompts)
        shift
        ;;
      --verbose)
        python_args+=(--verbose)
        shift
        ;;
      --quiet)
        python_args+=(--quiet)
        shift
        ;;
      --yes|-y)
        python_args+=(--yes)
        shift
        ;;
      --ext|--extension)
        require_value "$1" "${2:-}"
        extensions+=("$2")
        shift 2
        ;;
      --)
        shift
        python_args+=("$@")
        break
        ;;
      *)
        die "opcao desconhecida: $1"
        ;;
    esac
  done

  if [[ ${#extensions[@]} -gt 0 ]]; then
    python_args+=(--extensions "${extensions[@]}")
  fi

  cd "$ROOT_DIR"
  export PROMPT_RUNNER_WORKSPACE_ROOT="$WORKSPACE_DIR"
  exec "$PYTHON_BIN" "$RUNNER_PY" "${python_args[@]}"
}


main "$@"
