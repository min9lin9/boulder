# Application Evidence

This page records the public evidence that `boulder` is a runnable, maintained OSS maintainer toolkit.

## Repository

- GitHub: `min9lin9/boulder`
- Package distribution name: `boulder-oss-cli`
- License: MIT
- Runtime: Bun + TypeScript
- Current release: `v0.1.5`

## M1 Surface

`boulder` currently exposes seven maintainer workflow commands:

```bash
boulder init
boulder inspect
boulder validate
boulder verify --dry-run
boulder scorecard
boulder benchmark
boulder export
```

These commands generate and maintain:

- `boulder.yaml`
- `BOULDER.md`
- `docs/REPO_BRIEF.md`
- `docs/MAINTAINER_WORKFLOWS.md`
- `docs/VERIFICATION_GATES.md`
- `docs/PROVIDER_POLICY.md`
- `docs/HARNESS_QUALITY_SCORECARD.md`
- `docs/BENCHMARK_FIXTURE_REPORT.md`
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

- Improve Codex subagent workflow notes and attribution-safe catalog references.
- Add release packaging automation once the manual release path has enough evidence.
