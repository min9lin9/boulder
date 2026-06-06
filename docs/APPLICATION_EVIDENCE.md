# Application Evidence

This page records the public evidence that `boulder` is a runnable, maintained OSS maintainer toolkit.

## Repository

- GitHub: `min9lin9/boulder`
- Package distribution name: `boulder-oss-cli`
- License: MIT
- Runtime: Bun + TypeScript
- Current release: `v0.1.7`

## M1 Surface

`boulder` currently exposes eight maintainer workflow commands:

```bash
boulder init
boulder inspect
boulder validate
boulder verify --dry-run
boulder scorecard
boulder benchmark
boulder release-plan
boulder export
```

These commands generate and maintain:

- `boulder.yaml`
- `BOULDER.md`
- `docs/REPO_BRIEF.md`
- `docs/MAINTAINER_WORKFLOWS.md`
- `docs/OPERATOR_WORKFLOW_STACK.md`
- `docs/VERIFICATION_GATES.md`
- `docs/PROVIDER_POLICY.md`
- `docs/HARNESS_QUALITY_SCORECARD.md`
- `docs/BENCHMARK_FIXTURE_REPORT.md`
- `docs/RELEASE_PLAN.md`
- `docs/BOULDER_EXPORT.md`
- `docs/CODEX_WORKFLOW_NOTES.md`

## Maintainer Automation Fit

`boulder` targets repeated OSS maintenance work:

- issue triage
- PR review prep
- release planning
- dependency review
- verification gates
- provider-aware execution boundaries

The core rule is simple: explicit context before action, approval before risk, evidence before claims, and verification before completion.

## M7 Operator Workflow Stack

`boulder` now defaults to the har-maker-level operator workflow stack:

- Superpowers as the workflow spine
- GStack as the review gate layer
- Compound as the learning layer

This is a workflow contract, not a runtime dependency claim. The stack is represented in `boulder.yaml`, `docs/OPERATOR_WORKFLOW_STACK.md`, generated export notes, manifest validation, harness scorecard criteria, and release-plan evidence checks.

## Verification Evidence

The current release is verified with:

```bash
bun run ci
```

The CI command runs:

- CLI help surface
- Bun test suite
- Bun build
- package dry run

The current test suite covers:

- `init` creates harness files
- `inspect` returns a repo brief shape
- `validate` catches unsafe provider policies
- `verify` supports dry run
- `scorecard` rates harness quality across context, verification, provider policy, export, and review boundaries
- `benchmark` checks fixture completeness without runtime or leaderboard claims
- `release-plan` checks release-facing evidence, including operator workflow stack evidence, while keeping publishing manual
- `export` writes Codex workflow notes
- checked-in TypeScript, Python, and MCP-shaped example harnesses

## Boundaries

`boulder` does not claim to be:

- a full agent runtime
- a swarm product
- a benchmark leaderboard
- a replacement for local verification
- an integration claim for external OSS projects

External projects and catalogs can be referenced with attribution, but their adoption metrics are not Boulder adoption metrics.

## Next Evidence Targets

- Submit the v0.1.7 Codex for OSS application packet.
- Keep npm publication separate unless package distribution becomes required.
