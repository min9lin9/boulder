import { describe, expect, test } from "bun:test";
import { mkdtemp, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireSession,
  probeOpenClawSource,
  admitFingerprint,
  BoundedAcquisitionError,
  OpenClawSourceOpenError,
  SessionNotFoundError,
  UnsupportedSchemaError,
  type AcquisitionLimits,
  type AcquiredRow,
  DEFAULT_ACQUISITION_LIMITS
} from "../src/trace/openclaw-adapter";

// bun:sqlite is a Bun builtin whose types this repo does not vendor (see
// src/trace/openclaw-adapter.ts); the test only needs it to build/mutate TEMP
// copies of fixtures, never to read the fixture files in place.
// @ts-expect-error -- bun:sqlite types are not vendored in this repo.
import { Database } from "bun:sqlite";

type WritableDatabase = {
  exec(sql: string): void;
  query(sql: string): { run(...params: unknown[]): void };
  close(): void;
};

type BunFileRuntime = {
  file(path: string): { arrayBuffer(): Promise<ArrayBuffer> };
  write(path: string, data: Uint8Array): Promise<unknown>;
};

const bunRuntime = (globalThis as unknown as { Bun: BunFileRuntime }).Bun;

const FIXTURE_DIR = join(import.meta.dir, "..", "fixtures", "trace", "openclaw", "30afbaf8-claim");

async function copyFixture(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "openclaw-adapter-test-"));
  const target = join(dir, name);
  const bytes = await bunRuntime.file(join(FIXTURE_DIR, name)).arrayBuffer();
  await bunRuntime.write(target, new Uint8Array(bytes));
  return target;
}

async function sha256HexOfFile(path: string): Promise<string> {
  const bytes = await bunRuntime.file(path).arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function catchAsync(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

function limits(overrides: Partial<AcquisitionLimits>): AcquisitionLimits {
  return { ...DEFAULT_ACQUISITION_LIMITS, ...overrides };
}

describe("openclaw adapter acquisition", () => {
  test("case-01: full inventory, all plain rows decoded", async () => {
    const dbPath = await copyFixture("case-01-plain.sqlite");
    const result = await acquireSession(dbPath, "sess-plain-001");

    expect(result.adapterId).toBe("openclaw-local");
    expect(result.admission.admitted).toBe(true);
    expect(result.fingerprint.columnSetHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.session.rowCount).toBe(5);
    expect(result.session.minSeq).toBe(1);
    expect(result.session.maxSeq).toBe(5);
    expect(result.session.plainRowCount).toBe(5);
    expect(result.session.zstdRowCount).toBe(0);
    expect(result.session.invalidRowCount).toBe(0);

    expect(result.rows).toHaveLength(5);
    for (const [index, row] of result.rows.entries()) {
      expect(row.locator.session_id).toBe("sess-plain-001");
      expect(row.locator.seq).toBe(index + 1);
      expect(row.encoding).toBe("plain");
      expect(row.decodeStatus.kind).toBe("ok");
      expect(row.decodedBytes).toBe(row.declaredUtf8Bytes);
      expect(row.decodedText !== null).toBe(true);
      expect(row.decodedJson !== null).toBe(true);
    }
  });

  test("case-02: zstd rows decoded, decoded length == event_utf8_bytes", async () => {
    const dbPath = await copyFixture("case-02-zstd.sqlite");
    const result = await acquireSession(dbPath, "sess-zstd-001");

    expect(result.session.rowCount).toBe(4);
    expect(result.session.zstdRowCount).toBe(4);
    expect(result.session.plainRowCount).toBe(0);
    expect(result.session.totalEncodedBytes).toBeGreaterThan(0);

    for (const row of result.rows) {
      expect(row.encoding).toBe("zstd");
      expect(row.decodeStatus.kind).toBe("ok");
      expect(row.decodedBytes).toBe(row.declaredUtf8Bytes);
      expect(typeof row.decodedText).toBe("string");
      expect(row.decodedJson !== null).toBe(true);
    }
  });

  test("case-03: in-place update at same seq is seen by a second full read", async () => {
    const dbPath = await copyFixture("case-03-inplace-update.sqlite");

    const provenance = JSON.parse(
      new TextDecoder().decode(await bunRuntime.file(join(FIXTURE_DIR, "case-03-inplace-update.provenance.json")).arrayBuffer())
    ) as { payload_before: unknown; payload_after: unknown; max_seq_after_update: number };

    // Revert the TEMP copy to the pre-update payload (the shipped fixture is
    // the post-update state; the sidecar records both), then acquire.
    let writable = new Database(dbPath) as WritableDatabase;
    writable.query("UPDATE transcript_events SET event_json = ? WHERE session_id = ? AND seq = ?")
      .run(JSON.stringify(provenance.payload_before), "sess-update-001", 3);
    writable.close();

    const before = await acquireSession(dbPath, "sess-update-001");
    expect(before.session.rowCount).toBe(3);
    const beforeSeq3 = before.rows[2]!;
    expect(beforeSeq3.locator.seq).toBe(3);
    expect((beforeSeq3.decodedJson as { usage?: unknown }).usage).toBe(undefined);

    // Mutate the TEMP copy in place, mirroring the fixture's provenance
    // sidecar: same (session_id, seq), new payload, MAX(seq) unchanged.
    writable = new Database(dbPath) as WritableDatabase;
    writable.query("UPDATE transcript_events SET event_json = ? WHERE session_id = ? AND seq = ?")
      .run(JSON.stringify(provenance.payload_after), "sess-update-001", 3);
    writable.close();

    const after = await acquireSession(dbPath, "sess-update-001");
    expect(after.session.maxSeq).toBe(provenance.max_seq_after_update);
    const afterSeq3 = after.rows[2]!;
    expect(afterSeq3.locator.seq).toBe(3);
    expect(afterSeq3.decodedText !== beforeSeq3.decodedText).toBe(true);
    expect((afterSeq3.decodedJson as { usage: { promptTokens: number } }).usage.promptTokens).toBe(300);
  });

  test("case-06: malformed rows surface as decode/parse status data, no crash", async () => {
    const dbPath = await copyFixture("case-06-malformed.sqlite");
    const result = await acquireSession(dbPath, "sess-malformed-001");

    expect(result.session.rowCount).toBe(5);
    const bySeq = new Map(result.rows.map((row) => [row.locator.seq, row]));

    // Rows 1-4 decode and parse fine; their semantic problems (negative
    // usage, dangling requestId, unknown role) are the normalizer's call.
    for (const seq of [1, 2, 3, 4]) {
      const row = bySeq.get(seq)!;
      expect(row.decodeStatus.kind).toBe("ok");
      expect(row.decodedJson !== null).toBe(true);
    }
    // Semantic facts pass through unjudged: row 2 keeps its negative usage.
    expect((bySeq.get(2)!.decodedJson as { usage: { promptTokens: number } }).usage.promptTokens < 0).toBe(true);

    // Row 5 stores unparseable JSON text: surfaced as a parse status, not a throw.
    const row5 = bySeq.get(5)!;
    expect(row5.decodedText).toBe("{not valid json");
    expect(row5.decodedJson).toBeNull();
    expect(row5.decodeStatus.kind).toBe("error");
    expect((row5.decodeStatus as { stage: string }).stage).toBe("parse");
  });

  test("truncated zstd payload is a handled decode error, not a crash", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openclaw-adapter-corrupt-"));
    const dbPath = join(dir, "corrupt.sqlite");
    const writable = new Database(dbPath) as WritableDatabase;
    writable.exec(`CREATE TABLE transcript_events (
      session_id TEXT NOT NULL, seq INTEGER NOT NULL,
      event_json TEXT, event_zstd BLOB, event_utf8_bytes INTEGER NOT NULL,
      PRIMARY KEY (session_id, seq))`);
    writable.query("INSERT INTO transcript_events VALUES (?, ?, NULL, ?, ?)")
      .run("sess-corrupt", 1, new Uint8Array([40, 181, 47, 253, 0, 1, 255]), 512);
    writable.close();

    const result = await acquireSession(dbPath, "sess-corrupt");
    expect(result.session.invalidRowCount).toBe(0);
    const row = result.rows[0]!;
    expect(row.encoding).toBe("zstd");
    expect(row.decodeStatus.kind).toBe("error");
    expect((row.decodeStatus as { stage: string }).stage).toBe("decompress");
    expect(row.decodedText).toBeNull();
    expect(row.decodedJson).toBeNull();
  });

  test("column type violations surface as column_type errors instead of bypassing bounds", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openclaw-adapter-types-"));
    const dbPath = join(dir, "types.sqlite");
    const writable = new Database(dbPath) as WritableDatabase;
    writable.exec(`CREATE TABLE transcript_events (
      session_id TEXT NOT NULL, seq INTEGER NOT NULL,
      event_json TEXT, event_zstd BLOB, event_utf8_bytes INTEGER NOT NULL,
      PRIMARY KEY (session_id, seq))`);
    // "nope" cannot take INTEGER affinity, so sqlite stores it as TEXT: an
    // unchecked cast would poison totalDeclaredUtf8Bytes and slip the bound.
    writable.query("INSERT INTO transcript_events VALUES (?, ?, ?, NULL, ?)")
      .run("sess-types", 1, "{\"ok\":true}", "nope");
    writable.query("INSERT INTO transcript_events VALUES (?, ?, ?, NULL, ?)")
      .run("sess-types", 2, "{\"ok\":true}", 11);
    writable.close();

    const result = await acquireSession(dbPath, "sess-types");
    const bySeq = new Map(result.rows.map((row) => [row.locator.seq, row]));
    const bad = bySeq.get(1)!;
    expect(bad.decodeStatus.kind).toBe("error");
    expect((bad.decodeStatus as { stage: string }).stage).toBe("column_type");
    expect(bad.encoding).toBe("invalid");
    const good = bySeq.get(2)!;
    expect(good.decodeStatus.kind).toBe("ok");
    // The poisoned declared value is quarantined at the row, never accumulated.
    expect(result.session.totalDeclaredUtf8Bytes).toBe(11);
  });
});

describe("openclaw adapter admission", () => {
  test("case-07: refused with the distinct unsupported-schema error", async () => {
    const dbPath = await copyFixture("case-07-unsupported-schema.sqlite");

    const probe = await probeOpenClawSource(dbPath);
    expect(probe.admitted).toBe(false);
    expect(probe.reasons.length).toBeGreaterThan(0);
    expect(probe.fingerprint.tables).toContain("transcript_events");

    const error = await catchAsync(() => acquireSession(dbPath, "anything"));
    expect(error instanceof UnsupportedSchemaError).toBe(true);
    expect(error instanceof BoundedAcquisitionError).toBe(false);
    const refusal = error as UnsupportedSchemaError;
    expect(refusal.name).toBe("UnsupportedSchemaError");
    expect(refusal.reasons.length).toBeGreaterThan(0);
    expect(refusal.fingerprint.columnSetHash).toMatch(/^[0-9a-f]{64}$/);
    expect(refusal.message).toContain("not an empty source");
  });

  test("admitFingerprint accepts the documented-claim schema shape", async () => {
    const dbPath = await copyFixture("case-01-plain.sqlite");
    const verdict = await probeOpenClawSource(dbPath);
    expect(verdict.admitted).toBe(true);
    expect(verdict.reasons).toHaveLength(0);
    // Verdict is a pure function of the fingerprint.
    expect(admitFingerprint(verdict.fingerprint).admitted).toBe(true);
  });
});

describe("openclaw adapter bounds", () => {
  test("over-limit row count throws a bounded error naming the bound", async () => {
    const dbPath = await copyFixture("case-01-plain.sqlite");
    const error = await catchAsync(() => acquireSession(dbPath, "sess-plain-001", limits({ maxRows: 2 })));
    expect(error instanceof BoundedAcquisitionError).toBe(true);
    expect((error as BoundedAcquisitionError).bound).toBe("rows");
    expect((error as Error).message).toContain("maxRows=2");
  });

  test("over-limit encoded bytes per row throws naming the bound", async () => {
    const dbPath = await copyFixture("case-01-plain.sqlite");
    const error = await catchAsync(() => acquireSession(dbPath, "sess-plain-001", limits({ maxEncodedBytesPerRow: 10 })));
    expect(error instanceof BoundedAcquisitionError).toBe(true);
    expect((error as BoundedAcquisitionError).bound).toBe("encoded_bytes_per_row");
  });

  test("over-limit total decoded bytes throws naming the bound", async () => {
    const dbPath = await copyFixture("case-01-plain.sqlite");
    const error = await catchAsync(() => acquireSession(dbPath, "sess-plain-001", limits({ maxTotalDecodedBytes: 100 })));
    expect(error instanceof BoundedAcquisitionError).toBe(true);
    expect((error as BoundedAcquisitionError).bound).toBe("total_decoded_bytes");
  });

  test("invalid limits are rejected", async () => {
    const dbPath = await copyFixture("case-01-plain.sqlite");
    const error = await catchAsync(() => acquireSession(dbPath, "sess-plain-001", limits({ maxRows: 0 })));
    expect(error instanceof RangeError).toBe(true);
  });

  test("unknown session is a distinct error, not an empty acquisition", async () => {
    const dbPath = await copyFixture("case-01-plain.sqlite");
    const error = await catchAsync(() => acquireSession(dbPath, "sess-does-not-exist"));
    expect(error instanceof SessionNotFoundError).toBe(true);
  });
});

describe("openclaw adapter read-only enforcement", () => {
  test("source file hash and mtime are unchanged after acquisition", async () => {
    const dbPath = await copyFixture("case-01-plain.sqlite");
    const hashBefore = await sha256HexOfFile(dbPath);
    const mtimeBefore = (await lstat(dbPath) as unknown as { mtimeMs: number }).mtimeMs;

    await acquireSession(dbPath, "sess-plain-001");

    expect(await sha256HexOfFile(dbPath)).toBe(hashBefore);
    const mtimeAfter = (await lstat(dbPath) as unknown as { mtimeMs: number }).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  test("opening a missing path errors and never creates the file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openclaw-adapter-missing-"));
    const missing = join(dir, "no-such.sqlite");

    const error = await catchAsync(() => acquireSession(missing, "sess-plain-001"));
    expect(error instanceof OpenClawSourceOpenError).toBe(true);

    const statError = await catchAsync(() => lstat(missing));
    expect(statError instanceof Error).toBe(true);
  });
});
