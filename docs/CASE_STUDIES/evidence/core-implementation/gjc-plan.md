# GJC Planning Evidence: Core OSS Implementation

## Scenario

Target: `examples/mcp-server`

Purpose: prove the planning lane for a bounded core OSS implementation workflow without making Boulder depend on GJC at runtime.

## GJC Plan

1. Classify the operator request as `core OSS work` with high friction because it can affect maintainers, release gates, and downstream executor handoff.
2. Use Boulder classify output and `pipeline-high.json` as the fixed planning contract.
3. Produce a scoped plan for an implementation lane:
   - Input: repo manifest, exported Boulder maintainer docs, high-friction pipeline.
   - Output: accepted implementation scope, rejected scope creep, validation gates, rollback notes.
   - Required follow-up: LazyCodex receives only the accepted implementation scope and must return evidence paths, not free-form claims.
4. Reject any plan that asks Boulder core to launch external providers, read credentials, or mutate a target repo before CSO/QA approval.

## Accepted Scope

- Use `examples/mcp-server` as the public fixture.
- Treat generated Boulder docs as the source of truth for operator handoff.
- Keep the flow provider-neutral: Boulder orchestrates evidence and gates; GJC plans; LazyCodex implements from the approved contract.

## Rejected Scope Creep

- Do not call model providers from Boulder core.
- Do not publish, tag, or push from this case study.
- Do not claim GJC or LazyCodex executed unless the evidence file records an actual run.

## Handoff

GJC hands LazyCodex this implementation contract:

- Implement only the approved fixture-level change.
- Preserve existing Boulder CLI behavior.
- Return evidence artifacts under `docs/CASE_STUDIES/evidence/core-implementation/`.
- Fail closed if verification evidence is missing.
