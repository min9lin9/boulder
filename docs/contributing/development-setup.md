# Development Setup

Status: active

## Requirements

- Bun `1.3.5` or compatible with the current CI workflow.
- Git.
- A local checkout of the Boulder repository.

## Install

```bash
bun install
```

## Common Commands

```bash
bun bin/boulder.ts --help
bun test
bun run ci
bun run pack:dry-run
bun run boulder -- product-readiness
```

## CI Parity

The local command matching CI is:

```bash
bun run ci
```

It runs CLI smoke, the Bun test suite, a Bun build, and package dry-run.

## Evidence Expectations

Every behavior-changing pull request should include:

- commands run
- test output
- generated docs or fixtures changed
- manual QA evidence when the user-facing surface changes
- unresolved risks

Docs-only changes may use static checks instead of new unit tests, but the PR must say why no behavior test was needed.
