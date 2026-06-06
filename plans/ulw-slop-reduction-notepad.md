# ULW Slop Reduction Notepad

Status: review-ready
Started: 2026-06-06
Worktree: `/Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder-ulw-slop`
Branch: `codex/ulw-slop-reduction`

## Goal

Reduce Boulder code slop and line count without changing behavior, using code graph/LSP/AST/explorer inspection, test-first regression locking, real CLI manual QA, strict review, PR, and merge when verified.

## Skill Survey

Available skill families were surveyed from the loaded session list. Relevant skills selected:

- `omo:programming`: mandatory for TypeScript edits; enforces strict TypeScript, TDD, no `any`, no unsafe casts, and 250 pure LOC ceiling.
- `omo:remove-ai-slops`: explicitly requested; behavior lock first, then remove comments/defensive code/dead code/duplication/complexity/oversized modules.
- `beej-plan-critic`: explicitly requested. Local Beej guide corpus search for `plan refactor testing` returned no relevant primary-guide hits for this TypeScript CLI cleanup, so no Beej-specific claim will be made.
- `harness-maker`: active session skill for reusable operator workflow design; used to preserve Boulder as a harness asset rather than a one-off cleanup.
- `superpowers`/ULW mode: active developer workflow; drives characterization, manual QA, and reviewer gate for this refactor cleanup.

Related but not primary:

- `lsp`: used for diagnostics on changed files.
- `ast_grep`: MCP wrapper was unavailable because global `sg` was missing; repo-local `bunx @ast-grep/cli` was used for structural searches.
- `code-review-graph`: attempted first; Boulder worktree graph returned 0 nodes, so AST/LSP/context-mode/explorer fill the gap.

## Binding Success Criteria

### Criterion A: CLI happy path preserved

User-visible scenario:

- Run `boulder init`, `validate`, `scorecard`, and `export` on a temporary target.

Automated test, written before implementation:

- `test/cli-e2e.test.ts`: `boulder CLI e2e cleanup safety > preserves full init-to-export happy path`

Manual QA:

- Channel: tmux
- Invocation: `tmux new-session -d -s ulw-qa-happy 'cd <worktree> && tmp=$(mktemp -d) && bun bin/boulder.ts init --cwd "$tmp" && bun bin/boulder.ts validate --cwd "$tmp" && bun bin/boulder.ts scorecard --cwd "$tmp" --json && bun bin/boulder.ts export --cwd "$tmp" --force'`
- PASS observable: captured transcript contains `Boulder export complete` and scorecard JSON rating is `ready`.
- Characterization correction: initial invalid test expected temp-repo release-plan readiness and failed; the test was corrected before source cleanup.
- Post-cleanup evidence: `bun test test/cli-e2e.test.ts` passed after source cleanup.
- Manual artifact: `plans/qa/manual-qa-report.md`, Scenario A.
- Cleanup receipt: temp target removed and `ulw-qa-happy` session gone.

### Criterion B: unsafe provider policy remains rejected

User-visible scenario:

- Create a target with an unsafe external provider policy, then run `boulder validate`.

Automated test, written before implementation:

- `test/cli-e2e.test.ts`: `boulder CLI e2e cleanup safety > rejects unsafe provider policy through validate command`

Manual QA:

- Channel: tmux
- Invocation: `tmux new-session -d -s ulw-qa-unsafe-provider 'cd <worktree> && tmp=$(mktemp -d) && bun bin/boulder.ts init --cwd "$tmp" && cat > "$tmp/boulder.yaml" < fixtures/provider-policies/external-without-approval/boulder.yaml && bun bin/boulder.ts validate --cwd "$tmp"; echo exit:$?'`
- PASS observable: captured transcript contains `External providers require approval gating.` and `exit:1`.
- Characterization evidence: E2E unsafe-provider scenario existed before source cleanup.
- Post-cleanup evidence: `bun test test/cli-e2e.test.ts` passed after source cleanup.
- Manual artifact: `plans/qa/manual-qa-report.md`, Scenario B.
- Manual artifact: `plans/qa/manual-qa-report.md`, Scenario B.
- Cleanup receipt: temp target removed and `ulw-qa-unsafe-provider` session gone.

### Criterion C: adjacent release/export behavior preserved

User-visible scenario:

- Run `release-plan --json` and `export --force` on the repository fixture.

Automated test, written before implementation:

- `test/cli-e2e.test.ts`: `boulder CLI e2e cleanup safety > preserves root release-plan and initialized export surface`

Manual QA:

- Channel: tmux
- Invocation: `tmux new-session -d -s ulw-qa-release-export 'cd <worktree> && tmp=$(mktemp -d) && bun bin/boulder.ts init --cwd "$tmp" && bun bin/boulder.ts release-plan --json && bun bin/boulder.ts export --cwd "$tmp" --force'`
- PASS observable: captured transcript contains release-plan JSON with `"status": "ready"` and `Boulder export complete`.
- Characterization evidence: E2E release/export scenario existed before source cleanup.
- Post-cleanup evidence: `bun test test/cli-e2e.test.ts` and `bun run ci` passed after source cleanup.
- Manual artifact: `plans/qa/manual-qa-report.md`, Scenario C.
- Manual artifact: `plans/qa/manual-qa-report.md`, Scenario C.
- Cleanup receipt: temp target removed and `ulw-qa-release-export` session gone.

### Criterion D: line count decreases with no behavior regression

User-visible scenario:

- Compare pure LOC before/after and run full CI.

Automated test, written before implementation:

- Characterization tests in `test/cli-e2e.test.ts` from criteria A-C must pass before and after cleanup.

Manual QA:

- Channel: tmux
- Invocation: `tmux new-session -d -s ulw-qa-lines` with baseline LOC echoes, current pure LOC calculation for `src/cli.ts`, `src/scorecard.ts`, and `src/globals.d.ts`, `bun run ci` redirected to a temporary log, `ci-exit:$code`, temp-log cleanup, capture, and session kill. Full command is recorded in `plans/qa/manual-qa-report.md`.
- PASS observable: before/after pure LOC decreases and `bun run ci` passes.
- Baseline evidence: source LOC baseline recorded before source cleanup.
- Post-cleanup evidence: source LOC is lower in both changed source files.
- Manual artifact: `plans/qa/manual-qa-report.md` plus final CI/LOC gate.
- Cleanup receipt: tmux sessions gone and QA temp targets removed.

## Current Known Baseline

- Source candidates by pure LOC: `src/scorecard.ts` 216, `src/manifest.ts` 204, `src/benchmark.ts` 187, `src/inspect.ts` 151, `src/cli.ts` 145, `test/cli.test.ts` 224.
- No source file currently exceeds 250 pure LOC, but several are in the warning band and can be reduced.
- code-review-graph for the new worktree returned 0 nodes; use repo-local AST/LSP/context-mode and subagent explorer.
- Baseline CI before production edits: PASS. `bun run ci` produced 21 passing tests, 80 assertions, successful build, and successful `bun pm pack --dry-run`.
- Baseline LSP before production edits: PASS. `src` diagnostics scanned 16 `.ts` files with 0 diagnostics.
- Post-cleanup source LOC reduction after reviewer fix and E2E cleanup: `src/cli.ts` 145 -> 142, `src/scorecard.ts` 216 -> 213, `src/globals.d.ts` 43 -> 44. Net source reduction: 5 pure LOC.

## Evidence Log

- Characterization A-C baseline: PASS after correcting the temp-repo release-plan misconception. `bun test test/cli-e2e.test.ts` produced 3 passing tests against unchanged production code.
- Regression found by reviewer: first CLI helper cleanup broke `init` because `printLines` was still referenced. Fixed by inlining `init` output and rerunning tests.
- Final A-D after production cleanup: PASS. `bun run ci` produced 24 passing tests, 94 assertions, successful build, and successful pack dry-run.
- Manual QA A-C: PASS via tmux. Evidence and cleanup receipts recorded in `plans/qa/manual-qa-report.md`.
- Manual QA D: PASS via final CI/LOC/tmux-clean gate.
- LSP diagnostics: PASS on `src/cli.ts`, `src/scorecard.ts`, and `test/cli-e2e.test.ts`.
- Baseline LSP diagnostics: PASS, 0 diagnostics in `src`.
- AST inspection: PASS via repo-local `bunx @ast-grep/cli`. Evidence recorded in `plans/qa/static-gates.md`.
- Reviewer verdicts: first review round returned NOT OKAY on evidence drift and formatter duplication; fixes applied and final review round requested.

## Cleanup Targets

Pending plan-agent output.

## Commits

Pending.
