# Benchmark Plan

## Scope and evidence boundary

PR8A provides local, deterministic **tooling contracts** for preregistration and evidence verification. It does not perform, report, or imply a field study. In particular, the checked-in planner-benchmark study-root fixture contains no operational run outcomes, scores, comparisons, or promotion result; other planning-contract fixtures may contain clearly structural schema examples.

PR8B is a separate external operation. Operators may conduct it under their own approvals and policies; this repository neither contacts providers nor executes the 36 runs, and external operational outcomes are not checked into the package fixtures.

## 36-run preregistration matrix

The study-root contract freezes the intended matrix before evidence is accepted:

- planners: `gjc`, `boulder-native`, `lazycodex-ulw-plan`
- task classes: `small-bug`, `medium-feature`, `high-risk-change`
- repository shapes: `small-ts-cli`, `medium-multi-module`
- repeats per planner/task/repository cell: `2`

That is `3 × 3 × 2 × 2 = 36` required runs. The checked-in metadata preregisters the matrix but is not proof that any run occurred; externally retained operational evidence must be verified separately.

`fixtures/planner-benchmarks/study-root.json` is a deterministic, fixture-only study-root envelope with the preregistered protocol, manifest, and empty evidence bundle. It deliberately carries no trust root. `fixtures/planner-benchmarks/invalid-study-root.json` is a negative contract fixture whose matrix count is not 36.

## Trust, invocation, and HOLD

An operator must supply the Ed25519 trust root separately from the study root. Trust material is never accepted from the bundle being verified:

```bash
boulder plan benchmark \
  --trust-root /secure/operator/trust-root.json \
  --study-root /secure/operator/study-root.json
```

The trust root authorizes the protocol signer and delegated manifest, bundle, and execution-receipt signers. For a performed study, the verifier requires a signed artifact index and loads every indexed file as bytes from the study-root directory. It rejects byte sets that are missing or extra relative to that signed index, as well as duplicate, traversal, symlink, non-file, and digest-mismatched evidence; signed auxiliary artifacts are allowed only when indexed and byte-verified. A compact envelope remains valid for the shipped `NOT_PERFORMED` fixture; a performed envelope must carry the equivalent indexed evidence bytes or it fails closed.

Eligibility is derived rather than declared. Every one of the 36 scored cell/repeat rows must join to a byte-verified raw-run record, normalization artifact, trusted-source catalog, blinded score lock/reveal mapping, and indexed `boulder.planner-execution-receipt.v1` wrapper Ed25519-signed by a key delegated for the `executor` role. That wrapper must bind an indexed `boulder.common-executor-receipt.v1` whose `executorModel` is exactly `openai-codex/gpt-5.6-sol`. Passed receipts must bind zero executor/test/typecheck exit codes, a patch digest, and indexed patch/test/typecheck output bytes. The verifier recomputes score caps, AC traceability, scored execution status, exclusions, replacement edges, RFC task-class weighting, target minimum, and repeat variance. Any scored execution failure, critical cap, incomplete traceability, invalid replacement, retrospective lock attestation, or insufficient eligible matrix produces an explicit `HOLD` reason. A malformed pre-score attempt may be replaced only through the signed immediate same-cell/repeat exclusion edge. A high average cannot compensate for a safety failure.

The checked-in signatures and key identifiers are explicitly fixture-only placeholders for structural tests. They are not operational credentials, field-study evidence, or signatures that an operator may trust. Real PR8B evidence requires operator-controlled Ed25519 keys and verifiable signatures.

## Immutable evidence rules

PR8B evidence is append-only by identity: raw-run artifacts retain safe relative paths and content digests; normalized records bind to their raw-run digest; exclusions require adjudication evidence. A replacement run carries `replacesRunId`, immediately follows the excluded run for the same cell and repeat, and is joined to the corresponding exclusion edge. Do not overwrite an accepted evidence artifact. Publish a new signed bundle/report that references the prior immutable evidence instead.

A valid contract or a `HOLD` report demonstrates only tooling behavior. Automated blinded review is exploratory evidence, not external maintainer evidence or proof of planner superiority. Tooling readiness and a signed HOLD report do not authorize fallback/preferred promotion.
