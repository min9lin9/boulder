import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { at } from "./fs";

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
    evidenceRefs: existing?.evidenceRefs.filter(isSafeEvidenceRef) ?? []
  };
  if (write) {
    if (!await routinePathIsSafe(root, path)) throw new InvalidRoutinePathError();
    await safeReplaceText(path, `${JSON.stringify(routine, null, 2)}\n`);
    if (!await routinePathIsSafe(root, path)) throw new InvalidRoutinePathError();
  }
  return { status: write ? "written" : "dry-run", path: `.boulder/routines/${id}.json`, routine };
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
  await mkdir(at(root, ".boulder"), { recursive: true });
  if (await pathIsProtectedLink(at(root, ".boulder"))) return false;
  await mkdir(at(root, ".boulder", "routines"), { recursive: true });
  return !await pathIsProtectedLink(at(root, ".boulder", "routines"))
    && !await pathIsProtectedLink(path);
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
    && value["evidenceRefs"].every(isEvidenceRef);
}

function isEvidenceRef(value: unknown): value is EvidenceRef {
  if (!isRecord(value)) return false;
  return typeof value["kind"] === "string"
    && typeof value["path"] === "string"
    && (value["hash"] === undefined || typeof value["hash"] === "string")
    && (value["note"] === undefined || typeof value["note"] === "string");
}

function isSafeEvidenceRef(value: EvidenceRef): boolean {
  return isSafeEvidencePath(value.path);
}

function isSafeEvidencePath(path: string): boolean {
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

export async function pathIsProtectedLink(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    return info.isSymbolicLink() || (info.isFile() && info.nlink > 1);
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
}

async function safeReplaceText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(), 0o600);
    await handle.writeFile(content, "utf8");
    await handle.close();
    handle = null;
    await rename(temporary, path);
  } catch (error) {
    try {
      await unlink(temporary);
    } catch (cleanupError) {
      if (!isMissingPath(cleanupError)) throw cleanupError;
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

export function noFollowFlag(): number {
  return typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
}

export function isMissingPath(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, "code") === "ENOENT";
}
