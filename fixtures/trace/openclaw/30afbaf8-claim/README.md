# OpenClaw transcript fixtures — stamp `30afbaf8-claim`

Synthetic `openclaw-agent.sqlite` fixture databases for the Boulder trace
OpenClaw adapter. Regenerate with:

```bash
cd fixtures/trace/openclaw/30afbaf8-claim
bun generate.ts
```

## Provenance (read this before trusting the schema)

The `transcript_events` schema here is a **documented claim, not verified
against a live installation**. Sources:

- `boulder-observability-review.md` (operator plan notepad),
  citing upstream commit `30afbaf8`,
  `src/config/sessions/transcript-payload.ts`:
  1. rows carry `session_id`, `seq`, `event_json`, `event_zstd`,
     `event_utf8_bytes`;
  2. `event_json` is explicitly `NULL` when `event_zstd` stores the compressed
     payload;
  3. decoding validates `event_utf8_bytes`;
  4. `createTranscriptPayloadUpdater()` can UPDATE an existing
     `(session_id, seq)` row in place.
- `one-pass-oci-openclaw` `docs/qa/gbrain.md:182` documents the live remote
  path `$HOME/.openclaw-<profile>/agents/<agent>/agent/openclaw-agent.sqlite`,
  and line 185 mentions a second table name, `session_windows`. That mention
  has **no column-level provenance**, so these fixtures intentionally omit it;
  the installed-version admission gate (plan B2) must fingerprint the real
  database before the adapter relies on any additional table.

Because no fuller verified schema surfaced, the fixtures use the minimal
documented-claim DDL:

```sql
CREATE TABLE transcript_events (
  session_id        TEXT    NOT NULL,
  seq               INTEGER NOT NULL,
  event_json        TEXT,            -- NULL when event_zstd is set
  event_zstd        BLOB,            -- NULL when event_json is set
  event_utf8_bytes  INTEGER NOT NULL, -- decoded UTF-8 byte length
  PRIMARY KEY (session_id, seq)
);
```

Assumptions recorded: `PRIMARY KEY (session_id, seq)` is inferred from the
update-in-place claim (d); `event_utf8_bytes` is populated for plain rows too
(interpreted as decoded byte length in both encodings). Admission rules live in
`docs/trace/openclaw-admission.md`.

## Compression choice

Real zstd via `Bun.zstdCompress` / `Bun.zstdDecompress` (verified present in
Bun 1.3.14; async API). No fallback encoding is used. Reversibility: the
generator self-checks a decode roundtrip for every compressed row. Caveat:
compressed bytes are deterministic for identical input on the same zstd build,
but a different zstd build could emit different bytes — decode before comparing
across toolchains.

## Determinism

Fixed session IDs, fixed timestamps (2026-01-05T12:00:00Z + 1 minute per row),
fixed insert order, fresh DB file per run. Verified: two consecutive
`bun generate.ts` runs produce byte-identical `.sqlite` files (sha256 diff
empty). The only documented nondeterminism risk is the zstd-build caveat above.

## Fixture cases

| File | Case | Contents |
| --- | --- | --- |
| `case-01-plain.sqlite` | 1. Happy path, plain `event_json` | `sess-plain-001`, seq 1–5: model-set, user message, tool_call `req-plain-1`, tool_result `req-plain-1`, assistant message with usage (promptTokens 120, completionTokens 40, cacheReadTokens 12). |
| `case-02-zstd.sqlite` | 2. zstd-compressed payloads | `sess-zstd-001`, seq 1–4, all rows `event_json IS NULL`, `event_zstd` BLOB, `event_utf8_bytes` = decoded length. A `SELECT event_json` alone sees only NULLs — the review's data-loss scenario. |
| `case-03-inplace-update.sqlite` | 3. In-place payload update | `sess-update-001`, seq 1–3. The generator inserts seq 3 without usage, then UPDATEs the same `(session_id, seq)` row to add usage. `MAX(seq)` stays 3 across the mutation, proving a max-seq cursor misses it. Sidecar `case-03-inplace-update.provenance.json` records before/after payloads and sha256 hashes. |
| `case-04-missing-timing.sqlite` | 4. Missing optional timing | `sess-notiming-001`, seq 1–4: message/tool rows with no `ts`, no durations. Per plan B4 this is a fidelity limitation, not malformed data. |
| `case-05-tool-pair.sqlite` | 5. Tool-call/result pairing | `sess-tools-001`, seq 1–4, interleaved: call A, call B, result B, result A. Matching must key on `requestId`, not adjacency. Result A is `ok:false`. |
| `case-06-malformed.sqlite` | 6. Malformed records | `sess-malformed-001`, seq 1 valid control row; seq 2 negative `promptTokens`; seq 3 tool_result with dangling `requestId`; seq 4 unknown role `pluto`; seq 5 `event_json` is unparseable JSON text (`{not valid json`). Seq 2–5 must be quarantined per plan B4, never normalized or silently dropped. |
| `case-07-unsupported-schema.sqlite` | 7. Unsupported schema (refusal) | `transcript_events(id, session, payload)` — different/missing columns (no `seq`, no `event_json`/`event_zstd` split, no `event_utf8_bytes`). The admission gate must refuse this DB; an unknown schema is not an empty source (plan B2). |

Row counts after generation: case-01=5, case-02=4, case-03=3, case-04=4,
case-05=4, case-06=5, case-07=2.

Payload shapes (`type: message | model | tool_call | tool_result`, `requestId`
correlation, `usage{promptTokens,completionTokens,cacheReadTokens}`, ISO `ts`)
are **synthetic Boulder-side shapes**, chosen to exercise the B4 semantic
checks; they are not claimed to be OpenClaw's exact event JSON. Token-field
semantics must not be copied into `gen_ai.*` by renaming (see review HIGH
finding on usage conversion).
