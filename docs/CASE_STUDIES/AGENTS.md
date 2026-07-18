# CASE STUDIES KNOWLEDGE BASE

Status: active
Scope: `docs/CASE_STUDIES/`

## OVERVIEW

Case studies are public-facing proof docs backed by checked-in evidence artifacts. They must read as reproducible product evidence, not narrative claims alone.

## STRUCTURE

| Path | Purpose |
| --- | --- |
| `README.md` | Case study index and navigation |
| `*.md` | Scenario narratives tied to concrete Boulder workflows |
| `evidence/` | Raw or summarized command outputs, manifests, and replay artifacts |

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Add a new case study | `README.md`, then a peer `*.md` file | Keep titles and scenario names consistent |
| Release workflow evidence | `release-workflow.md`, `evidence/release-workflow/` | Include manifest and dry-run/package proof |
| PR/review evidence | `pr-review.md`, `evidence/pr-review/` | Preserve command outputs that back the claim |
| External replay evidence | `external-replay.md`, `evidence/external-replay/` | Keep replay constraints explicit and dry-run scoped |
| Core implementation evidence | `core-implementation.md`, `evidence/core-implementation/` | Tie behavior claims to tests or CLI output |

## CONVENTIONS

- Every claim about Boulder behavior needs a nearby evidence file or a command that can regenerate it.
- Evidence paths should be stable and scenario-named; do not bury release evidence in generic scratch directories.
- Keep commands copy-pasteable from the repo root unless the text explicitly says otherwise.
- Separate observed output from interpretation. Markdown narrative explains; evidence files prove.
- Prefer compact excerpts over pasted full terminal sessions when the full output adds no new contract.

## ANTI-PATTERNS

- No aspirational success language without a referenced artifact.
- No evidence that depends on local private paths, secrets, or uncommitted workspace state.
- No framing `capability import --dry-run` as installation.
- No suggesting `doctor` installs, updates, or enables tools.
- No hiding failed gates behind prose caveats; update the product or mark the case study incomplete.

## CHECKS

```bash
bun test test/product-readiness.test.ts test/readiness-reports.test.ts
bun bin/boulder.ts release-check --cwd . --json
```
