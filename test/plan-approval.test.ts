import { expect, test } from "bun:test";
import { approvePlanChallenge, issuePlanApprovalChallenge, verifyPlanApprovalChallenge, verifyPlanApprovalReceipt, PlanApprovalError } from "../src/plan-approval";
import { createPlanRunState, transitionPlanState } from "../src/plan-state";

const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
const reviews = {
  packetDigest: digest("a"),
  structuralReviewDigest: digest("b"),
  semanticReviewDigest: digest("c")
};
const key = { secret: "planner-local-secret", keyVersion: "key-1" };

function awaitingApproval() {
  let state = createPlanRunState({ runId: "run-approval", sourceDigest: digest("d") });
  for (const status of ["analyzed", "ready-to-draft", "drafted", "reviewing", "awaiting-plan-approval"] as const) {
    state = transitionPlanState(state, {
      expectedRevision: state.stateRevision,
      status,
      digest: digest(String(state.stateRevision + 1)),
      authority: reviews
    });
  }
  return state;
}

function issue(state = awaitingApproval(), suffix = "1") {
  return issuePlanApprovalChallenge({
    state,
    expectedRevision: state.stateRevision,
    key,
    issuedBy: "local-planner",
    challengeId: `challenge-${suffix}`,
    nonce: `nonce-${suffix}`,
    code: { confirmation: `approve-${suffix}` },
    createdAt: "2026-07-15T12:00:00Z"
  });
}

test("issues a deterministic non-expiring challenge bound to current reviews and replaces the prior challenge", () => {
  const first = issue();
  const duplicate = issue(awaitingApproval());
  expect(first.challenge.codeHash).toBe(duplicate.challenge.codeHash);
  expect(first.challenge.challengeDigest).toBe(duplicate.challenge.challengeDigest);
  expect(first.challenge.challengeMac).toBe(duplicate.challenge.challengeMac);
  expect(first.challenge.challengeMac).toMatch(/^[a-f0-9]{64}$/);
  expect(first.challenge.challengeMac).toBe("fe6e7a11f33b5df6d232c93f1f3991e6a1b7869a71b300443b67efac6444cf26");
  expect("expiresAt" in first.challenge).toBe(false);
  const second = issue(first.state, "2");
  expect(second.state.challengeHistory).toHaveLength(1);
  expect(second.state.challengeHistory[0]?.invalidationReason).toBe("replaced");
  expect(second.state.currentChallenges.plan?.challengeDigest).toBe(second.challenge.challengeDigest);
});

test("approves only the plan after one valid code use and signs the final receipt", () => {
  const issued = issue();
  const approved = approvePlanChallenge({
    state: issued.state,
    expectedRevision: issued.state.stateRevision,
    key,
    challengeDigest: issued.challenge.challengeDigest,
    code: { confirmation: "approve-1" },
    approvedAt: "2026-07-15T12:01:00Z",
    transitionDigest: digest("e")
  });
  expect(approved.state.status).toBe("approved");
  expect(approved.receipt.approvalScope).toBe("plan-only");
  expect(approved.receipt.signature).toMatch(/^[a-f0-9]{64}$/);
  expect(verifyPlanApprovalReceipt(approved.receipt, key)).toBe(true);
  expect(verifyPlanApprovalReceipt({ ...approved.receipt, bindings: { ...approved.receipt.bindings, sourceDigest: digest("f") } }, key)).toBe(false);
  expect(verifyPlanApprovalReceipt(approved.receipt, { ...key, secret: "wrong-key" })).toBe(false);
  expect(approved.state.currentChallenges.plan?.status).toBe("consumed");
});

test("rejects replay, wrong codes, stale review authority, and execution-like approval", () => {
  const issued = issue();
  expectPlanError(() => approvePlanChallenge({
    state: issued.state,
    expectedRevision: issued.state.stateRevision,
    key,
    challengeDigest: issued.challenge.challengeDigest,
    code: { confirmation: "wrong" },
    approvedAt: "2026-07-15T12:01:00Z",
    transitionDigest: digest("e")
  }), "plan.approval.code_invalid");
  const approved = approvePlanChallenge({
    state: issued.state,
    expectedRevision: issued.state.stateRevision,
    key,
    challengeDigest: issued.challenge.challengeDigest,
    code: { confirmation: "approve-1" },
    approvedAt: "2026-07-15T12:01:00Z",
    transitionDigest: digest("e")
  });
  expectPlanError(() => approvePlanChallenge({
    state: approved.state,
    expectedRevision: approved.state.stateRevision,
    key,
    challengeDigest: issued.challenge.challengeDigest,
    code: { confirmation: "approve-1" },
    approvedAt: "2026-07-15T12:02:00Z",
    transitionDigest: digest("f")
  }), "plan.approval.challenge_invalid");
  const stale = { ...awaitingApproval(), authority: { ...reviews, semanticReviewDigest: digest("f") } };
  const staleIssue = issue(stale);
  expectPlanError(() => approvePlanChallenge({
    state: { ...staleIssue.state, authority: reviews },
    expectedRevision: staleIssue.state.stateRevision,
    key,
    challengeDigest: staleIssue.challenge.challengeDigest,
    code: { confirmation: "approve-1" },
    approvedAt: "2026-07-15T12:01:00Z",
    transitionDigest: digest("e")
  }), "plan.approval.challenge_stale");
});
test("rejects challenges whose authenticated authority fields are tampered or cross-purpose", () => {
  const issued = issue();
  expect(verifyPlanApprovalChallenge(issued.challenge, key)).toBe(true);
  expect(verifyPlanApprovalChallenge({ ...issued.challenge, status: "consumed" }, key)).toBe(false);
  expect(verifyPlanApprovalChallenge({ ...issued.challenge, nonce: "other-nonce" }, key)).toBe(false);
  expect(verifyPlanApprovalChallenge({ ...issued.challenge, codeHash: digest("9") }, key)).toBe(false);
  expect(verifyPlanApprovalChallenge({ ...issued.challenge, issuedBy: "other-planner" }, key)).toBe(false);
  expect(verifyPlanApprovalChallenge({ ...issued.challenge, bindings: { ...issued.challenge.bindings, sourceDigest: digest("9") } }, key)).toBe(false);
  expect(verifyPlanApprovalChallenge(issued.challenge, { ...key, secret: "wrong-key" })).toBe(false);
  expect(verifyPlanApprovalChallenge({ ...issued.challenge, purpose: "execution" } as never, key)).toBe(false);
  expectPlanError(() => approvePlanChallenge({
    state: {
      ...issued.state,
      currentChallenges: { ...issued.state.currentChallenges, plan: { ...issued.challenge, issuedBy: "other-planner" } }
    },
    expectedRevision: issued.state.stateRevision,
    key,
    challengeDigest: issued.challenge.challengeDigest,
    code: { confirmation: "approve-1" },
    approvedAt: "2026-07-15T12:01:00Z",
    transitionDigest: digest("e")
  }), "plan.approval.challenge_invalid");
});

function expectPlanError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error("Expected PlanApprovalError.");
  } catch (error) {
    expect(error instanceof PlanApprovalError && error.code).toBe(code);
  }
}
