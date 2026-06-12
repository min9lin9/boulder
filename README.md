# boulder

A min9lin9 operator kit for turning OSS repositories into evidence-backed Codex workflows.

Make OSS repositories agent-ready without losing maintainer control.

`boulder` packages the context maintainers usually keep in their heads: repo briefs, review boundaries, subagent recommendations, provider-aware execution policies, verification gates, release playbooks, exportable Codex workflow notes, and unresolved-risk reports.

It is built for maintainers who use many models, but want one accountable workflow: explicit contracts, approval gates, evidence ledgers, verification gates, and clear risk reports.

Boulder defaults to a har-maker-level operator workflow stack: Superpowers as the workflow spine, GStack as the review gate layer, and Compound as the learning layer. These are workflow contracts, not runtime dependencies.

## Install

```bash
bunx boulder-oss-cli --help
```

Local development:

```bash
bun install
bun run boulder -- --help
```

CI parity:

```bash
bun run ci
```

## Commands

```bash
boulder init
boulder inspect
boulder validate
boulder verify --dry-run
boulder pipeline --friction high
boulder scorecard
boulder benchmark
boulder release-plan
boulder product-readiness
boulder service-readiness
boulder export
```

With Bun before package publication:

```bash
bun run boulder -- init
bun run boulder -- inspect
bun run boulder -- validate
bun run boulder -- verify --dry-run
bun run boulder -- pipeline --friction high
bun run boulder -- scorecard
bun run boulder -- benchmark
bun run boulder -- release-plan
bun run boulder -- product-readiness
bun run boulder -- service-readiness
bun run boulder -- export
```

## What Boulder Creates

- `boulder.yaml` - maintainer harness manifest
- `BOULDER.md` - operator contract for Codex-assisted work
- `docs/REPO_BRIEF.md` - shallow repository brief
- `docs/MAINTAINER_WORKFLOWS.md` - issue/PR/release workflows
- `docs/OPERATOR_WORKFLOW_STACK.md` - Superpowers, GStack, and Compound operator contract
- `docs/VERIFICATION_GATES.md` - evidence and verification rules
- `docs/PROVIDER_POLICY.md` - provider-aware execution boundaries
- `docs/HARNESS_QUALITY_SCORECARD.md` - deterministic harness readiness scorecard
- `docs/RELEASE_PLAN.md` - release readiness checklist and manual publish boundary
- `docs/PRODUCT_READINESS.md` - Codex OSS product-readiness gate report
- `docs/BOULDER_EXPORT.md` - exported maintainer context
- `docs/CODEX_WORKFLOW_NOTES.md` - Codex-ready notes

## Follow-up Direction

- `docs/FOLLOW_UP_BRIEFING.md` - development-agent handoff, acceptance gate, and M8 pipeline-planning direction
- `docs/PIPELINE_PLANNING_SURFACE.md` - `boulder pipeline` command contract and M8 manual QA evidence

## Examples

Generated harness examples are checked into `examples/` so reviewers can inspect Boulder output without running the CLI first.

- [`examples/typescript-library`](examples/typescript-library) - package scripts mapped to `bun run test` and `bun run build`
- [`examples/python-package`](examples/python-package) - Python package metadata with local package verification
- [`examples/mcp-server`](examples/mcp-server) - MCP-shaped TypeScript package with test and typecheck commands

Each example includes `BOULDER.md`, `boulder.yaml`, a repo brief, verification report, provider policy, and Codex workflow notes.

## Manifest Validation

```bash
boulder validate
```

`validate` checks that `boulder.yaml` has maintainers, the default operator workflow stack, workflows, protected paths, verification commands, and approval gating when external providers are enabled.

## Harness Scorecard

```bash
boulder scorecard
```

`scorecard` rates a harness across context contract, operator workflow stack, verification gates, provider policy, export readiness, and review boundaries.

## Benchmark Fixtures

```bash
boulder benchmark
```

`benchmark` checks deterministic fixture definitions for TypeScript library, Python package, and MCP-shaped maintainer workflows. It is not a runtime speed benchmark, model benchmark, or leaderboard claim.

## Release Plan

```bash
boulder release-plan
```

`release-plan` checks release-facing evidence, including operator workflow stack evidence, and writes `docs/RELEASE_PLAN.md`. It keeps publishing manual and does not automate `npm publish`.

## Product Readiness

```bash
boulder product-readiness
```

`product-readiness` checks the Codex OSS application packet, public case studies, GJC planning evidence, LazyCodex implementation evidence, Boulder verification evidence, limitations, and trust/support/security posture.

## Why This Exists

Codex can help with issue triage, PR review, release planning, and safer agent-assisted maintenance. But every repository needs explicit context, workflow boundaries, verification commands, and review discipline before agents can be useful.

Boulder turns that implicit maintainer knowledge into a repeatable harness.

## What This Is Not

- Not a full swarm runtime.
- Not a benchmark leaderboard.
- Not a runtime speed benchmark.
- Not a replacement for local verification.
- Not an integration claim for external OSS projects.
- Not a tool for scanning repositories you do not own or administer.

## Status

`v0.1.7`. Boulder includes a runnable Bun + TypeScript CLI with `init`, `inspect`, `validate`, `verify`, `pipeline`, `scorecard`, `benchmark`, `release-plan`, `product-readiness`, `service-readiness`, `doctor`, `record field-readiness`, and `export`, plus generated example harnesses for representative repo shapes. The CI gate runs the CLI smoke test, Bun test suite, Bun build, and package dry run.

## Public Evidence

- Release: `v0.1.7`
- CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- Evidence notes: [`docs/APPLICATION_EVIDENCE.md`](docs/APPLICATION_EVIDENCE.md)
- Benchmark fixture report: [`docs/BENCHMARK_FIXTURE_REPORT.md`](docs/BENCHMARK_FIXTURE_REPORT.md)
- Release plan: [`docs/RELEASE_PLAN.md`](docs/RELEASE_PLAN.md)
- Product readiness: [`docs/PRODUCT_READINESS.md`](docs/PRODUCT_READINESS.md)
- Verification gate: [`docs/VERIFICATION_GATES.md`](docs/VERIFICATION_GATES.md)
- Provider policy: [`docs/PROVIDER_POLICY.md`](docs/PROVIDER_POLICY.md)
- Trust/support/security posture: [`docs/TRUST_SUPPORT_SECURITY.md`](docs/TRUST_SUPPORT_SECURITY.md)
- Final audit: [`docs/CODEX_OSS_FINAL_AUDIT.md`](docs/CODEX_OSS_FINAL_AUDIT.md)

## Open Source Operations

- Contributor guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Governance: [`GOVERNANCE.md`](GOVERNANCE.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- Repository setup review: [`docs/OSS_REPO_SETUP_REVIEW.md`](docs/OSS_REPO_SETUP_REVIEW.md)
- Development setup: [`docs/contributing/development-setup.md`](docs/contributing/development-setup.md)
- AI contribution policy: [`docs/contributing/ai-contribution-policy.md`](docs/contributing/ai-contribution-policy.md)
- Review policy: [`docs/contributing/review-policy.md`](docs/contributing/review-policy.md)
- Branch protection checklist: [`docs/branch-protection.md`](docs/branch-protection.md)
- Labels and milestones: [`docs/labels-and-milestones.md`](docs/labels-and-milestones.md)

## Service Loop

Boulder service is a repeatable public OSS workflow delivered through CLI, docs, evidence, and support operations. It is not a hosted SaaS.

- Service loop: [`docs/SERVICE_LOOP.md`](docs/SERVICE_LOOP.md)
- Onboarding: [`docs/ONBOARDING.md`](docs/ONBOARDING.md)
- External replay: [`docs/EXTERNAL_REPLAY.md`](docs/EXTERNAL_REPLAY.md)
- Handoff validation: [`docs/HANDOFF_VALIDATION.md`](docs/HANDOFF_VALIDATION.md)
- Operating metrics: [`docs/OPERATING_METRICS.md`](docs/OPERATING_METRICS.md)
- Service readiness: [`docs/SERVICE_READINESS.md`](docs/SERVICE_READINESS.md)
