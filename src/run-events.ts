import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { join, resolve } from "node:path";

export type RunEventName =
  | "release-check"
  | "product-readiness"
  | "service-readiness"
  | "release-plan"
  | "release evidence refresh"
  | "evidence inspect"
  | "evidence diff";

export type RunEventSeverity = "info" | "error";
export type RunEventStatus = "ready" | "pilot-ready" | "blocked" | "pass" | "fail";

export type RunEventRecord = {
  readonly schemaVersion: "boulder.run-event.v1";
  readonly runId: string;
  readonly eventName: RunEventName;
  readonly command: string;
  readonly cwdHash: string;
  readonly packageVersion: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly severity: RunEventSeverity;
  readonly status: RunEventStatus;
  readonly checkIds: readonly string[];
  readonly recoveryHintIds: readonly string[];
  readonly artifactPaths: readonly string[];
};

export type RecordRunEventInput = {
  readonly eventName: RunEventName;
  readonly command: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly severity: RunEventSeverity;
  readonly status: RunEventStatus;
  readonly checkIds: readonly string[];
  readonly recoveryHintIds: readonly string[];
  readonly artifactPaths: readonly string[];
};

export type RecordRunEventResult = {
  readonly event: RunEventRecord;
  readonly path: string;
};

export type RunEventsList = {
  readonly schemaVersion: "boulder.runs.list.v1";
  readonly runs: readonly RunEventRecord[];
};

export type RunEventsPruneResult = {
  readonly schemaVersion: "boulder.runs.prune.v1";
  readonly pruned: number;
  readonly kept: number;
};

type StoredRunEvent = {
  readonly event: RunEventRecord;
  readonly fileName: string;
};

export class UnsafeRunEventPathError extends Error {
  constructor() {
    super("Run event path changed during safe file access.");
    this.name = "UnsafeRunEventPathError";
  }
}

export async function recordRunEvent(root: string, input: RecordRunEventInput): Promise<RecordRunEventResult> {
  const runsPath = runsDir(root);
  await ensureRunsDirSafe(root);
  const packageVersion = await readPackageVersion(root);
  const protectedPatterns = await readProtectedPatterns(root);
  const event = sanitizeEvent(root, protectedPatterns, {
    schemaVersion: "boulder.run-event.v1",
    runId: crypto.randomUUID(),
    eventName: input.eventName,
    command: input.command,
    cwdHash: await hashText(resolve(root)),
    packageVersion,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    severity: input.severity,
    status: input.status,
    checkIds: input.checkIds,
    recoveryHintIds: input.recoveryHintIds,
    artifactPaths: input.artifactPaths
  });
  const path = join(runsPath, `${event.completedAt.replace(/[:.]/g, "-")}-${event.eventName.replace(/\s+/g, "-")}-${event.runId}.json`);
  await safeReplaceText(path, `${JSON.stringify(event, null, 2)}\n`);
  return { event, path };
}

export async function listRunEvents(root: string): Promise<readonly RunEventRecord[]> {
  return (await listStoredRunEvents(root)).map((item) => item.event);
}

async function listStoredRunEvents(root: string): Promise<readonly StoredRunEvent[]> {
  const runsPath = runsDir(root);
  if (!await runsDirIsSafe(root, false)) return [];
  let names: readonly string[];
  try {
    names = await readdir(runsPath);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return [];
    throw error;
  }
  const events: StoredRunEvent[] = [];
  for (const name of names) {
    if (!safeRunEventFileName(name)) continue;
    const event = await readRunEvent(join(runsPath, name));
    if (event) events.push({ event, fileName: name });
  }
  return events.sort((left, right) => compareRunEvents(left.event, right.event));
}

export async function latestRunEvent(root: string): Promise<RunEventRecord | null> {
  return (await listRunEvents(root))[0] ?? null;
}

export async function showRunEvent(root: string, runId: string): Promise<RunEventRecord | null> {
  return (await listRunEvents(root)).find((event) => event.runId === runId) ?? null;
}

export async function pruneRunEvents(root: string, olderThanDays: number, keep: number): Promise<RunEventsPruneResult> {
  const runsPath = runsDir(root);
  if (!await runsDirIsSafe(root, false)) return { schemaVersion: "boulder.runs.prune.v1", pruned: 0, kept: 0 };
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const events = await listStoredRunEvents(root);
  let pruned = 0;
  for (let index = 0; index < events.length; index += 1) {
    const stored = events[index];
    if (!stored) continue;
    const event = stored.event;
    if (index < keep) continue;
    if (Date.parse(event.completedAt) >= cutoff) continue;
    await rm(join(runsPath, stored.fileName), { force: true });
    pruned += 1;
  }
  return { schemaVersion: "boulder.runs.prune.v1", pruned, kept: events.length - pruned };
}

export function runEventsList(events: readonly RunEventRecord[]): RunEventsList {
  return { schemaVersion: "boulder.runs.list.v1", runs: events };
}

function sanitizeEvent(root: string, protectedPatterns: readonly string[], event: RunEventRecord): RunEventRecord {
  return {
    ...event,
    command: sanitizeString(root, protectedPatterns, event.command),
    packageVersion: sanitizeString(root, protectedPatterns, event.packageVersion),
    checkIds: event.checkIds.map((item) => sanitizeString(root, protectedPatterns, item)),
    recoveryHintIds: event.recoveryHintIds.map((item) => sanitizeString(root, protectedPatterns, item)),
    artifactPaths: event.artifactPaths.map((item) => sanitizeString(root, protectedPatterns, item))
  };
}

function sanitizeString(root: string, protectedPatterns: readonly string[], value: string): string {
  if (value.includes("\n") || value.includes("\r")) return "[REDACTED_FILE_BODY]";
  let redacted = value
    .replace(/\bsk-proj-[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/\bghp_[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/\bnpm_[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/Bearer\s+\S+/g, "Bearer [REDACTED_SECRET]");
  for (const pattern of protectedPatterns) {
    redacted = redactProtectedPath(root, pattern, redacted);
  }
  return redacted.split(resolve(root)).join("[CWD]");
}

function redactProtectedPath(root: string, pattern: string, value: string): string {
  const clean = pattern.trim();
  if (!clean) return value;
  const prefix = clean.endsWith("*") ? clean.slice(0, -1) : clean;
  const absolute = resolve(root, prefix);
  const escaped = escapeRegExp(absolute);
  const match = clean.endsWith("*") ? new RegExp(`${escaped}[^\\s"']*`, "g") : new RegExp(escaped, "g");
  return value.replace(match, "[REDACTED_PROTECTED_PATH]");
}

async function readRunEvent(path: string): Promise<RunEventRecord | null> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) return null;
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRunEventRecord(parsed) ? parsed : null;
  } catch (error) {
    if (error instanceof SyntaxError || hasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
}

async function ensureRunsDirSafe(root: string): Promise<void> {
  await mkdir(join(root, ".boulder"), { recursive: true });
  if (await protectedLink(join(root, ".boulder"))) throw new UnsafeRunEventPathError();
  await mkdir(runsDir(root), { recursive: true });
  if (!await runsDirIsSafe(root, true)) throw new UnsafeRunEventPathError();
}

async function runsDirIsSafe(root: string, requirePresent: boolean): Promise<boolean> {
  const boulder = join(root, ".boulder");
  const runs = runsDir(root);
  if (await protectedLink(boulder)) return false;
  try {
    const info = await lstat(runs);
    return info.isDirectory() && !info.isSymbolicLink() && info.nlink >= 1;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return !requirePresent;
    throw error;
  }
}

async function protectedLink(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    return info.isSymbolicLink() || (info.isFile() && info.nlink > 1);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return false;
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
      if (!hasErrorCode(cleanupError, "ENOENT")) throw cleanupError;
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

function noFollowFlag(): number {
  return typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
}

async function readPackageVersion(root: string): Promise<string> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    if (isRecord(parsed) && typeof parsed.version === "string" && parsed.version.trim()) return parsed.version;
  } catch (error) {
    if (error instanceof SyntaxError || hasErrorCode(error, "ENOENT")) return "0.0.0";
    throw error;
  }
  return "0.0.0";
}

async function readProtectedPatterns(root: string): Promise<readonly string[]> {
  let text: string;
  try {
    text = await readFile(join(root, "boulder.yaml"), "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return [];
    throw error;
  }
  const lines = text.split("\n");
  const patterns = [];
  let inProtectedPaths = false;
  for (const line of lines) {
    if (/^\S/.test(line)) inProtectedPaths = line.trim() === "protectedPaths:";
    if (!inProtectedPaths) continue;
    const match = /^\s*-\s+(.+?)\s*$/.exec(line);
    if (match?.[1]) patterns.push(match[1]);
  }
  return patterns;
}

function runsDir(root: string): string {
  return join(root, ".boulder", "runs");
}

function safeRunEventFileName(name: string): boolean {
  return /^[0-9TZ-]+-[a-z-]+-[0-9a-f-]+\.json$/.test(name);
}

function compareRunEvents(left: RunEventRecord, right: RunEventRecord): number {
  const completed = Date.parse(right.completedAt) - Date.parse(left.completedAt);
  if (completed !== 0) return completed;
  return right.runId.localeCompare(left.runId);
}

async function hashText(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRunEventRecord(value: unknown): value is RunEventRecord {
  return isRecord(value) &&
    value.schemaVersion === "boulder.run-event.v1" &&
    typeof value.runId === "string" &&
    isRunEventName(value.eventName) &&
    typeof value.command === "string" &&
    typeof value.cwdHash === "string" &&
    typeof value.packageVersion === "string" &&
    typeof value.startedAt === "string" &&
    typeof value.completedAt === "string" &&
    isRunEventSeverity(value.severity) &&
    isRunEventStatus(value.status) &&
    isStringArray(value.checkIds) &&
    isStringArray(value.recoveryHintIds) &&
    isStringArray(value.artifactPaths);
}

function isRunEventName(value: unknown): value is RunEventName {
  return value === "release-check" ||
    value === "product-readiness" ||
    value === "service-readiness" ||
    value === "release-plan" ||
    value === "release evidence refresh" ||
    value === "evidence inspect" ||
    value === "evidence diff";
}

function isRunEventSeverity(value: unknown): value is RunEventSeverity {
  return value === "info" || value === "error";
}

function isRunEventStatus(value: unknown): value is RunEventStatus {
  return value === "ready" || value === "pilot-ready" || value === "blocked" || value === "pass" || value === "fail";
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error &&
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code;
}
