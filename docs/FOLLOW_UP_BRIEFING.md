# Follow-up Briefing

Status: active handoff
Owner split: parent thread owns product strategy and acceptance gates; LazyCodex owns development execution.

## One-line Project Description

Boulder turns OSS repositories into evidence-backed Codex operator harnesses.

## Current State

- Public repository: `min9lin9/boulder`
- Package name: `boulder-oss-cli`
- Current release track: `v0.1.7`
- Current CLI surface: `init`, `inspect`, `validate`, `verify`, `scorecard`, `benchmark`, `release-plan`, and `export`
- Latest merged engineering pass: PR #12 tightened CLI regression coverage, cleanup safety, manual QA evidence, LSP evidence, and static gate evidence.
- Product direction: move from a harness-document generator toward an executable operator workflow system.

## Development Agent Lane

LazyCodex owns the next development slice.

The next slice should make the friction-scaled operating pipeline visible or executable from the CLI without destabilizing the existing CLI surface:

1. classification
2. Deep Interview
3. PM debate
4. Synthesizer
5. CSO/QA

The implementation should keep the first slice narrow. Prefer a typed model plus CLI rendering or export integration before adding long-running orchestration.

## As-is / To-be

| Area | As-is | To-be |
| --- | --- | --- |
| Product shape | Harness document generator with verification evidence | Executable or inspectable operator workflow system |
| Core pipeline | Pipeline exists as product strategy and docs | Pipeline exists as typed model, CLI output, and tests |
| Friction handling | Friction is captured in intent and planning language | Low, medium, and high friction variants produce distinct stage depth |
| Deep Interview | Named as required ambiguity-reduction layer | Triggered or rendered when ambiguity or friction crosses threshold |
| PM debate | Exists as a planning method | Represented as a stage with required outputs and review criteria |
| Synthesizer | Exists as strategy language | Produces explicit decision, tradeoff, and next-action fields |
| CSO/QA | Exists through GStack-style review gates | Attached to high-risk or high-friction flows as deterministic gates |
| Evidence | CI, LSP, e2e, manual QA, static gates | Evidence also covers pipeline rendering and friction variants |
| Submission readiness | Strong POC and release evidence | Strong narrative plus case studies and runtime-scale evidence |

## Acceptance Gate For LazyCodex PR

A development PR is acceptable only if all checks pass:

- The current CLI behavior remains backwards compatible unless the PR explains and tests a deliberate change.
- The friction-scaled pipeline is represented in a typed module or equivalent stable contract.
- Low, medium, and high friction behavior is covered by tests.
- `bun run ci` passes.
- LSP diagnostics are clean for changed TypeScript files.
- The PR includes a concise manual QA note or evidence update.
- The PR does not introduce provider calls, autonomous writes, or external side effects.
- The PR stays scoped to the pipeline slice and avoids unrelated roadmap, copy, or packaging churn.

## Parent Thread Lane

The parent thread should continue product and submission work while LazyCodex handles implementation:

1. Prepare the Codex for OSS submission narrative around Boulder as a multi-LLM-heavy-user workflow harness.
2. Convert the strongest evidence into a short application packet.
3. Select two or three public OSS repositories for case-study runs.
4. Define benchmark claims that can be supported without overstating runtime scale.
5. Review LazyCodex PRs against the acceptance gate above before merge.

## Immediate Next Milestone

M8 should be "Pipeline Runtime Surface".

Expected output:

- A small typed pipeline model.
- A CLI-visible way to inspect the pipeline for a repository or manifest.
- Test coverage for friction variants.
- No expansion into full autonomous orchestration yet.

Non-goals:

- No provider integration.
- No background daemon.
- No persistent agent runtime.
- No benchmark claims beyond available fixtures.
