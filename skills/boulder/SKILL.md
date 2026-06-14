---
name: boulder
description: Use when working with Boulder, boulder-oss-cli, evidence-backed Codex workflows, OSS repo onboarding, replay checks, release checks, product readiness, service readiness, or Codex workflow exports. Prefer this skill whenever the user asks to run Boulder from local Codex.
metadata:
  short-description: /Boulder local Codex harness
---

# /Boulder

Use `/Boulder` as the repo-local operating harness for Codex work:

`intake -> plan -> execute -> verify -> record`

When the user writes `/Boulder`, treat it as an explicit request to run this skill.

For user-facing Korean usage guidance, read `references/usage.ko.md`.

## Invocation

In local Codex, do not rely on `bunx` or `npx` for `/Boulder`. The Codex sandbox may block tempdir writes or registry access.

Use the bundled wrapper script from this skill:

```bash
./scripts/boulder-local.sh <command> --cwd <target-repo>
```

The wrapper defaults `BOULDER_HOME` to:

```bash
/Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder
```

Override it only when the Boulder checkout moved:

```bash
BOULDER_HOME=/path/to/boulder ./scripts/boulder-local.sh inspect --cwd /path/to/repo --json
```

## Command Shape

`/Boulder` options come after the Boulder command:

```bash
./scripts/boulder-local.sh inspect --cwd /path/to/repo --json
```

Do not call it as:

```bash
./scripts/boulder-local.sh --cwd /path/to/repo inspect
```

## Default Workflow

For a target OSS repository, start with:

```bash
./scripts/boulder-local.sh quickstart --cwd /path/to/repo
./scripts/boulder-local.sh inspect --cwd /path/to/repo --json
./scripts/boulder-local.sh doctor --cwd /path/to/repo --json
./scripts/boulder-local.sh pipeline --cwd /path/to/repo --friction medium --json
./scripts/boulder-local.sh verify --cwd /path/to/repo --dry-run
./scripts/boulder-local.sh export --cwd /path/to/repo
```

Use `low` friction for small doc/config changes, `medium` for normal feature work, and `high` for release, CI, security, or cross-repo changes.

## Product Gates

Before claiming a repo is reusable by external users, run:

```bash
./scripts/boulder-local.sh release-check --cwd /path/to/repo --json
./scripts/boulder-local.sh replay-check --cwd /path/to/repo --json
./scripts/boulder-local.sh product-readiness --cwd /path/to/repo --json
./scripts/boulder-local.sh service-readiness --cwd /path/to/repo --json
```

Treat failing gates as concrete follow-up work. Do not soften a failing gate into a prose-only caveat.

## Evidence

Use `export` to package the working state and `record field-readiness` when there is external evidence:

```bash
./scripts/boulder-local.sh record field-readiness --cwd /path/to/repo --run-id <id> --evidence <path> --json
```

Evidence should be reproducible: command transcript, CI URL/run id, npm version, release URL, replay transcript, or handoff validation.
