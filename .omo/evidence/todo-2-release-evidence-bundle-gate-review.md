recommendation: SUPERSEDED

SUPERSEDED_BY:
- `.omo/evidence/boulder-9-3-plus-verified/task-2-support-review.txt`
- commit `14e7ea2` (`fix(release): validate release evidence drift fields`)
- pending final Wave 1 verifier after current-evidence acceptance is rechecked

Historical result below is retained for audit context only.

recommendation: REJECT

blockers:
- Todo 2 acceptance requires mismatched package version, tag, CI commit, and pack file count to be rejected with stable recovery codes. `src/release-evidence.ts` only rejects `packageJsonVersion`, `cliVersion`/`publishedVersion`, `tag`, and `packDryRun.packageVersion`.
- Direct verification showed `checkReleaseEvidenceBundle(parseReleaseEvidenceBundle(...bad releaseCommit...), expected)` returns `pass` with no issues.
- Direct verification showed `checkReleaseEvidenceBundle(parseReleaseEvidenceBundle(...bad packDryRun.fileCount...), expected)` returns `pass` with no issues.
- `test/release-evidence-bundle.test.ts` has no CI commit mismatch case and no pack file count mismatch case.
- No Task 2 code-review report/manual QA matrix/notepad artifact was provided or found that demonstrates `programming` plus `remove-ai-slops` coverage.

originalIntent:
- Implement Todo 2 from `.omo/plans/boulder-9-3-plus-verified.md`: seed release/package evidence recovery codes and add `ReleaseEvidenceBundleV1` model/renderers for the exact release evidence target set.
- Acceptance required unit tests proving the bundle validates current evidence and rejects mismatched package version, tag, CI commit, and pack file count with stable recovery codes.

desiredOutcome:
- User can rely on the new bundle contract to detect all listed release evidence drift classes before later refresh/readiness work consumes it.
- Recovery codes are stable and machine-readable.
- Renderer target keys exactly match the plan.
- Evidence transcripts for the Todo 2 test commands exist.

userOutcomeReview:
- Partial. Recovery code constants exist and the renderer key set matches the plan's seven targets.
- Focused tests and `bunx tsc --noEmit` pass.
- The user-visible completion claim is not supported because two explicitly requested adversarial classes, CI commit mismatch and pack file count mismatch, are accepted as `pass`.

checkedArtifactPaths:
- `.omo/plans/boulder-9-3-plus-verified.md`
- `.omo/evidence/boulder-9-3-plus-verified/task-2-bundle-tests.txt`
- `.omo/evidence/boulder-9-3-plus-verified/task-2-mismatch.txt`
- `src/recovery-codes.ts`
- `src/release-evidence.ts`
- `test/release-evidence-bundle.test.ts`
- `docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json`
- `docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt`
- `docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt`
- `package.json`

evidence:
- `git rev-parse --short HEAD` in `/home/burt/Documents/Boulder-9-3-plus` returned `08c70e2`; `git status --short` was clean before this gate artifact was written.
- `git show --name-only 08c70e2` changed only Task 2 source/test/evidence files.
- `bun test test/release-evidence-bundle.test.ts` passed: 3 tests, 14 assertions.
- `bun test test/release-evidence-bundle.test.ts --test-name-pattern mismatch` passed: 1 test, 5 assertions.
- `bunx tsc --noEmit` exited 0.
- No `any`, `as any`, `as unknown`, `@ts-ignore`, `@ts-expect-error`, or non-null assertion matches were found in the changed TS files by grep.
- Direct bundle probe printed `releaseCommit pass NO_ISSUES` and `packFileCount pass NO_ISSUES`.

slopReview:
- Direct `remove-ai-slops` pass found no needless extraction, broad abstraction, dead-code scaffolding, or tautological deletion-only tests in the changed production files.
- The mismatch test is overfit/incomplete for the acceptance wording: it batches package/CLI/tag/pack-package-version drift and omits CI commit and pack file-count drift, creating false confidence.
- `programming` TypeScript checks: no `any`/banned assertions observed; readonly model types are used; no new dependency was added.

exactEvidenceGaps:
- Missing recovery code for CI/release commit mismatch in `src/recovery-codes.ts`.
- Missing recovery code for pack file count mismatch in `src/recovery-codes.ts`.
- Missing expected commit/count fields or equivalent inputs in `ReleaseEvidenceExpectation`.
- Missing validation logic for `tagCommit`/`releaseCommit` against expected/local/documented CI commit in `checkReleaseEvidenceBundle`.
- Missing validation logic for `packDryRun.fileCount` against expected pack dry-run file count in `checkReleaseEvidenceBundle`.
- Missing tests for CI commit mismatch and pack file count mismatch in `test/release-evidence-bundle.test.ts`.
