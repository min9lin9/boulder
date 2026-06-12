# Boulder Product / Service Readiness Plan

## TL;DR
> **Summary**: Boulder is usable as a local CLI pilot, but not yet a repeatable product/service. The next readiness target is an npm-distributed public OSS CLI product; hosted service work waits until release hygiene, M9 evidence, and case-study repeatability are proven.
> **Deliverables**:
> - release-clean CLI package
> - M9 export/release evidence integration
> - repeatable case-study harness workflow
> - product readiness scorecard
> - external OSS usage decision that filters reference material from core dependencies
> - GJC planning to LazyCodex implementation handoff structure
> - M10-M14 execution roadmap
> **Effort**: Large
> **Parallel**: YES - 5 waves
> **Critical Path**: T1 release hygiene -> T2 release status gate -> T3/T4/T5 M9 evidence integration -> T6 M9 reconciliation -> T7 case-study workflow -> T9 case-study evidence -> T10 readiness gate -> T14 GJC/LazyCodex handoff decision -> T15 roadmap -> T16 release packet

## Context

### Original Request

Plan and review Boulder until it reaches a repeatably usable service/product level using `omo:ulw-plan`.

### Interview Summary

No additional user question is required. The repo already shows the necessary product direction:

- Boulder is `boulder-oss-cli`, a Bun + TypeScript CLI operator kit.
- The current commands cover initialization, inspection, validation, verification, pipeline planning, scorecard, benchmark fixtures, release planning, and export.
- Current automated tests and CI pass.
- Current release surface is not clean enough: duplicate untracked files are present and `bun run ci` packs `src/pipeline 2.ts`.
- CLI reported version is stale relative to `package.json`.
- M9 pipeline evidence integration is planned but not implemented.

Default product target:

> A repeatably usable local CLI product for OSS maintainers and Codex-heavy operators, where Boulder classifies work and records evidence, GJC turns ambiguous work into an approved plan, and LazyCodex implements from that plan before any hosted or semi-hosted service wrapper is attempted.

### Metis Review (gaps addressed)

Metis found 27 gaps. The plan applies these decisions:

- Version authority: `package.json` is the single source of truth.
- Release state: `0.1.7` is held until release hygiene and M9 evidence complete.
- Product tier: target is npm-distributed public OSS CLI product, not hosted service.
- Execution structure: GJC is the planning/review lane for deep-interview, ralplan, and ultragoal goal decomposition; LazyCodex is the Codex-native implementation lane that executes the approved GJC plan.
- Boulder remains the operator harness and evidence gate; it must not become either LazyCodex or GJC.
- External OSS usage: GJC and LazyCodex are the only near-term active handoff lanes; harness-manager, VoltAgent/awesome-codex-subagents, superpowers, gstack, compound, and har-maker remain reference/workflow material unless later evidence justifies a narrower adoption.
- M9 export: default `medium` plan is exported; full high-friction `cso-qa` remains visible through `boulder pipeline --friction high`.
- ULW criteria: M9 execution may use three criteria if JSON regression and static scope gate are combined in one criterion; the plan must say so explicitly.
- Release readiness: `release-plan` must not report usable release readiness while M9/product blockers remain unresolved.
- Additional required gates: package contents audit, clean-tree rule, rollback notes, support/security readiness, concurrent write policy, README/release evidence consistency.

## Work Objectives

### Core Objective

Move Boulder from a strong CLI proof-of-concept to a repeatably usable npm-distributed OSS CLI product that can support real maintainer runs and later service packaging.

### Deliverables

- Clean release package with no duplicate artifacts.
- Version consistency between package metadata and CLI output.
- M9 export/release evidence integration.
- Repeatable case-study workflow for at least three representative OSS repo shapes.
- Product readiness scorecard that distinguishes POC, pilot, product, and service levels.
- OSS usage decision that separates core, handoff, reference, and rejected runtime scope.
- GJC planning to LazyCodex implementation decision and handoff contract.
- Release status reconciliation across README, changelog, CLI version, tag policy, GitHub release state, and npm publish decision.
- Support/security readiness notes for issue intake, vulnerability handling, and maintainer response expectations.
- Concurrent write policy for commands that generate docs.
- Handoff decision record that defines GJC planning output, LazyCodex implementation input, and Boulder evidence gates before any outer product wrapper.
- Updated roadmap from M9 through M14.

### Definition of Done

All verification must be agent-executed.

- `bun test` passes.
- `bun run ci` passes.
- `bun bin/boulder.ts --version` matches `package.json` version.
- `bun pm pack --dry-run --ignore-scripts` output excludes duplicate `* 2` files.
- README, changelog, CLI, package metadata, release plan, and release packet agree on whether `0.1.7` is held, tagged, or published.
- `release-plan` and/or product readiness gate blocks release while M9 criteria are pending.
- OSS usage decision rejects unnecessary runtime, subagent-catalog, and adapter-manager expansion before M9-M12 evidence is complete.
- M9 ULW evidence files exist and prove export/release/pipeline/static-gate behavior.
- Case-study runs produce committed or reviewed evidence artifacts for three repo shapes.
- Product readiness scorecard rates Boulder at least `pilot-ready`.
- Handoff decision record names GJC/LazyCodex routing and explicitly defers outer wrappers for now.

### Must Have

- Evidence-first workflow.
- No overclaiming benchmark/runtime scale.
- Deterministic local CLI behavior.
- Clean release packaging.
- Human-readable Korean and English operator explanation path.
- Real manual QA via tmux for CLI-facing behavior.
- Clean tree before release.
- Package contents audit before release.
- Rollback note for bad tag/npm release.
- Support/security expectations for a public OSS product.

### Must NOT Have

- No hosted service before release hygiene and case-study repeatability.
- No mandatory LazyCodex or GJC dependency for core Boulder commands.
- No executor runtime launch inside core validation, scorecard, release-plan, or product-readiness commands.
- No provider SDK calls.
- No credential handling.
- No runtime agent launcher.
- No package installation side effects.
- No benchmark leaderboard claims.
- No accidental inclusion of duplicate files in package output.
- No full external subagent catalog, runtime manager, or OSS workflow stack vendored into core Boulder.

## Verification Strategy

> ZERO HUMAN INTERVENTION - all verification is agent-executed.

- Test decision: TDD for production changes; characterization tests first for refactors.
- Framework: Bun test.
- QA policy: Every task has tmux scenarios for CLI behavior.
- Evidence root: `.omo/ulw-loop/evidence/`.
- Manual QA channel: tmux for CLI/package/release workflows.
- Final audit: reviewer or Momus plan review before execution if available.

## Execution Strategy

### Parallel Execution Waves

Wave 1: Release hygiene and current package truth.

Wave 2: M9 evidence integration.

Wave 3: Product readiness scorecard and case-study workflow.

Wave 4: Product gate, support/security, write policy, operator docs, service-wrapper decision, and roadmap update.

Wave 5: Final verification, product review, and release packet.

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
| --- | --- | --- | --- |
| T1 Release hygiene gate | none | T2, T3, T10, T16 | none |
| T2 Release status reconciliation | T1 | T3, T10, T16 | none |
| T3 M9 export evidence | T1, T2 | T6, T16 | T4 after T2 |
| T4 M9 release-plan evidence | T1, T2 | T6, T16 | T3 after T2 |
| T5 Pipeline JSON/static regression | T1 | T16 | T3, T4 |
| T6 M9 plan/ULW reconciliation | T3, T4, T5 | T7, T10, T15 | none |
| T7 Case-study workflow | T6 | T9, T10 | T8 |
| T8 Product readiness scorecard | T1, T2 | T10 | T7 |
| T9 Case-study fixtures/runs | T7 | T10, T16 | none |
| T10 Product readiness gate | T6, T8, T9 | T14, T16 | none |
| T11 Support/security readiness | T2 | T16 | T12 |
| T12 Concurrent write policy | T2 | T16 | T11 |
| T13 Korean/English operator docs | T7 | T16 | T11, T12 |
| T14 GJC planning to LazyCodex implementation decision record | T10 | T15, T16 | none |
| T15 Roadmap M10-M14 update | T10, T14 | T16 | none |
| T16 Final release packet | T1-T15 | release | none |

## Executor Architecture

Boulder should use GJC and LazyCodex as a staged handoff, not as two interchangeable executors.

| Layer | Owner | Responsibility | Boundary |
| --- | --- | --- | --- |
| Operator harness | Boulder | repo inspection, friction classification, evidence requirements, release/product readiness gates, handoff packet | does not execute provider/runtime work by default |
| Planning/review lane | GJC | deep-interview, ralplan, ultragoal goal decomposition, acceptance criteria, evidence plan | produces an approved plan; does not own default implementation |
| Codex-native implementation lane | LazyCodex | source edits, tests, PR-sized implementation, Codex worktree execution from the GJC-approved plan | returns diff, tests, manual QA evidence, unresolved risks; does not silently rewrite the plan |
| Product gate | Boulder | normalize GJC plan evidence and LazyCodex implementation evidence into release/product readiness | blocks readiness if plan, implementation, or evidence is missing or untrusted |

Default routing:

- Low friction: Boulder classification -> GJC lightweight plan/acceptance checklist -> LazyCodex implementation -> Boulder verification gate.
- Medium friction: Boulder pipeline -> GJC deep-interview or ralplan -> LazyCodex implementation + Boulder evidence export -> product readiness gate.
- High friction: Boulder pipeline -> GJC deep-interview + ralplan + ultragoal goals with CSO/QA criteria -> LazyCodex implementation waves -> optional GJC review/QA tracking -> Boulder final readiness gate.

GJC adapter command shape:

```bash
gjc --tmux --worktree <planning-worktree>
# run deep-interview and ralplan inside GJC for ambiguous or high-friction work
gjc ultragoal create-goals --brief-file <approved-plan>
# optional: use ultragoal completion only for GJC-owned review/QA tracking, not default implementation
```

LazyCodex adapter shape:

```text
handoff: GJC-approved plan + files in scope + TDD requirements + tmux evidence paths + release/product gate expectations
return: changed files + RED/GREEN test evidence + manual QA transcript + unresolved risks
```

## TODOs

- [ ] 1. Release Hygiene Gate

  **What to do**:
  - Remove or intentionally classify duplicate untracked files before release.
  - Fix CLI version source so `boulder --version` matches `package.json`.
  - Add a packaging regression test or script assertion that rejects `* 2.*` files in package output.

  **Must NOT do**:
  - Do not delete files without first confirming whether the divergent benchmark duplicate contains unique content.
  - Do not change public CLI commands beyond version correctness.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: T2, T8, T12 | Blocked By: none

  **References**:
  - `package.json` - package version and `files` allowlist.
  - `src/cli.ts` - current hard-coded `VERSION`.
  - Dirty tree evidence: duplicate `src/pipeline 2.ts` is currently included in pack output.

  **Acceptance Criteria**:
  - [ ] `bun bin/boulder.ts --version` equals `node -p "require('./package.json').version"`.
  - [ ] `bun pm pack --dry-run --ignore-scripts` does not list `src/pipeline 2.ts` or any `* 2.md`.
  - [ ] `git status --short` contains only intentional planning or implementation files.

  **QA Scenarios**:
  ```text
  Scenario: Version truth
    Tool: tmux
    Steps: run `bun bin/boulder.ts --version`; run `node -p "require('./package.json').version"`
    Expected: outputs match exactly
    Evidence: .omo/ulw-loop/evidence/product-t1-version.txt

  Scenario: Package artifact cleanliness
    Tool: tmux
    Steps: run `bun pm pack --dry-run --ignore-scripts`; search output for ` 2.`
    Expected: no duplicate `* 2` files appear
    Evidence: .omo/ulw-loop/evidence/product-t1-pack-clean.txt
  ```

  **Commit**: YES | Message: `fix(release): align package version and artifact hygiene` | Files: `src/cli.ts`, package/test files as needed

- [ ] 2. Release Status Reconciliation

  **What to do**:
  - Decide and encode release state: `0.1.7` is held until release hygiene and M9 evidence complete.
  - Make README, changelog, release plan, application evidence, package version, and CLI version agree.
  - Add test or static check for README public evidence version drift if practical.
  - Define tag/npm/GitHub release decision and rollback note.

  **Must NOT do**:
  - Do not publish or tag automatically.
  - Do not mark `0.1.7` as released unless release evidence is complete.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: T3, T10, T15 | Blocked By: T1

  **References**:
  - `README.md` status and public evidence sections.
  - `CHANGELOG.md`
  - `docs/RELEASE_PLAN.md`
  - `docs/APPLICATION_EVIDENCE.md`
  - `package.json`
  - `src/cli.ts`

  **Acceptance Criteria**:
  - [ ] All release-facing docs agree whether `0.1.7` is held or released.
  - [ ] Rollback note exists for bad tag/npm release.
  - [ ] Release packet cannot claim release-ready while M9 is pending.

  **QA Scenarios**:
  ```text
  Scenario: Release version consistency
    Tool: tmux
    Steps: run `rg -n "0\\.1\\.[0-9]|v0\\.1\\.[0-9]" README.md CHANGELOG.md docs/RELEASE_PLAN.md docs/APPLICATION_EVIDENCE.md package.json src/cli.ts`
    Expected: every version reference is intentional and consistent with held/released status
    Evidence: .omo/ulw-loop/evidence/product-t2-release-version-consistency.txt

  Scenario: Release hold is explicit
    Tool: tmux
    Steps: inspect release packet or release plan after implementation
    Expected: release is blocked/held until M9 and hygiene evidence pass
    Evidence: .omo/ulw-loop/evidence/product-t2-release-hold.txt
  ```

  **Commit**: YES | Message: `docs(release): reconcile release status` | Files: release-facing docs, tests if added

- [ ] 3. M9 Export Pipeline Evidence

  **What to do**:
  - Execute the existing M9 plan's export half.
  - Add `Operator Pipeline` section to `docs/BOULDER_EXPORT.md` through `src/export.ts` and `src/templates/export.ts`.
  - Use built-in medium pipeline plan.

  **Must NOT do**:
  - Do not add new CLI flags.
  - Do not change `PipelinePlan` field names.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: T6, T15 | Blocked By: T1, T2

  **References**:
  - `plans/m9-pipeline-evidence-integration.md` Task 1 and Task 2.
  - `src/export.ts` existing export orchestration.
  - `src/templates/export.ts` existing export markdown template.
  - `src/pipeline.ts` existing `buildPipelinePlan`.

  **Acceptance Criteria**:
  - [ ] Exported `docs/BOULDER_EXPORT.md` contains `## Operator Pipeline`.
  - [ ] Export includes `friction: medium`, medium stage ids, `fail-closed: true`, and forbidden side-effect labels.
  - [ ] Export docs do not imply `cso-qa` is included in the default medium export plan.

  **QA Scenarios**:
  ```text
  Scenario: Export includes pipeline handoff
    Tool: tmux
    Steps: create temp repo; run `bun bin/boulder.ts init --cwd <tmp>`; run `bun bin/boulder.ts export --cwd <tmp> --force`; print `docs/BOULDER_EXPORT.md`
    Expected: pipeline section contains medium plan and fail-closed boundary
    Evidence: .omo/ulw-loop/evidence/product-t2-export-pipeline.txt

  Scenario: Existing export output remains stable
    Tool: tmux
    Steps: run existing init-to-export e2e command via `bun test test/cli-e2e.test.ts`
    Expected: existing export completion text still appears
    Evidence: .omo/ulw-loop/evidence/product-t2-export-regression.txt
  ```

  **Commit**: YES | Message: `feat(export): include operator pipeline evidence` | Files: `src/export.ts`, `src/templates/export.ts`, `test/cli.test.ts`, `test/cli-e2e.test.ts`

- [ ] 4. M9 Release-Plan Pipeline Evidence

  **What to do**:
  - Execute the existing M9 plan's release-plan half.
  - Add `pipeline-planning-evidence` check to `evaluateReleasePlan`.
  - The check passes only when `docs/PIPELINE_PLANNING_SURFACE.md` exists and the built-in medium plan validates.

  **Must NOT do**:
  - Do not change release scoring into benchmark scoring.
  - Do not mark publishing as automated.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: T6, T15 | Blocked By: T1, T2

  **References**:
  - `plans/m9-pipeline-evidence-integration.md` Task 3 and Task 4.
  - `src/release-plan.ts` existing release checks.
  - `src/pipeline.ts` validation helpers.

  **Acceptance Criteria**:
  - [ ] `release-plan --json` includes `pipeline-planning-evidence`.
  - [ ] Root release plan remains `ready`.
  - [ ] Evidence text says `docs/PIPELINE_PLANNING_SURFACE.md exists and medium pipeline plan validates`.
  - [ ] If product blockers are modeled separately, release-plan remains package-release focused and product readiness gate owns service/product blockers.

  **QA Scenarios**:
  ```text
  Scenario: Release plan includes pipeline check
    Tool: tmux
    Steps: run `bun bin/boulder.ts release-plan --cwd . --json`
    Expected: JSON includes check id `pipeline-planning-evidence` with status `pass`
    Evidence: .omo/ulw-loop/evidence/product-t3-release-plan-pipeline.txt

  Scenario: Missing pipeline doc blocks the check
    Tool: tmux
    Steps: copy repo to temp dir; remove `docs/PIPELINE_PLANNING_SURFACE.md`; run `release-plan --json`
    Expected: `pipeline-planning-evidence` status is `fail`
    Evidence: .omo/ulw-loop/evidence/product-t3-release-plan-missing-doc.txt
  ```

  **Commit**: YES | Message: `feat(release): require pipeline planning evidence` | Files: `src/release-plan.ts`, `test/cli.test.ts`

- [ ] 5. Pipeline Contract Regression Gate

  **What to do**:
  - Add explicit tests that M9 does not mutate `PipelinePlan` JSON shape.
  - Add scoped static gate for provider/runtime/package/credential side effects.

  **Must NOT do**:
  - Do not loosen forbidden-side-effect validation.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: T6, T15 | Blocked By: T1

  **References**:
  - `test/cli-e2e.test.ts` high friction JSON test.
  - `docs/PIPELINE_PLANNING_SURFACE.md` static gate wording.

  **Acceptance Criteria**:
  - [ ] High friction JSON top-level keys remain stable.
  - [ ] Stage ids remain `classification`, `deep-interview`, `pm-debate`, `synthesizer`, `cso-qa`.
  - [ ] Static gate has no new disallowed hits.

  **QA Scenarios**:
  ```text
  Scenario: JSON contract remains stable
    Tool: tmux
    Steps: run `bun bin/boulder.ts pipeline --friction high --json`; inspect top-level keys and stage ids
    Expected: exact expected keys and stage ids
    Evidence: .omo/ulw-loop/evidence/product-t4-pipeline-json.txt

  Scenario: Side-effect static gate
    Tool: tmux
    Steps: run scoped `rg -n "credential|package install|spawn|exec|openai|anthropic|provider" src/export.ts src/templates/export.ts src/release-plan.ts test/cli.test.ts test/cli-e2e.test.ts docs/PIPELINE_PLANNING_SURFACE.md`
    Expected: only allowed policy/fixture/test-helper hits
    Evidence: .omo/ulw-loop/evidence/product-t4-static-gate.txt
  ```

  **Commit**: YES | Message: `test(pipeline): guard product contract boundaries` | Files: `test/cli-e2e.test.ts`, `docs/PIPELINE_PLANNING_SURFACE.md`

- [ ] 6. M9 Plan / ULW Reconciliation

  **What to do**:
  - Resolve M9 plan contradictions before execution.
  - State explicitly that default export uses medium plan and high-friction `cso-qa` is verified via `boulder pipeline --friction high`.
  - Reconcile criteria count: either split JSON/static into four ULW criteria or update M9 plan to say the clean session uses three criteria with C003 combining JSON regression and static gate.

  **Must NOT do**:
  - Do not leave multiple contradictory ULW sessions as execution truth.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T7, T10, T15 | Blocked By: T3, T4, T5

  **References**:
  - `plans/m9-pipeline-evidence-integration.md`
  - `.omo/ulw-loop/m9-pipeline-evidence-integration/goals.json`

  **Acceptance Criteria**:
  - [ ] M9 plan and ULW goals agree on criteria count and evidence paths.
  - [ ] M9 plan no longer implies default medium export contains `cso-qa`.

  **QA Scenarios**:
  ```text
  Scenario: M9 plan and ULW criteria agree
    Tool: tmux
    Steps: inspect `plans/m9-pipeline-evidence-integration.md` and `.omo/ulw-loop/m9-pipeline-evidence-integration/goals.json`
    Expected: same criteria count or explicit documented combination
    Evidence: .omo/ulw-loop/evidence/product-t6-m9-ulw-alignment.txt

  Scenario: Medium export scope is explicit
    Tool: tmux
    Steps: search M9 plan for `cso-qa` and `medium`
    Expected: text says high-friction cso-qa is CLI-verifiable, not default export content
    Evidence: .omo/ulw-loop/evidence/product-t6-medium-scope.txt
  ```

  **Commit**: YES | Message: `docs(plan): reconcile m9 evidence criteria` | Files: `plans/m9-pipeline-evidence-integration.md`, `.omo/ulw-loop/m9-pipeline-evidence-integration/goals.json` only through ULW CLI if modified

- [ ] 7. Repeatable Case-Study Workflow

  **What to do**:
  - Define a repo-local case-study workflow that runs Boulder against three repo shapes.
  - Use existing example harnesses first, then optionally external public OSS repos later.
  - Produce a stable case-study report format.
  - The initial local workflow command set is:
    - `bun bin/boulder.ts inspect --cwd examples/<name> --json`
    - `bun bin/boulder.ts validate --cwd examples/<name>`
    - `bun bin/boulder.ts verify --cwd examples/<name> --dry-run`
    - `bun bin/boulder.ts scorecard --cwd examples/<name> --json`
    - `bun bin/boulder.ts pipeline --cwd examples/<name> --friction medium --json`
    - temp-copy export: `cp -R examples/<name> <tmp>/<name>` then `bun bin/boulder.ts export --cwd <tmp>/<name> --force`

  **Must NOT do**:
  - Do not claim general benchmark leadership from three case studies.
  - Do not require network to pass local CI.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: T9, T10 | Blocked By: T6

  **References**:
  - `examples/typescript-library`
  - `examples/python-package`
  - `examples/mcp-server`
  - `docs/BENCHMARK_FIXTURE_REPORT.md`

  **Acceptance Criteria**:
  - [ ] Case-study report documents input repo, commands run, generated files, pass/fail, and unresolved risks.
  - [ ] Each example has a repeatable command transcript.

  **QA Scenarios**:
  ```text
  Scenario: TypeScript example case study
    Tool: tmux
    Steps: run `bun bin/boulder.ts inspect --cwd examples/typescript-library --json`; run `bun bin/boulder.ts validate --cwd examples/typescript-library`; run `bun bin/boulder.ts verify --cwd examples/typescript-library --dry-run`; run `bun bin/boulder.ts scorecard --cwd examples/typescript-library --json`; run `bun bin/boulder.ts pipeline --cwd examples/typescript-library --friction medium --json`; copy `examples/typescript-library` to a temp dir and run `bun bin/boulder.ts export --cwd <tmp>/typescript-library --force`
    Expected: all commands exit 0 and the report captures generated harness files and verification status
    Evidence: .omo/ulw-loop/evidence/product-t5-typescript-case.txt

  Scenario: MCP example case study
    Tool: tmux
    Steps: run `bun bin/boulder.ts inspect --cwd examples/mcp-server --json`; run `bun bin/boulder.ts validate --cwd examples/mcp-server`; run `bun bin/boulder.ts verify --cwd examples/mcp-server --dry-run`; run `bun bin/boulder.ts scorecard --cwd examples/mcp-server --json`; run `bun bin/boulder.ts pipeline --cwd examples/mcp-server --friction medium --json`; copy `examples/mcp-server` to a temp dir and run `bun bin/boulder.ts export --cwd <tmp>/mcp-server --force`
    Expected: all commands exit 0 and the report captures generated harness files and verification status
    Evidence: .omo/ulw-loop/evidence/product-t5-mcp-case.txt
  ```

  **Commit**: YES | Message: `docs(cases): add repeatable case-study workflow` | Files: `docs/CASE_STUDY_WORKFLOW.md`, case-study report files

- [ ] 8. Product Readiness Scorecard

  **What to do**:
  - Add a product-level readiness model distinct from harness quality score.
  - Add CLI command: `boulder product-readiness [--cwd path] [--json]`.
  - Rate stages: `poc`, `pilot-ready`, `product-ready`, `service-ready`.
  - Criteria must include release hygiene, evidence integration, case studies, docs, feedback loop, and GJC-to-LazyCodex handoff decision.

  **Must NOT do**:
  - Do not inflate current status to product-ready before case studies pass.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: T10 | Blocked By: T1, T2

  **References**:
  - `src/scorecard.ts` for existing scorecard style.
  - `docs/HARNESS_QUALITY_SCORECARD.md` for generated report style.
  - `docs/APPLICATION_EVIDENCE.md` for public evidence categories.

  **Acceptance Criteria**:
  - [ ] `bun bin/boulder.ts product-readiness --cwd . --json` exists and returns a JSON readiness report.
  - [ ] Current repo rates no higher than `pilot-ready` until M9 and case studies are complete.
  - [ ] Scorecard explains blockers in plain language.

  **QA Scenarios**:
  ```text
  Scenario: Current product readiness report
    Tool: tmux
    Steps: run `bun bin/boulder.ts product-readiness --cwd . --json`
    Expected: report includes stage, criteria, blockers, next actions
    Evidence: .omo/ulw-loop/evidence/product-t6-readiness-report.txt

  Scenario: Missing case-study evidence lowers readiness
    Tool: tmux
    Steps: copy repo to temp dir, remove case-study evidence docs from the temp copy, then run `bun bin/boulder.ts product-readiness --cwd <tmp> --json`
    Expected: readiness is below `product-ready`
    Evidence: .omo/ulw-loop/evidence/product-t6-readiness-negative.txt
  ```

  **Commit**: YES | Message: `feat(scorecard): add product readiness gate` | Files: `src/product-readiness.ts`, `src/cli.ts`, tests, docs

- [ ] 9. Case-Study Evidence Runs

  **What to do**:
  - Execute the case-study workflow from T5.
  - Capture reports for three repo shapes.
  - Add unresolved-risk notes per case.

  **Must NOT do**:
  - Do not fabricate external repo evidence.
  - Do not overwrite example harnesses without `--force` evidence.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: T10, T15 | Blocked By: T7

  **References**:
  - `docs/CASE_STUDY_WORKFLOW.md`
  - `examples/*`

  **Acceptance Criteria**:
  - [ ] Three case-study reports exist.
  - [ ] Each report includes command transcript, generated artifacts, result, unresolved risks.

  **QA Scenarios**:
  ```text
  Scenario: All local case studies complete
    Tool: tmux
    Steps: run the documented command set from T7 for `examples/typescript-library`, `examples/python-package`, and `examples/mcp-server`
    Expected: three reports exist and contain pass/fail evidence
    Evidence: .omo/ulw-loop/evidence/product-t7-all-cases.txt

  Scenario: Case-study rerun is deterministic
    Tool: tmux
    Steps: copy `examples/typescript-library` to two fresh temp dirs, run the T7 command set against both copies, and compare report headings plus required evidence fields
    Expected: generated report structure is stable
    Evidence: .omo/ulw-loop/evidence/product-t7-rerun-determinism.txt
  ```

  **Commit**: YES | Message: `docs(cases): record product pilot evidence` | Files: case-study reports

- [ ] 10. Product Readiness Gate

  **What to do**:
  - Combine release hygiene, M9 evidence, case studies, and product scorecard into a single release gate.
  - The gate should block `product-ready` until evidence exists.

  **Must NOT do**:
  - Do not replace existing `release-plan`; extend or add a separate product readiness command only if tests justify it.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: T13, T15 | Blocked By: T6, T8, T9

  **References**:
  - `src/release-plan.ts`
  - new product readiness model from T6

  **Acceptance Criteria**:
  - [ ] `bun bin/boulder.ts product-readiness --cwd . --json` tells whether Boulder is POC, pilot-ready, product-ready, or service-ready.
  - [ ] Missing M9 or case-study evidence produces a clear blocker.

  **QA Scenarios**:
  ```text
  Scenario: Product gate passes pilot-ready
    Tool: tmux
    Steps: run `bun bin/boulder.ts product-readiness --cwd . --json` after M9 and case-study evidence exist
    Expected: stage is at least `pilot-ready`
    Evidence: .omo/ulw-loop/evidence/product-t8-pilot-ready.txt

  Scenario: Product gate blocks service-ready
    Tool: tmux
    Steps: copy repo to temp dir, remove `docs/decisions/0001-executor-lanes.md`, then run `bun bin/boulder.ts product-readiness --cwd <tmp> --json`
    Expected: stage is not `service-ready` and blocker is explicit
    Evidence: .omo/ulw-loop/evidence/product-t8-service-blocker.txt
  ```

  **Commit**: YES | Message: `feat(readiness): gate product maturity with evidence` | Files: readiness source/tests/docs

- [ ] 11. Support / Security Readiness

  **What to do**:
  - Define issue intake, vulnerability intake, maintainer response expectations, and release note standard.
  - Ensure public product users have a clear route for bugs and security reports.

  **Must NOT do**:
  - Do not promise response SLAs that cannot be maintained.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: T15 | Blocked By: T2

  **References**:
  - `SECURITY.md`
  - `CONTRIBUTING.md`
  - `README.md`

  **Acceptance Criteria**:
  - [ ] Security and support path is clear from README or docs.
  - [ ] Release notes standard exists.

  **QA Scenarios**:
  ```text
  Scenario: Support path discoverability
    Tool: tmux
    Steps: search README, CONTRIBUTING, SECURITY for issue/security/reporting instructions
    Expected: public user can find bug and vulnerability paths
    Evidence: .omo/ulw-loop/evidence/product-t11-support-path.txt

  Scenario: No unsupported SLA
    Tool: tmux
    Steps: search docs for SLA/time promises
    Expected: no unsupported response guarantee appears
    Evidence: .omo/ulw-loop/evidence/product-t11-no-sla-overclaim.txt
  ```

  **Commit**: YES | Message: `docs(support): define public support readiness` | Files: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, release docs

- [ ] 12. Concurrent Write Policy

  **What to do**:
  - Document and, if needed, enforce the behavior of commands that write docs: `inspect`, `verify`, `scorecard`, `benchmark`, `release-plan`, `export`.
  - Decide default: concurrent writes to the same repo are unsupported; users should run one Boulder write command at a time.

  **Must NOT do**:
  - Do not add locking unless a failing test proves it is needed for current product tier.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: T15 | Blocked By: T2

  **References**:
  - `src/cli.ts`
  - `src/fs.ts`
  - write-capable commands listed above

  **Acceptance Criteria**:
  - [ ] Docs state write-command concurrency policy.
  - [ ] Product readiness gate treats missing concurrency policy as a blocker.

  **QA Scenarios**:
  ```text
  Scenario: Write policy documented
    Tool: tmux
    Steps: search docs for write-command concurrency policy
    Expected: policy names write-capable commands and one-at-a-time guidance
    Evidence: .omo/ulw-loop/evidence/product-t12-write-policy.txt

  Scenario: Product gate checks policy
    Tool: tmux
    Steps: copy repo to temp dir, remove the write-command concurrency policy doc/section, then run `bun bin/boulder.ts product-readiness --cwd <tmp> --json`
    Expected: missing policy blocks product-ready
    Evidence: .omo/ulw-loop/evidence/product-t12-readiness-policy.txt
  ```

  **Commit**: YES | Message: `docs(operations): define write-command policy` | Files: docs/readiness files

- [ ] 13. Korean / English Operator Docs

  **What to do**:
  - Create Korean and English explanation paths for the repeatable workflow.
  - Korean version should explain Boulder as an OSS operator workflow harness, not a generic automation CLI.

  **Must NOT do**:
  - Do not add marketing-heavy landing copy.
  - Do not claim hosted service availability before it exists.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: T15 | Blocked By: T7

  **References**:
  - `README.md`
  - `docs/APPLICATION_EVIDENCE.md`
  - `docs/FOLLOW_UP_BRIEFING.md`

  **Acceptance Criteria**:
  - [ ] English quickstart remains concise.
  - [ ] Korean operator guide explains the product workflow, evidence model, and non-goals.

  **QA Scenarios**:
  ```text
  Scenario: Korean operator guide smoke
    Tool: tmux
    Steps: check guide headings and required terms with `rg`
    Expected: includes workflow, evidence, release, case-study, non-goals
    Evidence: .omo/ulw-loop/evidence/product-t9-ko-guide.txt

  Scenario: English README still matches CLI
    Tool: tmux
    Steps: compare README command list with CLI help output
    Expected: command list has no missing current commands
    Evidence: .omo/ulw-loop/evidence/product-t9-readme-cli-sync.txt
  ```

  **Commit**: YES | Message: `docs(product): explain repeatable operator workflow` | Files: `README.md`, `docs/OPERATOR_GUIDE.ko.md`

- [ ] 14. GJC Planning to LazyCodex Implementation Decision Record

  **What to do**:
  - Define Boulder handoff semantics for the staged GJC-to-LazyCodex flow.
  - Choose default routing:
    - GJC for planning, ambiguity reduction, ralplan review, ultragoal decomposition, and CSO/QA criteria.
    - LazyCodex for Codex-native implementation, TDD, PR-sized work, and manual QA based on the approved GJC plan.
    - GJC may be reused for optional review/QA tracking, but not as the default implementation owner.
    - GitHub Action, MCP server, local dashboard, and hosted service remain outer packaging options after executor evidence exists.
  - Define when Boulder can use a lightweight GJC plan versus full deep-interview/ralplan/ultragoal planning.
  - Define how GJC plan evidence and LazyCodex implementation evidence return into Boulder product readiness.

  **Must NOT do**:
  - Do not implement executor launching in this task.
  - Do not make GJC or LazyCodex mandatory dependencies of core Boulder commands.
  - Do not require credentials or external provider calls.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: T15, T16 | Blocked By: T10

  **References**:
  - Existing CLI commands and release evidence.
  - Product readiness scorecard from T6/T8.
  - Executor Architecture section in this plan.

  **Acceptance Criteria**:
  - [ ] Decision record defines GJC as the planning/review lane and LazyCodex as the implementation lane.
  - [ ] Decision record names default staged routing by friction level.
  - [ ] Rejected outer packaging options include clear reasons and revisit conditions.

  **QA Scenarios**:
  ```text
  Scenario: Executor decision record completeness
    Tool: tmux
    Steps: inspect decision record for GJC planning lane, LazyCodex implementation lane, friction routing, evidence return contract, rejected outer wrappers, constraints, and revisit triggers
    Expected: all sections exist
    Evidence: .omo/ulw-loop/evidence/product-t10-decision-record.txt

  Scenario: No implementation creep
    Tool: tmux
    Steps: check diff for new service code files after decision task
    Expected: docs-only change for this task
    Evidence: .omo/ulw-loop/evidence/product-t10-no-creep.txt
  ```

  **Commit**: YES | Message: `docs(product): define gjc to lazycodex flow` | Files: `docs/decisions/0001-executor-lanes.md`

- [ ] 15. Roadmap M10-M14 Update

  **What to do**:
  - Update roadmap after M9 with product/service readiness milestones:
    - M10 release hygiene and product readiness gate
    - M11 case-study workflow and reports
    - M12 submission/release packet
    - M13 GJC planning adapter docs, LazyCodex implementation handoff packet, and evidence return contract
    - M14 GitHub Action, MCP server, local dashboard, or hosted-service wrapper spike only after staged handoff evidence

  **Must NOT do**:
  - Do not bury blocking release hygiene behind future service work.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: T16 | Blocked By: T10, T14

  **References**:
  - `ROADMAP.md`
  - `plans/m9-pipeline-evidence-integration.md`

  **Acceptance Criteria**:
  - [ ] Roadmap reflects product readiness sequence.
  - [ ] Each milestone has entry criteria and exit criteria.

  **QA Scenarios**:
  ```text
  Scenario: Roadmap sequence check
    Tool: tmux
    Steps: inspect `ROADMAP.md` for M10-M14 headings and entry/exit criteria
    Expected: all milestones exist and M10 precedes outer wrapper work
    Evidence: .omo/ulw-loop/evidence/product-t11-roadmap.txt

  Scenario: No benchmark overclaim
    Tool: tmux
    Steps: search roadmap for leaderboard/runtime-scale claims
    Expected: no unsupported claim appears
    Evidence: .omo/ulw-loop/evidence/product-t11-no-overclaim.txt
  ```

  **Commit**: YES | Message: `docs(roadmap): sequence product readiness milestones` | Files: `ROADMAP.md`

- [ ] 16. Final Product Release Packet

  **What to do**:
  - Produce a release packet that a maintainer or Codex-for-OSS reviewer can use.
  - Include install command, supported commands, evidence status, case studies, known limitations, next wrapper decision, and release checklist.

  **Must NOT do**:
  - Do not publish automatically.
  - Do not hide known gaps.

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: release/submission | Blocked By: T1-T15

  **References**:
  - `docs/APPLICATION_EVIDENCE.md`
  - `docs/RELEASE_PLAN.md`
  - `docs/BENCHMARK_FIXTURE_REPORT.md`
  - product readiness reports

  **Acceptance Criteria**:
  - [ ] Release packet exists.
  - [ ] It names exact verification commands and evidence artifacts.
  - [ ] It states current maturity honestly.

  **QA Scenarios**:
  ```text
  Scenario: Release packet completeness
    Tool: tmux
    Steps: inspect release packet headings and evidence links
    Expected: install, commands, evidence, limitations, case studies, release checklist all present
    Evidence: .omo/ulw-loop/evidence/product-t12-release-packet.txt

  Scenario: Full product verification
    Tool: tmux
    Steps: run `bun test`; run `bun run ci`; run all M9 tmux QA scenarios; run `bun bin/boulder.ts product-readiness --cwd . --json`; run the T7 case-study command set for all three example repos
    Expected: all pass with cleanup receipts
    Evidence: .omo/ulw-loop/evidence/product-t12-full-verification.txt
  ```

  **Commit**: YES | Message: `docs(release): assemble product readiness packet` | Files: `docs/PRODUCT_RELEASE_PACKET.md`

## Final Verification Wave

- [ ] F1. Plan Compliance Audit
  - Confirm every task maps to a product-readiness blocker or milestone.
  - Evidence: `.omo/ulw-loop/evidence/product-final-plan-compliance.txt`

- [ ] F2. Code Quality Review
  - Run reviewer after implementation diff exists.
  - Evidence: `.omo/ulw-loop/evidence/product-final-review.txt`

- [ ] F3. Real Manual QA
  - Re-run every tmux scenario from T1-T16.
  - Evidence: `.omo/ulw-loop/evidence/product-final-manual-qa.txt`

- [ ] F4. Scope Fidelity Check
  - Confirm no provider calls, runtime launchers, credential access, package installs, or hosted-service code slipped in.
  - Evidence: `.omo/ulw-loop/evidence/product-final-scope.txt`

## Commit Strategy

Use atomic conventional commits:

1. `fix(release): align package version and artifact hygiene`
2. `docs(release): reconcile release status`
3. `feat(export): include operator pipeline evidence`
4. `feat(release): require pipeline planning evidence`
5. `test(pipeline): guard product contract boundaries`
6. `docs(plan): reconcile m9 evidence criteria`
7. `docs(cases): add repeatable case-study workflow`
8. `feat(scorecard): add product readiness gate`
9. `docs(cases): record product pilot evidence`
10. `feat(readiness): gate product maturity with evidence`
11. `docs(support): define public support readiness`
12. `docs(operations): define write-command policy`
13. `docs(product): explain repeatable operator workflow`
14. `docs(product): define gjc to lazycodex flow`
15. `docs(roadmap): sequence product readiness milestones`
16. `docs(release): assemble product readiness packet`

Do not auto-commit without operator approval.

## Success Criteria

Boulder reaches repeatable product/service readiness when:

- Release package is clean.
- Version truth is consistent.
- M9 evidence integration is implemented and proven.
- Three case-study runs are repeatable.
- Product readiness scorecard reports at least `pilot-ready`.
- Release-facing docs agree on version and release state.
- Public support/security path is documented.
- Write-command concurrency policy is documented.
- GJC planning to LazyCodex implementation decision is documented.
- Roadmap sequences service work after product readiness.
- Final release packet is complete and honest about limitations.
