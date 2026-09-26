# OpenClaw transcript admission spec

Status: draft contract for the Boulder trace OpenClaw adapter (plan v2, B2/B3).
Fixture baseline: `fixtures/trace/openclaw/30afbaf8-claim/`.

## 1. Schema provenance

The `transcript_events` schema is a **documented claim, not locally verified**
against any installed OpenClaw build.

| Claim | Source |
| --- | --- |
| Rows carry `session_id`, `seq`, `event_json`, `event_zstd`, `event_utf8_bytes`. | boulder-observability-review.md, citing upstream commit `30afbaf8`, `src/config/sessions/transcript-payload.ts` |
| `event_json` is explicitly `NULL` when `event_zstd` holds the compressed payload. | same |
| Decoding validates `event_utf8_bytes` against the decoded payload. | same |
| `createTranscriptPayloadUpdater()` can UPDATE an existing `(session_id, seq)` row in place. | same |
| Live DB path: `$HOME/.openclaw-<profile>/agents/<agent>/agent/openclaw-agent.sqlite`. | one-pass-oci-openclaw `docs/qa/gbrain.md:182` |
| A table named `session_windows` exists alongside `transcript_events` in a live DB. | same file, line 185 — table name only, **no column-level provenance** |

No fuller verified schema (extra columns, indexes, session-table DDL) surfaced
from the deployment repo or the plan documents. The admission baseline is
therefore the minimal documented-claim DDL:

```sql
CREATE TABLE transcript_events (
  session_id        TEXT    NOT NULL,
  seq               INTEGER NOT NULL,
  event_json        TEXT,
  event_zstd        BLOB,
  event_utf8_bytes  INTEGER NOT NULL,
  PRIMARY KEY (session_id, seq)
);
```

Recorded assumptions (inference, not upstream citations):

- `PRIMARY KEY (session_id, seq)` — inferred from the in-place update claim;
  `createTranscriptPayloadUpdater()` needs a stable row identity.
- `event_utf8_bytes` is the decoded UTF-8 byte length in both encodings, not
  only for compressed rows.
- `session_windows` is **excluded** from the v1 baseline until the admission
  gate fingerprints a real database; relying on an unverified table shape is a
  stale_state hazard.

## 2. Admission rules (B2 gate)

A database is admitted only if **all** of the following hold:

1. **Identity and reachability.** The file opens via `bun:sqlite` in explicit
   read-only mode with no create-on-missing behavior (B3).
2. **Schema fingerprint.** `transcript_events` exists with exactly the column
   set `{session_id, seq, event_json, event_zstd, event_utf8_bytes}` and a
   unique/`PRIMARY KEY` constraint on `(session_id, seq)`. Extra indexes or
   extra unrelated tables are tolerated and recorded; extra columns on
   `transcript_events` require an explicit, versioned compatibility rule
   before admission.
3. **Encoding coverage.** Every observed row encoding is supported: plain
   (`event_json` set, `event_zstd NULL`) and zstd (`event_json NULL`,
   `event_zstd` BLOB). A row with both set, or both NULL, is quarantined.
4. **Decode validation.** For zstd rows, decompression must succeed and the
   decoded byte length must equal `event_utf8_bytes`; mismatch = quarantine.
   For plain rows the UTF-8 byte length of `event_json` must equal
   `event_utf8_bytes`; mismatch = quarantine.
5. **Version reporting.** `doctor` reports installed version, schema
   fingerprint, SQLite capabilities, payload encodings, adapter interpretation
   version, and available timing/usage/linking evidence.

An unknown schema is not an empty source: **fail before claiming successful
collection.** `case-07-unsupported-schema.sqlite` is the refusal fixture; the
adapter must reject it with a schema-mismatch error, not collect zero rows and
report success.

## 3. Change-capture rules (B3 consequence of claim d)

- `MAX(seq)` cursors are **forbidden** as a change signal. Claim (d) means a
  payload can change at unchanged `(session_id, seq)`; fixture case 03 plus its
  provenance sidecar demonstrate `MAX(seq)` = 3 before and after a payload
  mutation.
- Change detection is a **full inventory comparison** of the selected session
  within one read transaction: every row's `(session_id, seq)` plus a payload
  revision (decoded bytes or hash), and relevant session metadata. It must
  catch updates with unchanged maximum sequence, row removal, resets, and
  changed usage.
- Snapshot consistency: one read transaction per acquisition; mixing pages
  from different transactions, database replacement, or acquisition errors =
  reject/retry, never certify an incomplete snapshot complete.
- Bounded acquisition: configured row, encoded-byte, decoded-byte, and
  query-wait limits; a session exceeding a limit is rejected, not truncated.

## 4. Per-row dispositions (B4)

Every acquired row gets exactly one disposition, and the manifest reconciles
input count against the three counts:

- **normalized** — matches an admitted semantic shape; identities,
  relationships (tool_call/tool_result `requestId` matching), units, and
  values validate.
- **ignored** — matches a named, versioned allowlist rule for a known
  non-observability record.
- **quarantined** — unknown or invalid semantics; preserve locator, revision/
  hash, and a safe diagnostic. A snapshot containing quarantines is stored for
  investigation but collection returns incomplete/nonzero; the checkpoint
  means "this evidence was captured," not "everything normalized."

Missing optional timing (fixture case 04) is a fidelity limitation, not
malformed data. Fixture case 06 enumerates the v1 quarantine classes:
negative usage, dangling tool_result, unknown role, unparseable `event_json`.

## 5. Token accounting caution

Transcript usage fields must not be copied into `gen_ai.*` by renaming. The
review (HIGH: token accounting) notes OpenClaw's diagnostic `promptTokens`
includes ordinary input plus cache input buckets, and the diagnostic shape is
not proof that transcript payloads share its semantics. Usage conversion per
source format is defined with fixture backing before any totals are emitted.

## 6. Reversibility of the compression choice

Fixtures use real zstd (`Bun.zstdCompress`, Bun >= 1.3.14). If an admitted
build is found to use a different encoding, the fixtures are regenerated from
`generate.ts` after decoding — no fixture depends on zstd byte identity for
correctness, only on the documented encoding label. If Bun ever lacks zstd,
the fallback is a gzip-encoded fixture explicitly labeled in the fixture
README as a substitute; the adapter decode path remains a separate todo.
