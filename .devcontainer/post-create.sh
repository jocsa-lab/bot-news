#!/usr/bin/env bash
set -euo pipefail

# === BASE === Utility functions

ensure_line() {
  local file="$1"
  local line="$2"

  touch "$file"
  if ! grep -qxF "$line" "$file"; then
    printf '\n%s\n' "$line" >>"$file"
  fi
}

install_npm_cli() {
  local command_name="$1"
  local package_name="$2"

  if command -v "$command_name" >/dev/null 2>&1; then
    echo "==> ${command_name} already installed"
    return
  fi

  echo "==> Installing ${command_name} (${package_name})"
  npm install -g "$package_name"
}

install_claude_native() {
  if command -v claude >/dev/null 2>&1; then
    echo "==> claude already installed"
    return
  fi

  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required to install Claude Code" >&2
    exit 1
  fi

  echo "==> Installing claude (native installer)"
  curl -fsSL https://claude.ai/install.sh | bash
  export PATH="$HOME/.local/bin:$PATH"
}

# === BASE === PATH setup

export PATH="$HOME/.local/bin:$PATH"
ensure_line "$HOME/.bashrc" 'export PATH="$HOME/.local/bin:$PATH"'

echo "==> Checking devcontainer toolchain"

if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

# === BASE === Install AI coding tools

install_npm_cli codex @openai/codex
install_claude_native

# === BASE === Install MCP server-memory and server-sequential-thinking (used by prompt-runner)
echo "==> Installing @modelcontextprotocol/server-memory"
npm install -g @modelcontextprotocol/server-memory

echo "==> Installing @modelcontextprotocol/server-sequential-thinking"
npm install -g @modelcontextprotocol/server-sequential-thinking

# === BASE === Version checks

node --version
npm --version
git --version

if command -v gh >/dev/null 2>&1; then
  gh --version
fi

if command -v pnpm >/dev/null 2>&1; then
  pnpm --version
else
  echo "pnpm can be enabled later with corepack if the repo needs it"
fi

if command -v codex >/dev/null 2>&1; then
  codex --version
fi

if command -v claude >/dev/null 2>&1; then
  claude --version
fi

# === PROJECT: content-pipeline === Version checks for project-specific tools

if command -v terraform >/dev/null 2>&1; then
  terraform --version
fi

if command -v gcloud >/dev/null 2>&1; then
  gcloud --version 2>/dev/null | head -1
fi

if command -v chromium >/dev/null 2>&1; then
  chromium --version
fi

if command -v python3 >/dev/null 2>&1; then
  python3 --version
fi

if command -v pip3 >/dev/null 2>&1; then
  pip3 --version
fi

echo "==> Devcontainer ready"
