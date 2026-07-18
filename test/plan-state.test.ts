import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { finalReceiptChallengeIssues, validatePendingApprovalChallenge, type ExecutionApprovalReceipt, type PendingApprovalChallenge, type PlanApprovalReceipt } from "../src/plan-receipts";
import {
  PlanStateError,
  consumeApprovalChallenge,
  createPlanRunState,
  invalidatePlanStateForSourceDrift,
  issueApprovalChallenge,
  transitionPlanState,
  validatePlanRunState
} from "../src/plan-state";
import { planningDigest } from "../src/planning-canonical";
import { consumeCurrentChallenge, readPlanArtifact, writeCurrentChallenge, writeFinalReceiptAtRevision } from "../src/plan-store";

const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
const source = digest("a");
const reviews = {
  packetDigest: digest("b"),
  structuralReviewDigest: digest("c"),
  semanticReviewDigest: digest("d")
};

function expectFailure(action: () => unknown, expected: string): void {
  try {
    action();
  } catch (error) {
    expect(error instanceof PlanStateError).toBe(true);
    expect((error as Error).message).toContain(expected);
    return;
  }
  throw new Error("Expected operation to fail.");
}

function planChallenge(): PendingApprovalChallenge {
  const base = {
    schemaVersion: "boulder.plan-approval-challenge.v1" as const,
    runId: "run-1",
    purpose: "plan" as const,
    createdAt: "2026-07-15T12:00:00.000Z",
    challengeId: "plan-challenge",
    status: "pending" as const,
    nonce: "nonce-1",
    codeHash: digest("1"),
    keyVersion: "key-1",
    issuedBy: "test",
    bindings: { ...reviews, sourceDigest: source }
  };
  return { ...base, challengeDigest: planningDigest(base) };
}

function executionChallenge(planApprovalDigest = digest("e")): PendingApprovalChallenge {
  const base = {
    schemaVersion: "boulder.execution-approval-challenge.v1" as const,
    runId: "run-1",
    purpose: "execution" as const,
    createdAt: "2026-07-15T12:00:00.000Z",
    challengeId: "execution-challenge",
    status: "pending" as const,
    nonce: "nonce-2",
    codeHash: digest("2"),
    keyVersion: "key-1",
    issuedBy: "test",
    bindings: { planningPacketDigest: reviews.packetDigest, planApprovalDigest, executionPacketDigest: digest("f"), sourceDigest: source }
  };
  return { ...base, challengeDigest: planningDigest(base) };
}

function receipt(challenge: PendingApprovalChallenge): PlanApprovalReceipt | ExecutionApprovalReceipt {
  if (challenge.purpose === "plan") {
    return {
      schemaVersion: "boulder.plan-approval.v1", runId: challenge.runId, purpose: "plan", challengeDigest: challenge.challengeDigest,
      nonce: challenge.nonce, codeHash: challenge.codeHash, keyVersion: challenge.keyVersion, bindings: challenge.bindings,
      approvedAt: "2026-07-15T12:01:00.000Z", approvalScope: "plan-only", signaturePurpose: "boulder.plan.approval.v1", signature: "0".repeat(64)
    };
  }
  return {
    schemaVersion: "boulder.execution-approval.v1", runId: challenge.runId, purpose: "execution", challengeDigest: challenge.challengeDigest,
    nonce: challenge.nonce, codeHash: challenge.codeHash, keyVersion: challenge.keyVersion, bindings: challenge.bindings,
    approvedAt: "2026-07-15T12:01:00.000Z", approvalScope: "execution-only", signaturePurpose: "boulder.execution.approval.v1", signature: "0".repeat(64)
  };
}

function awaitingPlanApproval() {
  let state = createPlanRunState({ runId: "run-1", sourceDigest: source });
  for (const status of ["analyzed", "ready-to-draft", "drafted", "reviewing", "awaiting-plan-approval"] as const) {
    state = transitionPlanState(state, { expectedRevision: state.stateRevision, status, digest: digest(`${state.stateRevision + 1}`), authority: reviews });
  }
  return state;
}

function approvedPlan() {
  let state = awaitingPlanApproval();
  const challenge = planChallenge();
  state = issueApprovalChallenge(state, { expectedRevision: state.stateRevision, challenge, digest: digest("6") });
  state = consumeApprovalChallenge(state, { expectedRevision: state.stateRevision, purpose: "plan", challengeDigest: challenge.challengeDigest, digest: digest("7") });
  const planReceipt = receipt(challenge) as PlanApprovalReceipt;
  return transitionPlanState(state, {
    expectedRevision: state.stateRevision, status: "approved", digest: digest("8"), approvalReceipt: planReceipt,
    authority: { ...reviews, planApprovalDigest: planningDigest(planReceipt), planApprovalReceipt: planReceipt }
  });
}

test("requires a matching consumed challenge and final receipt metadata for approval", () => {
  let state = awaitingPlanApproval();
  const challenge = planChallenge();
  state = issueApprovalChallenge(state, { expectedRevision: state.stateRevision, challenge, digest: digest("6") });
  const planReceipt = receipt(challenge) as PlanApprovalReceipt;
  expectFailure(() => transitionPlanState(state, {
    expectedRevision: state.stateRevision, status: "approved", digest: digest("7"), approvalReceipt: planReceipt,
    authority: { ...reviews, planApprovalDigest: digest("e"), planApprovalReceipt: planReceipt }
  }), "matching consumed");
  state = consumeApprovalChallenge(state, { expectedRevision: state.stateRevision, purpose: "plan", challengeDigest: challenge.challengeDigest, digest: digest("7") });
  expectFailure(() => transitionPlanState(state, {
    expectedRevision: state.stateRevision, status: "approved", digest: digest("8"), approvalReceipt: planReceipt,
    authority: { ...reviews, planApprovalDigest: digest("e") }
  }), "Final plan receipt");
});

test("requires execution approval before execution-ready and handed-off transitions", () => {
  let state = approvedPlan();
  state = transitionPlanState(state, { expectedRevision: state.stateRevision, status: "awaiting-execution-approval", digest: digest("9"), authority: { ...state.authority, executionPacketDigest: digest("f") } });
  expectFailure(() => transitionPlanState(state, { expectedRevision: state.stateRevision, status: "execution-approved", digest: digest("0"), authority: state.authority }), "matching consumed");
  const challenge = executionChallenge(state.authority.planApprovalDigest);
  state = issueApprovalChallenge(state, { expectedRevision: state.stateRevision, challenge, digest: digest("a") });
  state = consumeApprovalChallenge(state, { expectedRevision: state.stateRevision, purpose: "execution", challengeDigest: challenge.challengeDigest, digest: digest("b") });
  const executionReceipt = receipt(challenge) as ExecutionApprovalReceipt;
  state = transitionPlanState(state, { expectedRevision: state.stateRevision, status: "execution-approved", digest: digest("c"), approvalReceipt: executionReceipt, authority: { ...state.authority, executionApprovalDigest: planningDigest(executionReceipt), executionApprovalReceipt: executionReceipt } });
  state = transitionPlanState(state, { expectedRevision: state.stateRevision, status: "execution-packet-ready", digest: digest("d") });
  expect(state.status).toBe("execution-packet-ready");
  expect(transitionPlanState(state, { expectedRevision: state.stateRevision, status: "handed-off", digest: digest("e") }).status).toBe("handed-off");
});

test("rejects altered same-digest replay and terminal or mismatched authority challenges", () => {
  const state = createPlanRunState({ runId: "run-1", sourceDigest: source });
  const transition = { expectedRevision: 0, status: "analyzed" as const, digest: digest("1") };
  const next = transitionPlanState(state, transition);
  expect(transitionPlanState(next, transition)).toBe(next);
  expectFailure(() => transitionPlanState(next, { ...transition, sourceDigest: digest("2") }), "revision");
  expectFailure(() => issueApprovalChallenge(next, { expectedRevision: next.stateRevision, challenge: planChallenge(), digest: digest("3") }), "lifecycle");
  const awaiting = awaitingPlanApproval();
  const mismatched = planChallenge();
  const stale = { ...mismatched, bindings: { ...mismatched.bindings, sourceDigest: digest("4") } } as PendingApprovalChallenge;
  expectFailure(() => issueApprovalChallenge(awaiting, { expectedRevision: awaiting.stateRevision, challenge: stale, digest: digest("5") }), "invalid");
});

test("reviewed refresh clears source drift", () => {
  const drifted = invalidatePlanStateForSourceDrift(awaitingPlanApproval(), { expectedRevision: 5, sourceDigest: digest("7"), digest: digest("8") });
  expectFailure(() => transitionPlanState(drifted, { expectedRevision: drifted.stateRevision, status: "awaiting-plan-approval", digest: digest("9"), authority: reviews }), "reviewed refresh");
  const refreshed = transitionPlanState(drifted, { expectedRevision: drifted.stateRevision, status: "reviewing", digest: digest("0"), authority: reviews });
  expect(refreshed.sourceDrift).toBe(false);
  expect(validatePlanRunState(refreshed)).toEqual([]);
});
test("preserves a consumed challenge identity through state, storage, and final receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "boulder-plan-state-"));
  try {
    let state = awaitingPlanApproval();
    const challenge = planChallenge();
    state = issueApprovalChallenge(state, { expectedRevision: state.stateRevision, challenge, digest: digest("6") });
    const pendingContent = JSON.stringify(challenge);
    const consumedState = consumeApprovalChallenge(state, {
      expectedRevision: state.stateRevision,
      purpose: "plan",
      challengeDigest: challenge.challengeDigest,
      digest: digest("7")
    });
    const consumed = consumedState.currentChallenges.plan;
    expect(consumed?.challengeDigest).toBe(challenge.challengeDigest);
    expect(validatePendingApprovalChallenge(consumed)).toEqual([]);

    await writeCurrentChallenge(root, "run-1", "plan", {
      expectedRevision: 7,
      challengeDigest: challenge.challengeDigest,
      content: pendingContent
    });
    const consumedContent = JSON.stringify(consumed);
    await consumeCurrentChallenge(root, "run-1", "plan", {
      expectedRevision: 7,
      expectedChallengeDigest: challenge.challengeDigest,
      challengeDigest: challenge.challengeDigest,
      content: consumedContent
    });

    const planReceipt = receipt(challenge) as PlanApprovalReceipt;
    expect(finalReceiptChallengeIssues(planReceipt, consumed!)).toEqual([]);
    const receiptContent = JSON.stringify(planReceipt);
    await writeFinalReceiptAtRevision(root, "run-1", "plan", 7, receiptContent);
    expect(await readPlanArtifact(root, "run-1", "challenges/plan.json")).toBe(consumedContent);
    expect(await readPlanArtifact(root, "run-1", "receipts/plan.json")).toBe(receiptContent);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("revision invalidates old plan challenge and review authority", () => {
  let state = awaitingPlanApproval();
  const challenge = planChallenge();
  state = issueApprovalChallenge(state, { expectedRevision: state.stateRevision, challenge, digest: digest("6") });
  state = transitionPlanState(state, {
    expectedRevision: state.stateRevision,
    status: "revising",
    semanticRevision: state.semanticRevision + 1,
    digest: digest("7"),
    authority: reviews
  });
  expect(state.currentChallenges.plan).toBe(undefined);
  expect(state.authority).toEqual({});
  expect(state.challengeHistory.at(-1)?.status).toBe("invalidated");

  state = transitionPlanState(state, { expectedRevision: state.stateRevision, status: "drafted", digest: digest("8") });
  state = transitionPlanState(state, { expectedRevision: state.stateRevision, status: "reviewing", digest: digest("9"), authority: reviews });
  state = transitionPlanState(state, { expectedRevision: state.stateRevision, status: "awaiting-plan-approval", digest: digest("0") });
  expectFailure(() => issueApprovalChallenge(state, {
    expectedRevision: state.stateRevision,
    challenge,
    digest: digest("a")
  }), "not current");
  expectFailure(() => transitionPlanState(state, {
    expectedRevision: state.stateRevision,
    status: "approved",
    digest: digest("b"),
    approvalReceipt: receipt(challenge) as PlanApprovalReceipt,
    authority: { ...reviews, planApprovalDigest: digest("e"), planApprovalReceipt: receipt(challenge) as PlanApprovalReceipt }
  }), "matching consumed");
});
