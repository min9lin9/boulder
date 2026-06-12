# Changelog

## 0.1.8

- Added `boulder quickstart` and `boulder onboard` for a non-mutating first-run guided flow.
- Added `boulder release-check` for release evidence checks before manual npm and GitHub Release steps.
- Added `boulder replay-check` for official-docs-first public replay fixture validation.
- Added public replay fixtures for `Yeachan-Heo/gajae-code` and `VoltAgent/awesome-codex-subagents`.
- Added external replay case study documentation and updated onboarding/release docs around the new commands.

## 0.1.7

- Published `boulder-oss-cli@0.1.7` to npm with a verified `bunx boulder-oss-cli --help` install smoke.
- Added public product-readiness and service-readiness evidence showing clean release tree readiness.
- Added first-run onboarding, contributor start, community policy, and release workflow documentation.
- Added the har-maker-level operator workflow stack as a default Boulder manifest contract.
- Added Superpowers, GStack, and Compound evidence across generated docs, exports, validation, scorecard, and release-plan checks.
- Added `docs/OPERATOR_WORKFLOW_STACK.md` and test coverage for stack validation and export notes.

## 0.1.6

- Added `boulder release-plan` for release-facing evidence checks.
- Added `docs/RELEASE_PLAN.md` with manual publish boundaries.
- Finalized submission evidence while keeping npm publication manual.

## 0.1.5

- Added `boulder benchmark` for deterministic benchmark fixture reports without runtime or leaderboard claims.
- Added benchmark fixtures for TypeScript library, Python package, and MCP-shaped maintainer workflows.
- Added final submission evidence polish for the Codex for OSS application baseline.

## 0.1.4

- Added `boulder scorecard` for deterministic harness quality scoring.
- Added provider policy fixtures for Codex-only, approval-gated external, and unsafe external provider configurations.
- Added generated scorecard output during `boulder init`.

## 0.1.3

- Added a GitHub Actions CI gate for smoke, build, and package dry-run checks.
- Added package scripts for local CI parity and package distribution validation.

## 0.1.2

- Added generated example harness outputs for TypeScript, Python, and MCP-shaped repositories.
- Updated tests to assert checked-in example harnesses contain expected outputs and verification commands.

## 0.1.1

- Split generated Markdown templates into dedicated modules.
- Added manifest validation for maintainer workflows, verification commands, and provider approval gating.
- Added test coverage for invalid provider policy and generated operator-contract output.

## 0.1.0

- Scaffolded Bun + TypeScript CLI.
- Added `init`, `inspect`, `verify`, and `export` surfaces.
- Added maintainer workflow, provider policy, verification gate, and Codex workflow export templates.
