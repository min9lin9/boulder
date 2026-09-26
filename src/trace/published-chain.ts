/**
 * The ONE read-side walk of the published journal chain. collect, link and
 * serve must observe exactly the same validation; verify.ts keeps its own
 * independent walk as the strict checker, so format changes land here once.
 *
 * Reads ONLY the prefix selected by head.json: filenames are resolved from the
 * directory because segments record predecessor HASHES, not names. Unpublished
 * entries are never opened. Each segment is authenticated end to end - regular
 * non-linked file, strict JSONL framing, footer record_count/digest, header
 * sequence/filename/journal_id/predecessor-hash, every snapshot record's schema
 * and content digest, snapshotRefs membership, and finally the head's digest,
 * byte length, committedAt and snapshotRefs. Segment bookkeeping problems throw
 * TraceCommitError; non-snapshot record objects and snapshot record/ref problems
 * are reported through the caller-provided refusal factory, matching verify.ts's
 * strictness, so each caller keeps its own error surface.
 */
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { at, noFollowFlag } from "../fs";
import {
  canonicalizeDecodedEvent, isSessionSnapshot, snapshotDigest, SNAPSHOT_RECORD_VERSION,
  type SessionSnapshot
} from "./contracts";
import { GENESIS_SEGMENT_HASH, TraceCommitError, type TraceHead } from "./journal";

export type PublishedSnapshot = { snapshot: SessionSnapshot; sequence: number; fileName: string };
export type PublishedChain = {
  readonly journalId: string;
  readonly snapshots: readonly PublishedSnapshot[];
  readonly snapshotById: ReadonlyMap<string, SessionSnapshot>;
};
/** Snapshot semantic problems carry these fixed codes; the caller picks the error type. */
export type SnapshotProblem = "trace.snapshot_invalid" | "trace.snapshot_digest_mismatch";
export type SnapshotRefusal = (code: SnapshotProblem, message: string) => Error;

const filePattern = /^\d{6,}-[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.jsonl$/;

export async function readPublishedChain(root: string, head: TraceHead, refusal: SnapshotRefusal): Promise<PublishedChain> {
  const directory = at(root, ".boulder", "traces");
  for (const path of [at(root, ".boulder"), directory]) await assertDirectory(path);
  const names = (await readdir(directory)).filter((name) => filePattern.test(name)
    && Number(name.split("-")[0]) <= head.sequence)
    .sort((a, b) => Number(a.split("-")[0]) - Number(b.split("-")[0]));
  if (names.length !== head.sequence || names[names.length - 1] !== head.fileName) {
    throw new TraceCommitError("trace.head_segment_missing");
  }
  const snapshots: PublishedSnapshot[] = [];
  const snapshotById = new Map<string, SessionSnapshot>();
  let journalId: string | null = null;
  let previousHash = GENESIS_SEGMENT_HASH;
  for (const [index, fileName] of names.entries()) {
    const bytes = await readRegularFile(at(directory, fileName));
    const hash = await sha256Hex(bytes);
    let lines: unknown[];
    try {
      if (bytes[bytes.length - 1] !== 10) throw new Error("Missing record delimiter");
      lines = new TextDecoder("utf-8", { fatal: true }).decode(bytes).slice(0, -1).split("\n").map((line) => JSON.parse(line));
    } catch { throw new TraceCommitError("trace.segment_invalid"); }
    const header = lines[0];
    const footer = lines[lines.length - 1];
    if (!isRecord(header) || header.schema_version !== "boulder.trace.segment.v1" || header.sequence !== index + 1
      || header.previous_segment_hash !== previousHash
      || fileName !== `${String(header.sequence).padStart(6, "0")}-${header.batch_id}.jsonl`
      || typeof header.journal_id !== "string" || (journalId !== null && header.journal_id !== journalId)) {
      throw new TraceCommitError("trace.chain_mismatch");
    }
    journalId = header.journal_id;
    for (const record of lines.slice(1, -1)) {
      if (!isRecord(record)) throw new TraceCommitError("trace.segment_invalid");
      // Like verify.ts, every record object must be a supported snapshot:
      // unknown schemas - including newer versions - are never skipped.
      if (record.schema_version !== SNAPSHOT_RECORD_VERSION || !isSessionSnapshot(record)) {
        throw refusal("trace.snapshot_invalid", "Record is not a supported session snapshot.");
      }
      if (snapshotById.has(record.snapshot_id)) {
        throw refusal("trace.snapshot_invalid", "Duplicate committed snapshot identity.");
      }
      if (await snapshotDigest(record) !== record.snapshot_digest) {
        throw refusal("trace.snapshot_digest_mismatch", "Committed snapshot content does not match its digest.");
      }
      snapshotById.set(record.snapshot_id, record);
      snapshots.push({ snapshot: record, sequence: header.sequence, fileName });
    }
    if (!Array.isArray(header.snapshotRefs)) throw new TraceCommitError("trace.segment_invalid");
    for (const ref of header.snapshotRefs) {
      if (!isRecord(ref) || typeof ref.snapshot_id !== "string") throw new TraceCommitError("trace.segment_invalid");
      const snapshot = snapshotById.get(ref.snapshot_id);
      if (!snapshot || ["source_instance_id", "agent_id", "session_id", "snapshot_digest"].some((key) =>
        ref[key] !== Reflect.get(snapshot, key))) {
        throw refusal("trace.snapshot_digest_mismatch", "Published snapshot reference does not match the committed inventory.");
      }
    }
    const footerStart = bytes.lastIndexOf(10, bytes.length - 2) + 1;
    if (!isRecord(footer) || footer.schema_version !== "boulder.trace.footer.v1" || lines.length < 3
      || footer.record_count !== lines.length - 2 || footer.digest !== await sha256Hex(bytes.subarray(0, footerStart))) {
      throw new TraceCommitError("trace.segment_invalid");
    }
    if (index === names.length - 1 && (hash !== head.digest || bytes.byteLength !== head.byteLength
      || header.committedAt !== head.committedAt
      || canonicalizeDecodedEvent(header.snapshotRefs) !== canonicalizeDecodedEvent(head.snapshotRefs))) {
      throw new TraceCommitError("trace.head_digest_mismatch");
    }
    previousHash = hash;
  }
  // head.sequence >= 1 guarantees the loop ran and journalId was assigned.
  return { journalId: journalId!, snapshots, snapshotById };
}

/** SHA-256 of raw bytes as lowercase hex. The one bytes-side digest helper. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Open-no-follow, regular, single-link file read for trace-chain files. */
export async function readRegularFile(path: string): Promise<Uint8Array> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new TraceCommitError("trace.journal_path_unsafe");
  const file = await open(path, constants.O_RDONLY | noFollowFlag());
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.nlink !== 1) throw new TraceCommitError("trace.journal_path_unsafe");
    return await file.readFile();
  } finally { await file.close(); }
}

async function assertDirectory(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new TraceCommitError("trace.journal_path_unsafe");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
