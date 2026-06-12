# Service Gap Remediation

## TL;DR
> **Summary**: Convert Boulder service-readiness gaps from prose into executable acceptance gates backed by fixture evidence and CLI verification.
> **Deliverables**:
> - `fixtures/service-readiness/gates.json` evidence contract
> - `service-readiness` checks for activation, repeat-run, share-safe, decision-impact, external-replay, and metrics gates
> - RED-to-GREEN tests and tmux QA evidence
> **Effort**: Short
> **Parallel**: NO
> **Critical Path**: Test contract -> evaluator -> fixture/docs -> CLI QA

## Context
### Original Request
The user asked to plan and proceed with remediating the missing pieces from the practical service-readiness review using `omo:ulw-plan`.

### Interview Summary
No new question is required. The repo already defines the target gates in `docs/SERVICE_STRATEGY_REVIEW.md` and `docs/SERVICE_READINESS.md`.

### Metis Review (gaps addressed)
- Gap: Gates are named in docs but not machine-evaluated.
- Gap: Existing `pilot-ready` status can pass without repeat-run, share-safety, or decision-impact evidence.
- Gap: Metrics are defined in docs but not proven from evidence.
- Resolution: Add one structured evidence manifest and fail service-readiness when any required gate is missing or incomplete.

## Work Objectives
### Core Objective
Make Boulder service-readiness practically actionable by requiring evidence for all named service acceptance gates.

### Deliverables
- Test-first gate contract in `test/service-readiness.test.ts`.
- Gate evaluator in `src/service-readiness.ts`.
- Root fixture at `fixtures/service-readiness/gates.json`.
- Updated service docs referencing the executable fixture.
- QA notepad and tmux transcript in `.omo/ulw-loop/evidence/service-gap-remediation/`.

### Definition of Done
- `bun test test/service-readiness.test.ts` shows RED before implementation and GREEN after.
- `bun test` passes.
- `bun bin/boulder.ts service-readiness --json` returns `pilot-ready` with all gate checks passing except `product-readiness`.
- tmux QA transcript captures the real CLI output.

### Must Have
- Keep all six gate IDs stable.
- Missing or incomplete gate evidence must block service readiness.
- No provider launch, hosted service, credentials, or network replay.

### Must NOT Have
- No runtime invocation of GJC or LazyCodex.
- No claim that Boulder is publicly `ready` while product-readiness is blocked.
- No generated metrics claim without evidence file fields.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: TDD with Bun test.
- QA policy: tmux for real CLI surface.
- Evidence: `.omo/ulw-loop/evidence/service-gap-remediation/`.

## Execution Strategy
### Parallel Execution Waves
Wave 1: Add failing tests for complete and missing gate evidence.
Wave 2: Implement evaluator and add root fixture/docs.
Wave 3: Run full verification and tmux QA.

### Dependency Matrix
| Task | Blocks | Blocked By |
| --- | --- | --- |
| 1. Gate Evidence Tests | 2 | none |
| 2. Gate Evaluator and Fixtures | 3 | 1 |
| 3. Verification and QA | none | 2 |

## TODOs
- [x] 1. Gate Evidence Tests

  **What to do**: Add tests proving complete gate evidence passes and missing repeat-run evidence blocks service readiness.
  **Must NOT do**: Do not edit production code before RED is captured.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2 | Blocked By: none

  **References**:
  - Pattern: `test/service-readiness.test.ts` - temp repo fixture and `evaluateServiceReadiness(root)`.
  - Contract: `docs/SERVICE_READINESS.md` - six service acceptance gates.

  **Acceptance Criteria**:
  - [ ] `bun test test/service-readiness.test.ts` fails on the new gate assertions before implementation.

  **QA Scenarios**:
  ```
  Scenario: Missing repeat-run gate blocks readiness
    Tool: tmux
    Steps: run focused test before implementation
    Expected: test fails because repeat-run-gate is not evaluated
    Evidence: .omo/ulw-loop/evidence/service-gap-remediation/red-service-gates.txt
  ```

  **Commit**: NO

- [x] 2. Gate Evaluator and Fixtures

  **What to do**: Add `serviceGatesCheck(root)` reading `fixtures/service-readiness/gates.json`; require six completed gates with evidence paths and required fields.
  **Must NOT do**: Do not broaden scope into hosted dashboards, network replay, or external runtimes.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 3 | Blocked By: 1

  **References**:
  - Pattern: `src/service-readiness.ts` - `contentCheck`, replay, handoff, and support checks.
  - Fixture: `fixtures/service-readiness/gates.json` - new stable contract.

  **Acceptance Criteria**:
  - [ ] Complete fixture yields `service-acceptance-gates: pass`.
  - [ ] Missing or incomplete repeat-run evidence yields `blocked`.
  - [ ] Root CLI remains `pilot-ready` because product-readiness remains blocked.

  **QA Scenarios**:
  ```
  Scenario: Real CLI reports gate pass
    Tool: tmux
    Steps: run `bun bin/boulder.ts service-readiness --json`
    Expected: output includes service-acceptance-gates pass and status pilot-ready
    Evidence: .omo/ulw-loop/evidence/service-gap-remediation/tmux-service-gates.txt
  ```

  **Commit**: NO

- [x] 3. Verification and QA

  **What to do**: Run focused tests, full tests, CLI JSON, and tmux QA; record cleanup.
  **Must NOT do**: Do not leave tmux sessions or local servers running.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: none | Blocked By: 2

  **References**:
  - Command: `bun test test/service-readiness.test.ts`
  - Command: `bun test`
  - Command: `bun bin/boulder.ts service-readiness --json`

  **Acceptance Criteria**:
  - [ ] Focused and full test suites pass.
  - [ ] tmux QA transcript exists.
  - [ ] cleanup receipt confirms no QA tmux session remains.

  **QA Scenarios**:
  ```
  Scenario: Cleanup verified
    Tool: tmux
    Steps: kill QA session and run `tmux ls`
    Expected: no `ulw-qa-service-gates` session remains
    Evidence: .omo/ulw-loop/evidence/service-gap-remediation/cleanup.txt
  ```

  **Commit**: NO

## Final Verification Wave
- [x] F1. Plan Compliance Audit
- [x] F2. Code Quality Review
- [x] F3. Real Manual QA
- [x] F4. Scope Fidelity Check

## Commit Strategy
No commit unless explicitly requested. Suggested message: `feat(service): require readiness gate evidence`

## Success Criteria
- The six service gates are executable, not prose-only.
- Root Boulder remains `pilot-ready`, not falsely `ready`.
- Missing repeat-run evidence blocks service-readiness.
- Tests and tmux QA prove the behavior.
