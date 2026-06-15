# boulder

A min9lin9 operator kit for turning OSS repositories into evidence-backed Codex workflows.

Boulder makes an OSS repo agent-ready without giving up maintainer control. It creates repo briefs, operator contracts, workflow boundaries, release checks, replay fixtures, and exportable Codex notes.

Current package: `boulder-oss-cli@0.1.11`.

## Install

```bash
bunx boulder-oss-cli@latest --help
```

Use `@latest` or an explicit version for deterministic smoke checks.

Local development:

```bash
bun install
bun run boulder -- --help
bun run ci
```

## First Run

```bash
cd path/to/your/repo
bunx boulder-oss-cli@latest quickstart
bunx boulder-oss-cli@latest init
bunx boulder-oss-cli@latest onboard
bunx boulder-oss-cli@latest inspect
bunx boulder-oss-cli@latest doctor
bunx boulder-oss-cli@latest verify --dry-run
bunx boulder-oss-cli@latest service-readiness
```

For higher-friction work:

```bash
bunx boulder-oss-cli@latest pipeline --friction high
```

## Local Codex Skill

If you use Boulder from local Codex, start a new Codex session in the target repo and ask:

```text
boulder quickstart
```

For first-time setup:

```text
boulder로 현재 repo 초기설정하고 quickstart, inspect, doctor까지 실행해줘.
```

If the target repo is not the current working directory, include `--cwd`:

```text
boulder quickstart --cwd /path/to/repo
```

The `boulder` skill uses the local Boulder checkout instead of `bunx` or `npx`, because local Codex sandboxes may block tempdir writes or npm registry access.

GJC and LazyCodex are not executed automatically. Boulder can detect and route planning/execution workflows, but external executors should be enabled explicitly.

See [`docs/BOULDER_CODEX_SKILL_USAGE.ko.md`](docs/BOULDER_CODEX_SKILL_USAGE.ko.md).

## Core Commands

```bash
boulder init
boulder quickstart
boulder onboard
boulder inspect
boulder doctor
boulder verify --dry-run
boulder pipeline --friction high
boulder replay-check
boulder replay-run --dry-run
boulder release-check
boulder product-readiness
boulder service-readiness
boulder export
```

For local development, prefix commands with `bun run boulder --`.

## What Boulder Creates

- `boulder.yaml` - maintainer harness manifest
- `BOULDER.md` - Codex operator contract
- `docs/REPO_BRIEF.md` - repository brief
- `docs/OPERATOR_WORKFLOW_STACK.md` - Superpowers, GStack, and Compound workflow contract
- `docs/VERIFICATION_GATES.md` - verification rules
- `docs/PROVIDER_POLICY.md` - provider approval boundaries
- `docs/BOULDER_EXPORT.md` and `docs/CODEX_WORKFLOW_NOTES.md` - shareable handoff notes

## Why Boulder

Codex can help with triage, planning, review, release work, and agent-assisted maintenance. Boulder turns implicit maintainer knowledge into a repeatable harness with explicit evidence gates.

It is not a swarm runtime, benchmark leaderboard, hosted service, or replacement for local verification.

## Public Evidence

- Release: [`v0.1.11`](https://github.com/min9lin9/boulder/releases/tag/v0.1.11)
- npm package: [`boulder-oss-cli`](https://www.npmjs.com/package/boulder-oss-cli)
- CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- Product readiness: [`docs/PRODUCT_READINESS.md`](docs/PRODUCT_READINESS.md)
- Service readiness: [`docs/SERVICE_READINESS.md`](docs/SERVICE_READINESS.md)
- External replay cases: [`docs/CASE_STUDIES/external-replay.md`](docs/CASE_STUDIES/external-replay.md)
- Release workflow: [`docs/RELEASE_WORKFLOW.md`](docs/RELEASE_WORKFLOW.md)
- Final audit: [`docs/CODEX_OSS_FINAL_AUDIT.md`](docs/CODEX_OSS_FINAL_AUDIT.md)

## Contributors

Start with GitHub issues labeled `good first issue` or `help wanted`.

- Start guide: [`docs/CONTRIBUTOR_START_HERE.md`](docs/CONTRIBUTOR_START_HERE.md)
- Community policy: [`docs/COMMUNITY.md`](docs/COMMUNITY.md)
- Development setup: [`docs/contributing/development-setup.md`](docs/contributing/development-setup.md)
- AI contribution policy: [`docs/contributing/ai-contribution-policy.md`](docs/contributing/ai-contribution-policy.md)
- Governance: [`GOVERNANCE.md`](GOVERNANCE.md)

## More Docs

- Architecture: [`docs/WORKFLOW_ARCHITECTURE.md`](docs/WORKFLOW_ARCHITECTURE.md)
- Case studies: [`docs/CASE_STUDIES/README.md`](docs/CASE_STUDIES/README.md)
- Capability doctor: [`docs/CAPABILITY_DOCTOR.md`](docs/CAPABILITY_DOCTOR.md)
- Operating metrics: [`docs/OPERATING_METRICS.md`](docs/OPERATING_METRICS.md)
- Trust/support/security: [`docs/TRUST_SUPPORT_SECURITY.md`](docs/TRUST_SUPPORT_SECURITY.md)
