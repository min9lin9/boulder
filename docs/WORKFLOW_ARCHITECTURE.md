# Boulder Workflow Architecture

Status: final planning draft

## One-Line Definition

Boulder is a workflow manager and evaluator for modular AI-assisted work: GJC is the default planning executor, LazyCodex is the default execution executor, and Boulder owns classification, handoff contracts, verification, decision evidence, and compound orchestration.

## Source Inputs

- Product direction from Boulder planning discussions: split work into planning, execution, evaluation, and compound engineering domains.
- Gajae-Code repository reference: `Yeachan-Heo/gajae-code`.
- Deep interview review: `docs/GJC_DEEP_INTERVIEW_REVIEW.md`.
- Gajae-Code observed public surface:
  - external coding-agent harness
  - `deep-interview -> ralplan -> ultragoal`
  - optional `team` execution through tmux-backed workers
  - bundled workflow skills: `deep-interview`, `ralplan`, `ultragoal`, `team`
  - bundled role agents: `executor`, `architect`, `planner`, `critic`
  - runs beside Codex CLI, Claude Code, OpenCode, and Claw Code instead of replacing them

Runtime constraint:

- Live `gjc` execution was not completed in this review because `bunx gajae-code --help` requires Bun `>=1.3.14` and the local runtime is Bun `1.3.5`.
- The architecture applies the public GJC contract and must later be validated with a real GJC session or compatible planning packet.

## Thesis / Antithesis / Synthesis

### Round 1: Four Domains

Thesis:

- The user-facing model should stay simple: Planning, Execution, Evaluation, Compound Engineering.
- This makes Boulder understandable as a workflow product rather than a large agent bundle.

Antithesis:

- Four domains are too coarse for routing real work.
- They hide critical boundaries such as discovery, handoff, review, and reuse.

Synthesis:

- Keep the four domains as product language.
- Use eight core lanes as the operational grammar.

### Round 2: Eight Core Lanes

Thesis:

- Eight lanes are enough for most work: Intake, Discovery, Planning, Handoff, Execution, Verification, Review, Learning.
- They map cleanly to lifecycle boundaries and evidence artifacts.

Antithesis:

- Security, release, support, benchmark, and external replay may need their own lanes.

Synthesis:

- Do not add global lanes for task specialties.
- Model those as workflow profiles that select different lane components, gates, artifacts, and executors.

### Round 3: GJC As Planning Executor

Thesis:

- GJC fits Boulder planning because its public surface emphasizes interview, plan critique, goals, tmux evidence, and planner/critic roles.
- `deep-interview -> ralplan -> ultragoal` maps naturally to Boulder discovery, planning, and goal evidence.

Antithesis:

- If Boulder hardcodes GJC, it becomes a GJC wrapper instead of a modular workflow manager.
- Some users may plan with Codex, a human PM, another planner, or a lighter template.

Synthesis:

- GJC is the default planning executor, not the only planner.
- Boulder must define a planner adapter contract and accept alternative planning packets.

### Round 4: LazyCodex As Execution Executor

Thesis:

- LazyCodex should execute the large work scope after GJC produces a decision-complete plan.
- This preserves division of labor: planner produces contract, executor mutates files and gathers evidence.

Antithesis:

- Execution may also be done by Codex worker, human engineer, CI bot, or another agent.
- Binding execution only to LazyCodex weakens modularity and OSS portability.

Synthesis:

- LazyCodex is the default execution executor.
- Boulder owns the execution packet schema so other executors can consume the same plan.

### Round 5: Compound Engineering

Thesis:

- Compound Engineering is Boulder’s differentiation: planner, executor, evaluator, and reviewer adapters can be composed per task class.

Antithesis:

- Treating Compound Engineering as another lane makes it too narrow.
- It should not compete with Planning or Execution as a peer step.

Synthesis:

- Compound Engineering is the meta-layer above the lanes.
- It selects workflow profiles, adapter graphs, cross-lane evidence ledgers, and replay/benchmark reuse.

## Final Model

```text
Four domains:
1. Planning
2. Execution
3. Evaluation
4. Compound Engineering

Eight core lanes:
1. Intake / Classification
2. Discovery / Context Gathering
3. Planning
4. Handoff / Contract Packaging
5. Execution
6. Verification / Evaluation
7. Review / Decision
8. Learning / Reuse

Workflow profiles:
- docs-only
- code-change
- release
- external-oss-replay
- support-triage
- security-sensitive
- benchmark
- compound-workflow
```

## User-Facing Surface

Boulder exposes five public workflow verbs:

```text
intake -> plan -> execute -> verify -> record
```

The eight lanes stay internal. Users do not need to reason about every lane unless they are authoring a workflow profile or adapter.

| Public Verb | Internal Lanes | Default Owner | Main Artifact |
| --- | --- | --- | --- |
| intake | Intake / Classification, Discovery / Context Gathering | Boulder | classification and context pack |
| plan | Planning, Handoff / Contract Packaging | GJC plus Boulder packet builder | planning packet and execution packet |
| execute | Execution | LazyCodex | execution result packet |
| verify | Verification / Evaluation, Review / Decision | Boulder gates and maintainer | verification report and decision log |
| record | Learning / Reuse | Boulder | evidence ledger and reusable pattern |

Design rule:

- CLI and README should prefer the five verbs.
- Workflow profiles should contain the eight-lane mapping.
- Adapter contracts should bind to internal lanes so GJC, LazyCodex, or substitutes remain replaceable.

## Role Defaults

| Role | Default | Replaceable With | Boulder Contract |
| --- | --- | --- | --- |
| Planner | GJC | Codex, human PM, custom planner | planning packet |
| Executor | LazyCodex | Codex worker, human engineer, CI bot | execution packet |
| Evaluator | Boulder gates | custom QA, reviewer, CI | verification report |
| Decision owner | Maintainer | reviewer, project owner | decision log |
| Compound layer | Boulder | another orchestrator | workflow profile and evidence ledger |

## Adapter Contracts

### Planner Adapter

Input:

- task brief
- classification result
- repository context pack
- constraints and approval policy

Output:

- objective
- scope boundaries
- acceptance criteria
- risk register
- manual QA scenarios
- executor instructions
- evidence requirements

Default executor:

- GJC through `deep-interview`, `ralplan`, and goal/evidence workflow.

### Executor Adapter

Input:

- planner output packet
- target repository or worktree
- allowed mutation scope
- verification commands
- approval requirements

Output:

- changed files
- execution log
- test results
- manual QA artifacts
- cleanup receipt
- handoff result

Default executor:

- LazyCodex.

### Evaluator Adapter

Input:

- plan packet
- execution packet
- repository state
- evidence artifacts

Output:

- pass/fail checks
- readiness status
- blockers
- next actions
- public-claim eligibility

Default evaluator:

- Boulder service/product readiness gates.

## Workflow Profile Shape

```json
{
  "profile": "code-change",
  "surface": ["intake", "plan", "execute", "verify", "record"],
  "lanes": {
    "classification": {
      "components": ["friction", "risk", "approval"]
    },
    "discovery": {
      "components": ["repo-context", "official-docs", "existing-tests"]
    },
    "planning": {
      "executor": "gjc",
      "requiredArtifacts": ["planning-packet", "risk-register", "qa-plan"]
    },
    "handoff": {
      "components": ["execution-packet", "approval-ledger"]
    },
    "execution": {
      "executor": "lazycodex",
      "fallbackExecutor": "codex-worker"
    },
    "verification": {
      "components": ["tests", "lsp", "manual-qa"]
    },
    "review": {
      "components": ["decision-log", "change-summary"]
    },
    "learning": {
      "components": ["case-study", "replay-fixture"]
    }
  }
}
```

## Design Rules

- Do not add global lanes unless a boundary has independent input/output, executor ownership, failure recovery, evidence artifact, and recurrence across profiles.
- Add workflow profiles when task classes differ in lane components, required gates, or executor choices.
- Keep GJC and LazyCodex as defaults, not dependencies.
- Handoff must remain independent; otherwise planner and executor become coupled.
- Review / Decision must remain independent; otherwise test success and maintainer judgment become conflated.
- Compound Engineering must manage profile selection and adapter graphs, not directly replace Planning or Execution.

## Current Service Readiness Implication

Boulder is currently `fixture-backed` and `service-pilot-ready`.

To become field-backed:

- run GJC planning on a real task class
- pass the generated planning packet through Boulder handoff validation
- execute the packet with LazyCodex or a substitute executor
- evaluate with Boulder readiness gates
- record maintainer decision outcome
- replay or reuse the workflow in a second repo event

The product claim should be:

> Boulder makes AI-agent work modular by separating planning, execution, evaluation, and compound orchestration into replaceable workflow lanes.

It should not yet claim:

> Boulder has proven real-world repeatable service readiness across external maintainers.

## Deep Interview Follow-Up

`docs/GJC_DEEP_INTERVIEW_REVIEW.md` raises the planning score to 92 / 100 but caps it there until Boulder validates real adapter packets:

- workflow profile
- GJC-style planning packet
- LazyCodex-compatible execution packet
- Boulder evaluation output
- maintainer decision log

Next implementation target:

```text
fixtures/workflow-profiles/*.json
fixtures/planning-packets/gjc-example.json
fixtures/execution-packets/lazycodex-example.json
fixtures/decision-logs/example.json
```

## Three-Stage MVP Remediation

Approved direction: keep the internal eight-lane lifecycle grammar, expose five user-facing verbs, and fill the remaining gaps through three MVP stages.

### Phase 1: Contract MVP

Purpose:

- Turn the architecture from prose into machine-readable contracts.
- Prove Boulder can validate modular planner/executor/evaluator boundaries without requiring a live GJC or LazyCodex runtime.
- Prove Boulder can route installed Codex skills, MCP servers, plugins, and runtimes before planner/executor selection.

Deliverables:

```text
fixtures/workflow-profiles/code-change.json
fixtures/planning-packets/gjc-example.json
fixtures/execution-packets/lazycodex-example.json
fixtures/decision-logs/example.json
fixtures/capabilities/codex-installed.json
src/workflow-profile.ts
src/planning-packet.ts
src/execution-packet.ts
src/decision-log.ts
src/capability-doctor.ts
test/workflow-contracts.test.ts
test/capability-doctor.test.ts
```

CLI surface:

```text
boulder workflow-profile validate <path>
boulder planning-packet validate <path>
boulder execution-packet validate <path>
boulder decision-log validate <path>
boulder doctor --json
```

Acceptance criteria:

- valid fixtures pass
- missing required fields fail with stable error paths
- GJC and LazyCodex are not required for validation
- workflow profile maps five public verbs to internal lanes
- installed capabilities map to intake/plan/execute/verify/record/compound lanes
- runtime blockers, including Gajae-Code Bun compatibility, are explicit warnings
- service-readiness remains `pilot-ready`

Score impact:

- planning score: 94 -> 95.5 after implementation

### Phase 2: Handoff MVP

Purpose:

- Prove that a GJC-style planning packet can become a LazyCodex-compatible execution packet.
- Make Handoff / Contract Packaging an executable lane instead of a narrative boundary.

Deliverables:

```text
src/handoff-builder.ts
fixtures/planning-packets/gjc-example.json
fixtures/execution-packets/lazycodex-generated.json
test/handoff-builder.test.ts
docs/HANDOFF_PACKET.md
```

CLI surface:

```text
boulder handoff build --plan fixtures/planning-packets/gjc-example.json --out fixtures/execution-packets/lazycodex-generated.json
```

Acceptance criteria:

- planning objective maps to execution objective
- scope boundaries map to allowed mutation paths and explicit non-goals
- acceptance criteria map to verification requirements
- manual QA scenarios map to evidence requirements
- approval policy survives the transformation
- unsupported planner fields fail closed or become explicit notes

Score impact:

- planning score: 95.5 -> 96.5 after implementation

### Phase 3: Field Evidence MVP

Purpose:

- Replace fixture-backed readiness with field-backed evidence from a real repository run.
- Prove activation, repeat use, distribution, decision impact, replay discipline, and metrics generation outside local fixture claims.

Deliverables:

```text
evidence/field-readiness/<run-id>/activation-transcript.txt
evidence/field-readiness/<run-id>/first-readiness.json
evidence/field-readiness/<run-id>/second-readiness-delta.json
evidence/field-readiness/<run-id>/share-safe-artifact-url.txt
evidence/field-readiness/<run-id>/decision-log.json
evidence/field-readiness/<run-id>/official-docs-refresh.json
evidence/field-readiness/<run-id>/generated-metrics.json
docs/FIELD_READINESS_PACKET.md
src/field-evidence.ts
test/field-evidence.test.ts
```

CLI surface:

```text
boulder record field-readiness --run-id <run-id> --evidence evidence/field-readiness/<run-id>
boulder service-readiness --json
```

Acceptance criteria:

- first-run transcript proves time-to-first-readiness-delta
- second run on the same repo produces changed recommendations
- shared artifact is public or share-safe
- maintainer decision is recorded as merge, reject, defer, or request-changes
- replay uses official docs first
- metrics are generated from evidence files
- service-readiness fails closed when field evidence is missing or invalid

Score impact:

- planning score: 96.5 -> 98 after implementation

## Score Ladder

| State | Score | Meaning |
| --- | --- | --- |
| Current architecture with GJC deep-interview review | 92 / 100 | directionally correct, but packet validators are missing |
| Three-stage MVP remediation written into plan | 94 / 100 | submission narrative is strong and implementation path is concrete |
| Contract MVP implemented | 95.5 / 100 | Boulder has executable modular workflow contracts |
| Handoff MVP implemented | 96.5 / 100 | planner-to-executor transfer is validated |
| Field Evidence MVP completed | 98 / 100 | real repeatable service loop is evidenced |
| Multiple external maintainers or repeated repo classes | 99+ / 100 | field-backed adoption and generality are proven |

Current planning status after this update: 94 / 100.

## Immediate Next Work

Start with Phase 1 only.

Reason:

- Contract MVP unlocks every later phase.
- It is implementable without GJC runtime upgrade.
- It keeps LazyCodex optional until execution packets are validated.
- It converts Boulder from a good architecture document into a testable workflow manager.
