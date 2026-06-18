# Boulder Case Studies

Status: selected targets for Codex OSS application evidence

## Selection Rule

Case studies must be reproducible without private credentials and must produce publishable evidence. At least two studies must be externally inspectable as a public repo or public artifact.

## Matrix

| Study | Official category | Repository | Public proof type | Commands | Output report |
| --- | --- | --- | --- | --- | --- |
| PR review workflow | pull request review | `https://github.com/min9lin9/boulder` | externally inspectable public repo and public artifact | `bun bin/boulder.ts inspect --cwd . --json`, `bun bin/boulder.ts pipeline --friction medium`, `bun bin/boulder.ts export --cwd . --force` | `docs/CASE_STUDIES/pr-review.md` |
| release workflow | release workflow | `https://github.com/min9lin9/boulder` | externally inspectable public repo and public artifact | `bun bin/boulder.ts release-plan --cwd . --json`, `bun pm pack --dry-run --ignore-scripts`, `bun run ci` | `docs/CASE_STUDIES/release-workflow.md` |
| core implementation | core OSS work | `https://github.com/min9lin9/boulder/tree/main/examples/mcp-server` | externally inspectable public artifact in the Boulder repo | `bun bin/boulder.ts init --cwd examples/mcp-server --force`, `bun bin/boulder.ts pipeline --friction high --json`, `bun bin/boulder.ts export --cwd examples/mcp-server --force` | `docs/CASE_STUDIES/core-implementation.md` |
| external replay | public repo replay | `min9lin9/kimi-agent-swarm-skill`, `Yeachan-Heo/gajae-code`, `VoltAgent/awesome-codex-subagents` | public replay fixtures and transcripts with official-docs-first constraints | `boulder replay-check --json`, `boulder replay-run --dry-run --json` | `docs/CASE_STUDIES/external-replay.md` |
| issue to PR to CI | contribution operations | `https://github.com/min9lin9/boulder` | maintainer-authored issue-to-change evidence | `bun test`, `bun run ci`, GitHub CI/Security | `docs/CASE_STUDIES/issue-pr-ci-cycle.md` |

## Evidence Directories

- `docs/CASE_STUDIES/evidence/pr-review/`
- `docs/CASE_STUDIES/evidence/release-workflow/`
- `docs/CASE_STUDIES/evidence/core-implementation/`
- `docs/CASE_STUDIES/evidence/external-replay/`
- `fixtures/replay/*/`

External replay is public-target reproducibility evidence. It is not independent third-party adoption proof.

## Non-Goals

- No private repo evidence as primary proof.
- No credential-dependent workflow.
- No external provider calls.
- No package publishing.
- No GitHub release creation.
- No hosted-service claim.

## Acceptance Mapping

- PR review workflow proves Boulder can package Codex-ready review context.
- release workflow proves Boulder can support release planning while keeping publish actions manual.
- core implementation proves the staged Boulder -> GJC -> LazyCodex -> Boulder pattern can govern bounded implementation work.
- external replay proves Boulder keeps public OSS official docs in the loop before recommending commands or compatibility work.
- issue to PR to CI proves contributor-facing work can be mapped to acceptance criteria, tests, and CI evidence.
