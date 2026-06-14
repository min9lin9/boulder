# Open Source Usage Decision

Status: draft

## Decision

Boulder should use external OSS as reference and handoff targets, not as bundled runtime dependencies.

The product flow is:

```text
Boulder classify/export -> GJC plan/review -> LazyCodex implement -> Boulder verify/readiness gate
```

The default executor profile is intentionally conservative:

```yaml
executors:
  planning:
    preferred: gajae-code
    mode: detect-and-suggest
  execution:
    preferred: lazycodex
    mode: detect-and-suggest
  fallback:
    planning: codex
    execution: codex
```

This makes GJC and LazyCodex visible in planning without making Boulder launch either runtime automatically.

## Adoption Tiers

| Project or source | Use now | Use later | Do not do |
| --- | --- | --- | --- |
| Gajae-Code / GJC | Use as the planning and review lane for ambiguous or high-friction work. Boulder handoff packets should be shaped so GJC can run deep-interview, ralplan, and ultragoal goal decomposition. | Add optional handoff docs and evidence import conventions after Boulder release hygiene is clean. | Do not make GJC a required runtime dependency. Do not make GJC the default implementation owner. |
| LazyCodex | Use as the implementation lane after a GJC-approved plan exists. LazyCodex consumes file scope, TDD requirements, acceptance criteria, and evidence paths. | Add stricter PR/evidence packet conventions after M10-M12 case studies. | Do not let LazyCodex silently rewrite the planning premise without sending it back through GJC/Boulder review. |
| INONONO66/harness-manager | Benchmark its manifest, detection, isolation, and fail-closed ideas. Keep this as design reference for adapter boundaries. | Consider metadata-only adapter boundary docs after Boulder has stable export evidence. | Do not copy runtime launch, auth injection, or install/update/remove behavior into Boulder core. |
| VoltAgent/awesome-codex-subagents | Treat as a role taxonomy reference for possible reviewer, architect, security, docs, and QA agent names. | Curate a tiny Boulder-specific role list only when evidence shows repeated need. | Do not vendor or install the full catalog. Do not make 100+ roles part of the default product surface. |
| Superpowers / GStack / Compound | Keep as operator workflow contracts: workflow spine, review gate, learning layer. | Convert repeated Boulder lessons into docs or generated harness guidance. | Do not represent them as package dependencies or runtime plugins. |
| har-maker | Use as the source pattern for friction-scaled harness design and evidence-first operator workflow. | Reuse only the parts that improve Boulder export, docs, and gates. | Do not clone the whole har-maker structure if it makes Boulder less focused as an OSS CLI. |

## What Stays Core

- `classification -> Deep Interview -> PM debate -> Synthesizer -> CSO/QA`
- friction-scaled pipeline plans
- repo inspection and export
- deterministic validation and verification
- release/product readiness gates
- evidence files that another tool can consume

## What Moves Out Of Core

- external runtime launch
- auth/profile injection
- provider SDK calls
- daemon or hosted service
- full subagent catalog installation
- executable adapter registry

## Practical Integration Shape

### GJC handoff

Boulder exports a plan packet with:

- friction level
- ambiguous assumptions
- Deep Interview questions or answers
- PM debate prompts
- Synthesizer decision fields
- CSO/QA gates for high-friction work
- acceptance criteria
- evidence paths

GJC returns:

- approved plan
- ultragoal goal list when needed
- unresolved questions
- evidence expectations

### LazyCodex handoff

LazyCodex receives:

- GJC-approved plan
- file scope
- tests to write or preserve
- manual QA commands
- forbidden side effects
- expected evidence paths

LazyCodex returns:

- diff or PR
- RED/GREEN test evidence
- manual QA transcript
- unresolved risks

### Boulder gate

Boulder verifies:

- plan evidence exists
- implementation evidence exists
- release state is honest
- package contents are clean
- no forbidden side effects happened

## Rejection Rules

Reject an OSS integration if it:

- increases default install complexity
- requires credentials
- launches external tools from core Boulder commands
- makes Boulder responsible for another runtime's security model
- expands the public surface before M9-M12 evidence is complete
- turns Boulder from an evidence harness into a general agent runtime manager

## Current Recommendation

Keep only two active integrations in the near-term product plan:

1. GJC as the planning and review handoff lane.
2. LazyCodex as the implementation handoff lane.

Everything else remains reference material until release hygiene, M9 evidence integration, and case-study repeatability are complete.
