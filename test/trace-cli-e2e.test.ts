import { stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { acquireSession } from "../src/trace/openclaw-adapter";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

const FIXTURE_ROOT = join(import.meta.dir, "..", "fixtures", "trace", "openclaw", "30afbaf8-claim");

function fixture(name: string): string {
  return join(FIXTURE_ROOT, name);
}

describe("boulder trace CLI e2e", () => {
  test("prints trace help for the bare trace command", async () => {
    const result = await runBoulder(["trace"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("boulder trace");
    expect(result.stdout).toContain("boulder trace doctor --source openclaw-local --db-path path");
  });

  test("rejects unknown trace subcommands with unknown-command conventions", async () => {
    const result = await runBoulder(["trace", "nonsense"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command: trace");
    expect(result.stdout).toContain("Usage:");
  });

  test("keeps global help and version precedence over trace dispatch", async () => {
    const help = await runBoulder(["trace", "doctor", "--help"]);
    const version = await runBoulder(["trace", "--version"]);

    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("Usage:");
    expect(help.stdout).toContain("boulder trace doctor");
    expect(version.exitCode).toBe(0);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("admits the plain-payload fixture with exit 0 and parseable JSON", async () => {
    const result = await runBoulder(["trace", "doctor", "--source", "openclaw-local", "--db-path", fixture("case-01-plain.sqlite"), "--json"]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload.schemaVersion).toBe("boulder.trace.doctor.v1");
    expect(payload.verdict).toBe("admit");
    expect(payload.reasons).toEqual([]);
    expect(payload.db.exists).toBe(true);
    expect(payload.db.opened_readonly).toBe(true);
    expect(typeof payload.db.journal_mode).toBe("string");
    expect(typeof payload.db.wal_mode).toBe("boolean");
    expect(payload.adapter.adapter_id).toBe("openclaw-local");
    expect(typeof payload.adapter.interpretation_version).toBe("string");
    expect(typeof payload.schema.fingerprint).toBe("string");
    expect(payload.schema.transcript_events_columns_exact).toBe(true);
    expect(payload.schema.transcript_events_primary_key).toBe(true);
    expect(payload.payloads.plain).toBe(5);
    expect(payload.payloads.zstd).toBe(0);
    expect(payload.payloads.decode_errors).toBe(0);
    expect(payload.payloads.truncated).toBe(false);
    // Doctor reports encoded bytes under the adapter's shared accounting: it
    // must equal acquisition's totalEncodedBytes for the same rows.
    const acquired = await acquireSession(fixture("case-01-plain.sqlite"), "sess-plain-001");
    expect(payload.payloads.encoded_bytes).toBe(acquired.session.totalEncodedBytes);
    expect(payload.evidence.timing.available).toBe(true);
    expect(payload.evidence.usage.available).toBe(true);
    expect(payload.evidence.linking.available).toBe(true);
    expect(payload.limits.maxRows).toBeGreaterThan(0);
  });

  test("admits the zstd-payload fixture and counts compressed rows", async () => {
    const result = await runBoulder(["trace", "doctor", "--source", "openclaw-local", "--db-path", fixture("case-02-zstd.sqlite"), "--json"]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(payload.verdict).toBe("admit");
    expect(payload.payloads.plain).toBe(0);
    expect(payload.payloads.zstd).toBe(4);
    expect(payload.payloads.decode_errors).toBe(0);
  });

  test("refuses the unsupported-schema fixture with a nonzero exit", async () => {
    const result = await runBoulder(["trace", "doctor", "--source", "openclaw-local", "--db-path", fixture("case-07-unsupported-schema.sqlite"), "--json"]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(payload.verdict).toBe("refuse");
    expect(payload.reasons.some((reason: string) => reason.startsWith("schema_mismatch:"))).toBe(true);
    expect(payload.schema.transcript_events_columns_exact).toBe(false);
  });

  test("reports a distinct error for a missing database file", async () => {
    const missing = join(FIXTURE_ROOT, "case-00-does-not-exist.sqlite");
    const result = await runBoulder(["trace", "doctor", "--source", "openclaw-local", "--db-path", missing, "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe(`ERROR trace.db_missing: Trace database not found at ${missing}.`);
  });

  test("refuses a garbage database file with a nonzero exit", async () => {
    const root = await tempRepo();
    try {
      await write(root, "garbage.sqlite", "this is not a sqlite database at all\n");
      const result = await runBoulder(["trace", "doctor", "--source", "openclaw-local", "--db-path", join(root, "garbage.sqlite"), "--json"]);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(1);
      expect(payload.verdict).toBe("refuse");
      expect(payload.reasons.some((reason: string) => reason.startsWith("sqlite_unreadable:"))).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("requires --db-path and rejects unknown sources", async () => {
    const noPath = await runBoulder(["trace", "doctor", "--source", "openclaw-local", "--json"]);
    const badSource = await runBoulder(["trace", "doctor", "--source", "pluto", "--db-path", fixture("case-01-plain.sqlite"), "--json"]);

    expect(noPath.exitCode).toBe(1);
    expect(noPath.stdout).toBe("");
    expect(noPath.stderr.trim()).toBe("ERROR trace.db_path_required: Use trace doctor --db-path path.");
    expect(badSource.exitCode).toBe(1);
    expect(badSource.stdout).toBe("");
    expect(badSource.stderr.trim()).toBe("ERROR trace.source_unknown: Unsupported trace source \"pluto\". Supported: openclaw-local.");
  });

  test("doctor shares adapter admission: a wrong-order PRIMARY KEY refuses like collect", async () => {
    const root = await tempRepo();
    try {
      // @ts-expect-error -- bun:sqlite types are not vendored in this repo.
      const { Database } = await import("bun:sqlite");
      const dbPath = join(root, "wrong-pk.sqlite");
      const db = new Database(dbPath) as { exec(sql: string): void; query(sql: string): { run(...params: unknown[]): void }; close(): void };
      db.exec(`CREATE TABLE transcript_events (
        session_id TEXT NOT NULL, seq INTEGER NOT NULL,
        event_json TEXT, event_zstd BLOB, event_utf8_bytes INTEGER NOT NULL,
        PRIMARY KEY (seq, session_id))`);
      db.query("INSERT INTO transcript_events VALUES (?, ?, ?, NULL, ?)")
        .run("sess", 1, "{\"ok\":true}", 11);
      db.close();

      const result = await runBoulder(["trace", "doctor", "--source", "openclaw-local", "--db-path", dbPath, "--json"]);
      const payload = JSON.parse(result.stdout);

      // The same PK the adapter refuses (order must be session_id,seq) must
      // refuse here, never admit.
      expect(result.exitCode).toBe(1);
      expect(payload.verdict).toBe("refuse");
      expect(payload.schema.transcript_events_columns_exact).toBe(true);
      expect(payload.schema.transcript_events_primary_key).toBe(false);
      expect(payload.reasons.some((reason: string) => reason.includes("primary key"))).toBe(true);
      expect(payload.payloads).toBeNull();
    } finally {
      await removeTempRepo(root);
    }
  });

  test("doctor and adapter account identical encoded bytes on a both-set row", async () => {
    const root = await tempRepo();
    try {
      // @ts-expect-error -- bun:sqlite types are not vendored in this repo.
      const { Database } = await import("bun:sqlite");
      const dbPath = join(root, "both-set.sqlite");
      const db = new Database(dbPath) as { exec(sql: string): void; query(sql: string): { run(...params: unknown[]): void }; close(): void };
      db.exec(`CREATE TABLE transcript_events (
        session_id TEXT NOT NULL, seq INTEGER NOT NULL,
        event_json TEXT, event_zstd BLOB, event_utf8_bytes INTEGER NOT NULL,
        PRIMARY KEY (session_id, seq))`);
      const json = "{\"ok\":true}";
      const blob = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
      db.query("INSERT INTO transcript_events VALUES (?, ?, ?, ?, ?)")
        .run("sess-both", 1, json, blob, json.length);
      db.query("INSERT INTO transcript_events VALUES (?, ?, ?, NULL, ?)")
        .run("sess-both", 2, "{\"a\":1}", 7);
      db.close();
      const expected = new TextEncoder().encode(json).byteLength + blob.byteLength;
      const expectedPlain = new TextEncoder().encode("{\"a\":1}").byteLength;

      const result = await runBoulder(["trace", "doctor", "--source", "openclaw-local", "--db-path", dbPath, "--json"]);
      const payload = JSON.parse(result.stdout);

      // A both-set row is a data-level quarantine, not a schema refusal:
      // doctor still admits and counts it under both_set + decode_errors.
      expect(result.exitCode).toBe(0);
      expect(payload.verdict).toBe("admit");
      expect(payload.payloads.both_set).toBe(1);
      expect(payload.payloads.decode_errors).toBe(1);
      expect(payload.payloads.encoded_bytes).toBe(expected + expectedPlain);

      // Same DB through acquisition: the both-set row is quarantined as
      // encoding-invalid yet still contributes BOTH stored byte lengths, and
      // the session total matches doctor's byte-for-byte.
      const acquired = await acquireSession(dbPath, "sess-both");
      const bothSetRow = acquired.rows.find((row) => row.locator.seq === 1)!;
      expect(bothSetRow.encoding).toBe("invalid");
      expect(bothSetRow.encodedBytes).toBe(expected);
      expect(acquired.session.totalEncodedBytes).toBe(payload.payloads.encoded_bytes);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("doctor dry-run writes nothing into the workspace", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["trace", "doctor", "--source", "openclaw-local", "--db-path", fixture("case-01-plain.sqlite"), "--dry-run", "--json", "--cwd", root]);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.mode).toBe("dry-run");
      expect(payload.verdict).toBe("admit");
      expect(await exists(join(root, ".boulder"))).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });
});

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
