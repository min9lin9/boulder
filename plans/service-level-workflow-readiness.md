# Service-Level Workflow Readiness Plan

## TL;DR
> **Summary**: Boulder should define “service” as a repeatable public OSS workflow delivered through CLI, docs, evidence artifacts, and support operations, not as hosted SaaS. The next service-level plan adds four missing loops: 5-minute onboarding, external replay, validated GJC/LazyCodex handoff, and operating metrics.
> **Deliverables**:
> - service loop definition and readiness gate
> - 5-minute onboarding path
> - external public repo replay workflow
> - official-docs-first public OSS optimization workflow
> - handoff schema fixtures and validator
> - operating metrics report
> - service-readiness command or report
> - evidence-backed case study updates
> - activation/retention/distribution loop review
> **Effort**: Large
> **Parallel**: YES - 4 waves
> **Critical Path**: onboarding fixture -> replay manifest -> handoff validator -> metrics model -> service-readiness gate

## Context

### Original Request

Plan onboarding, external replay, handoff validation, and operating metrics so Boulder can reach a repeatable public service-level OSS workflow.

### Interview Summary

No additional user question is needed. Current repo facts show the gap:

- `product-readiness` is tight and currently blocked on public-product evidence.
- Boulder has a strong local CLI and docs story, but service usage is not yet one repeatable loop.
- Existing case studies are mostly Boulder-local.
- GJC/LazyCodex handoff is documented but not mechanically validated.
- No metrics model exists for activation, replay success, handoff validity, support intake, or readiness pass rate.
- Activation, repeat triggers, retention, and distribution are not yet explicit enough to prove practical repeat use.

Default product position:

> Boulder Service Loop = `install -> init -> inspect -> classify/pipeline -> handoff -> verify/export -> readiness -> replay/report -> support`.

This is service-as-workflow, not hosted SaaS.

### Metis Review (gaps addressed)

- **Service ambiguity**: The plan defines service as repeatable public workflow, not a web app.
- **Evidence inflation risk**: Service readiness must not pass from docs alone; it needs executed onboarding, replay, validator, and metrics evidence.
- **External replay risk**: Use a public repo fixture or public repo snapshot that can be replayed without credentials. Do not depend on private repos.
- **Executor coupling risk**: Boulder validates handoff artifacts but does not launch GJC, LazyCodex, providers, or external runtimes.
- **Metrics vanity risk**: Metrics are operational health counters, not adoption claims.
- **Retention gap**: Service use must be tied to recurring repo events such as PRs, releases, official-docs changes, replay additions, and support issues.

## Work Objectives

### Core Objective

Turn Boulder from an evidence-backed CLI product into a repeatable public workflow service where a maintainer can onboard, replay the workflow against a repo, validate plan/implementation handoff, and inspect operating health without hidden local context.

### Deliverables

- `docs/SERVICE_LOOP.md`
- `docs/ONBOARDING.md`
- `docs/EXTERNAL_REPLAY.md`
- `docs/HANDOFF_VALIDATION.md`
- `docs/OPERATING_METRICS.md`
- `docs/SERVICE_STRATEGY_REVIEW.md`
- `fixtures/replay/` with at least one external public replay manifest
- `fixtures/handoffs/low.json`
- `fixtures/handoffs/medium.json`
- `fixtures/handoffs/high.json`
- optional `src/service-readiness.ts` and CLI command `boulder service-readiness`
- tests for onboarding/replay/handoff/metrics readiness
- tmux QA evidence for real CLI flows

### Definition of Done

All commands pass:

```bash
bun test
bun run ci
bun bin/boulder.ts product-readiness --json
bun bin/boulder.ts service-readiness --json
```

If `service-readiness` is not implemented in the first pass, the minimum acceptable substitute is:

```bash
bun bin/boulder.ts product-readiness --json
rg -n "Activation|Replay|Handoff|Metrics|Support|Readiness" docs/SERVICE_LOOP.md docs/OPERATING_METRICS.md
```

Service-level readiness is achieved only when:

- onboarding can be completed from a clean checkout in under 5 minutes
- at least one public external replay manifest exists
- every public OSS replay target has official documentation sources captured before recommendations are generated
- low/medium/high handoff fixtures validate
- operating metrics are computed or reported from evidence files
- activation is measured by time-to-first-readiness-delta, not install completion
- repeat use is represented by readiness deltas across PR/release/replay/support events
- readiness remains honest about npm publish, public CI, and external adoption boundaries

### Must Have

- CLI-first onboarding.
- No hidden profile-local dependencies.
- External replay without credentials.
- Official documentation first for every attached public OSS target.
- Source-backed optimization notes for onboarding, replay, and handoff recommendations.
- Handoff validation that catches missing acceptance criteria, QA evidence, and risk fields.
- Metrics that distinguish local success from public adoption.
- Product loop definitions for activation, repeat trigger, retention, and distribution.
- Failure cases that block readiness.
- tmux QA evidence.

### Must NOT Have

- No hosted SaaS requirement.
- No provider launch.
- No GJC or LazyCodex runtime dependency in Boulder core.
- No fake adoption metric.
- No npm publish claim unless registry install is verified.
- No external replay against private repos.
- No recommendations for a public OSS target without reading and citing that project’s official documentation first.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.

- Test decision: TDD with Bun test for any new command, parser, validator, or readiness gate.
- Docs-only parts: static `rg` checks plus tmux QA.
- QA policy: each milestone has a happy and failure scenario.
- Evidence root: `.omo/ulw-loop/evidence/service-level-workflow/`.
- Manual QA channel: tmux.

## Execution Strategy

### Parallel Execution Waves

Wave 1: define service loop and onboarding.

Wave 2: official-docs-first public OSS replay and handoff validation.

Wave 3: operating metrics and service-readiness gate.

Wave 4: final evidence, docs linkage, and public service audit.

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
| --- | --- | --- | --- |
| T1 Service loop definition | none | T5, T8 | T2 |
| T2 Five-minute onboarding | none | T5, T8 | T1 |
| T3 Official docs ingestion for public OSS targets | T1 | T4, T5, T6, T8 | none |
| T4 External replay manifest | T1, T3 | T6, T8 | T5 |
| T5 Handoff fixtures and validator | T1 | T6, T8 | T4 |
| T6 Service-readiness gate | T1-T5 | T7, T8 | none |
| T7 Operating metrics model | T3-T6 | T8 | none |
| T8 Support/replay operations docs | T1, T7 | T9 | none |
| T9 Product loop and strategy review | T1-T8 | T10 | none |
| T10 Final service audit | T1-T9 | release/service claim | none |

## TODOs

- [ ] 1. Define Boulder Service Loop

  **What to do**: Create `docs/SERVICE_LOOP.md` defining the repeatable public workflow:
  `install -> init -> inspect -> classify/pipeline -> handoff -> verify/export -> readiness -> replay/report -> support`.
  Include personas, entry points, exit criteria, and service boundaries.

  **Must NOT do**: Do not describe Boulder as hosted SaaS or autonomous executor.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: T5, T8 | Blocked By: none

  **References**:
  - `README.md` - current CLI commands and public evidence.
  - `docs/OSS_REPO_SETUP_REVIEW.md` - public OSS operations.
  - `docs/GJC_LAZYCODEX_HANDOFF.md` - executor boundaries.

  **Acceptance Criteria**:
  - [ ] `docs/SERVICE_LOOP.md` contains every loop stage.
  - [ ] It names Boulder, GJC, LazyCodex, and human release boundaries.
  - [ ] It explicitly says not hosted SaaS and no provider launch.

  **QA Scenarios**:
  ```text
  Scenario: service loop terms are discoverable
    Tool: tmux
    Steps: run `rg -n "install|init|inspect|pipeline|handoff|verify|export|readiness|replay|support|not hosted|provider launch" docs/SERVICE_LOOP.md`
    Expected: every stage and boundary appears
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t1-service-loop.txt

  Scenario: no SaaS overclaim
    Tool: tmux
    Steps: run `rg -n "hosted SaaS|autonomous provider|external runtime launch" docs/SERVICE_LOOP.md`
    Expected: matches only appear as explicit non-goals
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t1-no-overclaim.txt
  ```

  **Commit**: YES | Message: `docs(service): define boulder service loop` | Files: `docs/SERVICE_LOOP.md`

- [ ] 2. Five-Minute Onboarding

  **What to do**: Create `docs/ONBOARDING.md` and, if needed, add `boulder init --example` or a documented fixture path that lets a new user complete the first loop from clean checkout in five minutes.

  **Must NOT do**: Do not require npm publish if package is still unpublished; include pre-publish local path.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: T5, T8 | Blocked By: none

  **References**:
  - `README.md` install and local development sections.
  - `examples/typescript-library`, `examples/python-package`, `examples/mcp-server`.
  - `bin/boulder.ts`, `src/cli.ts` if adding command behavior.

  **Acceptance Criteria**:
  - [ ] Clean-checkout onboarding path has exact commands.
  - [ ] Commands cover `--help`, `init`, `inspect`, `pipeline`, `export`, and readiness check.
  - [ ] Pre-publish and post-publish install paths are separated.
  - [ ] Failure guidance covers missing Bun and blocked product readiness.

  **QA Scenarios**:
  ```text
  Scenario: clean checkout onboarding succeeds
    Tool: tmux
    Steps: in a temp directory, run the documented local pre-publish commands against one example repo
    Expected: help output appears, export files exist, readiness status is explained
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t2-onboarding.txt

  Scenario: blocked readiness is explained
    Tool: tmux
    Steps: run `bun bin/boulder.ts product-readiness --json`
    Expected: blocked output includes concrete missing evidence rather than silent success
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t2-readiness-blocked.txt
  ```

  **Commit**: YES | Message: `docs(service): add five minute onboarding` | Files: `docs/ONBOARDING.md`, optional CLI/tests if command is added

- [ ] 3. Official Docs Ingestion for Public OSS Targets

  **What to do**: Add a public OSS official-documentation intake step before any external replay recommendation. For each public OSS target, record official docs URLs, version/ref, relevant setup/test/release commands, contribution rules, security policy, and constraints. Store the result in `fixtures/replay/<project>/official-docs.json` and summarize it in `docs/EXTERNAL_REPLAY.md`.

  **Must NOT do**: Do not rely on README snippets, blog posts, third-party tutorials, or memory when official docs exist. Do not optimize Boulder recommendations for a public OSS target without source links.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T4, T6, T8 | Blocked By: T1

  **References**:
  - `docs/EXTERNAL_REPLAY.md` - replay documentation to create.
  - `fixtures/replay/` - replay manifests to create.
  - Public OSS target official docs URLs captured at execution time.

  **Acceptance Criteria**:
  - [ ] Each public OSS replay target has an `official-docs.json` source file.
  - [ ] Source file includes `project`, `repoUrl`, `docsUrls`, `versionOrRef`, `setupCommands`, `testCommands`, `contributionPolicy`, `securityPolicy`, `constraints`, and `retrievedAt`.
  - [ ] Replay manifest references the official docs source file.
  - [ ] Service-readiness blocks external replay when official docs evidence is missing.

  **QA Scenarios**:
  ```text
  Scenario: official docs evidence exists
    Tool: tmux
    Steps: run `jq '.project and .repoUrl and .docsUrls and .setupCommands and .testCommands and .retrievedAt' fixtures/replay/*/official-docs.json`
    Expected: every public OSS target official-docs file has required fields
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t3-official-docs.txt

  Scenario: missing official docs blocks replay
    Tool: tmux
    Steps: run service-readiness fixture with replay manifest present but `official-docs.json` removed
    Expected: status is not `ready`; failed check names official docs
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t3-official-docs-missing.txt
  ```

  **Commit**: YES | Message: `docs(service): require official docs for public oss replay` | Files: `docs/EXTERNAL_REPLAY.md`, `fixtures/replay/*/official-docs.json`, service-readiness tests if implemented

- [ ] 4. External Replay Manifest

  **What to do**: Add `docs/EXTERNAL_REPLAY.md` and `fixtures/replay/` manifests for replaying Boulder against a public repo. Default first target: `min9lin9/kimi-agent-swarm-skill` if public and appropriate; fallback: Boulder’s public repo plus one external fixture documented as pending. Replay commands must be optimized from the official docs source captured in T3.

  **Must NOT do**: Do not require write access, private tokens, or external provider credentials.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: T5, T6, T8 | Blocked By: T1

  **References**:
  - `docs/CASE_STUDIES/README.md`.
  - `docs/CASE_STUDIES/pr-review.md`.
  - `fixtures/benchmarks/*.json`.

  **Acceptance Criteria**:
  - [ ] Replay manifest includes repo URL, commit/ref, commands, expected artifacts, limitations, and evidence paths.
  - [ ] At least one replay uses a public URL outside `examples/`.
  - [ ] Replay command selection cites official docs evidence, not guesswork.
  - [ ] Missing replay evidence blocks service readiness.

  **QA Scenarios**:
  ```text
  Scenario: replay manifest is parseable
    Tool: tmux
    Steps: run `bun test test/service-readiness.test.ts -t "accepts external replay manifest"` or `jq . fixtures/replay/*.json`
    Expected: all replay manifests parse and required fields exist
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t3-replay-parse.txt

  Scenario: missing replay evidence blocks
    Tool: tmux
    Steps: run service-readiness fixture test with evidence path removed
    Expected: service readiness is blocked
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t3-replay-missing.txt
  ```

  **Commit**: YES | Message: `docs(service): add external replay workflow` | Files: `docs/EXTERNAL_REPLAY.md`, `fixtures/replay/*.json`, tests if implemented

- [ ] 5. Handoff Validation

  **What to do**: Add low/medium/high handoff fixtures and a validator that checks GJC plan and LazyCodex result artifacts. Validator should reject missing acceptance criteria, manual QA plan, risk register, changed files, verification commands, and ready-for-review status.

  **Must NOT do**: Do not launch GJC or LazyCodex.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: T6, T9 | Blocked By: T1

  **References**:
  - `docs/GJC_LAZYCODEX_HANDOFF.md`.
  - `src/product-readiness.ts` currently only checks fixture existence.
  - `test/product-readiness.test.ts`.

  **Acceptance Criteria**:
  - [ ] `fixtures/handoffs/low.json`, `medium.json`, `high.json` exist.
  - [ ] Validator returns pass for all valid fixtures.
  - [ ] Validator fails missing `acceptanceCriteria`, `manualQaPlan`, or `lazycodexResult`.
  - [ ] Public OSS handoff recommendations include an `officialDocsSources` reference when a replay target is attached.
  - [ ] Product/service readiness uses validator result, not only file existence.

  **QA Scenarios**:
  ```text
  Scenario: valid handoffs pass
    Tool: tmux
    Steps: run `bun test test/handoff-validation.test.ts`
    Expected: low/medium/high fixtures pass
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t4-handoff-valid.txt

  Scenario: invalid handoff fails
    Tool: tmux
    Steps: run fixture test with `acceptanceCriteria` removed
    Expected: validator reports blocked/fail with missing field path
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t4-handoff-invalid.txt
  ```

  **Commit**: YES | Message: `feat(service): validate handoff artifacts` | Files: `src/handoff-validation.ts`, `fixtures/handoffs/*.json`, `test/handoff-validation.test.ts`, docs

- [ ] 6. Service-Readiness Gate

  **What to do**: Add `boulder service-readiness [--json]` or a documented `docs/SERVICE_READINESS.md` generator. It should aggregate onboarding, external replay, handoff validation, support operations, product-readiness, and metrics.

  **Must NOT do**: Do not make service readiness pass while product readiness is blocked unless the output explicitly says `service-pilot-ready` instead of `ready`.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: T6, T8 | Blocked By: T1-T4

  **References**:
  - `src/product-readiness.ts` pattern.
  - `src/cli.ts` command routing.
  - `test/product-readiness.test.ts` fixture shape.

  **Acceptance Criteria**:
  - [ ] New gate has statuses: `blocked`, `pilot-ready`, `ready`.
  - [ ] Missing onboarding blocks pilot-ready.
  - [ ] Missing official docs evidence blocks ready for public OSS replay targets.
  - [ ] Missing external replay blocks ready.
  - [ ] Missing handoff validation blocks ready.
  - [ ] Product-readiness blocked prevents `ready` but can allow `pilot-ready` if service pilot evidence exists.

  **QA Scenarios**:
  ```text
  Scenario: service pilot-ready output
    Tool: tmux
    Steps: run `bun bin/boulder.ts service-readiness --json`
    Expected: output status is `pilot-ready` or `blocked` with exact failed checks; never fake `ready`
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t5-service-readiness.txt

  Scenario: missing replay blocks ready
    Tool: tmux
    Steps: run service-readiness fixture with replay manifest removed
    Expected: status is not `ready`; failed check names external replay
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t5-replay-blocks.txt
  ```

  **Commit**: YES | Message: `feat(service): add service readiness gate` | Files: `src/service-readiness.ts`, `src/cli.ts`, tests, docs

- [ ] 7. Operating Metrics Model

  **What to do**: Add `docs/OPERATING_METRICS.md` and optional `src/metrics.ts` that derives local operational metrics from evidence files:
  activation, onboarding success, replay success, handoff validity, readiness pass rate, support intake quality, time-to-evidence.

  **Must NOT do**: Do not report external adoption, user count, or success rate unless data exists.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: T8 | Blocked By: T3, T5

  **References**:
  - `.omo/ulw-loop/evidence/`
  - `docs/CASE_STUDIES/evidence/`
  - `docs/labels-and-milestones.md`
  - `docs/TRUST_SUPPORT_SECURITY.md`

  **Acceptance Criteria**:
  - [ ] Metrics names, definitions, numerator, denominator, and source files are documented.
  - [ ] Metrics distinguish `local evidence`, `public evidence`, and `external adoption`.
  - [ ] Metrics include `official-docs-coverage` for public OSS replay targets.
  - [ ] No metric implies unproven adoption.
  - [ ] Optional CLI/report computes counts from existing evidence.

  **QA Scenarios**:
  ```text
  Scenario: metrics definitions are complete
    Tool: tmux
    Steps: run `rg -n "Activation|Onboarding|Replay|Handoff|official-docs-coverage|Readiness pass rate|Support intake|numerator|denominator|source" docs/OPERATING_METRICS.md`
    Expected: all metrics and definitions appear
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t6-metrics-doc.txt

  Scenario: adoption claims are absent
    Tool: tmux
    Steps: run `rg -n "users acquired|adoption proven|market traction|runtime scale proven" docs/OPERATING_METRICS.md docs/SERVICE_LOOP.md`
    Expected: no unsupported claims
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t6-no-vanity.txt
  ```

  **Commit**: YES | Message: `docs(service): define operating metrics` | Files: `docs/OPERATING_METRICS.md`, optional `src/metrics.ts`, tests

- [ ] 8. Support and Replay Operations

  **What to do**: Connect issue templates, labels/milestones, replay docs, and service metrics into one operator workflow. Add a section explaining how external contributors report failed onboarding/replay/handoff.

  **Must NOT do**: Do not promise response SLA beyond documented best-effort unless the maintainer approves.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: T8 | Blocked By: T1, T6

  **References**:
  - `.github/ISSUE_TEMPLATE/`
  - `docs/labels-and-milestones.md`
  - `docs/TRUST_SUPPORT_SECURITY.md`
  - `docs/OSS_REPO_SETUP_REVIEW.md`

  **Acceptance Criteria**:
  - [ ] Onboarding failure has a support route.
  - [ ] Official docs mismatch has a support route.
  - [ ] Replay failure has a support route.
  - [ ] Handoff validation failure has a support route.
  - [ ] Labels and milestones map to service workflow issues.

  **QA Scenarios**:
  ```text
  Scenario: support routes are discoverable
    Tool: tmux
    Steps: run `rg -n "onboarding failure|official docs mismatch|replay failure|handoff validation|support route|good first issue|help wanted" docs .github/ISSUE_TEMPLATE`
    Expected: each failure mode has a documented route
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t7-support-routes.txt

  Scenario: no private-data request
    Tool: tmux
    Steps: run `rg -n "paste.*token|paste.*secret|private key|credential" docs .github/ISSUE_TEMPLATE`
    Expected: no unsafe request wording; allowed wording only says not to include secrets
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t7-secret-safety.txt
  ```

  **Commit**: YES | Message: `docs(service): connect support operations` | Files: support docs/templates updates

- [ ] 9. Product Loop and Strategy Review

  **What to do**: Add `docs/SERVICE_STRATEGY_REVIEW.md` that defines the first user, activation moment, repeat triggers, retention loop, distribution motion, and metric ladder. The review should state why the current state is `service-pilot-ready` and what blocks `service-ready`.

  **Must NOT do**: Do not claim external adoption, retention, or traction without public evidence.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: T10 | Blocked By: T1-T8

  **References**:
  - `docs/SERVICE_LOOP.md`
  - `docs/OPERATING_METRICS.md`
  - `docs/SERVICE_READINESS.md`

  **Acceptance Criteria**:
  - [ ] First ICP is specific.
  - [ ] Activation moment is defined as a user outcome.
  - [ ] Repeat triggers include PR, release, AI contribution, external replay, official-docs change, and readiness gap change.
  - [ ] Metrics include time-to-first-readiness-delta and readiness delta count.
  - [ ] Distribution is artifact-led, not dashboard-led.

  **QA Scenarios**:
  ```text
  Scenario: product loop review is complete
    Tool: tmux
    Steps: run `rg -n "First User|Activation Moment|Repeat Triggers|Retention Loop|Distribution Motion|Metrics Ladder|time-to-first-readiness-delta|readiness delta" docs/SERVICE_STRATEGY_REVIEW.md`
    Expected: every product loop concept appears
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t9-product-loop-review.txt

  Scenario: no adoption overclaim
    Tool: tmux
    Steps: run `rg -n "adoption proven|retention proven|market traction|users acquired" docs/SERVICE_STRATEGY_REVIEW.md docs/OPERATING_METRICS.md`
    Expected: no unsupported positive claims; any match appears only in guardrails or non-goals
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t9-no-overclaim.txt
  ```

  **Commit**: YES | Message: `docs(service): add product loop strategy review` | Files: `docs/SERVICE_STRATEGY_REVIEW.md`, `docs/SERVICE_LOOP.md`, `docs/OPERATING_METRICS.md`, `docs/SERVICE_READINESS.md`

- [ ] 10. Final Service Audit

  **What to do**: Add or update `docs/SERVICE_READINESS.md` and update README to link service loop, onboarding, replay, handoff validation, metrics, and strategy review. State current level precisely: `service-pilot-ready`, `blocked`, or `ready`.

  **Must NOT do**: Do not claim production service readiness if product-readiness remains blocked by npm/public release evidence.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: service claim | Blocked By: T1-T7

  **References**:
  - `docs/PRODUCT_READINESS.md`
  - `docs/SERVICE_LOOP.md`
  - `docs/ONBOARDING.md`
  - `docs/EXTERNAL_REPLAY.md`
  - `docs/HANDOFF_VALIDATION.md`
  - `docs/OPERATING_METRICS.md`
  - `docs/SERVICE_STRATEGY_REVIEW.md`

  **Acceptance Criteria**:
  - [ ] Service readiness doc links every service artifact and product strategy review.
  - [ ] README has a concise service loop section.
  - [ ] Current status is honest and evidence-backed.
  - [ ] Final QA evidence captures onboarding, replay, handoff, metrics, readiness output.

  **QA Scenarios**:
  ```text
  Scenario: final service docs are discoverable
    Tool: tmux
    Steps: run `rg -n "SERVICE_LOOP|ONBOARDING|EXTERNAL_REPLAY|HANDOFF_VALIDATION|OPERATING_METRICS|SERVICE_STRATEGY_REVIEW|SERVICE_READINESS" README.md docs/SERVICE_READINESS.md`
    Expected: every artifact is linked
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t8-discoverability.txt

  Scenario: readiness status is honest
    Tool: tmux
    Steps: run `bun bin/boulder.ts service-readiness --json && bun bin/boulder.ts product-readiness --json`
    Expected: service status does not exceed product evidence; product-readiness remains honest
    Evidence: .omo/ulw-loop/evidence/service-level-workflow/t8-readiness-honesty.txt
  ```

  **Commit**: YES | Message: `docs(service): add service readiness audit` | Files: `docs/SERVICE_READINESS.md`, README/docs links

## Final Verification Wave
> ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. Plan Compliance Audit
  - Confirm onboarding, official-docs ingestion, external replay, handoff validation, and metrics each have docs, tests or static checks, and tmux evidence.

- [ ] F2. Code Quality Review
  - Run `bun test`.
  - Run `bun run ci`.
  - Run new focused tests such as `bun test test/handoff-validation.test.ts test/service-readiness.test.ts` if implemented.

- [ ] F3. Real Manual QA
  - Capture tmux evidence for:
    - clean onboarding
    - official docs evidence
    - replay manifest validation
    - handoff validation
    - operating metrics checks
    - service-readiness output
  - Kill every tmux session and record cleanup receipts.

- [ ] F4. Scope Fidelity Check
  - Confirm no hosted SaaS, provider runtime, credential handling, fake adoption, or fake npm publish claim was introduced.

## Commit Strategy

Suggested commits:

1. `docs(service): define boulder service loop`
2. `docs(service): add five minute onboarding`
3. `docs(service): require official docs for public oss replay`
4. `docs(service): add external replay workflow`
5. `feat(service): validate handoff artifacts`
6. `feat(service): add service readiness gate`
7. `docs(service): define operating metrics`
8. `docs(service): connect support operations`
9. `docs(service): add product loop strategy review`
10. `docs(service): add service readiness audit`

Do not auto-commit unless explicitly approved.

## Success Criteria

- A new maintainer can complete the documented onboarding loop without private context.
- At least one external public replay path is documented and validated.
- Every attached public OSS target has official documentation sources captured before replay or handoff optimization.
- GJC/LazyCodex handoff artifacts are mechanically validated.
- Operating metrics are defined without adoption overclaiming.
- Activation, repeat trigger, retention loop, and artifact-led distribution are defined.
- Service readiness is reported separately from product readiness.
- Boulder can claim `service-pilot-ready` only with evidence, and `service-ready` only after product/public release gates also pass.
