import { describe, expect, test } from "bun:test";
import { constants } from "node:fs";
import { link, lstat, readFile, readdir, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { acquire, WriterBusyError } from "../src/evidence-write-lock";
import { at } from "../src/fs";
import {
  commitBatch, GENESIS_SEGMENT_HASH, journalFs, loadHead, recoverJournal, TraceCommitError,
  type JournalBatch, type JournalFs
} from "../src/trace/journal";
import { removeTempRepo, tempRepo, write } from "./helpers/cli";

const command = "test journal";
const traces = ".boulder/traces";
const state = ".boulder/trace-state";
const headPath = `${state}/head.json`;
const firstName = "000001-batch-1.jsonl";
const segment = `${traces}/${firstName}`;
const enc = new TextEncoder();

async function digest(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))), (b) => b.toString(16).padStart(2, "0")).join("");
}
function batch(sequence = 1, previous: string | null = null, content = "first", id = `batch-${sequence}`): JournalBatch {
  const snapshot_id = `snapshot-${id}`;
  return {
    schema_version: "boulder.trace.batch.v1", journal_id: "journal-1", batch_id: id, batch_seq: sequence,
    previous_segment_hash: previous, adapter_id: "test", interpretation_version: "test.v1", content_policy_version: "test.v1",
    snapshotRefs: [{ source_instance_id: "source", agent_id: "agent", session_id: "session", snapshot_id, snapshot_digest: "a".repeat(64) }],
    records: [{ snapshot_id, content }]
  };
}
async function traceError(operation: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try { await operation; } catch (error) { caught = error; }
  expect(caught instanceof TraceCommitError).toBe(true);
  expect((caught as TraceCommitError).code).toBe(code);
}
async function headText(root: string): Promise<string> { return readFile(at(root, headPath), "utf8"); }
async function journalFiles(root: string): Promise<string[]> { return (await readdir(at(root, traces))).sort(); }

/** Real syscalls with deterministic before/after interception; no global mocking. */
function instrument(root: string, events: string[], hook: (event: string) => void | Promise<void> = () => {}): JournalFs {
  const label = (path: string) => path === root ? "root" : path.slice(root.length + 1);
  async function boundary<T>(event: string, operation: () => Promise<T>): Promise<T> {
    events.push(`before:${event}`);
    await hook(`before:${event}`);
    const result = await operation();
    events.push(`after:${event}`);
    await hook(`after:${event}`);
    return result;
  }
  return {
    ...journalFs,
    mkdir: (path, options) => boundary(`mkdir:${label(path)}`, () => journalFs.mkdir(path, options)),
    unlink: (path) => boundary(`unlink:${label(path)}`, () => journalFs.unlink(path)),
    rename: (from, to) => boundary(`rename:${label(from)}->${label(to)}`, () => journalFs.rename(from, to)),
    async open(path, flags, mode) {
      const handle = await boundary(`open:${label(path)}`, () => journalFs.open(path, flags, mode));
      return new Proxy(handle, {
        get(target, property) {
          if (property === "write") return (bytes: Uint8Array, offset: number, length: number, position: number) =>
            boundary(`write:${label(path)}`, () => target.write(bytes, offset, length, position));
          if (property === "sync") return () => boundary(`sync:${label(path)}`, () => target.sync());
          if (property === "close") return () => boundary(`close:${label(path)}`, () => target.close());
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
    }
  };
}

async function alterSegment(root: string, fileName: string, change: (lines: Record<string, unknown>[]) => void, fixFooter: boolean): Promise<void> {
  const path = at(root, traces, fileName);
  const lines = (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line));
  change(lines);
  if (fixFooter) {
    const prefix = enc.encode(lines.slice(0, -1).map((line) => `${JSON.stringify(line)}\n`).join(""));
    lines[lines.length - 1].digest = await digest(prefix);
  }
  await writeFile(path, lines.map((line) => `${JSON.stringify(line)}\n`).join(""), "utf8");
}

// Every fixture owns its root and its per-call syscall table; no timing races.
describe("trace journal bytes and identity", () => {
  test("UTF-8 framing, both raw-byte digests, permissions, genesis, chain, and durable ordering", async () => {
    const root = await tempRepo();
    try {
      const events: string[] = [];
      const fs = instrument(root, events);
      const one = await commitBatch(root, batch(1, null, "\u96ea\ud83e\udea8\nembedded"), { command, fs });
      events.push("ack");
      const head = (await loadHead(root))!;
      const handle = await journalFs.open(at(root, traces, one.fileName), constants.O_RDONLY);
      let bytes: Uint8Array;
      try { bytes = await handle.readFile(); } finally { await handle.close(); }
      const text = new TextDecoder().decode(bytes);
      const lines = text.slice(0, -1).split("\n").map((line) => JSON.parse(line));
      const footerStart = bytes.lastIndexOf(10, bytes.length - 2) + 1;
      expect(bytes[bytes.length - 1]).toBe(10);
      expect(lines).toHaveLength(3);
      expect(lines[0].previous_segment_hash).toBe(GENESIS_SEGMENT_HASH);
      expect(lines[2].record_count).toBe(1);
      expect(lines[2].digest).toBe(await digest(bytes.subarray(0, footerStart)));
      expect(head.digest).toBe(await digest(bytes));
      expect(head.byteLength).toBe(bytes.byteLength);
      expect(head.byteLength).toBeGreaterThan(text.length);
      expect(one.digest).toBe(head.digest);
      expect(one.fileName).toBe(firstName);
      expect(Reflect.get(await lstat(at(root, segment)), "mode") & 0o777).toBe(0o600);
      expect(Reflect.get(await lstat(at(root, headPath)), "mode") & 0o777).toBe(0o600);
      const order = [
        "after:sync:root", "after:sync:.boulder", `after:write:${segment}.tmp`, `after:sync:${segment}.tmp`,
        `after:close:${segment}.tmp`, `after:rename:${segment}.tmp->${segment}`, `after:sync:${traces}`,
        `after:write:${headPath}.tmp`, `after:sync:${headPath}.tmp`, `after:close:${headPath}.tmp`,
        `after:rename:${headPath}.tmp->${headPath}`, `after:sync:${state}`, "ack"
      ];
      let cursor = -1;
      for (const event of order) {
        const next = events.indexOf(event, cursor + 1);
        expect(next).toBeGreaterThan(cursor);
        cursor = next;
      }
      const two = await commitBatch(root, batch(2, one.digest), { command });
      const secondHeader = JSON.parse((await readFile(at(root, traces, two.fileName), "utf8")).split("\n")[0]);
      expect(secondHeader.previous_segment_hash).toBe(one.digest);
      expect(await recoverJournal(root, { command })).toEqual(await loadHead(root));
      expect(await journalFiles(root)).toEqual([firstName, "000002-batch-2.jsonl"]);
    } finally { await removeTempRepo(root); }
  });

  test("loadHead is read-only and ignores all final/temp files beyond publication", async () => {
    const root = await tempRepo();
    try {
      expect(await loadHead(root)).toBeNull();
      expect(await readdir(root)).toEqual([]);
      await write(root, `${traces}/${firstName}`, "not a segment");
      await write(root, `${traces}/999999-unpublished.jsonl.tmp`, "not a segment");
      expect(await loadHead(root)).toBeNull();
      await unlink(at(root, segment));
      await commitBatch(root, batch(), { command });
      const before = await loadHead(root);
      await write(root, `${traces}/999999-unpublished.jsonl`, "invalid but reader never scans it");
      expect(await loadHead(root)).toEqual(before);
    } finally { await removeTempRepo(root); }
  });

  test("duplicate retry does not mutate journal files; a corrupted retry is diagnosed, not acknowledged", async () => {
    const root = await tempRepo();
    try {
      const original = await commitBatch(root, batch(), { command });
      const before = await headText(root);
      const events: string[] = [];
      const duplicate = await commitBatch(root, batch(), { command, fs: instrument(root, events) });
      expect(duplicate).toEqual({ ...original, status: "duplicate" });
      // The same batch_id carrying corrupted records is refused, not acked:
      // dedupe only honors a structurally valid envelope.
      await traceError(commitBatch(root, { ...batch(), records: [] }, { command }), "trace.empty_batch");
      await traceError(commitBatch(root, { ...batch(), records: [42] as unknown as Record<string, unknown>[] }, { command }), "trace.batch_invalid");
      expect(await headText(root)).toBe(before);
      expect(await journalFiles(root)).toEqual([firstName]);
      expect(events.filter((event) => /^before:(write|rename|unlink|mkdir):/.test(event))).toEqual([]);
    } finally { await removeTempRepo(root); }
  });

  test("rejects empty batches, non-next sequences, wrong chains and unsafe batch names", async () => {
    const root = await tempRepo();
    try {
      await traceError(commitBatch(root, { ...batch(), records: [] }, { command }), "trace.empty_batch");
      await traceError(commitBatch(root, batch(2), { command }), "trace.sequence_mismatch");
      await traceError(commitBatch(root, batch(1, "f".repeat(64)), { command }), "trace.chain_mismatch");
      await traceError(commitBatch(root, batch(1, null, "x", "../escape"), { command }), "trace.batch_invalid");
      expect(await loadHead(root)).toBeNull();
      const first = await commitBatch(root, batch(), { command });
      await traceError(commitBatch(root, batch(1, first.digest, "x", "other"), { command }), "trace.sequence_mismatch");
    } finally { await removeTempRepo(root); }
  });

  test("A -> B -> A preserves new observation IDs instead of deduplicating equal content", async () => {
    const root = await tempRepo();
    try {
      const ids: string[] = [];
      const snapshotIds: string[] = [];
      let previous: string | null = null;
      for (const [index, content] of ["A", "B", "A"].entries()) {
        const input = batch(index + 1, previous, content, crypto.randomUUID());
        ids.push(input.batch_id);
        snapshotIds.push(input.snapshotRefs[0].snapshot_id);
        const result = await commitBatch(root, input, { command });
        expect(result.status).toBe("committed");
        previous = result.digest;
      }
      expect(new Set(ids).size).toBe(3);
      expect(new Set(snapshotIds).size).toBe(3);
      expect(await journalFiles(root)).toHaveLength(3);
      expect((await loadHead(root))!.sequence).toBe(3);
    } finally { await removeTempRepo(root); }
  });

  test("busy acquisition propagates without releasing the current owner", async () => {
    const root = await tempRepo();
    try {
      const lock = await acquire(root, { command: "other writer" });
      try {
        let caught: unknown;
        try { await commitBatch(root, batch(), { command }); } catch (error) { caught = error; }
        expect(caught instanceof WriterBusyError).toBe(true);
        expect(JSON.parse(await readFile(at(lock.path, "owner.json"), "utf8"))).toEqual(lock.owner);
        expect(lock.held).toBe(true);
      } finally { await lock.release(); }
    } finally { await removeTempRepo(root); }
  });
});

describe("trace journal recovery", () => {
  test("sweeps temp orphans and exact stale collisions without replaying them", async () => {
    const root = await tempRepo();
    try {
      await write(root, `${segment}.tmp`, "complete-looking orphan must not replay");
      await write(root, `${headPath}.tmp`, "old head");
      await write(root, `${traces}/orphan.tmp`, "partial");
      expect(await recoverJournal(root, { command })).toBeNull();
      expect(await journalFiles(root)).toEqual([]);
      await write(root, `${segment}.tmp`, "another stale collision");
      expect((await commitBatch(root, batch(), { command })).status).toBe("committed");
      expect(await journalFiles(root)).toEqual([firstName]);
      expect((await readdir(at(root, state))).sort()).toEqual(["head.json"]);
    } finally { await removeTempRepo(root); }
  });

  test("complete unpublished successor reconstructs exactly the same head bytes", async () => {
    const root = await tempRepo();
    try {
      const one = await commitBatch(root, batch(), { command });
      const firstHead = await headText(root);
      const two = await commitBatch(root, batch(2, one.digest), { command });
      const expected = await headText(root);
      await writeFile(at(root, headPath), firstHead, "utf8");
      expect((await loadHead(root))!.sequence).toBe(1);
      expect((await recoverJournal(root, { command }))!.digest).toBe(two.digest);
      expect(await headText(root)).toBe(expected);
    } finally { await removeTempRepo(root); }
  });

  for (const corruption of ["broken-json", "length", "digest", "refs", "sequence", "filename", "timestamp"]) {
    test(`repairs verifiable corrupt head (${corruption}) deterministically from segment bytes`, async () => {
      const root = await tempRepo();
      try {
        await commitBatch(root, batch(), { command });
        const expected = await headText(root);
        const damaged = JSON.parse(expected);
        if (corruption === "length") damaged.byteLength = 1;
        if (corruption === "digest") damaged.digest = "f".repeat(64);
        if (corruption === "refs") damaged.snapshotRefs = [];
        if (corruption === "sequence") damaged.sequence = 99;
        if (corruption === "filename") damaged.fileName = "bad.jsonl";
        if (corruption === "timestamp") damaged.committedAt = "2000-01-01T00:00:00.000Z";
        await writeFile(at(root, headPath), corruption === "broken-json" ? "{" : JSON.stringify(damaged), "utf8");
        await recoverJournal(root, { command });
        expect(await headText(root)).toBe(expected);
      } finally { await removeTempRepo(root); }
    });
  }

  test("conflicting successors are refused before choosing or deleting either", async () => {
    const root = await tempRepo();
    try {
      const first = await commitBatch(root, batch(), { command });
      await commitBatch(root, batch(2, first.digest), { command });
      await write(root, `${traces}/000002-other.jsonl`, await readFile(at(root, traces, "000002-batch-2.jsonl"), "utf8"));
      await traceError(recoverJournal(root, { command }), "trace.conflicting_successors");
      expect(await journalFiles(root)).toHaveLength(3);
    } finally { await removeTempRepo(root); }
  });

  test("published valid JSON with a bad digest halts and preserves all evidence", async () => {
    const root = await tempRepo();
    try {
      await commitBatch(root, batch(), { command });
      const before = await headText(root);
      await alterSegment(root, firstName, (lines) => { lines[1].content = "altered"; }, false);
      await traceError(recoverJournal(root, { command }), "trace.head_digest_mismatch");
      expect(await headText(root)).toBe(before);
      expect(await journalFiles(root)).toEqual([firstName]);
    } finally { await removeTempRepo(root); }
  });

  for (const corruption of ["digest", "filename", "count", "newline"]) {
    test(`corrupt unpublished candidate (${corruption}) is dropped, reported and never republished`, async () => {
      const root = await tempRepo();
      try {
        await commitBatch(root, batch(), { command });
        await unlink(at(root, headPath));
        if (corruption === "digest") await alterSegment(root, firstName, (lines) => { lines[1].content = "altered"; }, false);
        if (corruption === "filename") await rename(at(root, segment), at(root, traces, "000001-wrong.jsonl"));
        if (corruption === "count") await alterSegment(root, firstName, (lines) => { lines[2].record_count = 2; }, true);
        if (corruption === "newline") await writeFile(at(root, segment), (await readFile(at(root, segment), "utf8")).trimEnd(), "utf8");
        await traceError(recoverJournal(root, { command }), "trace.candidate_corrupt");
        expect(await loadHead(root)).toBeNull();
        expect(await journalFiles(root)).toEqual([]);
        expect((await commitBatch(root, batch(), { command })).status).toBe("committed");
      } finally { await removeTempRepo(root); }
    });
  }

  test("a corrupt successor cannot alter an existing published checkpoint", async () => {
    const root = await tempRepo();
    try {
      const one = await commitBatch(root, batch(), { command });
      const before = await headText(root);
      await commitBatch(root, batch(2, one.digest), { command });
      await writeFile(at(root, headPath), before, "utf8");
      await alterSegment(root, "000002-batch-2.jsonl", (lines) => { lines[1].content = "corrupt"; }, false);
      await traceError(recoverJournal(root, { command }), "trace.candidate_corrupt");
      expect(await headText(root)).toBe(before);
      expect(await journalFiles(root)).toEqual([firstName]);
    } finally { await removeTempRepo(root); }
  });

  test("a correct footer cannot hide a broken predecessor chain", async () => {
    const root = await tempRepo();
    try {
      const first = await commitBatch(root, batch(), { command });
      const before = await headText(root);
      await commitBatch(root, batch(2, first.digest), { command });
      await writeFile(at(root, headPath), before, "utf8");
      await alterSegment(root, "000002-batch-2.jsonl", (lines) => { lines[0].previous_segment_hash = GENESIS_SEGMENT_HASH; }, true);
      await traceError(recoverJournal(root, { command }), "trace.chain_mismatch");
      expect(await headText(root)).toBe(before);
      expect(await journalFiles(root)).toHaveLength(2);
    } finally { await removeTempRepo(root); }
  });

  test("sequence gaps and missing published segments require intervention", async () => {
    const root = await tempRepo();
    try {
      const first = await commitBatch(root, batch(), { command });
      await commitBatch(root, batch(2, first.digest), { command });
      await unlink(at(root, segment));
      await traceError(recoverJournal(root, { command }), "trace.sequence_gap");
      await unlink(at(root, traces, "000002-batch-2.jsonl"));
      await traceError(recoverJournal(root, { command }), "trace.head_segment_missing");
    } finally { await removeTempRepo(root); }
  });

  for (const target of ["traces", "head", "segment-hardlink", "segment-symlink"]) {
    test(`rejects unsafe journal path (${target}) without touching the external target`, async () => {
      const root = await tempRepo();
      const outside = await tempRepo();
      try {
        await commitBatch(root, batch(), { command });
        const external = at(outside, "file");
        await writeFile(external, "outside", "utf8");
        if (target === "traces") {
          await rename(at(root, traces), at(root, "saved-traces"));
          await symlink(outside, at(root, traces));
        } else {
          const path = at(root, target === "head" ? headPath : segment);
          await unlink(path);
          if (target === "segment-hardlink") await link(external, path);
          else await symlink(external, path);
        }
        await traceError(recoverJournal(root, { command }), "trace.journal_path_unsafe");
        expect(await readFile(external, "utf8")).toBe("outside");
      } finally { await removeTempRepo(root); await removeTempRepo(outside); }
    });
  }
});

describe("trace journal syscall boundaries", () => {
  const boundaries = [
    { event: "before:sync:root", published: false },
    { event: `before:open:${segment}.tmp`, published: false },
    { event: `before:write:${segment}.tmp`, published: false },
    { event: `after:write:${segment}.tmp`, published: false },
    { event: `before:sync:${segment}.tmp`, published: false },
    { event: `after:sync:${segment}.tmp`, published: false },
    { event: `after:close:${segment}.tmp`, published: false },
    { event: `before:rename:${segment}.tmp->${segment}`, published: false },
    { event: `after:rename:${segment}.tmp->${segment}`, published: true },
    { event: `before:sync:${traces}`, published: true, afterSegment: true },
    { event: `after:sync:${traces}`, published: true, afterSegment: true },
    { event: `before:open:${headPath}.tmp`, published: true },
    { event: `before:write:${headPath}.tmp`, published: true, enospc: true },
    { event: `after:write:${headPath}.tmp`, published: true },
    { event: `before:sync:${headPath}.tmp`, published: true },
    { event: `after:sync:${headPath}.tmp`, published: true },
    { event: `after:close:${headPath}.tmp`, published: true },
    { event: `before:rename:${headPath}.tmp->${headPath}`, published: true },
    { event: `after:rename:${headPath}.tmp->${headPath}`, published: true, headPublished: true },
    { event: `before:sync:${state}`, published: true, headPublished: true, afterHead: true },
    { event: `after:sync:${state}`, published: true, headPublished: true, afterHead: true }
  ];
  for (const point of boundaries) {
    test(`interruption ${point.event}${point.afterSegment ? " after segment rename" : ""}${point.afterHead ? " after head rename" : ""}`, async () => {
      const root = await tempRepo();
      try {
        const events: string[] = [];
        let segmentRenamed = false;
        let headRenamed = false;
        let triggered = false;
        const fault = Object.assign(new Error(point.enospc ? "ENOSPC injected" : "EIO injected"), { code: point.enospc ? "ENOSPC" : "EIO" });
        const fs = instrument(root, events, (event) => {
          if (event === `after:rename:${segment}.tmp->${segment}`) segmentRenamed = true;
          if (event === `after:rename:${headPath}.tmp->${headPath}`) headRenamed = true;
          if (!triggered && event === point.event && (!point.afterSegment || segmentRenamed) && (!point.afterHead || headRenamed)) {
            triggered = true;
            throw fault;
          }
        });
        let caught: unknown;
        let acknowledged = false;
        try { await commitBatch(root, batch(), { command, fs }); acknowledged = true; } catch (error) { caught = error; }
        expect(triggered).toBe(true);
        expect(caught).toBe(fault);
        expect(acknowledged).toBe(false);
        expect((await loadHead(root)) !== null).toBe(!!point.headPublished);
        if (point.event.includes(`sync:${segment}.tmp`) || point.event.includes(`write:${segment}.tmp`)) {
          expect(await journalFiles(root)).toEqual([]);
          expect(events.some((event) => event.startsWith("before:rename:"))).toBe(false);
        }
        // Normal failure released ownership; same-ID retry both recovers and dedupes.
        const retry = await commitBatch(root, batch(), { command });
        expect(retry.status).toBe(point.published ? "duplicate" : "committed");
        expect(retry.sequence).toBe(1);
        expect(await journalFiles(root)).toEqual([firstName]);
        expect((await readdir(at(root, state))).sort()).toEqual(["head.json"]);
      } finally { await removeTempRepo(root); }
    });
  }

  test("partial positive writes loop to completion; zero progress aborts before publication", async () => {
    for (const zero of [false, true]) {
      const root = await tempRepo();
      try {
        let writes = 0;
        const fs: JournalFs = {
          ...journalFs,
          async open(path, flags, mode) {
            if (path.endsWith(".tmp")) {
              expect((flags & constants.O_EXCL) !== 0).toBe(true);
              expect((flags & constants.O_NOFOLLOW!) !== 0).toBe(true);
              expect(mode).toBe(0o600);
            }
            const handle = await journalFs.open(path, flags, mode);
            return new Proxy(handle, {
              get(target, property) {
                if (property === "write") return async (bytes: Uint8Array, offset: number, length: number, position: number) => {
                  writes++;
                  return zero ? { bytesWritten: 0 } : target.write(bytes, offset, Math.min(17, length), position);
                };
                const value = Reflect.get(target, property);
                return typeof value === "function" ? value.bind(target) : value;
              }
            });
          }
        };
        if (zero) {
          await traceError(commitBatch(root, batch(), { command, fs }), "trace.short_write");
          expect(await loadHead(root)).toBeNull();
          expect(await journalFiles(root)).toEqual([]);
        } else {
          await commitBatch(root, batch(), { command, fs });
          expect(writes).toBeGreaterThan(2);
          expect(await recoverJournal(root, { command })).toEqual(await loadHead(root));
        }
      } finally { await removeTempRepo(root); }
    }
  });

  test("duplicate retry cannot acknowledge a visible head while its final directory fsync still fails", async () => {
    const root = await tempRepo();
    try {
      await commitBatch(root, batch(), { command });
      const events: string[] = [];
      const fs = instrument(root, events, (event) => {
        if (event === `before:sync:${state}`) throw new Error("directory fsync unavailable");
      });
      await expect(commitBatch(root, batch(), { command, fs })).rejects.toThrow("directory fsync unavailable");
      expect(events.filter((event) => event.startsWith("before:write:"))).toEqual([]);
      expect((await commitBatch(root, batch(), { command })).status).toBe("duplicate");
    } finally { await removeTempRepo(root); }
  });
});
