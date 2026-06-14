#!/usr/bin/env bash
set -euo pipefail

BOULDER_HOME="${BOULDER_HOME:-/Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder}"
BOULDER_BIN="$BOULDER_HOME/bin/boulder.ts"

if ! command -v bun >/dev/null 2>&1; then
  echo "Boulder requires Bun, but 'bun' is not on PATH." >&2
  exit 127
fi

if [[ ! -f "$BOULDER_BIN" ]]; then
  echo "Boulder checkout not found at: $BOULDER_HOME" >&2
  echo "Set BOULDER_HOME=/path/to/boulder and retry." >&2
  exit 1
fi

exec bun "$BOULDER_BIN" "$@"
