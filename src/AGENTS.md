# src KNOWLEDGE BASE

Scope: `src/`

## OVERVIEW

TypeScript implementation for the Boulder CLI. Public behavior is command-line output plus JSON contracts covered by Bun tests.

## WHERE TO LOOK

| Area | Files |
| --- | --- |
| Command router | `cli.ts`, `cli-options.ts`, `cli-format.ts` |
| Bootstrap interview | `bootstrap-interview.ts`, `task-scoring.ts` |
| Profiles | `workflow-profiles.ts`, `workflow-profile-builtins.ts`, `profile-command.ts`, `profile-store.ts` |
| Capability sources | `capability-source.ts`, `capability-source-schema.ts`, `capability-command.ts` |
| Doctor | `capability-doctor.ts`, `capability-inventory.ts` |
| Handoff | `handoff-command.ts`, `handoff-packet*.ts`, `handoff-path*.ts`, `handoff-validation.ts` |
| Gates | `release-check.ts`, `replay-check.ts`, `product-readiness.ts`, `service-readiness.ts` |

## CONVENTIONS

- Prefer plain functions and typed records over classes.
- Keep command modules side-effect-light; `cli.ts` should route, not own domain logic.
- JSON contracts must be additive unless tests intentionally pin a breaking change.
- Use explicit error classes/codes for user-facing CLI failures.
- Path and manifest writes must stay under the target repo and reject traversal/symlink abuse.

## ANTI-PATTERNS

- No `as any`, `@ts-ignore`, or broad type suppression.
- No network validation for GitHub capability sources in the parser/import path.
- No automatic install/update behavior in `doctor` or `bootstrap interview`.
- No duplicate profile taxonomy: built-in presets and interview recommendations must stay aligned.

## CHECKS

```bash
bunx tsc --noEmit
bun test test/bootstrap-interview-cli-e2e.test.ts test/workflow-profiles.test.ts test/profile-cli-e2e.test.ts
```
