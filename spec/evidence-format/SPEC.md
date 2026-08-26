# boulder-evidence-format (draft v0)

Status: DRAFT v0 - feedback wanted. Derived from Boulder's shipped implementation (`src/plan-receipts.ts`); every field here exists in running code today.

## Why

AI coding agents act fast and quietly. Post-run audit logs tell you what happened; they do not give a maintainer control over what happens. This format captures the missing piece: **signed, portable proof that a named human approved exactly this plan or exactly this execution, before it ran**, bound to the artifacts it covers by sha256 digests.

## Model

```
planning packet --digest-bindings--> APPROVAL CHALLENGE (pending)
      |                                        |
      human approval code (nonce + codeHash)   |
      v                                        v
APPROVAL RECEIPT (HMAC-signed) <---- consumes challenge
```

A challenge binds run identity, purpose (plan|execution), and artifact digests. A receipt consumes the challenge and carries an HMAC signature over its canonical payload (signature field excluded). Key rotation and invalidation are first-class (`keyVersion`, lifecycle statuses).

## Schemas

- [schemas/plan-approval-challenge.json](schemas/plan-approval-challenge.json)
- [schemas/execution-approval-challenge.json](schemas/execution-approval-challenge.json)
- [schemas/receipt.json](schemas/receipt.json)

## Conventions

- Digests: `sha256:<64 hex>`; ids match `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`.
- HMAC domains are purpose-separated (`boulder.plan.challenge.v1`, `boulder.plan.approval.v1`, `boulder.execution.challenge.v1`, `boulder.execution.approval.v1`).
- Canonicalization follows Boulder's planning-canonical JCS-style rules so signatures verify across implementations.

## Compatibility & extension policy

`schemaVersion` values are frozen (`boulder.*.v1`). Extensions must be additive: new optional fields only, never re-meaning existing ones. Breaking changes require a new version string, not an edit.

## Reference implementation

Boulder emits and verifies these objects today - see `src/plan-receipts.ts` (types, validators, canonical signing payloads) and the CLI approval gates. A cross-tool converter sample is tracked as the B1 completion milestone of `.omo/plans/boulder-9-9-product-plan.md`.

## Feedback

Open an issue on https://github.com/min9lin9/boulder or reach the maintainer - see CONTRIBUTING.md. Outreach round B2 contacts are logged in the project outreach tracker.
