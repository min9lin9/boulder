# EXAMPLES KNOWLEDGE BASE

Status: active
Scope: `examples/`

## OVERVIEW

Each child directory is an embedded target repo used to exercise Boulder onboarding, replay, benchmarks, and profile recommendations.

## STRUCTURE

| Path | Purpose |
| --- | --- |
| `mcp-server/` | Example MCP server target with Node package metadata |
| `python-package/` | Example Python package target with `pyproject.toml` |
| `typescript-library/` | Example TypeScript library target with Node package metadata |

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Boulder target config | `*/boulder.yaml` | Keep examples deterministic and local-first |
| Human target brief | `*/README.md` | Describe the target repo, not Boulder internals |
| Boulder analysis notes | `*/BOULDER.md` | Expected onboarding/replay interpretation |
| Benchmark fixtures | `../fixtures/benchmarks/*.json` | Fixture names mirror example directory names |
| Replay fixtures | `../fixtures/replay/` | External replay examples must stay dry-run safe |

## CONVENTIONS

- Treat each example as a minimal standalone repo. Avoid relying on files outside its directory unless Boulder itself is the caller.
- Keep package metadata realistic but tiny; examples should not become full applications.
- Preserve parallel shape across examples where possible: `README.md`, `BOULDER.md`, `boulder.yaml`, and one ecosystem manifest.
- Prefer deterministic scripts and static metadata over generated output.
- When changing example behavior, update the matching benchmark or replay fixture in the same change.

## ANTI-PATTERNS

- No network-dependent install or test command as an expected happy path.
- No private organization names, secrets, local absolute paths, or machine-specific cache references.
- No claims that external executors are available before `doctor` verifies local inventory.
- No example-only Boulder behavior that is not represented in `src/` and tests.

## CHECKS

```bash
bun test test/readiness-reports.test.ts test/product-readiness.test.ts
bun bin/boulder.ts inspect --cwd examples/typescript-library --json
```
