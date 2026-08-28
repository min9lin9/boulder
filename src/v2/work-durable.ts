import { digestV2 } from "./canonical.js";
import {
  isV2Digest,
  isV2Id,
  isV2Rfc3339Millis,
  type V2Digest,
  type V2Id,
  type V2JsonValue
} from "./contracts.js";
import {
  V2_DURABLE_WORK_ATTEMPT_SCHEMA_VERSION,
  V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION,
  V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
  V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION,
  type V2DurableWorkAttempt,
  type V2DurableWorkCompletion,
  type V2DurableWorkReason,
  type V2DurableWorkResult,
  type V2DurableWorkRevision,
  type V2DurableWorkRevisionBasis,
  type V2DurableWorkTerminalReceipt,
  type V2WorkRunnerKind
} from "./work-durable-contracts.js";
import {
  cloneAndFreezeJsonBounded,
  exactInput,
  isCanonicalAttempt,
  isCanonicalCompletion,
  isCanonicalRevision,
  isCanonicalTerminal,
  validRunnerKind,
  V2_DURABLE_WORK_MAX_COLLECTION_ITEMS
} from "./work-durable-validation.js";

export * from "./work-durable-contracts.js";

type RevisionInput = {
  readonly workId: V2Id;
  readonly procedureDigest: V2Digest;
  readonly resolvedContract: V2JsonValue;
  readonly priorRevision?: V2DurableWorkRevision;
  readonly critique?: {
    readonly critiqueDigest: V2Digest;
    readonly failedTerminalReceiptDigest: V2Digest;
  };
};

type AttemptInput = {
  readonly workId: V2Id;
  readonly attemptId: V2Id;
  readonly attempt: number;
  readonly workRevisionDigest: V2Digest;
  readonly runnerKind: V2WorkRunnerKind;
  readonly sessionId: V2Id;
};

type TerminalInput = {
  readonly workId: V2Id;
  readonly workRevisionDigest: V2Digest;
  readonly attemptId: V2Id;
  readonly runtimeWorkId: V2Id;
  readonly terminalAt: string;
} & (
  | {
      readonly status: "completed";
      readonly resultDigest: V2Digest;
      readonly evidenceDigests: readonly V2Digest[];
    }
  | {
      readonly status: "failed";
      readonly failure: { readonly code: string; readonly retryable: boolean };
    }
  | { readonly status: "cancelled"; readonly reasonCode: string }
);

export async function createV2DurableWorkRevision(
  input: RevisionInput
): Promise<V2DurableWorkResult<V2DurableWorkRevision>> {
  if (!exactInput(input, ["workId", "procedureDigest", "resolvedContract"],
    ["priorRevision", "critique"])) return failure("v2.work.receipt_binding_mismatch");
  if (!isV2Id(input.workId)) return failure("v2.work.id_invalid");
  if (!isV2Digest(input.procedureDigest)) return failure("v2.work.digest_invalid");
  const resolvedContract = cloneAndFreezeJsonBounded(input.resolvedContract);
  if (resolvedContract === null) return failure("v2.work.input_limit_exceeded");
  const semanticDigest = await digestV2("boulder.v2.work-semantic.v1", {
    procedureDigest: input.procedureDigest,
    resolvedContract
  });
  const prior = input.priorRevision;
  if ((prior === undefined) !== (input.critique === undefined)) {
    return failure("v2.work.receipt_binding_mismatch");
  }
  if (prior && prior.workId !== input.workId) return failure("v2.work.work_id_mismatch");
  if (prior && !await isCanonicalRevision(prior)) {
    return failure("v2.work.receipt_binding_mismatch");
  }
  if (prior && semanticDigest === prior.semanticDigest) {
    return failure("v2.work.material_change_required");
  }
  if (input.critique && (
    !isV2Digest(input.critique.critiqueDigest)
    || !isV2Digest(input.critique.failedTerminalReceiptDigest)
  )) return failure("v2.work.digest_invalid");
  const basis: V2DurableWorkRevisionBasis = Object.freeze(input.critique
    ? {
        kind: "critique",
        critiqueDigest: input.critique.critiqueDigest,
        failedTerminalReceiptDigest: input.critique.failedTerminalReceiptDigest
      }
    : { kind: "initial" });
  const valueWithoutDigest = {
    schemaVersion: V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
    workId: input.workId,
    revision: prior ? prior.revision + 1 : 1,
    previousWorkRevisionDigest: prior?.workRevisionDigest ?? null,
    procedureDigest: input.procedureDigest,
    resolvedContract,
    basis,
    semanticDigest
  };
  const workRevisionDigest = await digestV2(
    V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
    valueWithoutDigest
  );
  return success(Object.freeze({ ...valueWithoutDigest, workRevisionDigest }));
}

export async function createV2DurableWorkAttempt(
  input: AttemptInput
): Promise<V2DurableWorkResult<V2DurableWorkAttempt>> {
  if (!exactInput(input, [
    "workId", "attemptId", "attempt", "workRevisionDigest", "runnerKind", "sessionId"
  ])) return failure("v2.work.receipt_binding_mismatch");
  if (!isV2Id(input.workId) || !isV2Id(input.attemptId) || !isV2Id(input.sessionId)) {
    return failure("v2.work.id_invalid");
  }
  if (!Number.isInteger(input.attempt) || input.attempt < 1) {
    return failure("v2.work.receipt_binding_mismatch");
  }
  if (!isV2Digest(input.workRevisionDigest)) return failure("v2.work.digest_invalid");
  if (!validRunnerKind(input.runnerKind)) return failure("v2.work.receipt_binding_mismatch");
  const submissionKey = await digestV2("boulder.v2.work-submission.v1", {
    workRevisionDigest: input.workRevisionDigest,
    attemptId: input.attemptId,
    attempt: input.attempt
  });
  return success(Object.freeze({
    schemaVersion: V2_DURABLE_WORK_ATTEMPT_SCHEMA_VERSION,
    workId: input.workId,
    attemptId: input.attemptId,
    attempt: input.attempt,
    workRevisionDigest: input.workRevisionDigest,
    runnerKind: input.runnerKind,
    sessionId: input.sessionId,
    submissionKey
  }));
}

export async function createV2DurableWorkTerminalReceipt(
  input: TerminalInput
): Promise<V2DurableWorkResult<V2DurableWorkTerminalReceipt>> {
  if (!isRecord(input)
    || !["completed", "failed", "cancelled"].includes(String(input.status))) {
    return failure("v2.work.receipt_binding_mismatch");
  }
  if (
    !isV2Id(input.workId) || !isV2Id(input.attemptId) || !isV2Id(input.runtimeWorkId)
  ) return failure("v2.work.id_invalid");
  if (!isV2Digest(input.workRevisionDigest)) return failure("v2.work.digest_invalid");
  if (!isV2Rfc3339Millis(input.terminalAt)) return failure("v2.work.timestamp_invalid");
  const base = {
    schemaVersion: V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION,
    workId: input.workId,
    workRevisionDigest: input.workRevisionDigest,
    attemptId: input.attemptId,
    runtimeWorkId: input.runtimeWorkId,
    terminalAt: input.terminalAt
  };
  let valueWithoutDigest:
    | Omit<Extract<V2DurableWorkTerminalReceipt, { status: "completed" }>, "receiptDigest">
    | Omit<Extract<V2DurableWorkTerminalReceipt, { status: "failed" }>, "receiptDigest">
    | Omit<Extract<V2DurableWorkTerminalReceipt, { status: "cancelled" }>, "receiptDigest">;
  if (input.status === "completed") {
    if (!exactInput(input, [
      "workId", "workRevisionDigest", "attemptId", "runtimeWorkId", "terminalAt",
      "status", "resultDigest", "evidenceDigests"
    ])) return failure("v2.work.receipt_binding_mismatch");
    if (!isV2Digest(input.resultDigest) || !Array.isArray(input.evidenceDigests)
      || input.evidenceDigests.length > V2_DURABLE_WORK_MAX_COLLECTION_ITEMS
      || !input.evidenceDigests.every(isV2Digest)) {
      return failure("v2.work.digest_invalid");
    }
    valueWithoutDigest = Object.freeze({
      ...base,
      status: "completed",
      resultDigest: input.resultDigest,
      evidenceDigests: Object.freeze([...input.evidenceDigests])
    });
  } else if (input.status === "failed") {
    if (!exactInput(input, [
      "workId", "workRevisionDigest", "attemptId", "runtimeWorkId", "terminalAt",
      "status", "failure"
    ])) return failure("v2.work.receipt_binding_mismatch");
    if (!isRecord(input.failure)
      || !exactInput(input.failure, ["code", "retryable"])
      || typeof input.failure.code !== "string"
      || input.failure.code.length === 0
      || typeof input.failure.retryable !== "boolean"
      || cloneAndFreezeJsonBounded(input.failure) === null) {
      return failure("v2.work.receipt_binding_mismatch");
    }
    valueWithoutDigest = Object.freeze({
      ...base,
      status: "failed",
      failure: Object.freeze({
        code: input.failure.code,
        retryable: input.failure.retryable
      })
    });
  } else {
    if (!exactInput(input, [
      "workId", "workRevisionDigest", "attemptId", "runtimeWorkId", "terminalAt",
      "status", "reasonCode"
    ])) return failure("v2.work.receipt_binding_mismatch");
    if (typeof input.reasonCode !== "string") {
      return failure("v2.work.receipt_binding_mismatch");
    }
    valueWithoutDigest = Object.freeze({
      ...base,
      status: "cancelled",
      reasonCode: input.reasonCode
    });
  }
  const receiptDigest = await digestV2(
    V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION,
    valueWithoutDigest
  );
  return success(Object.freeze({ ...valueWithoutDigest, receiptDigest }));
}

export async function retryV2DurableWorkAttempt(input: {
  readonly priorAttempt: V2DurableWorkAttempt;
  readonly failedReceipt: V2DurableWorkTerminalReceipt;
  readonly nextAttemptId: V2Id;
  readonly runnerKind: V2WorkRunnerKind;
  readonly sessionId: V2Id;
}): Promise<V2DurableWorkResult<V2DurableWorkAttempt>> {
  const { priorAttempt, failedReceipt } = input;
  if (!exactInput(input, [
    "priorAttempt", "failedReceipt", "nextAttemptId", "runnerKind", "sessionId"
  ]) || !await isCanonicalAttempt(priorAttempt)
    || !await isCanonicalTerminal(failedReceipt)) {
    return failure("v2.work.receipt_binding_mismatch");
  }
  if (failedReceipt.status !== "failed" || !failedReceipt.failure.retryable) {
    return failure("v2.work.retry_not_allowed");
  }
  if (
    failedReceipt.workId !== priorAttempt.workId
    || failedReceipt.workRevisionDigest !== priorAttempt.workRevisionDigest
    || failedReceipt.attemptId !== priorAttempt.attemptId
  ) return failure("v2.work.receipt_binding_mismatch");
  return createV2DurableWorkAttempt({
    workId: priorAttempt.workId,
    attemptId: input.nextAttemptId,
    attempt: priorAttempt.attempt + 1,
    workRevisionDigest: priorAttempt.workRevisionDigest,
    runnerKind: input.runnerKind,
    sessionId: input.sessionId
  });
}

export async function createV2DurableWorkCompletion(input: {
  readonly terminalReceipt: V2DurableWorkTerminalReceipt;
  readonly sinkId: V2Id;
  readonly priorCompletion?: V2DurableWorkCompletion;
}): Promise<
  | { readonly ok: true; readonly value: V2DurableWorkCompletion; readonly replayed: boolean }
  | { readonly ok: false; readonly reasonCode: V2DurableWorkReason }
> {
  if (!exactInput(input, ["terminalReceipt", "sinkId"], ["priorCompletion"])
    || !await isCanonicalTerminal(input.terminalReceipt)
    || (input.priorCompletion !== undefined
      && !await isCanonicalCompletion(input.priorCompletion))) {
    return failure("v2.work.receipt_binding_mismatch");
  }
  if (input.terminalReceipt.status !== "completed") {
    return failure("v2.work.terminal_receipt_required");
  }
  if (!isV2Id(input.sinkId)) return failure("v2.work.id_invalid");
  const valueWithoutDigest = {
    schemaVersion: V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION,
    workId: input.terminalReceipt.workId,
    terminalReceiptDigest: input.terminalReceipt.receiptDigest,
    sinkId: input.sinkId
  };
  const completionDigest = await digestV2(
    V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION,
    valueWithoutDigest
  );
  const value = Object.freeze({ ...valueWithoutDigest, completionDigest });
  if (!input.priorCompletion) return { ok: true, value, replayed: false };
  if (
    input.priorCompletion.schemaVersion === value.schemaVersion
    && input.priorCompletion.workId === value.workId
    && input.priorCompletion.terminalReceiptDigest === value.terminalReceiptDigest
    && input.priorCompletion.sinkId === value.sinkId
    && input.priorCompletion.completionDigest === value.completionDigest
  ) {
    return { ok: true, value: input.priorCompletion, replayed: true };
  }
  return failure("v2.work.idempotency_conflict");
}

function success<T>(value: T): V2DurableWorkResult<T> {
  return { ok: true, value };
}

function failure(reasonCode: V2DurableWorkReason): {
  readonly ok: false;
  readonly reasonCode: V2DurableWorkReason;
} {
  return { ok: false, reasonCode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
