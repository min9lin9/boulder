# Profile/Handoff Cleanup Evidence

Scope: Boulder profile and handoff command cleanup for safer profile selection and less command-local formatting duplication.

## Changes

- Added a profile-name guard to `profile use` so traversal-like names fail as `profile.invalid_name`.
- Reused the shared profile error reporter across `resolve`, `save`, and `use`.
- Added `prettyJson` in `src/cli-format.ts` and removed command-local pretty JSON calls from CLI command modules.
- Added source-cleanliness coverage so command modules do not reintroduce direct pretty JSON rendering.

## Verification

- `bun test test/profile-cli-e2e.test.ts --test-name-pattern "rejects profile use path traversal as an invalid profile name"` failed before the fix with `profile.not_found`, then passed with `profile.invalid_name`.
- `bun test test/source-cleanliness.test.ts test/profile-cli-e2e.test.ts test/handoff-cli-e2e.test.ts test/cli-e2e.test.ts` passed.
- `bunx tsc --noEmit` passed.
- TypeScript no-excuse checker passed on the changed TypeScript files.
- LSP diagnostics scanned 43 `src/**/*.ts` files with 0 diagnostics.
- `@ast-grep/cli` found no `JSON.stringify($VALUE, null, 2)` matches in command modules.
- `bun run ci` passed: 133 tests, build, and pack dry-run.
- `boulder release-check --json`, `boulder product-readiness --json`, and `boulder service-readiness --json` returned `status: "ready"`.

## Manual QA Receipts

- `manual-profile-happy.txt`: `init -> profile use research-default -> quickstart -> pipeline --friction high --json -> export --force`.
- `manual-profile-invalid-name.txt`: `profile use ../../../escape` rejects with `profile.invalid_name` and exit 1.
- `manual-handoff-unsafe.txt`: unsafe include path rejects with `handoff.protected_path` and exit 1.

All manual receipts are non-interactive transcripts with command, stdout, stderr, and exit code.
