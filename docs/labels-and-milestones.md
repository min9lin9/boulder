# Labels and Milestones

Status: proposed operating catalog

## Labels

Type:

- `bug`
- `enhancement`
- `documentation`
- `question`

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

Starter issues:

- Use `good first issue` for docs, fixtures, examples, and small CLI evidence improvements that can be completed without private context.
- Use `help wanted` when the task benefits from external repo experience or a second maintainer perspective.
- Every starter issue must include acceptance criteria and a verification command.

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
- Prefer GitHub's default labels unless a new label changes triage behavior.
