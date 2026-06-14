# Development Setup

Status: active

## Requirements

- Bun `1.3.5` or compatible with the current CI workflow.
- Git.
- A local checkout of the Boulder repository.

## Optional Executor Runtime

Boulder itself is tested against the current CI Bun runtime. Live downstream GJC execution has a stricter runtime floor:

- GJC live planning: Bun `>=1.3.14`
- LazyCodex handoff: no automatic runtime launch from Boulder core
- Fallback planning and execution: Codex/manual mode

`boulder doctor` reports a warning when the local Bun runtime is below the GJC live execution floor. The warning does not block Boulder CLI checks, replay fixtures, packet validation, or Codex fallback routing.

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
