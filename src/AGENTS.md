# src KNOWLEDGE BASE

Scope: `src/`

## OVERVIEW

TypeScript implementation for the Boulder CLI. Public behavior is command-line output plus JSON contracts covered by Bun tests.

## WHERE TO LOOK

| Area | Files |
| --- | --- |
| Command router | `cli.ts`, `cli-options.ts`, `cli-format.ts` |
| Ops verbs (release/evidence/replay/readiness/doctor) | `cli-ops-command.ts` |
| Bootstrap interview | `bootstrap-interview.ts`, `task-scoring.ts` |
| Profiles | `workflow-profiles.ts`, `workflow-profile-builtins.ts`, `profile-command.ts`, `profile-store.ts` |
| Capability sources | `capability-source.ts`, `capability-source-schema.ts`, `capability-command.ts` |
| Doctor | `capability-doctor.ts`, `capability-inventory.ts` |
| Handoff | `handoff-command.ts`, `handoff-packet*.ts`, `handoff-path*.ts`, `handoff-validation.ts` |
| Plan/planner stack | `plan-command.ts`, `plan-store.ts`, `plan-state.ts`, `plan-receipts.ts`, `plan-approval.ts`, `planner-*.ts`, `planning-*.ts` |
| Execution packets | `execution-*.ts`, `common-executor-evidence.ts`, `pipeline.ts` |
| Run events | `run-events.ts`, `run-event-shape.ts`, `run-event-redaction.ts`, `runs-command.ts` |
| Gates | `release-check.ts`, `replay-check.ts`, `product-readiness.ts`, `service-readiness.ts` |
| Manifest/export/fs | `manifest.ts`, `manifest-yaml.ts`, `export.ts`, `fs.ts`, `validation.ts`, `verify.ts` |
| v2 kernel (gated) | `v2/`, `v2-command.ts` — read `v2/AGENTS.md` first |
| k2a-f contract foundation | `k2a-f/` — read `k2a-f/AGENTS.md` first |
| Markdown templates | `templates/init.ts`, `templates/export.ts` |

## CONVENTIONS

- Prefer plain functions and typed records over classes.
- Keep command modules side-effect-light; `cli.ts` should route, not own domain logic.
- JSON contracts must be additive unless tests intentionally pin a breaking change.
- Use explicit error classes/codes for user-facing CLI failures.
- Path and manifest writes must stay under the target repo and reject traversal/symlink abuse.
- Command-module JSON goes through shared pretty rendering (`cli-format.ts`); raw `JSON.stringify` in command modules fails `test/source-cleanliness.test.ts`.

## ANTI-PATTERNS

- No `as any`, `@ts-ignore`, or broad type suppression.
- No network validation for GitHub capability sources in the parser/import path.
- No automatic install/update behavior in `doctor` or `bootstrap interview`.
- No duplicate profile taxonomy: built-in presets and interview recommendations must stay aligned.
- No imports from v1 domain modules into `v2/` or `k2a-f/`; `test/v2-source-boundary.test.ts` enforces subsystem self-containment.

## CHECKS

```bash
bunx tsc --noEmit
bun test test/bootstrap-interview-cli-e2e.test.ts test/workflow-profiles.test.ts test/profile-cli-e2e.test.ts
```
