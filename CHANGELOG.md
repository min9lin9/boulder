# Changelog

## Unreleased

## 0.1.16

- Added `boulder routine capture` for repo-local repeated-work metadata.
- Added `boulder retro weekly --dry-run` for review-only weekly routine summaries.
- Added `boulder skill propose --from-routine` for metadata-only, reviewable skill proposal packets.
- Added bootstrap interview/profile scoring guidance and profile-scoped capability recommendations.
- Kept the release boundary explicit: no scheduler, calendar mutation, auto-install/update/apply, external model call, or private corpus dependency is introduced by the routine loop.

## 0.1.15

- Published `boulder-oss-cli@0.1.15` after the capability source registry release.
- Kept the CLI `--version` output aligned with the npm package version.
- Refreshed release-facing evidence for the `0.1.15` npm publish.

## 0.1.14

- Added workflow profile commands for `profile list`, `profile resolve`, `profile show`, `profile save`, and `profile use`.
- Added built-in `programming-default`, `research-default`, and `ops-default` profiles with task-class suggestions that do not auto-switch active profiles.
- Added tenant-safe `handoff packet`, `handoff review`, and approval-gated `handoff send` flows.
- Hardened external handoff safety around raw workspace references, adapter traversal, stale or forged review receipts, symlinked packet paths, and symlinked review-secret paths.
- Updated `doctor`, `quickstart`, `pipeline`, and `export` to report active profile routing and profile drift.
- Added runtime guards for repo-controlled project profile JSON so invalid lane owner, mode, adapter, purpose, or surface values fail closed.

## 0.1.13

- Split executor adapter preference from adapter availability in `boulder doctor`.
- Report missing GJC/LazyCodex installations as `configured-unverified` warnings instead of implying installation.
- Kept first-run setup automatic for adapter preferences while preserving explicit approval for live executor commands.

## 0.1.12

- Made first-run executor setup visible in `quickstart`: planning is `gajae-code`, execution is `lazycodex`, both `detect-and-suggest`.
- Added configured GJC/LazyCodex adapter capabilities to `boulder doctor` output.
- Clarified local Codex skill guidance so initial setup reports adapter configuration without auto-running external executors.

## 0.1.11

- Renamed the documented local Codex skill invocation from `/Boulder` to `boulder` to match the actual skill name.
- Updated packaged skill metadata, Korean usage guidance, and README examples around the lowercase skill trigger.

## 0.1.10

- Raised the supported Bun runtime floor to `>=1.3.14` and removed the default GJC runtime doctor warning.
- Added local Codex skills, plugin-cache skills, MCP config, plugin family, and Bun runtime discovery for `boulder doctor` when a checked-in inventory fixture is absent.
- Split the lightweight manifest YAML reader into a small parser module with boundary tests.
- Added approval-gated GJC and LazyCodex command adapter candidates to pipeline executor routes.
- Refreshed release workflow evidence for the upgraded runtime and package dry-run.

## 0.1.9

- Added `boulder replay-run --dry-run` for share-safe replay runbook generation.
- Added external replay transcripts for `kimi-agent-swarm-skill`, `gajae-code`, and `awesome-codex-subagents`.
- Compressed the README around install, first run, core commands, evidence, and contributor entry points.
- Added issue-to-PR-to-CI evidence for the replay-run development cycle.

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
