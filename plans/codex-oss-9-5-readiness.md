# Codex OSS 9.5 Readiness Plan

## TL;DR
> **Summary**: Raise Boulder from a credible local OSS maintainer CLI to a 9.5+ Codex for OSS application candidate by proving public maintainer workflow value, not by adding runtime complexity. The target structure is Boulder as evidence harness, GJC as planning/review lane, LazyCodex as implementation lane, and public case studies as proof.
> **Deliverables**:
> - 9.5 scoring rubric mapped to official Codex for OSS criteria
> - release-clean public CLI package
> - public case-study evidence across PR review, maintainer automation, release workflow, and core OSS work
> - GJC planning and LazyCodex implementation handoff evidence
> - application packet with claims, limitations, screenshots/transcripts, and source links
> - rejection-safe boundary docs showing Boulder is not a runtime launcher
> **Effort**: XL
> **Parallel**: YES - 6 waves
> **Critical Path**: T1 rubric -> T2 release hygiene -> T3 M9 evidence -> T4 handoff contract -> T6 case-study selection -> T7/T8/T9 public runs -> T11 application packet -> T12 final review

## Context

### Original Request

Develop a ULW plan that gets Boulder into a structure capable of credibly scoring 9.5+ for Codex for OSS support.

### Interview Summary

No user question is blocking. The direction is confirmed:

- Boulder should not become a generic agent runtime.
- Boulder should be the evidence-backed OSS maintainer operator kit.
- GJC should plan and review ambiguous work.
- LazyCodex should implement from the GJC-approved plan.
- External OSS should be used narrowly as reference or handoff target.
- The application should argue Codex maintainer workflow value with public evidence.

### Research Findings

- Official Codex for OSS support includes ChatGPT Pro with Codex, conditional Codex Security access, and API credits for projects using Codex in pull request review, maintainer automation, release workflows, or other core OSS work.
- Official source URL: `https://developers.openai.com/community/codex-for-oss` accessed 2026-06-11.
- Current Boulder evidence is strong for CLI surface and workflow contracts, but weak for public adoption, repeatable case studies, and release-ready packaging.
- The existing product readiness plan already identifies core blockers: duplicate package artifacts, version drift, M9 export/release evidence, case-study workflow, support/security posture, and final release packet.
- The OSS usage decision correctly limits near-term active integrations to GJC and LazyCodex.

### Metis Review (gaps addressed)

Metis found 29 gaps. This plan resolves them with these decisions:

- 9.5+ is a local application-readiness score, not a guarantee of OpenAI acceptance.
- The score has hard gates: public evidence, release hygiene, safety boundary, support/security posture, and three case studies. Any hard-gate failure caps the score below 9.0.
- `classify` means the existing `pipeline` friction classification surface unless a later task explicitly adds a command.
- The optimized artifact is the application packet plus public evidence, not a hosted service or runtime manager.
- Public fixture repos may support testing, but the final 9.5 target requires at least two externally inspectable public repo or public artifact case studies.
- GJC and LazyCodex remain file-based handoff lanes. Boulder core must not invoke them.
- Superpowers, GStack, and Compound remain required operator workflow contracts inside Boulder-generated harnesses; they are not active external OSS integrations or runtime dependencies.
- Release-plan currently checks old workflow-stack evidence; product-readiness must add GJC/LazyCodex evidence rather than weakening existing stack checks.
- Bad tag, bad npm publish, stale evidence, dirty tree, and concurrent doc writes need explicit rollback or blocking policy.

## Work Objectives

### Core Objective

Create a public, evidence-backed application structure where Boulder demonstrates concrete Codex value for OSS maintainers across review, triage, release, and implementation workflows.

### 9.5 Scoring Model

| Dimension | Weight | 9.5+ requirement |
| --- | ---: | --- |
| Official program fit | 20 | Explicitly maps Boulder evidence to PR review, maintainer automation, release workflow, and core OSS work. |
| Public OSS credibility | 15 | Public repo, MIT license, installable package path, clean README, issue/support/security posture. |
| Repeatable workflow proof | 20 | Three public case-study runs with before/after evidence and reproducible commands. |
| Codex-specific value | 15 | Shows Codex-heavy workflows become safer through planning, implementation handoff, and evidence gates. |
| Product readiness | 10 | Clean package, version truth, no duplicate artifacts, CI pass, manual QA transcripts. |
| Safety and boundaries | 10 | No provider calls, credentials, background runtime, or autonomous launch in core. |
| Narrative quality | 10 | Application packet is concise, honest, specific, and backed by links. |

9.5+ target: each dimension scores at least 9/10, with no safety/product dimension below 9.5.

Hard blockers that cap the score below 9.0 regardless of weighted total:

- CLI version differs from `package.json`.
- package dry run includes duplicate `* 2.*` files.
- M9 export/release evidence is missing.
- No product-readiness gate blocks missing GJC plan or LazyCodex implementation evidence.
- Fewer than three case studies exist, or fewer than two are externally inspectable public repo/artifact studies.
- Application packet contains unsupported acceptance, adoption, runtime-scale, or security-access claims.
- Support/security posture is not public.
- Core commands launch providers, require credentials, or invoke external agent runtimes.

### Deliverables

- `docs/CODEX_OSS_APPLICATION_PACKET.md`
- `docs/CODEX_OSS_SCORECARD.md`
- `docs/CASE_STUDIES/` with three public workflow reports
- `docs/GJC_LAZYCODEX_HANDOFF.md`
- product-readiness gate or scorecard extension that blocks missing plan/implementation evidence
- updated `docs/APPLICATION_EVIDENCE.md`
- release-clean package evidence
- final application checklist

### Definition of Done

- `bun test` passes.
- `bun run ci` passes.
- `bun pm pack --dry-run --ignore-scripts` excludes duplicate `* 2` files.
- `bun bin/boulder.ts --version` matches `package.json`.
- Three public case-study reports exist and include exact commands, outputs, before/after, and limitations.
- Application packet maps every major claim to a local file or public source.
- Product scorecard rates Boulder 9.5+ by the plan's rubric.
- No claim depends only on private repo evidence.

### Must Have

- Public evidence over private confidence.
- GJC planning lane and LazyCodex implementation lane.
- Existing Superpowers/GStack/Compound workflow-stack evidence preserved as required harness contracts.
- Official program-fit framing.
- Release hygiene.
- Safety boundaries.
- Case-study repeatability.
- Korean and English summary material.
- Dirty-tree, generated-doc overwrite, and rollback policies.

### Must NOT Have

- No runtime launcher.
- No provider SDK call.
- No credential handling.
- No hosted-service claim.
- No benchmark leaderboard claim.
- No adoption claim borrowed from external OSS.
- No full subagent catalog or harness-manager runtime copy.
- No weakening existing release-plan checks for Superpowers/GStack/Compound.

## Verification Strategy

> ZERO HUMAN INTERVENTION - all verification is agent-executed.

- Test decision: TDD for production changes; docs-only tasks use static assertions and tmux QA.
- Framework: Bun test for CLI/source changes.
- Manual QA channel: tmux for CLI/package/application-packet checks.
- Evidence root: `.omo/ulw-loop/evidence/codex-oss-9-5/`.
- Every case study must include command transcript, generated files, operator conclusion, and limitation note.

## Execution Strategy

### Parallel Execution Waves

Wave 1: Scoring rubric, release hygiene, official criteria mapping.

Wave 2: M9 evidence and GJC/LazyCodex handoff contract.

Wave 3: Public case-study selection and fixture preparation.

Wave 4: Three public case-study runs.

Wave 5: Application packet, Korean/English narrative, support/security posture.

Wave 6: Final score audit, Momus review, release/application decision.

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
| --- | --- | --- | --- |
| T1 9.5 rubric | none | T10, T12 | T2 |
| T2 Release hygiene | none | T3, T10, T12 | T1 |
| T3 M9 evidence integration | T2 | T4, T10 | none |
| T4 GJC/LazyCodex handoff contract | T1, T3 | T7, T8, T9, T10 | T5 |
| T5 Official criteria narrative map | T1 | T10, T11 | T4 |
| T6 Public case-study selection | T1 | T7, T8, T9 | T3 |
| T7 Case study: PR review workflow | T4, T6 | T10 | T8, T9 |
| T8 Case study: release workflow | T4, T6 | T10 | T7, T9 |
| T9 Case study: core OSS implementation | T4, T6 | T10 | T7, T8 |
| T10 Product readiness gate and application evidence packet | T5, T7, T8, T9 | T12 | T11 |
| T11 Support/security/public trust | T2, T5 | T12 | T10 |
| T12 Final 9.5 audit and submission gate | T1-T11 | submission | none |

## TODOs

- [ ] 1. Define 9.5+ Codex OSS Rubric

  **What to do**:
  - Create `docs/CODEX_OSS_SCORECARD.md`.
  - Encode the seven weighted dimensions from this plan.
  - Add scoring rules that fail if any claim lacks evidence.
  - Add hard blockers that cap score below 9.0.
  - Add a current-state row and a target-state row.

  **Must NOT do**:
  - Do not claim actual acceptance probability.
  - Do not count private-only evidence toward public proof.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: T4, T5, T10, T12 | Blocked By: none

  **References**:
  - `docs/APPLICATION_EVIDENCE.md` - current application proof.
  - `plans/product-service-readiness.md` - current blockers and product gates.
  - Official Codex for OSS page: `https://developers.openai.com/community/codex-for-oss` accessed 2026-06-11 - support categories and eligibility language.

  **Acceptance Criteria**:
  - [ ] Scorecard has seven dimensions, weights sum to 100.
  - [ ] Every 9.5 requirement has a measurable evidence rule.
  - [ ] Hard blockers are listed and include release hygiene, public case studies, safety boundary, product-readiness evidence, and support/security posture.
  - [ ] Current score is lower than target and names exact gaps.

  **QA Scenarios**:
  ```text
  Scenario: Scorecard evidence completeness
    Tool: tmux
    Steps: run `rg -n "Official program fit|Public OSS credibility|Repeatable workflow proof|Codex-specific value|Product readiness|Safety and boundaries|Narrative quality" docs/CODEX_OSS_SCORECARD.md`
    Expected: all seven dimensions appear exactly as rubric headings or rows
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t1-scorecard-dimensions.txt

  Scenario: No unsupported acceptance claim
    Tool: tmux
    Steps: run `rg -n "guaranteed|will be accepted|certain|100%" docs/CODEX_OSS_SCORECARD.md docs/CODEX_OSS_APPLICATION_PACKET.md || true`
    Expected: no unsupported guarantee language appears
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t1-no-guarantee.txt
  ```

  **Commit**: YES | Message: `docs(application): define codex oss scorecard` | Files: `docs/CODEX_OSS_SCORECARD.md`

- [ ] 2. Make Release Surface Public-Clean

  **What to do**:
  - Execute the release hygiene tasks from `plans/product-service-readiness.md`.
  - Remove or classify duplicate `* 2` files before packaging.
  - Align CLI version with `package.json`.
  - Ensure README, release plan, package metadata, and application evidence agree.
  - Preserve existing Superpowers/GStack/Compound checks as workflow-contract evidence.

  **Must NOT do**:
  - Do not publish npm or create tags automatically.
  - Do not delete divergent duplicate files before inspecting them.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: T3, T10, T12 | Blocked By: none

  **References**:
  - `package.json`
  - `src/cli.ts`
  - `README.md`
  - `docs/APPLICATION_EVIDENCE.md`
  - `plans/product-service-readiness.md` T1-T2.

  **Acceptance Criteria**:
  - [ ] `bun bin/boulder.ts --version` equals package version.
  - [ ] package dry run excludes duplicate files.
  - [ ] release-facing docs agree on held/released status.
  - [ ] release-plan still verifies Superpowers/GStack/Compound workflow-stack evidence.

  **QA Scenarios**:
  ```text
  Scenario: Version truth
    Tool: tmux
    Steps: run `bun bin/boulder.ts --version`; run `node -p "require('./package.json').version"`
    Expected: outputs match exactly
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t2-version-truth.txt

  Scenario: Package cleanliness
    Tool: tmux
    Steps: run `bun pm pack --dry-run --ignore-scripts`; search output for ` 2.`
    Expected: no duplicate `* 2` artifact appears
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t2-pack-clean.txt
  ```

  **Commit**: YES | Message: `fix(release): clean public package surface` | Files: release-facing source/docs/tests as needed

- [ ] 3. Complete M9 Evidence Integration

  **What to do**:
  - Complete export and release-plan integration for the pipeline surface.
  - Ensure default medium pipeline appears in export.
  - Ensure high-friction CSO/QA path remains visible through `boulder pipeline --friction high`.

  **Must NOT do**:
  - Do not add runtime launch.
  - Do not change `PipelinePlan` JSON shape without explicit migration.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T4, T10, T12 | Blocked By: T2

  **References**:
  - `plans/m9-pipeline-evidence-integration.md`
  - `src/pipeline.ts`
  - `src/export.ts`
  - `src/release-plan.ts`
  - `test/cli.test.ts`
  - `test/cli-e2e.test.ts`

  **Acceptance Criteria**:
  - [ ] Export includes `## Operator Pipeline`.
  - [ ] `release-plan --json` includes pipeline planning evidence.
  - [ ] high-friction JSON still includes `cso-qa`.

  **QA Scenarios**:
  ```text
  Scenario: Export contains medium pipeline evidence
    Tool: tmux
    Steps: create temp repo; run `bun bin/boulder.ts init --cwd <tmp>`; run `bun bin/boulder.ts export --cwd <tmp> --force`; print `<tmp>/docs/BOULDER_EXPORT.md`
    Expected: output includes `## Operator Pipeline`, `friction: medium`, and `fail-closed: true`
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t3-export-pipeline.txt

  Scenario: High-friction path remains visible
    Tool: tmux
    Steps: run `bun bin/boulder.ts pipeline --friction high --json`
    Expected: JSON includes stage id `cso-qa`
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t3-high-friction-csoqa.txt
  ```

  **Commit**: YES | Message: `feat(evidence): integrate pipeline into release proof` | Files: `src/export.ts`, `src/release-plan.ts`, tests/docs as needed

- [ ] 4. Define GJC Planning to LazyCodex Implementation Contract

  **What to do**:
  - Create `docs/GJC_LAZYCODEX_HANDOFF.md`.
  - Define exact handoff packet fields from Boulder to GJC.
  - Define exact approved-plan fields from GJC to LazyCodex.
  - Define evidence fields LazyCodex must return to Boulder.
  - Include rejection rules for plan drift.
  - Define fail states for missing GJC evidence, missing LazyCodex evidence, failed verification, stale release docs, and dirty package contents.

  **Must NOT do**:
  - Do not require GJC or LazyCodex as installed dependencies.
  - Do not launch GJC or LazyCodex from core commands.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: T7, T8, T9, T10 | Blocked By: T1, T3

  **References**:
  - `docs/OPEN_SOURCE_USAGE_DECISION.md`
  - `plans/product-service-readiness.md` Executor Architecture.
  - `docs/FOLLOW_UP_BRIEFING.md` LazyCodex acceptance gate.

  **Acceptance Criteria**:
  - [ ] Contract names Boulder, GJC, and LazyCodex responsibilities separately.
  - [ ] Contract includes plan-drift return path.
  - [ ] Contract includes required evidence fields.
  - [ ] Contract includes input schema, output schema, rejection criteria, and evidence paths for both lanes.

  **QA Scenarios**:
  ```text
  Scenario: Handoff contract completeness
    Tool: tmux
    Steps: run `rg -n "Boulder|GJC|LazyCodex|plan drift|evidence|input schema|output schema|rejection" docs/GJC_LAZYCODEX_HANDOFF.md`
    Expected: all responsibility and evidence sections exist
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t4-handoff-contract.txt

  Scenario: No runtime dependency promise
    Tool: tmux
    Steps: run `rg -n "install GJC|required dependency|launch LazyCodex|runtime dependency" docs/GJC_LAZYCODEX_HANDOFF.md || true`
    Expected: no mandatory runtime dependency claim appears
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t4-no-runtime-dependency.txt
  ```

  **Commit**: YES | Message: `docs(handoff): define gjc to lazycodex contract` | Files: `docs/GJC_LAZYCODEX_HANDOFF.md`

- [ ] 5. Map Official Codex OSS Criteria to Boulder Claims

  **What to do**:
  - Create an application criteria map inside `docs/CODEX_OSS_APPLICATION_PACKET.md`.
  - Map Boulder evidence to PR review, maintainer automation, release workflows, and core OSS work.
  - Include a limitation row for what Boulder does not yet prove.

  **Must NOT do**:
  - Do not overstate user adoption.
  - Do not imply OpenAI endorsement.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: T10, T12 | Blocked By: T1

  **References**:
  - Official Codex for OSS page: `https://developers.openai.com/community/codex-for-oss` accessed 2026-06-11.
  - `docs/APPLICATION_EVIDENCE.md`
  - `README.md`

  **Acceptance Criteria**:
  - [ ] Packet includes all four official use categories.
  - [ ] Every claim links to a repo file, case study, or public source.
  - [ ] Limitations are explicit.

  **QA Scenarios**:
  ```text
  Scenario: Official categories are present
    Tool: tmux
    Steps: run `rg -n "pull request review|maintainer automation|release workflow|core OSS work" docs/CODEX_OSS_APPLICATION_PACKET.md`
    Expected: all four categories appear with evidence links
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t5-official-categories.txt

  Scenario: Limitations are visible
    Tool: tmux
    Steps: run `rg -n "Limitations|Does not claim|Not yet proven" docs/CODEX_OSS_APPLICATION_PACKET.md`
    Expected: limitation section exists
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t5-limitations.txt
  ```

  **Commit**: YES | Message: `docs(application): map codex oss criteria` | Files: `docs/CODEX_OSS_APPLICATION_PACKET.md`

- [ ] 6. Select Public Case Study Repositories

  **What to do**:
  - Select three public repos or public fixture repos:
    - PR review workflow repo.
    - release workflow repo.
    - core implementation workflow repo.
  - Prefer repos where the operator can legally publish generated evidence.
  - Require at least two externally inspectable public repo or public artifact studies for the 9.5 target.
  - Define exact commands and expected outputs before running.

  **Must NOT do**:
  - Do not rely on private repos as primary evidence.
  - Do not select repos requiring credentials for proof.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: T7, T8, T9 | Blocked By: T1

  **References**:
  - `examples/typescript-library`
  - `examples/python-package`
  - `examples/mcp-server`
  - `docs/COMPETITIVE_BENCHMARK_HARNESS_MANAGER.md` fixture strategy.

  **Acceptance Criteria**:
  - [ ] Three case-study targets are named with URLs or local public fixture paths.
  - [ ] Each case study maps to one official Codex for OSS use category.
  - [ ] Each case study has a reproducible command script or transcript plan.
  - [ ] At least two selected studies are externally inspectable public repo or public artifact studies.

  **QA Scenarios**:
  ```text
  Scenario: Case study matrix completeness
    Tool: tmux
    Steps: run `rg -n "PR review|release workflow|core implementation|Repository|Commands" docs/CASE_STUDIES/README.md`
    Expected: matrix includes three named targets and command plans
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t6-case-study-matrix.txt

  Scenario: No private-only proof
    Tool: tmux
    Steps: run `rg -n "private repo|internal only|cannot publish" docs/CASE_STUDIES/README.md || true`
    Expected: no selected primary case study depends on private-only proof
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t6-no-private-proof.txt
  ```

  **Commit**: YES | Message: `docs(cases): select public codex oss case studies` | Files: `docs/CASE_STUDIES/README.md`

- [ ] 7. Case Study: PR Review Workflow

  **What to do**:
  - Run Boulder against the selected PR-review target.
  - Generate repo brief, provider policy, verification gates, pipeline plan, and export.
  - Show how Codex can use the output to perform safer PR review.
  - Record before/after evidence and unresolved risks.

  **Must NOT do**:
  - Do not claim Boulder reviewed the PR by itself.
  - Do not require external credentials.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: T10, T12 | Blocked By: T4, T6

  **References**:
  - `docs/CASE_STUDIES/README.md`
  - `docs/BOULDER_EXPORT.md`
  - `docs/CODEX_WORKFLOW_NOTES.md`

  **Acceptance Criteria**:
  - [ ] Report includes exact commands and generated files.
  - [ ] Report maps output to PR review preparation.
  - [ ] Report includes limitations and next action.

  **QA Scenarios**:
  ```text
  Scenario: PR review case report completeness
    Tool: tmux
    Steps: run `rg -n "Commands|Generated files|PR review|Limitations|Next action" docs/CASE_STUDIES/pr-review.md`
    Expected: all report sections exist
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t7-pr-review-report.txt

  Scenario: Generated export exists
    Tool: tmux
    Steps: run `test -f docs/CASE_STUDIES/evidence/pr-review/BOULDER_EXPORT.md && sed -n '1,120p' docs/CASE_STUDIES/evidence/pr-review/BOULDER_EXPORT.md`
    Expected: export exists and contains maintainer workflow notes
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t7-pr-review-export.txt
  ```

  **Commit**: YES | Message: `docs(cases): record pr review workflow evidence` | Files: `docs/CASE_STUDIES/pr-review.md`, case evidence files

- [ ] 8. Case Study: Release Workflow

  **What to do**:
  - Run Boulder against the selected release-workflow target.
  - Produce release-plan evidence and package/release boundary notes.
  - Show how Codex can assist release work without automating publication.

  **Must NOT do**:
  - Do not publish packages or create tags.
  - Do not claim autonomous release safety.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: T10, T12 | Blocked By: T4, T6

  **References**:
  - `src/release-plan.ts`
  - `docs/RELEASE_PLAN.md`
  - `docs/CASE_STUDIES/README.md`

  **Acceptance Criteria**:
  - [ ] Report includes release readiness output.
  - [ ] Report documents manual publish boundary.
  - [ ] Report maps to official release workflow category.

  **QA Scenarios**:
  ```text
  Scenario: Release case report completeness
    Tool: tmux
    Steps: run `rg -n "release workflow|release-plan|manual publish|Limitations|Evidence" docs/CASE_STUDIES/release-workflow.md`
    Expected: required release sections exist
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t8-release-report.txt

  Scenario: No publish side effect
    Tool: tmux
    Steps: run `rg -n "npm publish|git tag|gh release create" docs/CASE_STUDIES/release-workflow.md`
    Expected: publish/tag commands appear only as forbidden or manual-boundary examples
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t8-no-publish-side-effect.txt
  ```

  **Commit**: YES | Message: `docs(cases): record release workflow evidence` | Files: `docs/CASE_STUDIES/release-workflow.md`, case evidence files

- [ ] 9. Case Study: Core OSS Implementation Workflow

  **What to do**:
  - Run the staged flow on a bounded public implementation task.
  - Use Boulder to classify/export.
  - Use GJC-style planning evidence or a documented simulated GJC packet if GJC is not installed.
  - Use LazyCodex-style implementation evidence or a documented PR handoff if LazyCodex is handled in a separate agent.
  - Record how the plan prevented scope creep.

  **Must NOT do**:
  - Do not fake implementation evidence.
  - Do not hide unresolved risk.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: T10, T12 | Blocked By: T4, T6

  **References**:
  - `docs/OPEN_SOURCE_USAGE_DECISION.md`
  - `docs/FOLLOW_UP_BRIEFING.md`
  - `docs/GJC_LAZYCODEX_HANDOFF.md`

  **Acceptance Criteria**:
  - [ ] Report includes Boulder, GJC, LazyCodex, and Boulder verification stages.
  - [ ] Report includes scope-control evidence.
  - [ ] Report maps to core OSS work.

  **QA Scenarios**:
  ```text
  Scenario: Core implementation case report completeness
    Tool: tmux
    Steps: run `rg -n "Boulder classify|GJC plan|LazyCodex implement|Boulder verify|scope creep|core OSS work" docs/CASE_STUDIES/core-implementation.md`
    Expected: staged workflow and category mapping exist
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t9-core-implementation-report.txt

  Scenario: Unresolved risk is explicit
    Tool: tmux
    Steps: run `rg -n "Unresolved risk|Limitation|Follow-up" docs/CASE_STUDIES/core-implementation.md`
    Expected: report includes risks or explicitly says none found with evidence
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t9-risk-explicit.txt
  ```

  **Commit**: YES | Message: `docs(cases): record core oss implementation evidence` | Files: `docs/CASE_STUDIES/core-implementation.md`, case evidence files

- [ ] 10. Add Product Readiness Gate and Assemble Codex OSS Application Packet

  **What to do**:
  - Add or update a product-readiness gate that blocks missing GJC plan evidence and LazyCodex implementation evidence.
  - Ensure the gate is separate from package-release readiness.
  - Complete `docs/CODEX_OSS_APPLICATION_PACKET.md`.
  - Include one-line project description, maintainer problem, Codex usage, evidence links, public repo/package links, limitations, and ask.
  - Add Korean summary for operator clarity.
  - Update `docs/APPLICATION_EVIDENCE.md` to point to the packet and case studies.

  **Must NOT do**:
  - Do not overstate adoption, benchmark scale, or guaranteed support.
  - Do not bury limitations.

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: T12 | Blocked By: T5, T7, T8, T9

  **References**:
  - `docs/APPLICATION_EVIDENCE.md`
  - `docs/CODEX_OSS_SCORECARD.md`
  - `docs/CASE_STUDIES/*.md`
  - Official Codex for OSS page: `https://developers.openai.com/community/codex-for-oss` accessed 2026-06-11.

  **Acceptance Criteria**:
  - [ ] Product-readiness gate blocks if GJC plan evidence is missing.
  - [ ] Product-readiness gate blocks if LazyCodex implementation evidence is missing.
  - [ ] Packet is complete enough to paste into the application form with light editing.
  - [ ] Every evidence claim has a file path or URL.
  - [ ] Korean summary exists and matches English claims.

  **QA Scenarios**:
  ```text
  Scenario: Application packet completeness
    Tool: tmux
    Steps: run `rg -n "Project|Maintainer problem|Codex usage|Evidence|Limitations|Ask|한국어" docs/CODEX_OSS_APPLICATION_PACKET.md`
    Expected: all packet sections exist
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t10-packet-complete.txt

  Scenario: Product readiness blocks missing handoff evidence
    Tool: tmux
    Steps: create temp repo; run `bun bin/boulder.ts init --cwd <tmp>`; run `bun bin/boulder.ts product-readiness --cwd <tmp> --json`
    Expected: readiness status is blocked with separate missing-plan and missing-implementation reasons
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t10-readiness-blocks-missing-handoff.txt

  Scenario: Claims are evidence-linked
    Tool: tmux
    Steps: run `awk '/^- / && ($0 ~ /(supports|proves|demonstrates|enables|improves|reduces|prevents)/) && ($0 !~ /(docs\\/|README\\.md|https:\\/\\/|CASE_STUDIES|package\\.json|src\\/|test\\/)/) { print }' docs/CODEX_OSS_APPLICATION_PACKET.md`
    Expected: no major claim lacks an evidence pointer
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t10-evidence-links.txt
  ```

  **Commit**: YES | Message: `feat(readiness): gate codex oss application evidence` | Files: product-readiness source/tests if needed, `docs/CODEX_OSS_APPLICATION_PACKET.md`, `docs/APPLICATION_EVIDENCE.md`

- [ ] 11. Public Trust, Support, and Security Posture

  **What to do**:
  - Add or update public support/security notes.
  - Define issue intake, vulnerability handling, maintainer response expectations, and security boundary.
  - Explain that Boulder does not handle credentials or run providers.
  - Add rollback notes for bad tag, bad npm publish, stale application evidence, and generated-doc overwrite mistakes.
  - Add dirty-tree and concurrent write policy for generated evidence/doc files.

  **Must NOT do**:
  - Do not promise enterprise support.
  - Do not imply Codex Security access is already granted.

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: T12 | Blocked By: T2, T5

  **References**:
  - `docs/OPEN_SOURCE_USAGE_DECISION.md`
  - `docs/PROVIDER_POLICY.md`
  - `docs/APPLICATION_EVIDENCE.md`

  **Acceptance Criteria**:
  - [ ] Support path is documented.
  - [ ] Vulnerability handling path is documented.
  - [ ] Security boundary is explicit.
  - [ ] Rollback policy is documented.
  - [ ] Dirty-tree and concurrent write policy is documented.

  **QA Scenarios**:
  ```text
  Scenario: Public trust docs are present
    Tool: tmux
    Steps: run `rg -n "support|vulnerability|security boundary|credentials|provider" README.md docs`
    Expected: support/security posture is findable from public docs
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t11-public-trust-docs.txt

  Scenario: No granted-security claim
    Tool: tmux
    Steps: run `rg -n "Codex Security.*granted|already approved|access granted" README.md docs || true`
    Expected: no claim says Codex Security access is already granted
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t11-no-security-overclaim.txt
  ```

  **Commit**: YES | Message: `docs(security): define public trust posture` | Files: support/security docs as needed

- [ ] 12. Final 9.5 Audit and Submission Gate

  **What to do**:
  - Re-score Boulder using `docs/CODEX_OSS_SCORECARD.md`.
  - Run full CI and package dry run.
  - Verify all case-study evidence exists.
  - Run Momus high-accuracy review on this plan and application packet.
  - Produce final go/no-go note.

  **Must NOT do**:
  - Do not submit if any product/safety dimension is below 9.5.
  - Do not submit if public evidence is missing.

  **Parallelization**: Can Parallel: NO | Wave 6 | Blocks: submission | Blocked By: T1-T11

  **References**:
  - `docs/CODEX_OSS_SCORECARD.md`
  - `docs/CODEX_OSS_APPLICATION_PACKET.md`
  - `docs/CASE_STUDIES/`
  - `plans/product-service-readiness.md`

  **Acceptance Criteria**:
  - [ ] `bun run ci` passes.
  - [ ] package dry run is clean.
  - [ ] scorecard result is 9.5+ with no unsupported claim.
  - [ ] final go/no-go note says submit, hold, or revise with reasons.

  **QA Scenarios**:
  ```text
  Scenario: Final verification command set
    Tool: tmux
    Steps: run `bun run ci`; run `bun pm pack --dry-run --ignore-scripts`; run static scans named in T1-T11
    Expected: all commands pass and evidence files are captured
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t12-final-verification.txt

  Scenario: Final go/no-go is explicit
    Tool: tmux
    Steps: run `rg -n "GO|NO-GO|HOLD|Reason|Score" docs/CODEX_OSS_APPLICATION_PACKET.md docs/CODEX_OSS_SCORECARD.md`
    Expected: final submission decision and score rationale are explicit
    Evidence: .omo/ulw-loop/evidence/codex-oss-9-5/t12-go-no-go.txt
  ```

  **Commit**: YES | Message: `docs(application): finalize codex oss submission gate` | Files: final application docs/evidence

## Final Verification Wave

> ALL must APPROVE. Present consolidated results to user and get explicit okay before completing execution.

- [ ] F1. Plan Compliance Audit: every task has references, acceptance criteria, QA scenarios, and commit guidance.
- [ ] F2. Evidence Audit: every application claim has a local file path or public URL.
- [ ] F3. Safety Audit: no runtime/provider/credential claim slipped into core.
- [ ] F4. Score Audit: 9.5+ score is justified by public evidence, not ambition.
- [ ] F5. Momus Review: run high-accuracy plan review before execution.

## Commit Strategy

- Use Conventional Commits.
- Keep each task atomic.
- Do not auto-publish, auto-tag, or auto-submit.
- Final implementation commit footer should include `Plan: plans/codex-oss-9-5-readiness.md`.

## Success Criteria

- Boulder has a public, link-backed Codex OSS application packet.
- The package/release surface is clean.
- M9 evidence integration is complete.
- Three public case studies prove maintainer workflow value.
- GJC and LazyCodex handoff roles are documented without runtime dependency.
- Support/security posture is public and honest.
- The final scorecard reaches 9.5+ without unsupported claims.
