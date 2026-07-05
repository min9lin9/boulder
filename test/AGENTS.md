# test KNOWLEDGE BASE

Scope: `test/`

## OVERVIEW

Bun tests define Boulder behavior. Prefer focused CLI/e2e tests over implementation snapshots.

## WHERE TO LOOK

| Behavior | Tests |
| --- | --- |
| Basic CLI and cleanup safety | `cli*.test.ts`, `cli-*-e2e.test.ts` |
| Bootstrap interview | `bootstrap-interview-cli-e2e.test.ts` |
| Profiles | `workflow-profiles.test.ts`, `profile-cli-e2e.test.ts`, `profile-state-safety-e2e.test.ts` |
| Capability sources/import/doctor | `capability-*.test.ts` |
| Handoff safety | `handoff-*.test.ts` |
| Readiness gates | `product-readiness.test.ts`, `service-readiness.test.ts`, `readiness-reports.test.ts` |

## CONVENTIONS

- Use helpers from `test/helpers/cli.ts` for temp repos and CLI execution.
- Temp repos must be removed with `removeTempRepo` in `finally`.
- Test observable CLI stdout/stderr/exit codes, not private implementation details.
- Keep JSON assertions targeted to contract fields; avoid full-output snapshots.

## ANTI-PATTERNS

- Do not weaken tests to match an implementation shortcut.
- Do not delete failing tests to make CI green.
- Do not write outside temp repos except documented evidence output.

## CHECKS

```bash
bun test
bun test test/bootstrap-interview-cli-e2e.test.ts test/workflow-profiles.test.ts test/profile-cli-e2e.test.ts
```
