import {
  isV2Digest,
  isV2Id,
  isV2Rfc3339Millis,
  type V2Digest,
  type V2Id,
  type V2JsonValue
} from "./contracts.js";
import { digestV2 } from "./canonical.js";

export const V2_WORK_REVISION_SCHEMA_VERSION = "boulder.v2.work-revision.v1" as const;
export const V2_WORK_ATTEMPT_SCHEMA_VERSION = "boulder.v2.work-attempt.v1" as const;
export const V2_WORK_ACCEPTED_SCHEMA_VERSION = "boulder.v2.work-accepted.v1" as const;
export const V2_WORK_TERMINAL_SCHEMA_VERSION = "boulder.v2.work-terminal.v1" as const;
export const V2_HUMAN_ANSWER_SCHEMA_VERSION = "boulder.v2.human-answer.v1" as const;
export const V2_PROCEDURE_AUTHORITY_RECEIPT_SCHEMA_VERSION = "boulder.v2.procedure-authority-receipt.v1" as const;

export interface V2WorkRevisionInput {
  readonly workId: V2Id;
  readonly revision: number;
  readonly procedureDigest: V2Digest;
  readonly resolvedContract: V2JsonValue;
}

export interface V2WorkRevision extends V2WorkRevisionInput {
  readonly schemaVersion: typeof V2_WORK_REVISION_SCHEMA_VERSION;
  readonly workRevisionDigest: V2Digest;
}

export interface V2WorkAttempt {
  readonly schemaVersion: typeof V2_WORK_ATTEMPT_SCHEMA_VERSION;
  readonly attemptId: V2Id;
  readonly attempt: number;
  readonly workRevisionDigest: V2Digest;
}

export interface V2WorkAcceptedReceipt {
  readonly schemaVersion: typeof V2_WORK_ACCEPTED_SCHEMA_VERSION;
  readonly attemptId: V2Id;
  readonly workRevisionDigest: V2Digest;
  readonly acceptedAt: string;
}

export interface V2WorkTerminalReceipt {
  readonly schemaVersion: typeof V2_WORK_TERMINAL_SCHEMA_VERSION;
  readonly attemptId: V2Id;
  readonly workRevisionDigest: V2Digest;
  readonly status: "completed" | "failed" | "cancelled";
  readonly terminalAt: string;
}

export interface V2HumanAnswer {
  readonly schemaVersion: typeof V2_HUMAN_ANSWER_SCHEMA_VERSION;
  readonly occurrenceId: V2Id;
  readonly answer: V2JsonValue;
  readonly answeredAt: string;
}

export interface V2ProcedureAuthorityBinding {
  readonly workRevisionDigest: V2Digest;
  readonly edgeId: V2Id;
  readonly policyDigest: V2Digest;
  readonly action: "complete-loop";
}

export interface V2ProcedureAuthorityReceipt extends V2ProcedureAuthorityBinding {
  readonly schemaVersion: typeof V2_PROCEDURE_AUTHORITY_RECEIPT_SCHEMA_VERSION;
  readonly approvalDigest: V2Digest;
}

export type V2WorkBuildResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reasonCode: string };

export async function createV2WorkRevision(input: V2WorkRevisionInput): Promise<V2WorkBuildResult<V2WorkRevision>> {
  if (!isV2Id(input.workId)) return { ok: false, reasonCode: "v2.work.id_invalid" };
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) return { ok: false, reasonCode: "v2.work.revision_invalid" };
  if (!isV2Digest(input.procedureDigest)) return { ok: false, reasonCode: "v2.work.procedure_digest_invalid" };
  const resolvedContract = freezeV2Json(cloneV2Json(input.resolvedContract));
  const projection = {
    schemaVersion: V2_WORK_REVISION_SCHEMA_VERSION,
    workId: input.workId,
    revision: input.revision,
    procedureDigest: input.procedureDigest,
    resolvedContract
  };
  const workRevisionDigest = await digestV2("boulder.v2.work-revision.v1", projection);
  return { ok: true, value: { ...projection, workRevisionDigest } };
}

export function createV2WorkAttempt(
  input: Omit<V2WorkAttempt, "schemaVersion">
): V2WorkBuildResult<V2WorkAttempt> {
  const keys = Object.keys(input).sort();
  const expected = ["attempt", "attemptId", "workRevisionDigest"];
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) {
    return { ok: false, reasonCode: "v2.work.attempt_invalid" };
  }
  if (!isV2Id(input.attemptId)) return { ok: false, reasonCode: "v2.work.id_invalid" };
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) return { ok: false, reasonCode: "v2.work.attempt_invalid" };
  if (!isV2Digest(input.workRevisionDigest)) return { ok: false, reasonCode: "v2.work.revision_digest_invalid" };
  return { ok: true, value: { schemaVersion: V2_WORK_ATTEMPT_SCHEMA_VERSION, ...input } };
}

export function isV2TerminalWorkReceipt(value: unknown): value is V2WorkTerminalReceipt {
  if (!isRecord(value) || value.schemaVersion !== V2_WORK_TERMINAL_SCHEMA_VERSION) return false;
  const keys = Object.keys(value).sort();
  const expected = ["attemptId", "schemaVersion", "status", "terminalAt", "workRevisionDigest"];
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index])
    && isV2Id(value.attemptId)
    && isV2Digest(value.workRevisionDigest)
    && (value.status === "completed" || value.status === "failed" || value.status === "cancelled")
    && isV2Rfc3339Millis(value.terminalAt);
}

export function evaluateV2ProcedureAuthority(
  required: V2ProcedureAuthorityBinding,
  value: unknown,
  verifyAuthorityReceipt: (receipt: V2ProcedureAuthorityReceipt) => boolean
): { readonly allowed: true } | { readonly allowed: false; readonly reasonCode: string } {
  if (!isRecord(value) || value.schemaVersion !== V2_PROCEDURE_AUTHORITY_RECEIPT_SCHEMA_VERSION) {
    return { allowed: false, reasonCode: "v2.work.approval_receipt_required" };
  }
  const keys = Object.keys(value).sort();
  const expected = ["action", "approvalDigest", "edgeId", "policyDigest", "schemaVersion", "workRevisionDigest"];
  if (keys.length !== expected.length
    || !keys.every((key, index) => key === expected[index])
    || !isV2Id(value.edgeId)
    || !isV2Digest(value.workRevisionDigest)
    || !isV2Digest(value.policyDigest)
    || value.action !== "complete-loop"
    || !isV2Digest(value.approvalDigest)) {
    return { allowed: false, reasonCode: "v2.work.approval_receipt_invalid" };
  }
  if (value.workRevisionDigest !== required.workRevisionDigest
    || value.edgeId !== required.edgeId
    || value.policyDigest !== required.policyDigest
    || value.action !== required.action) {
    return { allowed: false, reasonCode: "v2.work.authority_binding_mismatch" };
  }
  const receipt: V2ProcedureAuthorityReceipt = {
    schemaVersion: V2_PROCEDURE_AUTHORITY_RECEIPT_SCHEMA_VERSION,
    workRevisionDigest: value.workRevisionDigest,
    edgeId: value.edgeId,
    policyDigest: value.policyDigest,
    action: value.action,
    approvalDigest: value.approvalDigest
  };
  if (!verifyAuthorityReceipt(receipt)) return { allowed: false, reasonCode: "v2.work.approval_untrusted" };
  return { allowed: true };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneV2Json(value: V2JsonValue): V2JsonValue {
  if (Array.isArray(value)) return value.map((item) => cloneV2Json(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneV2Json(item)]));
  }
  return value;
}

function freezeV2Json(value: V2JsonValue): V2JsonValue {
  if (Array.isArray(value)) {
    for (const item of value) freezeV2Json(item);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freezeV2Json(item);
    return Object.freeze(value);
  }
  return value;
}
