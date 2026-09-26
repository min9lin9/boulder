/**
 * Immutable, hash-chained JSONL journal. Hashes are tamper-EVIDENT (accidents /
 * rot), not tamper-proof: an attacker able to rewrite the whole chain can forge
 * it. Durability requires a tested local filesystem honoring file and directory
 * fsync. On macOS this is POSIX fsync, NOT F_FULLFSYNC; hardware / power-loss and
 * network or cloud-synchronized filesystem guarantees are outside this ceiling.
 * Directory fsync failures are fatal, never treated as unsupported-but-successful.
 *
 * Only head.json publishes a revision. Recovery scans under the shared writer
 * lock; readers never select the newest filename. A failed commit may already
 * be published: retry its SAME batch_id after explicit stale-lock recovery if
 * the process died. The lock is never stolen. Duplicate means no journal writes
 * (acquiring/releasing the mandatory writer lock still touches its metadata).
 *
 * Callers allocate batch/snapshot IDs with crypto.randomUUID(), once per new
 * observation, before committing. Content equality is NOT identity. snapshotRefs
 * is the checkpoint to publish, stored verbatim in the header so recovery needs
 * neither the caller nor a clock. Record semantics belong to the versioned
 * producer/strict verifier; this layer validates framing, metadata and hashes.
 * Path screening is not an OS sandbox against hostile directory replacement.
 */
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { acquire } from "../evidence-write-lock";
import { at, isMissingPath, noFollowFlag } from "../fs";
import { isBatchEnvelope, type BatchEnvelope, type SessionSnapshot } from "./contracts";

// Extend the repository's minimal Node shims with the actual descriptor API.
export interface JournalFileHandle {
  stat(): ReturnType<typeof lstat>;
  readFile(): Promise<Uint8Array>;
  readFile(encoding: "utf8"): Promise<string>;
  writeFile(content: string, encoding: "utf8"): Promise<void>;
  write(buffer: Uint8Array, offset: number, length: number, position: number): Promise<{ bytesWritten: number }>;
  sync(): Promise<void>;
  close(): Promise<void>;
}
declare module "node:fs/promises" {
  export function open(path: string, flags: number, mode?: number): Promise<JournalFileHandle>;
}

export const GENESIS_SEGMENT_HASH = "0".repeat(64);
export const DEFAULT_JOURNAL_MAX_SEGMENTS = 1000;
export const TRACE_RECOVERY_CODES = {
  conflictingSuccessors: "trace.conflicting_successors",
  sequenceGap: "trace.sequence_gap",
  sequenceMismatch: "trace.sequence_mismatch",
  chainMismatch: "trace.chain_mismatch",
  headInvalid: "trace.head_invalid",
  headSegmentMissing: "trace.head_segment_missing",
  headDigestMismatch: "trace.head_digest_mismatch",
  segmentInvalid: "trace.segment_invalid",
  candidateCorrupt: "trace.candidate_corrupt",
  emptyBatch: "trace.empty_batch",
  batchInvalid: "trace.batch_invalid",
  unsafePath: "trace.journal_path_unsafe",
  shortWrite: "trace.short_write",
  budgetExceeded: "trace.journal_budget_exceeded",
  budgetConfigInvalid: "trace.journal_budget_config_invalid"
} as const;
export type TraceRecoveryCode = typeof TRACE_RECOVERY_CODES[keyof typeof TRACE_RECOVERY_CODES];
export class TraceCommitError extends Error {
  constructor(readonly code: TraceRecoveryCode) {
    super(code);
    this.name = "TraceCommitError";
  }
}

export type SnapshotRef = Pick<SessionSnapshot,
  "source_instance_id" | "agent_id" | "session_id" | "snapshot_id" | "snapshot_digest">;
export type JournalBatch = BatchEnvelope & {
  readonly records: readonly Record<string, unknown>[];
  readonly snapshotRefs: readonly SnapshotRef[];
};
export type SegmentHeader = Omit<BatchEnvelope, "schema_version" | "batch_seq" | "previous_segment_hash"> & {
  readonly schema_version: "boulder.trace.segment.v1";
  readonly sequence: number;
  readonly previous_segment_hash: string;
  readonly snapshotRefs: readonly SnapshotRef[];
  readonly committedAt: string;
};
export type TraceHead = {
  readonly schema_version: "boulder.trace.head.v1";
  readonly fileName: string;
  readonly sequence: number;
  readonly batchId: string;
  readonly byteLength: number;
  readonly digest: string;
  readonly snapshotRefs: readonly SnapshotRef[];
  readonly committedAt: string;
};
export type CommitResult = Pick<TraceHead, "sequence" | "fileName" | "digest"> & {
  readonly status: "committed" | "duplicate";
};

/** Per-call syscall seam: tests wrap real I/O, without global patches or mocks of recovery. */
export const journalFs = { open, lstat, mkdir, readdir, rename, unlink };
export type JournalFs = typeof journalFs;
export type JournalOptions = { readonly command: string; readonly fs?: JournalFs };
const encoder = new TextEncoder();
const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const filePattern = /^(\d{6,})-([A-Za-z0-9][A-Za-z0-9_-]{0,127})\.jsonl$/;
const C = TRACE_RECOVERY_CODES;

/** Read ONLY the published head. No scans, recovery, mkdir, lock, or writes. */
export async function loadHead(root: string): Promise<TraceHead | null> {
  const bytes = await readHeadBytes(resolve(root), journalFs);
  if (bytes === null) return null;
  const value = parseJson(bytes);
  if (!isHead(value)) throw new TraceCommitError(C.headInvalid);
  return value;
}

export async function commitBatch(root: string, envelope: JournalBatch, options: JournalOptions): Promise<CommitResult> {
  root = resolve(root);
  // No finally until acquisition succeeds: never release somebody else's lock.
  const lock = await acquire(root, { command: options.command });
  const fs = options.fs ?? journalFs;
  let failure: unknown = null;
  try {
    await enforceJournalBudget(root, envelope.batch_id, fs);
    const head = await recoverLocked(root, fs);
    // Validate the envelope before honoring a same-batch_id retry: an invalid
    // retry is diagnosed, never silently acknowledged as a duplicate.
    if (!Array.isArray(envelope.records) || envelope.records.length === 0) throw new TraceCommitError(C.emptyBatch);
    if (!isBatchEnvelope(envelope) || !idPattern.test(envelope.batch_id)
      || !validRefs(envelope.snapshotRefs) || !envelope.records.every(isObject)) throw new TraceCommitError(C.batchInvalid);
    if (head?.batchId === envelope.batch_id) return result("duplicate", head);
    const sequence = (head?.sequence ?? 0) + 1;
    if (!Number.isSafeInteger(envelope.batch_seq) || envelope.batch_seq !== sequence) throw new TraceCommitError(C.sequenceMismatch);
    const previous = head?.digest ?? GENESIS_SEGMENT_HASH;
    if ((envelope.previous_segment_hash ?? GENESIS_SEGMENT_HASH) !== previous) throw new TraceCommitError(C.chainMismatch);
    const header: SegmentHeader = {
      schema_version: "boulder.trace.segment.v1",
      journal_id: envelope.journal_id,
      batch_id: envelope.batch_id,
      sequence,
      previous_segment_hash: previous,
      adapter_id: envelope.adapter_id,
      interpretation_version: envelope.interpretation_version,
      content_policy_version: envelope.content_policy_version,
      snapshotRefs: envelope.snapshotRefs,
      committedAt: new Date().toISOString()
    };
    const prefix = encoder.encode([header, ...envelope.records].map(jsonLine).join(""));
    const footer = encoder.encode(jsonLine({ schema_version: "boulder.trace.footer.v1", record_count: envelope.records.length, digest: await sha256(prefix) }));
    const bytes = new Uint8Array(prefix.byteLength + footer.byteLength);
    bytes.set(prefix);
    bytes.set(footer, prefix.byteLength);
    const fileName = segmentName(sequence, envelope.batch_id);
    const next = await headFromBytes(fileName, header, bytes);
    await syncParents(root, fs);
    const path = at(root, ".boulder", "traces", fileName);
    await writeSyncedTemp(`${path}.tmp`, bytes, fs);
    await fs.rename(`${path}.tmp`, path);
    await syncDirectory(at(root, ".boulder", "traces"), fs);
    await publishHead(root, next, fs);
    return result("committed", next);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    // A release failure reports only when no primary error is in flight; a
    // leaked release error must never mask the real commit diagnostic.
    try { if (lock.held) await lock.release(); }
    catch (releaseError) { if (failure === null) throw releaseError; }
  }
}

/** A crash-left writer lock must first be explicitly unlocked by its operator. */
export async function recoverJournal(root: string, options: JournalOptions): Promise<TraceHead | null> {
  root = resolve(root);
  const lock = await acquire(root, { command: options.command });
  let failure: unknown = null;
  try {
    return await recoverLocked(root, options.fs ?? journalFs);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try { if (lock.held) await lock.release(); }
    catch (releaseError) { if (failure === null) throw releaseError; }
  }
}

/** Refuse under the writer lock BEFORE recovery can publish a head or sweep temps. */
async function enforceJournalBudget(root: string, batchId: string, fs: JournalFs): Promise<void> {
  await assertDirectories(root, fs);
  let maxSegments = DEFAULT_JOURNAL_MAX_SEGMENTS;
  let bytes: Uint8Array | null = null;
  try {
    bytes = await readRegular(at(root, ".boulder", "trace-state", "journal-config.json"), fs);
  } catch (error) { if (!isMissingPath(error)) throw error; }
  if (bytes !== null) {
    const config = parseJson(bytes);
    if (!isObject(config) || Object.keys(config).length !== 1
      || typeof config.max_segments !== "number" || !Number.isSafeInteger(config.max_segments)
      || config.max_segments < 0) throw new TraceCommitError(C.budgetConfigInvalid);
    maxSegments = config.max_segments;
  }
  // Include complete but unpublished segments; a crash must not free capacity.
  const segments = (await list(at(root, ".boulder", "traces"), fs)).filter((name) => name.endsWith(".jsonl"));
  // A valid chain is contiguous from 1, so its final sequence equals its count.
  // Permit same-ID retries at the cap, but only recovery may validate/acknowledge
  // that final segment. Filenames alone never establish a successful duplicate.
  if (segments.length >= maxSegments && !segments.includes(segmentName(segments.length, batchId))) {
    throw new TraceCommitError(C.budgetExceeded);
  }
}

async function recoverLocked(root: string, fs: JournalFs): Promise<TraceHead | null> {
  const traces = at(root, ".boulder", "traces");
  const state = at(root, ".boulder", "trace-state");
  await assertDirectories(root, fs);
  const raw = await readHeadBytes(root, fs);
  const recorded = raw === null ? null : parseJson(raw);
  // Even a structurally corrupt head may still identify the published prefix.
  // If it cannot, invalid segments are retained, not guessed to be candidates.
  const publishedSequence = isObject(recorded) && positiveInteger(recorded.sequence) ? recorded.sequence as number : null;
  const names = await list(traces, fs);
  for (const [dir, entries] of [[traces, names], [state, await list(state, fs)]] as const) {
    const temps = entries.filter((name) => name.endsWith(".tmp"));
    for (const name of temps) await fs.unlink(at(dir, name)); // unlink the entry, never follow/replay it
    if (temps.length) await syncDirectory(dir, fs);
  }
  const segments = names.filter((name) => name.endsWith(".jsonl")).map((fileName) => {
    const match = filePattern.exec(fileName);
    if (!match || !positiveInteger(Number(match[1]))) throw new TraceCommitError(C.segmentInvalid);
    return { fileName, sequence: Number(match[1]) };
  }).sort((a, b) => a.sequence - b.sequence);
  const seen = new Set<number>();
  for (const segment of segments) {
    if (seen.has(segment.sequence)) throw new TraceCommitError(C.conflictingSuccessors);
    seen.add(segment.sequence);
  }
  for (const [index, segment] of segments.entries()) {
    if (segment.sequence !== index + 1) throw new TraceCommitError(C.sequenceGap);
  }
  if (isHead(recorded) && recorded.sequence > segments.length) throw new TraceCommitError(C.headSegmentMissing);
  if (raw !== null && !segments.length) throw new TraceCommitError(C.headSegmentMissing);

  let latest: TraceHead | null = null;
  for (const segment of segments) {
    const path = at(traces, segment.fileName);
    const bytes = await readRegular(path, fs);
    let header: SegmentHeader;
    try {
      header = await validateSegment(segment.fileName, bytes);
    } catch (error) {
      if (!(error instanceof TraceCommitError)) throw error;
      const unpublished = raw === null || (publishedSequence !== null && segment.sequence > publishedSequence);
      if (!unpublished) throw new TraceCommitError(C.headDigestMismatch);
      // Corrupt, unacknowledged bytes cannot be replayed. Report the discard,
      // rather than silently claiming a successful recovery/commit.
      await fs.unlink(path);
      await syncDirectory(traces, fs);
      throw new TraceCommitError(C.candidateCorrupt);
    }
    if (header.previous_segment_hash !== (latest?.digest ?? GENESIS_SEGMENT_HASH)) throw new TraceCommitError(C.chainMismatch);
    latest = await headFromBytes(segment.fileName, header, bytes);
  }
  if (latest === null) return null;
  if (!isHead(recorded) || JSON.stringify(recorded) !== JSON.stringify(latest)) {
    // Recompute ALL head fields from verified bytes, including timestamp/refs.
    await syncParents(root, fs);
    for (const segment of segments) {
      const handle = await fs.open(at(traces, segment.fileName), constants.O_RDONLY | noFollowFlag());
      try { await handle.sync(); } finally { await handle.close(); }
    }
    await syncDirectory(traces, fs);
    await publishHead(root, latest, fs);
  } else {
    // A previous attempt can have renamed head successfully but failed its final
    // fsync. Even a duplicate retry must cross that barrier before acknowledging.
    await syncDirectory(state, fs);
  }
  return latest;
}

async function validateSegment(fileName: string, bytes: Uint8Array): Promise<SegmentHeader> {
  const invalid = () => new TraceCommitError(C.segmentInvalid);
  if (bytes[bytes.byteLength - 1] !== 10) throw invalid();
  const footerStart = bytes.lastIndexOf(10, bytes.byteLength - 2) + 1;
  if (footerStart === 0) throw invalid();
  const footer = parseJson(bytes.subarray(footerStart, bytes.byteLength - 1));
  const prefix = bytes.subarray(0, footerStart);
  if (!isObject(footer) || footer.schema_version !== "boulder.trace.footer.v1"
    || !positiveInteger(footer.record_count) || footer.digest !== await sha256(prefix)) throw invalid();
  let lines: unknown[];
  try {
    lines = new TextDecoder("utf-8", { fatal: true }).decode(prefix).slice(0, -1).split("\n").map((line) => JSON.parse(line));
  } catch { throw invalid(); }
  const header = lines[0];
  if (!isHeader(header) || lines.length - 1 !== footer.record_count || !lines.slice(1).every(isObject)
    || segmentName(header.sequence, header.batch_id) !== fileName) throw invalid();
  return header;
}

async function headFromBytes(fileName: string, header: SegmentHeader, bytes: Uint8Array): Promise<TraceHead> {
  return {
    schema_version: "boulder.trace.head.v1", fileName, sequence: header.sequence,
    batchId: header.batch_id, byteLength: bytes.byteLength, digest: await sha256(bytes),
    snapshotRefs: header.snapshotRefs, committedAt: header.committedAt
  };
}
function result(status: CommitResult["status"], head: TraceHead): CommitResult {
  return { status, sequence: head.sequence, fileName: head.fileName, digest: head.digest };
}
function segmentName(sequence: number, batchId: string): string {
  return `${String(sequence).padStart(6, "0")}-${batchId}.jsonl`;
}
function jsonLine(value: unknown): string { return `${JSON.stringify(value)}\n`; }
async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))), (b) => b.toString(16).padStart(2, "0")).join("");
}
function parseJson(bytes: Uint8Array): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { return null; }
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function validRefs(value: unknown): value is readonly SnapshotRef[] {
  return Array.isArray(value) && value.every((ref) => isObject(ref)
    && ["source_instance_id", "agent_id", "session_id", "snapshot_id"].every((key) => typeof ref[key] === "string")
    && typeof ref.snapshot_digest === "string" && hashPattern.test(ref.snapshot_digest));
}
function validTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function isHeader(value: unknown): value is SegmentHeader {
  return isObject(value) && value.schema_version === "boulder.trace.segment.v1"
    && typeof value.batch_id === "string" && idPattern.test(value.batch_id) && positiveInteger(value.sequence)
    && typeof value.previous_segment_hash === "string" && hashPattern.test(value.previous_segment_hash)
    && ["journal_id", "adapter_id", "interpretation_version", "content_policy_version"].every((key) => typeof value[key] === "string")
    && validRefs(value.snapshotRefs) && validTime(value.committedAt);
}
function isHead(value: unknown): value is TraceHead {
  return isObject(value) && value.schema_version === "boulder.trace.head.v1"
    && typeof value.batchId === "string" && idPattern.test(value.batchId) && positiveInteger(value.sequence)
    && value.fileName === segmentName(value.sequence, value.batchId)
    && positiveInteger(value.byteLength) && typeof value.digest === "string" && hashPattern.test(value.digest)
    && validRefs(value.snapshotRefs) && validTime(value.committedAt);
}

async function list(path: string, fs: JournalFs): Promise<string[]> {
  try { return await fs.readdir(path); }
  catch (error) { if (isMissingPath(error)) return []; throw error; }
}
async function assertDirectories(root: string, fs: JournalFs): Promise<void> {
  for (const path of [at(root, ".boulder"), at(root, ".boulder", "trace-state"), at(root, ".boulder", "traces")]) {
    try {
      const info = await fs.lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new TraceCommitError(C.unsafePath);
    } catch (error) { if (!isMissingPath(error)) throw error; }
  }
}
async function readHeadBytes(root: string, fs: JournalFs): Promise<Uint8Array | null> {
  // Readers check only head ancestors; they do not inspect the traces directory.
  for (const path of [at(root, ".boulder"), at(root, ".boulder", "trace-state")]) {
    try {
      const info = await fs.lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new TraceCommitError(C.unsafePath);
    } catch (error) { if (isMissingPath(error)) return null; throw error; }
  }
  try { return await readRegular(at(root, ".boulder", "trace-state", "head.json"), fs); }
  catch (error) { if (isMissingPath(error)) return null; throw error; }
}
async function readRegular(path: string, fs: JournalFs): Promise<Uint8Array> {
  const info = await fs.lstat(path);
  if (!info.isFile() || info.nlink !== 1 || info.isSymbolicLink()) throw new TraceCommitError(C.unsafePath);
  const handle = await fs.open(path, constants.O_RDONLY | noFollowFlag());
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1) throw new TraceCommitError(C.unsafePath);
    return await handle.readFile();
  } finally { await handle.close(); }
}
async function syncParents(root: string, fs: JournalFs): Promise<void> {
  await assertDirectories(root, fs);
  await fs.mkdir(at(root, ".boulder", "traces"), { recursive: true, mode: 0o700 });
  // acquire() created .boulder/trace-state; persist those entries too. Sync even
  // existing dirs: a previous failed attempt may have created but not synced them.
  for (const path of [root, at(root, ".boulder"), at(root, ".boulder", "traces"), at(root, ".boulder", "trace-state")]) {
    await syncDirectory(path, fs);
  }
}
async function syncDirectory(path: string, fs: JournalFs): Promise<void> {
  const handle = await fs.open(path, constants.O_RDONLY | noFollowFlag());
  try { await handle.sync(); } finally { await handle.close(); }
}
async function writeSyncedTemp(path: string, bytes: Uint8Array, fs: JournalFs): Promise<void> {
  // Only remove a temp this call successfully created. EEXIST does not grant
  // ownership; stale entries are swept under lock before any write begins.
  const handle = await fs.open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(), 0o600);
  let closed = false;
  try {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset, offset);
      if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > bytes.byteLength - offset) throw new TraceCommitError(C.shortWrite);
      offset += bytesWritten;
    }
    await handle.sync();
    closed = true; // close failure aborts; do not blindly retry a descriptor close
    await handle.close();
  } catch (error) {
    try { await fs.unlink(path); }
    finally { if (!closed) await handle.close(); }
    throw error;
  }
}
async function publishHead(root: string, head: TraceHead, fs: JournalFs): Promise<void> {
  const state = at(root, ".boulder", "trace-state");
  const path = at(state, "head.json");
  await writeSyncedTemp(`${path}.tmp`, encoder.encode(jsonLine(head)), fs);
  await fs.rename(`${path}.tmp`, path);
  await syncDirectory(state, fs);
}
