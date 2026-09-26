import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { at, isMissingPath, noFollowFlag } from "../fs";
import { snapshotDigest, SNAPSHOT_RECORD_VERSION } from "./collect";
import { canonicalizeDecodedEvent, isSessionSnapshot, type InputObservation, type SessionSnapshot } from "./contracts";
import { GENESIS_SEGMENT_HASH, loadHead, TraceCommitError, type SegmentHeader, type SnapshotRef, type TraceHead } from "./journal";

export type VerifyFailure = {
  readonly check: string;
  readonly message: string;
  readonly fileName?: string;
  readonly snapshot_id?: string;
  readonly source_row_key?: string;
};
type Section = {
  readonly verdict: "pass" | "fail" | "not_checked";
  readonly failed_checks: readonly VerifyFailure[];
};
type Counts = { normalized: number; ignored: number; quarantined: number };
export type TraceVerifyReport = {
  readonly schemaVersion: "boulder.trace.verify.v1";
  readonly strict: true;
  readonly verdict: "pass" | "fail";
  readonly status: "empty" | "verified" | "invalid";
  readonly head: TraceHead | null;
  readonly failed_checks: readonly VerifyFailure[];
  readonly journal_integrity: Section & { readonly segments_checked: number; readonly records_checked: number };
  readonly source_coverage: Section & {
    readonly scope: "committed_hot_snapshots";
    readonly cold_history: "not_collected";
    readonly snapshots_checked: number;
    readonly input_count: number;
    readonly disposition_counts: Counts;
    readonly current_snapshots: number;
    readonly current_input_count: number;
    readonly current_disposition_counts: Counts;
  };
  readonly telemetry_fidelity: Section & {
    readonly scope: "current_snapshots";
    readonly normalized_observations: number;
    readonly timestamps_available: number;
    readonly timestamps_unavailable: number;
    readonly usage_observations: number;
    readonly usage_scope_unknown: number;
    readonly relationship_refs_checked: number;
  };
};

const filePattern = /^(\d{6,})-([A-Za-z0-9][A-Za-z0-9_-]{0,127})\.jsonl$/;
const hashPattern = /^[a-f0-9]{64}$/;
const zeroCounts = (): Counts => ({ normalized: 0, ignored: 0, quarantined: 0 });

/**
 * Verify a pinned, published prefix, never recover it or acquire a writer lock.
 * No head is an explicit empty PASS, even if unpublished candidates exist; it
 * makes no source-coverage/fidelity claim. Newer segments and temps are ignored.
 * Historical full-file lengths are not stored separately by v1: their exact
 * bytes are authenticated by the successor hash; head length is checked too.
 * Hashes detect corruption, not a coordinated rewrite of the entire journal.
 */
export async function verifyJournal(root: string): Promise<TraceVerifyReport> {
  root = resolve(root);
  const integrity: VerifyFailure[] = [];
  const coverage: VerifyFailure[] = [];
  const fidelity: VerifyFailure[] = [];
  let head: TraceHead | null = null;
  let segmentsChecked = 0;
  let recordsChecked = 0;
  let snapshotsChecked = 0;
  let inputCount = 0;
  const totals = zeroCounts();
  const current = new Map<string, SessionSnapshot>();
  const snapshotIds = new Set<string>();
  const telemetry = {
    scope: "current_snapshots" as const, normalized_observations: 0,
    timestamps_available: 0, timestamps_unavailable: 0,
    usage_observations: 0, usage_scope_unknown: 0, relationship_refs_checked: 0
  };

  try {
    head = await loadHead(root);
    if (head) await inspectPrefix(head);
  } catch (error) {
    integrity.push({ check: error instanceof TraceCommitError ? error.code : "trace.journal_read_failed",
      message: error instanceof Error ? error.message : String(error) });
  }

  const currentTotals = zeroCounts();
  let currentInputCount = 0;
  for (const snapshot of current.values()) {
    currentInputCount += snapshot.coverage.input_count;
    for (const row of snapshot.input_inventory) {
      currentTotals[row.disposition] += 1;
      if (row.disposition !== "normalized") continue;
      telemetry.normalized_observations += 1;
      const facts = row.normalized_facts!;
      if (typeof facts.timestamp === "string") telemetry.timestamps_available += 1;
      else telemetry.timestamps_unavailable += 1;
      if (facts.usage !== undefined) {
        telemetry.usage_observations += 1;
        if (facts.usage_scope === "unknown") telemetry.usage_scope_unknown += 1;
      }
      if (facts.request_event_ref !== undefined) telemetry.relationship_refs_checked += 1;
    }
    if (snapshot.input_inventory.some((row) => row.disposition === "quarantined")) {
      coverage.push({ check: "trace.snapshot_quarantined", snapshot_id: snapshot.snapshot_id,
        message: "Current snapshot contains quarantined inputs; source coverage is incomplete." });
    }
  }
  const failures = [...integrity, ...coverage, ...fidelity];
  const section = (failed: VerifyFailure[], checked: boolean): Section => ({
    verdict: failed.length ? "fail" : checked ? "pass" : "not_checked", failed_checks: failed
  });
  const semanticsChecked = head !== null && integrity.length === 0;
  return {
    schemaVersion: "boulder.trace.verify.v1", strict: true,
    verdict: failures.length ? "fail" : "pass",
    status: failures.length ? "invalid" : head ? "verified" : "empty", head, failed_checks: failures,
    journal_integrity: { ...section(integrity, true), segments_checked: segmentsChecked, records_checked: recordsChecked },
    source_coverage: { ...section(coverage, semanticsChecked), scope: "committed_hot_snapshots", cold_history: "not_collected",
      snapshots_checked: snapshotsChecked, input_count: inputCount, disposition_counts: totals,
      current_snapshots: current.size, current_input_count: currentInputCount, current_disposition_counts: currentTotals },
    telemetry_fidelity: { ...section(fidelity, semanticsChecked), ...telemetry }
  };

  async function inspectPrefix(pinned: TraceHead): Promise<void> {
    const directory = at(root, ".boulder", "traces");
    let names: string[];
    try {
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new TraceCommitError("trace.journal_path_unsafe");
      names = await readdir(directory);
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      integrity.push({ check: "trace.head_segment_missing", fileName: pinned.fileName, message: "Published segment directory is missing." });
      return;
    }
    const segments = names.flatMap((fileName) => {
      const match = filePattern.exec(fileName);
      const sequence = match ? Number(match[1]) : NaN;
      return Number.isSafeInteger(sequence) && sequence > 0 && sequence <= pinned.sequence ? [{ fileName, sequence }] : [];
    }).sort((a, b) => a.sequence - b.sequence || a.fileName.localeCompare(b.fileName));
    if (!segments.some(({ fileName }) => fileName === pinned.fileName)) {
      integrity.push({ check: "trace.head_segment_missing", fileName: pinned.fileName, message: "Head references a missing segment." });
    }
    let previousSequence = 0;
    let previousDigest: string | null = GENESIS_SEGMENT_HASH;
    let journalId: string | null = null;
    for (const { fileName, sequence } of segments) {
      const fail = (check: string, message: string) => integrity.push({ check, message, fileName });
      if (sequence === previousSequence) fail("trace.conflicting_successors", "Multiple filenames claim the same committed sequence.");
      else if (sequence !== previousSequence + 1) fail("trace.segment_missing", "Committed sequence has a missing predecessor.");
      let bytes: Uint8Array;
      try { bytes = await readSegment(at(directory, fileName)); }
      catch (error) {
        fail(error instanceof TraceCommitError ? error.code : isMissingPath(error) ? "trace.segment_missing" : "trace.segment_read_failed",
          error instanceof Error ? error.message : String(error));
        previousDigest = null;
        previousSequence = sequence;
        continue;
      }
      segmentsChecked += 1;
      const digest = await sha256(bytes);
      if (fileName === pinned.fileName) {
        if (bytes.byteLength !== pinned.byteLength) fail("trace.head_length_mismatch", "Segment byte length disagrees with head.");
        if (digest !== pinned.digest) fail("trace.segment_digest_mismatch", "Full-file digest disagrees with head.");
      }
      const parsed = await parseSegment(bytes, fail);
      if (parsed) {
        const { header, records } = parsed;
        if (header.sequence !== sequence || segmentName(header.sequence, header.batch_id) !== fileName) {
          fail("trace.segment_header_mismatch", "Header sequence/batch_id disagrees with filename.");
        }
        if (sequence === 1 && header.previous_segment_hash !== GENESIS_SEGMENT_HASH) {
          fail("trace.genesis_hash_mismatch", "Genesis must reference the zero hash.");
        } else if (previousDigest !== null && sequence === previousSequence + 1 && header.previous_segment_hash !== previousDigest) {
          fail("trace.chain_mismatch", "Predecessor full-file digest disagrees with the successor header.");
        }
        if (journalId !== null && header.journal_id !== journalId) fail("trace.journal_id_mismatch", "Journal identity changes inside the chain.");
        journalId = header.journal_id;
        if (fileName === pinned.fileName && (header.sequence !== pinned.sequence || header.batch_id !== pinned.batchId
          || header.committedAt !== pinned.committedAt || !same(header.snapshotRefs, pinned.snapshotRefs))) {
          fail("trace.head_metadata_mismatch", "Head metadata disagrees with the referenced segment header.");
        }
        recordsChecked += records.length;
        for (const record of records) await inspectSnapshot(record, fileName);
        const refs = header.snapshotRefs;
        const expected = [...current.values()].map(snapshotRef);
        // Refs are a checkpoint for all selected scopes, not just this batch.
        if (!same(refs.map(canonicalizeDecodedEvent).sort(), expected.map(canonicalizeDecodedEvent).sort())) {
          coverage.push({ check: "trace.snapshot_refs_mismatch", fileName, message: "Segment snapshot refs do not select the latest committed snapshots and digests." });
        }
      }
      previousDigest = digest;
      previousSequence = sequence;
    }
    if (previousSequence < pinned.sequence) {
      integrity.push({ check: "trace.segment_missing", message: "Committed prefix does not reach the published sequence." });
    }
  }

  async function inspectSnapshot(record: Record<string, unknown>, fileName: string): Promise<void> {
    if (record.schema_version !== SNAPSHOT_RECORD_VERSION || !isSessionSnapshot(record)) {
      coverage.push({ check: "trace.snapshot_invalid", fileName, message: "Record is not a supported session snapshot." });
      return;
    }
    const snapshot = record;
    const location = { fileName, snapshot_id: snapshot.snapshot_id };
    const fail = (check: string, message: string) => coverage.push({ check, message, ...location });
    snapshotsChecked += 1;
    inputCount += snapshot.coverage.input_count;
    const counts = zeroCounts();
    for (const row of snapshot.input_inventory) {
      counts[row.disposition] += 1;
      totals[row.disposition] += 1;
    }
    if (!Number.isSafeInteger(snapshot.coverage.input_count) || snapshot.coverage.input_count < 0
      || snapshot.coverage.input_count !== snapshot.input_inventory.length
      || !same(counts, snapshot.disposition_counts)) {
      fail("trace.inventory_reconciliation", "Input count, inventory length and disposition counts must reconcile exactly.");
    }
    if (snapshot.selection_scope !== "full_session") fail("trace.snapshot_scope_invalid", "Only full-session snapshots are supported.");
    if (snapshot.snapshot_digest !== await snapshotDigest(snapshot)) fail("trace.snapshot_digest_mismatch", "Snapshot digest disagrees with canonical content.");
    if (snapshotIds.has(snapshot.snapshot_id)) fail("trace.snapshot_identity_conflict", "Snapshot identity was already committed.");
    snapshotIds.add(snapshot.snapshot_id);
    const scope = JSON.stringify([snapshot.source_instance_id, snapshot.agent_id, snapshot.session_id]);
    if (snapshot.supersedes_snapshot_id !== (current.get(scope)?.snapshot_id ?? null)) {
      fail("trace.snapshot_supersession_mismatch", "Snapshot does not explicitly supersede the previous snapshot for its scope.");
    }
    current.set(scope, snapshot);
    const rows = new Map<string, InputObservation>();
    const identities = new Set<string>();
    for (const row of snapshot.input_inventory) {
      if (rows.has(row.source_row_key)) fail("trace.source_row_conflict", "A source row occurs more than once in the snapshot.");
      rows.set(row.source_row_key, row);
      if (row.logical_event_id !== undefined) {
        if (identities.has(row.logical_event_id)) fail("trace.event_identity_conflict", "A logical event has multiple observations/selected revisions in one snapshot.");
        identities.add(row.logical_event_id);
      }
      if (!hashPattern.test(row.source_revision)) fail("trace.source_revision_invalid", "Source revisions must be SHA-256 digests.");
    }
    for (const row of snapshot.input_inventory) {
      if (row.disposition !== "normalized") continue;
      const facts = row.normalized_facts!;
      const ref = facts.request_event_ref;
      if (ref === undefined && facts.event_type !== "tool_result") continue;
      const target = isRecord(ref) && typeof ref.source_row_key === "string" ? rows.get(ref.source_row_key) : undefined;
      if (!isRecord(ref) || !target || target.disposition !== "normalized"
        || ref.source_revision !== target.source_revision || ref.logical_event_id !== target.logical_event_id) {
        fidelity.push({ check: "trace.relationship_ref_unresolved", message: "Relationship must select an exact normalized row/revision within the same snapshot.",
          ...location, source_row_key: row.source_row_key });
      } else if (facts.event_type !== "tool_result" || target.normalized_facts?.event_type !== "tool_call"
        || target.normalized_facts.request_event_id !== facts.request_event_id
        || target.normalized_facts.tool_call_id !== facts.tool_call_id
        || typeof target.normalized_facts.source_order !== "number" || typeof facts.source_order !== "number"
        || target.normalized_facts.source_order >= facts.source_order) {
        fidelity.push({ check: "trace.relationship_ref_invalid", message: "Tool result must reference its earlier originating request.",
          ...location, source_row_key: row.source_row_key });
      }
    }
  }
}

async function parseSegment(bytes: Uint8Array, fail: (check: string, message: string) => unknown): Promise<{
  header: SegmentHeader; records: Record<string, unknown>[];
} | null> {
  if (bytes[bytes.length - 1] !== 10) {
    fail("trace.segment_framing_invalid", "Segment must end with a newline.");
    return null;
  }
  const footerStart = bytes.lastIndexOf(10, bytes.length - 2) + 1;
  let lines: unknown[];
  try { lines = new TextDecoder("utf-8", { fatal: true }).decode(bytes).slice(0, -1).split("\n").map((line) => JSON.parse(line)); }
  catch {
    fail("trace.segment_json_invalid", "Segment contains invalid UTF-8 or JSON.");
    return null;
  }
  if (lines.length < 3) {
    fail("trace.segment_framing_invalid", "Segment requires a header, at least one record, and a footer.");
    return null;
  }
  const footer = lines[lines.length - 1];
  if (!isRecord(footer) || footer.schema_version !== "boulder.trace.footer.v1") {
    fail("trace.footer_invalid", "Missing or invalid footer.");
  } else {
    if (!Number.isSafeInteger(footer.record_count) || footer.record_count !== lines.length - 2) {
      fail("trace.record_count_mismatch", "Footer record_count disagrees with actual record lines.");
    }
    if (footer.digest !== await sha256(bytes.subarray(0, footerStart))) {
      fail("trace.footer_digest_mismatch", "Footer digest disagrees with bytes preceding the footer line.");
    }
  }
  const header = lines[0];
  if (!isHeader(header)) {
    fail("trace.segment_header_invalid", "Segment header is malformed.");
    return null;
  }
  const records = lines.slice(1, -1);
  if (!records.every(isRecord)) {
    fail("trace.segment_record_invalid", "Every record line must be a JSON object.");
    return null;
  }
  return { header, records };
}

async function readSegment(path: string): Promise<Uint8Array> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new TraceCommitError("trace.journal_path_unsafe");
  const file = await open(path, constants.O_RDONLY | noFollowFlag());
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.nlink !== 1) throw new TraceCommitError("trace.journal_path_unsafe");
    return await file.readFile();
  } finally { await file.close(); }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isHeader(value: unknown): value is SegmentHeader {
  return isRecord(value) && value.schema_version === "boulder.trace.segment.v1"
    && typeof value.sequence === "number" && Number.isSafeInteger(value.sequence) && value.sequence > 0
    && typeof value.batch_id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value.batch_id)
    && typeof value.previous_segment_hash === "string" && hashPattern.test(value.previous_segment_hash)
    && ["journal_id", "adapter_id", "interpretation_version", "content_policy_version"].every((key) => typeof value[key] === "string")
    && typeof value.committedAt === "string" && Number.isFinite(Date.parse(value.committedAt))
    && Array.isArray(value.snapshotRefs) && value.snapshotRefs.every((ref) => isRecord(ref)
      && ["source_instance_id", "agent_id", "session_id", "snapshot_id"].every((key) => typeof ref[key] === "string")
      && typeof ref.snapshot_digest === "string" && hashPattern.test(ref.snapshot_digest));
}
function segmentName(sequence: number, batch: string): string { return `${String(sequence).padStart(6, "0")}-${batch}.jsonl`; }
function snapshotRef(snapshot: SessionSnapshot): SnapshotRef {
  return { source_instance_id: snapshot.source_instance_id, agent_id: snapshot.agent_id, session_id: snapshot.session_id,
    snapshot_id: snapshot.snapshot_id, snapshot_digest: snapshot.snapshot_digest };
}
function same(a: unknown, b: unknown): boolean { return canonicalizeDecodedEvent(a) === canonicalizeDecodedEvent(b); }
async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
