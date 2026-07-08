#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

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
