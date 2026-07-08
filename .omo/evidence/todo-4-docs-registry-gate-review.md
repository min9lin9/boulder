# Todo 4 Docs Registry Gate Review

recommendation: SUPERSEDED

SUPERSEDED_BY:
- `.omo/evidence/boulder-9-3-plus-verified/task-4-support-review.txt`
- commit `fbc4dbc` (`test(docs): cover registry metadata failures`)
- pending final Wave 1 verifier after support-review coverage is rechecked

Historical result below is retained for audit context only.

recommendation: REJECT

originalIntent: Verify Todo 4 completion for the documentation registry contract in `/home/burt/Documents/Boulder-9-3-plus`, covering commit `d569cdefba57e0b3de9e00e26eccc8bead06b167` and current worktree.

desiredOutcome: Return `CONFIRMED` only if the fixture, tests, evidence transcripts, and scoped commit prove the docs registry covers packaged docs and local-only exclusions, enforces required fields and allowed kinds, has meaningful translation/generated/local-only negative tests, and contains no out-of-scope Todo 4 files.

userOutcomeReview: Not fully satisfied. The fixture content is structurally complete and current Todo 4 files have not drifted since `d569cde`, but the committed tests do not prove all Todo 4 acceptance criteria. In particular, the plan requires generated-doc negative coverage and translation source/version negative coverage, while the test suite only covers translation missing `dir` and packaged local-only rejection.

blockers:
- `test/docs-registry.test.ts:42` only mutates a translation by removing `dir`; it does not test translation missing `source` or `version`, despite `.omo/plans/boulder-9-3-plus-verified.md:150`.
- `test/docs-registry.test.ts:51` covers packaged local-only rejection, but there is no test that rejects a generated doc missing `source` or `generatedBy`, despite `.omo/plans/boulder-9-3-plus-verified.md:150`.
- No separate Todo 4 code-review report, manual QA matrix, or notepad path was present in the checked artifacts. The required skill-perspective/overfit report coverage is therefore absent.

checked artifact paths:
- `.omo/plans/boulder-9-3-plus-verified.md`
- `.omo/drafts/boulder-9-3-plus-verified.md`
- `.omo/evidence/boulder-9-3-plus-verified/task-4-doc-registry.txt`
- `.omo/evidence/boulder-9-3-plus-verified/task-4-i18n-failure.txt`
- `fixtures/docs/doc-registry.v0.json`
- `fixtures/package-inventory/packaged-files.v0.json`
- `package.json`
- `test/docs-registry.test.ts`
- `AGENTS.md`
- `test/AGENTS.md`
- `docs/AGENTS.md`

direct evidence:
- `bun test test/docs-registry.test.ts` passed: 3 tests, 0 failures.
- `bunx tsc --noEmit` exited 0.
- Direct fixture check: 81 registry entries; 78 packaged `docs/**` entries match package inventory; 3 local-only exclusions match `package.json#files`; all required fields present; allowed kinds are exactly `canonical`, `generated`, `local-only`, `translation`; generated count 19; translation count 3.
- `git show --name-only d569cdef...` contains only the two Todo 4 evidence transcripts, `fixtures/docs/doc-registry.v0.json`, and `test/docs-registry.test.ts`.
- `git diff d569cdef...HEAD -- Todo 4 paths` is empty. Later `HEAD` commit only adds Todo 2 release-evidence files/code/tests outside Todo 4.

slop_overfit_review:
- No production code was added in Todo 4.
- No deletion-only or tautological removal tests found.
- The registry coverage test is meaningful for current packaged-doc and local-only equality, but the negative-test set is underfit against the stated contract and creates false confidence for generated and translation source/version metadata.
- No unnecessary production extraction or new dependency found.

exact evidence gaps:
- Missing generated negative test for `kind: "generated"` without `source`.
- Missing generated negative test for `kind: "generated"` without `generatedBy`.
- Missing translation negative tests for missing `source` and missing `version`.
- Missing task-specific review/manual QA/notepad artifact showing the same programming/remove-ai-slops perspective and overfit/slop coverage.
