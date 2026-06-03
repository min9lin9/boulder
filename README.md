# boulder

A min9lin9 operator kit for turning OSS repositories into evidence-backed Codex workflows.

Make OSS repositories agent-ready without losing maintainer control.

`boulder` packages the context maintainers usually keep in their heads: repo briefs, review boundaries, subagent recommendations, provider-aware execution policies, verification gates, release playbooks, exportable Codex workflow notes, and unresolved-risk reports.

It is built for maintainers who use many models, but want one accountable workflow: explicit contracts, approval gates, evidence ledgers, verification gates, and clear risk reports.

## Install

```bash
bunx boulder-oss-cli --help
```

Local development:

```bash
bun install
bun run boulder -- --help
```

## Commands

```bash
boulder init
boulder inspect
boulder verify --dry-run
boulder export
```

With Bun before package publication:

```bash
bun run boulder -- init
bun run boulder -- inspect
bun run boulder -- verify --dry-run
bun run boulder -- export
```

## What Boulder Creates

- `boulder.yaml` - maintainer harness manifest
- `BOULDER.md` - operator contract for Codex-assisted work
- `docs/REPO_BRIEF.md` - shallow repository brief
- `docs/MAINTAINER_WORKFLOWS.md` - issue/PR/release workflows
- `docs/VERIFICATION_GATES.md` - evidence and verification rules
- `docs/PROVIDER_POLICY.md` - provider-aware execution boundaries
- `docs/BOULDER_EXPORT.md` - exported maintainer context
- `docs/CODEX_WORKFLOW_NOTES.md` - Codex-ready notes

## Why This Exists

Codex can help with issue triage, PR review, release planning, and safer agent-assisted maintenance. But every repository needs explicit context, workflow boundaries, verification commands, and review discipline before agents can be useful.

Boulder turns that implicit maintainer knowledge into a repeatable harness.

## What This Is Not

- Not a full swarm runtime.
- Not a benchmark leaderboard.
- Not a replacement for local verification.
- Not an integration claim for external OSS projects.
- Not a tool for scanning repositories you do not own or administer.

## Status

`v0.1.0-pre`. M1 focuses on a runnable Bun + TypeScript CLI with `init`, `inspect`, `verify`, and `export`.
