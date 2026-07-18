import { canonicalizePlanningValue, planningDigest } from "./planning-canonical.js";
import {
  canonicalApprovalSigningPayload,
  canonicalChallengeSigningPayload,
  createApprovalChallengeDigest,
  validateExecutionApprovalReceipt,
  validatePendingApprovalChallenge,
  validatePlanApprovalReceipt,
  type ExecutionApprovalBindings,
  type ExecutionApprovalChallenge,
  type ExecutionApprovalReceipt
} from "./plan-receipts.js";
import {
  consumeApprovalChallenge,
  issueApprovalChallenge as persistApprovalChallenge,
  transitionPlanState,
  type PlanRunState
} from "./plan-state.js";
import type { PlannerLocalApprovalKey } from "./plan-approval.js";

type HmacHasher = {
  update(input: string): HmacHasher;
  digest(encoding: "hex"): string;
};

const CryptoHasher = (Bun as typeof Bun & {
  readonly CryptoHasher: new (algorithm: "sha256", key?: string) => HmacHasher;
}).CryptoHasher;

export class ExecutionApprovalError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ExecutionApprovalError";
    this.code = code;
  }
}

export type IssueExecutionApprovalChallengeInput = {
  readonly state: PlanRunState;
  readonly expectedRevision: number;
  readonly key: PlannerLocalApprovalKey;
  readonly issuedBy: string;
  readonly challengeId: string;
  readonly nonce: string;
  readonly code: unknown;
  readonly createdAt: string;
};

export type ApproveExecutionChallengeInput = {
  readonly state: PlanRunState;
  readonly expectedRevision: number;
  readonly key: PlannerLocalApprovalKey;
  readonly challengeDigest: string;
  readonly code: unknown;
  readonly approvedAt: string;
  readonly transitionDigest: string;
};

export function issueExecutionApprovalChallenge(input: IssueExecutionApprovalChallengeInput): {
  readonly challenge: ExecutionApprovalChallenge;
  readonly state: PlanRunState;
} {
  validateKey(input.key);
  const bindings = executionBindings(input.state);
  const pending = {
    schemaVersion: "boulder.execution-approval-challenge.v1" as const,
    runId: input.state.runId,
    purpose: "execution" as const,
    createdAt: input.createdAt,
    challengeId: input.challengeId,
    status: "pending" as const,
    nonce: input.nonce,
    codeHash: `sha256:${hmacHex(input.key.secret, codePayload(input.state.runId, input.nonce, input.code))}`,
    keyVersion: input.key.keyVersion,
    issuedBy: input.issuedBy,
    bindings
  };
  const authenticatedChallenge = { ...pending, challengeDigest: createApprovalChallengeDigest(pending) };
  const challenge: ExecutionApprovalChallenge = {
    ...authenticatedChallenge,
    challengeMac: hmacHex(input.key.secret, canonicalChallengeSigningPayload(authenticatedChallenge))
  };
  const state = persistApprovalChallenge(input.state, {
    expectedRevision: input.expectedRevision,
    challenge,
    digest: planningDigest({ operation: "issue-execution-approval-challenge", challengeDigest: challenge.challengeDigest })
  });
  return { challenge, state };
}

export function approveExecutionChallenge(input: ApproveExecutionChallengeInput): {
  readonly receipt: ExecutionApprovalReceipt;
  readonly state: PlanRunState;
} {
  validateKey(input.key);
  const challenge = input.state.currentChallenges.execution;
  if (!challenge || challenge.challengeDigest !== input.challengeDigest || challenge.purpose !== "execution") {
    throw new ExecutionApprovalError("plan.approval.challenge_stale", "Execution approval challenge is not current.");
  }
  if (!verifyExecutionApprovalChallenge(challenge, input.key)) {
    throw new ExecutionApprovalError("plan.approval.challenge_invalid", "Execution approval challenge authentication is invalid.");
  }
  if (challenge.status !== "pending" || !sameExecutionBindings(challenge.bindings, executionBindings(input.state))) {
    throw new ExecutionApprovalError("plan.approval.challenge_stale", "Execution approval challenge authority is stale.");
  }
  if (challenge.keyVersion !== input.key.keyVersion || challenge.codeHash !== `sha256:${hmacHex(input.key.secret, codePayload(challenge.runId, challenge.nonce, input.code))}`) {
    throw new ExecutionApprovalError("plan.approval.code_invalid", "Execution approval code is invalid.");
  }
  const consumed = consumeApprovalChallenge(input.state, {
    expectedRevision: input.expectedRevision,
    purpose: "execution",
    challengeDigest: input.challengeDigest,
    digest: planningDigest({ operation: "consume-execution-approval-challenge", challengeDigest: input.challengeDigest })
  });
  const receiptWithoutSignature = {
    schemaVersion: "boulder.execution-approval.v1" as const,
    runId: challenge.runId,
    purpose: "execution" as const,
    challengeDigest: challenge.challengeDigest,
    nonce: challenge.nonce,
    codeHash: challenge.codeHash,
    keyVersion: challenge.keyVersion,
    bindings: challenge.bindings,
    approvedAt: input.approvedAt,
    approvalScope: "execution-only" as const,
    signaturePurpose: "boulder.execution.approval.v1" as const
  };
  const receipt: ExecutionApprovalReceipt = {
    ...receiptWithoutSignature,
    signature: hmacHex(input.key.secret, canonicalApprovalSigningPayload({ ...receiptWithoutSignature, signature: "0".repeat(64) }))
  };
  if (validateExecutionApprovalReceipt(receipt).length > 0) throw new ExecutionApprovalError("plan.approval.receipt_invalid", "Execution approval receipt is invalid.");
  const state = transitionPlanState(consumed, {
    expectedRevision: consumed.stateRevision,
    status: "execution-approved",
    digest: input.transitionDigest,
    approvalReceipt: receipt,
    authority: {
      ...consumed.authority,
      executionApprovalDigest: planningDigest(receipt),
      executionApprovalReceipt: receipt
    }
  });
  return { receipt, state };
}

export function verifyExecutionApprovalChallenge(challenge: ExecutionApprovalChallenge, key: PlannerLocalApprovalKey): boolean {
  try {
    validateKey(key);
    return validatePendingApprovalChallenge(challenge).length === 0
      && challenge.purpose === "execution"
      && challenge.keyVersion === key.keyVersion
      && typeof challenge.challengeMac === "string"
      && constantTimeEqual(challenge.challengeMac, hmacHex(key.secret, canonicalChallengeSigningPayload(challenge)));
  } catch {
    return false;
  }
}

export function verifyExecutionApprovalReceipt(receipt: ExecutionApprovalReceipt, key: PlannerLocalApprovalKey): boolean {
  try {
    validateKey(key);
    return validateExecutionApprovalReceipt(receipt).length === 0
      && receipt.keyVersion === key.keyVersion
      && constantTimeEqual(receipt.signature, hmacHex(key.secret, canonicalApprovalSigningPayload(receipt)));
  } catch {
    return false;
  }
}

function executionBindings(state: PlanRunState): ExecutionApprovalBindings {
  const authority = state.authority;
  if (state.status !== "awaiting-execution-approval"
    || !authority.packetDigest
    || !authority.planApprovalDigest
    || !authority.executionPacketDigest
    || !authority.planApprovalReceipt
    || validatePlanApprovalReceipt(authority.planApprovalReceipt).length > 0
    || planningDigest(authority.planApprovalReceipt) !== authority.planApprovalDigest) {
    throw new ExecutionApprovalError("plan.approval.authority_stale", "Current plan approval and execution packet are required.");
  }
  return {
    planningPacketDigest: authority.packetDigest,
    planApprovalDigest: authority.planApprovalDigest,
    executionPacketDigest: authority.executionPacketDigest,
    sourceDigest: state.sourceDigest
  };
}

function validateKey(key: PlannerLocalApprovalKey): void {
  if (!key || typeof key.secret !== "string" || key.secret.length === 0 || typeof key.keyVersion !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(key.keyVersion)) {
    throw new ExecutionApprovalError("plan.approval.key_invalid", "Planner-local approval key is invalid.");
  }
}

function codePayload(runId: string, nonce: string, code: unknown): string {
  return canonicalizePlanningValue({ domain: "boulder.execution.approval-code-hmac.v1", runId, nonce, code });
}

function hmacHex(secret: string, payload: string): string {
  return new CryptoHasher("sha256", secret).update(payload).digest("hex");
}

function sameExecutionBindings(left: ExecutionApprovalBindings, right: ExecutionApprovalBindings): boolean {
  return left.planningPacketDigest === right.planningPacketDigest
    && left.planApprovalDigest === right.planApprovalDigest
    && left.executionPacketDigest === right.executionPacketDigest
    && left.sourceDigest === right.sourceDigest;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
