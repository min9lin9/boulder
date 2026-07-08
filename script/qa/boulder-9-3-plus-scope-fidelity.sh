#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
EVIDENCE_DIR="$ROOT/.omo/evidence/boulder-9-3-plus-verified"
REQUIRED_EVIDENCE=(
  task-1-baseline.txt
  task-1-blocked-fixture.txt
  task-2-bundle-tests.txt
  task-2-mismatch.txt
  task-3-package-contract.txt
  task-3-unclassified-file.txt
  task-4-doc-registry.txt
  task-4-i18n-failure.txt
  task-5-refresh-dry-run.json
  task-5-refresh-failure.txt
  task-6-registry-tests.txt
  task-6-duplicate-id.txt
  task-7-inspect.json
  task-7-diff-failure.json
  task-8-runs-list.json
  task-8-redaction.txt
  task-8-prune.json
  task-9-workflow-map.json
  task-9-workflow-failure.txt
  task-10-release-check-ready.json
  task-10-metadata-failure.json
)

for evidence in "${REQUIRED_EVIDENCE[@]}"; do
  test -s "$EVIDENCE_DIR/$evidence"
done

if rg -n "trusted publisher (is )?verified|npm account (is )?verified|guarantees? (a )?9\\.3|guarantees? (the )?score" README.md docs src test package.json; then
  echo "forbidden external-state or guaranteed-score claim found" >&2
  exit 1
fi

if rg -n "sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,}" README.md docs src test package.json; then
  echo "secret-like token found in repository content" >&2
  exit 1
fi

bun test test/run-events-redaction.test.ts
bun test test/source-cleanliness.test.ts test/docs-registry.test.ts test/package-inventory-contract.test.ts

echo "scope fidelity complete"
