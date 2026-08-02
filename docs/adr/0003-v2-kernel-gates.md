# ADR 0003: Bounded v2 Kernel Gates

Status: Accepted for the bounded K0/K1 program; K2–K4 remain separate gates.

## Context

Boulder preserves v1 as the authoritative surface while proving a small, additive v2 execution kernel. This record freezes the load-bearing wire, authority, effect, evidence, and rollback decisions so that a fixture cannot silently widen the runtime trust boundary.

## Decision

### Gate boundaries

| Gate | Required outcome | Status implied by this ADR |
| --- | --- | --- |
| K0 — decision/freeze | Exact contracts, vectors, source boundary, compatibility inventory, and rollback posture are reviewable. | Required before K1 work. |
| K1 — kernel execution proof | One deterministic in-memory `none` Capability proves Plan → gate → Artifact/Evidence/Result → injected Critique, with no target mutation. | Does not prove migration, Kits, Packs, Gate D, or release. |
| K2 — reusable ecosystem proof | Separately approved Packs/SDK and two Kits reuse at least three identical Capabilities without a Core patch or fork. | Not current behavior. |
| K3 — independent Gate D | A domain expert uses public distribution/docs in a fresh environment to install, run, and remove a third Kit, with retained protocol/log evidence. | Not current behavior. |
| K4 — migration and guidance cutover | Separately approved v1 compatibility/shadow-parity, migration/deprecation/escape-hatch evidence, release/documentation review, and guidance cutover. | Not current behavior. |

Root `AGENTS.md` MUST NOT advertise v2 as the authoritative surface or claim K2–K4 behavior before the corresponding gate evidence lands. Accuracy edits that describe the tree as it exists (new modules, subsystems, or commands) are permitted through K0–K3 and MUST NOT assert gate outcomes; a wholesale replacement of the v1 guidance remains a K4 action requiring K1–K3 evidence and the K4 cutover approval.

### Counterevidence (2026-07-31)

This clause originally read "Root `AGENTS.md` MUST remain unchanged through K0–K3." That byte-freeze was written against a file that had already legitimately evolved: the committed diff `10732cb..HEAD` rewrote root `AGENTS.md` (+92/−45) to document the landed native-planner stack, and a documentation refresh (init-deep) added the `src/v2/`, `src/k2a-f/`, `fixtures/`, and `evidence/` entries. Verification showed no test or fixture depends on root `AGENTS.md` content (package-inventory, docs-registry, and source-cleanliness tests reference paths, not bytes), and reverting to the frozen bytes would make the documentation lie about the committed tree. The clause is therefore scoped to gate-outcome claims rather than byte immutability.

### Contract and canonicalization

All v2 records are plain I-JSON with exact `boulder.v2.*.v1` schema versions. IDs are non-empty safe slugs (`[a-z][a-z0-9-]{0,63}`), digest values are `sha256:` plus 64 lower-case hexadecimal characters, reference arrays are ordered, duplicate-free, and resolve exactly once. Validators reject unknown fields, collect at most 100 issues sorted by `(path,id)`, and never return a partial executable object. Namespaced opaque `extensions` are retained but never interpreted by Core; Core imports only sibling `src/v2/` modules and runtime primitives, never v1 or Kit/Pack/domain modules.

`canon(x)` is RFC 8785 JCS over I-JSON: reject duplicate names, non-finite numbers, lone surrogate code points, and non-I-JSON values; encode the whitespace-free JCS text as UTF-8 without a BOM. Every digest preimage is UTF-8 `DOMAIN`, one LF byte, then `canon(PROJECTION)`, without a terminal newline. A self-digest field is omitted from its projection, never blanked. Unknown fields are rejected before projection.

| Digest | Domain | Projection |
| --- | --- | --- |
| `policySnapshot.digest` | `boulder.v2.policy.v1` | `{policyRevision}` |
| `scope.scopeDigest` | `boulder.v2.scope.v1` | `{kind,resources}` |
| `input.digest` | `boulder.v2.input.v1` | `value` |
| `planDigest` | `boulder.v2.plan.v1` | complete Plan except `planDigest` |
| `contentDigest` | `boulder.v2.content.v1` | `content` |
| `artifactDigest` | `boulder.v2.artifact.v1` | complete Artifact except `artifactDigest` |
| `evidence.digest` | `boulder.v2.evidence.v1` | complete Evidence except `digest` |
| `resultDigest` | `boulder.v2.execution-result.v1` | complete Result except `resultDigest` |
| `critiqueDigest` | `boulder.v2.critique.v1` | complete Critique except `critiqueDigest` |
| `evaluator.policyDigest` | `boulder.v2.evaluator-policy.v1` | complete evaluator policy |
| `eventDigest` | `boulder.v2.authority-event.v1` | complete AuthorityEvent except `eventDigest` and `signature` |
| `procedureDigest` | `boulder.v2.procedure.v1` | complete static Procedure except `procedureDigest` |
| `workRevisionDigest` | `boulder.v2.work-revision.v1` | complete static Work revision except `workRevisionDigest` |

Artifacts bind their content, Plan, step, and input. Evidence names the produced artifact and artifact digest. Results and critiques carry ordered digest arrays paired position-for-position with their ID arrays. An injected evaluator may return `pass` only when exact result/artifact/evidence provenance and digests match, required evidence kinds are present, evaluator policy/provenance match, and no hard finding exists.

The Procedure and Work-revision rows pin additive static candidate projections only. They do not authorize Procedure execution, durable Work transitions, acceptance-as-completion, or any K2-K4 gate claim.

### Effect and authority boundary

The complete effect vocabulary is `none`, `local-read`, `local-write`, `remote-read`, `remote-write`, `communicate`, `financial`, `identity`, `signing`, and `destructive`. `none` has empty resources, requires no authority event, and is the sole K1 executable effect. Every non-`none` effect is fail-closed: it requires a verified exact authority binding, then remains `v2.effect.unsupported` because K1 implements no Capability for it. No non-`none` branch invokes a Capability or mutates target, host, network, or `.boulder/` state.

Authority events are untrusted envelope data. Only an injected verifier receives trusted `(issuer,keyId)` public-key state, current policy revision, clock, verifier availability, and replay store. The envelope supplies no trusted configuration, public trust path, environment input, wrapper parser, or durable nonce store. The only algorithm is `Ed25519`; public keys are canonical unpadded base64url encodings of 32 octets and signatures are canonical unpadded base64url encodings of 64 octets. The signature preimage domain is `boulder.v2.authority-signature.v1` plus LF plus JCS of the event without `signature`, including the computed `eventDigest`.

Timestamps are UTC RFC3339 milliseconds. After structural validation, authority checks are ordered: unsupported algorithm, unknown key, revoked key, invalid event digest, invalid signature, invalid timestamp, expired, stale, policy mismatch, exact binding mismatch, replay; verifier unavailability is `v2.authority.verifier_unavailable`. The verifier requires `signedAt <= now < expiresAt`, a maximum age of 300000 ms, current policy equality, and exact workflow/plan revision/step/effect/class/scope/input bindings. It atomically consumes the nonce only after every check succeeds. Rejection or unavailability never consumes it. The verification-only `local-read` vector is injected-only: valid authority verifies, consumes its nonce, returns `v2.effect.unsupported`, and makes zero Capability calls.

### Canonical `none` envelope

`fixtures/v2-kernel/valid-none-effect-execution.json` is the frozen canonical baseline. It deliberately omits `authorityEvents`; `authorityEvents: []` is a different record. It contains no caller-authored artifact, result, or critique. This is the exact envelope, including all frozen digests:

```json
{"extensions":{"org.example.fixture":{"label":"canonical"}},"plan":{"extensions":{"org.example.fixture":{"label":"canonical"}},"intent":{"acceptance":["artifact-nonempty","evidence-fixture-output"],"id":"intent-1","objective":"uppercase fixture message"},"planDigest":"sha256:682409ebcd3075d7fe315af78f0417a4f368c494e1cc91722194f42621dc48d5","planRevision":1,"policySnapshot":{"digest":"sha256:389c3257e3101ced1d432e37e7aaad7a5fd2fce92b19c572e12c94da102f8dcd","policyRevision":"policy-1"},"schemaVersion":"boulder.v2.plan.v1","steps":[{"capabilityBinding":{"capabilityId":"fixture-uppercase","capabilityVersion":"1.0.0","invocationId":"invoke-1"},"declaredEffects":[{"class":"none","id":"effect-1","inputDigest":"sha256:61dfca047dac4db1c9206c8a27dced51f1fd22d9baa4fb9ef03a0dfc0a7424cd","schemaVersion":"boulder.v2.effect.v1","scope":{"kind":"none","resources":[],"scopeDigest":"sha256:07f15fed3722ea4f93edffcb8f5fd1ef94e496e17343f14a42dc55a0fe0581e9"}}],"dependsOn":[],"id":"step-1","input":{"digest":"sha256:61dfca047dac4db1c9206c8a27dced51f1fd22d9baa4fb9ef03a0dfc0a7424cd","schemaId":"org.example.fixture-input.v1","value":{"message":"boulder"}},"requiredEvidenceKinds":["fixture-transform"]}],"workflowId":"workflow-1"},"requestedStepId":"step-1","schemaVersion":"boulder.v2.execution-envelope.v1"}
```

The fixture Capability accepts only `fixture-uppercase@1.0.0` with `org.example.fixture-input.v1` `{message:string}` containing non-empty ASCII lower-case letters. It produces the canonical summary `{canonicalMessage:"BOULDER",length:7}` for `boulder` and `fixture-transform` evidence. The only fixture evaluator is `fixture-evaluator@1.0.0` with policy digest `sha256:b0bd7eb26b46393fd3e84c80d063976dd33e6d58e62f2bf02579283ab73d1473`.

### K0 fixture and generated-vector review

The structural vectors are deliberately small: `invalid-schema-version.json` asserts `v2.schema.invalid`; `invalid-multi-error.json` asserts stable sorting across `v2.digest.mismatch`, `v2.reference.duplicate`, and `v2.reference.unknown`. They are input vectors, not new wrapper contracts.

The separate authority baseline and its 18 ordered mutations are generated from one frozen I-JSON source. The generator may derive only JCS preimages, SHA-256 digests, Ed25519 signatures, linkage, and fixture bytes; it accepts no source override. Its `generationSetDigest` covers the complete source. The RFC identity is RFC 8032 §7.1 test vector 1; the public key is `11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo`. The seed is generator-only and MUST NOT appear in documentation, fixtures, runtime source/configuration, or guidance.

Before K1 begins, the generated baseline and mutation bytes, paths, output SHA-256 values, set digest, generator SHA-256, command/output identity, and seed-exclusion scan result MUST be bound in an immutable ledger and independently approved by Architect and Critic. Any source, mutation ordering, generator, linkage, or output-byte drift invalidates that approval. This gate does not add a public authority success path.

### Compatibility, publication, and rollback

K0/K1 leaves v1 commands, schemas, defaults, profiles, package topology, version, and root guidance unchanged. Current status is no publication authorization: K0/K1 does not authorize a 0.1.16 publication, a default switch, a README repositioning, or any K2–K4 capability claim.

Before merge, remove the additive K0/K1 files, route, tests, fixtures, and this ADR together; no data cleanup is required because the bounded kernel has no durable target state. If merged but unreleased, revert the bounded change while retaining test and failure evidence and without weakening v1 or package-inventory checks. A post-release rollback is outside this authorization: it requires a compatible deprecation path, migration and escape-hatch documentation, a supported-version window, old-route tests until end-of-life, and separately approved release action.
