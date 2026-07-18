import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { convertPlanningPacketToExecutionPacket } from "../src/execution-conversion";
import { planningDigest } from "../src/planning-canonical";
import { canonicalApprovalSigningPayload } from "../src/plan-receipts";
import type { PlanRunState } from "../src/plan-state";

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const trustedReceiptKey = { secret: "trusted-receipt-secret", keyVersion: "v1" };
type HmacHasher = { update(input: string): HmacHasher; digest(encoding: "hex"): string };
const CryptoHasher = (Bun as typeof Bun & { readonly CryptoHasher: new (algorithm: "sha256", key?: string) => HmacHasher }).CryptoHasher;

function signReceipt(receipt: Record<string, unknown>): string {
  return new CryptoHasher("sha256", trustedReceiptKey.secret)
    .update(canonicalApprovalSigningPayload(receipt))
    .digest("hex");
}

async function context() {
  const planningPacket = JSON.parse(await readFile(join(import.meta.dir, "..", "fixtures", "planning-packets", "valid.json"), "utf8"));
  planningPacket.review = { structural: "pass", semantic: "pass", unresolvedFindings: [] };
  planningPacket.packetDigest = planningDigest(planningPacket);
  const sourceDigest = digest("b");
  const structuralReviewDigest = digest("c");
  const semanticReviewDigest = digest("d");
  const challengeBase = {
    schemaVersion: "boulder.plan-approval-challenge.v1" as const,
    runId: planningPacket.runId,
    purpose: "plan" as const,
    createdAt: "2026-01-01T00:00:00Z",
    challengeId: "plan-challenge",
    status: "pending" as const,
    nonce: "approval-nonce",
    codeHash: digest("f"),
    keyVersion: trustedReceiptKey.keyVersion,
    issuedBy: "test",
    bindings: { packetDigest: planningPacket.packetDigest, sourceDigest, structuralReviewDigest, semanticReviewDigest }
  };
  const challenge = { ...challengeBase, challengeDigest: planningDigest(challengeBase), status: "consumed" as const };
  const unsignedReceipt = {
    schemaVersion: "boulder.plan-approval.v1" as const,
    runId: planningPacket.runId,
    purpose: "plan" as const,
    challengeDigest: challenge.challengeDigest,
    nonce: challenge.nonce,
    codeHash: challenge.codeHash,
    keyVersion: trustedReceiptKey.keyVersion,
    bindings: challenge.bindings,
    approvedAt: "2026-01-01T00:00:00Z",
    approvalScope: "plan-only" as const,
    signaturePurpose: "boulder.plan.approval.v1" as const,
    signature: "0".repeat(64)
  };
  const planApprovalReceipt = { ...unsignedReceipt, signature: signReceipt(unsignedReceipt) };
  const planRunState: PlanRunState = {
    schemaVersion: "boulder.plan-run-state.v1", runId: planningPacket.runId, status: "approved", stateRevision: 1, semanticRevision: 0, sourceDigest,
    authority: { packetDigest: planningPacket.packetDigest, structuralReviewDigest, semanticReviewDigest, planApprovalDigest: planningDigest(planApprovalReceipt), planApprovalReceipt },
    currentChallenges: { plan: challenge }, challengeHistory: [], sourceDrift: false
  };
  return { planningPacket, planRunState, trustedReceiptKey };
}

describe("approved PlanningPacket execution conversion", () => {
  test("converts only a trusted current approved state", async () => {
    const input = await context();
    const result = convertPlanningPacketToExecutionPacket(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.planningPacketDigest).toBe(input.planningPacket.packetDigest);
    expect(result.value.executionApproval).toEqual({ required: true, schemaVersion: "boulder.execution-approval.v1" });
    expect(result.value.acceptanceCriteria).toEqual(input.planningPacket.acceptanceCriteria.map((criterion: { id: string; verificationIds: string[]; evidenceIds: string[] }) => ({
      id: criterion.id,
      verificationIds: criterion.verificationIds,
      evidenceIds: criterion.evidenceIds
    })));
  });

  test("rejects cross-run authority replay", async () => {
    const input = await context();
    (input.planRunState as { runId: string }).runId = "other-run";
    expect(convertPlanningPacketToExecutionPacket(input).ok).toBe(false);
  });
  test("rejects authority substitution and stale or unapproved state", async () => {
    const input = await context();
    const substituted = structuredClone(input);
    (substituted.planRunState.authority as { structuralReviewDigest: string }).structuralReviewDigest = digest("9");
    expect(convertPlanningPacketToExecutionPacket(substituted).ok).toBe(false);

    const stale = structuredClone(input);
    (stale.planRunState as { sourceDigest: string }).sourceDigest = digest("8");
    expect(convertPlanningPacketToExecutionPacket(stale).ok).toBe(false);

    const unapproved = structuredClone(input);
    (unapproved.planRunState as { status: string }).status = "awaiting-plan-approval";
    expect(convertPlanningPacketToExecutionPacket(unapproved).ok).toBe(false);
  });

  test("rejects task paths outside allowed scope or overlapping forbidden scope", async () => {
    const outside = await context();
    outside.planningPacket.tasks[0].paths = ["outside/file.ts"];
    outside.planningPacket.packetDigest = planningDigest(outside.planningPacket);
    (outside.planRunState.authority as { packetDigest: string }).packetDigest = outside.planningPacket.packetDigest;
    expect(convertPlanningPacketToExecutionPacket(outside).ok).toBe(false);

    const forbidden = await context();
    const protectedPath = forbidden.planningPacket.scope.protectedPaths[0];
    forbidden.planningPacket.tasks[0].paths = [protectedPath];
    forbidden.planningPacket.packetDigest = planningDigest(forbidden.planningPacket);
    (forbidden.planRunState.authority as { packetDigest: string }).packetDigest = forbidden.planningPacket.packetDigest;
    expect(convertPlanningPacketToExecutionPacket(forbidden).ok).toBe(false);
  });
});
