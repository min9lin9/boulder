#!/usr/bin/env bun
/**
 * Deterministic generator for synthetic OpenClaw transcript fixture databases.
 *
 * Provenance (DOCUMENTED CLAIM, not verified against a live installation):
 *   - boulder-observability-review.md (operator plan notepad)
 *     citing upstream commit 30afbaf8, src/config/sessions/transcript-payload.ts:
 *       (a) transcript_events(session_id, seq, event_json, event_zstd, event_utf8_bytes)
 *       (b) event_json is explicitly NULL when event_zstd holds the compressed payload
 *       (c) decoding validates event_utf8_bytes
 *       (d) createTranscriptPayloadUpdater() UPDATEs an existing (session_id, seq) row
 *   - one-pass-oci-openclaw docs/qa/gbrain.md:182 documents the live DB path
 *     .../agents/<agent>/agent/openclaw-agent.sqlite and (line 185) a second
 *     table name `session_windows` (no column-level provenance; see README).
 *
 * Compression: real zstd via Bun.zstdCompress (Bun >= 1.3.14). Deterministic
 * for identical input on this Bun build; regenerating with a different zstd
 * build may change compressed bytes (documented, reversible: decode first).
 *
 * Determinism: fixed session IDs, fixed timestamps (base 2026-01-05T12:00:00Z,
 * +1 minute per row), fixed insert order, fresh DB file per run. Running the
 * generator twice must produce byte-identical .sqlite files.
 *
 * Usage: bun generate.ts   (from this directory; writes *.sqlite next to itself)
 */
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const DIR = import.meta.dir;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const DDL = `
CREATE TABLE transcript_events (
  session_id        TEXT    NOT NULL,
  seq               INTEGER NOT NULL,
  event_json        TEXT,
  event_zstd        BLOB,
  event_utf8_bytes  INTEGER NOT NULL,
  PRIMARY KEY (session_id, seq)
);
`.trim();

// Fixed clock: 2026-01-05T12:00:00.000Z + n minutes.
function ts(n: number): string {
  return new Date(Date.UTC(2026, 0, 5, 12, n, 0)).toISOString();
}

interface Row {
  session: string;
  seq: number;
  payload: unknown;
  encoding: "plain" | "zstd";
}

function freshDb(name: string): Database {
  const path = join(DIR, name);
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const p = path + suffix;
    if (existsSync(p)) unlinkSync(p);
  }
  const db = new Database(path);
  db.exec(DDL);
  return db;
}

const INSERT_SQL =
  "INSERT INTO transcript_events (session_id, seq, event_json, event_zstd, event_utf8_bytes) VALUES (?, ?, ?, ?, ?)";

async function insertRow(db: Database, row: Row): Promise<void> {
  const json = JSON.stringify(row.payload);
  const bytes = encoder.encode(json);
  if (row.encoding === "plain") {
    db.query(INSERT_SQL).run(row.session, row.seq, json, null, bytes.byteLength);
  } else {
    const compressed = await Bun.zstdCompress(bytes);
    // Self-check: roundtrip must reproduce the payload and its declared length.
    const roundtrip = await Bun.zstdDecompress(compressed);
    if (
      decoder.decode(roundtrip) !== json ||
      roundtrip.byteLength !== bytes.byteLength
    ) {
      throw new Error(`zstd roundtrip failed for ${row.session}#${row.seq}`);
    }
    db.query(INSERT_SQL).run(row.session, row.seq, null, compressed, bytes.byteLength);
  }
}

async function buildFixture(
  name: string,
  rows: Row[],
  after?: (db: Database) => Promise<void>,
): Promise<{ file: string; rows: number }> {
  const db = freshDb(name);
  for (const row of rows) await insertRow(db, row);
  if (after) await after(db);
  const count = db
    .query("SELECT COUNT(*) AS n FROM transcript_events")
    .get() as { n: number };
  db.close();
  return { file: name, rows: count.n };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const results: Array<{ file: string; rows: number }> = [];

// ---------------------------------------------------------------------------
// Case 1: plain event_json rows (message / tool / model shaped) - happy path.
// ---------------------------------------------------------------------------
results.push(
  await buildFixture("case-01-plain.sqlite", [
    {
      session: "sess-plain-001",
      seq: 1,
      encoding: "plain",
      payload: { type: "model", action: "set", model: "gpt-5-codex", ts: ts(0) },
    },
    {
      session: "sess-plain-001",
      seq: 2,
      encoding: "plain",
      payload: {
        type: "message",
        role: "user",
        content: "List the files in the current directory.",
        ts: ts(1),
      },
    },
    {
      session: "sess-plain-001",
      seq: 3,
      encoding: "plain",
      payload: {
        type: "tool_call",
        requestId: "req-plain-1",
        tool: "shell",
        args: { command: "ls -la" },
        ts: ts(2),
      },
    },
    {
      session: "sess-plain-001",
      seq: 4,
      encoding: "plain",
      payload: {
        type: "tool_result",
        requestId: "req-plain-1",
        ok: true,
        output: "total 0\ndrwxr-xr-x  2 op  staff  64 Jan  5 12:00 .",
        ts: ts(3),
      },
    },
    {
      session: "sess-plain-001",
      seq: 5,
      encoding: "plain",
      payload: {
        type: "message",
        role: "assistant",
        content: "The directory is empty.",
        usage: { promptTokens: 120, completionTokens: 40, cacheReadTokens: 12 },
        ts: ts(4),
      },
    },
  ]),
);

// ---------------------------------------------------------------------------
// Case 2: zstd-compressed payloads. event_json IS NULL, event_zstd holds the
// compressed bytes, event_utf8_bytes is the DECODED utf-8 byte length.
// ---------------------------------------------------------------------------
results.push(
  await buildFixture("case-02-zstd.sqlite", [
    {
      session: "sess-zstd-001",
      seq: 1,
      encoding: "zstd",
      payload: {
        type: "message",
        role: "user",
        content: "Summarize the repository layout.",
        ts: ts(0),
      },
    },
    {
      session: "sess-zstd-001",
      seq: 2,
      encoding: "zstd",
      payload: {
        type: "tool_call",
        requestId: "req-zstd-1",
        tool: "read_file",
        args: { path: "README.md" },
        ts: ts(1),
      },
    },
    {
      session: "sess-zstd-001",
      seq: 3,
      encoding: "zstd",
      payload: {
        type: "tool_result",
        requestId: "req-zstd-1",
        ok: true,
        output: "# Boulder\n\nBoulder is a Bun TypeScript CLI ...",
        ts: ts(2),
      },
    },
    {
      session: "sess-zstd-001",
      seq: 4,
      encoding: "zstd",
      payload: {
        type: "message",
        role: "assistant",
        content: "The repository contains src/, test/, docs/, and fixtures/.",
        usage: { promptTokens: 512, completionTokens: 96, cacheReadTokens: 64 },
        ts: ts(3),
      },
    },
  ]),
);

// ---------------------------------------------------------------------------
// Case 3: in-place payload UPDATE at unchanged (session_id, seq).
// The generator first inserts seq 3 without usage, then UPDATEs the same row
// to add usage - the exact createTranscriptPayloadUpdater() behavior cited in
// the review. MAX(seq) stays 3 across the mutation, so a max-seq cursor misses
// it. A provenance sidecar records before/after payloads and hashes.
// ---------------------------------------------------------------------------
const beforePayload = {
  type: "message",
  role: "assistant",
  content: "Working on it.",
  ts: ts(2),
};
const afterPayload = {
  ...beforePayload,
  usage: { promptTokens: 300, completionTokens: 25, cacheReadTokens: 0 },
};
results.push(
  await buildFixture(
    "case-03-inplace-update.sqlite",
    [
      {
        session: "sess-update-001",
        seq: 1,
        encoding: "plain",
        payload: {
          type: "message",
          role: "user",
          content: "Refactor the parser.",
          ts: ts(0),
        },
      },
      {
        session: "sess-update-001",
        seq: 2,
        encoding: "plain",
        payload: {
          type: "tool_call",
          requestId: "req-update-1",
          tool: "edit_file",
          args: { path: "src/parser.ts" },
          ts: ts(1),
        },
      },
      { session: "sess-update-001", seq: 3, encoding: "plain", payload: beforePayload },
    ],
    async (db) => {
      // In-place update at unchanged (session_id, seq): MAX(seq) stays 3.
      const json = JSON.stringify(afterPayload);
      db.query(
        "UPDATE transcript_events SET event_json = ?, event_utf8_bytes = ? WHERE session_id = ? AND seq = ?",
      ).run(json, encoder.encode(json).byteLength, "sess-update-001", 3);
      const maxSeq = (
        db.query(
          "SELECT MAX(seq) AS m FROM transcript_events WHERE session_id = ?",
        ).get("sess-update-001") as { m: number }
      ).m;
      const provenance = {
        fixture: "case-03-inplace-update.sqlite",
        session_id: "sess-update-001",
        updated_seq: 3,
        max_seq_before_update: 3,
        max_seq_after_update: maxSeq,
        cursor_note:
          "A MAX(seq) cursor positioned at 3 before the update observes no new rows; the payload at seq 3 changed in place.",
        payload_before: beforePayload,
        payload_after: afterPayload,
        sha256_before: sha256(JSON.stringify(beforePayload)),
        sha256_after: sha256(JSON.stringify(afterPayload)),
      };
      writeFileSync(
        join(DIR, "case-03-inplace-update.provenance.json"),
        JSON.stringify(provenance, null, 2) + "\n",
      );
    },
  ),
);

// ---------------------------------------------------------------------------
// Case 4: rows with missing optional timing fields. No ts, no duration.
// Per plan B4: missing optional timing is a fidelity limitation, not malformed.
// ---------------------------------------------------------------------------
results.push(
  await buildFixture("case-04-missing-timing.sqlite", [
    {
      session: "sess-notiming-001",
      seq: 1,
      encoding: "plain",
      payload: { type: "message", role: "user", content: "Run the tests." },
    },
    {
      session: "sess-notiming-001",
      seq: 2,
      encoding: "plain",
      payload: {
        type: "tool_call",
        requestId: "req-notiming-1",
        tool: "shell",
        args: { command: "bun test" },
      },
    },
    {
      session: "sess-notiming-001",
      seq: 3,
      encoding: "plain",
      payload: {
        type: "tool_result",
        requestId: "req-notiming-1",
        ok: true,
        output: "12 pass, 0 fail",
      },
    },
    {
      session: "sess-notiming-001",
      seq: 4,
      encoding: "plain",
      payload: {
        type: "message",
        role: "assistant",
        content: "All tests pass.",
        usage: { promptTokens: 88, completionTokens: 12, cacheReadTokens: 0 },
      },
    },
  ]),
);

// ---------------------------------------------------------------------------
// Case 5: tool-call/result pairs exercising match-by-request-event.
// Interleaved order (call A, call B, result B, result A) proves matching must
// key on requestId, not adjacency.
// ---------------------------------------------------------------------------
results.push(
  await buildFixture("case-05-tool-pair.sqlite", [
    {
      session: "sess-tools-001",
      seq: 1,
      encoding: "plain",
      payload: {
        type: "tool_call",
        requestId: "req-tools-A",
        tool: "shell",
        args: { command: "git status" },
        ts: ts(0),
      },
    },
    {
      session: "sess-tools-001",
      seq: 2,
      encoding: "plain",
      payload: {
        type: "tool_call",
        requestId: "req-tools-B",
        tool: "read_file",
        args: { path: "src/cli.ts" },
        ts: ts(1),
      },
    },
    {
      session: "sess-tools-001",
      seq: 3,
      encoding: "plain",
      payload: {
        type: "tool_result",
        requestId: "req-tools-B",
        ok: true,
        output: "export async function main() { ... }",
        ts: ts(2),
      },
    },
    {
      session: "sess-tools-001",
      seq: 4,
      encoding: "plain",
      payload: {
        type: "tool_result",
        requestId: "req-tools-A",
        ok: false,
        output: "fatal: not a git repository",
        ts: ts(3),
      },
    },
  ]),
);

// ---------------------------------------------------------------------------
// Case 6: malformed records (invalid payload semantics). One valid control row
// plus four rows that each violate a distinct B4 semantic check; all must land
// in the quarantine disposition, never normalized or silently ignored.
// ---------------------------------------------------------------------------
results.push(
  await buildFixture("case-06-malformed.sqlite", [
    {
      session: "sess-malformed-001",
      seq: 1,
      encoding: "plain",
      payload: {
        type: "message",
        role: "user",
        content: "Control row: this one is valid.",
        ts: ts(0),
      },
    },
    {
      // Negative, non-finite-safe usage value.
      session: "sess-malformed-001",
      seq: 2,
      encoding: "plain",
      payload: {
        type: "message",
        role: "assistant",
        content: "Here is the answer.",
        usage: { promptTokens: -50, completionTokens: 10, cacheReadTokens: 0 },
        ts: ts(1),
      },
    },
    {
      // tool_result with no matching tool_call requestId.
      session: "sess-malformed-001",
      seq: 3,
      encoding: "plain",
      payload: {
        type: "tool_result",
        requestId: "req-nonexistent",
        ok: true,
        output: "orphaned result",
        ts: ts(2),
      },
    },
    {
      // Unknown role.
      session: "sess-malformed-001",
      seq: 4,
      encoding: "plain",
      payload: {
        type: "message",
        role: "pluto",
        content: "I should not validate.",
        ts: ts(3),
      },
    },
  ]),
);

// case-06 row 5: event_json that is not even parseable JSON - inserted raw,
// bypassing insertRow (which JSON-stringifies).
{
  const db = new Database(join(DIR, "case-06-malformed.sqlite"));
  const raw = "{not valid json";
  db.query(INSERT_SQL).run(
    "sess-malformed-001",
    5,
    raw,
    null,
    encoder.encode(raw).byteLength,
  );
  db.close();
  results[results.length - 1].rows += 1;
}

// ---------------------------------------------------------------------------
// Case 7: unsupported-schema DB for admission refusal testing. Table exists
// but with different/missing columns (no seq, no event_json/event_zstd split,
// no event_utf8_bytes). The admission gate must refuse this database.
// ---------------------------------------------------------------------------
{
  const name = "case-07-unsupported-schema.sqlite";
  const path = join(DIR, name);
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const p = path + suffix;
    if (existsSync(p)) unlinkSync(p);
  }
  const db = new Database(path);
  db.exec(`
    CREATE TABLE transcript_events (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      session  TEXT NOT NULL,
      payload  TEXT NOT NULL
    );
  `.trim());
  db.query("INSERT INTO transcript_events (session, payload) VALUES (?, ?)").run(
    "sess-legacy-001",
    JSON.stringify({ text: "legacy single-column payload", ts: ts(0) }),
  );
  db.query("INSERT INTO transcript_events (session, payload) VALUES (?, ?)").run(
    "sess-legacy-001",
    JSON.stringify({ text: "second legacy row", ts: ts(1) }),
  );
  const count = db
    .query("SELECT COUNT(*) AS n FROM transcript_events")
    .get() as { n: number };
  db.close();
  results.push({ file: name, rows: count.n });
}

console.log("OpenClaw transcript fixtures generated (stamp: 30afbaf8-claim):");
for (const r of results) console.log(`  ${r.file}  transcript_events rows=${r.rows}`);
console.log("  case-03-inplace-update.provenance.json  (sidecar)");
