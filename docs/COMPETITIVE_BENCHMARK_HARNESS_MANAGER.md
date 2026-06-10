# Competitive Benchmark: harness-manager

Status: approval memo
Scope: research and M8 planning only
Decision: do not implement until parent thread approves

## Executive Conclusion

Boulder and `harness-manager` solve adjacent but different problems.

Boulder is an OSS operator workflow harness. It packages repository context, provider policy, verification gates, release evidence, and Codex-ready handoff material so maintainers keep control while agents work.

`harness-manager` is an agent runtime manager. It inventories local agent runtimes, isolates harness homes, strips and injects environment state, validates declarative runtime or harness manifests, and fails closed before side-effecting runtime operations.

The useful benchmark for Boulder is not runtime launching. The useful benchmark is governance discipline:

- fail-closed validation before side effects
- dry-run planning before mutation
- inventory/readiness tables
- explicit permission and credential boundaries
- parity-style scenario evidence
- declarative manifest override rules

Recommended M8 path: adopt the validation, planning, and evidence patterns from `harness-manager` and claw-code while keeping Boulder out of launcher, credential injection, package installation, and daemon behavior.

## Source Ledger Summary

| Source | Claim | Evidence summary | Confidence |
| --- | --- | --- | --- |
| `README.md` | Boulder is positioned as an operator kit for evidence-backed Codex workflows. | The README describes repo briefs, review boundaries, provider policies, verification gates, release playbooks, exportable workflow notes, and maintainer control. | High |
| `docs/FOLLOW_UP_BRIEFING.md` | M8 should make the friction-scaled pipeline visible or executable without destabilizing the CLI. | The document names `classification -> Deep Interview -> PM debate -> Synthesizer -> CSO/QA` and asks for a typed model plus CLI rendering or export integration. | High |
| `docs/PROVIDER_POLICY.md` | Boulder already treats external providers as approval-gated and locally verified. | The policy requires approval for external providers, forbids secret/private data leakage, treats provider output as advisory, and prefers local verification. | High |
| `docs/VERIFICATION_GATES.md` | Boulder completion requires recorded commands, pass/fail/manual status, skipped checks, and unresolved risks. | The doc defines verification evidence and `boulder verify --dry-run`. | High |
| `docs/OPERATOR_WORKFLOW_STACK.md` | Boulder uses Superpowers, GStack, and Compound as workflow contracts rather than runtime dependencies. | The stack maps planning, review gates, and learning capture, bounded by repo context, approval gates, local verification, and evidence. | High |
| [`harness-manager` README](https://github.com/INONONO66/harness-manager#readme) | `hm` is a runtime manager for local AI coding agents and harness isolation. | The README describes clean launch boundaries, runtime inventory, profile-driven env injection, isolated homes, TOML manifests, and fail-closed registry validation. | High |
| [`harness-manager` manifest guide](https://github.com/INONONO66/harness-manager/blob/main/docs/harness-manifest.md) | Harness manifests are declarative data, not executable shell snippets, and invalid manifests block side effects. | The guide documents manifest locations, structured package strategies, isolation tokens, security rules, and per-harness runtime locks. | High |
| `/Users/burt/Documents/Reference/Github_repo/claw-code/PARITY.md` | claw-code uses parity lanes and harness-validated flows as measurable implementation evidence. | PARITY describes lane status, permission enforcement, file tool flows, and scripted mock parity scenarios. | Medium |
| Product inference | Boulder should benchmark runtime-governance patterns but not copy runtime-launcher behavior. | This follows from Boulder product scope and the `harness-manager` category difference. | Medium |

## Source-backed Difference Matrix

| Axis | Boulder | harness-manager | claw-code reference pattern | Boulder decision |
| --- | --- | --- | --- | --- |
| Product purpose | Make OSS repos Codex-ready with maintainer control and evidence. | Manage local AI agent runtimes, profiles, auth boundaries, and isolated harness homes. | Provide harness/runtime parity patterns and permission-aware tool wiring. | Keep Boulder in workflow-harness category. |
| Primary user | OSS maintainer or Codex-heavy operator. | Local operator using multiple agent CLIs. | Harness/runtime implementer. | Optimize for maintainers first. |
| Core artifact | `boulder.yaml`, generated docs, scorecard, release evidence, exports. | Runtime and harness TOML manifests plus local config/profile state. | Tool specs, command wiring, parity lanes, permission enforcer. | Add pipeline spec/model, not launcher manifests. |
| Runtime boundary | No provider calls or runtime launch required. | Launches native CLIs with controlled env and isolated homes. | Enforces permissions around tool and shell execution. | Adopt boundaries as validation gates, not process execution. |
| Permission model | Approval-gated external providers and local verification. | Strips/injects env, validates manifests, rejects unsafe static env keys and paths. | Per-tool permission requirements and bash/file write checks. | Add explicit provider/side-effect boundary checks to M8. |
| Manifest validation | Validates Boulder manifest and provider policy. | Validates complete registry before install/update/remove/launch/inject side effects. | Uses scenario evidence for permission and tool behavior. | Strengthen fail-closed pipeline validation before export/release. |
| Dry-run/planning surface | `verify --dry-run`; future M8 pipeline surface planned. | `hm inject plan` previews injection before launch. | Mock parity scenarios preview expected request/tool flows. | Add `pipeline` or export-visible planning surface. |
| Evidence strategy | CI, e2e, LSP, manual QA, scorecard, release evidence. | Manifest validation and runtime behavior documented through CLI flows. | PARITY lanes and mock harness scenarios. | Add friction-variant tests and invalid-pipeline tests. |
| Failure mode | Unsafe provider policy fails validation. | Invalid registry fails closed before side effects. | Permission denial is tested as expected behavior. | Make invalid pipeline/provider/side-effect plans fail closed. |
| What not to copy | N/A | Credential injection, package installation, native CLI launching, isolated home mutation. | Full runtime implementation complexity. | Do not turn Boulder into `hm`. |

## Benchmark Candidate Scoring

Scoring: 1 is weak, 5 is strong. Lower implementation cost is better.

| Candidate | Boulder fit | Cost | User value | Safety impact | OSS narrative value | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Fail-closed manifest/pipeline validation | 5 | 2 | 5 | 5 | 5 | Adopt now |
| Dry-run planning before side effects | 5 | 2 | 5 | 4 | 5 | Adopt now |
| Inventory/readiness table | 4 | 2 | 4 | 3 | 4 | Adopt now |
| Permission/approval gates | 5 | 3 | 4 | 5 | 5 | Adopt now |
| Scoped parity tests | 4 | 3 | 4 | 4 | 5 | Adopt now, narrow |
| Provider/credential boundary checks | 4 | 3 | 4 | 5 | 5 | Adopt now, as validation only |
| Profile or adapter registry | 3 | 4 | 3 | 3 | 4 | Defer |
| Lock/concurrency safety | 2 | 4 | 2 | 3 | 2 | Defer |
| Runtime package strategies | 1 | 5 | 2 | 2 | 2 | Do not copy for M8 |
| Native agent launch isolation | 1 | 5 | 3 | 3 | 2 | Do not copy for M8 |

## Adopt / Defer / Do-not-copy

| Item | Classification | Reason |
| --- | --- | --- |
| Fail-closed validation | Adopt now | Matches Boulder provider validation and `harness-manager` registry discipline without requiring runtime launch. |
| Dry-run planning | Adopt now | Directly supports M8 pipeline visibility and mirrors `hm inject plan` at the workflow level. |
| Readiness/inventory table | Adopt now | A Boulder operator can scan repo, provider, verification, and pipeline readiness like `hm detect` scans runtimes. |
| Permission/approval gates | Adopt now | Boulder already has approval-gated providers; M8 can make side-effect categories explicit. |
| Scoped parity tests | Adopt now, narrow | Borrow claw-code's lane evidence pattern for low/medium/high friction pipeline variants. |
| Provider/credential boundary checks | Adopt now, validation only | Validate that pipeline specs do not require credential injection or external provider side effects. |
| Profile or adapter registry | Defer | Useful later if Boulder supports multiple downstream operator adapters, but too broad for M8. |
| Lock/concurrency safety | Defer | Only relevant once Boulder has runtime mutation or concurrent execution. |
| Package install strategies | Do not copy | Conflicts with Boulder as a workflow harness and introduces side effects outside M8. |
| Native CLI launch isolation | Do not copy | This is `harness-manager`'s category, not Boulder's current category. |
| Credential injection | Do not copy | Violates Boulder provider-policy posture and increases submission risk. |

## Proposed M8 Implementation Plan

Recommended path: implement "Pipeline Planning Surface" as an inspectable plan, not an executable runtime.

Default product decision: add a new `boulder pipeline` command in M8. Do not overload `inspect` or `export` first. `inspect` should stay repository-shape focused, and `export` should stay handoff focused. M9 can integrate pipeline summaries into export after the command contract is stable.

1. Add a typed pipeline model.
   - Suggested module: `src/pipeline.ts`
   - Include stages: `classification`, `deep-interview`, `pm-debate`, `synthesizer`, `cso-qa`
   - Include friction levels: `low`, `medium`, `high`
   - Include stage depth, required evidence, approval needs, and side-effect category.

2. Add pipeline validation.
   - Fail closed if a stage requires provider credentials, package installation, external launch, or unapproved side effects.
   - Validate that high friction includes Deep Interview, PM debate, Synthesizer, and CSO/QA.
   - Validate that each friction level has explicit outputs and evidence.

3. Add a CLI-visible planning surface.
   - Conservative option: extend `boulder inspect --json` or `boulder export` with pipeline data.
   - Cleaner option: add `boulder pipeline [--cwd path] [--friction low|medium|high] [--json]`.
   - The command must render a plan only; it must not run agents, call providers, install packages, or mutate repo files.

4. Add tests.
   - Unit tests for low/medium/high friction plans.
   - Invalid plan tests for forbidden side-effect categories.
   - CLI smoke/e2e test for the new pipeline output.
   - Regression test that existing commands still work.

5. Add evidence.
   - Update `docs/FOLLOW_UP_BRIEFING.md` or a new `docs/PIPELINE_RUNTIME_SURFACE.md`.
   - Record manual QA command output summary.
   - Keep benchmark claims limited to fixture coverage.

## M8 Implementation Contract

M8 is ready for development only under this concrete contract.

### CLI contract

Add:

```bash
boulder pipeline [--cwd path] [--friction low|medium|high] [--json]
```

Default behavior:

- `--cwd` defaults to the current working directory.
- `--friction` defaults to `medium`.
- Without `--json`, print a stable human-readable plan.
- With `--json`, print a stable `PipelinePlan` JSON object.
- The command reads repository context and Boulder manifest data only.
- The command must not write files, call providers, launch agents, install packages, or mutate environment state.

Defer until M9:

- Adding pipeline data into `inspect`.
- Adding pipeline data into `export`.
- Scoring pipeline readiness as part of the release plan.

### Type contract

The initial type shape should be explicit enough for tests, but small enough to keep M8 narrow:

```ts
export type FrictionLevel = "low" | "medium" | "high";

export type PipelineStageId =
  | "classification"
  | "deep-interview"
  | "pm-debate"
  | "synthesizer"
  | "cso-qa";

export type SideEffectCategory =
  | "none"
  | "repo-read"
  | "repo-write"
  | "provider-call"
  | "credential-access"
  | "package-install"
  | "external-launch";

export type PipelineStage = {
  id: PipelineStageId;
  label: string;
  required: boolean;
  depth: "light" | "standard" | "deep";
  outputs: string[];
  evidence: string[];
  approvalRequired: boolean;
  allowedSideEffects: SideEffectCategory[];
};

export type PipelinePlan = {
  friction: FrictionLevel;
  stages: PipelineStage[];
  failClosed: boolean;
  forbiddenSideEffects: SideEffectCategory[];
  approvalGates: string[];
  evidenceRequired: string[];
};
```

M8 should keep `repo-write` out of generated stages unless it is only a label for future implementation. The generated plan must have no actual write behavior.

### Friction contract

| Friction | Required stages | Depth profile | Approval posture |
| --- | --- | --- | --- |
| `low` | `classification`, `synthesizer` | light classification, light synthesis | no CSO/QA by default |
| `medium` | `classification`, `deep-interview`, `pm-debate`, `synthesizer` | standard discovery and debate | PM debate approval notes required |
| `high` | all five stages | deep interview, standard debate, deep synthesis, CSO/QA gate | CSO/QA approval required |

### Planner debate: fixture scope

Product planner:
M8 fixtures should be complete enough for implementation, but not so detailed that they become a hidden DSL. The fixture should define stage ids, depth, evidence, and approval posture, while leaving copy labels free to improve later.

Platform planner:
The JSON examples should be deterministic. If fixtures omit outputs and evidence, developers will invent them. If fixtures include every sentence of eventual docs, tests will become brittle. The right middle is stable arrays of short contract strings.

QA planner:
Each friction level needs a full example. Otherwise low and medium can accidentally become high with fewer stages, or high can miss CSO/QA.

Security planner:
Every fixture should carry the same forbidden side-effect list so the boundary is obvious regardless of friction level.

Synthesis:
Use full JSON examples for low, medium, and high. Tests should assert structure and canonical values, not prose copy. Labels may evolve; ids, depth, approval flags, and forbidden side effects should not drift without an intentional test update.

### PipelinePlan JSON fixture examples

Low friction:

```json
{
  "friction": "low",
  "stages": [
    {
      "id": "classification",
      "label": "Classification",
      "required": true,
      "depth": "light",
      "outputs": ["task-class", "friction-level"],
      "evidence": ["repo-context"],
      "approvalRequired": false,
      "allowedSideEffects": ["none", "repo-read"]
    },
    {
      "id": "synthesizer",
      "label": "Synthesizer",
      "required": true,
      "depth": "light",
      "outputs": ["decision", "next-action"],
      "evidence": ["plan-summary"],
      "approvalRequired": false,
      "allowedSideEffects": ["none"]
    }
  ],
  "failClosed": true,
  "forbiddenSideEffects": ["credential-access", "package-install", "external-launch", "provider-call"],
  "approvalGates": [],
  "evidenceRequired": ["repo-context", "plan-summary"]
}
```

Medium friction:

```json
{
  "friction": "medium",
  "stages": [
    {
      "id": "classification",
      "label": "Classification",
      "required": true,
      "depth": "standard",
      "outputs": ["task-class", "friction-level", "risk-flags"],
      "evidence": ["repo-context", "manifest-context"],
      "approvalRequired": false,
      "allowedSideEffects": ["none", "repo-read"]
    },
    {
      "id": "deep-interview",
      "label": "Deep Interview",
      "required": true,
      "depth": "standard",
      "outputs": ["ambiguities", "assumptions", "required-decisions"],
      "evidence": ["operator-intent", "open-questions"],
      "approvalRequired": false,
      "allowedSideEffects": ["none"]
    },
    {
      "id": "pm-debate",
      "label": "PM Debate",
      "required": true,
      "depth": "standard",
      "outputs": ["tradeoffs", "recommended-path", "rejected-options"],
      "evidence": ["debate-notes"],
      "approvalRequired": true,
      "allowedSideEffects": ["none"]
    },
    {
      "id": "synthesizer",
      "label": "Synthesizer",
      "required": true,
      "depth": "standard",
      "outputs": ["decision", "acceptance-gates", "next-action"],
      "evidence": ["synthesis-summary"],
      "approvalRequired": false,
      "allowedSideEffects": ["none"]
    }
  ],
  "failClosed": true,
  "forbiddenSideEffects": ["credential-access", "package-install", "external-launch", "provider-call"],
  "approvalGates": ["pm-debate"],
  "evidenceRequired": ["repo-context", "operator-intent", "debate-notes", "synthesis-summary"]
}
```

High friction:

```json
{
  "friction": "high",
  "stages": [
    {
      "id": "classification",
      "label": "Classification",
      "required": true,
      "depth": "deep",
      "outputs": ["task-class", "friction-level", "risk-flags", "approval-scope"],
      "evidence": ["repo-context", "manifest-context", "risk-context"],
      "approvalRequired": false,
      "allowedSideEffects": ["none", "repo-read"]
    },
    {
      "id": "deep-interview",
      "label": "Deep Interview",
      "required": true,
      "depth": "deep",
      "outputs": ["ambiguities", "assumptions", "required-decisions", "blocked-unknowns"],
      "evidence": ["operator-intent", "open-questions", "decision-log"],
      "approvalRequired": false,
      "allowedSideEffects": ["none"]
    },
    {
      "id": "pm-debate",
      "label": "PM Debate",
      "required": true,
      "depth": "standard",
      "outputs": ["tradeoffs", "recommended-path", "rejected-options", "milestone-scope"],
      "evidence": ["debate-notes", "scope-boundary"],
      "approvalRequired": true,
      "allowedSideEffects": ["none"]
    },
    {
      "id": "synthesizer",
      "label": "Synthesizer",
      "required": true,
      "depth": "deep",
      "outputs": ["decision", "acceptance-gates", "next-action", "handoff-contract"],
      "evidence": ["synthesis-summary", "implementation-contract"],
      "approvalRequired": false,
      "allowedSideEffects": ["none"]
    },
    {
      "id": "cso-qa",
      "label": "CSO/QA",
      "required": true,
      "depth": "standard",
      "outputs": ["risk-review", "qa-gates", "approval-result"],
      "evidence": ["security-review", "qa-checklist"],
      "approvalRequired": true,
      "allowedSideEffects": ["none"]
    }
  ],
  "failClosed": true,
  "forbiddenSideEffects": ["credential-access", "package-install", "external-launch", "provider-call"],
  "approvalGates": ["pm-debate", "cso-qa"],
  "evidenceRequired": ["repo-context", "operator-intent", "debate-notes", "synthesis-summary", "security-review", "qa-checklist"]
}
```

### Human output contract

For `boulder pipeline --friction high`, the human output should be stable enough for an e2e assertion:

```text
Boulder pipeline plan
- friction: high
- stage: classification (required, deep)
- stage: deep-interview (required, deep)
- stage: pm-debate (required, standard)
- stage: synthesizer (required, deep)
- stage: cso-qa (required, standard, approval required)
- fail-closed: true
```

The exact stage labels can evolve, but M8 tests should assert the friction line, stage ids, and fail-closed line.

### JSON output contract

For `boulder pipeline --friction high --json`, tests should assert:

- `friction === "high"`
- `failClosed === true`
- `stages.length === 5`
- stage ids include all five canonical stages
- `forbiddenSideEffects` includes `credential-access`, `package-install`, `external-launch`, and `provider-call`
- `approvalGates` includes `cso-qa`

### Fail-closed error contract

Invalid or unsafe pipeline specs should fail before output is treated as usable.

Initial error ids:

| Error id | Trigger | Expected behavior |
| --- | --- | --- |
| `pipeline.friction.invalid` | Unknown friction level | exit 1 with an explicit supported-values message |
| `pipeline.stage.missing` | Required stage missing from a generated plan | exit 1 in validation/tests |
| `pipeline.sideEffect.forbidden` | Stage includes `credential-access`, `package-install`, `external-launch`, or unapproved `provider-call` | exit 1 with the stage id |
| `pipeline.evidence.missing` | Required stage has no evidence outputs | exit 1 in validation/tests |

M8 can expose invalid generated plans only through tests. It does not need a user-editable pipeline config yet.

### Planner debate: invalid friction UX

Product planner:
The invalid friction case must feel like a normal CLI error, not a stack trace. The operator should immediately know the allowed values.

Developer planner:
The exact stderr should be stable enough for e2e tests, but short enough that it does not lock the implementation into a long help screen.

QA planner:
The exit code must be asserted. If invalid friction silently falls back to medium, the fail-closed story is broken.

Synthesis:
Use exit code `1`, a single stable stderr line, and no stdout. Keep the message aligned with the error id.

Expected invalid friction behavior:

```bash
$ bun bin/boulder.ts pipeline --friction impossible
ERROR pipeline.friction.invalid: Unsupported friction level "impossible". Expected one of: low, medium, high.
```

Expected process contract:

- stdout: empty
- stderr: the exact `ERROR pipeline.friction.invalid...` line above
- exit code: `1`

### M8 test contract

Add or extend tests for:

- low friction pipeline plan
- medium friction pipeline plan
- high friction pipeline plan
- invalid friction CLI argument
- forbidden side-effect validation
- `boulder pipeline --friction high`
- `boulder pipeline --friction high --json`
- regression that existing `init`, `inspect`, `validate`, `verify`, `scorecard`, `benchmark`, `release-plan`, and `export` still pass

Manual QA commands:

```bash
bun run ci
bun bin/boulder.ts pipeline --friction low
bun bin/boulder.ts pipeline --friction medium --json
bun bin/boulder.ts pipeline --friction high
bun bin/boulder.ts pipeline --friction impossible
```

Static gate:

```bash
rg -n "credential|package install|spawn|exec|openai|anthropic|provider" src test docs/PIPELINE_RUNTIME_SURFACE.md docs/COMPETITIVE_BENCHMARK_HARNESS_MANAGER.md
```

Planner debate:

Security planner:
The gate needs to catch accidental runtime-launcher code in `src/`, but searching every doc creates noise because provider policy text is expected.

QA planner:
Tests and M8 docs should still be searched because fixtures and docs often reveal accidental scope creep before code does.

Developer planner:
The command should target files likely to change in M8. Broad repo-wide policy searches should remain optional review work, not a required PR gate.

Synthesis:
The required static gate is scoped to `src`, `test`, and M8-specific docs. Any hit must be explained as policy text, test fixture text, or safe validation code. It is a review aid, not a blanket failure.

## Acceptance Gates

The M8 PR should not be merged unless:

- Current CLI behavior remains backwards compatible.
- A typed pipeline model or equivalent stable contract exists.
- Low, medium, and high friction variants are represented and tested.
- High friction includes Deep Interview, PM debate, Synthesizer, and CSO/QA.
- Pipeline validation fails closed for forbidden runtime-launcher behavior.
- The CLI exposes pipeline planning or export-visible pipeline data.
- `bun run ci` passes.
- LSP diagnostics are clean for changed TypeScript files.
- Static search confirms no credential injection, package install, or native launch behavior was added.
- Manual QA evidence documents at least one human-readable pipeline plan and one invalid/fail-closed case.

## Post-M8 Roadmap

The post-M8 plan should remain one product arc: Boulder becomes an operator workflow system with evidence, not a runtime launcher.

| Milestone | Theme | User-visible outcome | Main implementation surface | Explicit non-goal |
| --- | --- | --- | --- | --- |
| M8 | Pipeline Planning Surface | `boulder pipeline` renders low/medium/high friction plans | `src/pipeline.ts`, CLI command, tests | no provider calls, no runtime launch |
| M9 | Pipeline Evidence Integration | pipeline plan appears in export/release evidence | `export`, `release-plan`, docs | no user-editable DSL yet |
| M10 | Benchmark Fixtures | fixture repos prove pipeline quality and fail-closed behavior | `fixtures/`, benchmark report, scorecard hooks | no superiority claims beyond fixtures |
| M11 | Adapter Boundary Registry | document-compatible adapter metadata for Codex/subagents/harness-manager without execution | provider/adapter policy docs and validation | no credential injection or launch |
| M12 | Case-study Submission Packet | two or three public OSS case studies packaged for Codex for OSS | docs/application packet, generated exports, evidence ledger | no private repo dependency |
| M13+ | Optional Runtime Interop | only if needed, define an external runtime handoff contract | docs-only interop spec first | no built-in runtime manager unless separately approved |

### M9 plan

Goal: make M8 pipeline output part of Boulder evidence.

Deliverables:

- Add pipeline summary to `docs/BOULDER_EXPORT.md` or generated export output.
- Add pipeline readiness to release evidence without changing the scorecard weight yet.
- Add fixture coverage that snapshots exported pipeline summaries.

Acceptance gate:

- Existing export golden behavior remains stable except for the explicit pipeline section.
- `bun run ci` passes.
- Exported pipeline section includes friction, stages, approval gates, and fail-closed status.

### M10 plan

Goal: convert benchmark claims into fixture-backed evidence.

Deliverables:

- Add at least three fixture scenarios:
  - low-friction documentation-only repo
  - medium-friction library repo
  - high-friction provider or MCP-adjacent repo
- Add invalid fixture with forbidden side-effect metadata.
- Extend benchmark report to show pipeline completeness and fail-closed status.

Acceptance gate:

- Benchmark report avoids runtime leaderboard claims.
- Every fixture has deterministic expected output.
- Invalid fixture fails for the expected reason.

### M11 plan

Goal: define adapter boundaries without becoming an adapter runtime.

Deliverables:

- Add metadata-only adapter boundary docs for Codex, subagents, and harness-manager interop.
- Add validation rules that forbid credentials, package installs, and external launch behavior in adapter metadata.
- Add readiness table showing which adapters are documented, exportable, or executable. M11 should only target documented/exportable.

Acceptance gate:

- No code path launches external tools.
- Adapter metadata is data-only.
- Provider policy remains approval-gated.

### M12 plan

Goal: package Boulder for Codex for OSS submission.

Deliverables:

- Create two or three public OSS case-study exports.
- Produce a compact application packet with evidence links.
- Include before/after table: repo without Boulder vs repo with Boulder harness.
- Include limitations: no runtime-scale claim, no provider superiority claim, no autonomous execution claim.

Acceptance gate:

- Case studies are reproducible from public repositories.
- Claims are source-backed or marked as inference.
- Release artifacts and docs match the current package version.

### M13+ optional plan

Only after M8-M12 evidence exists, consider external runtime interop.

Allowed first step:

- A docs-only handoff spec explaining how Boulder exports could be consumed by tools like `harness-manager`.

Still forbidden without separate approval:

- Native CLI launching.
- Credential injection.
- Isolated home management.
- Package installation.
- Background orchestration.

## Kill Criteria And Open Risks

Kill or split the M8 plan if it:

- Adds credential injection.
- Adds package installation.
- Launches external agents.
- Adds a background daemon.
- Rewrites unrelated CLI commands.
- Requires secrets, private data, or provider calls.
- Claims benchmark superiority without measured fixtures.
- Requires more than one tightly scoped PR.

Open risks:

- The phrase "runtime surface" may imply execution. Use "pipeline planning surface" in user-facing docs unless actual runtime behavior exists.
- `harness-manager`'s strongest features are runtime-bound; Boulder should adapt the governance pattern, not the implementation category.
- A new `pipeline` command expands CLI surface, but it is now the preferred M8 path because it gives tests and users a clear contract before export integration.

## Approval Request

Recommended path:
Approve M8 as a new `boulder pipeline` planning surface with fail-closed validation and friction-variant tests.

Why now:
This turns Boulder from a harness-document generator into an inspectable operator workflow system without taking on runtime-launcher risk.

What not to do:
Do not add credential injection, package installation, native CLI launching, isolated home management, or daemon behavior.

Files likely to change:

- `src/pipeline.ts`
- `src/cli.ts`
- `src/types.ts` or `src/manifest.ts`
- `src/validation.ts`
- `test/cli.test.ts`
- `test/cli-e2e.test.ts`
- `docs/FOLLOW_UP_BRIEFING.md` or `docs/PIPELINE_RUNTIME_SURFACE.md`

Tests likely to add:

- low friction pipeline plan
- medium friction pipeline plan
- high friction pipeline plan
- invalid side-effect category fails closed
- CLI pipeline output smoke
- existing command regression

Decision needed from parent thread:

Approve the M8-M12 roadmap as one arc, with M8 limited to `boulder pipeline` and no runtime-launcher behavior.
