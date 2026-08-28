# fixtures KNOWLEDGE BASE

Scope: `fixtures/`

## OVERVIEW

Checked-in contract inputs and golden vectors for Bun tests. Nothing here is generated at test time; every file is a stable input that a named test reads. This directory ships in the npm package (`files` allowlist).

## STRUCTURE

| Path | Consumed by |
| --- | --- |
| `benchmarks/` | `test/readiness-reports.test.ts`, `test/release-evidence-bundle.test.ts` |
| `capabilities/` | `test/capability-*.test.ts`, `test/source-cleanliness.test.ts` |
| `docs/` | doc registry / package inventory checks |
| `handoffs/` | handoff planning and e2e tests |
| `k2a-f/` | `test/k2a-f-contract-foundation.test.ts` |
| `package-inventory/` | `test/release-evidence-bundle.test.ts`, inventory contract tests |
| `plan-analysis/`, `planning-contracts/`, `planning-packets/` | planner analysis / contract / packet tests |
| `plan-receipts/` | `test/plan-receipts.test.ts` (canonical signing vectors) |
| `planner-benchmarks/` | `test/planner-benchmark.test.ts`, CLI benchmark tests |
| `profiles/` | profile resolution tests, readiness baselines |
| `provider-policies/` | provider policy / doctor tests |
| `replay/` | `test/readiness-reports.test.ts`, replay docs |
| `service-readiness/` | `test/readiness-reports.test.ts` |
| `v2-kernel/` | `test/v2-execution.test.ts`, `test/k0r-evidence-contract.test.ts` |
| `workflow-map/` | `test/workflow-map.test.ts` |

## CONVENTIONS

- Naming: `valid*.json` / `invalid*.json` pairs; versioned canonical names (`*.v0.json`, `*.v1.json`); replay pairs (`official-docs.json` + `replay.json`); text baselines (`pack-dry-run.txt`).
- Every `invalid*.json` fixture needs a matching reject test in the same change.
- Add a fixture only when a test or contract consumes it, and wire the consumer in the same change.
- Fixture names mirror their consumer or the example directory they describe.
- Keep fixtures deterministic, tiny, and local-only.

## ANTI-PATTERNS

- No secrets, private org names, local absolute paths, or network-dependent assumptions.
- No editing golden vectors to make a failing test pass; fix the code or add a new versioned vector.
- No orphaned fixtures with no consuming test or contract.

## CHECKS

```bash
bun test test/planning-contract-fixtures.test.ts test/readiness-baseline-fixtures.test.ts
bun test
```
