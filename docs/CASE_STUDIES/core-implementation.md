# Case Study: Core OSS Implementation Workflow

## Summary

This case study shows how Boulder can structure core OSS work when a heavy Codex user wants multiple agent/executor lanes without making Boulder depend on those runtimes.

The staged workflow is:

1. Boulder classify: identify the task as high-friction `core OSS work`.
2. Deep Interview: expose ambiguity before implementation.
3. PM Debate and Synthesizer: turn tradeoffs into an approved scope.
4. GJC plan: produce the planning/review handoff contract.
5. LazyCodex implement: execute only the accepted implementation scope.
6. Boulder verify: collect evidence, check limits, and fail closed on missing proof.

## Commands

```bash
bun bin/boulder.ts pipeline --friction high --json
bun bin/boulder.ts export --cwd examples/mcp-server --force
```

## Generated Files

- `docs/CASE_STUDIES/evidence/core-implementation/pipeline-high.json`
- `docs/CASE_STUDIES/evidence/core-implementation/BOULDER_EXPORT.md`
- `docs/CASE_STUDIES/evidence/core-implementation/gjc-plan.md`
- `docs/CASE_STUDIES/evidence/core-implementation/lazycodex-implementation-summary.md`

## Category Mapping

This supports the Codex OSS `core OSS work` category because it describes how a maintainer can move from ambiguous task intake to bounded implementation and evidence review.

It also supports maintainer automation indirectly: Boulder does not replace a maintainer, but it makes the approval boundary, generated handoff, and verification artifacts repeatable.

## Scope Creep Control

The explicit scope creep boundary is that Boulder core remains an orchestration and evidence layer. It does not launch GJC, launch LazyCodex, call providers, read credentials, publish packages, or mutate a public repo without an approved implementation lane.

## Limitation

This case study is a public fixture proof, not a benchmark showing external executor runtime scale. Runtime integration with GJC and LazyCodex still needs live executor telemetry before claiming production-grade multi-agent performance.

## Unresolved Risk

The largest unresolved risk is evidence inflation: generated planning artifacts can look stronger than they are if the application packet does not clearly separate actual command output from proposed downstream executor behavior.

## Follow-up

Add a product-readiness gate that blocks submission when the GJC plan, LazyCodex implementation evidence, or Boulder verify artifact is missing.
