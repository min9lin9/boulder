import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  finalReceiptChallengeIssues,
  validateExecutionApprovalReceipt,
  validatePendingApprovalChallenge,
  validatePlanApprovalReceipt,
  type ExecutionApprovalReceipt,
  type PendingApprovalChallenge,
  type PlanApprovalReceipt
} from "./plan-receipts.js";

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ARTIFACT_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CHALLENGE_PURPOSES = new Set(["plan", "execution"]);
let temporarySequence = 0;

export class PlanStorePathError extends Error {
  readonly id = "plan.path.invalid";

  constructor(message = "Plan artifact path must stay inside .boulder/plans without symlinks or hardlinks.") {
    super(message);
    this.name = "PlanStorePathError";
  }
}

export class PlanStoreLockError extends Error {
  readonly id = "plan.state.locked";

  constructor(message = "Plan run is locked by another cooperative writer.") {
    super(message);
    this.name = "PlanStoreLockError";
  }
}

export class PlanStoreSchemaError extends Error {
  readonly id = "plan.schema.unsupported";

  constructor(message = "Persisted record uses a schemaVersion this build cannot read.") {
    super(message);
    this.name = "PlanStoreSchemaError";
  }
}

export type PlanLock = Readonly<{ owner: string; revision: number }>;
export type PlanChallengePurpose = "plan" | "execution";
export type PersistedChallenge = Readonly<{ expectedRevision: number; challengeDigest: string; content: string }>;
export type ConsumedChallenge = PersistedChallenge & Readonly<{ expectedChallengeDigest: string }>;

export function validPlanRunId(runId: string): boolean {
  return SAFE_RUN_ID.test(runId);
}

export function planRunPath(workspace: string, runId: string): string {
  if (!validPlanRunId(runId)) throw new PlanStorePathError("Plan run id must be a safe slug.");
  return resolve(workspace, ".boulder", "plans", runId);
}

export function planArtifactPath(workspace: string, runId: string, artifact: string): string {
  const runRoot = planRunPath(workspace, runId);
  const parts = artifact.replace(/\\/g, "/").split("/");
  if (parts.length === 0 || parts.some((part) => !ARTIFACT_SEGMENT.test(part))) throw new PlanStorePathError();
  const target = resolve(runRoot, ...parts);
  if (!isContained(runRoot, target)) throw new PlanStorePathError();
  return target;
}

export async function writePlanArtifact(workspace: string, runId: string, artifact: string, content: string): Promise<void> {
  const runRoot = planRunPath(workspace, runId);
  const target = planArtifactPath(workspace, runId, artifact);
  await ensureSafeRunRoot(workspace, runId);
  await ensureSafeArtifactDirectory(runRoot, target);
  await assertSafeArtifactPath(runRoot, target);
  await atomicReplace(target, content);
  await assertSafeArtifactPath(runRoot, target);
}

export async function readPlanArtifact(workspace: string, runId: string, artifact: string): Promise<string | null> {
  const runRoot = planRunPath(workspace, runId);
  const target = planArtifactPath(workspace, runId, artifact);
  await assertSafeRunRoot(workspace, runId, false);
  await assertSafeArtifactPath(runRoot, target, true);
  try {
    return await readSafeFile(target);
  } catch (error) {
    if (isCode(error, "ENOENT")) return null;
    throw error;
  }
}

export const DEFAULT_PLAN_LOCK_STALE_TTL_MS = 5 * 60 * 1000;

export type AcquirePlanLockOptions = Readonly<{ staleTtlMs?: number }>;

/** Recovers cooperative locks whose file has been stale longer than the TTL instead of blocking forever. */
export async function acquirePlanLock(workspace: string, runId: string, lock: PlanLock, options?: AcquirePlanLockOptions): Promise<void> {
  if (!validLock(lock)) throw new PlanStorePathError("Plan lock owner and revision are required.");
  const runRoot = planRunPath(workspace, runId);
  const lockPath = planArtifactPath(workspace, runId, "lock");
  await ensureSafeRunRoot(workspace, runId);
  await assertSafeArtifactPath(runRoot, lockPath);
  const staleTtlMs = Math.max(0, options?.staleTtlMs ?? DEFAULT_PLAN_LOCK_STALE_TTL_MS);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(), 0o600);
      try { await handle.writeFile(`${JSON.stringify(lock)}\n`, "utf8"); } finally { await handle.close(); }
      try { await assertSafeArtifactPath(runRoot, lockPath); } catch (error) {
        await unlink(lockPath).catch(() => undefined);
        throw error;
      }
      return;
    } catch (error) {
      if (isCode(error, "EEXIST")) {
        if (attempt === 0 && (await isStalePlanLockFile(lockPath, staleTtlMs))) {
          await unlink(lockPath).catch(() => undefined);
          continue;
        }
        throw new PlanStoreLockError();
      }
      if (isUnsafeOpen(error)) throw new PlanStorePathError();
      throw error;
    }
  }
}

async function isStalePlanLockFile(lockPath: string, staleTtlMs: number): Promise<boolean> {
  try {
    const stats = await lstat(lockPath);
    return Date.now() - stats.mtimeMs > staleTtlMs;
  } catch {
    return false;
  }
}

export async function releasePlanLock(workspace: string, runId: string, expected: PlanLock): Promise<void> {
  if (!validLock(expected)) throw new PlanStorePathError("Plan lock owner and revision are required.");
  const runRoot = planRunPath(workspace, runId);
  const lockPath = planArtifactPath(workspace, runId, "lock");
  await assertSafeRunRoot(workspace, runId, false);
  await assertSafeArtifactPath(runRoot, lockPath);
  let actual: unknown;
  try { actual = JSON.parse(await readSafeFile(lockPath)); } catch (error) {
    if (error instanceof SyntaxError) throw new PlanStoreLockError("Plan lock is corrupt and must be explicitly repaired.");
    throw error;
  }
  if (!isMatchingLock(actual, expected)) throw new PlanStoreLockError("Plan lock ownership or revision changed.");
  await assertSafeArtifactPath(runRoot, lockPath);
  await unlink(lockPath);
}

/** Writes a pending challenge under a cooperative revision lock, preserving identical issuance. */
export async function writeCurrentChallenge(workspace: string, runId: string, purpose: PlanChallengePurpose, challenge: PersistedChallenge): Promise<void> {
  const parsed = parseChallenge(challenge.content);
  if (parsed.status !== "pending" || parsed.purpose !== purpose || parsed.runId !== runId || parsed.challengeDigest !== challenge.challengeDigest) {
    throw new PlanStorePathError("Persisted challenge is not a pending challenge for this run and purpose.");
  }
  await withChallengeLock(workspace, runId, purpose, challenge.expectedRevision, async () => {
    const current = challengeArtifact(purpose);
    const existing = await readPlanArtifact(workspace, runId, current);
    if (existing === challenge.content) return;
    if (existing !== null) await archiveChallenge(workspace, runId, purpose, existing);
    await writePlanArtifact(workspace, runId, current, challenge.content);
  });
}

/** Creates an immutable, create-only history record before a current challenge is replaced. */
export async function archiveCurrentChallenge(workspace: string, runId: string, purpose: PlanChallengePurpose, expectedRevision: number): Promise<string | null> {
  return withChallengeLock(workspace, runId, purpose, expectedRevision, async () => {
    const current = await readPlanArtifact(workspace, runId, challengeArtifact(purpose));
    if (current !== null) await archiveChallenge(workspace, runId, purpose, current);
    return current;
  });
}

/** Atomically records a consumed challenge after checking its persisted digest under the same revision lock. */
export async function consumeCurrentChallenge(workspace: string, runId: string, purpose: PlanChallengePurpose, challenge: ConsumedChallenge): Promise<void> {
  const parsed = parseChallenge(challenge.content);
  if (parsed.status !== "consumed" || parsed.purpose !== purpose || parsed.runId !== runId || parsed.challengeDigest !== challenge.challengeDigest || parsed.challengeDigest !== challenge.expectedChallengeDigest) {
    throw new PlanStorePathError("Persisted challenge is not a consumed challenge for this run and purpose.");
  }
  await withChallengeLock(workspace, runId, purpose, challenge.expectedRevision, async () => {
    const current = await readPlanArtifact(workspace, runId, challengeArtifact(purpose));
    if (current === null) throw new PlanStoreLockError("Persisted approval challenge changed before consumption.");
    const currentChallenge = parseChallenge(current);
    if (currentChallenge.status !== "pending" || currentChallenge.runId !== runId || currentChallenge.purpose !== purpose || currentChallenge.challengeDigest !== challenge.expectedChallengeDigest) {
      throw new PlanStoreLockError("Persisted approval challenge changed before consumption.");
    }
    await writePlanArtifact(workspace, runId, challengeArtifact(purpose), challenge.content);
  });
}

/** Validates the consumed current challenge and atomically creates its immutable final receipt under one revision lock. */
export async function writeFinalReceiptAtRevision(
  workspace: string,
  runId: string,
  purpose: PlanChallengePurpose,
  expectedRevision: number,
  content: string
): Promise<void> {
  const receipt = parseReceipt(content, purpose);
  await withChallengeLock(workspace, runId, purpose, expectedRevision, async () => {
    const current = await readPlanArtifact(workspace, runId, challengeArtifact(purpose));
    if (current === null) throw new PlanStoreLockError("Final receipt challenge is not the current persisted challenge.");
    const challenge = parseChallenge(current);
    if (challenge.runId !== runId || challenge.purpose !== purpose) {
      throw new PlanStoreLockError("Final receipt challenge is not coupled to this run and purpose.");
    }
    if (finalReceiptChallengeIssues(receipt, challenge).length > 0) {
      throw new PlanStoreLockError("Final receipt does not match a consumed current challenge.");
    }
    await writeCreateOnlyArtifact(workspace, runId, receiptArtifact(purpose), content);
  });
}

/** Creates a planner-local 256-bit receipt secret once, or reads its existing restrictive file. */
export async function loadOrCreateReceiptSecret(workspace: string, runId: string): Promise<string> {
  const artifact = "receipt-secret";
  await ensureSafeRunRoot(workspace, runId);
  const target = planArtifactPath(workspace, runId, artifact);
  await assertSafeArtifactPath(planRunPath(workspace, runId), target);
  try {
    const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(), 0o600);
    const secret = randomSuffix() + randomSuffix() + randomSuffix() + randomSuffix();
    try { await handle.writeFile(`${secret}\n`, "utf8"); } finally { await handle.close(); }
    await assertRestrictiveSecret(target);
    return secret;
  } catch (error) {
    if (!isCode(error, "EEXIST")) {
      if (isUnsafeOpen(error)) throw new PlanStorePathError();
      throw error;
    }
    const existing = await readReceiptSecret(workspace, runId);
    if (existing === null) throw new PlanStorePathError("Plan receipt secret disappeared during creation.");
    return existing;
  }
}

export async function readReceiptSecret(workspace: string, runId: string): Promise<string | null> {
  const artifact = "receipt-secret";
  const target = planArtifactPath(workspace, runId, artifact);
  await assertSafeRunRoot(workspace, runId, false);
  try {
    await assertRestrictiveSecret(target);
    const secret = (await readSafeFile(target)).trim();
    if (!/^[a-f0-9]{64}$/i.test(secret)) throw new PlanStorePathError("Receipt secret is invalid.");
    return secret;
  } catch (error) {
    if (isCode(error, "ENOENT")) return null;
    throw error;
  }
}

export const PLANNER_LOCAL_EVENT_SCHEMA_VERSION = "boulder.planner-local-event.v1";

export type PlanStoreSchemaMigration = Readonly<{
  from: string;
  to: string;
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>;
}>;

/**
 * Registry of persisted-record migrations. Scaffold: register future v(N)->v(N+1)
 * steps here so readers upgrade transparently instead of failing on unknown versions.
 */
export const PLAN_STORE_SCHEMA_MIGRATIONS: readonly PlanStoreSchemaMigration[] = [];

/** Rejects persisted records whose schemaVersion this build cannot reach. */
export function ensureSupportedSchemaVersion(schemaVersion: string): void {
  const reachable = schemaVersion === PLANNER_LOCAL_EVENT_SCHEMA_VERSION
    || PLAN_STORE_SCHEMA_MIGRATIONS.some((migration) => migration.from === schemaVersion || migration.to === schemaVersion);
  if (!reachable) throw new PlanStoreSchemaError(`Unsupported persisted schemaVersion: ${schemaVersion}`);
}

/** Applies registered migrations until the record reaches a supported schemaVersion. */
export function applyPlanStoreSchemaMigrations(raw: Record<string, unknown>): Record<string, unknown> {
  let value = raw;
  for (let guard = 0; guard <= PLAN_STORE_SCHEMA_MIGRATIONS.length; guard++) {
    const version = typeof value.schemaVersion === "string" ? value.schemaVersion : "";
    if (version === PLANNER_LOCAL_EVENT_SCHEMA_VERSION) return value;
    const step = PLAN_STORE_SCHEMA_MIGRATIONS.find((migration) => migration.from === version);
    if (!step) throw new PlanStoreSchemaError(`Unsupported persisted schemaVersion: ${version}`);
    value = step.migrate(value);
  }
  throw new PlanStoreSchemaError("Schema migration chain did not converge.");
}

export type PlannerLocalEvent = Readonly<{
  schemaVersion: "boulder.planner-local-event.v1";
  kind: "planner.preview.recommended" | "planner.state.transition" | "planner.error";
  status: "recommended" | "transitioned" | "failed";
  revision: number;
  occurredAt: string;
  artifactDigest?: string;
  durationMs?: number;
  errorId?: string;
}>;
export type PlannerLocalMetrics = Readonly<{
  questionCount: number;
  criticIterations: number;
  traceabilityLinks: number;
  sourceDriftCount: number;
}>;

/** Appends an exact, metadata-only local planner event. */
export async function appendPlannerLocalEvent(workspace: string, runId: string, event: PlannerLocalEvent): Promise<void> {
  validatePlannerLocalEvent(event);
  const content = `${JSON.stringify(event)}\n`;
  const runRoot = planRunPath(workspace, runId);
  const target = planArtifactPath(workspace, runId, "events.jsonl");
  await ensureSafeRunRoot(workspace, runId);
  await assertSafeArtifactPath(runRoot, target);
  const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | noFollowFlag(), 0o600);
  try { await handle.writeFile(content, "utf8"); } catch (error) {
    if (isUnsafeOpen(error)) throw new PlanStorePathError();
    throw error;
  } finally { await handle.close(); }
  await assertSafeArtifactPath(runRoot, target);
}

/** Writes only the planner's aggregate local metrics. */
export async function writePlannerLocalMetrics(workspace: string, runId: string, metrics: PlannerLocalMetrics): Promise<void> {
  if (Object.values(metrics).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new PlanStorePathError("Planner metrics must be non-negative integer aggregates.");
  }
  await writePlanMetrics(workspace, runId, metrics);
}

/** Replaces aggregate numeric metrics only; arbitrary text payloads cannot be persisted here. */
export async function writePlanMetrics(workspace: string, runId: string, metrics: Readonly<Record<string, number>>): Promise<void> {
  for (const [name, value] of Object.entries(metrics)) {
    if (!ARTIFACT_SEGMENT.test(name) || !Number.isFinite(value)) throw new PlanStorePathError("Plan metrics must be finite named aggregates.");
  }
  await writePlanArtifact(workspace, runId, "metrics.json", `${JSON.stringify({ metrics })}\n`);
}

async function withChallengeLock<T>(workspace: string, runId: string, purpose: PlanChallengePurpose, revision: number, operation: () => Promise<T>): Promise<T> {
  assertPurpose(purpose);
  const lock = { owner: `challenge-${purpose}`, revision };
  await acquirePlanLock(workspace, runId, lock);
  try { return await operation(); } finally { await releasePlanLock(workspace, runId, lock).catch(() => undefined); }
}

async function archiveChallenge(workspace: string, runId: string, purpose: PlanChallengePurpose, content: string): Promise<void> {
  const digest = challengeDigest(content);
  await writeCreateOnlyArtifact(workspace, runId, `history/${purpose}-${digest.slice("sha256:".length)}.json`, content);
}

async function writeCreateOnlyArtifact(workspace: string, runId: string, artifact: string, content: string): Promise<void> {
  const runRoot = planRunPath(workspace, runId);
  const target = planArtifactPath(workspace, runId, artifact);
  await ensureSafeRunRoot(workspace, runId);
  await ensureSafeArtifactDirectory(runRoot, target);
  await assertSafeArtifactPath(runRoot, target);
  try {
    const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(), 0o600);
    try { await handle.writeFile(content, "utf8"); } finally { await handle.close(); }
  } catch (error) {
    if (isCode(error, "EEXIST")) throw new PlanStoreLockError("Immutable plan artifact already exists.");
    if (isUnsafeOpen(error)) throw new PlanStorePathError();
    throw error;
  }
  await assertSafeArtifactPath(runRoot, target);
}

async function ensureSafeRunRoot(workspace: string, runId: string): Promise<void> {
  const root = resolve(workspace);
  const boulder = resolve(root, ".boulder");
  const plans = resolve(boulder, "plans");
  const runRoot = planRunPath(root, runId);
  await assertDirectory(root, true);
  await ensureDirectory(root, boulder);
  await ensureDirectory(root, plans);
  await ensureDirectory(root, runRoot);
  await assertSafeRunRoot(root, runId, true);
}

async function assertSafeRunRoot(workspace: string, runId: string, required: boolean): Promise<void> {
  const root = resolve(workspace);
  const boulder = resolve(root, ".boulder");
  const plans = resolve(boulder, "plans");
  const runRoot = planRunPath(root, runId);
  await assertDirectory(root, true);
  for (const path of [boulder, plans, runRoot]) await assertDirectory(path, required);
  if (!isContained(root, runRoot)) throw new PlanStorePathError();
}

async function ensureSafeArtifactDirectory(runRoot: string, target: string): Promise<void> {
  let current = runRoot;
  for (const segment of relative(runRoot, dirname(target)).split(/[\\/]/).filter(Boolean)) {
    current = resolve(current, segment);
    await ensureDirectory(runRoot, current);
  }
}

async function assertDirectory(path: string, required: boolean): Promise<void> {
  try {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new PlanStorePathError("Plan store directory is unsafe.");
  } catch (error) {
    if (!required && isCode(error, "ENOENT")) return;
    if (error instanceof PlanStorePathError) throw error;
    if (isCode(error, "ENOENT")) throw new PlanStorePathError("Plan store directory is missing.");
    throw error;
  }
}
async function ensureDirectory(root: string, path: string): Promise<void> {
  await assertDirectory(dirname(path), true);
  try { await mkdir(path); } catch (error) { if (!isCode(error, "EEXIST")) throw error; }
  await assertDirectory(path, true);
  if (path !== root && !isContained(root, path)) throw new PlanStorePathError();
}

async function assertSafeArtifactPath(runRoot: string, target: string, allowMissingParents = false): Promise<void> {
  if (!isContained(runRoot, target)) throw new PlanStorePathError();
  let current = runRoot;
  for (const segment of relative(runRoot, dirname(target)).split(/[\\/]/).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      await assertDirectory(current, true);
    } catch (error) {
      if (allowMissingParents && error instanceof PlanStorePathError && error.message === "Plan store directory is missing.") return;
      throw error;
    }
  }
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile() || info.nlink > 1) throw new PlanStorePathError();
  } catch (error) {
    if (error instanceof PlanStorePathError) throw error;
    if (!isCode(error, "ENOENT")) throw error;
  }
}

async function assertRestrictiveSecret(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile() || info.nlink > 1 || (info.mode & 0o077) !== 0) throw new PlanStorePathError("Receipt secret must be a private regular file.");
}

async function atomicReplace(path: string, content: string): Promise<void> {
  const temporary = `${path}.${temporarySequence += 1}.${randomSuffix()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(), 0o600);
    await handle.writeFile(content, "utf8");
    await handle.close();
    handle = null;
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    if (isUnsafeOpen(error)) throw new PlanStorePathError();
    throw error;
  } finally { await handle?.close(); }
}

async function readSafeFile(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | noFollowFlag());
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink > 1) throw new PlanStorePathError();
    return await handle.readFile("utf8");
  } catch (error) {
    if (isUnsafeOpen(error)) throw new PlanStorePathError();
    throw error;
  } finally { await handle.close(); }
}

function challengeArtifact(purpose: PlanChallengePurpose): string { assertPurpose(purpose); return `challenges/${purpose}.json`; }
function receiptArtifact(purpose: PlanChallengePurpose): string { assertPurpose(purpose); return `receipts/${purpose}.json`; }
function assertPurpose(purpose: string): asserts purpose is PlanChallengePurpose { if (!CHALLENGE_PURPOSES.has(purpose)) throw new PlanStorePathError("Approval purpose is invalid."); }
function challengeDigest(content: string): string { const value = parseRecord(content, "Persisted challenge must be JSON."); if (typeof value.challengeDigest !== "string" || value.challengeDigest.length === 0) throw new PlanStorePathError("Persisted challenge digest is invalid."); return value.challengeDigest; }
function parseChallenge(content: string): PendingApprovalChallenge {
  const value = parseRecord(content, "Persisted challenge must be JSON.");
  if (validatePendingApprovalChallenge(value).length > 0) throw new PlanStorePathError("Persisted challenge is invalid.");
  return value as PendingApprovalChallenge;
}
function parseReceipt(content: string, purpose: PlanChallengePurpose): PlanApprovalReceipt | ExecutionApprovalReceipt {
  const value = parseRecord(content, "Final receipt must be JSON.");
  const issues = purpose === "plan" ? validatePlanApprovalReceipt(value) : validateExecutionApprovalReceipt(value);
  if (issues.length > 0) throw new PlanStorePathError("Final receipt is invalid.");
  return value as PlanApprovalReceipt | ExecutionApprovalReceipt;
}
function parseRecord(content: string, message: string): Record<string, unknown> { try { const value: unknown = JSON.parse(content); if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>; } catch { throw new PlanStorePathError(message); } }
function validatePlannerLocalEvent(event: unknown): asserts event is PlannerLocalEvent {
  if (typeof event !== "object" || event === null || Array.isArray(event)) throw new PlanStorePathError("Planner event metadata is invalid.");
  const value = event as Record<string, unknown>;
  const allowed = new Set(["schemaVersion", "kind", "status", "revision", "occurredAt", "artifactDigest", "durationMs", "errorId"]);
  if (typeof value.schemaVersion === "string" && value.schemaVersion !== PLANNER_LOCAL_EVENT_SCHEMA_VERSION) {
    throw new PlanStoreSchemaError(`Unsupported persisted schemaVersion: ${value.schemaVersion}`);
  }
  if (Object.keys(value).some((key) => !allowed.has(key))
    || value.schemaVersion !== PLANNER_LOCAL_EVENT_SCHEMA_VERSION
    || !isPlannerEventKind(value.kind)
    || !isPlannerEventStatus(value.status)
    || !isMatchingPlannerEventStatus(value.kind, value.status)
    || !isNonNegativeInteger(value.revision)
    || !isCanonicalTimestamp(value.occurredAt)
    || (value.artifactDigest !== undefined && !isDigest(value.artifactDigest))
    || (value.durationMs !== undefined && !isNonNegativeInteger(value.durationMs))
    || (value.errorId !== undefined && (typeof value.errorId !== "string" || !ARTIFACT_SEGMENT.test(value.errorId)))) {
    throw new PlanStorePathError("Planner event metadata is invalid.");
  }
}
function isPlannerEventKind(value: unknown): value is PlannerLocalEvent["kind"] { return value === "planner.preview.recommended" || value === "planner.state.transition" || value === "planner.error"; }
function isPlannerEventStatus(value: unknown): value is PlannerLocalEvent["status"] { return value === "recommended" || value === "transitioned" || value === "failed"; }
function isNonNegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function isMatchingPlannerEventStatus(kind: PlannerLocalEvent["kind"], status: PlannerLocalEvent["status"]): boolean {
  return (kind === "planner.preview.recommended" && status === "recommended")
    || (kind === "planner.state.transition" && status === "transitioned")
    || (kind === "planner.error" && status === "failed");
}
function isCanonicalTimestamp(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === `${value.slice(0, -1)}.000Z`;
}
function isDigest(value: unknown): value is string { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value); }
function validLock(lock: PlanLock): boolean { return lock.owner.length > 0 && Number.isSafeInteger(lock.revision) && lock.revision >= 0; }
function isMatchingLock(value: unknown, expected: PlanLock): boolean { return typeof value === "object" && value !== null && (value as { owner?: unknown }).owner === expected.owner && (value as { revision?: unknown }).revision === expected.revision; }
function isContained(root: string, path: string): boolean { const relation = relative(root, path); return relation.length > 0 && !relation.startsWith("..") && !/^(?:[\\/]|[A-Za-z]:[\\/])/.test(relation); }
function noFollowFlag(): number { return typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0; }
function isUnsafeOpen(error: unknown): boolean { return isCode(error, "ELOOP") || isCode(error, "EMLINK"); }
function isCode(error: unknown, code: string): boolean { return error instanceof Error && Reflect.get(error, "code") === code; }
function randomSuffix(): string { return Array.from(crypto.getRandomValues(new Uint8Array(8))).map((item) => item.toString(16).padStart(2, "0")).join(""); }
