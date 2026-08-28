import { describe, expect, test } from "bun:test";
import {
  canonicalPlannerPreExecutionSafetyReceiptSigningPayload,
  evaluatePlannerPreExecutionSafety,
  finalizePlannerPreExecutionSafetyReceipt,
  validatePlannerPreExecutionSafetyReceipt,
  type PlannerPreExecutionSafetyInput
} from "../src/planner-pre-execution-safety";
import { canonicalApprovalSigningPayload } from "../src/plan-receipts";
import { planningDigest } from "../src/planning-canonical";

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const plannerLocalApprovalKey = { secret: "planner-local-approval-secret", keyVersion: "key-v1" };

type HmacHasher = {
  update(input: string): HmacHasher;
  digest(encoding: "hex"): string;
};

const CryptoHasher = (Bun as typeof Bun & {
  readonly CryptoHasher: new (algorithm: "sha256", key?: string) => HmacHasher;
}).CryptoHasher;

function signApproval<T extends { readonly signature: string }>(receipt: T): Omit<T, "signature"> & { readonly signature: string } {
  const { signature: _signature, ...unsignedReceipt } = receipt;
  return {
    ...unsignedReceipt,
    signature: new CryptoHasher("sha256", plannerLocalApprovalKey.secret)
      .update(canonicalApprovalSigningPayload(receipt))
      .digest("hex")
  };
}

function planningPacket() {
  const packet = {
    schemaVersion: "boulder.planning-packet.v1" as const,
    runId: "safety-run",
    createdAt: "2026-07-19T00:00:00.000Z",
    packetDigest: "",
    producer: { adapter: "gjc", mode: "direct" as const, host: "local", toolVersion: "1.0.0" },
    sourceRefs: [],
    task: { rawTaskHash: digest("a"), normalizedSummary: "Protect execution.", profileId: "programming-default", analysisRef: "analysis.json" },
    objective: "Change the bounded module safely.",
    decisions: [],
    scope: {
      allowedPaths: ["src/**"],
      forbiddenPaths: ["secrets/**"],
      protectedPaths: [".env*"],
      nonGoals: ["No external execution."]
    },
    tasks: [{
      id: "T1",
      title: "Update the bounded module.",
      dependsOn: [],
      paths: ["src/safe.ts"],
      steps: ["Make the change."],
      acceptanceIds: ["AC1"],
      verificationIds: ["V1"],
      evidenceIds: ["E1"]
    }],
    acceptanceCriteria: [{ id: "AC1", statement: "The bounded module is safe.", verificationIds: ["V1"], evidenceIds: ["E1"] }],
    verification: [{ id: "V1", kind: "command" as const, command: "bun test test/safe.test.ts", source: "package-script" as const, required: true, evidencePath: "evidence/safe.txt" }],
    risks: [{ id: "R1", severity: "high" as const, trigger: "A regression is introduced.", mitigation: "Review the bounded change.", rollback: "Revert the bounded change.", approvalGate: "execution" as const }],
    approvalPolicy: { plan: "required" as const, execution: "required" as const, external: "required-if-used" as const },
    review: { structural: "pass" as const, semantic: "pass" as const, unresolvedFindings: [] }
  };
  return { ...packet, packetDigest: planningDigest(packet) };
}

function validInput(): PlannerPreExecutionSafetyInput {
  const plan = planningPacket();
  const planApprovalReceipt = signApproval({
    schemaVersion: "boulder.plan-approval.v1" as const,
    runId: plan.runId,
    purpose: "plan" as const,
    challengeDigest: digest("b"),
    nonce: "plan-nonce",
    codeHash: digest("c"),
    keyVersion: plannerLocalApprovalKey.keyVersion,
    bindings: { packetDigest: plan.packetDigest, structuralReviewDigest: digest("d"), semanticReviewDigest: digest("e"), sourceDigest: digest("f") },
    approvedAt: "2026-07-19T00:01:00.000Z",
    approvalScope: "plan-only" as const,
    signaturePurpose: "boulder.plan.approval.v1" as const,
    signature: "0".repeat(64)
  });
  const executionPacket = {
    schemaVersion: "boulder.execution-packet.v1" as const,
    planningPacketDigest: plan.packetDigest,
    approvalReceiptDigest: planningDigest(planApprovalReceipt),
    objective: plan.objective,
    allowedMutationPaths: ["src/safe.ts"],
    forbiddenPaths: ["secrets/**", ".env*"],
    nonGoals: [...plan.scope.nonGoals],
    orderedTasks: [{ id: "E1", planningTaskId: "T1", dependsOn: [], paths: ["src/safe.ts"], steps: ["Make the change."], acceptanceIds: ["AC1"], verificationIds: ["V1"] }],
    acceptanceCriteria: [{ id: "AC1", verificationIds: ["V1"], evidenceIds: ["E1"] }],
    verificationCommands: [{ id: "V1", command: "bun test test/safe.test.ts", source: "package-script" as const }],
    evidenceRequirements: [{ taskId: "E1", evidenceIds: ["E1"] }],
    risks: [{ id: "R1", severity: "high" as const, trigger: "A regression is introduced.", mitigation: "Review the bounded change.", rollback: "Revert the bounded change.", approvalGate: "execution" as const }],
    riskControls: [{ taskId: "E1", riskId: "R1", control: "Review the bounded change." }],
    rollback: ["Revert the bounded change."],
    executionApproval: { required: true as const, schemaVersion: "boulder.execution-approval.v1" as const }
  };
  const executionApprovalReceipt = signApproval({
    schemaVersion: "boulder.execution-approval.v1" as const,
    runId: plan.runId,
    purpose: "execution" as const,
    challengeDigest: digest("1"),
    nonce: "execution-nonce",
    codeHash: digest("2"),
    keyVersion: plannerLocalApprovalKey.keyVersion,
    bindings: {
      planningPacketDigest: plan.packetDigest,
      planApprovalDigest: planningDigest(planApprovalReceipt),
      executionPacketDigest: planningDigest(executionPacket),
      sourceDigest: digest("f")
    },
    approvedAt: "2026-07-19T00:02:00.000Z",
    approvalScope: "execution-only" as const,
    signaturePurpose: "boulder.execution.approval.v1" as const,
    signature: "0".repeat(64)
  });
  return {
    planningPacket: plan,
    executionPacket,
    planApprovalReceipt,
    executionApprovalReceipt,
    plannerLocalApprovalKey,
    authorizedWorkspace: { identity: "workspace:local", frozenRevision: "git:abc123" },
    currentWorkspace: { identity: "workspace:local", frozenRevision: "git:abc123" },
    evaluatedAt: "2026-07-19T00:03:00.000Z"
  };
}

function signedReceipt(input: PlannerPreExecutionSafetyInput) {
  return finalizePlannerPreExecutionSafetyReceipt(evaluatePlannerPreExecutionSafety(input), {
    algorithm: "Ed25519",
    keyId: "delegated-preflight-authority",
    signature: "A".repeat(86)
  });
}

function expectBlocked(input: PlannerPreExecutionSafetyInput): ReturnType<typeof evaluatePlannerPreExecutionSafety> {
  const receipt = evaluatePlannerPreExecutionSafety(input);
  expect(receipt.allowed).toBe(false);
  return receipt;
}

describe("planner pre-execution safety receipt", () => {
  test("allows clean approvals only when authenticated by the caller-supplied planner-local key", () => {
    const input = validInput();
    const receipt = signedReceipt(input);
    expect(receipt.allowed).toBe(true);
    expect(validatePlannerPreExecutionSafetyReceipt(receipt, input)).toEqual({ valid: true, issues: [] });
    expect(canonicalPlannerPreExecutionSafetyReceiptSigningPayload(receipt)).not.toContain(receipt.signature!.signature);
  });

  test("fails closed for absent, forged, and purpose-confused HMAC-shaped approvals", () => {
    const input = validInput();
    const withoutKey = expectBlocked({ ...input, plannerLocalApprovalKey: undefined });
    expect(withoutKey.issues.map((issue) => issue.id)).toContain("plan.pre_execution_safety.plan_approval_unauthenticated");

    const forged = {
      ...input.planApprovalReceipt as Record<string, unknown>,
      signature: "a".repeat(64)
    };
    const forgedReceipt = expectBlocked({ ...input, planApprovalReceipt: forged });
    expect(forgedReceipt.issues.map((issue) => issue.id)).toContain("plan.pre_execution_safety.plan_approval_unauthenticated");

    const confused = { ...input.executionApprovalReceipt as Record<string, unknown>, purpose: "plan" };
    expectBlocked({ ...input, executionApprovalReceipt: confused });
  });

  test("fails closed when workspace, revision, approved packet, or approval input is replayed or changed", () => {
    const input = validInput();
    expectBlocked({ ...input, currentWorkspace: { identity: "workspace:external", frozenRevision: "git:abc123" } });
    expectBlocked({ ...input, currentWorkspace: { identity: "workspace:local", frozenRevision: "git:def456" } });

    const changedPlanningPacket = {
      ...input.planningPacket as Record<string, unknown>,
      decisions: [{ id: "D1", statement: "Unexpected decision." }]
    };
    expectBlocked({ ...input, planningPacket: changedPlanningPacket });

    const changedApproval = {
      ...input.executionApprovalReceipt as Record<string, unknown>,
      bindings: {
        ...(input.executionApprovalReceipt as { readonly bindings: Record<string, unknown> }).bindings,
        sourceDigest: digest("0")
      }
    };
    expectBlocked({ ...input, executionApprovalReceipt: changedApproval });
  });

  test("fails closed for weakened controls and duplicate or missing task mappings", () => {
    const input = validInput();
    const weakenedPacket = {
      ...input.executionPacket as Record<string, unknown>,
      forbiddenPaths: ["secrets/**"]
    };
    expectBlocked({ ...input, executionPacket: weakenedPacket });

    const duplicateTaskPacket = {
      ...input.executionPacket as Record<string, unknown>,
      orderedTasks: [
        ...(input.executionPacket as { readonly orderedTasks: readonly unknown[] }).orderedTasks,
        { id: "E2", planningTaskId: "T1", dependsOn: [], paths: ["src/safe.ts"], steps: ["Repeat the change."], acceptanceIds: ["AC1"], verificationIds: ["V1"] }
      ],
      evidenceRequirements: [
        ...(input.executionPacket as { readonly evidenceRequirements: readonly unknown[] }).evidenceRequirements,
        { taskId: "E2", evidenceIds: ["E1"] }
      ],
      riskControls: [
        ...(input.executionPacket as { readonly riskControls: readonly unknown[] }).riskControls,
        { taskId: "E2", riskId: "R1", control: "Review the bounded change." }
      ]
    };
    expectBlocked({ ...input, executionPacket: duplicateTaskPacket });

    const missingEvidencePacket = {
      ...input.executionPacket as Record<string, unknown>,
      evidenceRequirements: []
    };
    expectBlocked({ ...input, executionPacket: missingEvidencePacket });
  });

  test("rejects replayed receipt packet bindings, decisions, and issues without changing the signing payload contract", () => {
    const input = validInput();
    const receipt = signedReceipt(input);
    const changedPacketBinding = {
      ...receipt,
      planningPacketDigest: digest("9")
    };
    expect(validatePlannerPreExecutionSafetyReceipt(changedPacketBinding, input).valid).toBe(false);

    const changedDecision = {
      ...receipt,
      allowed: false
    };
    expect(validatePlannerPreExecutionSafetyReceipt(changedDecision, input).valid).toBe(false);

    const unsafe = expectBlocked({ ...input, currentWorkspace: { identity: "workspace:external", frozenRevision: "git:def456" } });
    const unsafeSigned = finalizePlannerPreExecutionSafetyReceipt(unsafe, receipt.signature!);
    const tamperedIssues = {
      ...unsafeSigned,
      issues: []
    };
    expect(unsafeSigned.allowed).toBe(false);
    expect(validatePlannerPreExecutionSafetyReceipt(tamperedIssues, { ...input, currentWorkspace: { identity: "workspace:external", frozenRevision: "git:def456" } }).valid).toBe(false);
  });
});
