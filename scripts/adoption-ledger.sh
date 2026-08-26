#!/usr/bin/env bash
# Adoption observation ledger - appends one record per run (monthly npm downloads).
# Data file is repo-local state (.omo/ is gitignored); the script itself is dev tooling
# and is outside the npm package allowlist (bin/src/docs/fixtures/skills).
# Usage: scripts/adoption-ledger.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/.omo/adoption-ledger.jsonl"
mkdir -p "$ROOT/.omo"

PAYLOAD="$(curl -fsS 'https://api.npmjs.org/downloads/point/last-month/boulder-oss-cli')"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

printf '{"observed_at":"%s","source":"api.npmjs.org/downloads/point/last-month","payload":%s}\n' "$TS" "$PAYLOAD" >> "$OUT"
echo "appended adoption record to $OUT"
