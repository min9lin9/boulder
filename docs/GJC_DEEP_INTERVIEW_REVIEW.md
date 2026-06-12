# GJC Deep Interview Review

Status: planning review

## Source

Reference repository: `Yeachan-Heo/gajae-code`

Observed public contract from README:

- Gajae-Code is an external coding-agent harness.
- Public workflow surface: `deep-interview -> ralplan -> ultrogoal`, with optional tmux-backed team execution.
- `deep-interview` clarifies ambiguous requirements before planning or code changes.
- `ralplan` builds and critiques implementation plans before mutation.
- `ultragoal` tracks goals, revisions, checks, and completion evidence.
- GJC runs beside Codex CLI, Claude Code, OpenCode, and Claw Code instead of replacing them.

Runtime note:

- `bunx gajae-code --help` was attempted during this review.
- It resolved the package but failed because the local Bun runtime is `1.3.5` and GJC requires Bun `>=1.3.14`.
- This review therefore applies the public GJC workflow contract without claiming a live GJC TUI session was completed.

## Interview Objective

Review whether Boulder should model work as:

```text
Planning executor: GJC
Execution executor: LazyCodex
Evaluator: Boulder gates
Compound layer: Boulder workflow profile and adapter graph
```

Follow-up objective:

Review the newer decision that Boulder should expose only five user-facing verbs while preserving the internal eight-lane lifecycle grammar:

```text
user surface: intake -> plan -> execute -> verify -> record
internal grammar: classification, discovery, planning, handoff, execution, verification, review-decision, learning-reuse
```

## Deep Interview Transcript

### Q1. What ambiguity does Boulder need to remove before planning?

Answer:

Boulder must distinguish four different concerns that were previously mixed:

- task lifecycle lane
- workflow profile
- executor adapter
- evidence gate

The ambiguity is not "how many agents should run." The ambiguity is "which lifecycle contract must this task satisfy, and which executor is allowed to own each contract."

Decision:

- Keep eight core lanes as stable grammar.
- Select profile-specific components after classification.

### Q2. Should GJC be a required dependency or a default planner?

Answer:

GJC should be the default planning executor because its workflow starts with interview and reviewed planning. That matches Boulder’s need for decision-complete planning before mutation.

But GJC must not be required. If Boulder hardcodes GJC, it becomes a GJC wrapper and loses modularity.

Decision:

- Define a planner adapter contract.
- Treat GJC output as the preferred planning packet shape.
- Accept equivalent planning packets from Codex, human PMs, or another planner.

### Q3. What should pass from GJC to LazyCodex?

Answer:

LazyCodex should not receive vague intent. It should receive an execution packet derived from the planning packet.

Required handoff fields:

- objective
- scope boundaries
- allowed mutation paths
- explicit non-goals
- acceptance criteria
- verification commands
- manual QA scenarios
- evidence paths
- cleanup requirements
- approval policy

Decision:

- Make Handoff / Contract Packaging an independent lane.
- Boulder owns this transformation, not GJC or LazyCodex.

### Q4. What should LazyCodex own?

Answer:

LazyCodex should own bounded execution: file mutations, command runs, real-surface QA, and evidence capture.

LazyCodex should not own:

- task classification
- planning interpretation
- public readiness claims
- maintainer decision
- long-term workflow reuse

Decision:

- LazyCodex is default execution executor.
- Any executor that can consume the same execution packet can replace it.

### Q5. Where does evaluation happen?

Answer:

Evaluation must be independent of execution. Otherwise "the executor says it passed" becomes the product claim.

Evaluation should include:

- automated tests
- LSP or static diagnostics
- manual QA evidence
- service/product readiness gates
- share-safety checks
- decision log checks

Decision:

- Boulder gates are the default evaluator.
- Review / Decision remains separate from Verification.

### Q6. Is Compound Engineering a lane?

Answer:

No. Compound Engineering is the meta-layer that selects and composes lanes, profiles, adapters, and evidence ledgers.

Decision:

- Keep Compound Engineering out of the eight core lanes.
- Treat it as orchestration over workflow profiles.

### Q7. Does Boulder need more than eight lanes?

Answer:

Not yet. Security, release, external replay, support, benchmark, and docs work require different components, not new global lanes.

Decision:

- Add workflow profiles, not lanes.
- Promote a component to a global lane only if it has independent input/output, owner, failure recovery, evidence artifact, and recurrence across profiles.

### Q8. Should users see the eight lanes?

Answer:

No. Gajae-Code’s README is useful here because it exposes a small workflow surface even though the implementation can coordinate skills, roles, tmux workers, and evidence. Boulder should follow the same product principle.

Users should see:

```text
intake -> plan -> execute -> verify -> record
```

They should not need to understand:

```text
classification -> discovery -> planning -> handoff -> execution -> verification -> review-decision -> learning-reuse
```

Decision:

- Keep eight lanes as internal grammar.
- Expose five verbs as the public operator workflow.
- Hide lane composition inside workflow profiles.

### Q9. Where do GJC and LazyCodex attach in the five-verb surface?

Answer:

GJC attaches to `plan`, not to the whole workflow. LazyCodex attaches to `execute`, not to planning or evaluation.

Mapping:

| Surface Verb | Internal Lanes | Default Adapter |
| --- | --- | --- |
| intake | classification, discovery | Boulder |
| plan | planning, handoff | GJC plus Boulder packet builder |
| execute | execution | LazyCodex |
| verify | verification, review-decision | Boulder gates plus maintainer decision |
| record | learning-reuse | Boulder evidence ledger |

Decision:

- The CLI and README should emphasize the five verbs.
- Workflow profile schemas should retain the internal lane mapping.
- Adapter contracts should point to lanes, not directly to user-facing verbs.

### Q10. What is still under-specified after this simplification?

Answer:

The simplified surface is correct, but it creates a new requirement: every public verb needs a stable packet or artifact.

Required artifacts:

- `intake`: classification and context pack
- `plan`: planning packet and execution packet
- `execute`: execution result packet
- `verify`: verification report and decision log
- `record`: evidence ledger and reusable pattern

Decision:

- Do not implement more public verbs.
- Implement packet validators behind the five verbs.
- Use workflow profiles to decide which internal lane components are required per task type.

## Ralplan-Style Critique

### Strengths

- GJC and LazyCodex are now defaults, not dependencies.
- Handoff is correctly independent.
- Review / Decision is correctly separated from Verification.
- Compound Engineering is correctly modeled as a meta-layer.
- The structure supports planner replacement and executor replacement.

### Risks

- If planner packet schema is not implemented, GJC remains a narrative reference.
- If execution packet schema is not implemented, LazyCodex handoff remains informal.
- If workflow profiles are not machine-readable, profile selection stays manual.
- If field evidence is not captured, Boulder remains fixture-backed.

### Required Next Plan

Create machine-readable contracts:

```text
fixtures/workflow-profiles/*.json
fixtures/planning-packets/gjc-example.json
fixtures/execution-packets/lazycodex-example.json
fixtures/decision-logs/example.json
```

Then add validators:

```text
boulder workflow-profile validate
boulder planning-packet validate
boulder execution-packet validate
```

## Final Judgment

The current architecture is directionally correct and modular enough for a public OSS planning narrative.

It is not yet fully executable as a GJC/LazyCodex modular workflow until Boulder validates:

- planner adapter output
- handoff packet transformation
- executor adapter input
- evaluation packet output
- decision log
- profile-specific gates

Planning score after this review: 92 / 100.

The score should not rise above 92 until at least one real GJC-style planning packet is transformed into a LazyCodex-compatible execution packet and evaluated by Boulder gates.

Follow-up judgment:

The five-verb user surface improves product clarity without weakening the internal model.

Planning score rises to 94 / 100 after the approved three-stage MVP remediation is written into `docs/WORKFLOW_ARCHITECTURE.md`.

The score should remain below 95.5 until Contract MVP validators exist for workflow profiles, planning packets, execution packets, and decision logs.
