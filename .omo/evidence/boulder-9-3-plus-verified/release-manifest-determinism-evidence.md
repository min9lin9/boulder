# Release Manifest Determinism Evidence

## Scope
- Scenario: stale v0.1.15 release manifest checked by v0.1.16 release readiness.
- Fix: compare `tagCommit` to the local git tag only when `manifest.tag` equals `v${version}`.
- Source file pure LOC: `123` in `src/release-manifest-check.ts`.

## Failing-First Proof
- Worktree baseline: `pre-edit-readiness-focused.txt` shows `bun test test/readiness-baseline-fixtures.test.ts test/readiness-registry.test.ts` passed with 6 pass, 0 fail before edits.
- Clean archive repro: `pre-edit-clean-archive-readiness.txt` shows archived `a7d9baa` failed the two readiness baseline checks because archive output omitted `tagCommit must match local tag v0.1.16`.
- Post-code/pre-baseline proof: `post-code-pre-baseline-readiness-focused.txt` shows the same one-field fixture drift in the normal worktree after the code change.

## Final Verification
- Focused requested tests: `post-patch-focused-tests-final.txt` shows 38 pass, 0 fail for `bun test test/readiness-baseline-fixtures.test.ts test/readiness-registry.test.ts test/readiness-reports.test.ts test/cli-e2e.test.ts`.
- Typecheck: `post-patch-tsc-final.txt` shows `tsc_status=0` for `bunx tsc --noEmit`.
- TypeScript no-excuse scan: `no-excuse-release-manifest-check.txt` shows no violations in `src/release-manifest-check.ts`.
- Manual QA surface: `release-manifest-determinism-release-check.json` is stdout from `bun bin/boulder.ts release-check --json`; command status is intentionally nonzero because release-check remains blocked.

## Generated Baselines
- `test/fixtures/baselines/readiness-v0/release-check.json`
- `test/fixtures/baselines/readiness-v0/product-readiness.json`
- `test/fixtures/baselines/readiness-v0/pack-dry-run.txt`

## Cleanup Receipts
- `pre-edit-clean-archive-readiness.txt` records removal of `/tmp/boulder-pre-archive.20y7RY`.
- `no-excuse-release-manifest-check.txt` records removal of the temporary in-repo no-excuse script copy.

## Adversarial Classes
- stale_state: covered by clean archive failure and final worktree baseline parity.
- dirty_worktree: covered by `pre-commit-git-inspection.txt`.
- misleading_success_output: covered by clean archive repro plus focused tests, typecheck, manual CLI stdout, and no-excuse scan artifacts.
- hung_or_long_commands: commands were run with `timeout`.
- malformed_input: not triggered; existing malformed manifest test stayed green in `post-patch-focused-tests-final.txt`.
- prompt_injection/cancel_resume/flaky_tests/repeated_interruptions: not applicable; no external prompt content, cancellation, retry flake, or interruption occurred.
