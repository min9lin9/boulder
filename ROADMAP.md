# Roadmap

## M1: Public POC

- Runnable Bun + TypeScript CLI.
- `init`, `inspect`, `verify`, `export`.
- Example harness outputs.
- `v0.1.0` release evidence.

## M2: Example Coverage

- TypeScript library example.
- Python package example.
- MCP server example.
- Golden exports for each example.

## M3: Codex Ecosystem Fit

- Codex subagent recommendation map.
- Provider-aware execution policies.
- Attribution-safe compatibility notes for external agent ecosystems.

## M4: Evaluation

- Repeatable task fixtures.
- Harness quality scorecard.
- Runtime and verification evidence.

## M5: Project Capability Imports

- Project-local external skill repo candidate manifests.
- `capability import --dry-run` with no writes or installs.
- `capability import --write` for unverified, non-installing manifests.
- Doctor/quickstart reporting for configured-unverified candidates.
- GJC/LazyCodex adapter source metadata stored as GitHub repo URLs, not shorthand ids.
- Doctor remains read-only diagnosis; update-check is a separate future command surface.

## Future: Update Check

- Compare recorded GitHub repo URLs against remote refs only when network access is explicitly allowed.
- Emit update candidates without installing, cloning, or mutating doctor state.
- Keep update execution approval-gated and separate from `doctor`.

## Future: Prompt Presets

- Save/list/show/render reusable prompt presets.
- Keep preset migration out of workspace file bodies by default.
- Define strict preset body size, source, and handoff safety rules before implementation.
- Add GJC planning and LazyCodex execution preset examples after the safety model is reviewed.
