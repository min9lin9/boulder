# boulder

A min9lin9 operator kit for turning OSS repositories into evidence-backed Codex workflows.

Boulder makes an OSS repo agent-ready without giving up maintainer control. It creates repo briefs, operator contracts, workflow boundaries, release checks, replay fixtures, and exportable Codex notes.

Current published package: `boulder-oss-cli@0.1.15`.

## 3-minute route for non-developers

In local Codex, start in the target repo and ask:

```text
boulder로 현재 repo 초기설정하고 quickstart, inspect, doctor까지 실행해줘.
```

Prefer the local `boulder` skill when it is installed. For CLI use after trusting the npm package:

```bash
bunx boulder-oss-cli@0.1.15 init
bunx boulder-oss-cli@0.1.15 quickstart
bunx boulder-oss-cli@0.1.15 inspect
bunx boulder-oss-cli@0.1.15 doctor
```

`doctor` does not install GJC or LazyCodex. It reports whether they are configured preferences, detected local tools, or safe to use through Codex fallback.

If GJC or LazyCodex is not installed yet, register their canonical GitHub source URLs as project-local candidates first. This keeps Boulder read-only until you explicitly choose what to install or wire up:

```bash
bunx boulder-oss-cli@0.1.15 capability import --from https://github.com/Yeachan-Heo/gajae-code --dry-run
bunx boulder-oss-cli@0.1.15 capability import --from https://github.com/Yeachan-Heo/gajae-code --write
bunx boulder-oss-cli@0.1.15 capability import --from https://github.com/code-yeongyu/lazycodex --write
bunx boulder-oss-cli@0.1.15 doctor
```

`--dry-run` prints the manifest path and adapter guess without writing. `--write` creates `.boulder/capabilities/imports/*.json`. `doctor` then shows these as source candidates, not installed tools.

## Install

```bash
bunx boulder-oss-cli@latest --help
```

Use `@latest` for the newest published CLI, or an explicit version for deterministic smoke checks. Maintainers can still verify a local checkout with `bun run ci` before publishing.

Local development: `bun install`, `bun run boulder -- --help`, then `bun run ci`.

## First Run

```bash
cd path/to/your/repo
bunx boulder-oss-cli@latest init
bunx boulder-oss-cli@latest quickstart
bunx boulder-oss-cli@latest onboard
bunx boulder-oss-cli@latest capability import --from https://github.com/Yeachan-Heo/gajae-code --dry-run
bunx boulder-oss-cli@latest doctor
```

`quickstart` tells you the next repo-specific commands. `doctor` tells you whether GJC, LazyCodex, local skills, MCPs, plugins, and Bun are available or only configured as preferences.

For higher-friction work:

```bash
bunx boulder-oss-cli@latest pipeline --friction high
bunx boulder-oss-cli@latest handoff packet --adapter gajae-code --include src/cli.ts
bunx boulder-oss-cli@latest handoff review --adapter gajae-code
bunx boulder-oss-cli@latest handoff send --adapter gajae-code --approve-external --approval-code <code> --dry-run
```

## Local Codex Skill

If you use Boulder from local Codex, start a new Codex session in the target repo and ask:

```text
boulder quickstart
```

`init` writes the legacy-compatible `boulder.yaml`, while runtime routing resolves through workflow profiles first. The default active profile is `programming-default`: planning uses `gajae-code` and execution uses `lazycodex`, both in `detect-and-suggest` mode. `profile resolve`, `quickstart`, `pipeline`, `doctor`, and `export` report the active profile explicitly.

If the target repo is not the current working directory, include `--cwd`:

```text
boulder quickstart --cwd /path/to/repo
```

The `boulder` skill uses the local Boulder checkout instead of `bunx` or `npx`, because local Codex sandboxes may block tempdir writes or npm registry access.

For a repeated workflow, ask Codex to design the repo-local profile before wiring commands:

```text
Use $boulder-bootstrap-designer to turn this repeated task into a Boulder workflow profile.
```

This is skill first, CLI later. The designer chooses one of `programming-heavy`, `research-corpus`, `release-safe`, `issue-triage`, or `docs-reviewer`, then returns `boulder profile save/use`, `capability import`, `quickstart`, and `doctor` commands. GJC, LazyCodex, context-mode, and private corpus repositories are candidate capabilities until `doctor` verifies the local installation or inventory.

GJC and LazyCodex are configured automatically as adapter preferences, but they may not be installed locally. `doctor` reports GJC as `available` only when local inventory includes `gajae-code`, `gjc`, the Hermes coordinator MCP bridge (`gjc_coordinator`, `gjc-coordinator`, `gjc-coordinator-mcp`), `gjc-delegation`, or `gjc_delegate_*` delegate tools. Otherwise it reports `configured-unverified` and keeps live executor calls approval-gated. `handoff send --dry-run` prints the candidate command without external execution.

For GJC, Boulder follows the Hermes MCP bridge surface:

```bash
gjc mcp-serve coordinator --check --json
gjc setup hermes --root . --smoke
```

Live planning delegation through `gjc_delegate_plan` is suggested only after packet review and explicit approval.

See [`docs/BOULDER_CODEX_SKILL_USAGE.ko.md`](docs/BOULDER_CODEX_SKILL_USAGE.ko.md).

## Core Commands

```bash
boulder init
boulder quickstart
boulder onboard
boulder inspect
boulder profile resolve
boulder capability import --from https://github.com/Yeachan-Heo/gajae-code --dry-run
boulder doctor
boulder verify --dry-run
boulder pipeline --friction high
boulder handoff packet --adapter gajae-code --include src/cli.ts
boulder handoff review --adapter gajae-code
boulder handoff send --adapter gajae-code --approve-external --approval-code <code> --dry-run
boulder replay-check
boulder replay-run --dry-run
boulder release-check
boulder product-readiness
boulder service-readiness
boulder export
```

Workflow profiles are the preferred routing surface. `boulder.yaml.executors` remains supported as a legacy fallback and migration source, including executor modes such as `local-only`, `packet-only`, and `approval-gated-send`.

## Why Boulder

Codex can help with triage, planning, review, release work, and agent-assisted maintenance. Boulder turns implicit maintainer knowledge into a repeatable harness with explicit evidence gates.

It is not a swarm runtime, benchmark leaderboard, hosted service, or replacement for local verification.

## Public Evidence

- Release candidate: `v0.1.15`
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
