import { expect, test } from "bun:test";
import { approveExecutionChallenge, ExecutionApprovalError, issueExecutionApprovalChallenge, verifyExecutionApprovalChallenge, verifyExecutionApprovalReceipt } from "../src/execution-approval";
import { approvePlanChallenge, issuePlanApprovalChallenge } from "../src/plan-approval";
import { createPlanRunState, transitionPlanState, type PlanRunState } from "../src/plan-state";

const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
const key = { secret: "planner-local-secret", keyVersion: "key-1" };
const reviews = { packetDigest: digest("a"), structuralReviewDigest: digest("b"), semanticReviewDigest: digest("c") };

function awaitingExecutionApproval(): PlanRunState {
  let state = createPlanRunState({ runId: "run-execution", sourceDigest: digest("d") });
  for (const status of ["analyzed", "ready-to-draft", "drafted", "reviewing", "awaiting-plan-approval"] as const) {
    state = transitionPlanState(state, { expectedRevision: state.stateRevision, status, digest: digest(String(state.stateRevision + 1)), authority: reviews });
  }
  const planChallenge = issuePlanApprovalChallenge({
    state, expectedRevision: state.stateRevision, key, issuedBy: "local-planner", challengeId: "plan-challenge", nonce: "plan-nonce", code: { confirmation: "plan" }, createdAt: "2026-07-15T12:00:00Z"
  });
  const planApproval = approvePlanChallenge({
    state: planChallenge.state, expectedRevision: planChallenge.state.stateRevision, key, challengeDigest: planChallenge.challenge.challengeDigest, code: { confirmation: "plan" }, approvedAt: "2026-07-15T12:01:00Z", transitionDigest: digest("e")
  });
  return transitionPlanState(planApproval.state, {
    expectedRevision: planApproval.state.stateRevision,
    status: "awaiting-execution-approval",
    digest: digest("f"),
    authority: { ...planApproval.state.authority, executionPacketDigest: digest("9") }
  });
}

function issue(state = awaitingExecutionApproval(), suffix = "1") {
  return issueExecutionApprovalChallenge({
    state, expectedRevision: state.stateRevision, key, issuedBy: "local-executor", challengeId: `execution-challenge-${suffix}`, nonce: `execution-nonce-${suffix}`, code: { confirmation: `execute-${suffix}` }, createdAt: "2026-07-15T12:02:00Z"
  });
}

test("issues a deterministic non-expiring execution challenge bound to current execution authority", () => {
  const first = issue();
  const duplicate = issue(awaitingExecutionApproval());
  expect(first.challenge.challengeDigest).toBe(duplicate.challenge.challengeDigest);
  expect(first.challenge.challengeMac).toBe(duplicate.challenge.challengeMac);
  expect(first.challenge.bindings).toEqual({ planningPacketDigest: digest("a"), planApprovalDigest: first.state.authority.planApprovalDigest, executionPacketDigest: digest("9"), sourceDigest: digest("d") });
  expect("expiresAt" in first.challenge).toBe(false);
  const replacement = issue(first.state, "2");
  expect(replacement.state.challengeHistory).toHaveLength(1);
  expect(replacement.state.challengeHistory[0]?.invalidationReason).toBe("replaced");
});

test("requires a separate execution approval and consumes its challenge exactly once", () => {
  const issued = issue();
  const approved = approveExecutionChallenge({
    state: issued.state, expectedRevision: issued.state.stateRevision, key, challengeDigest: issued.challenge.challengeDigest, code: { confirmation: "execute-1" }, approvedAt: "2026-07-15T12:03:00Z", transitionDigest: digest("8")
  });
  expect(approved.state.status).toBe("execution-approved");
  expect(approved.receipt.approvalScope).toBe("execution-only");
  expect(approved.receipt.bindings.planApprovalDigest).toBe(issued.state.authority.planApprovalDigest);
  expect(verifyExecutionApprovalReceipt(approved.receipt, key)).toBe(true);
  expect(approved.state.currentChallenges.execution?.status).toBe("consumed");
  expectExecutionError(() => approveExecutionChallenge({
    state: approved.state, expectedRevision: approved.state.stateRevision, key, challengeDigest: issued.challenge.challengeDigest, code: { confirmation: "execute-1" }, approvedAt: "2026-07-15T12:04:00Z", transitionDigest: digest("7")
  }), "plan.approval.challenge_invalid");
});

test("rejects wrong code, stale authority, tampering, key rotation, and cross-purpose artifacts", () => {
  const issued = issue();
  expectExecutionError(() => approveExecutionChallenge({
    state: issued.state, expectedRevision: issued.state.stateRevision, key, challengeDigest: issued.challenge.challengeDigest, code: { confirmation: "wrong" }, approvedAt: "2026-07-15T12:03:00Z", transitionDigest: digest("8")
  }), "plan.approval.code_invalid");
  expect(verifyExecutionApprovalChallenge(issued.challenge, key)).toBe(true);
  expect(verifyExecutionApprovalChallenge({ ...issued.challenge, bindings: { ...issued.challenge.bindings, sourceDigest: digest("7") } }, key)).toBe(false);
  expect(verifyExecutionApprovalChallenge({ ...issued.challenge, purpose: "plan" } as never, key)).toBe(false);
  expect(verifyExecutionApprovalChallenge(issued.challenge, { ...key, keyVersion: "key-2" })).toBe(false);
  expect(verifyExecutionApprovalReceipt({
    schemaVersion: "boulder.execution-approval.v1", runId: issued.challenge.runId, purpose: "execution", challengeDigest: issued.challenge.challengeDigest, nonce: issued.challenge.nonce, codeHash: issued.challenge.codeHash, keyVersion: issued.challenge.keyVersion, bindings: issued.challenge.bindings, approvedAt: "2026-07-15T12:03:00Z", approvalScope: "execution-only", signaturePurpose: "boulder.execution.approval.v1", signature: "0".repeat(64)
  }, key)).toBe(false);
  const staleState = { ...issued.state, authority: { ...issued.state.authority, executionPacketDigest: digest("7") } };
  expectExecutionError(() => approveExecutionChallenge({
    state: staleState, expectedRevision: staleState.stateRevision, key, challengeDigest: issued.challenge.challengeDigest, code: { confirmation: "execute-1" }, approvedAt: "2026-07-15T12:03:00Z", transitionDigest: digest("8")
  }), "plan.approval.challenge_stale");
});

function expectExecutionError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error("Expected ExecutionApprovalError.");
  } catch (error) {
    expect(error instanceof ExecutionApprovalError && error.code).toBe(code);
  }
}
