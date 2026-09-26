import { resolve } from "node:path";
import { acquire } from "../evidence-write-lock";
import { snapshotDigest, SNAPSHOT_RECORD_VERSION, type SessionSnapshot } from "./contracts";
import {
  commitBatch, GENESIS_SEGMENT_HASH, loadHead, recoverJournal,
  type JournalBatch, type TraceHead
} from "./journal";
import { normalizeSession } from "./normalize";
import { acquireSession, DEFAULT_ACQUISITION_LIMITS } from "./openclaw-adapter";
import { readPublishedChain, type PublishedSnapshot } from "./published-chain";
import { DEFAULT_ADAPTER_ID, loadSourceConfig, registerSource, requireSourceConfig } from "./source-config";

export const TRACE_CONTENT_POLICY_VERSION = "boulder.trace.metadata-only.v1";
export { snapshotDigest, SNAPSHOT_RECORD_VERSION };
const command = "trace collect";
// The admitted schema/config carries no agent name. One source registration
// denotes one agent database; this sentinel is NOT an inferred upstream ID.
const agentId = "unavailable";

export class TraceCollectError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "TraceCollectError";
  }
}

export type CollectOptions = {
  readonly sessionId: string;
  readonly dbPath?: string;
  readonly dryRun: boolean;
};

export type CollectReport = {
  readonly schemaVersion: "boulder.trace.collect.v1";
  readonly mode: "dry-run" | "write";
  readonly status: "committed" | "would_commit" | "no-op";
  readonly source: string;
  readonly source_instance_id: string;
  readonly agent_id: string;
  readonly agent_id_basis: "unavailable";
  readonly session_id: string;
  readonly journal_id: string;
  readonly input_count: number;
  readonly disposition_counts: SessionSnapshot["disposition_counts"];
  readonly coverage: SessionSnapshot["coverage"];
  readonly snapshot_id: string;
  readonly supersedes_snapshot_id: string | null;
  readonly snapshot_digest: string;
  readonly segment_seq: number;
  readonly segment_file: string | null;
  readonly limits: typeof DEFAULT_ACQUISITION_LIMITS;
  readonly complete: boolean;
  readonly reasons: readonly string[];
};

type PublishedState = { journalId: string | null; snapshots: readonly PublishedSnapshot[] };

export async function collectSession(root: string, options: CollectOptions): Promise<CollectReport> {
  root = resolve(root);
  // Missing configuration fails before creating lock metadata. An explicit path
  // bootstraps a UUID registration only after successful acquisition below.
  if (!options.dbPath) await requireSourceConfig(root);
  if (!options.dryRun) await recoverJournal(root, { command });
  const lock = options.dryRun ? null : await acquire(root, { command });
  let batch: JournalBatch;
  let report: CollectReport;
  let failure: unknown = null;
  try {
    const config = options.dbPath ? await loadSourceConfig(root) : await requireSourceConfig(root);
    if (config && config.adapter_id !== DEFAULT_ADAPTER_ID) {
      throw new TraceCollectError("trace.source_unknown", `Unsupported registered adapter: ${config.adapter_id}.`);
    }
    const dbPath = resolve(root, options.dbPath ?? config!.db_path);
    const sourceInstanceId = config?.source_instance_id ?? crypto.randomUUID();
    const head = await loadHead(root);
    const published = await readPublishedState(root, head);
    const acquisition = await acquireSession(dbPath, options.sessionId, DEFAULT_ACQUISITION_LIMITS);
    const normalized = await normalizeSession(acquisition, {
      source_instance_id: sourceInstanceId, agent_id: agentId
    });
    const previous = [...published.snapshots].reverse().find(({ snapshot }) =>
      snapshot.source_instance_id === sourceInstanceId && snapshot.agent_id === agentId
      && snapshot.session_id === options.sessionId);
    const content = {
      source_instance_id: sourceInstanceId, agent_id: agentId, session_id: options.sessionId,
      selection_scope: "full_session", input_inventory: normalized.input_inventory,
      disposition_counts: normalized.disposition_counts, coverage: normalized.coverage
    };
    const digest = await snapshotDigest(content);
    // The adapter cannot fingerprint unavailable corrupt bytes. Equal partial
    // evidence is NOT proof of equal inventories; publish another quarantine.
    const comparable = !normalized.input_inventory.some((row) => row.quality_flags.includes("source_revision_incomplete"));
    const unchanged = comparable && previous?.snapshot.snapshot_digest === digest;
    const snapshot: SessionSnapshot = unchanged ? previous.snapshot : {
      ...content, snapshot_id: crypto.randomUUID(),
      supersedes_snapshot_id: previous?.snapshot.snapshot_id ?? null, snapshot_digest: digest
    };
    const journalId = published.journalId ?? crypto.randomUUID();
    report = {
      schemaVersion: "boulder.trace.collect.v1", mode: options.dryRun ? "dry-run" : "write",
      status: unchanged ? "no-op" : options.dryRun ? "would_commit" : "committed",
      source: acquisition.adapterId, source_instance_id: sourceInstanceId,
      agent_id: agentId, agent_id_basis: "unavailable", session_id: options.sessionId, journal_id: journalId,
      input_count: normalized.coverage.input_count, disposition_counts: snapshot.disposition_counts,
      coverage: snapshot.coverage, snapshot_id: snapshot.snapshot_id,
      supersedes_snapshot_id: snapshot.supersedes_snapshot_id, snapshot_digest: snapshot.snapshot_digest,
      segment_seq: unchanged ? previous.sequence : (head?.sequence ?? 0) + 1,
      segment_file: unchanged ? previous.fileName : null, limits: DEFAULT_ACQUISITION_LIMITS,
      complete: normalized.disposition_counts.quarantined === 0,
      reasons: [...new Set(normalized.input_inventory.filter((row) => row.disposition === "quarantined").map((row) => row.reason!))]
    };
    if (unchanged || options.dryRun) return report;
    if (!config) {
      await registerSource(root, { db_path: dbPath }, { source_instance_id: sourceInstanceId });
    }
    batch = {
      schema_version: "boulder.trace.batch.v1", journal_id: journalId,
      batch_id: crypto.randomUUID(), batch_seq: report.segment_seq,
      previous_segment_hash: head?.digest ?? GENESIS_SEGMENT_HASH,
      adapter_id: acquisition.adapterId, interpretation_version: normalized.interpretation_version,
      content_policy_version: TRACE_CONTENT_POLICY_VERSION,
      records: [{ schema_version: SNAPSHOT_RECORD_VERSION, ...snapshot }],
      snapshotRefs: [
        ...(head?.snapshotRefs ?? []).filter((ref) => !(ref.source_instance_id === sourceInstanceId
          && ref.agent_id === agentId && ref.session_id === options.sessionId)),
        { source_instance_id: sourceInstanceId, agent_id: agentId, session_id: options.sessionId,
          snapshot_id: snapshot.snapshot_id, snapshot_digest: snapshot.snapshot_digest }
      ]
    };
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    // A release failure reports only when no primary error is in flight; a
    // leaked release error must never mask the real diagnostic.
    try { if (lock?.held) await lock.release(); }
    catch (releaseError) { if (failure === null) throw releaseError; }
  }
  // journal.ts owns a non-reentrant lock. Hand off rather than nest locks:
  // commitBatch revalidates batch_seq AND previous_segment_hash under its lock.
  // An intervening writer therefore causes a visible conflict, never a stale
  // publication. No blind retry with this previously acquired source inventory.
  const committed = await commitBatch(root, batch, { command });
  return { ...report, segment_seq: committed.sequence, segment_file: committed.fileName };
}

/**
 * Pin to head before discovering filenames; never select a newer segment.
 * The shared walker authenticates the entire published prefix even on a
 * dry-run (which cannot recover it).
 */
async function readPublishedState(root: string, head: TraceHead | null): Promise<PublishedState> {
  if (!head) return { journalId: null, snapshots: [] };
  const chain = await readPublishedChain(root, head,
    (code, message) => new TraceCollectError(code, message));
  return { journalId: chain.journalId, snapshots: chain.snapshots };
}
