# Changelog

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
