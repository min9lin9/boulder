import { describe, expect, test } from "bun:test";
// Same structural SQLite typing as the adapter; bun-types are not vendored.
// @ts-expect-error -- bun:sqlite types are not vendored in this repo.
import { Database } from "bun:sqlite";
import { copyFile, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { acquire } from "../src/evidence-write-lock";
import { exists } from "../src/fs";
import { snapshotDigest, SNAPSHOT_RECORD_VERSION, type CollectReport } from "../src/trace/collect";
import { isSessionSnapshot, type SessionSnapshot } from "../src/trace/contracts";
import { loadHead } from "../src/trace/journal";
import { registerSource, requireSourceConfig } from "../src/trace/source-config";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

declare module "node:fs/promises" {
  export function copyFile(source: string, destination: string): Promise<void>;
}

type SqliteDatabase = {
  query(sql: string): { get(...params: unknown[]): unknown; run(...params: unknown[]): void };
  exec(sql: string): void;
  close(): void;
};
const fixtureRoot = join(import.meta.dir, "..", "fixtures", "trace", "openclaw", "30afbaf8-claim");
const session = "sess-plain-001";
const headPath = ".boulder/trace-state/head.json";
const traces = ".boulder/traces";
const fixture = (name = "case-01-plain.sqlite") => join(fixtureRoot, name);

async function collect(root: string, extra: readonly string[] = [], selected = session) {
  return runBoulder(["trace", "collect", "--source", "openclaw-local", "--session", selected,
    "--once", "--write", "--json", "--cwd", root, ...extra]);
}
async function readSnapshot(root: string): Promise<SessionSnapshot> {
  const head = (await loadHead(root))!;
  const records = (await readFile(join(root, traces, head.fileName), "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line));
  const record = records.find((record) => record.schema_version === SNAPSHOT_RECORD_VERSION);
  expect(isSessionSnapshot(record)).toBe(true);
  const { schema_version, ...snapshot } = record;
  return snapshot;
}
async function files(root: string): Promise<string[]> { return (await readdir(join(root, traces))).sort(); }
async function noJournal(root: string): Promise<void> {
  expect(await exists(join(root, traces))).toBe(false);
  expect(await exists(join(root, headPath))).toBe(false);
  expect(await exists(join(root, ".boulder/trace-state/source-config.json"))).toBe(false);
  expect(await exists(join(root, ".boulder/trace-state/writer.lock"))).toBe(false);
}
async function mutableSource(root: string): Promise<string> {
  const path = join(root, "source.sqlite");
  await copyFile(fixture(), path);
  return path;
}
function mutate(path: string, action: (db: SqliteDatabase) => void): void {
  const db = new Database(path) as SqliteDatabase;
  try { action(db); } finally { db.close(); }
}
function updatePayload(db: SqliteDatabase, seq: number, transform: (payload: Record<string, unknown>) => void): string {
  const row = db.query("SELECT event_json FROM transcript_events WHERE session_id = ? AND seq = ?").get(session, seq) as { event_json: string };
  const event = JSON.parse(row.event_json);
  transform(event);
  const json = JSON.stringify(event);
  db.query("UPDATE transcript_events SET event_json = ?, event_utf8_bytes = ? WHERE session_id = ? AND seq = ?")
    .run(json, new TextEncoder().encode(json).byteLength, session, seq);
  return row.event_json;
}

describe("boulder trace collect one-shot CLI", () => {
  test("first collection commits metadata-only inventory; unchanged re-collect writes no segment or head", async () => {
    const root = await tempRepo();
    try {
      const result = await collect(root, ["--db-path", fixture()]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      const report: CollectReport = JSON.parse(result.stdout);
      expect(report.status).toBe("committed");
      expect(report.input_count).toBe(5);
      expect(report.disposition_counts).toEqual({ normalized: 5, ignored: 0, quarantined: 0 });
      expect(report.coverage).toEqual({ kind: "full_session", input_count: 5 });
      expect(report.segment_seq).toBe(1);
      const snapshot = await readSnapshot(root);
      expect(snapshot.snapshot_id).toBe(report.snapshot_id);
      expect(snapshot.supersedes_snapshot_id).toBeNull();
      const { snapshot_id, supersedes_snapshot_id, snapshot_digest, ...content } = snapshot;
      expect(snapshot_digest).toBe(await snapshotDigest(content));
      const head = (await loadHead(root))!;
      expect(head.snapshotRefs[0].snapshot_id).toBe(snapshot.snapshot_id);
      const bytes = await readFile(join(root, traces, head.fileName), "utf8");
      expect(bytes).not.toContain("List the files in the current directory.");
      expect(bytes).not.toContain("ls -la");
      expect(bytes).not.toContain("The directory is empty.");
      const before = await readFile(join(root, headPath), "utf8");
      const config = await requireSourceConfig(root);
      expect(config.source_instance_id).toBe(snapshot.source_instance_id);
      // No --db-path: the first successful explicit-path collect registered it.
      const again = await collect(root);
      expect(again.exitCode).toBe(0);
      expect(JSON.parse(again.stdout).status).toBe("no-op");
      expect(JSON.parse(again.stdout).snapshot_id).toBe(snapshot.snapshot_id);
      expect(await files(root)).toEqual([head.fileName]);
      expect(await readFile(join(root, headPath), "utf8")).toBe(before);
    } finally { await removeTempRepo(root); }
  });

  test("in-place update, A -> B -> A and row removal use full inventory, never MAX(seq)", async () => {
    const root = await tempRepo();
    try {
      const path = await mutableSource(root);
      expect((await collect(root, ["--db-path", "source.sqlite"])).exitCode).toBe(0);
      const first = await readSnapshot(root);
      let original = "";
      mutate(path, (db) => {
        original = updatePayload(db, 5, (event) => { (event.usage as Record<string, number>).promptTokens = 321; });
        expect(db.query("SELECT MAX(seq) AS seq FROM transcript_events").get()).toEqual({ seq: 5 });
      });
      const changed = await collect(root);
      expect(changed.exitCode).toBe(0);
      const second = await readSnapshot(root);
      expect(second.snapshot_id).not.toBe(first.snapshot_id);
      expect(second.snapshot_digest).not.toBe(first.snapshot_digest);
      expect(second.supersedes_snapshot_id).toBe(first.snapshot_id);
      expect(second.input_inventory[4].source_revision).not.toBe(first.input_inventory[4].source_revision);
      expect(second.input_inventory[4].normalized_facts?.usage).toEqual({ promptTokens: 321, completionTokens: 40, cacheReadTokens: 12 });
      mutate(path, (db) => {
        db.query("UPDATE transcript_events SET event_json = ?, event_utf8_bytes = ? WHERE session_id = ? AND seq = 5")
          .run(original, new TextEncoder().encode(original).byteLength, session);
      });
      expect((await collect(root)).exitCode).toBe(0);
      const restored = await readSnapshot(root);
      expect(restored.snapshot_digest).toBe(first.snapshot_digest);
      expect(restored.snapshot_id).not.toBe(first.snapshot_id);
      expect(restored.supersedes_snapshot_id).toBe(second.snapshot_id);
      mutate(path, (db) => {
        db.query("DELETE FROM transcript_events WHERE session_id = ? AND seq = 2").run(session);
        expect(db.query("SELECT MAX(seq) AS seq FROM transcript_events").get()).toEqual({ seq: 5 });
      });
      const removed = await collect(root);
      expect(removed.exitCode).toBe(0);
      const last = await readSnapshot(root);
      expect(last.supersedes_snapshot_id).toBe(restored.snapshot_id);
      expect(last.coverage.input_count).toBe(4);
      expect(last.input_inventory.map((row) => row.source_row_key)).not.toContain(JSON.stringify([session, 2]));
      expect(first.input_inventory).toHaveLength(5); // historical observation remains intact
      expect(await files(root)).toHaveLength(4);
    } finally { await removeTempRepo(root); }
  });

  test("body-only changes still change revisions although raw bodies are never journaled", async () => {
    const root = await tempRepo();
    try {
      const path = await mutableSource(root);
      await collect(root, ["--db-path", path]);
      const first = await readSnapshot(root);
      mutate(path, (db) => { updatePayload(db, 2, (event) => { event.content = "changed private body"; }); });
      expect((await collect(root)).exitCode).toBe(0);
      const second = await readSnapshot(root);
      expect(second.snapshot_digest).not.toBe(first.snapshot_digest);
      expect(second.input_inventory[1].normalized_facts).toEqual(first.input_inventory[1].normalized_facts);
      expect(JSON.stringify(second)).not.toContain("changed private body");
    } finally { await removeTempRepo(root); }
  });

  test("quarantined fixture is durable but exits nonzero, including unchanged retry", async () => {
    const root = await tempRepo();
    try {
      const result = await collect(root, ["--db-path", fixture("case-06-malformed.sqlite")], "sess-malformed-001");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("trace.quarantined");
      const report: CollectReport = JSON.parse(result.stdout);
      expect(report.status).toBe("committed");
      expect(report.complete).toBe(false);
      expect(report.disposition_counts).toEqual({ normalized: 1, ignored: 0, quarantined: 4 });
      expect(report.reasons).toEqual(["invalid_usage_value", "dangling_tool_result", "unknown_message_role", "decode_parse"]);
      expect((await readSnapshot(root)).snapshot_id).toBe(report.snapshot_id);
      const again = await collect(root, [], "sess-malformed-001");
      expect(again.exitCode).toBe(1);
      expect(JSON.parse(again.stdout).status).toBe("no-op");
      expect(await files(root)).toHaveLength(1);
    } finally { await removeTempRepo(root); }
  });

  test("an incomplete corrupt-byte fingerprint is not mistaken for inventory equality", async () => {
    const root = await tempRepo();
    try {
      const path = await mutableSource(root);
      mutate(path, (db) => { db.exec("UPDATE transcript_events SET event_json = NULL, event_zstd = X'0000' WHERE seq = 2"); });
      const first = await collect(root, ["--db-path", path]);
      expect(first.exitCode).toBe(1);
      mutate(path, (db) => { db.exec("UPDATE transcript_events SET event_zstd = X'0101' WHERE seq = 2"); });
      const second = await collect(root);
      expect(second.exitCode).toBe(1);
      expect(JSON.parse(second.stdout).status).toBe("committed");
      expect(JSON.parse(second.stdout).supersedes_snapshot_id).toBe(JSON.parse(first.stdout).snapshot_id);
      expect(await files(root)).toHaveLength(2);
    } finally { await removeTempRepo(root); }
  });

  test("dry-run on a fresh workspace creates no artifacts, even for quarantine", async () => {
    const root = await tempRepo();
    try {
      for (const [name, selected, exit] of [["case-01-plain.sqlite", session, 0], ["case-06-malformed.sqlite", "sess-malformed-001", 1]] as const) {
        const result = await runBoulder(["trace", "collect", "--session", selected, "--once", "--dry-run", "--json",
          "--db-path", fixture(name), "--cwd", root]);
        expect(result.exitCode).toBe(exit);
        expect(JSON.parse(result.stdout).mode).toBe("dry-run");
        expect(JSON.parse(result.stdout).status).toBe("would_commit");
        expect(await readdir(root)).toEqual([]);
      }
    } finally { await removeTempRepo(root); }
  });

  test("held lock rejects writes without disturbing the owner; dry-run takes no lock", async () => {
    const root = await tempRepo();
    try {
      const lock = await acquire(root, { command: "held by test" });
      try {
        const before = await readFile(join(lock.path, "owner.json"), "utf8");
        const result = await collect(root, ["--db-path", fixture()]);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain("trace.writer_busy");
        const dry = await runBoulder(["trace", "collect", "--session", session, "--once", "--dry-run", "--json",
          "--db-path", fixture(), "--cwd", root]);
        expect(dry.exitCode).toBe(0);
        expect(await readFile(join(lock.path, "owner.json"), "utf8")).toBe(before);
        expect(await exists(join(root, traces))).toBe(false);
        expect(await exists(join(root, headPath))).toBe(false);
      } finally { await lock.release(); }
    } finally { await removeTempRepo(root); }
  });

  test("unknown session, unsupported schema and missing database fail without publishing artifacts", async () => {
    const root = await tempRepo();
    try {
      for (const [path, selected, code] of [
        [fixture(), "no-such-session", "trace.session_not_found"],
        [fixture("case-07-unsupported-schema.sqlite"), "sess-legacy-001", "trace.unsupported_schema"],
        [join(root, "missing.sqlite"), session, "trace.source_open_failed"]
      ]) {
        const result = await collect(root, ["--db-path", path], selected);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(code);
        await noJournal(root);
      }
      expect(await exists(join(root, "missing.sqlite"))).toBe(false);
    } finally { await removeTempRepo(root); }
  });

  test("registered identity survives path override and tracks separate sessions independently", async () => {
    const root = await tempRepo();
    try {
      await registerSource(root, { db_path: fixture() }, { source_instance_id: "registered-source" });
      const first = await collect(root);
      expect(first.exitCode).toBe(0);
      expect(JSON.parse(first.stdout).source_instance_id).toBe("registered-source");
      const path = await mutableSource(root);
      mutate(path, (db) => { db.exec("INSERT INTO transcript_events SELECT 'other-session', seq, event_json, event_zstd, event_utf8_bytes FROM transcript_events"); });
      expect((await collect(root, ["--db-path", path], "other-session")).exitCode).toBe(0);
      expect((await loadHead(root))!.snapshotRefs).toHaveLength(2);
      const repeated = await collect(root, ["--db-path", path]);
      expect(repeated.exitCode).toBe(0);
      expect(JSON.parse(repeated.stdout).status).toBe("no-op");
      expect(JSON.parse(repeated.stdout).snapshot_id).toBe(JSON.parse(first.stdout).snapshot_id);
      expect(await files(root)).toHaveLength(2);
    } finally { await removeTempRepo(root); }
  });

  test("compressed rows and an ignored structural record reconcile the full manifest", async () => {
    const root = await tempRepo();
    try {
      const zstd = await collect(root, ["--db-path", fixture("case-02-zstd.sqlite")], "sess-zstd-001");
      expect(zstd.exitCode).toBe(0);
      expect(JSON.parse(zstd.stdout).disposition_counts).toEqual({ normalized: 4, ignored: 0, quarantined: 0 });
      const path = await mutableSource(root);
      mutate(path, (db) => {
        const header = JSON.stringify({ type: "session_header", version: 1, sessionId: session });
        db.query("INSERT INTO transcript_events VALUES (?, 0, ?, NULL, ?)").run(session, header, new TextEncoder().encode(header).byteLength);
      });
      const ignored = await collect(root, ["--db-path", path]);
      expect(ignored.exitCode).toBe(0);
      expect(JSON.parse(ignored.stdout).disposition_counts).toEqual({ normalized: 5, ignored: 1, quarantined: 0 });
      expect(JSON.parse(ignored.stdout).input_count).toBe(6);
    } finally { await removeTempRepo(root); }
  });

  test("retry recovers a complete unpublished successor and sweeps partial temps without duplicating snapshots", async () => {
    const root = await tempRepo();
    try {
      const path = await mutableSource(root);
      await collect(root, ["--db-path", path]);
      const oldHead = await readFile(join(root, headPath), "utf8");
      mutate(path, (db) => { updatePayload(db, 2, (event) => { event.content = "updated"; }); });
      const published = await collect(root);
      expect(published.exitCode).toBe(0);
      const recoveredHead = await readFile(join(root, headPath), "utf8");
      // Deterministic crash state: segment rename completed, head rename did not.
      await writeFile(join(root, headPath), oldHead, "utf8");
      await write(root, `${traces}/interrupted.tmp`, "partial segment");
      await write(root, `${headPath}.tmp`, "partial head");
      const dry = await runBoulder(["trace", "collect", "--session", session, "--once", "--dry-run", "--json", "--cwd", root]);
      expect(dry.exitCode).toBe(0);
      expect(JSON.parse(dry.stdout).status).toBe("would_commit");
      expect(await readFile(join(root, headPath), "utf8")).toBe(oldHead);
      expect(await exists(join(root, `${traces}/interrupted.tmp`))).toBe(true);
      const retry = await collect(root);
      expect(retry.exitCode).toBe(0);
      expect(JSON.parse(retry.stdout).status).toBe("no-op");
      expect(JSON.parse(retry.stdout).snapshot_id).toBe(JSON.parse(published.stdout).snapshot_id);
      expect(await readFile(join(root, headPath), "utf8")).toBe(recoveredHead);
      expect(await files(root)).toHaveLength(2);
      expect(await exists(join(root, `${headPath}.tmp`))).toBe(false);
      // Also cover genesis recovery after the sole publishing pointer is lost.
      await unlink(join(root, headPath));
      expect((await collect(root)).exitCode).toBe(0);
      expect(await readFile(join(root, headPath), "utf8")).toBe(recoveredHead);
      expect(await files(root)).toHaveLength(2);
    } finally { await removeTempRepo(root); }
  });

  test("published corruption fails closed rather than reporting a successful no-op", async () => {
    const root = await tempRepo();
    try {
      await collect(root, ["--db-path", fixture()]);
      const head = (await loadHead(root))!;
      const path = join(root, traces, head.fileName);
      const bytes = await readFile(path, "utf8");
      await writeFile(path, bytes.replace('"role":"user"', '"role":"pluto"'), "utf8");
      const result = await collect(root);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("trace.head_digest_mismatch");
      expect(await loadHead(root)).toEqual(head);
      expect(await files(root)).toHaveLength(1);
    } finally { await removeTempRepo(root); }
  });

  test("requires an explicit once/mutation mode and rejects live flags before any writes", async () => {
    const root = await tempRepo();
    try {
      for (const flags of [[], ["--once"], ["--write"], ["--once", "--write", "--dry-run"],
        ["--once", "--write", "--follow"], ["--once", "--dry-run", "--live=true"]]) {
        const result = await runBoulder(["trace", "collect", "--session", session, "--db-path", fixture(), "--cwd", root, ...flags]);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toMatch(/trace\.(once_required|collect_mode_required)/);
        expect(await readdir(root)).toEqual([]);
      }
      const missingConfig = await collect(root);
      expect(missingConfig.exitCode).toBe(1);
      expect(missingConfig.stderr).toContain("trace.source_config_required");
      expect(await readdir(root)).toEqual([]);
      for (const flags of [["--db-path"], ["--source", "unsupported"], ["--session", ""]]) {
        const result = await runBoulder(["trace", "collect", "--once", "--write", "--cwd", root, ...flags]);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(await readdir(root)).toEqual([]);
      }
    } finally { await removeTempRepo(root); }
  });
});
