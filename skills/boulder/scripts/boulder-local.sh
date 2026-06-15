#!/usr/bin/env bash
set -euo pipefail

BOULDER_HOME="${BOULDER_HOME:-/Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder}"
BOULDER_BIN="$BOULDER_HOME/bin/boulder.ts"
BUN_BIN="${BUN_BIN:-}"

if [[ -z "$BUN_BIN" ]] && command -v bun >/dev/null 2>&1; then
  BUN_BIN="bun"
fi

if [[ -z "$BUN_BIN" && -x "$HOME/.bun/bin/bun" ]]; then
  BUN_BIN="$HOME/.bun/bin/bun"
fi

if [[ -z "$BUN_BIN" ]]; then
  echo "Boulder requires Bun, but 'bun' is not on PATH." >&2
  exit 127
fi

if [[ ! -f "$BOULDER_BIN" ]]; then
  echo "Boulder checkout not found at: $BOULDER_HOME" >&2
  echo "Set BOULDER_HOME=/path/to/boulder and retry." >&2
  exit 1
fi

exec "$BUN_BIN" "$BOULDER_BIN" "$@"
