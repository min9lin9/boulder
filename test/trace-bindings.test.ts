import { describe, expect, test } from "bun:test";
// @ts-expect-error -- bun:sqlite types are not vendored in this repo.
import { Database } from "bun:sqlite";
import { copyFile, lstat, readFile, readdir, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { acquire } from "../src/evidence-write-lock";
import { evidenceDescriptorHash, evidenceDescriptorPath, readEvidenceDescriptor, type EvidenceDescriptor } from "../src/evidence/descriptors";
import { exists } from "../src/fs";
import { recordRunEvent } from "../src/run-events";
import { bindingPath, isTraceBinding, linkTrace, readBinding, type LinkOptions, type LinkReport } from "../src/trace/bindings";
import { collectSession, SNAPSHOT_RECORD_VERSION } from "../src/trace/collect";
import { type SessionSnapshot } from "../src/trace/contracts";
import { loadHead } from "../src/trace/journal";
import { removeTempRepo, runBoulder, tempRepo } from "./helpers/cli";

type SqliteDatabase = {
  query(sql: string): { run(...params: unknown[]): void };
  exec(sql: string): void;
  close(): void;
};
const session = "sess-plain-001";
const fixture = join(import.meta.dir, "..", "fixtures", "trace", "openclaw", "30afbaf8-claim", "case-01-plain.sqlite");
const locator = (seq: number) => JSON.stringify([session, seq]);
const headPath = (root: string) => join(root, ".boulder/trace-state/head.json");

async function setup(root: string) {
  await copyFile(fixture, join(root, "source.sqlite"));
  const collected = await collectSession(root, { sessionId: session, dbPath: "source.sqlite", dryRun: false });
  const run = await recordRunEvent(root, {
    eventName: "release-check", command: "release-check --json",
    startedAt: "2026-01-05T12:00:00.000Z", completedAt: "2026-01-05T12:01:00.000Z",
    severity: "info", status: "pass", checkIds: [], recoveryHintIds: [], artifactPaths: []
  });
  const options: LinkOptions = {
    snapshotId: collected.snapshot_id, fromEvent: locator(2), toEvent: locator(4), runId: run.event.runId, dryRun: false
  };
  return { collected, run, options };
}
async function snapshot(root: string): Promise<SessionSnapshot> {
  const head = (await loadHead(root))!;
  const lines = (await readFile(join(root, ".boulder/traces", head.fileName), "utf8")).trimEnd().split("\n");
  return lines.map((line) => JSON.parse(line)).find((record) => record.schema_version === SNAPSHOT_RECORD_VERSION);
}
function mutate(root: string, action: (db: SqliteDatabase) => void): void {
  const db = new Database(join(root, "source.sqlite")) as SqliteDatabase;
  try { action(db); } finally { db.close(); }
}
async function cliLink(root: string, options: LinkOptions, extra: readonly string[] = []) {
  return runBoulder(["trace", "link", "--snapshot", options.snapshotId, "--from-event", options.fromEvent,
    "--to-event", options.toEvent, "--run-id", options.runId, options.dryRun ? "--dry-run" : "--write", "--json", "--cwd", root, ...extra]);
}
async function refuse(root: string, options: LinkOptions, code: string): Promise<void> {
  const result = await cliLink(root, options);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain(`ERROR ${code}:`);
  expect(await exists(join(root, ".boulder/trace-state/bindings"))).toBe(false);
  expect(await exists(join(root, ".boulder/evidence"))).toBe(false);
}
// Compare directory/file entries, contents and mtimes, not merely binding count.
// atime is intentionally excluded: reading files can change it on some filesystems.
async function tree(root: string, relative = ""): Promise<unknown[]> {
  const result: unknown[] = [];
  for (const name of (await readdir(join(root, relative))).sort()) {
    const path = join(relative, name);
    const info = await lstat(join(root, path));
    const mtime = (info as typeof info & { mtimeMs: number }).mtimeMs;
    result.push(info.isDirectory() ? [path, mtime, await tree(root, path)] : [path, mtime, await readFile(join(root, path), "utf8")]);
  }
  return result;
}

describe("trace link frozen event bindings", () => {
  test("real collect + real command-run -> CLI link persists a bounded metadata-only binding", async () => {
    const root = await tempRepo();
    try {
      const { options, collected, run } = await setup(root);
      const observed = await snapshot(root);
      const headBefore = await readFile(headPath(root), "utf8");
      const result = await cliLink(root, options);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      const report: LinkReport = JSON.parse(result.stdout);
      expect(report.status).toBe("committed");
      expect(report.binding.journal_id).toBe(collected.journal_id);
      expect(report.binding.snapshot_id).toBe(collected.snapshot_id);
      expect(report.binding.snapshot_digest).toBe(collected.snapshot_digest);
      expect(report.binding.binding_basis).toBe("operator_explicit");
      expect(report.binding.boulder_command_run_id).toBe(run.event.runId);
      expect(report.binding.selected_events).toEqual(observed.input_inventory.slice(1, 4).map((row) => ({
        source_row_key: row.source_row_key, source_revision: row.source_revision
      })));
      expect(report.span_coverage).toEqual({
        basis: "snapshot_inventory", from_source_row_key: locator(2), to_source_row_key: locator(4),
        selected_input_count: 3, snapshot_input_count: 5,
        disposition_counts: { normalized: 3, ignored: 0, quarantined: 0 }, execution_span_coverage: "unavailable"
      });
      expect(isTraceBinding(report.binding)).toBe(true);
      expect(Number.isFinite(Date.parse(report.binding.createdAt))).toBe(true);
      expect(report.binding_path).toBe(bindingPath(root, report.binding.binding_id));
      const stored = await readFile(report.binding_path, "utf8");
      expect(JSON.parse(stored)).toEqual(report.binding);
      expect(stored).not.toContain("List the files");
      expect(stored).not.toContain("ls -la");
      expect(await readBinding(root, report.binding.binding_id)).toEqual(report.binding);
      const globalFlagsFirst = await runBoulder(["--run-id", run.event.runId, "--cwd", root, "trace", "link",
        "--snapshot", options.snapshotId, "--from-event", options.fromEvent, "--to-event", options.toEvent, "--write", "--json"]);
      expect(globalFlagsFirst.exitCode).toBe(0);
      expect(JSON.parse(globalFlagsFirst.stdout).binding).toEqual(report.binding);
      expect(JSON.parse(globalFlagsFirst.stdout).status).toBe("no-op");
      expect(await readFile(headPath(root), "utf8")).toBe(headBefore);
      expect(await readdir(join(root, ".boulder/traces"))).toHaveLength(1);
      expect(await readdir(join(root, ".boulder/trace-state/bindings"))).toEqual([`${report.binding.binding_id}.json`]);
      const descriptorPath = join(root, ".boulder/evidence/traces", `${report.binding.binding_id}.json`);
      const descriptorText = await readFile(descriptorPath, "utf8");
      const descriptorValue = JSON.parse(descriptorText) as EvidenceDescriptor;
      const { hash: storedHash, ...descriptorContent } = descriptorValue;
      expect(descriptorContent).toEqual({
        schema_version: "boulder.evidence-descriptor.v1",
        descriptor_id: report.binding.binding_id,
        descriptor_kind: "traces",
        descriptor_path: `.boulder/evidence/traces/${report.binding.binding_id}.json`,
        createdAt: descriptorContent.createdAt // exact field set; value checked next
      });
      expect(Number.isFinite(Date.parse(descriptorContent.createdAt))).toBe(true);
      expect(storedHash).toBe(await evidenceDescriptorHash(descriptorContent));
      // The same authenticator routine evidence attach uses accepts it.
      expect(await readEvidenceDescriptor(root, "traces", report.binding.binding_id)).toEqual({
        descriptor: descriptorValue,
        path: evidenceDescriptorPath("traces", report.binding.binding_id)
      });
      // A no-op link retry reuses the minted descriptor instead of reminting.
      expect((await linkTrace(root, options)).status).toBe("no-op");
      expect(await readFile(descriptorPath, "utf8")).toBe(descriptorText);
      expect(await exists(join(root, ".boulder/trace-state/writer.lock"))).toBe(false);
    } finally { await removeTempRepo(root); }
  });

  test("dry-run writes nothing and can resolve while another writer holds the lock", async () => {
    const root = await tempRepo();
    try {
      const { options } = await setup(root);
      const lock = await acquire(root, { command: "test owner" });
      try {
        const before = await tree(root);
        const dry = await cliLink(root, { ...options, dryRun: true });
        expect(dry.exitCode).toBe(0);
        expect(JSON.parse(dry.stdout).status).toBe("would_commit");
        expect(JSON.parse(dry.stdout).binding.selected_events).toHaveLength(3);
        expect(await tree(root)).toEqual(before);
        await refuse(root, options, "trace.writer_busy");
        expect(await tree(root)).toEqual(before);
      } finally { await lock.release(); }
    } finally { await removeTempRepo(root); }
  });

  test("native IDs, logical IDs and locators produce the same idempotent binding and retain createdAt", async () => {
    const root = await tempRepo();
    try {
      const { options } = await setup(root);
      mutate(root, (db) => db.exec(`UPDATE transcript_events SET event_json = json_set(event_json, '$.id', 'event-' || seq),
        event_utf8_bytes = length(CAST(json_set(event_json, '$.id', 'event-' || seq) AS BLOB))`));
      const collected = await collectSession(root, { sessionId: session, dryRun: false });
      const observed = await snapshot(root);
      const selected = { ...options, snapshotId: collected.snapshot_id };
      const dry = await linkTrace(root, { ...selected, dryRun: true });
      const first = await linkTrace(root, selected);
      expect(first.binding.binding_id).toBe(dry.binding.binding_id);
      const before = await readFile(first.binding_path, "utf8");
      for (const endpoints of [
        { fromEvent: "event-2", toEvent: "event-4" },
        { fromEvent: observed.input_inventory[1].logical_event_id!, toEvent: observed.input_inventory[3].logical_event_id! }
      ]) {
        const again = await linkTrace(root, { ...selected, ...endpoints });
        expect(again.status).toBe("no-op");
        expect(again.binding).toEqual(first.binding);
        expect(await readFile(first.binding_path, "utf8")).toBe(before);
      }
      const treeBefore = await tree(root);
      expect((await linkTrace(root, { ...selected, dryRun: true })).status).toBe("no-op");
      expect(await tree(root)).toEqual(treeBefore);
      expect(await readdir(join(root, ".boulder/trace-state/bindings"))).toHaveLength(1);
    } finally { await removeTempRepo(root); }
  });

  test("source rewrites and appended events cannot change or expand a historical binding", async () => {
    const root = await tempRepo();
    try {
      const { options } = await setup(root);
      const first = await linkTrace(root, { ...options, toEvent: locator(5) });
      const original = await readFile(first.binding_path, "utf8");
      mutate(root, (db) => {
        const payload = JSON.stringify({ type: "message", role: "assistant", content: "new revision" });
        db.query("UPDATE transcript_events SET event_json = ?, event_utf8_bytes = ? WHERE seq = 5").run(payload, payload.length);
        db.query("INSERT INTO transcript_events VALUES (?, 6, ?, NULL, ?)").run(session, payload, payload.length);
      });
      const newer = await collectSession(root, { sessionId: session, dryRun: false });
      expect(newer.snapshot_id).not.toBe(options.snapshotId);
      const historical = await linkTrace(root, { ...options, toEvent: locator(5) });
      expect(historical.status).toBe("no-op");
      expect(historical.binding).toEqual(first.binding);
      const latest = await linkTrace(root, { ...options, snapshotId: newer.snapshot_id, toEvent: locator(6) });
      expect(latest.binding.selected_events).toHaveLength(5);
      expect(latest.binding.selected_events[3].source_revision).not.toBe(first.binding.selected_events[3].source_revision);
      expect(latest.binding.binding_id).not.toBe(first.binding.binding_id);
      expect(await readFile(first.binding_path, "utf8")).toBe(original);
      const outside = await cliLink(root, { ...options, toEvent: locator(6) });
      expect(outside.exitCode).toBe(1);
      expect(outside.stdout).toBe("");
      expect(outside.stderr).toContain("trace.event_not_in_snapshot");
    } finally { await removeTempRepo(root); }
  });

  test("bad IDs and unpublished candidates refuse without recovering the journal", async () => {
    const root = await tempRepo();
    try {
      const { options } = await setup(root);
      for (const dryRun of [true, false]) await refuse(root, { ...options, dryRun, snapshotId: "not-a-snapshot" }, "trace.snapshot_not_committed");
      const oldHead = await readFile(headPath(root), "utf8");
      mutate(root, (db) => db.exec("DELETE FROM transcript_events WHERE seq = 5"));
      const candidate = await collectSession(root, { sessionId: session, dryRun: false });
      await writeFile(headPath(root), oldHead, "utf8"); // deterministic crash after segment rename, before head publication
      for (const dryRun of [true, false]) await refuse(root, { ...options, dryRun, snapshotId: candidate.snapshot_id }, "trace.snapshot_not_committed");
      expect(await readFile(headPath(root), "utf8")).toBe(oldHead);
      expect((await linkTrace(root, { ...options, dryRun: true })).binding.snapshot_id).toBe(options.snapshotId);
      await unlink(headPath(root));
      for (const dryRun of [true, false]) await refuse(root, { ...options, dryRun }, "trace.snapshot_not_committed");
      expect(await exists(headPath(root))).toBe(false);
    } finally { await removeTempRepo(root); }
  });

  test("tampered snapshot content refuses with a named digest error and no success output", async () => {
    const root = await tempRepo();
    try {
      const { options } = await setup(root);
      const head = (await loadHead(root))!;
      const path = join(root, ".boulder/traces", head.fileName);
      const text = await readFile(path, "utf8");
      expect(text).toContain('"role":"user"');
      await writeFile(path, text.replace('"role":"user"', '"role":"assistant"'), "utf8");
      for (const dryRun of [true, false]) await refuse(root, { ...options, dryRun }, "trace.snapshot_digest_mismatch");
    } finally { await removeTempRepo(root); }
  });

  test("tampered publishing digest and checkpoint references cannot authenticate a snapshot", async () => {
    const root = await tempRepo();
    try {
      const { options } = await setup(root);
      const head = (await loadHead(root))!;
      for (const changed of [
        { ...head, digest: "f".repeat(64) },
        { ...head, snapshotRefs: head.snapshotRefs.map((ref) => ({ ...ref, snapshot_digest: "f".repeat(64) })) }
      ]) {
        await writeFile(headPath(root), JSON.stringify(changed), "utf8");
        await refuse(root, options, "trace.head_digest_mismatch");
      }
    } finally { await removeTempRepo(root); }
  });

  test("unknown, malformed or wrong-schema command-run targets cannot be linked", async () => {
    const root = await tempRepo();
    try {
      const { options, run } = await setup(root);
      await refuse(root, { ...options, runId: crypto.randomUUID() }, "trace.run_not_found");
      await refuse(root, { ...options, runId: "../../runs" }, "trace.run_id_invalid");
      await writeFile(run.path, JSON.stringify({ ...run.event, schemaVersion: "boulder.routine.v1" }), "utf8");
      await refuse(root, options, "trace.run_not_found");
    } finally { await removeTempRepo(root); }
  });

  test("outside endpoints, reversed ranges and incomplete revisions refuse rather than narrowing the selection", async () => {
    const root = await tempRepo();
    try {
      const { options } = await setup(root);
      for (const endpoint of [{ fromEvent: locator(0) }, { toEvent: locator(6) }, { toEvent: '["other-session",4]' }]) {
        await refuse(root, { ...options, ...endpoint }, "trace.event_not_in_snapshot");
      }
      await refuse(root, { ...options, fromEvent: locator(4), toEvent: locator(2) }, "trace.event_range_invalid");
      mutate(root, (db) => db.exec("UPDATE transcript_events SET event_json = NULL, event_zstd = X'0000' WHERE seq = 3"));
      const quarantined = await collectSession(root, { sessionId: session, dryRun: false });
      await refuse(root, { ...options, snapshotId: quarantined.snapshot_id }, "trace.event_revision_unavailable");
    } finally { await removeTempRepo(root); }
  });

  test("link --write mints the descriptor routine evidence add attaches end-to-end", async () => {
    const root = await tempRepo();
    try {
      const { options } = await setup(root);
      const linked = await cliLink(root, options);
      expect(linked.exitCode).toBe(0);
      const bindingId = (JSON.parse(linked.stdout) as LinkReport).binding.binding_id;
      const captured = await runBoulder(["routine", "capture", "--task", "Review failures", "--write", "--json", "--cwd", root]);
      expect(captured.exitCode).toBe(0);
      const attached = await runBoulder(["routine", "evidence", "add", "--task", "review-failures", "--ordinal", "1",
        "--descriptor-kind", "traces", "--descriptor-id", bindingId, "--note", "pinned span", "--json", "--cwd", root]);
      expect(attached.exitCode).toBe(0);
      expect(attached.stderr).toBe("");
      const descriptorPath = `.boulder/evidence/traces/${bindingId}.json`;
      expect(JSON.parse(attached.stdout)).toEqual({
        status: "attached", artifact_path: ".boulder/routines/review-failures.json", evidence_refs: [descriptorPath]
      });
      const { descriptor } = await readEvidenceDescriptor(root, "traces", bindingId);
      const routine = JSON.parse(await readFile(join(root, ".boulder/routines/review-failures.json"), "utf8"));
      expect(routine.evidenceRefs).toEqual([
        { kind: "traces", path: descriptorPath, hash: descriptor.hash, note: "pinned span" }
      ]);
      const again = await runBoulder(["routine", "evidence", "add", "--task", "review-failures", "--ordinal", "1",
        "--descriptor-kind", "traces", "--descriptor-id", bindingId, "--json", "--cwd", root]);
      expect(again.exitCode).toBe(0);
      expect(JSON.parse(await readFile(join(root, ".boulder/routines/review-failures.json"), "utf8")).evidenceRefs).toHaveLength(1);
    } finally { await removeTempRepo(root); }
  });

  test("single-event selection is inclusive; a different run is a different binding", async () => {
    const root = await tempRepo();
    try {
      const { options, run } = await setup(root);
      const first = await linkTrace(root, { ...options, toEvent: options.fromEvent });
      expect(first.binding.selected_events).toHaveLength(1);
      const otherRun = await recordRunEvent(root, run.event);
      const other = await linkTrace(root, { ...options, toEvent: options.fromEvent, runId: otherRun.event.runId });
      expect(other.binding.binding_id).not.toBe(first.binding.binding_id);
    } finally { await removeTempRepo(root); }
  });

  test("tampered existing bindings refuse instead of being overwritten on retry", async () => {
    const root = await tempRepo();
    try {
      const { options } = await setup(root);
      const first = await linkTrace(root, options);
      const changed = JSON.stringify({ ...first.binding, boulder_command_run_id: crypto.randomUUID() });
      await writeFile(first.binding_path, changed, "utf8");
      const retry = await cliLink(root, options);
      expect(retry.exitCode).toBe(1);
      expect(retry.stdout).toBe("");
      expect(retry.stderr).toContain("trace.binding_digest_mismatch");
      expect(await readFile(first.binding_path, "utf8")).toBe(changed);
    } finally { await removeTempRepo(root); }
  });

  test("binding directory symlinks cannot redirect persistence", async () => {
    const root = await tempRepo();
    const outside = await tempRepo();
    try {
      const { options } = await setup(root);
      await symlink(outside, join(root, ".boulder/trace-state/bindings"));
      const result = await cliLink(root, options);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("trace.binding_path_unsafe");
      expect(await readdir(outside)).toEqual([]);
    } finally { await removeTempRepo(root); await removeTempRepo(outside); }
  });

  test("explicit mode and all four selection arguments are required before any writes", async () => {
    const root = await tempRepo();
    try {
      for (const flags of [[], ["--write", "--dry-run"], ["--write"],
        ["--dry-run", "--snapshot", "s"], ["--write", "--snapshot", "s", "--from-event", "a", "--to-event", "b"]]) {
        const result = await runBoulder(["trace", "link", "--cwd", root, ...flags]);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toMatch(/trace\.(link_mode_required|link_argument_required)/);
        expect(await readdir(root)).toEqual([]);
      }
    } finally { await removeTempRepo(root); }
  });
});
