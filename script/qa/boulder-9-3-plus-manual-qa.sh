#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_DIR="$ROOT/.omo/evidence/boulder-9-3-plus-verified"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT" "$ROOT/.boulder"' EXIT

run_json_allow_blocked() {
  local label="$1"
  shift
  local output="$TMP_ROOT/${label}.json"
  set +e
  "$@" >"$output"
  local exit_code=$?
  set -e
  bun -e 'const fs=require("fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));' "$output"
  echo "$label exit:$exit_code path:$output"
}

run_json_strict() {
  local label="$1"
  shift
  local output="$TMP_ROOT/${label}.json"
  "$@" >"$output"
  bun -e 'const fs=require("fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));' "$output"
  echo "$label path:$output"
}

mkdir -p "$EVIDENCE_DIR"
git -C "$ROOT" archive HEAD | tar -x -C "$TMP_ROOT"
CLEAN_ROOT="$TMP_ROOT/clean"
mkdir "$CLEAN_ROOT"
git -C "$ROOT" archive HEAD | tar -x -C "$CLEAN_ROOT"

echo "root:$ROOT"
echo "clean:$CLEAN_ROOT"

run_json_strict release-refresh bun "$ROOT/bin/boulder.ts" release evidence refresh --dry-run --json --cwd "$ROOT"
bun test "$ROOT/test/package-inventory-contract.test.ts"
bun test "$ROOT/test/docs-registry.test.ts"
run_json_strict evidence-inspect bun "$ROOT/bin/boulder.ts" evidence inspect --cwd "$ROOT" --json
run_json_allow_blocked evidence-diff-missing bun "$ROOT/bin/boulder.ts" evidence diff --from "$TMP_ROOT/missing-a" --to "$TMP_ROOT/missing-b" --json
run_json_strict workflow-map bun "$ROOT/bin/boulder.ts" workflow map --json
run_json_allow_blocked release-check bun "$ROOT/bin/boulder.ts" release-check --cwd "$ROOT" --json --record-run
run_json_allow_blocked product-readiness bun "$ROOT/bin/boulder.ts" product-readiness --cwd "$ROOT" --json
run_json_allow_blocked service-readiness bun "$ROOT/bin/boulder.ts" service-readiness --cwd "$ROOT" --json
run_json_strict runs-list bun "$ROOT/bin/boulder.ts" runs list --cwd "$ROOT" --json
run_json_strict runs-show bun "$ROOT/bin/boulder.ts" runs show --latest --cwd "$ROOT" --json
run_json_strict runs-prune bun "$ROOT/bin/boulder.ts" runs prune --older-than 30d --keep 200 --cwd "$ROOT" --json

run_json_allow_blocked clean-release-check bun "$ROOT/bin/boulder.ts" release-check --cwd "$CLEAN_ROOT" --json
run_json_allow_blocked clean-product-readiness bun "$ROOT/bin/boulder.ts" product-readiness --cwd "$CLEAN_ROOT" --json
run_json_allow_blocked clean-service-readiness bun "$ROOT/bin/boulder.ts" service-readiness --cwd "$CLEAN_ROOT" --json

echo "manual qa complete"
