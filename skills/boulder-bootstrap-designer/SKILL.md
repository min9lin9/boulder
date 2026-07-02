---
name: boulder-bootstrap-designer
description: Use when a user wants to turn a repeated work pattern into a Boulder workflow profile, capability-source setup commands, and first-run guidance. Skill first, CLI later: this does not add a `boulder bootstrap` command.
metadata:
  short-description: Design Boulder bootstrap workflow profiles
---

# boulder-bootstrap-designer

Use this skill to map a repeated repo-level workflow into Boulder commands.

## Output Contract

Return:

1. one recommended MVP profile;
2. the base Boulder profile to save from;
3. capability source candidates to register;
4. copy-paste commands;
5. explicit guardrails.

Do not install tools, clone private repos, modify MCP config, index corpora, or execute GJC, LazyCodex, context-mode, or external model calls. Treat them as candidate capabilities until `boulder doctor` verifies local availability.

## MVP Profiles

| Profile | Base profile | Use when |
| --- | --- | --- |
| `programming-heavy` | `programming-default` | GJC plans code work and LazyCodex executes after review. |
| `research-corpus` | `research-default` | Work depends on official docs, private corpus, context-mode, or cited synthesis. |
| `release-safe` | `ops-default` | Release, CI, npm, tags, rollback notes, and publish evidence matter. |
| `issue-triage` | `ops-default` | Issues need classification, labels, owner routing, and planned follow-up. |
| `docs-reviewer` | `research-default` | README, onboarding, release notes, or docs consistency is the main work. |

Default mapping: `programming-heavy -> programming-default`, `research-corpus -> research-default`, `release-safe -> ops-default`, `issue-triage -> ops-default`, `docs-reviewer -> research-default`. Use `ops-default` for `docs-reviewer` only when the repeated docs work is release/process-heavy.

## Command Template

Replace `<repo>` and `<name>` before returning commands:

```bash
boulder profile list --cwd <repo>
boulder profile resolve --cwd <repo> --task <kind>
boulder profile save <name> --cwd <repo> --profile <base>
boulder profile use <name> --cwd <repo>
boulder capability import --cwd <repo> --from <github-url> --dry-run
boulder capability import --cwd <repo> --from <github-url> --write
boulder quickstart --cwd <repo>
boulder doctor --cwd <repo>
```

Canonical source candidates:

```bash
boulder capability import --cwd <repo> --from https://github.com/Yeachan-Heo/gajae-code --dry-run
boulder capability import --cwd <repo> --from https://github.com/code-yeongyu/lazycodex --dry-run
```

For private corpus or context-mode, require a GitHub repo URL and keep it as a source candidate until `doctor` verifies the local tool or MCP inventory.

## Guardrails

- `doctor` checks availability; it is not an update command.
- Source candidates are metadata under `.boulder/capabilities/imports/`.
- `--dry-run` before `--write`.
- Live executor calls need explicit user approval.
- Keep Boulder’s public flow as `intake -> plan -> execute -> verify -> record`.
