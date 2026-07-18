import { readFile } from "node:fs/promises";
import { expect, test } from "bun:test";
import { planningDigest } from "../src/planning-canonical";
import {
  canonicalApprovalSigningPayload,
  canonicalChallengeSigningPayload,
  canonicalCodeHash,
  finalReceiptChallengeIssues,
  challengeConsumptionIssues,
  receiptMatchesChallenge,
  validateApprovalChallengeHistory,
  validateExecutionApprovalReceipt,
  validatePendingApprovalChallenge,
  validatePlanApprovalReceipt,
  type ExecutionApprovalChallenge,
  type PlanApprovalChallenge,
  type PlanApprovalReceipt
} from "../src/plan-receipts";

const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
const canonicalChallengeDigest = (challenge: Record<string, unknown>) => {
  const { challengeDigest: _challengeDigest, ...digestInput } = challenge;
  return planningDigest(digestInput);
};

const planChallengeBase = {
  schemaVersion: "boulder.plan-approval-challenge.v1",
  runId: "run-1",
  purpose: "plan",
  createdAt: "2026-07-15T12:00:00Z",
  challengeId: "challenge-1",
  status: "pending",
  nonce: "nonce-1",
  codeHash: digest("b"),
  keyVersion: "key-1",
  issuedBy: "plan-review",
  bindings: { packetDigest: digest("c"), structuralReviewDigest: digest("d"), semanticReviewDigest: digest("e"), sourceDigest: digest("f") }
} as const;
const planChallenge: PlanApprovalChallenge = {
  ...planChallengeBase,
  challengeDigest: canonicalChallengeDigest(planChallengeBase)
};

test("validates non-expiring plan challenges and rejects unknown purpose/schema", () => {
  expect(validatePendingApprovalChallenge(planChallenge)).toEqual([]);
  const expired = { ...planChallenge, expiresAt: "2026-07-16T12:00:00Z" };
  expect(validatePendingApprovalChallenge(expired).map((item) => item.id)).toEqual(["plan.approval.challenge_invalid"]);
  expect(validatePendingApprovalChallenge({ ...planChallenge, challengeMac: "a".repeat(64) })).toEqual([]);
  expect(validatePendingApprovalChallenge({ ...planChallenge, challengeMac: "invalid" }).map((item) => item.path)).toEqual(["challengeMac"]);
  expect(validatePendingApprovalChallenge({ ...planChallenge, purpose: "external" }).map((item) => item.id)).toEqual(["plan.approval.challenge_invalid"]);
});

test("consumption is purpose and binding separated, never time based", () => {
  expect(challengeConsumptionIssues(planChallenge, {
    runId: "run-1",
    purpose: "plan",
    keyVersion: "key-1",
    bindings: planChallenge.bindings
  })).toEqual([]);
  const mismatched = challengeConsumptionIssues(planChallenge, {
    runId: "run-1",
    purpose: "execution",
    keyVersion: "key-1",
    bindings: planChallenge.bindings
  });
  expect(mismatched.map((item) => item.id)).toEqual(["plan.approval.challenge_stale"]);
  expect(challengeConsumptionIssues({ ...planChallenge, status: "consumed" }, {
    runId: "run-1", purpose: "plan", keyVersion: "key-1", bindings: planChallenge.bindings
  }).map((item) => item.id)).toEqual(["plan.approval.challenge_consumed"]);
});

test("validates plan and execution receipts with non-transitive scopes", () => {
  const planReceipt: PlanApprovalReceipt = {
    schemaVersion: "boulder.plan-approval.v1",
    runId: "run-1",
    purpose: "plan",
    challengeDigest: planChallenge.challengeDigest,
    nonce: planChallenge.nonce,
    codeHash: planChallenge.codeHash,
    keyVersion: planChallenge.keyVersion,
    bindings: planChallenge.bindings,
    approvedAt: "2026-07-15T12:00:00Z",
    approvalScope: "plan-only",
    signaturePurpose: "boulder.plan.approval.v1",
    signature: "a".repeat(64)
  };
  expect(validatePlanApprovalReceipt(planReceipt)).toEqual([]);
  expect(receiptMatchesChallenge(planReceipt, planChallenge)).toBe(true);
  expect(validatePlanApprovalReceipt({ ...planReceipt, approvalScope: "execution-only" }).length).toBeGreaterThan(0);

  const executionChallengeBase = {
    ...planChallengeBase,
    schemaVersion: "boulder.execution-approval-challenge.v1",
    purpose: "execution",
    bindings: { planningPacketDigest: digest("c"), planApprovalDigest: digest("d"), executionPacketDigest: digest("e"), sourceDigest: digest("f") }
  } as const;
  const executionChallenge: ExecutionApprovalChallenge = {
    ...executionChallengeBase,
    challengeDigest: canonicalChallengeDigest(executionChallengeBase)
  };
  const executionReceipt = {
    schemaVersion: "boulder.execution-approval.v1",
    runId: "run-1",
    purpose: "execution",
    challengeDigest: executionChallenge.challengeDigest,
    nonce: "nonce-1",
    codeHash: digest("b"),
    keyVersion: "key-1",
    bindings: executionChallenge.bindings,
    approvedAt: "2026-07-15T12:00:00Z",
    approvalScope: "execution-only",
    signaturePurpose: "boulder.execution.approval.v1",
    signature: "a".repeat(64)
  };
  expect(validateExecutionApprovalReceipt(executionReceipt)).toEqual([]);
  expect(receiptMatchesChallenge(planReceipt, executionChallenge)).toBe(false);
});

test("history binds an exact immutable pending challenge and only records final transitions", () => {
  const history = {
    schemaVersion: "boulder.approval-challenge-history.v1",
    previousChallenge: planChallenge,
    previousStatus: "pending",
    status: "invalidated",
    transitionedAt: "2026-07-15T12:00:00Z",
    invalidationReason: "replaced",
    immutable: true
  };
  expect(validateApprovalChallengeHistory(history)).toEqual([]);

  const tampered = {
    ...history,
    previousChallenge: { ...planChallenge, bindings: { ...planChallenge.bindings, sourceDigest: digest("9") } }
  };
  expect(validateApprovalChallengeHistory(tampered)).toEqual([{
    id: "plan.approval.challenge_history_invalid",
    path: "previousChallenge.challengeDigest",
    message: "Challenge digest does not match canonical content."
  }]);
  expect(validateApprovalChallengeHistory({ ...history, previousStatus: "consumed" }).map((item) => item.path)).toEqual(["previousStatus"]);
  expect(validateApprovalChallengeHistory({ ...history, status: "consumed", invalidationReason: undefined })).toEqual([]);
});
test("pins purpose-separated canonical signing payload and domain-bound code-hash golden vectors", async () => {
  const vectors = JSON.parse(await readFile("fixtures/plan-receipts/vectors.json", "utf8")) as {
    readonly payloads: Record<string, string>;
  };
  const code = {
    files: [{ path: "src/example.ts", content: "export const answer = 42;" }],
    revision: "v1"
  };
  const expectedPlanCodeHash = "sha256:1e849e065672fe030f4d614148a38355b982051df352542918cec63042f69847";
  const expectedExecutionCodeHash = "sha256:721982cad4a5f122ee824391ce235032e345161fe64dcd0bd73085698799ebe7";
  const goldenPlanChallenge = {
    ...planChallengeBase,
    runId: "run-golden",
    challengeId: "challenge-golden",
    nonce: "nonce-golden",
    keyVersion: "key-golden",
    challengeDigest: digest("a")
  };
  const goldenExecutionChallenge = {
    ...goldenPlanChallenge,
    schemaVersion: "boulder.execution-approval-challenge.v1",
    purpose: "execution",
    bindings: { planningPacketDigest: digest("c"), planApprovalDigest: digest("d"), executionPacketDigest: digest("e"), sourceDigest: digest("f") }
  };
  const goldenPlanApproval = {
    ...goldenPlanChallenge,
    schemaVersion: "boulder.plan-approval.v1",
    approvedAt: "2026-07-15T12:30:00Z",
    approvalScope: "plan-only",
    signaturePurpose: "boulder.plan.approval.v1",
    signature: "0".repeat(64)
  };
  const goldenExecutionApproval = {
    ...goldenExecutionChallenge,
    schemaVersion: "boulder.execution-approval.v1",
    approvedAt: "2026-07-15T12:30:00Z",
    approvalScope: "execution-only",
    signaturePurpose: "boulder.execution.approval.v1",
    signature: "0".repeat(64)
  };

  expect(canonicalCodeHash("plan", "run-golden", "nonce-golden", code)).toBe(expectedPlanCodeHash);
  expect(canonicalCodeHash("execution", "run-golden", "nonce-golden", code)).toBe(expectedExecutionCodeHash);
  expect(canonicalCodeHash("plan", "other-run", "nonce-golden", code)).not.toBe(expectedPlanCodeHash);
  expect(canonicalCodeHash("plan", "run-golden", "other-nonce", code)).not.toBe(expectedPlanCodeHash);
  expect(canonicalCodeHash("plan", "run-golden", "nonce-golden", { ...code, revision: "v2" })).not.toBe(expectedPlanCodeHash);
  expect(canonicalChallengeSigningPayload(goldenPlanChallenge)).toBe(vectors.payloads.planChallenge);
  expect(canonicalChallengeSigningPayload(goldenExecutionChallenge)).toBe(vectors.payloads.executionChallenge);
  expect(canonicalApprovalSigningPayload(goldenPlanApproval)).toBe(vectors.payloads.planApproval);
  expect(canonicalApprovalSigningPayload(goldenExecutionApproval)).toBe(vectors.payloads.executionApproval);
  expect(canonicalChallengeSigningPayload(goldenPlanChallenge)).not.toBe(canonicalChallengeSigningPayload(goldenExecutionChallenge));
  expect(canonicalApprovalSigningPayload(goldenPlanApproval)).not.toBe(canonicalApprovalSigningPayload(goldenExecutionApproval));
  let thrownMessage = "";
  try {
    canonicalChallengeSigningPayload({ ...goldenPlanChallenge, bindings: { sourceDigest: digest("f") } });
  } catch (error) {
    thrownMessage = error instanceof Error ? error.message : String(error);
  }
  expect(thrownMessage).toBe("Invalid challenge signing bindings.");
});

test("final receipts require their matching current consumed challenge", () => {
  const receipt: PlanApprovalReceipt = {
    schemaVersion: "boulder.plan-approval.v1",
    runId: planChallenge.runId,
    purpose: "plan",
    challengeDigest: planChallenge.challengeDigest,
    nonce: planChallenge.nonce,
    codeHash: planChallenge.codeHash,
    keyVersion: planChallenge.keyVersion,
    bindings: planChallenge.bindings,
    approvedAt: "2026-07-15T12:00:00Z",
    approvalScope: "plan-only",
    signaturePurpose: "boulder.plan.approval.v1",
    signature: "a".repeat(64)
  };
  expect(finalReceiptChallengeIssues(receipt, { ...planChallenge, status: "consumed" })).toEqual([]);
  expect(finalReceiptChallengeIssues(receipt, planChallenge).map((item) => item.id)).toEqual(["plan.approval.challenge_not_consumed"]);
  expect(finalReceiptChallengeIssues(receipt, {
    ...planChallenge,
    status: "consumed",
    nonce: "other-nonce"
  }).map((item) => item.id)).toEqual(["plan.approval.receipt_challenge_mismatch"]);
});
