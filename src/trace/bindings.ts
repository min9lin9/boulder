import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { acquire } from "../evidence-write-lock";
import { evidenceDescriptorPath, writeEvidenceDescriptor } from "../evidence/descriptors";
import { at, isMissingPath, noFollowFlag } from "../fs";
import { showRunEvent } from "../run-events";
import {
  sourceRevisionForDecodedEvent,
  type Binding, type InputObservation, type SessionSnapshot, type SourceEventRef
} from "./contracts";
import { loadHead } from "./journal";
import { isRecord, readPublishedChain } from "./published-chain";

export const TRACE_BINDING_VERSION = "boulder.trace.binding.v1";

/**
 * Binding's original contract requires native logical IDs, but admitted source
 * events may have none. Persist SourceEventRef instead: a locator is meaningful
 * only within the pinned snapshot, never a fabricated logical/execution ID.
 * Consumers must use isTraceBinding (not the native-ID-only isBinding guard).
 * The binding lives in trace-state/bindings; link --write also mints the
 * committable metadata descriptor in .boulder/evidence/traces that routine
 * evidence attach authenticates by id.
 */
export type TraceBinding = Omit<Binding, "selected_events"> & {
  readonly schemaVersion: typeof TRACE_BINDING_VERSION;
  readonly binding_id: string;
  readonly selected_events: readonly SourceEventRef[];
  readonly createdAt: string;
};
export type LinkOptions = {
  readonly snapshotId: string;
  readonly fromEvent: string;
  readonly toEvent: string;
  readonly runId: string;
  readonly dryRun: boolean;
};
export type LinkReport = {
  readonly schemaVersion: "boulder.trace.link.v1";
  readonly mode: "dry-run" | "write";
  readonly status: "would_commit" | "committed" | "no-op";
  readonly binding: TraceBinding;
  readonly binding_path: string;
  readonly span_coverage: {
    readonly basis: "snapshot_inventory";
    readonly from_source_row_key: string;
    readonly to_source_row_key: string;
    readonly selected_input_count: number;
    readonly snapshot_input_count: number;
    readonly disposition_counts: SessionSnapshot["disposition_counts"];
    // Transcript ranges do not prove an execution span, even for timed events.
    readonly execution_span_coverage: "unavailable";
  };
};
export class TraceBindingError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "TraceBindingError";
  }
}
const hashPattern = /^[a-f0-9]{64}$/;

export function bindingPath(root: string, bindingId: string): string {
  if (!hashPattern.test(bindingId)) throw refusal("trace.binding_id_invalid", "Binding IDs are SHA-256 hex digests.");
  return at(root, ".boulder", "trace-state", "bindings", `${bindingId}.json`);
}

/** No journal recovery: only the prefix published by head.json is eligible. */
export async function linkTrace(root: string, options: LinkOptions): Promise<LinkReport> {
  root = resolve(root);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(options.runId)) {
    throw refusal("trace.run_id_invalid", "--run-id must be a command-run UUID.");
  }
  // A dry-run takes no lock and does not create directories, temps or caches.
  const lock = options.dryRun ? null : await acquire(root, { command: "trace link" });
  let failure: unknown = null;
  try {
    const { journalId, snapshot } = await resolveCommittedSnapshot(root, options.snapshotId);
    if (!await showRunEvent(root, options.runId)) {
      throw refusal("trace.run_not_found", "No boulder.run-event.v1 command record matches --run-id in .boulder/runs.");
    }
    const from = resolveEndpoint(snapshot, options.fromEvent);
    const to = resolveEndpoint(snapshot, options.toEvent);
    if (from > to) throw refusal("trace.event_range_invalid", "--from-event must not follow --to-event in snapshot order.");
    // Freeze the inclusive inventory range, including ignored/quarantined rows.
    // No timestamp matching, live-source reads, projection expansion or filtering.
    const rows = snapshot.input_inventory.slice(from, to + 1);
    if (rows.some((row) => row.quality_flags.includes("source_revision_incomplete"))) {
      throw refusal("trace.event_revision_unavailable", "The selection contains an incomplete source revision.");
    }
    const content: Omit<TraceBinding, "binding_id" | "createdAt"> = {
      schemaVersion: TRACE_BINDING_VERSION, journal_id: journalId,
      snapshot_id: snapshot.snapshot_id, snapshot_digest: snapshot.snapshot_digest,
      selected_events: rows.map(eventRef), boulder_command_run_id: options.runId,
      binding_basis: "operator_explicit"
    };
    // createdAt and endpoint spelling are deliberately excluded: aliases and
    // retries of the same frozen selection/run reuse the first persisted record.
    const bindingId = await sourceRevisionForDecodedEvent(content);
    const path = bindingPath(root, bindingId);
    const existing = await readBinding(root, bindingId);
    const binding: TraceBinding = existing ?? { ...content, binding_id: bindingId, createdAt: new Date().toISOString() };
    if (!options.dryRun) await persistBinding(root, path, binding, existing !== null);
    if (!options.dryRun) {
      // The descriptor is what `routine evidence add --descriptor-kind traces`
      // authenticates; without it a committed binding is unattachable evidence.
      // Order is deliberate: the binding is the primary artifact, so a committed
      // binding whose descriptor write fails reports a named partial failure
      // (never a claimed success) and a same-arguments retry heals it - the
      // binding dedupes to no-op while the descriptor is minted or reused.
      try {
        await writeEvidenceDescriptor(root, "traces", bindingId, new Date().toISOString());
      } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        throw refusal("trace.evidence_descriptor_uncommitted",
          `Binding committed at ${path} but the evidence descriptor ${evidenceDescriptorPath("traces", bindingId)} could not be written (${detail}). Retry the same link command to mint it.`);
      }
    }
    const counts = { normalized: 0, ignored: 0, quarantined: 0 };
    for (const row of rows) counts[row.disposition]++;
    return {
      schemaVersion: "boulder.trace.link.v1", mode: options.dryRun ? "dry-run" : "write",
      status: existing ? "no-op" : options.dryRun ? "would_commit" : "committed",
      binding, binding_path: path,
      span_coverage: {
        basis: "snapshot_inventory", from_source_row_key: rows[0].source_row_key,
        to_source_row_key: rows[rows.length - 1].source_row_key,
        selected_input_count: rows.length, snapshot_input_count: snapshot.input_inventory.length,
        disposition_counts: counts, execution_span_coverage: "unavailable"
      }
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
}

/** Read and authenticate a stored binding; backing snapshot validation is separate. */
export async function readBinding(root: string, bindingId: string): Promise<TraceBinding | null> {
  await assertBindingDirectories(root);
  let bytes: Uint8Array;
  try { bytes = await readRegular(bindingPath(root, bindingId)); }
  catch (error) { if (isMissingPath(error)) return null; throw error; }
  const value = parseJson(bytes);
  if (!isTraceBinding(value) || value.binding_id !== bindingId) {
    throw refusal("trace.binding_invalid", "Stored binding has an invalid shape or identity.");
  }
  const { binding_id, createdAt, ...content } = value;
  if (await sourceRevisionForDecodedEvent(content) !== binding_id) {
    throw refusal("trace.binding_digest_mismatch", "Stored binding does not match its content-addressed ID.");
  }
  return value;
}

export function isTraceBinding(value: unknown): value is TraceBinding {
  return isRecord(value) && value.schemaVersion === TRACE_BINDING_VERSION
    && typeof value.binding_id === "string" && hashPattern.test(value.binding_id)
    && typeof value.journal_id === "string" && typeof value.snapshot_id === "string"
    && typeof value.snapshot_digest === "string" && hashPattern.test(value.snapshot_digest)
    && typeof value.boulder_command_run_id === "string" && value.binding_basis === "operator_explicit"
    && typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt))
    && Array.isArray(value.selected_events) && value.selected_events.length > 0
    && value.selected_events.every((ref) => isRecord(ref) && typeof ref.source_row_key === "string"
      && (ref.logical_event_id === undefined || typeof ref.logical_event_id === "string")
      && typeof ref.source_revision === "string" && hashPattern.test(ref.source_revision));
}

/** Shared read-only resolver for binding consumers; historical snapshots remain valid. */
export async function resolveCommittedSnapshot(root: string, snapshotId: string): Promise<{ journalId: string; snapshot: SessionSnapshot }> {
  const head = await loadHead(root);
  if (!head) throw snapshotMissing();
  const chain = await readPublishedChain(root, head, refusal);
  const snapshot = chain.snapshotById.get(snapshotId);
  if (!snapshot) throw snapshotMissing();
  return { journalId: chain.journalId, snapshot };
}

function eventRef(row: InputObservation): SourceEventRef {
  return { source_row_key: row.source_row_key,
    ...(row.logical_event_id === undefined ? {} : { logical_event_id: row.logical_event_id }),
    source_revision: row.source_revision };
}

function resolveEndpoint(snapshot: SessionSnapshot, endpoint: string): number {
  // Exact logical ID or JSON locator [session_id, seq]; a native ID is also
  // accepted when scoped unambiguously by this snapshot. No numeric guessing.
  const logicalId = JSON.stringify([snapshot.source_instance_id, snapshot.agent_id, snapshot.session_id, endpoint]);
  const matches = snapshot.input_inventory.flatMap((row, index) =>
    row.source_row_key === endpoint || row.logical_event_id === endpoint || row.logical_event_id === logicalId ? [index] : []);
  if (matches.length === 0) throw refusal("trace.event_not_in_snapshot", "An endpoint is not present in the committed snapshot.");
  if (matches.length !== 1) throw refusal("trace.event_ambiguous", "An endpoint matches multiple snapshot events.");
  return matches[0];
}

async function persistBinding(root: string, path: string, binding: TraceBinding, existing: boolean): Promise<void> {
  await assertBindingDirectories(root);
  const directory = at(root, ".boulder", "trace-state", "bindings");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Sync even on retry: a prior rename may have succeeded before fsync failed.
  for (const parent of [root, at(root, ".boulder"), at(root, ".boulder", "trace-state")]) await syncDirectory(parent);
  if (!existing) {
    const temporary = `${path}.${crypto.randomUUID()}.tmp`;
    const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(), 0o600);
    try {
      try { await file.writeFile(`${JSON.stringify(binding, null, 2)}\n`, "utf8"); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, path);
    } catch (error) {
      try { await unlink(temporary); } catch (cleanup) { if (!isMissingPath(cleanup)) throw cleanup; }
      throw error;
    }
  }
  await syncDirectory(directory);
}
async function assertBindingDirectories(root: string): Promise<void> {
  for (const path of [at(root, ".boulder"), at(root, ".boulder", "trace-state"), at(root, ".boulder", "trace-state", "bindings")]) {
    try { await assertDirectory(path); } catch (error) { if (!isMissingPath(error)) throw error; }
  }
}
async function assertDirectory(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw refusal("trace.binding_path_unsafe", "Trace paths must not contain links or non-directory ancestors.");
}
async function readRegular(path: string): Promise<Uint8Array> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw refusal("trace.binding_path_unsafe", "Expected a regular, non-linked trace file.");
  const file = await open(path, constants.O_RDONLY | noFollowFlag());
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.nlink !== 1) throw refusal("trace.binding_path_unsafe", "Trace file changed during access.");
    return await file.readFile();
  } finally { await file.close(); }
}
async function syncDirectory(path: string): Promise<void> {
  const file = await open(path, constants.O_RDONLY | noFollowFlag());
  try { await file.sync(); } finally { await file.close(); }
}
function parseJson(bytes: Uint8Array): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw refusal("trace.binding_invalid", "Stored binding is not valid UTF-8 JSON."); }
}
function refusal(code: string, message: string): TraceBindingError { return new TraceBindingError(code, message); }
function snapshotMissing(): TraceBindingError {
  return refusal("trace.snapshot_not_committed", "Snapshot ID is absent from the published journal chain.");
}
