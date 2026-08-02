import type { V2Digest, V2Id } from "./contracts.js";
import type { V2WorkRunnerKind } from "./work-durable-contracts.js";
import type { V2WorkEvent } from "./work-event-contracts.js";

export interface V2WorkReplayAttempt {
  readonly attemptId: V2Id;
  readonly attempt: number;
  readonly workRevisionDigest: V2Digest;
  readonly runnerKind: V2WorkRunnerKind;
  readonly sessionId: V2Id;
  readonly status: "running" | "completed" | "failed" | "cancelled";
  readonly acceptedAt?: string;
  readonly failureRetryable?: boolean;
  readonly terminalReceiptDigest?: V2Digest;
}

export interface V2WorkReplayApprovalRequest {
  readonly gateId: V2Id;
  readonly actionId: V2Id;
  readonly effectId: V2Id;
  readonly workRevisionDigest: V2Digest;
  readonly attemptId: V2Id;
}

export interface V2WorkReplayApproval extends V2WorkReplayApprovalRequest {
  readonly decision: "approved" | "denied";
  readonly authorityReceiptDigest: V2Digest;
}

export interface V2WorkReplayEffect {
  readonly effectId: V2Id;
  readonly operationKey: V2Digest;
  readonly boundary: "local" | "external";
  readonly role: "primary" | "compensation";
  readonly gateId: V2Id | null;
  readonly actionId: V2Id | null;
  readonly targetEffectReceiptDigest: V2Digest | null;
  readonly workRevisionDigest: V2Digest;
  readonly attemptId: V2Id;
  readonly checkpointDigest?: V2Digest;
  readonly outcome?: "committed" | "not-committed";
  readonly receiptDigest?: V2Digest;
}

export interface V2WorkReplayRecovery {
  readonly kind: "rollback" | "compensation";
  readonly targetEffectReceiptDigest: V2Digest;
  readonly outcome: "rolled-back" | "failed" | "committed";
  readonly receiptDigest: V2Digest;
}

export interface V2WorkReplayCompletion {
  readonly terminalReceiptDigest: V2Digest;
  readonly completionDigest: V2Digest;
  readonly sinkId: V2Id;
}

export interface V2WorkReplayState {
  readonly workId: V2Id;
  readonly status: "active" | "accepted" | "completed";
  readonly currentRevision: number;
  readonly currentRevisionDigest: V2Digest;
  readonly currentSemanticDigest: V2Digest;
  readonly attempts: readonly V2WorkReplayAttempt[];
  readonly approvalRequests: readonly V2WorkReplayApprovalRequest[];
  readonly approvals: readonly V2WorkReplayApproval[];
  readonly effects: readonly V2WorkReplayEffect[];
  readonly recoveries: readonly V2WorkReplayRecovery[];
  readonly completion: V2WorkReplayCompletion | null;
  readonly sequence: number;
  readonly headEventDigest: V2Digest;
}

export interface V2WorkReplayAnchor {
  readonly workId: V2Id;
  readonly rootRevisionDigest: V2Digest;
}

export interface V2WorkApprovalAuthentication extends V2WorkReplayApproval {
  readonly authorityReceiptDigest: V2Digest;
}

export interface V2WorkReplayOptions {
  readonly anchor: V2WorkReplayAnchor;
  readonly verifyEvent: (event: V2WorkEvent) => boolean | Promise<boolean>;
  readonly verifyApproval?: (
    approval: V2WorkApprovalAuthentication
  ) => boolean | Promise<boolean>;
}

export type V2WorkReplayReason =
  | "v2.work.revision_invalid"
  | "v2.work.revision_parent_mismatch"
  | "v2.work.attempt_number_invalid"
  | "v2.work.retry_revision_mismatch"
  | "v2.work.approval_required"
  | "v2.work.approval_binding_mismatch"
  | "v2.work.effect_claim_required"
  | "v2.work.effect_receipt_required"
  | "v2.work.receipt_binding_mismatch"
  | "v2.work.terminal_conflict"
  | "v2.work.critique_binding_mismatch"
  | "v2.work.recovery_required"
  | "v2.work.recovery_kind_mismatch"
  | "v2.work.idempotency_conflict"
  | "v2.work.anchor_required"
  | "v2.work.anchor_mismatch"
  | "v2.work.approval_authentication_required"
  | "v2.work.event_invalid";

export type V2WorkObservation =
  | {
      readonly kind: "runner";
      readonly runnerKind: V2WorkRunnerKind;
      readonly sessionId: V2Id;
      readonly status: "running" | "missing";
    }
  | {
      readonly kind: "runner";
      readonly runnerKind: V2WorkRunnerKind;
      readonly sessionId: V2Id;
      readonly status: "terminal";
      readonly terminalReceiptDigest: V2Digest;
    }
  | {
      readonly kind: "effect";
      readonly operationKey: V2Digest;
      readonly status: "committed";
      readonly receiptDigest: V2Digest;
    }
  | {
      readonly kind: "effect";
      readonly operationKey: V2Digest;
      readonly status: "absent" | "unknown" | "unavailable";
    };

export type V2WorkReconcileAction =
  | {
      readonly kind: "reattach";
      readonly workId: V2Id;
      readonly attemptId: V2Id;
      readonly attempt: number;
      readonly workRevisionDigest: V2Digest;
      readonly sessionId: V2Id;
    }
  | {
      readonly kind: "retry-same-revision";
      readonly workId: V2Id;
      readonly attemptId: V2Id;
      readonly attempt: number;
      readonly workRevisionDigest: V2Digest;
    }
  | {
      readonly kind: "record-runner-missing";
      readonly workId: V2Id;
      readonly attemptId: V2Id;
      readonly attempt: number;
      readonly workRevisionDigest: V2Digest;
      readonly runnerKind: V2WorkRunnerKind;
      readonly sessionId: V2Id;
      readonly failureCode: "runner.missing";
      readonly retryable: true;
    }
  | {
      readonly kind: "record-terminal";
      readonly workId: V2Id;
      readonly attemptId: V2Id;
      readonly attempt: number;
      readonly workRevisionDigest: V2Digest;
      readonly terminalReceiptDigest: V2Digest;
    }
  | {
      readonly kind: "record-effect-receipt";
      readonly workId: V2Id;
      readonly effectId: V2Id;
      readonly attemptId: V2Id;
      readonly workRevisionDigest: V2Digest;
      readonly operationKey: V2Digest;
      readonly boundary: "local" | "external";
      readonly actionId: V2Id | null;
      readonly outcome: "committed";
      readonly receiptDigest: V2Digest;
    }
  | {
      readonly kind: "dispatch-effect";
      readonly workId: V2Id;
      readonly effectId: V2Id;
      readonly attemptId: V2Id;
      readonly workRevisionDigest: V2Digest;
      readonly operationKey: V2Digest;
      readonly boundary: "local" | "external";
      readonly actionId: V2Id | null;
    }
  | { readonly kind: "wait"; readonly operationKey: V2Digest }
  | { readonly kind: "noop" };
