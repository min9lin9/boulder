# boulder

A min9lin9 operator kit for turning OSS repositories into evidence-backed Codex workflows.

Make OSS repositories agent-ready without losing maintainer control.

`boulder` packages the context maintainers usually keep in their heads: repo briefs, review boundaries, subagent recommendations, provider-aware execution policies, verification gates, release playbooks, exportable Codex workflow notes, and unresolved-risk reports.

It is built for maintainers who use many models, but want one accountable workflow: explicit contracts, approval gates, evidence ledgers, verification gates, and clear risk reports.

Boulder defaults to a har-maker-level operator workflow stack: Superpowers as the workflow spine, GStack as the review gate layer, and Compound as the learning layer. These are workflow contracts, not runtime dependencies.

## Install

Published package:

```bash
bunx boulder-oss-cli --help
```

Published install smoke is tracked in [`docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt`](docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt).

Local development:

```bash
bun install
bun run boulder -- --help
```

CI parity:

```bash
bun run ci
```

## First Run

Use this path when trying Boulder on a new OSS repository for the first time:

```bash
cd path/to/your/repo
bunx boulder-oss-cli quickstart
bunx boulder-oss-cli init
bunx boulder-oss-cli onboard
bunx boulder-oss-cli inspect
bunx boulder-oss-cli doctor
bunx boulder-oss-cli verify --dry-run
bunx boulder-oss-cli service-readiness
```

What each step means:

- `quickstart` shows the first-run guided flow without mutating files.
- `init` creates the maintainer harness files.
- `onboard` is an alias for `quickstart`; run it again after `init` to see the next commands.
- `inspect` summarizes the repository shape and likely maintainer workflows.
- `doctor` checks the local capability inventory for skills, MCP servers, plugins, and runtimes.
- `verify --dry-run` shows the verification commands without changing the repository.
- `service-readiness` tells you whether the repository has enough onboarding, support, replay, handoff, field-evidence, and product-readiness evidence for repeatable use.

For a higher-friction task, generate the operator pipeline before implementation:

```bash
bunx boulder-oss-cli pipeline --friction high
```

## Commands

Most users only need `init`, `inspect`, `doctor`, `verify --dry-run`, and `service-readiness` on the first pass.

```bash
boulder init
boulder quickstart
boulder onboard
boulder inspect
boulder validate
boulder verify --dry-run
boulder pipeline --friction high
boulder scorecard
boulder benchmark
boulder release-plan
boulder release-check
boulder product-readiness
boulder service-readiness
boulder doctor
boulder record field-readiness --run-id oss-run-1 --evidence evidence/field-readiness/oss-run-1
boulder export
```

For local development, prefix commands with `bun run boulder --`.

## Repository Setup Status

Boulder matches the NAIYA-style open source repository setup structure:

- Root docs: `README.md`, `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `GOVERNANCE.md`, `ROADMAP.md`
- GitHub operations: `.github/CODEOWNERS`, pull request template, issue forms, CI workflow, Security/CodeQL workflow
- Contribution policy: development setup, review policy, AI contribution policy
- Protection docs: branch protection checklist, labels and milestones
- Product evidence: install smoke, GitHub Actions evidence, product readiness, service readiness, trust/support/security posture

The repo is structured for external contribution intake: anyone can propose work, but merge decisions stay gated by contracts, review, CI, security checks, and recorded evidence.

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

## New Contributors

Start with GitHub issues labeled `good first issue` or `help wanted`.

- Contributor start guide: [`docs/CONTRIBUTOR_START_HERE.md`](docs/CONTRIBUTOR_START_HERE.md)
- Community policy: [`docs/COMMUNITY.md`](docs/COMMUNITY.md)
- Release workflow: [`docs/RELEASE_WORKFLOW.md`](docs/RELEASE_WORKFLOW.md)
- External replay cases: [`docs/CASE_STUDIES/external-replay.md`](docs/CASE_STUDIES/external-replay.md)
- Development setup: [`docs/contributing/development-setup.md`](docs/contributing/development-setup.md)
- AI contribution policy: [`docs/contributing/ai-contribution-policy.md`](docs/contributing/ai-contribution-policy.md)

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
boulder release-check
```

`release-plan` checks release-facing evidence, including operator workflow stack evidence, and writes `docs/RELEASE_PLAN.md`. `release-check` checks npm/GitHub release evidence before manual publishing. Neither command automates `npm publish`.

## Product Readiness

```bash
boulder product-readiness
```

`product-readiness` checks the Codex OSS application packet, public case studies, GJC planning evidence, LazyCodex implementation evidence, Boulder verification evidence, limitations, and trust/support/security posture.

## Service Readiness

```bash
boulder service-readiness
```

`service-readiness` checks onboarding, official-docs coverage, external replay, handoff validation, field evidence, operating metrics, support routes, and product-readiness status. The service becomes public-ready only when product-readiness also passes.

## Capability Doctor

```bash
boulder doctor
```

`doctor` inspects the local capability inventory fixture for skills, MCP servers, plugins, and runtimes, then maps them into Boulder workflow lanes.

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
- GitHub Actions evidence: [`docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt`](docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt)
- Published install smoke evidence: [`docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt`](docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt)
- Verification gate: [`docs/VERIFICATION_GATES.md`](docs/VERIFICATION_GATES.md)
- Provider policy: [`docs/PROVIDER_POLICY.md`](docs/PROVIDER_POLICY.md)
- Trust/support/security posture: [`docs/TRUST_SUPPORT_SECURITY.md`](docs/TRUST_SUPPORT_SECURITY.md)
- Final audit: [`docs/CODEX_OSS_FINAL_AUDIT.md`](docs/CODEX_OSS_FINAL_AUDIT.md)

## Open Source Operations

- Contributor guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- New contributor start guide: [`docs/CONTRIBUTOR_START_HERE.md`](docs/CONTRIBUTOR_START_HERE.md)
- Community policy: [`docs/COMMUNITY.md`](docs/COMMUNITY.md)
- Governance: [`GOVERNANCE.md`](GOVERNANCE.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- Repository setup review: [`docs/OSS_REPO_SETUP_REVIEW.md`](docs/OSS_REPO_SETUP_REVIEW.md)
- Development setup: [`docs/contributing/development-setup.md`](docs/contributing/development-setup.md)
- AI contribution policy: [`docs/contributing/ai-contribution-policy.md`](docs/contributing/ai-contribution-policy.md)
- Review policy: [`docs/contributing/review-policy.md`](docs/contributing/review-policy.md)
- Branch protection checklist: [`docs/branch-protection.md`](docs/branch-protection.md)
- Labels and milestones: [`docs/labels-and-milestones.md`](docs/labels-and-milestones.md)
- Release workflow: [`docs/RELEASE_WORKFLOW.md`](docs/RELEASE_WORKFLOW.md)

## Service Loop

Boulder service is a repeatable public OSS workflow delivered through CLI, docs, evidence, and support operations. It is not a hosted SaaS.

- Service loop: [`docs/SERVICE_LOOP.md`](docs/SERVICE_LOOP.md)
- Onboarding: [`docs/ONBOARDING.md`](docs/ONBOARDING.md)
- External replay: [`docs/EXTERNAL_REPLAY.md`](docs/EXTERNAL_REPLAY.md)
- Handoff validation: [`docs/HANDOFF_VALIDATION.md`](docs/HANDOFF_VALIDATION.md)
- Operating metrics: [`docs/OPERATING_METRICS.md`](docs/OPERATING_METRICS.md)
- Service readiness: [`docs/SERVICE_READINESS.md`](docs/SERVICE_READINESS.md)
