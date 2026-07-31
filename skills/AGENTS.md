# skills KNOWLEDGE BASE

Scope: `skills/`

## OVERVIEW

Packaged Codex skill content shipped with Boulder. Skill docs must match CLI behavior and avoid promising automatic setup.

## WHERE TO LOOK

| Skill | Purpose |
| --- | --- |
| `boulder/SKILL.md` + `scripts/boulder-local.sh` | Local Codex wrapper and common Boulder command flow |
| `boulder-bootstrap-designer/SKILL.md` | Preset/interview bootstrap design guidance |
| `boulder-native-planner/SKILL.md` | Native planner preview workflow (read-only `plan analyze\|show\|validate`) |

Each skill dir also carries `agents/openai.yaml` metadata; only these three skill dirs ship in the npm package.

## CONVENTIONS

- Skill instructions are operational, not marketing copy.
- Prefer exact command shapes users can run.
- `boulder-local.sh` resolves `BOULDER_HOME` from the skill dir (override it explicitly when running against another checkout), finds `bun` on PATH or `~/.bun/bin/bun`, and execs `bun $BOULDER_HOME/bin/boulder.ts "$@"`. Command shape: `boulder-local.sh <command> --cwd <repo>`.
- Keep `bunx`/network assumptions out of local Codex invocation guidance when wrapper scripts are required.
- Mention that GJC, LazyCodex, agency-agents, skills, MCP, RAG, and corpus sources are candidates until doctor verifies them.

## ANTI-PATTERNS

- Do not say Boulder installs or enables selected agents by itself.
- Do not bypass approval gates for external models or live executors.
- Do not duplicate large README sections.

## CHECKS

```bash
rg -n 'boulder bootstrap|profile use|doctor|capability import' skills
bun test test/source-cleanliness.test.ts
```
