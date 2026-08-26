# k2a-f KNOWLEDGE BASE

Scope: `src/k2a-f/`

## OVERVIEW

Byte-first reader, validator, and canonical digesting for the frozen k2a-f contract foundation. Entry points: `parseK2aFContractFoundationBytes()` in `reader.ts`, plus `validateK2aFContractFoundation()` and `digestK2aFContractFoundation()`. Locked to a single contract shape; not a public runtime surface.

## STRUCTURE

| File | Role |
| --- | --- |
| `reader.ts` | Byte reader / custom JSON scanner / entry parse (64 KiB input limit) |
| `contracts.ts` | Contract types + lexical rules |
| `canonical.ts` | Canonicalization + digest helpers |
| `validation.ts` | Contract validation + digest projection equivalence checks |

## CONVENTIONS

- Byte-oriented iterative reader: rejects BOM, invalid UTF-8, and duplicate keys before `JSON.parse`; hard 64 KiB input limit.
- Sibling-only imports with explicit `.js` specifiers.
- Validation collects stable sorted issues with phased diagnostics; tests pin exact issue ids/messages and byte-boundary behavior.
- Frozen golden fixture: `fixtures/k2a-f/contract-foundation.v1.json` (valid + invalid entries).

## ANTI-PATTERNS

- No `JSON.parse` on raw input ahead of the scanner's duplicate-key/BOM/UTF-8 checks.
- No loosening pinned issue ids/messages without a deliberate contract change and fixture version bump.
- No new consumers beyond the k2a-f tests/validation flow without an explicit integration decision.

## CHECKS

```bash
bun test test/k2a-f-reader.test.ts test/k2a-f-contract-foundation.test.ts
```
