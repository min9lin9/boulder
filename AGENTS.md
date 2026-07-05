# PROJECT KNOWLEDGE BASE

Status: active
Scope: Boulder CLI worktree
Stack: Bun >=1.3.14, TypeScript ESM CLI

## OVERVIEW

Boulder is a Bun TypeScript CLI for turning OSS repos into evidence-backed Codex workflows. The product centers on project-local workflow profiles, GitHub URL capability sources, doctor/readiness gates, and exportable evidence.

## STRUCTURE

| Path | Purpose |
| --- | --- |
| `src/` | CLI implementation, workflow profiles, capability source registry, gates |
| `test/` | Bun tests; CLI behavior is the source of truth |
| `docs/` | User-facing product, readiness, release, and architecture docs |
| `skills/` | Packaged Codex skills shipped with the npm package |
| `fixtures/` | Stable input/output contracts for benchmarks, profiles, replay, gates |
| `examples/` | Example target repos used for replay and onboarding checks |
| `.omo/` | Local planning/evidence workspace; do not assume it is release content |

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Add/change CLI command | `src/cli.ts`, then command module | Keep parsing shape consistent with `cli-options.ts` |
| Workflow profile behavior | `src/workflow-profiles.ts`, `src/workflow-profile-builtins.ts`, `src/profile-command.ts` | Preset and interview bootstrap must not drift |
| Bootstrap interview scoring | `src/bootstrap-interview.ts`, `src/task-scoring.ts` | Deterministic only; no LLM classifier |
| Capability source registry | `src/capability-source*.ts`, `src/capability-command.ts` | Canonical source is `https://github.com/<owner>/<repo>` |
| Doctor/local inventory | `src/capability-doctor.ts`, `src/capability-inventory.ts` | Read-only verification; update/apply is separate |
| Handoff safety | `src/handoff-*` | Raw workspace content remains forbidden by default |
| Readiness gates | `src/*readiness.ts`, `src/release-check.ts`, `src/replay-*` | Gate failures are product work, not prose caveats |

## COMMANDS

```bash
bun test
bun test test/bootstrap-interview-cli-e2e.test.ts test/workflow-profiles.test.ts test/profile-cli-e2e.test.ts
bunx tsc --noEmit
bun run ci
bun bin/boulder.ts --help
```

## PROJECT RULES

- Do not add npm dependencies unless a standard/library-free solution is clearly worse.
- Keep commands deterministic and local-first. External model calls and live executors stay approval-gated.
- `capability import --dry-run` is not installation. It previews source-candidate manifests.
- GitHub capability sources are canonicalized as `https://github.com/<owner>/<repo>` and stored by `github__owner__repo`.
- `doctor` reports local availability; it must not install, update, or write tool configs.
- `profile use` is the explicit state-changing path for active profiles.
- `bootstrap interview` recommends one of the same built-in presets that `profile show/resolve/use` can handle.

## VERIFICATION

For non-trivial TypeScript changes, run at least the focused Bun test for the touched surface plus `bunx tsc --noEmit`. For release/package surface changes, run `bun run ci`.

## NOTES

code-review-graph may be empty for this worktree; if so, use direct file inspection with `rg` and focused reads. Do not rewrite unrelated dirty files.
