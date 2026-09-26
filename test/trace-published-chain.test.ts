import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { snapshotDigest, SNAPSHOT_RECORD_VERSION, type SessionSnapshot } from "../src/trace/contracts";
import { GENESIS_SEGMENT_HASH, TraceCommitError, type SnapshotRef, type TraceHead } from "../src/trace/journal";
import { readPublishedChain, sha256Hex } from "../src/trace/published-chain";
import { removeTempRepo, tempRepo, write } from "./helpers/cli";

/** Stand-in for each caller's refusal factory: records the named code. */
class SnapshotRefusalError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SnapshotRefusalError";
  }
}
const refusal = (code: "trace.snapshot_invalid" | "trace.snapshot_digest_mismatch", message: string) =>
  new SnapshotRefusalError(code, message);

const BATCH_ID = "batch01";
const FILE_NAME = "000001-batch01.jsonl";
const COMMITTED_AT = "2026-06-02T00:00:00.000Z";

async function snapshotRecord(id: string): Promise<SessionSnapshot> {
  const base = {
    schema_version: SNAPSHOT_RECORD_VERSION,
    source_instance_id: "instance-1", agent_id: "agent-1", session_id: "session-1",
    selection_scope: "full_session",
    input_inventory: [] as const,
    disposition_counts: { normalized: 0, ignored: 0, quarantined: 0 },
    coverage: { kind: "full_session" as const, input_count: 0 }
  };
  return {
    ...base, snapshot_id: id, supersedes_snapshot_id: null,
    snapshot_digest: await snapshotDigest(base)
  };
}

/** Write a sealed single-segment journal and return the matching head. */
async function commitFixture(root: string, records: readonly unknown[], snapshotRefs: readonly SnapshotRef[] = []): Promise<TraceHead> {
  const header = {
    schema_version: "boulder.trace.segment.v1",
    journal_id: "journal-1", batch_id: BATCH_ID, sequence: 1,
    previous_segment_hash: GENESIS_SEGMENT_HASH,
    adapter_id: "adapter-1", interpretation_version: "1", content_policy_version: "1",
    snapshotRefs, committedAt: COMMITTED_AT
  };
  const prefix = `${JSON.stringify(header)}\n${records.map((record) => `${JSON.stringify(record)}\n`).join("")}`;
  const footer = {
    schema_version: "boulder.trace.footer.v1",
    record_count: records.length,
    digest: await sha256Hex(new TextEncoder().encode(prefix))
  };
  const segment = `${prefix}${JSON.stringify(footer)}\n`;
  await write(root, join(".boulder", "traces", FILE_NAME), segment);
  const bytes = new TextEncoder().encode(segment);
  return {
    schema_version: "boulder.trace.head.v1", fileName: FILE_NAME, sequence: 1, batchId: BATCH_ID,
    byteLength: bytes.byteLength, digest: await sha256Hex(bytes), snapshotRefs,
    committedAt: COMMITTED_AT
  };
}

describe("readPublishedChain record strictness", () => {
  test("a well-formed unknown record object refuses through the caller callback with trace.snapshot_invalid", async () => {
    const root = await tempRepo();
    try {
      const snapshot = await snapshotRecord("snap-1");
      const head = await commitFixture(root, [snapshot, { schema_version: "boulder.trace.metrics.v9", note: "foreign" }], [
        { source_instance_id: snapshot.source_instance_id, agent_id: snapshot.agent_id,
          session_id: snapshot.session_id, snapshot_id: snapshot.snapshot_id,
          snapshot_digest: snapshot.snapshot_digest }
      ]);
      let failure: unknown = null;
      try { await readPublishedChain(root, head, refusal); } catch (error) { failure = error; }
      expect(failure instanceof SnapshotRefusalError).toBe(true);
      expect((failure as SnapshotRefusalError).code).toBe("trace.snapshot_invalid");
    } finally { await removeTempRepo(root); }
  });

  test("a snapshot-shaped record with a newer schema_version is not tolerated (verify.ts parity)", async () => {
    const root = await tempRepo();
    try {
      const snapshot = await snapshotRecord("snap-2");
      const head = await commitFixture(root, [{ ...snapshot, schema_version: "boulder.trace.session-snapshot.v2" }]);
      let failure: unknown = null;
      try { await readPublishedChain(root, head, refusal); } catch (error) { failure = error; }
      expect(failure instanceof SnapshotRefusalError).toBe(true);
      expect((failure as SnapshotRefusalError).code).toBe("trace.snapshot_invalid");
    } finally { await removeTempRepo(root); }
  });

  test("a non-object record line fails as trace.segment_invalid, not through the refusal", async () => {
    const root = await tempRepo();
    try {
      const head = await commitFixture(root, [42]);
      let failure: unknown = null;
      try { await readPublishedChain(root, head, refusal); } catch (error) { failure = error; }
      expect(failure instanceof TraceCommitError).toBe(true);
      expect((failure as TraceCommitError).code).toBe("trace.segment_invalid");
    } finally { await removeTempRepo(root); }
  });

  test("a well-formed segment walks and indexes its snapshot", async () => {
    const root = await tempRepo();
    try {
      const snapshot = await snapshotRecord("snap-3");
      const head = await commitFixture(root, [snapshot], [
        { source_instance_id: snapshot.source_instance_id, agent_id: snapshot.agent_id,
          session_id: snapshot.session_id, snapshot_id: snapshot.snapshot_id,
          snapshot_digest: snapshot.snapshot_digest }
      ]);
      const chain = await readPublishedChain(root, head, refusal);
      expect(chain.journalId).toBe("journal-1");
      expect(chain.snapshots).toHaveLength(1);
      expect(chain.snapshots[0].sequence).toBe(1);
      expect(chain.snapshotById.get("snap-3")?.snapshot_digest).toBe(snapshot.snapshot_digest);
    } finally { await removeTempRepo(root); }
  });
});
