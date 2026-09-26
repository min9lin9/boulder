import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { acquire } from "./evidence-write-lock";
import { evidenceDescriptorPath, readEvidenceDescriptor } from "./evidence/descriptors";
import { at, isMissingPath, protectedWritePathIsSafe, safeReplaceText } from "./fs";

export type EvidenceRef = {
  readonly kind: string;
  readonly path: string;
  readonly hash?: string;
  readonly note?: string;
};

export type RoutineArtifact = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly task: string;
  readonly normalizedTask: string;
  readonly profileId: string;
  readonly createdAt: string;
  readonly seenCount: number;
  readonly lastSeenAt: string;
  readonly evidenceRefs: readonly EvidenceRef[];
  // Legacy snake_case twin written by a buggy attach build. Still validated and
  // merged on read so those artifacts keep working; new writes always drop it.
  readonly evidence_refs?: readonly string[];
};

export type RoutineCaptureResult = {
  readonly status: "dry-run" | "written";
  readonly path: string;
  readonly routine: RoutineArtifact;
};

export class InvalidRoutineTaskError extends Error {
  constructor() {
    super("Routine task must be non-empty safe text.");
    this.name = "InvalidRoutineTaskError";
  }
}

export class InvalidRoutinePathError extends Error {
  constructor() {
    super("Routine path must stay under .boulder/routines.");
    this.name = "InvalidRoutinePathError";
  }
}

const DRY_RUN_TIME = "1970-01-01T00:00:00.000Z";

export async function captureRoutine(root: string, task: string | null, profileId: string, write: boolean): Promise<RoutineCaptureResult> {
  const normalizedTask = normalizeRoutineTask(task);
  const id = routineId(normalizedTask);
  const path = routinePath(root, id);
  if (!routinePathIsValid(root, path)) throw new InvalidRoutinePathError();
  // The lock must cover the read too: evidence writers may append refs meanwhile.
  const lock = write ? await acquire(root, { command: "routine capture" }) : null;
  let failure: unknown = null;
  try {
    const existing = write ? await loadRoutine(path, root) : null;
    const now = write ? new Date().toISOString() : DRY_RUN_TIME;
    const routine: RoutineArtifact = {
      schemaVersion: 1,
      id,
      title: normalizedTask,
      task: normalizedTask,
      normalizedTask,
      profileId,
      createdAt: existing?.createdAt ?? now,
      seenCount: (existing?.seenCount ?? 0) + 1,
      lastSeenAt: now,
      evidenceRefs: existing === null ? [] : routineEvidenceRefs(existing).filter(isSafeEvidenceRef),
    };
    if (write) {
      if (!await routinePathIsSafe(root, path)) throw new InvalidRoutinePathError();
      await safeReplaceText(path, `${JSON.stringify(routine, null, 2)}\n`);
      if (!await routinePathIsSafe(root, path)) throw new InvalidRoutinePathError();
    }
    return { status: write ? "written" : "dry-run", path: `.boulder/routines/${id}.json`, routine };
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    // A release failure reports only when no primary error is in flight; it
    // must never replace the real diagnostic (see evidence-write-lock).
    try { await lock?.release(); }
    catch (releaseError) { if (failure === null) throw releaseError; }
  }
}

export class RoutineEvidenceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "RoutineEvidenceError";
  }
}

export type RoutineEvidenceResult = {
  readonly status: "attached";
  readonly artifact_path: string;
  readonly evidence_refs: readonly string[];
};

/** This storage format has one current artifact per routine, not capture history. */
export function routineArtifactPathForOrdinal(root: string, id: string, ordinal: number): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new RoutineEvidenceError("routine.invalid_task", "--task must be a captured routine id.");
  }
  if (ordinal !== 1) {
    throw new RoutineEvidenceError("routine.ordinal_invalid", "--ordinal must be 1: this routine format stores one current artifact.");
  }
  return routinePath(root, id);
}

export async function resolveRoutineByIdOrOrdinal(root: string, id: string, ordinal: number): Promise<RoutineArtifact> {
  const path = routineArtifactPathForOrdinal(root, id, ordinal);
  if (!await routinePathIsSafe(root, path)) throw new InvalidRoutinePathError();
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isRoutineArtifact(parsed) || parsed.id !== id) {
      throw new RoutineEvidenceError("routine.artifact_invalid", "Routine artifact schema or identity is invalid.");
    }
    return parsed;
  } catch (error) {
    if (isMissingPath(error)) throw new RoutineEvidenceError("routine.artifact_missing", "Routine artifact does not exist.");
    if (error instanceof SyntaxError) throw new RoutineEvidenceError("routine.artifact_invalid", "Routine artifact is not valid JSON.");
    throw error;
  }
}

export async function attachRoutineEvidence(root: string, options: {
  task: string; ordinal: number; descriptorKind: string; descriptorId: string; note?: string;
}): Promise<RoutineEvidenceResult> {
  root = resolve(root);
  const path = routineArtifactPathForOrdinal(root, options.task, options.ordinal);
  evidenceDescriptorPath(options.descriptorKind, options.descriptorId);
  const lock = await acquire(root, { command: "routine evidence add" });
  let failure: unknown = null;
  try {
    // Both reads and the merge are under the same lock as routine capture.
    const routine = await resolveRoutineByIdOrOrdinal(root, options.task, options.ordinal);
    const { descriptor, path: descriptorPath } = await readEvidenceDescriptor(root, options.descriptorKind, options.descriptorId);
    // Unsafe stored paths (e.g. legacy evidence_refs values or hand-edited
    // camelCase refs) never re-persist: capture drops them on the same merge.
    const evidenceRefs = routineEvidenceRefs(routine).filter(isSafeEvidenceRef);
    if (!evidenceRefs.some((ref) => ref.path === descriptorPath)) {
      // The stored hash is the authenticated descriptor's own canonical hash:
      // readEvidenceDescriptor just recomputed it from canonical file content.
      evidenceRefs.push({
        kind: descriptor.descriptor_kind, path: descriptorPath, hash: descriptor.hash,
        ...(options.note === undefined ? {} : { note: options.note })
      });
    }
    // The canonical camelCase field is the only evidence field we write; the
    // legacy evidence_refs twin is consumed above and dropped from the output.
    const { evidence_refs: _dropped, ...rest } = routine;
    const artifact = { ...rest, evidenceRefs };
    if (!await routinePathIsSafe(root, path)) throw new InvalidRoutinePathError();
    await safeReplaceText(path, `${JSON.stringify(artifact, null, 2)}\n`);
    if (!await routinePathIsSafe(root, path)) throw new InvalidRoutinePathError();
    return { status: "attached", artifact_path: relative(root, path), evidence_refs: evidenceRefs.map((ref) => ref.path) };
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try { await lock.release(); }
    catch (releaseError) { if (failure === null) throw releaseError; }
  }
}

function normalizeRoutineTask(task: string | null): string {
  const raw = task ?? "";
  if (/[\u0000-\u001F\u007F]/.test(raw) || raw.includes("\\0")) throw new InvalidRoutineTaskError();
  const normalized = raw.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!normalized || normalized.includes("..") || normalized.startsWith("/") || normalized.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(normalized)) {
    throw new InvalidRoutineTaskError();
  }
  return normalized;
}

function routineId(normalizedTask: string): string {
  const id = normalizedTask.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new InvalidRoutineTaskError();
  return id;
}

function routinePath(root: string, id: string): string {
  if (id.includes("/") || id.includes("\\")) throw new InvalidRoutinePathError();
  return at(root, ".boulder", "routines", `${id}.json`);
}

function routinePathIsValid(root: string, path: string): boolean {
  const base = resolve(root, ".boulder", "routines");
  const relation = relative(base, path).replace(/\\/g, "/");
  return relation.length > 0 && relation !== ".." && !relation.startsWith("../") && /^[a-z0-9-]+\.json$/.test(relation);
}

async function routinePathIsSafe(root: string, path: string): Promise<boolean> {
  return protectedWritePathIsSafe(root, at(root, ".boulder", "routines"), path);
}

async function loadRoutine(path: string, root: string): Promise<RoutineArtifact | null> {
  if (!await routinePathIsSafe(root, path)) throw new InvalidRoutinePathError();
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRoutineArtifact(parsed) ? parsed : null;
  } catch (error) {
    if (isMissingPath(error)) return null;
    throw error;
  }
}

export function isRoutineArtifact(value: unknown): value is RoutineArtifact {
  if (!isRecord(value)) return false;
  return value["schemaVersion"] === 1
    && typeof value["id"] === "string"
    && typeof value["title"] === "string"
    && typeof value["task"] === "string"
    && typeof value["normalizedTask"] === "string"
    && typeof value["profileId"] === "string"
    && typeof value["createdAt"] === "string"
    && typeof value["seenCount"] === "number"
    && typeof value["lastSeenAt"] === "string"
    && Array.isArray(value["evidenceRefs"])
    && value["evidenceRefs"].every(isEvidenceRef)
    && (value["evidence_refs"] === undefined || (Array.isArray(value["evidence_refs"])
      && value["evidence_refs"].every((ref: unknown) => typeof ref === "string"
        && /^\.boulder\/evidence\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.json$/.test(ref))));
}

function isEvidenceRef(value: unknown): value is EvidenceRef {
  if (!isRecord(value)) return false;
  return typeof value["kind"] === "string"
    && typeof value["path"] === "string"
    && (value["hash"] === undefined || typeof value["hash"] === "string")
    && (value["note"] === undefined || typeof value["note"] === "string");
}

/**
 * All evidence references on an artifact: canonical evidenceRefs plus any
 * legacy snake_case evidence_refs written by the buggy build, migrated to
 * descriptor-shaped refs and deduplicated by path.
 */
export function routineEvidenceRefs(artifact: RoutineArtifact): EvidenceRef[] {
  const refs = [...artifact.evidenceRefs];
  const seen = new Set(refs.map((ref) => ref.path));
  for (const path of artifact.evidence_refs ?? []) {
    if (seen.has(path)) continue;
    seen.add(path);
    refs.push({ kind: path.split("/")[2] ?? "evidence", path });
  }
  return refs;
}

function isSafeEvidenceRef(value: EvidenceRef): boolean {
  return isSafeEvidencePath(value.path);
}

export function isSafeEvidencePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return normalized.length > 0
    && !/[\u0000-\u001F\u007F]/.test(path)
    && !path.includes("\\0")
    && !normalized.startsWith("/")
    && normalized !== ".."
    && !normalized.startsWith("../")
    && !normalized.includes("/../")
    && !/^[A-Za-z]:[\\/]/.test(path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
