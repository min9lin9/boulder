import { digestV2 } from "./canonical.js";
import {
  isV2Digest,
  isV2Id,
  isV2Rfc3339Millis,
  type V2JsonValue
} from "./contracts.js";
import {
  V2_DURABLE_WORK_ATTEMPT_SCHEMA_VERSION,
  V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION,
  V2_DURABLE_WORK_MAX_JSON_DEPTH,
  V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
  V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION,
  type V2DurableWorkAttempt,
  type V2DurableWorkCompletion,
  type V2DurableWorkRevision,
  type V2DurableWorkTerminalReceipt
} from "./work-durable-contracts.js";

export const V2_DURABLE_WORK_MAX_COLLECTION_ITEMS = 256;
export const V2_DURABLE_WORK_MAX_STRING_BYTES = 64 * 1024;

export function exactInput(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
}

export function validRunnerKind(value: unknown): value is "in-process" | "process" {
  return value === "in-process" || value === "process";
}

export function cloneAndFreezeJsonBounded(
  value: unknown,
  depth = 0
): V2JsonValue | null {
  if (depth > V2_DURABLE_WORK_MAX_JSON_DEPTH) return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    return utf8Bytes(value) <= V2_DURABLE_WORK_MAX_STRING_BYTES ? value : null;
  }
  if (Array.isArray(value)) {
    if (value.length > V2_DURABLE_WORK_MAX_COLLECTION_ITEMS) return null;
    const items: V2JsonValue[] = [];
    for (const item of value) {
      const cloned = cloneAndFreezeJsonBounded(item, depth + 1);
      if (cloned === null && item !== null) return null;
      items.push(cloned);
    }
    return Object.freeze(items);
  }
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > V2_DURABLE_WORK_MAX_COLLECTION_ITEMS) return null;
  const clonedEntries: [string, V2JsonValue][] = [];
  for (const [key, item] of entries) {
    if (utf8Bytes(key) > V2_DURABLE_WORK_MAX_STRING_BYTES) return null;
    const cloned = cloneAndFreezeJsonBounded(item, depth + 1);
    if (cloned === null && item !== null) return null;
    clonedEntries.push([key, cloned]);
  }
  return Object.freeze(Object.fromEntries(clonedEntries));
}

export async function isCanonicalRevision(
  value: unknown
): Promise<boolean> {
  if (!exactInput(value, [
    "schemaVersion", "workId", "revision", "previousWorkRevisionDigest",
    "procedureDigest", "resolvedContract", "basis", "semanticDigest",
    "workRevisionDigest"
  ])) return false;
  if (
    value.schemaVersion !== V2_DURABLE_WORK_REVISION_SCHEMA_VERSION
    || !isV2Id(value.workId)
    || !Number.isInteger(value.revision) || Number(value.revision) < 1
    || !(value.previousWorkRevisionDigest === null
      || isV2Digest(value.previousWorkRevisionDigest))
    || !isV2Digest(value.procedureDigest)
    || !isV2Digest(value.semanticDigest)
    || !isV2Digest(value.workRevisionDigest)
    || !validBasis(value.basis)
  ) return false;
  const resolvedContract = cloneAndFreezeJsonBounded(value.resolvedContract);
  if (resolvedContract === null) return false;
  const semanticDigest = await digestV2("boulder.v2.work-semantic.v1", {
    procedureDigest: value.procedureDigest,
    resolvedContract
  });
  if (semanticDigest !== value.semanticDigest) return false;
  const workRevisionDigest = await digestV2(V2_DURABLE_WORK_REVISION_SCHEMA_VERSION, {
    schemaVersion: V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
    workId: value.workId,
    revision: Number(value.revision),
    previousWorkRevisionDigest: value.previousWorkRevisionDigest,
    procedureDigest: value.procedureDigest,
    resolvedContract,
    basis: value.basis as V2JsonValue,
    semanticDigest
  });
  return workRevisionDigest === value.workRevisionDigest;
}

export async function isCanonicalAttempt(
  value: unknown
): Promise<boolean> {
  if (!exactInput(value, [
    "schemaVersion", "workId", "attemptId", "attempt", "workRevisionDigest",
    "runnerKind", "sessionId", "submissionKey"
  ])) return false;
  if (
    value.schemaVersion !== V2_DURABLE_WORK_ATTEMPT_SCHEMA_VERSION
    || !isV2Id(value.workId) || !isV2Id(value.attemptId)
    || !Number.isInteger(value.attempt) || Number(value.attempt) < 1
    || !isV2Digest(value.workRevisionDigest)
    || !validRunnerKind(value.runnerKind)
    || !isV2Id(value.sessionId)
    || !isV2Digest(value.submissionKey)
  ) return false;
  return value.submissionKey === await digestV2("boulder.v2.work-submission.v1", {
    workRevisionDigest: value.workRevisionDigest,
    attemptId: value.attemptId,
    attempt: Number(value.attempt)
  });
}

export async function isCanonicalTerminal(
  value: unknown
): Promise<boolean> {
  const projection = terminalProjection(value);
  if (!projection || !isRecord(value) || !isV2Digest(value.receiptDigest)) return false;
  return value.receiptDigest === await digestV2(
    V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION,
    projection
  );
}

export async function isCanonicalCompletion(
  value: unknown
): Promise<boolean> {
  if (!exactInput(value, [
    "schemaVersion", "workId", "terminalReceiptDigest", "sinkId", "completionDigest"
  ])) return false;
  if (
    value.schemaVersion !== V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION
    || !isV2Id(value.workId)
    || !isV2Digest(value.terminalReceiptDigest)
    || !isV2Id(value.sinkId)
    || !isV2Digest(value.completionDigest)
  ) return false;
  return value.completionDigest === await digestV2(
    V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION,
    {
      schemaVersion: V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION,
      workId: value.workId,
      terminalReceiptDigest: value.terminalReceiptDigest,
      sinkId: value.sinkId
    }
  );
}

function terminalProjection(value: unknown): V2JsonValue | null {
  if (!isRecord(value)
    || value.schemaVersion !== V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION
    || !isV2Id(value.workId) || !isV2Digest(value.workRevisionDigest)
    || !isV2Id(value.attemptId) || !isV2Id(value.runtimeWorkId)
    || !isV2Rfc3339Millis(value.terminalAt)) return null;
  const base = {
    schemaVersion: V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION,
    workId: value.workId,
    workRevisionDigest: value.workRevisionDigest,
    attemptId: value.attemptId,
    runtimeWorkId: value.runtimeWorkId,
    terminalAt: value.terminalAt
  };
  if (value.status === "completed") {
    if (!exactInput(value, [
      ...Object.keys(base), "status", "resultDigest", "evidenceDigests", "receiptDigest"
    ]) || !isV2Digest(value.resultDigest)
      || !Array.isArray(value.evidenceDigests)
      || value.evidenceDigests.length > V2_DURABLE_WORK_MAX_COLLECTION_ITEMS
      || !value.evidenceDigests.every(isV2Digest)) return null;
    return { ...base, status: "completed", resultDigest: value.resultDigest,
      evidenceDigests: value.evidenceDigests };
  }
  if (value.status === "failed") {
    if (!exactInput(value, [
      ...Object.keys(base), "status", "failure", "receiptDigest"
    ]) || !exactInput(value.failure, ["code", "retryable"])
      || typeof value.failure.code !== "string" || value.failure.code.length === 0
      || utf8Bytes(value.failure.code) > V2_DURABLE_WORK_MAX_STRING_BYTES
      || typeof value.failure.retryable !== "boolean") return null;
    return { ...base, status: "failed", failure: value.failure as V2JsonValue };
  }
  if (value.status !== "cancelled"
    || !exactInput(value, [...Object.keys(base), "status", "reasonCode", "receiptDigest"])
    || typeof value.reasonCode !== "string" || value.reasonCode.length === 0) return null;
  return { ...base, status: "cancelled", reasonCode: value.reasonCode };
}

function validBasis(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "initial") return exactInput(value, ["kind"]);
  return value.kind === "critique"
    && exactInput(value, ["kind", "critiqueDigest", "failedTerminalReceiptDigest"])
    && isV2Digest(value.critiqueDigest)
    && isV2Digest(value.failedTerminalReceiptDigest);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
