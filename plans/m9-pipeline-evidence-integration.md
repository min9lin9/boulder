# M9 Plan: Pipeline Evidence Integration

Status: ready for ULW execution
Owner lane: LazyCodex / development agent
Planning method: planner debate plus thesis, antithesis, synthesis

## Objective

M9 connects the M8 friction-scaled pipeline planning surface to Boulder release/export evidence while preserving the M8 contract.

The result must make the default `medium` pipeline visible in maintainer handoff artifacts and release readiness checks without turning Boulder into a runtime launcher. The full high-friction path, including `cso-qa`, remains verified through `boulder pipeline --friction high`.

Default export scope: default `medium` pipeline only.

## Current State Review

- `boulder pipeline` exists and is tested for low, medium, high, JSON output, human output, invalid friction, and forbidden side effects.
- `exportHarness` writes `docs/BOULDER_EXPORT.md` and `docs/CODEX_WORKFLOW_NOTES.md` from `src/templates/export.ts`.
- `evaluateReleasePlan` checks release-facing docs, workflow stack evidence, benchmark evidence, version evidence, and package scripts.
- M8 intentionally kept `pipeline` separate from `inspect`, `export`, and `release-plan`.
- M9 may integrate pipeline summaries into export or release evidence; this plan chooses both, but only as evidence surfaces.

## Thesis / Antithesis / Synthesis

### Thesis

Pipeline evidence belongs in export and release-plan because Boulder is an operator harness. Maintainers and Codex need one durable artifact that explains the repo context, workflow stack, and friction-scaled operating path.

### Antithesis

Adding pipeline to export and release-plan can accidentally imply orchestration, provider execution, or benchmark maturity. If implementation changes `PipelinePlan`, adds config, or modifies benchmark scoring, M9 becomes a runtime/product expansion rather than evidence integration.

### Synthesis

Keep M9 as evidence-only integration:

- Export renders a concise `Operator Pipeline` section from the built-in medium plan.
- High-friction `cso-qa` is not part of the default medium export section; it remains visible and regression-tested through the pipeline CLI.
- Release-plan adds one deterministic check: `pipeline-planning-evidence`.
- Tests assert stable ids, approval gates, fail-closed status, and forbidden side-effect categories.
- Manual QA captures real CLI transcripts and static gate output.
- No source path may call providers, launch processes, install packages, or access credentials as part of pipeline integration.

## Scope Lock

### In

- `src/export.ts`
- `src/templates/export.ts`
- `src/release-plan.ts`
- focused tests in `test/cli.test.ts` and `test/cli-e2e.test.ts`
- `docs/PIPELINE_PLANNING_SURFACE.md`
- ULW evidence files under `.omo/ulw-loop/evidence/`

### Out

- New CLI flags.
- Repo-local pipeline config.
- Runtime agent launch.
- Provider calls.
- Credential access.
- Package installation.
- Benchmark scoring changes.
- Adapter registry.
- Any change to existing `PipelinePlan` field names or stage ids.

## Implementation Tasks

### Task 1: Add Failing Export Test

Files:

- `test/cli.test.ts`

Steps:

1. Extend the existing `export writes Codex notes` test or add a sibling test.
2. Initialize a temp repo with `initHarness`.
3. Run `exportHarness(root, true)`.
4. Read `docs/BOULDER_EXPORT.md`.
5. Assert the export contains:
   - `## Operator Pipeline`
   - `friction: medium`
   - `classification`
   - `deep-interview`
   - `pm-debate`
   - `synthesizer`
   - `fail-closed: true`
   - `credential-access`
   - `provider-call`

Acceptance:

- The test fails before implementation because the export currently has no pipeline section.
- Failure is an assertion failure, not an import/type/runtime error.

Manual QA criterion:

- `m9-export-summary`
- Channel: tmux
- Scenario: run `bun bin/boulder.ts init --cwd <tmp>` then `bun bin/boulder.ts export --cwd <tmp> --force` then print the generated `docs/BOULDER_EXPORT.md` pipeline section.
- Evidence path: `.omo/ulw-loop/evidence/m9-export-pipeline-summary.txt`

### Task 2: Implement Export Pipeline Section

Files:

- `src/export.ts`
- `src/templates/export.ts`

Steps:

1. Import `buildPipelinePlan` in `src/export.ts`.
2. Build the default medium plan inside `exportHarness`.
3. Pass the plan into `exportMarkdown`.
4. Update `exportMarkdown` signature to accept the plan.
5. Render `## Operator Pipeline` after `## Operator Workflow Stack`.
6. Keep rendering compact and contract-oriented:
   - friction
   - stage ids with depth and approval marker
   - fail-closed
   - forbidden side effects
7. Do not modify `codexNotes` in this task.

Acceptance:

- Task 1 test passes.
- Existing export tests and e2e happy path still pass.
- `PipelinePlan` type is imported only as data, not converted into execution behavior.

### Task 3: Add Failing Release-Plan Evidence Test

Files:

- `test/cli.test.ts`

Steps:

1. Extend `release plan` tests.
2. Evaluate the root release plan.
3. Assert a check exists with id `pipeline-planning-evidence`.
4. Assert the check status is `pass`.
5. Assert the evidence text mentions both `docs/PIPELINE_PLANNING_SURFACE.md` and `medium pipeline plan validates`.
6. Assert `releasePlanToMarkdown` contains `pipeline-planning-evidence`.

Acceptance:

- The test fails before implementation because no such release check exists.

Manual QA criterion:

- `m9-release-plan-evidence`
- Channel: tmux
- Scenario: run `bun bin/boulder.ts release-plan --cwd . --json`, parse/inspect output for `pipeline-planning-evidence`, status `pass`, and `medium pipeline plan validates`.
- Evidence path: `.omo/ulw-loop/evidence/m9-release-plan-pipeline-evidence.txt`

### Task 4: Implement Release-Plan Pipeline Check

Files:

- `src/release-plan.ts`

Steps:

1. Import `buildPipelinePlan` and `validatePipelinePlan`.
2. Add `pipelinePlanningEvidenceCheck(root)` to `checks`.
3. Check that `docs/PIPELINE_PLANNING_SURFACE.md` exists.
4. Build the medium plan and validate it.
5. Return pass only if the doc exists and validation returns no issues.
6. Evidence text on pass:
   - `docs/PIPELINE_PLANNING_SURFACE.md exists and medium pipeline plan validates`
7. Evidence text on failure:
   - include missing doc and/or validation issue ids.

Acceptance:

- Task 3 test passes.
- Existing release-plan status remains `ready` for the root repo.
- Markdown output remains stable except for the added check line.

### Task 5: Preserve Pipeline JSON Contract

Files:

- `test/cli-e2e.test.ts`

Steps:

1. Keep the existing high-friction JSON e2e test.
2. Add assertions that no new top-level fields are required for M9.
3. Assert sorted top-level keys equal:
   - `approvalGates`
   - `evidenceRequired`
   - `failClosed`
   - `forbiddenSideEffects`
   - `friction`
   - `stages`

Acceptance:

- `bun bin/boulder.ts pipeline --friction high --json` output remains M8-compatible.

Manual QA criterion:

- `m9-pipeline-json-regression`
- Channel: tmux
- Scenario: run `bun bin/boulder.ts pipeline --friction high --json` and capture top-level keys plus stage ids.
- Evidence path: `.omo/ulw-loop/evidence/m9-pipeline-json-regression.txt`

### Task 6: Update Docs and Static Scope Gate

Files:

- `docs/PIPELINE_PLANNING_SURFACE.md`

Steps:

1. Change M9 boundary text from future tense to implemented behavior after code passes:
   - export includes the default medium pipeline summary
   - release-plan checks pipeline planning evidence
2. Add M9 manual QA command list.
3. Add scoped static gate command:
   - `rg -n "credential|package install|spawn|exec|openai|anthropic|provider" src/export.ts src/templates/export.ts src/release-plan.ts test/cli.test.ts test/cli-e2e.test.ts docs/PIPELINE_PLANNING_SURFACE.md`
4. Document allowed hits:
   - forbidden side-effect labels
   - policy text
   - e2e `exec` helper
5. Document disallowed hits:
   - any new provider SDK call
   - native process launch in pipeline/export/release implementation
   - package install or credential access code

Acceptance:

- The doc reflects actual M9 behavior, not roadmap speculation.
- Static gate scope excludes unrelated old docs except the updated M9 doc.

Manual QA criterion:

- `m9-static-scope-gate`
- Channel: tmux
- Scenario: run the scoped `rg` command and capture output plus interpretation.
- Evidence path: `.omo/ulw-loop/evidence/m9-static-scope-gate.txt`

## Dependency Matrix

| Task | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| Task 1 export failing test | none | Task 2 | Task 3, Task 5 |
| Task 2 export implementation | Task 1 | Task 6, export QA | Task 4 after Task 3 |
| Task 3 release failing test | none | Task 4 | Task 1, Task 5 |
| Task 4 release implementation | Task 3 | Task 6, release QA | Task 2 after Task 1 |
| Task 5 JSON regression guard | none | final verification | Task 1, Task 3 |
| Task 6 docs/static gate | Tasks 2, 4, 5 | final verification | none |

Critical path:

Task 1 -> Task 2 -> Task 6 -> final verification.

## ULW Goal Criteria

Goal id suggestion: `m9-pipeline-evidence-integration`

The clean ULW session currently uses three criteria. Criterion 3 combines JSON regression and static scope gate evidence. This is acceptable for M9 as long as the combined evidence file contains both checks and their cleanup receipt.

Success criteria:

1. `m9-export-summary`
   - Scenario: tmux-driven init/export on a temp repo, then inspect generated `docs/BOULDER_EXPORT.md`.
   - Pass if evidence shows `## Operator Pipeline`, `friction: medium`, all medium stage ids, `fail-closed: true`, and forbidden side-effect labels.
   - Expected evidence: `.omo/ulw-loop/evidence/m9-export-pipeline-summary.txt`

2. `m9-release-plan-evidence`
   - Scenario: tmux-driven `bun bin/boulder.ts release-plan --cwd . --json`.
   - Pass if JSON includes `pipeline-planning-evidence`, status `pass`, and the pass evidence sentence.
   - Expected evidence: `.omo/ulw-loop/evidence/m9-release-plan-pipeline-evidence.txt`

3. `m9-pipeline-json-regression`
   - Scenario: tmux-driven `bun bin/boulder.ts pipeline --friction high --json`.
   - Pass if top-level keys match the M8 contract and stage ids remain unchanged.
   - Expected evidence: `.omo/ulw-loop/evidence/m9-pipeline-json-regression.txt`

4. Optional split criterion: `m9-static-scope-gate`
   - Scenario: tmux-driven scoped static search over changed source/test/docs files.
   - Pass if hits are limited to forbidden-side-effect labels, policy/evidence text, or the existing e2e `exec` helper.
   - Expected evidence if split: `.omo/ulw-loop/evidence/m9-static-scope-gate.txt`
   - If not split, include this evidence in `.omo/ulw-loop/evidence/m9-pipeline-json-and-static-gate.txt`.

## Verification Commands

Run after implementation:

```bash
bun test
bun run ci
```

Run focused manual QA through tmux for each ULW criterion. Each evidence file must include the command transcript and cleanup receipt.

## Stop Conditions

- Stop if any implementation requires changing `PipelinePlan` field names.
- Stop if a proposed change introduces provider calls, external process launch, credential access, or package installation.
- Stop if release-plan readiness requires benchmark scoring changes.
- Stop if static gate reveals new side-effect code outside test helpers or policy text.

## Final Done Definition

- All targeted tests pass.
- `bun run ci` passes.
- All three clean-session ULW criteria have observable tmux evidence files; if the static gate is split, all four criteria must pass.
- `omo ulw-loop` records each criterion as pass with cleanup receipts.
- `docs/PIPELINE_PLANNING_SURFACE.md` documents M9 behavior and the static scope gate.
- Git diff is limited to M9 source, tests, docs, and ULW evidence artifacts.
