# v2 KNOWLEDGE BASE

Scope: `src/v2/`

## OVERVIEW

Self-contained K1 kernel: a bounded execution pipeline (plan validation -> effect gating -> capability execution -> result synthesis -> injected critique). Gating and status are pinned by `docs/adr/0003-v2-kernel-gates.md`. Entry point: `executeV2Envelope()` in `execution.ts`; CLI via `src/v2-command.ts` (`boulder v2`). Static Procedure and Work candidates plus the pure REF-E-WORK-01 replay harness are additive contract experiments only; they are not wired into K1 execution.

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
| `procedure.ts` | Strict static Procedure compiler candidate; no executor |
| `work.ts` | Immutable exact-field v1 Work revision/attempt/receipt candidate |
| `work-durable*.ts` | Additive v2 durable identities plus exact/bounded canonical validation |
| `work-event*.ts`, `work-events.ts` | Strict canonical Work event and JSONL contracts |
| `work-reducer.ts`, `work-replay*.ts` | Pure replay, recovery barrier, and injected-observation reconcile |

## CONVENTIONS

- Sibling-only imports with explicit `.js` specifiers; `test/v2-source-boundary.test.ts` forbids imports from v1 domain modules.
- Strict I-JSON/JCS digests, ordered linked digest arrays, explicit schema-version constants.
- Effect vocabulary is closed; non-`none` effects fail closed with `v2.effect.unsupported`.
- `extensions` keys must be reverse-domain and non-reserved.
- Verifier, evaluator, and time are injected; no ambient clock and no runtime writes.
- Fixtures live in `fixtures/v2-kernel/`: canonical none-effect baseline, unsupported-authority path, and authority mutation vectors.
- Static Procedure fixtures live separately in `fixtures/v2-procedure/` and never imply same-run Human-loop execution.
- REF-E-WORK-01 vectors live in `fixtures/v2-work/`; they exercise pure records and injected observations, never a live runner or adapter.

## ANTI-PATTERNS

- No v1/domain imports, no network, no filesystem writes inside the kernel.
- No new effect classes without ADR 0003 gate changes plus fixture vectors plus CLI wiring.
- Durable Work replay never dispatches a runner or effect; reconcile returns an action proposal only.
- Durable Work replay requires an injected trusted root, per-event authentication, and
  approval authentication; a missing runner first proposes a durable retryable terminal,
  never a blind retry.
- No hand-editing the authority-vector corpus; regenerate it via `test/v2-authority-vectors.generate.ts`.

## CHECKS

```bash
bun test test/v2-contracts.test.ts test/v2-execution.test.ts test/v2-effect-gate.test.ts test/v2-cli-e2e.test.ts test/v2-source-boundary.test.ts test/v2-procedure.test.ts test/v2-work.test.ts test/v2-work-durable.test.ts test/v2-work-events.test.ts test/v2-work-scenarios.test.ts test/v2-work-recovery.test.ts test/v2-work-fixtures.test.ts test/v2-work-boundary-adversarial.test.ts test/v2-work-replay-adversarial.test.ts test/v2-work-hardening-adversarial.test.ts test/v2-work-evidence-adversarial.test.ts
```
