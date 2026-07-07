---
name: boulder
description: Use when working with Boulder, boulder-oss-cli, evidence-backed Codex workflows, OSS repo onboarding, replay checks, release checks, product readiness, service readiness, or Codex workflow exports. Prefer this skill whenever the user asks to run Boulder from local Codex.
metadata:
  short-description: boulder local Codex harness
---

# boulder

Use `boulder` as the repo-local operating harness for Codex work:

`intake -> plan -> execute -> verify -> record`

When the user writes `boulder`, treat it as an explicit request to run this skill.

For user-facing Korean usage guidance, read `references/usage.ko.md`.

## Invocation

In local Codex, do not rely on `bunx` or `npx` for `boulder`. The Codex sandbox may block tempdir writes or registry access.

Use the bundled wrapper script from this skill:

```bash
./scripts/boulder-local.sh <command> --cwd <target-repo>
```

The wrapper resolves `BOULDER_HOME` from the packaged skill location by default.

Override it only when the Boulder checkout moved:

```bash
BOULDER_HOME=/path/to/boulder ./scripts/boulder-local.sh inspect --cwd /path/to/repo --json
```

## Command Shape

`boulder` options come after the Boulder command:

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
./scripts/boulder-local.sh init --cwd /path/to/repo
./scripts/boulder-local.sh quickstart --cwd /path/to/repo
./scripts/boulder-local.sh inspect --cwd /path/to/repo --json
./scripts/boulder-local.sh doctor --cwd /path/to/repo --json
./scripts/boulder-local.sh pipeline --cwd /path/to/repo --friction medium --json
./scripts/boulder-local.sh verify --cwd /path/to/repo --dry-run
./scripts/boulder-local.sh export --cwd /path/to/repo
```

`init` configures the default executor preferences in `boulder.yaml`: planning uses `gajae-code`, execution uses `lazycodex`, and both stay in `detect-and-suggest` mode. This does not prove GJC or LazyCodex are installed. `quickstart` reports the preferences; `doctor` reports adapters as `available` only when they are found in the local Codex inventory, otherwise `configured-unverified`. Do not auto-run GJC or LazyCodex unless the user explicitly approves the live executor command.

If GJC or LazyCodex is not installed, record their canonical source URLs as candidates before recommending manual setup:

```bash
./scripts/boulder-local.sh capability import --cwd /path/to/repo --from https://github.com/Yeachan-Heo/gajae-code --dry-run
./scripts/boulder-local.sh capability import --cwd /path/to/repo --from https://github.com/Yeachan-Heo/gajae-code --write
./scripts/boulder-local.sh capability import --cwd /path/to/repo --from https://github.com/code-yeongyu/lazycodex --write
./scripts/boulder-local.sh doctor --cwd /path/to/repo --json
```

Source candidates are read-only planning metadata under `.boulder/capabilities/imports/`. They are not installed tools and do not authorize cloning, updating, package installation, provider calls, or live adapter execution.

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
