# Contributor Start Here

> Navigation note: the cohesive developer entry point is now [DEVELOPERS.md](DEVELOPERS.md). This guide remains the external-contributor shortcut it links to.

This guide is the shortest path for an external contributor.

## Pick an Issue

Start with issues labeled:

- `good first issue` - bounded task with clear acceptance criteria
- `help wanted` - maintainer wants outside contribution
- `documentation` - docs-only contribution path
- `enhancement` - product or workflow improvement

Avoid issues labeled `needs decision` or `blocked` until a maintainer narrows the scope.

## First PR Shape

A good first Boulder PR should include:

- one focused change
- a short explanation of why the change is needed
- command evidence from `bun run ci` or the narrower command listed in the issue
- docs updates when behavior, support, or workflow surfaces change

## Local Setup

```bash
git clone https://github.com/min9lin9/boulder.git
cd boulder
bun install
bun run ci
```

## First Boulder Run

To try Boulder on another repository:

```bash
cd path/to/your/repo
bunx boulder-oss-cli init
bunx boulder-oss-cli quickstart
bunx boulder-oss-cli onboard
bunx boulder-oss-cli inspect
bunx boulder-oss-cli doctor
bunx boulder-oss-cli verify --dry-run
bunx boulder-oss-cli service-readiness
```

For the full nondeveloper path, see [`docs/ONBOARDING.md`](ONBOARDING.md).

## First Issues to Look For

### docs freshness

Fix stale ready/blocked wording in public docs.

Acceptance:

- include the `rg` command that found the stale wording
- update only the affected docs
- run `bun run ci`

### replay fixture refresh

Refresh one public replay fixture after reading the target project's official docs first.

Acceptance:

- update the matching `fixtures/replay/*/official-docs.json`
- update the matching replay transcript
- run `boulder replay-check --cwd . --json`

### metric evidence log

Add one share-safe metric log from a public repo run.

Acceptance:

- use `fixtures/service-readiness/metric-log-template.json`
- include a public evidence URL
- run `boulder service-readiness --cwd . --json`

## Before Opening a PR

Run:

```bash
bun run ci
```

Then include:

- issue number
- command output summary
- risk or limitation notes
- screenshots or evidence files only when relevant

AI-assisted changes are welcome, but the contributor must understand and explain the final diff.