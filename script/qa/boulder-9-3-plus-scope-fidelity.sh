#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
SCAN_SURFACES=(README.md CHANGELOG.md CONTRIBUTING.md ROADMAP.md SECURITY.md boulder.yaml LICENSE docs src test fixtures skills package.json)
PUBLIC_FILES=(
  README.md
  CHANGELOG.md
  CONTRIBUTING.md
  ROADMAP.md
  SECURITY.md
  boulder.yaml
  LICENSE
  package.json
  skills/boulder/SKILL.md
  skills/boulder-bootstrap-designer/SKILL.md
  docs/RELEASE_WORKFLOW.md
  docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt
  docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json
  fixtures/docs/doc-registry.v0.json
  fixtures/package-inventory/packaged-files.v0.json
  src/release-evidence.ts
  src/run-events.ts
  test/docs-registry.test.ts
  test/package-inventory-contract.test.ts
  test/run-events-redaction.test.ts
  test/source-cleanliness.test.ts
)

run() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  "$@" 2>&1
}

echo "scope fidelity repo: $ROOT"
echo "expected transcript artifact: .omo/evidence/boulder-9-3-plus-verified/f4-scope-fidelity.txt"
echo "assert:public-files ${PUBLIC_FILES[*]}"
for file in "${PUBLIC_FILES[@]}"; do
  echo "checking public artifact: $file"
  run test -s "$file"
done

if run rg -n "trusted publisher (is )?verified|npm account (is )?verified|guarantees? (a )?9\\.3|guarantees? (the )?score" "${SCAN_SURFACES[@]}"; then
  echo "forbidden external-state or guaranteed-score claim found" >&2
  exit 1
fi

if run rg -n "sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,}" "${SCAN_SURFACES[@]}"; then
  echo "secret-like token found in repository content" >&2
  exit 1
fi

run bun test test/run-events-redaction.test.ts
run bun test test/source-cleanliness.test.ts test/docs-registry.test.ts test/package-inventory-contract.test.ts

echo "scope fidelity complete"
