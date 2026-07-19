import { canonicalizePlanningValue, planningDigest } from "./planning-canonical.js";
import {
  canonicalApprovalSigningPayload,
  canonicalChallengeSigningPayload,
  createApprovalChallengeDigest,
  validatePendingApprovalChallenge,
  validatePlanApprovalReceipt,
  type PlanApprovalBindings,
  type PlanApprovalChallenge,
  type PlanApprovalReceipt
} from "./plan-receipts.js";
import {
  consumeApprovalChallenge,
  issueApprovalChallenge as persistApprovalChallenge,
  transitionPlanState,
  type PlanRunState
} from "./plan-state.js";

type HmacHasher = {
  update(input: string): HmacHasher;
  digest(encoding: "hex"): string;
};

const CryptoHasher = (Bun as typeof Bun & {
  readonly CryptoHasher: new (algorithm: "sha256", key?: string) => HmacHasher;
}).CryptoHasher;

export class PlanApprovalError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PlanApprovalError";
    this.code = code;
  }
}

export type PlannerLocalApprovalKey = {
  readonly secret: string;
  readonly keyVersion: string;
};

export type IssuePlanApprovalChallengeInput = {
  readonly state: PlanRunState;
  readonly expectedRevision: number;
  readonly key: PlannerLocalApprovalKey;
  readonly issuedBy: string;
  readonly challengeId: string;
  readonly nonce: string;
  readonly code: unknown;
  readonly createdAt: string;
};

export type ApprovePlanChallengeInput = {
  readonly state: PlanRunState;
  readonly expectedRevision: number;
  readonly key: PlannerLocalApprovalKey;
  readonly challengeDigest: string;
  readonly code: unknown;
  readonly approvedAt: string;
  readonly transitionDigest: string;
};

export function issuePlanApprovalChallenge(input: IssuePlanApprovalChallengeInput): {
  readonly challenge: PlanApprovalChallenge;
  readonly state: PlanRunState;
} {
  validateKey(input.key);
  const bindings = planBindings(input.state);
  const pending = {
    schemaVersion: "boulder.plan-approval-challenge.v1" as const,
    runId: input.state.runId,
    purpose: "plan" as const,
    createdAt: input.createdAt,
    challengeId: input.challengeId,
    status: "pending" as const,
    nonce: input.nonce,
    codeHash: `sha256:${hmacHex(input.key.secret, codePayload(input.state.runId, input.nonce, input.code))}`,
    keyVersion: input.key.keyVersion,
    issuedBy: input.issuedBy,
    bindings
  };
  const authenticatedChallenge = {
    ...pending,
    challengeDigest: createApprovalChallengeDigest(pending)
  };
  const challenge: PlanApprovalChallenge = {
    ...authenticatedChallenge,
    challengeMac: hmacHex(input.key.secret, canonicalChallengeSigningPayload(authenticatedChallenge))
  };
  const state = persistApprovalChallenge(input.state, {
    expectedRevision: input.expectedRevision,
    challenge,
    digest: planningDigest({ operation: "issue-plan-approval-challenge", challengeDigest: challenge.challengeDigest })
  });
  return { challenge, state };
}

export function approvePlanChallenge(input: ApprovePlanChallengeInput): {
  readonly receipt: PlanApprovalReceipt;
  readonly state: PlanRunState;
} {
  validateKey(input.key);
  const challenge = input.state.currentChallenges.plan;
  if (!challenge || challenge.challengeDigest !== input.challengeDigest || challenge.purpose !== "plan") {
    throw new PlanApprovalError("plan.approval.challenge_stale", "Plan approval challenge is not current.");
  }
  if (!verifyPlanApprovalChallenge(challenge, input.key)) {
    throw new PlanApprovalError("plan.approval.challenge_invalid", "Plan approval challenge authentication is invalid.");
  }
  if (challenge.status !== "pending" || !samePlanBindings(challenge.bindings, planBindings(input.state))) {
    throw new PlanApprovalError("plan.approval.challenge_stale", "Plan approval challenge authority is stale.");
  }
  if (challenge.keyVersion !== input.key.keyVersion || challenge.codeHash !== `sha256:${hmacHex(input.key.secret, codePayload(challenge.runId, challenge.nonce, input.code))}`) {
    throw new PlanApprovalError("plan.approval.code_invalid", "Plan approval code is invalid.");
  }
  const consumed = consumeApprovalChallenge(input.state, {
    expectedRevision: input.expectedRevision,
    purpose: "plan",
    challengeDigest: input.challengeDigest,
    digest: planningDigest({ operation: "consume-plan-approval-challenge", challengeDigest: input.challengeDigest })
  });
  const receiptWithoutSignature = {
    schemaVersion: "boulder.plan-approval.v1" as const,
    runId: challenge.runId,
    purpose: "plan" as const,
    challengeDigest: challenge.challengeDigest,
    nonce: challenge.nonce,
    codeHash: challenge.codeHash,
    keyVersion: challenge.keyVersion,
    bindings: challenge.bindings,
    approvedAt: input.approvedAt,
    approvalScope: "plan-only" as const,
    signaturePurpose: "boulder.plan.approval.v1" as const
  };
  const receipt: PlanApprovalReceipt = {
    ...receiptWithoutSignature,
    signature: hmacHex(input.key.secret, canonicalApprovalSigningPayload({ ...receiptWithoutSignature, signature: "0".repeat(64) }))
  };
  if (validatePlanApprovalReceipt(receipt).length > 0) throw new PlanApprovalError("plan.approval.receipt_invalid", "Plan approval receipt is invalid.");
  const state = transitionPlanState(consumed, {
    expectedRevision: consumed.stateRevision,
    status: "approved",
    digest: input.transitionDigest,
    approvalReceipt: receipt,
    authority: {
      ...consumed.authority,
      planApprovalDigest: planningDigest(receipt),
      planApprovalReceipt: receipt
    }
  });
  return { receipt, state };
}

export function verifyPlanApprovalChallenge(challenge: PlanApprovalChallenge, key: PlannerLocalApprovalKey): boolean {
  try {
    validateKey(key);
    return validatePendingApprovalChallenge(challenge).length === 0
      && challenge.purpose === "plan"
      && typeof challenge.challengeMac === "string"
      && constantTimeEqual(challenge.challengeMac, hmacHex(key.secret, canonicalChallengeSigningPayload(challenge)));
  } catch {
    return false;
  }
}

export function verifyPlanApprovalReceipt(receipt: PlanApprovalReceipt, key: PlannerLocalApprovalKey): boolean {
  try {
    validateKey(key);
    return validatePlanApprovalReceipt(receipt).length === 0
      && receipt.keyVersion === key.keyVersion
      && constantTimeEqual(receipt.signature, hmacHex(key.secret, canonicalApprovalSigningPayload(receipt)));
  } catch {
    return false;
  }
}

function planBindings(state: PlanRunState): PlanApprovalBindings {
  const authority = state.authority;
  if (state.status !== "awaiting-plan-approval" || !authority.packetDigest || !authority.structuralReviewDigest || !authority.semanticReviewDigest) {
    throw new PlanApprovalError("plan.approval.authority_stale", "Current passing plan reviews are required.");
  }
  return {
    packetDigest: authority.packetDigest,
    structuralReviewDigest: authority.structuralReviewDigest,
    semanticReviewDigest: authority.semanticReviewDigest,
    sourceDigest: state.sourceDigest
  };
}

function validateKey(key: PlannerLocalApprovalKey): void {
  if (!key || typeof key.secret !== "string" || key.secret.length === 0 || typeof key.keyVersion !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(key.keyVersion)) {
    throw new PlanApprovalError("plan.approval.key_invalid", "Planner-local approval key is invalid.");
  }
}

function codePayload(runId: string, nonce: string, code: unknown): string {
  return canonicalizePlanningValue({ domain: "boulder.plan.approval-code-hmac.v1", runId, nonce, code });
}

function hmacHex(secret: string, payload: string): string {
  return new CryptoHasher("sha256", secret).update(payload).digest("hex");
}

function samePlanBindings(left: PlanApprovalBindings, right: PlanApprovalBindings): boolean {
  return left.packetDigest === right.packetDigest
    && left.structuralReviewDigest === right.structuralReviewDigest
    && left.semanticReviewDigest === right.semanticReviewDigest
    && left.sourceDigest === right.sourceDigest;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
