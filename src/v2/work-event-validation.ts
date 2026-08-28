import { canonicalizeV2, digestV2 } from "./canonical.js";
import {
  isV2Digest,
  isV2Id,
  isV2Rfc3339Millis,
  type V2Digest,
  type V2JsonValue
} from "./contracts.js";
import {
  V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION,
  V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
  V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION
} from "./work-durable-contracts.js";
import { cloneAndFreezeJsonBounded } from "./work-durable-validation.js";
import {
  V2_WORK_EVENT_KINDS,
  V2_WORK_EVENT_SCHEMA_VERSION,
  type V2WorkEvent,
  type V2WorkEventData,
  type V2WorkEventInput,
  type V2WorkEventKind,
  type V2WorkEventReason,
  type V2WorkEventResult
} from "./work-event-contracts.js";

export async function buildV2WorkEvent(
  input: V2WorkEventInput
): Promise<V2WorkEventResult<V2WorkEvent>> {
  if (!validInput(input) || !validData(input.kind, input.data)
    || !await validBoundData(input)) {
    return failure("v2.work.event_invalid");
  }
  const data = cloneAndFreezeJsonBounded(input.data);
  if (!data || Array.isArray(data) || typeof data !== "object") {
    return failure("v2.work.event_invalid");
  }
  const valueWithoutDigest: Omit<V2WorkEvent, "eventDigest"> = {
    schemaVersion: V2_WORK_EVENT_SCHEMA_VERSION,
    eventId: input.eventId,
    sequence: input.sequence,
    occurredAt: input.occurredAt,
    workId: input.workId,
    workRevisionDigest: input.workRevisionDigest,
    previousEventDigest: input.previousEventDigest,
    kind: input.kind,
    data: data as V2WorkEventData
  };
  const eventDigest = await digestV2(V2_WORK_EVENT_SCHEMA_VERSION, valueWithoutDigest);
  return success(Object.freeze({ ...valueWithoutDigest, eventDigest }));
}

export async function parseV2WorkEventValue(
  value: unknown
): Promise<V2WorkEventResult<V2WorkEvent>> {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "eventId", "sequence", "occurredAt", "workId",
    "workRevisionDigest", "previousEventDigest", "kind", "data", "eventDigest"
  ])) return failure("v2.work.event_invalid");
  if (
    value.schemaVersion !== V2_WORK_EVENT_SCHEMA_VERSION
    || !isV2Id(value.eventId)
    || !Number.isInteger(value.sequence) || Number(value.sequence) < 1
    || !isV2Rfc3339Millis(value.occurredAt)
    || !isV2Id(value.workId)
    || !isV2Digest(value.workRevisionDigest)
    || !(value.previousEventDigest === null || isV2Digest(value.previousEventDigest))
    || !isKind(value.kind)
    || !isRecord(value.data)
    || !isV2Digest(value.eventDigest)
  ) return failure("v2.work.event_invalid");
  const data = jsonRecord(value.data);
  if (!data || !validData(value.kind, data)) return failure("v2.work.event_invalid");
  const input: V2WorkEventInput = {
    eventId: value.eventId,
    sequence: Number(value.sequence),
    occurredAt: value.occurredAt,
    workId: value.workId,
    workRevisionDigest: value.workRevisionDigest,
    previousEventDigest: value.previousEventDigest,
    kind: value.kind,
    data
  };
  const computed = await buildV2WorkEvent(input);
  if (!computed.ok) return computed;
  if (computed.value.eventDigest !== value.eventDigest) {
    return failure("v2.work.event_digest_invalid");
  }
  return success(computed.value);
}

export function canonicalizeV2WorkEvent(event: V2WorkEvent): string {
  return canonicalizeV2(eventProjection(event));
}

function validInput(input: V2WorkEventInput): boolean {
  return isRecord(input)
    && hasExactKeys(input, [
      "eventId", "sequence", "occurredAt", "workId", "workRevisionDigest",
      "previousEventDigest", "kind", "data"
    ])
    && isV2Id(input.eventId)
    && Number.isInteger(input.sequence) && input.sequence > 0
    && isV2Rfc3339Millis(input.occurredAt)
    && isV2Id(input.workId)
    && isV2Digest(input.workRevisionDigest)
    && (input.previousEventDigest === null || isV2Digest(input.previousEventDigest))
    && isKind(input.kind)
    && isRecord(input.data);
}

function validData(kind: V2WorkEventKind, data: V2WorkEventData): boolean {
  switch (kind) {
    case "revision-created":
      return validRevisionData(data);
    case "attempt-started":
      return exact(data, ["attemptId", "attempt", "runnerKind", "sessionId"])
        && isV2Id(data.attemptId) && positive(data.attempt)
        && (data.runnerKind === "in-process" || data.runnerKind === "process")
        && isV2Id(data.sessionId);
    case "attempt-accepted":
      return exact(data, ["attemptId", "acceptedAt"])
        && isV2Id(data.attemptId) && isV2Rfc3339Millis(data.acceptedAt);
    case "approval-requested":
      return exact(data, ["gateId", "actionId", "effectId", "attemptId"])
        && isV2Id(data.gateId) && isV2Id(data.actionId)
        && isV2Id(data.effectId) && isV2Id(data.attemptId);
    case "approval-recorded":
      return exact(data, [
        "gateId", "actionId", "effectId", "attemptId", "decision", "authorityReceiptDigest"
      ]) && isV2Id(data.gateId) && isV2Id(data.actionId)
        && isV2Id(data.effectId) && isV2Id(data.attemptId)
        && (data.decision === "approved" || data.decision === "denied")
        && isV2Digest(data.authorityReceiptDigest);
    case "effect-claimed":
      return validEffectClaim(data);
    case "effect-receipt-recorded":
      return exact(data, [
        "effectId", "attemptId", "operationKey", "boundary", "outcome", "receiptDigest"
      ])
        && isV2Id(data.effectId) && isV2Digest(data.operationKey)
        && isV2Id(data.attemptId)
        && (data.boundary === "local" || data.boundary === "external")
        && (data.outcome === "committed" || data.outcome === "not-committed")
        && isV2Digest(data.receiptDigest);
    case "attempt-terminal":
      return validTerminalData(data);
    case "critique-recorded":
      return exact(data, ["critiqueDigest", "requiresMaterialChange"])
        && isV2Digest(data.critiqueDigest) && data.requiresMaterialChange === true;
    case "rollback-recorded":
      return exact(data, [
        "targetEffectReceiptDigest", "checkpointDigest", "receiptDigest", "outcome"
      ]) && isV2Digest(data.targetEffectReceiptDigest)
        && isV2Digest(data.checkpointDigest) && isV2Digest(data.receiptDigest)
        && (data.outcome === "rolled-back" || data.outcome === "failed");
    case "completion-recorded":
      return exact(data, ["terminalReceiptDigest", "completionDigest", "sinkId"])
        && isV2Digest(data.terminalReceiptDigest)
        && isV2Digest(data.completionDigest) && isV2Id(data.sinkId);
  }
}

async function validBoundData(input: V2WorkEventInput): Promise<boolean> {
  if (input.kind === "revision-created") {
    const resolvedContract = cloneAndFreezeJsonBounded(input.data.resolvedContract);
    if (resolvedContract === null) return false;
    const semanticDigest = await digestV2("boulder.v2.work-semantic.v1", {
      procedureDigest: input.data.procedureDigest as V2Digest,
      resolvedContract
    });
    if (semanticDigest !== input.data.semanticDigest) return false;
    const workRevisionDigest = await digestV2(
      V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
      {
        schemaVersion: V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
        workId: input.workId,
        revision: input.data.revision as number,
        previousWorkRevisionDigest: input.data.previousWorkRevisionDigest as V2Digest | null,
        procedureDigest: input.data.procedureDigest as V2Digest,
        resolvedContract,
        basis: input.data.basis as V2JsonValue,
        semanticDigest
      }
    );
    return workRevisionDigest === input.workRevisionDigest;
  }
  if (input.kind === "approval-recorded") {
    const authorityReceiptDigest = await digestV2("boulder.v2.work-approval.v1", {
      workId: input.workId,
      workRevisionDigest: input.workRevisionDigest,
      attemptId: input.data.attemptId as string,
      gateId: input.data.gateId as string,
      actionId: input.data.actionId as string,
      effectId: input.data.effectId as string,
      decision: input.data.decision as string
    });
    return authorityReceiptDigest === input.data.authorityReceiptDigest;
  }
  if (input.kind === "attempt-terminal") {
    const terminalReceiptDigest = await digestV2(
      V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION,
      terminalProjection(input)
    );
    return terminalReceiptDigest === input.data.terminalReceiptDigest;
  }
  if (input.kind === "completion-recorded") {
    const completionDigest = await digestV2(
      V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION,
      {
        schemaVersion: V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION,
        workId: input.workId,
        terminalReceiptDigest: input.data.terminalReceiptDigest as V2Digest,
        sinkId: input.data.sinkId as string
      }
    );
    return completionDigest === input.data.completionDigest;
  }
  return true;
}

function validRevisionData(data: V2WorkEventData): boolean {
  if (!exact(data, [
    "revision", "previousWorkRevisionDigest", "procedureDigest",
    "resolvedContract", "basis", "semanticDigest"
  ]) || !positive(data.revision)
    || !(data.previousWorkRevisionDigest === null
      || isV2Digest(data.previousWorkRevisionDigest))
    || !isV2Digest(data.procedureDigest)
    || cloneAndFreezeJsonBounded(data.resolvedContract) === null
    || !isV2Digest(data.semanticDigest)
    || !isRecord(data.basis)) return false;
  if (data.revision === 1) {
    return exact(data.basis, ["kind"]) && data.basis.kind === "initial";
  }
  return exact(data.basis, [
    "kind", "critiqueDigest", "failedTerminalReceiptDigest"
  ]) && data.basis.kind === "critique"
    && isV2Digest(data.basis.critiqueDigest)
    && isV2Digest(data.basis.failedTerminalReceiptDigest);
}

function validTerminalData(data: V2WorkEventData): boolean {
  const common = ["attemptId", "status", "terminalReceiptDigest", "runtimeWorkId", "terminalAt"];
  if (!isV2Id(data.attemptId) || !isV2Digest(data.terminalReceiptDigest)
    || !isV2Id(data.runtimeWorkId) || !isV2Rfc3339Millis(data.terminalAt)) return false;
  if (data.status === "completed") {
    return exact(data, [...common, "resultDigest", "evidenceDigests"])
      && isV2Digest(data.resultDigest)
      && Array.isArray(data.evidenceDigests) && data.evidenceDigests.every(isV2Digest);
  }
  if (data.status === "failed") {
    return exact(data, [...common, "failureCode", "retryable"])
      && typeof data.failureCode === "string" && data.failureCode.length > 0
      && typeof data.retryable === "boolean";
  }
  return data.status === "cancelled"
    && exact(data, [...common, "reasonCode"])
    && typeof data.reasonCode === "string" && data.reasonCode.length > 0;
}

function terminalProjection(input: V2WorkEventInput): V2JsonValue {
  const base = {
    schemaVersion: V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION,
    workId: input.workId,
    workRevisionDigest: input.workRevisionDigest,
    attemptId: input.data.attemptId as string,
    runtimeWorkId: input.data.runtimeWorkId as string,
    terminalAt: input.data.terminalAt as string
  };
  if (input.data.status === "completed") {
    return {
      ...base,
      status: "completed",
      resultDigest: input.data.resultDigest as V2Digest,
      evidenceDigests: input.data.evidenceDigests as readonly V2Digest[]
    };
  }
  if (input.data.status === "failed") {
    return {
      ...base,
      status: "failed",
      failure: {
        code: input.data.failureCode as string,
        retryable: input.data.retryable as boolean
      }
    };
  }
  return {
    ...base,
    status: "cancelled",
    reasonCode: input.data.reasonCode as string
  };
}

function validEffectClaim(data: V2WorkEventData): boolean {
  const requiredKeys = [
    "gateId", "actionId", "effectId", "operationKey", "boundary", "role",
    "targetEffectReceiptDigest"
  ];
  if (!required(data, requiredKeys) || !only(data, [...requiredKeys, "checkpointDigest"])) {
    return false;
  }
  if (
    !(data.gateId === null || isV2Id(data.gateId))
    || !(data.actionId === null || isV2Id(data.actionId))
    || !isV2Id(data.effectId) || !isV2Digest(data.operationKey)
    || !(data.boundary === "local" || data.boundary === "external")
    || !(data.role === "primary" || data.role === "compensation")
    || !(data.targetEffectReceiptDigest === null || isV2Digest(data.targetEffectReceiptDigest))
  ) return false;
  if (data.boundary === "external" && (data.gateId === null || data.actionId === null)) {
    return false;
  }
  if (data.boundary === "local" && (data.gateId !== null || data.actionId !== null)) {
    return false;
  }
  return data.checkpointDigest === undefined || isV2Digest(data.checkpointDigest);
}

function eventProjection(event: V2WorkEvent): V2JsonValue {
  return {
    schemaVersion: event.schemaVersion,
    eventId: event.eventId,
    sequence: event.sequence,
    occurredAt: event.occurredAt,
    workId: event.workId,
    workRevisionDigest: event.workRevisionDigest,
    previousEventDigest: event.previousEventDigest,
    kind: event.kind,
    data: event.data,
    eventDigest: event.eventDigest
  };
}

function jsonRecord(value: Record<string, unknown>): V2WorkEventData | null {
  const result = cloneAndFreezeJsonBounded(value);
  return result && !Array.isArray(result) && typeof result === "object"
    ? result as V2WorkEventData
    : null;
}

function isKind(value: unknown): value is V2WorkEventKind {
  return typeof value === "string" && V2_WORK_EVENT_KINDS.some((kind) => kind === value);
}

function positive(value: V2JsonValue | undefined): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function exact(data: V2WorkEventData, keys: readonly string[]): boolean {
  return hasExactKeys(data, keys);
}

function required(data: V2WorkEventData, keys: readonly string[]): boolean {
  return keys.every((key) => Object.hasOwn(data, key));
}

function only(data: V2WorkEventData, keys: readonly string[]): boolean {
  return Object.keys(data).every((key) => keys.includes(key));
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function success<T>(value: T): V2WorkEventResult<T> {
  return { ok: true, value };
}

function failure(reasonCode: V2WorkEventReason): {
  readonly ok: false;
  readonly reasonCode: V2WorkEventReason;
} {
  return { ok: false, reasonCode };
}
