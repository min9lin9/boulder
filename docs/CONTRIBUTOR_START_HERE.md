# Contributor Start Here

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
bunx boulder-oss-cli inspect
bunx boulder-oss-cli doctor
bunx boulder-oss-cli verify --dry-run
bunx boulder-oss-cli service-readiness
```

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
