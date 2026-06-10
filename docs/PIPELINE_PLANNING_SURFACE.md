# Pipeline Planning Surface

Status: M8 implemented

## Purpose

`boulder pipeline` renders a built-in operator pipeline plan for low, medium, or high friction work.

The command is a planning surface only. It does not call providers, launch agents, install packages, write files, or mutate environment state.

## Command

```bash
boulder pipeline [--cwd path] [--friction low|medium|high] [--json]
```

Defaults:

- `--cwd` defaults to the current working directory.
- `--friction` defaults to `medium`.
- Human output is printed unless `--json` is set.

## Friction Levels

| Friction | Required stages | Approval posture |
| --- | --- | --- |
| `low` | `classification`, `synthesizer` | no approval gate by default |
| `medium` | `classification`, `deep-interview`, `pm-debate`, `synthesizer` | PM debate approval notes required |
| `high` | `classification`, `deep-interview`, `pm-debate`, `synthesizer`, `cso-qa` | PM debate and CSO/QA approval required |

## Fail-closed Boundary

Generated plans reject forbidden side-effect categories:

- `credential-access`
- `package-install`
- `external-launch`
- `provider-call`

Invalid friction levels fail with exit code `1`:

```text
ERROR pipeline.friction.invalid: Unsupported friction level "impossible". Expected one of: low, medium, high.
```

## Manual QA Evidence

Commands used for M8:

```bash
bun run ci
bun bin/boulder.ts pipeline --friction low
bun bin/boulder.ts pipeline --friction medium --json
bun bin/boulder.ts pipeline --friction high
bun bin/boulder.ts pipeline --friction impossible
```

Expected result:

- valid friction plans exit `0`
- invalid friction exits `1`
- no command writes files
- no command launches providers or external agents

Static gate:

```bash
rg -n "credential|package install|spawn|exec|openai|anthropic|provider" src test docs/PIPELINE_PLANNING_SURFACE.md docs/COMPETITIVE_BENCHMARK_HARNESS_MANAGER.md
```

Expected interpretation:

- `src/pipeline.ts` hits are allowed only for data-only side-effect categories and forbidden-side-effect validation.
- `src/verify.ts`, `globals.d.ts`, and CLI e2e `exec` hits are pre-existing command execution surfaces, not new pipeline launcher behavior.
- provider hits in docs/tests are policy text, fixture text, or validation assertions.
- M8 must not add native process launch, credential injection, provider calls, or package installation paths.

## M9 Boundary

M9 may integrate pipeline summaries into export or release evidence. M8 intentionally keeps pipeline output separate from `inspect`, `export`, and `release-plan`.
