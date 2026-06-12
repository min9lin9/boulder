# Issue to PR to CI Cycle

Status: maintainer-authored evidence

## Cycle

- Issue-level gap: external replay fixtures existed, but repeatable replay execution evidence and a dry-run runbook were missing.
- Change branch/commit path: implemented directly on `main` through Codex with local gates before push.
- PR substitute: maintainer-owned fast path; the same evidence requirements apply before release.
- CI evidence: GitHub CI and Security are required after push.

## Acceptance Criteria

- `boulder replay-check --json` returns `ready`.
- `boulder replay-run --dry-run --json` returns `ready`.
- External replay transcript files exist for all public replay fixtures.
- README first screen stays focused on install, first run, commands, public evidence, and contributor entry points.
- `bun run ci` passes before publish.

## Evidence

- `docs/CASE_STUDIES/evidence/external-replay/kimi-agent-swarm-skill.txt`
- `docs/CASE_STUDIES/evidence/external-replay/gajae-code.txt`
- `docs/CASE_STUDIES/evidence/external-replay/awesome-codex-subagents.txt`
- `test/cli.test.ts`
- `test/cli-e2e.test.ts`

