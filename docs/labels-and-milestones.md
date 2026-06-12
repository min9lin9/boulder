# Labels and Milestones

Status: proposed operating catalog

## Labels

Type:

- `type: bug`
- `type: feature`
- `type: docs`
- `type: ai-assisted`
- `type: release`

Priority:

- `priority: p0`
- `priority: p1`
- `priority: p2`

Area:

- `area: cli`
- `area: docs`
- `area: product-readiness`
- `area: release`
- `area: github`
- `area: examples`
- `area: fixtures`

Workflow:

- `needs triage`
- `needs decision`
- `needs review`
- `good first issue`
- `help wanted`
- `blocked`

## Milestones

- `M0 Repo setup`: contributor-safe repository surface, templates, governance, branch protection docs.
- `M1 CLI contract`: stable command behavior, manifest validation, tests, and docs.
- `M2 Product readiness`: public CI, install smoke, support/security templates, handoff fixtures, final audit.
- `M3 Public release`: tagged release, package publish or tarball evidence, release notes, submission packet.

## Usage Rules

- Keep labels small and consistent.
- Use `good first issue` only when the task is bounded and has clear acceptance criteria.
- Use `help wanted` only when external contribution is welcome without private context.
- Use milestones for reviewable batches, not vague themes.
