# ADR 0002: Contract-First Development

Status: Accepted

## Context

Agent-assisted coding can produce plausible but unstable changes. Boulder needs clear contracts before broad implementation.

## Decision

Contract-first development applies to:

- CLI command names, flags, stdout, stderr, and exit codes
- `boulder.yaml`
- pipeline plan JSON
- export docs
- scorecard output
- release-plan output
- product-readiness output
- provider policy and protected paths

Contract changes should include:

- an issue, plan, or ADR for non-trivial changes
- tests for behavior and failure cases
- docs update or explicit docs non-impact statement
- manual QA evidence for user-facing surfaces
- rollback notes when generated artifacts or release state changes

## Consequences

Boulder can accept AI-assisted contributions, but only when maintainers can inspect and verify the contract being changed.
