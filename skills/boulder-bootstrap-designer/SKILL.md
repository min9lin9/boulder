---
name: boulder-bootstrap-designer
description: Use when a user wants to turn a repeated work pattern into a Boulder workflow profile, capability-source setup commands, and first-run guidance. The skill designs the setup; `boulder bootstrap interview` surfaces the CLI report.
metadata:
  short-description: Design Boulder bootstrap workflow profiles
---

# boulder-bootstrap-designer

Use this skill to map a repeated repo-level workflow into Boulder commands.

## Output Contract

Return:

1. one recommended MVP profile;
2. the base Boulder profile to save from;
3. capability source candidates to register, including profile-scoped subagent catalogs, skills, MCP servers, RAG sources, and DB ledgers when useful;
4. deterministic `profileScores`, `capabilityScores`, and a short recommendation rationale;
5. copy-paste commands that activate the built-in profile;
6. explicit guardrails.

Do not install tools, clone private repos, modify MCP config, index corpora, or execute GJC, LazyCodex, context-mode, agency-agents installers, or external model calls. Treat them as candidate capabilities until `boulder doctor` verifies local availability.

The score means task-to-profile fit or capability setup priority, not certainty from an LLM classifier. A score is always an integer from 0 to 100 and should be explained with matched task signals.

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
boulder bootstrap interview --cwd <repo> --task "<repeated work>"
boulder profile list --cwd <repo>
boulder profile resolve --cwd <repo> --task <kind>
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

For subagents, prefer a profile-scoped catalog import instead of global install-all. The default public catalog is:

```bash
boulder capability import --cwd <repo> --from https://github.com/msitarzewski/agency-agents --dry-run
```

Use it in two cases:

- existing profile path: choose a small subset for `programming-heavy`, `research-corpus`, `release-safe`, `issue-triage`, or `docs-reviewer`;
- interview path: ask what repeated work the user does, activate the matching built-in profile, then choose the matching subset.

Recommended MVP subsets:

- `programming-heavy`: Codebase Onboarding Engineer, Software Architect, Code Reviewer, Minimal Change Engineer.
- `research-corpus`: Research Analyst, Evidence Collector, Technical Writer.
- `release-safe`: SRE, Git Workflow Master, Code Reviewer, Technical Writer.
- `issue-triage`: Senior Project Manager, Reality Checker, Technical Writer.
- `docs-reviewer`: Technical Writer, Codebase Onboarding Engineer, Evidence Collector.

## Guardrails

- `doctor` checks availability; it is not an update command.
- Source candidates are metadata under `.boulder/capabilities/imports/`.
- `--dry-run` before `--write`.
- Import catalogs first; recommend only the selected subagents for the active profile until a separate install flow is explicitly approved.
- Treat skill, MCP, RAG, and DB recommendations as a plan until `doctor` verifies local availability.
- Live executor calls need explicit user approval.
- Keep Boulder’s public flow as `intake -> plan -> execute -> verify -> record`.
