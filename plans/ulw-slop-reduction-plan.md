# ULW Slop Reduction Plan

Status: review-ready
Date: 2026-06-06

## Scope

Narrowed by reviewer feedback to the safest behavior-preserving cleanup slice.

In scope:

- Add CLI E2E characterization tests before source cleanup.
- Reduce source pure LOC without changing CLI output or scorecard behavior.
- Keep manifest parser, benchmark parser, release-plan checks, and command registry untouched.
- Capture full CI, LSP, repo-local AST sanity, and tmux manual QA evidence.

Out of scope:

- Manifest/parser decomposition.
- Benchmark/release-plan refactors without additional failure-path tests.
- CLI command-registry rewrite.
- Public behavior fixes unrelated to the cleanup, including existing `--cwd <path> version` parsing behavior.

## Execution Waves

### Wave 1: Behavior Lock

- Add `test/cli-e2e.test.ts`.
- Cover init/validate/scorecard/export happy path.
- Cover unsafe provider policy rejection.
- Cover root release-plan readiness plus initialized export.

### Wave 2: Minimal Source Cleanup

- Replace CLI side-effect helper with a pure shared `formatLines` formatter.
- Inline `ratingForScore` into `ratingForCriteria`.
- Preserve exact output strings, score thresholds, and provider-policy override behavior.

### Wave 3: Verification

- LSP diagnostics on changed TypeScript files.
- Repo-local AST sanity with `bunx @ast-grep/cli` for removed helper references and unsafe casts in changed files.
- `bun run ci`.
- tmux manual QA for happy path, unsafe provider rejection, and release/export.
- Five strict reviewer passes before PR/merge.

## Success Criteria

- `bun run ci` passes.
- `test/cli-e2e.test.ts` passes.
- Manual QA scenarios A-C pass with cleanup receipts.
- `src/cli.ts` pure LOC is lower than baseline `145`.
- `src/scorecard.ts` pure LOC is lower than baseline `216`.
- No generated root docs are dirty.
- Reviewers return `OKAY`.

Evidence files:

- `plans/qa/static-gates.md`
- `plans/qa/manual-qa-report.md`

## Actual LOC Target

This branch targets safe net source reduction, not aggressive module-size reduction.

- `src/cli.ts`: baseline `145`, target `<145`.
- `src/scorecard.ts`: baseline `216`, target `<216`.
- `src/globals.d.ts`: baseline `43`, expected `44` after adding temp-dir cleanup typing.

Higher reductions require additional characterization and are intentionally deferred.
