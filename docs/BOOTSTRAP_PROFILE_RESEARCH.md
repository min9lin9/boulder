# Bootstrap Profile Research

Date: 2026-07-02

## Decision

MVP bootstrap profiles are a small library of repeatable repo-level workflows, not a new runtime layer.

Recommended MVP set:

1. `programming-heavy`
2. `research-corpus`
3. `release-safe`
4. `issue-triage`
5. `docs-reviewer`

Keep Boulder’s public surface as:

```text
intake -> plan -> execute -> verify -> record
```

Keep the internal lifecycle hidden inside each profile:

```text
classification -> deep-interview -> pm-debate -> synthesizer -> execution -> critic -> qa -> compound
```

## Profile Defaults

| MVP profile | Base profile | Reason |
| --- | --- | --- |
| `programming-heavy` | `programming-default` | Code work where GJC plans and LazyCodex executes after review. |
| `research-corpus` | `research-default` | Source-backed research, official docs, context-mode, and private corpus work. |
| `release-safe` | `ops-default` | Release, CI, npm, tags, rollback notes, and publish evidence. |
| `issue-triage` | `ops-default` | Issue intake, labels, priorities, owner routing, and planned follow-up. |
| `docs-reviewer` | `research-default` | README, onboarding, release notes, and documentation consistency. |

Use `ops-default` for `docs-reviewer` only when the repeated docs work is release/process-heavy.

## Implementation Boundary

Allowed:

- Recommend a built-in profile and show the separate `boulder profile use` command.
- Record capability source candidates under `.boulder/capabilities/imports/`.
- Show bootstrap state in `quickstart` and `doctor`.

Not allowed in MVP:

- Add a one-step install or setup shortcut.
- Clone private repos.
- Modify MCP config.
- Install context-mode or corpus tooling.
- Launch GJC, LazyCodex, or external model calls without explicit approval.
- Combine `doctor` and `update`.

## Recommended Order

1. Keep `boulder-bootstrap-designer` as the profile design skill.
2. Encode these five profiles as documented templates.
3. Use `boulder bootstrap interview` to surface read-only profile scores, capability scores, and setup recommendations before considering any approved setup shortcut.
