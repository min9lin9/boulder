import type { V2Digest, V2Id, V2JsonValue } from "./contracts.js";

export const V2_DURABLE_WORK_REVISION_SCHEMA_VERSION = "boulder.v2.work-revision.v2" as const;
export const V2_DURABLE_WORK_ATTEMPT_SCHEMA_VERSION = "boulder.v2.work-attempt.v2" as const;
export const V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION = "boulder.v2.work-terminal.v2" as const;
export const V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION = "boulder.v2.work-completion.v1" as const;
export const V2_DURABLE_WORK_MAX_JSON_DEPTH = 32 as const;
export const V2_DURABLE_WORK_MAX_JSON_KEYS = 256 as const;
export const V2_DURABLE_WORK_MAX_ARRAY_ITEMS = 256 as const;
export const V2_DURABLE_WORK_MAX_STRING_LENGTH = 65_536 as const;
export const V2_DURABLE_WORK_MAX_EVIDENCE_DIGESTS = 256 as const;

export type V2WorkRunnerKind = "in-process" | "process";

export type V2DurableWorkRevisionBasis =
  | { readonly kind: "initial" }
  | {
      readonly kind: "critique";
      readonly critiqueDigest: V2Digest;
      readonly failedTerminalReceiptDigest: V2Digest;
    };

export interface V2DurableWorkRevision {
  readonly schemaVersion: typeof V2_DURABLE_WORK_REVISION_SCHEMA_VERSION;
  readonly workId: V2Id;
  readonly revision: number;
  readonly previousWorkRevisionDigest: V2Digest | null;
  readonly procedureDigest: V2Digest;
  readonly resolvedContract: V2JsonValue;
  readonly basis: V2DurableWorkRevisionBasis;
  readonly semanticDigest: V2Digest;
  readonly workRevisionDigest: V2Digest;
}

export interface V2DurableWorkAttempt {
  readonly schemaVersion: typeof V2_DURABLE_WORK_ATTEMPT_SCHEMA_VERSION;
  readonly workId: V2Id;
  readonly attemptId: V2Id;
  readonly attempt: number;
  readonly workRevisionDigest: V2Digest;
  readonly runnerKind: V2WorkRunnerKind;
  readonly sessionId: V2Id;
  readonly submissionKey: V2Digest;
}

interface V2DurableWorkTerminalBase {
  readonly schemaVersion: typeof V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION;
  readonly workId: V2Id;
  readonly workRevisionDigest: V2Digest;
  readonly attemptId: V2Id;
  readonly runtimeWorkId: V2Id;
  readonly terminalAt: string;
  readonly receiptDigest: V2Digest;
}

export type V2DurableWorkTerminalReceipt =
  | V2DurableWorkTerminalBase & {
      readonly status: "completed";
      readonly resultDigest: V2Digest;
      readonly evidenceDigests: readonly V2Digest[];
    }
  | V2DurableWorkTerminalBase & {
      readonly status: "failed";
      readonly failure: {
        readonly code: string;
        readonly retryable: boolean;
      };
    }
  | V2DurableWorkTerminalBase & {
      readonly status: "cancelled";
      readonly reasonCode: string;
    };

export interface V2DurableWorkCompletion {
  readonly schemaVersion: typeof V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION;
  readonly workId: V2Id;
  readonly terminalReceiptDigest: V2Digest;
  readonly sinkId: V2Id;
  readonly completionDigest: V2Digest;
}

export type V2DurableWorkReason =
  | "v2.work.id_invalid"
  | "v2.work.digest_invalid"
  | "v2.work.timestamp_invalid"
  | "v2.work.work_id_mismatch"
  | "v2.work.material_change_required"
  | "v2.work.retry_not_allowed"
  | "v2.work.receipt_binding_mismatch"
  | "v2.work.input_limit_exceeded"
  | "v2.work.terminal_receipt_required"
  | "v2.work.idempotency_conflict";

export type V2DurableWorkResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reasonCode: V2DurableWorkReason };
