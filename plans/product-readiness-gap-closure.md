# Product Readiness Gap Closure Plan

## TL;DR
> **Summary**: Close the current high-priority Boulder `product-readiness` blockers while preserving the tighter public-product gate. The plan clears real local/public evidence gaps and avoids falsely claiming npm publication before `boulder-oss-cli` exists in the registry.
> **Deliverables**:
> - duplicate copy artifacts removed or classified out of the tree
> - public CI run evidence captured
> - pre-publish install-smoke evidence captured, with readiness wording adjusted so it does not imply npm publication
> - GitHub issue templates added
> - GJC/LazyCodex handoff fixtures added
> - final audit updated to separate local readiness and public product readiness
> - tests and tmux QA evidence proving `product-readiness` behavior
> **Effort**: Medium
> **Parallel**: YES - 3 waves
> **Critical Path**: T1 duplicate cleanup -> T2 install-smoke policy -> T3 evidence/templates/fixtures -> T4 final audit/docs -> F final verification

## Context

### Original Request

Resolve the high-priority product readiness gaps using `omo:ulw-plan`.

### Interview Summary

No user question is required. Current repo state gives enough information:

- `boulder product-readiness --json` exits `1` and reports `blocked`.
- The blocked checks are explicit and finite.
- The previous product-readiness tightening intentionally made local-only readiness fail until public-product evidence exists.
- npm registry lookup previously returned `404` for `boulder-oss-cli`, so a true published-install smoke cannot honestly pass yet.

### Metis Review (gaps addressed)

Contradictions and risks addressed in this plan:

- **Risk: fake public readiness**. The implementation must not add a text file saying npm publish worked unless npm actually works. Use a `pre-publish-install-smoke` gate or update the existing `published-install-smoke` check to accept clearly labeled tarball smoke only before publish.
- **Risk: destructive duplicate cleanup**. Duplicate `* 2.*` files may contain unique content. Compare each duplicate to the canonical file before deletion; if unique, manually merge only the missing content into the canonical file.
- **Risk: product-readiness becomes loose again**. Do not remove checks to get `ready`; add real evidence or refine names so checks represent truthful pre-publish state.
- **Risk: untracked core files**. `src/product-readiness.ts`, `docs/PRODUCT_READINESS.md`, and `test/product-readiness.test.ts` are untracked; execution must preserve them and include them in the final diff.
- **Risk: public CI evidence staleness**. CI evidence should include run URL, branch, status, timestamp, and command summary.

## Work Objectives

### Core Objective

Move Boulder from `product-readiness: blocked` to an honest readiness state for the current release stage by closing all non-publish public-product blockers and explicitly modeling the remaining npm publish boundary.

### Deliverables

- A clean release tree with no `* 2.*` artifacts.
- `.github/ISSUE_TEMPLATE/bug_report.md`.
- `.github/ISSUE_TEMPLATE/support_request.md`.
- `.github/ISSUE_TEMPLATE/case_study.md`.
- `fixtures/handoffs/low.json`, `fixtures/handoffs/medium.json`, `fixtures/handoffs/high.json`.
- `docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt`.
- `docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt`.
- Updated `docs/CODEX_OSS_FINAL_AUDIT.md` with `Public product readiness`.
- Updated `docs/PRODUCT_READINESS.md`.
- Tests updated or added so the gate distinguishes pre-publish tarball readiness from true published npm readiness.

### Definition of Done

All commands must pass:

```bash
bun test
bun run ci
bun bin/boulder.ts product-readiness --json
```

Expected final state:

- `clean-release-tree` passes.
- `public-ci-run-evidence` passes.
- `public-support-templates` passes.
- `gjc-lazycodex-handoff-fixtures` passes.
- `final-audit` passes.
- install-smoke check passes only if it truthfully represents one of:
  - actual published npm smoke after npm publish, or
  - explicitly named pre-publish tarball smoke if the code is adjusted to model pre-publish readiness.

### Must Have

- TDD for product-readiness behavior.
- Manual QA via tmux for CLI-visible readiness output.
- Evidence files with concrete command transcripts or public URLs.
- No weakening of the `product-readiness` public-product gate.
- No npm/public release claim unless verified against the registry.

### Must NOT Have

- No fake npm publish evidence.
- No deletion of unique duplicate content without comparison.
- No provider SDK calls.
- No credential requirements.
- No hosted-service claim.
- No broad refactor outside product-readiness, docs, templates, and fixtures.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.

- Test decision: TDD with Bun test.
- QA policy: every task has one happy and one failure/edge scenario.
- Evidence root: `.omo/ulw-loop/evidence/product-readiness-gap-closure/`.
- Manual QA channel: tmux, because the real user surface is the CLI.
- Full regression: `bun test`, `bun run ci`, and `boulder product-readiness --json`.

## Execution Strategy

### Parallel Execution Waves

Wave 1: protect truth and clean release tree.

Wave 2: add public evidence, support templates, and handoff fixtures.

Wave 3: update final audit, generated readiness doc, install-smoke semantics, and run final QA.

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
| --- | --- | --- | --- |
| T1 duplicate artifact comparison and cleanup | none | T5, F | none |
| T2 install-smoke semantics test | none | T3, F | T1 |
| T3 install-smoke evidence and code/doc adjustment | T2 | F | T4, T5 |
| T4 public CI evidence | none | F | T3, T5, T6 |
| T5 support templates | none | F | T3, T4, T6 |
| T6 GJC/LazyCodex handoff fixtures | none | F | T3, T4, T5 |
| T7 final audit and readiness docs | T1-T6 | F | none |
| F final verification | T1-T7 | release | none |

## TODOs

- [ ] 1. Duplicate Artifact Comparison and Cleanup

  **What to do**: Compare each duplicate `* 2.*` file against its canonical counterpart. If identical or obsolete, delete the duplicate. If it contains unique useful content, merge that content into the canonical file before deleting the duplicate.

  **Must NOT do**: Do not delete blindly. Do not touch unrelated dirty files.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: T5, F | Blocked By: none

  **References**:
  - `src/product-readiness.ts` - `clean-release-tree` currently fails on ` 2.` filenames.
  - `docs/COMPETITIVE_BENCHMARK_HARNESS_MANAGER.md` and `docs/COMPETITIVE_BENCHMARK_HARNESS_MANAGER 2.md`.
  - `docs/PIPELINE_PLANNING_SURFACE.md` and `docs/PIPELINE_PLANNING_SURFACE 2.md`.
  - `docs/prompts/HARNESS_MANAGER_BENCHMARK_PROMPT.md` and `docs/prompts/HARNESS_MANAGER_BENCHMARK_PROMPT 2.md`.
  - `src/pipeline.ts` and `src/pipeline 2.ts`.

  **Acceptance Criteria**:
  - [ ] `find . -name '* 2.*' -o -name '* 2.ts'` returns no output.
  - [ ] `bun bin/boulder.ts product-readiness --json` no longer reports `clean-release-tree` as fail.
  - [ ] Any unique content discovered in duplicates is either merged or explicitly documented as obsolete in the evidence note.

  **QA Scenarios**:
  ```text
  Scenario: clean tree passes
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-clean-tree 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && find . -name "* 2.*" -o -name "* 2.ts"; bun bin/boulder.ts product-readiness --json'
    Expected: find emits no duplicate artifact paths; JSON has no failing clean-release-tree check
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t1-clean-tree.txt

  Scenario: duplicate fixture fails
    Tool: tmux
    Steps: create a temp fixture with `src/pipeline 2.ts`, run the product-readiness duplicate test
    Expected: test `tight product readiness > blocks duplicate copy artifacts in the release tree` passes
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t1-duplicate-fixture.txt
  ```

  **Commit**: YES | Message: `fix(readiness): remove duplicate release artifacts` | Files: duplicate artifact paths and any canonical files receiving merged content

- [ ] 2. Define Honest Install-Smoke Semantics

  **What to do**: Decide in code and tests whether the current pre-publish stage can pass product readiness. Recommended implementation: rename or split the gate so `pre-publish-install-smoke` can pass with tarball evidence, while `published-install-smoke` remains a post-publish release gate.

  **Must NOT do**: Do not make `published-install-smoke` pass with text that does not prove npm registry install.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: T3, F | Blocked By: none

  **References**:
  - `src/product-readiness.ts` - currently requires `docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt` to contain `bunx boulder-oss-cli --help`.
  - `test/product-readiness.test.ts` - existing tight readiness fixture.
  - `package.json` - package name `boulder-oss-cli`.

  **Acceptance Criteria**:
  - [ ] A RED test proves that fake npm publish text does not pass.
  - [ ] A GREEN test proves pre-publish tarball smoke can pass only when explicitly labeled as tarball/pre-publish.
  - [ ] If npm is published, an additional test or evidence path proves `bunx boulder-oss-cli --help`.

  **QA Scenarios**:
  ```text
  Scenario: pre-publish tarball smoke accepted
    Tool: tmux
    Steps: run `bun test test/product-readiness.test.ts -t "rates a public evidence fixture as ready"` after fixture uses tarball smoke wording
    Expected: test passes
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t2-prepublish-smoke-test.txt

  Scenario: fake publish text rejected
    Tool: tmux
    Steps: run the test that writes `manual publish pending` into install-smoke evidence
    Expected: readiness stays blocked
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t2-fake-publish-rejected.txt
  ```

  **Commit**: YES | Message: `fix(readiness): distinguish prepublish install evidence` | Files: `src/product-readiness.ts`, `test/product-readiness.test.ts`

- [ ] 3. Capture Install-Smoke Evidence

  **What to do**: Run a real temp-directory install smoke. Before npm publish, use generated package tarball or local package path and label it as pre-publish. After npm publish, use `bunx boulder-oss-cli --help` from an empty temp directory and label it as published.

  **Must NOT do**: Do not write install-smoke evidence manually without running the command.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: F | Blocked By: T2

  **References**:
  - `docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt` - new evidence file.
  - `package.json` - bin aliases `boulder` and `boulder-oss-cli`.

  **Acceptance Criteria**:
  - [ ] Evidence file contains exact command, working directory, package source, exit code, and help output.
  - [ ] `bun bin/boulder.ts product-readiness --json` no longer fails the install-smoke stage selected by T2.

  **QA Scenarios**:
  ```text
  Scenario: install smoke succeeds
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-install-smoke 'tmpdir=$(mktemp -d); cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun pm pack --dry-run --ignore-scripts; cd "$tmpdir"; bunx <tarball-or-package-path> --help'
    Expected: output includes `boulder` usage and exits 0
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t3-install-smoke.txt

  Scenario: missing install smoke blocks readiness
    Tool: tmux
    Steps: run `bun test test/product-readiness.test.ts -t "blocks when published install smoke evidence is missing"`
    Expected: test passes
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t3-install-smoke-missing.txt
  ```

  **Commit**: YES | Message: `docs(readiness): add install smoke evidence` | Files: `docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt`

- [ ] 4. Capture Public CI Run Evidence

  **What to do**: Add `docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt` with the latest public successful run URL, branch, status, timestamp, workflow name, and command summary.

  **Must NOT do**: Do not claim a CI run for a commit that does not include the relevant final changes. If no final post-change public run exists yet, mark it as latest baseline CI and leave final release readiness blocked until the PR CI passes.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: F | Blocked By: none

  **References**:
  - `.github/workflows/ci.yml` - workflow command is `bun run ci`.
  - Previous observed public run: `27290627860`, workflow `CI`, branch `main`, status success, timestamp `2026-06-10T16:33:25Z`.
  - `src/product-readiness.ts` - requires URL containing `https://github.com/min9lin9/boulder/actions/runs/`, `CI`, and `success`.

  **Acceptance Criteria**:
  - [ ] Evidence file exists and contains a GitHub Actions run URL.
  - [ ] Evidence file contains `CI` and `success`.
  - [ ] `product-readiness` no longer fails `public-ci-run-evidence`.

  **QA Scenarios**:
  ```text
  Scenario: CI evidence passes
    Tool: tmux
    Steps: run `bun bin/boulder.ts product-readiness --json`
    Expected: `public-ci-run-evidence` status is `pass`
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t4-ci-evidence-pass.txt

  Scenario: missing CI evidence fails
    Tool: tmux
    Steps: temp fixture without `github-actions.txt`, run readiness test or CLI against fixture
    Expected: `public-ci-run-evidence` status is `fail`
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t4-ci-evidence-missing.txt
  ```

  **Commit**: YES | Message: `docs(readiness): add public ci evidence` | Files: `docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt`

- [ ] 5. Add Public Support Templates

  **What to do**: Add GitHub issue templates for bug report, support request, and case-study contribution. Keep them short, actionable, and aligned with `docs/TRUST_SUPPORT_SECURITY.md`.

  **Must NOT do**: Do not request secrets, tokens, private logs, or credentials in templates.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: F | Blocked By: none

  **References**:
  - `docs/TRUST_SUPPORT_SECURITY.md` - support/security language.
  - `SECURITY.md` - security policy.
  - `src/product-readiness.ts` - requires `.github/ISSUE_TEMPLATE/bug_report.md`, `support_request.md`, `case_study.md`.

  **Acceptance Criteria**:
  - [ ] Three template files exist.
  - [ ] Templates ask for command, expected behavior, actual behavior, environment, and evidence path when relevant.
  - [ ] Templates tell users not to paste secrets.
  - [ ] `product-readiness` no longer fails `public-support-templates`.

  **QA Scenarios**:
  ```text
  Scenario: support templates pass
    Tool: tmux
    Steps: run `bun bin/boulder.ts product-readiness --json`
    Expected: `public-support-templates` status is `pass`
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t5-templates-pass.txt

  Scenario: support template missing fails
    Tool: tmux
    Steps: run product-readiness fixture test with one template omitted
    Expected: readiness is blocked
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t5-template-missing.txt
  ```

  **Commit**: YES | Message: `docs(support): add public issue templates` | Files: `.github/ISSUE_TEMPLATE/*.md`

- [ ] 6. Add GJC/LazyCodex Handoff Fixtures

  **What to do**: Add low, medium, and high friction handoff fixtures under `fixtures/handoffs/`. Each fixture must include a GJC plan section, LazyCodex result section, acceptance criteria, QA evidence path, and unresolved risks field.

  **Must NOT do**: Do not add runtime launcher configuration or credentials. Fixtures are schema/examples only.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: F | Blocked By: none

  **References**:
  - `docs/GJC_LAZYCODEX_HANDOFF.md` - role boundaries.
  - `src/product-readiness.ts` - requires three fixture files.
  - `docs/CASE_STUDIES/evidence/core-implementation/gjc-plan.md`.
  - `docs/CASE_STUDIES/evidence/core-implementation/lazycodex-implementation-summary.md`.

  **Acceptance Criteria**:
  - [ ] `fixtures/handoffs/low.json`, `medium.json`, and `high.json` exist.
  - [ ] Each fixture is valid JSON.
  - [ ] Each fixture contains `gjcPlan`, `lazycodexResult`, and `acceptanceCriteria`.
  - [ ] `product-readiness` no longer fails `gjc-lazycodex-handoff-fixtures`.

  **QA Scenarios**:
  ```text
  Scenario: handoff fixtures pass
    Tool: tmux
    Steps: run `bun bin/boulder.ts product-readiness --json`
    Expected: `gjc-lazycodex-handoff-fixtures` status is `pass`
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t6-handoffs-pass.txt

  Scenario: invalid fixture fails schema test
    Tool: tmux
    Steps: run a new test that parses fixture JSON and asserts required keys; mutate temp fixture to omit `lazycodexResult`
    Expected: test fails before implementation, then passes after validation is added
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t6-handoffs-invalid.txt
  ```

  **Commit**: YES | Message: `docs(handoff): add gjc lazycodex fixtures` | Files: `fixtures/handoffs/*.json`, optional validation tests

- [ ] 7. Update Final Audit and Generated Readiness Doc

  **What to do**: Update `docs/CODEX_OSS_FINAL_AUDIT.md` to include `Public product readiness` and separate local application readiness from public product readiness. Regenerate or manually update `docs/PRODUCT_READINESS.md` from current CLI output after all gates are green or honestly pre-publish-ready.

  **Must NOT do**: Do not restore a blanket `9.56 / 10` public claim unless public install/release evidence actually exists.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: F | Blocked By: T1-T6

  **References**:
  - `docs/CODEX_OSS_FINAL_AUDIT.md` - currently missing `Public product readiness`.
  - `docs/PRODUCT_READINESS.md` - should match `boulder product-readiness` output.
  - `plans/boulder-9-5-repeatable-oss-product.md` - separates local and public readiness.

  **Acceptance Criteria**:
  - [ ] Final audit contains `Public product readiness`.
  - [ ] Final audit states local readiness and public product readiness separately.
  - [ ] Product readiness doc matches CLI output.
  - [ ] No unsupported acceptance/adoption/runtime-scale claim appears.

  **QA Scenarios**:
  ```text
  Scenario: final audit passes readiness gate
    Tool: tmux
    Steps: run `bun bin/boulder.ts product-readiness --json`
    Expected: `final-audit` status is `pass`
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t7-final-audit-pass.txt

  Scenario: unsupported public claim blocked by review
    Tool: tmux
    Steps: run `rg -n "OpenAI accepted|runtime scale proven|external adoption proven|hosted service available" docs/CODEX_OSS_FINAL_AUDIT.md docs/CODEX_OSS_APPLICATION_PACKET.md`
    Expected: no matches
    Evidence: .omo/ulw-loop/evidence/product-readiness-gap-closure/t7-unsupported-claims.txt
  ```

  **Commit**: YES | Message: `docs(readiness): separate public product readiness` | Files: `docs/CODEX_OSS_FINAL_AUDIT.md`, `docs/PRODUCT_READINESS.md`

## Final Verification Wave
> ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. Plan Compliance Audit
  - Confirm every task above has code/doc/test/evidence coverage or a stated non-implementation reason.

- [ ] F2. Code Quality Review
  - Run `bun test`.
  - Run `bun run ci`.
  - Run any new fixture schema tests.

- [ ] F3. Real Manual QA
  - Use tmux for:
    - `bun bin/boulder.ts product-readiness --json`
    - `bun bin/boulder.ts product-readiness`
    - install-smoke command from a temp directory
  - Capture artifacts under `.omo/ulw-loop/evidence/product-readiness-gap-closure/`.
  - Kill every tmux session and record cleanup receipts.

- [ ] F4. Scope Fidelity Check
  - Run `git diff --stat`.
  - Confirm no source files outside `src/product-readiness.ts` and tests changed unless justified.
  - Confirm no npm publish, GitHub release, hosted-service, provider SDK, or credential work occurred.

## Commit Strategy

Preferred commits:

1. `fix(readiness): remove duplicate release artifacts`
2. `fix(readiness): distinguish prepublish install evidence`
3. `docs(readiness): add public ci and install evidence`
4. `docs(support): add public issue templates`
5. `docs(handoff): add gjc lazycodex fixtures`
6. `docs(readiness): separate public product readiness`

Do not auto-commit unless the operator explicitly approves committing.

## Success Criteria

- `bun test` passes.
- `bun run ci` passes.
- `bun bin/boulder.ts product-readiness --json` returns the expected stage status:
  - `ready` if pre-publish tarball readiness is accepted by the updated gate.
  - `blocked` only on the explicit post-publish npm boundary if the gate requires actual registry publication.
- No `* 2.*` duplicate artifact remains.
- Support templates exist.
- Handoff fixtures exist and are valid JSON.
- Final audit separates local readiness from public product readiness.
- All tmux QA evidence and cleanup receipts are recorded.
