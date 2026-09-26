import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireSession,
  transcriptEncodedBytes
} from "../src/trace/openclaw-adapter";

// bun:sqlite is a Bun builtin whose types this repo does not vendor (see
// src/trace/openclaw-adapter.ts); the test only uses it to BUILD temp source
// databases for the adapter/doctor to read.
// @ts-expect-error -- bun:sqlite types are not vendored in this repo.
import { Database } from "bun:sqlite";

type WritableDatabase = {
  exec(sql: string): void;
  query(sql: string): { run(...params: unknown[]): void };
  close(): void;
};

const utf8 = new TextEncoder();

// Minimal admitted schema; seq is declared WITHOUT NOT NULL so a NULL can be
// stored to exercise the column_type / non-finite-seq path.
async function tempDb(rows: readonly (readonly [unknown, unknown, unknown, unknown])[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "trace-parity-test-"));
  const dbPath = join(dir, "source.sqlite");
  const writable = new Database(dbPath) as WritableDatabase;
  writable.exec(`CREATE TABLE transcript_events (
    session_id TEXT NOT NULL, seq INTEGER,
    event_json TEXT, event_zstd BLOB, event_utf8_bytes INTEGER NOT NULL,
    PRIMARY KEY (session_id, seq))`);
  for (const [seq, json, zstd, declared] of rows) {
    writable.query("INSERT INTO transcript_events (session_id, seq, event_json, event_zstd, event_utf8_bytes) VALUES (?, ?, ?, ?, ?)")
      .run("sess-parity", seq, json, zstd, declared);
  }
  writable.close();
  return dbPath;
}

describe("encoded-byte accounting parity", () => {
  test("a both-set invalid row sums BOTH stored byte lengths, shared with doctor", async () => {
    const json = "{\"ok\":true}";
    const blob = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
    const dbPath = await tempDb([
      [1, json, blob, json.length],
      [2, "{\"a\":1}", null, 7]
    ]);

    const result = await acquireSession(dbPath, "sess-parity");
    const expected = utf8.encode(json).byteLength + blob.byteLength;
    const expectedPlain = utf8.encode("{\"a\":1}").byteLength;

    const bothSet = result.rows.find((row) => row.locator.seq === 1)!;
    expect(bothSet.encoding).toBe("invalid");
    expect(bothSet.decodeStatus.kind).toBe("error");
    expect((bothSet.decodeStatus as { stage: string }).stage).toBe("encoding");
    // Both columns were read into memory, so both count - not just event_json.
    expect(bothSet.encodedBytes).toBe(expected);
    expect(result.session.totalEncodedBytes).toBe(expected + expectedPlain);

    // The shared function is the accounting both adapter bounds and doctor's
    // payload scan call; assert it directly on the same row shape.
    expect(transcriptEncodedBytes(
      { event_json_bytes: utf8.encode(json).byteLength, event_zstd_bytes: blob.byteLength },
      { eventJson: json }
    )).toBe(expected);
  });
});

describe("session seq metadata guard", () => {
  test("a column_type-first row never leaves NaN in minSeq/maxSeq", async () => {
    // NULL seq sorts FIRST under ORDER BY seq ASC, and readTranscriptRowValues
    // turns it into NaN + a column_type quarantine - the exact shape that used
    // to poison session.minSeq.
    const dbPath = await tempDb([
      [null, "{\"bad\":true}", null, 11],
      [2, "{\"a\":1}", null, 7],
      [5, "{\"b\":2}", null, 7]
    ]);

    const result = await acquireSession(dbPath, "sess-parity");
    expect(result.rows[0]!.decodeStatus.kind).toBe("error");
    expect((result.rows[0]!.decodeStatus as { stage: string }).stage).toBe("column_type");
    expect(result.session.invalidRowCount).toBe(1);
    expect(Number.isFinite(result.session.minSeq)).toBe(true);
    expect(Number.isFinite(result.session.maxSeq)).toBe(true);
    expect(result.session.minSeq).toBe(2);
    expect(result.session.maxSeq).toBe(5);
  });

  test("non-finite seqs are skipped wherever they sort in the scan", async () => {
    // TEXT in an INTEGER column stays TEXT (affinity cannot convert "oops"),
    // violating the declared type; it sorts AFTER numeric seqs.
    const dbPath = await tempDb([
      [1, "{\"a\":1}", null, 7],
      ["oops", "{\"bad\":true}", null, 11]
    ]);

    const result = await acquireSession(dbPath, "sess-parity");
    expect(result.session.minSeq).toBe(1);
    expect(result.session.maxSeq).toBe(1);
    expect(result.session.invalidRowCount).toBe(1);
  });

  test("all-non-finite seqs report null bounds rather than NaN/Infinity", async () => {
    const dbPath = await tempDb([
      [null, "{\"bad\":true}", null, 11],
      ["oops", "{\"bad2\":true}", null, 12]
    ]);

    const result = await acquireSession(dbPath, "sess-parity");
    expect(result.session.invalidRowCount).toBe(2);
    expect(result.session.minSeq).toBeNull();
    expect(result.session.maxSeq).toBeNull();
  });
});
