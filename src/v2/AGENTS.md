# v2 KNOWLEDGE BASE

Scope: `src/v2/`

## OVERVIEW

Self-contained K1 kernel: a bounded execution pipeline (plan validation -> effect gating -> capability execution -> result synthesis -> injected critique). Gating and status are pinned by `docs/adr/0003-v2-kernel-gates.md`. Entry point: `executeV2Envelope()` in `execution.ts`; CLI via `src/v2-command.ts` (`boulder v2`).

## STRUCTURE

| File | Role |
| --- | --- |
| `contracts.ts` | Wire types, schema/version constants, effect classes, authority contracts |
| `canonical.ts` | JCS canonicalization + digest helpers |
| `validation.ts` | Envelope/plan/artifact/evidence/result/critique/authority validation |
| `effect-gate.ts` | Effect gating + in-memory authority verifier |
| `capability.ts`, `critique.ts` | Fixture capability registry / critique evaluator |
| `execution.ts` | End-to-end execute pipeline |
| `lifecycle.ts` | Lifecycle state machine |

## CONVENTIONS

- Sibling-only imports with explicit `.js` specifiers; `test/v2-source-boundary.test.ts` forbids imports from v1 domain modules.
- Strict I-JSON/JCS digests, ordered linked digest arrays, explicit schema-version constants.
- Effect vocabulary is closed; non-`none` effects fail closed with `v2.effect.unsupported`.
- `extensions` keys must be reverse-domain and non-reserved.
- Verifier, evaluator, and time are injected; no ambient clock and no runtime writes.
- Fixtures live in `fixtures/v2-kernel/`: canonical none-effect baseline, unsupported-authority path, and authority mutation vectors.

## ANTI-PATTERNS

- No v1/domain imports, no network, no filesystem writes inside the kernel.
- No new effect classes without ADR 0003 gate changes plus fixture vectors plus CLI wiring.
- No hand-editing the authority-vector corpus; regenerate it via `test/v2-authority-vectors.generate.ts`.

## CHECKS

```bash
bun test test/v2-contracts.test.ts test/v2-execution.test.ts test/v2-effect-gate.test.ts test/v2-cli-e2e.test.ts test/v2-source-boundary.test.ts
```
