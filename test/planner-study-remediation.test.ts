import { expect, test } from "bun:test";
import {
  commonExecutorFinalReceiptSigningPayload,
  transitionCommonExecutorLifecycle,
  type CommonExecutorFinalReceipt,
  type CommonExecutorLifecycle,
  type CommonExecutorLifecycleInput
} from "../src/common-executor-evidence.js";
import { canonicalApprovalSigningPayload } from "../src/plan-receipts.js";
import { planningDigest } from "../src/planning-canonical.js";
import {
  evaluatePlannerPreExecutionSafety,
  finalizePlannerPreExecutionSafetyReceipt
} from "../src/planner-pre-execution-safety.js";
import {
  plannerScoreWorkflowEventSigningPayload,
  plannerScoreWorkflowPrivateMapDigest,
  transitionPlannerScoreWorkflow,
  type PlannerScoreWorkflowAliasesRevealedEvent,
  type PlannerScoreWorkflowBlindedItem,
  type PlannerScoreWorkflowPreregisterEvent,
  type PlannerScoreWorkflowReportSignedEvent,
  type PlannerScoreWorkflowScoredItem,
  type PlannerScoreWorkflowScoredLockEvent,
  type PlannerScoreWorkflowScoringCompleteEvent,
  type PlannerScoreWorkflowState
} from "../src/planner-score-workflow.js";
import { plannerStudyRemediationEvidenceSchema, validatePlannerStudyRemediationEvidence } from "../src/planner-study-remediation.js";
import type { PlannerBenchmarkIssue, PlannerEvidenceArtifact } from "../src/planner-benchmark.js";

const studyId = "fresh-study";
const protocolDigest = planningDigest({ protocol: "fresh-study-remediation" });
const approvalKey = { secret: "fresh-study-approval-secret", keyVersion: "key-v1" };
const executorSignature = { algorithm: "Ed25519" as const, keyId: "executor-v1", signature: "A".repeat(86) };
const operatorSignature = { algorithm: "Ed25519" as const, keyId: "operator-v1", signature: "operator-envelope" };

type HmacHasher = {
  update(input: string): HmacHasher;
  digest(encoding: "hex"): string;
};

const CryptoHasher = (Bun as typeof Bun & {
  readonly CryptoHasher: new (algorithm: "sha256", key?: string) => HmacHasher;
}).CryptoHasher;

type GraphOptions = {
  readonly exitCode?: number;
  readonly scopeOccurredAt?: string;
  readonly mismatchedPlanner?: boolean;
  readonly preflightSignature?: typeof executorSignature;
  readonly scoringCompletedAt?: string;
  readonly legacyWorkspaceShape?: boolean;
};

type EvidenceGraph = {
  readonly remediationEvidence: PlannerEvidenceArtifact;
  readonly artifactIndex: readonly PlannerEvidenceArtifact[];
  readonly normalizedRuns: readonly { readonly runId: string; readonly cellId: string }[];
  readonly artifacts: ReadonlyMap<string, unknown>;
};

function signApproval<T extends { readonly signature: string }>(receipt: T): T {
  const { signature: _signature, ...unsigned } = receipt;
  return {
    ...unsigned,
    signature: new CryptoHasher("sha256", approvalKey.secret)
      .update(canonicalApprovalSigningPayload(receipt))
      .digest("hex")
  } as T;
}

function planPacket(runId: string) {
  const packet = {
    schemaVersion: "boulder.planning-packet.v1" as const,
    runId,
    createdAt: "2026-07-18T23:59:00.000Z",
    packetDigest: "",
    producer: { adapter: "gjc", mode: "direct" as const, host: "local", toolVersion: "1.0.0" },
    sourceRefs: [],
    task: { rawTaskHash: planningDigest({ runId, task: "fresh remediation" }), normalizedSummary: "Validate fresh remediation.", profileId: "programming-default", analysisRef: "analysis.json" },
    objective: "Validate the bounded module.",
    decisions: [],
    scope: {
      allowedPaths: ["src/**"],
      forbiddenPaths: ["secrets/**"],
      protectedPaths: [".env*"],
      nonGoals: ["No external execution."]
    },
    tasks: [{
      id: "T1",
      title: "Validate the bounded module.",
      dependsOn: [],
      paths: ["src/safe.ts"],
      steps: ["Make the bounded change."],
      acceptanceIds: ["AC1"],
      verificationIds: ["V1"],
      evidenceIds: ["E1"]
    }],
    acceptanceCriteria: [{ id: "AC1", statement: "The bounded module is valid.", verificationIds: ["V1"], evidenceIds: ["E1"] }],
    verification: [{ id: "V1", kind: "command" as const, command: "bun test test/safe.test.ts", source: "package-script" as const, required: true, evidencePath: "evidence/safe.txt" }],
    risks: [{ id: "R1", severity: "high" as const, trigger: "A regression is introduced.", mitigation: "Review the bounded change.", rollback: "Revert the bounded change.", approvalGate: "execution" as const }],
    approvalPolicy: { plan: "required" as const, execution: "required" as const, external: "required-if-used" as const },
    review: { structural: "pass" as const, semantic: "pass" as const, unresolvedFindings: [] }
  };
  return { ...packet, packetDigest: planningDigest(packet) };
}

function runEvidence(runId: string, index: number, options: GraphOptions) {
  const plan = planPacket(runId);
  const planApproval = signApproval({
    schemaVersion: "boulder.plan-approval.v1" as const,
    runId,
    purpose: "plan" as const,
    challengeDigest: planningDigest({ runId, challenge: "plan" }),
    nonce: `plan-${runId}`,
    codeHash: planningDigest({ runId, code: "plan" }),
    keyVersion: approvalKey.keyVersion,
    bindings: { packetDigest: plan.packetDigest, structuralReviewDigest: planningDigest({ runId, review: "structural" }), semanticReviewDigest: planningDigest({ runId, review: "semantic" }), sourceDigest: planningDigest({ runId, source: "plan" }) },
    approvedAt: "2026-07-19T00:00:20.000Z",
    approvalScope: "plan-only" as const,
    signaturePurpose: "boulder.plan.approval.v1" as const,
    signature: ""
  });
  const execution = {
    schemaVersion: "boulder.execution-packet.v1" as const,
    planningPacketDigest: plan.packetDigest,
    approvalReceiptDigest: planningDigest(planApproval),
    objective: plan.objective,
    allowedMutationPaths: ["src/safe.ts"],
    forbiddenPaths: ["secrets/**", ".env*"],
    nonGoals: [...plan.scope.nonGoals],
    orderedTasks: [{ id: "E1", planningTaskId: "T1", dependsOn: [], paths: ["src/safe.ts"], steps: ["Make the bounded change."], acceptanceIds: ["AC1"], verificationIds: ["V1"] }],
    acceptanceCriteria: [{ id: "AC1", verificationIds: ["V1"], evidenceIds: ["E1"] }],
    verificationCommands: [{ id: "V1", command: "bun test test/safe.test.ts", source: "package-script" as const }],
    evidenceRequirements: [{ taskId: "E1", evidenceIds: ["E1"] }],
    risks: [{ id: "R1", severity: "high" as const, trigger: "A regression is introduced.", mitigation: "Review the bounded change.", rollback: "Revert the bounded change.", approvalGate: "execution" as const }],
    riskControls: [{ taskId: "E1", riskId: "R1", control: "Review the bounded change." }],
    rollback: ["Revert the bounded change."],
    executionApproval: { required: true as const, schemaVersion: "boulder.execution-approval.v1" as const }
  };
  const executionApproval = signApproval({
    schemaVersion: "boulder.execution-approval.v1" as const,
    runId,
    purpose: "execution" as const,
    challengeDigest: planningDigest({ runId, challenge: "execution" }),
    nonce: `execution-${runId}`,
    codeHash: planningDigest({ runId, code: "execution" }),
    keyVersion: approvalKey.keyVersion,
    bindings: {
      planningPacketDigest: plan.packetDigest,
      planApprovalDigest: planningDigest(planApproval),
      executionPacketDigest: planningDigest(execution),
      sourceDigest: planningDigest({ runId, source: "execution" })
    },
    approvedAt: "2026-07-19T00:00:40.000Z",
    approvalScope: "execution-only" as const,
    signaturePurpose: "boulder.execution.approval.v1" as const,
    signature: ""
  });
  const preflight = finalizePlannerPreExecutionSafetyReceipt(evaluatePlannerPreExecutionSafety({
    planningPacket: plan,
    executionPacket: execution,
    planApprovalReceipt: planApproval,
    executionApprovalReceipt: executionApproval,
    plannerLocalApprovalKey: approvalKey,
    authorizedWorkspace: { identity: "workspace:local", frozenRevision: "git:abc123" },
    currentWorkspace: { identity: "workspace:local", frozenRevision: "git:abc123" },
    evaluatedAt: "2026-07-19T00:01:00.000Z"
  }), options.preflightSignature ?? executorSignature);
  const lifecycle = buildLifecycle(runId, preflight.receiptDigest, options.exitCode ?? 0);
  const patchDigest = lifecycle.events[3]!.verification!.artifactDigests[0]!;
  const scope: Record<string, unknown> = {
    schemaVersion: "boulder.planner-scope-attribution-receipt.v1" as const,
    runId,
    preflightReceiptDigest: preflight.receiptDigest,
    planningPacketDigest: plan.packetDigest,
    executionPacketDigest: planningDigest(execution),
    authorizedWorkspaceIdentityDigest: planningDigest("workspace:local"),
    observedWorkspaceIdentityDigest: planningDigest("workspace:local"),
    baselineRevision: "git:abc123",
    patchDigest,
    changedPaths: ["src/safe.ts"],
    status: "passed" as const,
    violations: [],
    occurredAt: options.scopeOccurredAt ?? "2026-07-19T00:03:30.000Z",
    signature: executorSignature
  };
  if (options.legacyWorkspaceShape) {
    scope.workspaceIdentityDigest = planningDigest("workspace:local");
    delete scope.authorizedWorkspaceIdentityDigest;
    delete scope.observedWorkspaceIdentityDigest;
  }
  const finalReceipt = buildFinalReceipt(lifecycle);
  return { plan, planApproval, execution, executionApproval, preflight, scope, lifecycle, finalReceipt, index };
}

function transition(lifecycle: CommonExecutorLifecycleInput | CommonExecutorLifecycle, input: Parameters<typeof transitionCommonExecutorLifecycle>[1]): CommonExecutorLifecycle {
  const result = transitionCommonExecutorLifecycle(lifecycle, input);
  if (!result.valid || !result.value) throw new Error(result.issues.map((issue) => issue.message).join("; "));
  return result.value;
}

function buildLifecycle(runId: string, preflightDigest: string, exitCode: number): CommonExecutorLifecycle {
  const base = { runId, command: "bun test test/safe.test.ts", cwd: "/repo", budgetSeconds: 30 };
  let lifecycle = transition(base, { ...base, phase: "preflight-passed", timestamp: "2026-07-19T00:01:00.000Z", preflightDigest });
  lifecycle = transition(lifecycle, { ...base, phase: "started", timestamp: "2026-07-19T00:02:00.000Z" });
  lifecycle = transition(lifecycle, {
    ...base,
    phase: "terminated",
    timestamp: "2026-07-19T00:03:00.000Z",
    termination: { kind: "exit", exitCode, stdoutDigest: planningDigest({ runId, stdout: exitCode }), stderrDigest: planningDigest({ runId, stderr: exitCode }) }
  });
  lifecycle = transition(lifecycle, {
    ...base,
    phase: "verified",
    timestamp: "2026-07-19T00:04:00.000Z",
    verification: {
      test: { outcome: exitCode === 0 ? "passed" as const : "failed" as const, digest: planningDigest({ runId, test: exitCode }) },
      typecheck: { outcome: exitCode === 0 ? "passed" as const : "failed" as const, digest: planningDigest({ runId, typecheck: exitCode }) },
      artifactDigests: [planningDigest({ runId, patch: "safe" })]
    }
  });
  return transition(lifecycle, { ...base, phase: "finalized", timestamp: "2026-07-19T00:05:00.000Z" });
}

function buildFinalReceipt(lifecycle: CommonExecutorLifecycle): CommonExecutorFinalReceipt {
  const value = {
    schemaVersion: "boulder.common-executor-final-receipt.v2" as const,
    runId: lifecycle.runId,
    command: lifecycle.command,
    cwd: lifecycle.cwd,
    budgetSeconds: lifecycle.budgetSeconds,
    lifecycleDigest: lifecycle.lifecycleDigest,
    headEventDigest: lifecycle.headEventDigest,
    finalizedAt: lifecycle.events[4]!.timestamp,
    termination: lifecycle.events[2]!.termination!,
    verification: lifecycle.events[3]!.verification!,
    receiptDigest: "",
    signature: executorSignature
  };
  const { receiptDigest: _receiptDigest, signature: _signature, ...unsigned } = value;
  return { ...value, receiptDigest: planningDigest(unsigned) };
}

function withEventDigest<T extends { readonly eventDigest: string }>(event: T): T {
  const payload = plannerScoreWorkflowEventSigningPayload(event);
  if (payload === undefined) throw new Error("A score-workflow event signing payload is required.");
  return { ...event, eventDigest: planningDigest(payload) } as T;
}
function lockReceiptDigest<T extends { readonly signature: unknown }>(receipt: T): string {
  const { signature: _signature, ...unsigned } = receipt;
  return planningDigest(unsigned);
}


function scoreWorkflow(scoringCompletedAt = "2026-07-19T01:00:00.000Z"): PlannerScoreWorkflowState {
  const items: readonly PlannerScoreWorkflowBlindedItem[] = Array.from({ length: 36 }, (_, index) => {
    const reviewItemId = `review-${index + 1}`;
    const plannerAlias = `alias-${index + 1}`;
    return { reviewItemId, plannerAlias, blindedItemDigest: planningDigest({ reviewItemId, plannerAlias }) };
  });
  const opening = (reviewItemId: string, index: number) => ({ reviewItemId, plannerId: `planner-${index + 1}`, runId: `run-${index + 1}` });
  const privateMapDigest = plannerScoreWorkflowPrivateMapDigest(items, items.map((item, index) => opening(item.reviewItemId, index)));
  const preregister: PlannerScoreWorkflowPreregisterEvent = withEventDigest({
    schemaVersion: "boulder.planner-score-workflow.v1",
    kind: "preregister-empty-blinded-sheet-lock",
    studyId,
    sequence: 1,
    occurredAt: "2026-07-19T00:00:00.000Z",
    previousStateDigest: null,
    previousEventDigest: null,
    signature: operatorSignature,
    blindedItems: items,
    blindedSheetDigest: planningDigest(items),
    privateMapDigest,
    protocolDigest,
    eventDigest: ""
  });
  const preregistered = applyScoreEvent(undefined, preregister);
  const scoredItems: readonly PlannerScoreWorkflowScoredItem[] = preregistered.blindedItems.map((item, index) => {
    const score = 50 + index;
    return { reviewItemId: item.reviewItemId, blindedItemDigest: item.blindedItemDigest, score, scoredItemDigest: planningDigest({ reviewItemId: item.reviewItemId, blindedItemDigest: item.blindedItemDigest, score }) };
  });
  const scoring: PlannerScoreWorkflowScoringCompleteEvent = withEventDigest({
    schemaVersion: "boulder.planner-score-workflow.v1",
    kind: "complete-blinded-scoring",
    studyId,
    sequence: 2,
    occurredAt: scoringCompletedAt,
    previousStateDigest: preregistered.stateDigest,
    previousEventDigest: preregistered.eventDigest,
    signature: operatorSignature,
    protocolDigest,
    privateMapDigest,
    scoredItems,
    scoredSheetDigest: planningDigest(scoredItems),
    eventDigest: ""
  });
  const scored = applyScoreEvent(preregistered, scoring);
  if (!scored.scoredItems || !scored.scoredSheetDigest) throw new Error("Scored workflow state is required.");
  const lockedItems = scored.scoredItems.map((item) => ({ reviewItemId: item.reviewItemId, scoredItemDigest: item.scoredItemDigest }));
  const lockReceipt = {
    schemaVersion: "boulder.planner-score-lock-receipt.v1" as const,
    sequence: 3,
    occurredAt: "2026-07-19T01:00:10.000Z",
    kind: "prospective-lock" as const,
    scoreSheetDigest: scored.scoredSheetDigest,
    lockedItems,
    signature: operatorSignature
  };
  const lock: PlannerScoreWorkflowScoredLockEvent = withEventDigest({
    schemaVersion: "boulder.planner-score-workflow.v1",
    kind: "lock-scored-sheet",
    studyId,
    sequence: 3,
    occurredAt: "2026-07-19T01:00:10.000Z",
    previousStateDigest: scored.stateDigest,
    previousEventDigest: scored.eventDigest,
    signature: operatorSignature,
    protocolDigest,
    privateMapDigest,
    scoreLockReceipt: { ...lockReceipt, lockDigest: lockReceiptDigest(lockReceipt) },
    eventDigest: ""
  });
  const locked = applyScoreEvent(scored, lock);
  if (!locked.scoredItems || !locked.lockDigest) throw new Error("Locked workflow state is required.");
  const reveal: PlannerScoreWorkflowAliasesRevealedEvent = withEventDigest({
    schemaVersion: "boulder.planner-score-workflow.v1",
    kind: "reveal-aliases",
    studyId,
    sequence: 4,
    occurredAt: "2026-07-19T01:00:20.000Z",
    previousStateDigest: locked.stateDigest,
    previousEventDigest: locked.eventDigest,
    signature: operatorSignature,
    protocolDigest,
    privateMapDigest,
    lockDigest: locked.lockDigest,
    reveals: locked.scoredItems.map((item, index) => ({ ...opening(item.reviewItemId, index), blindedItemDigest: item.blindedItemDigest, scoredItemDigest: item.scoredItemDigest })),
    eventDigest: ""
  });
  const revealed = applyScoreEvent(locked, reveal);
  const report: PlannerScoreWorkflowReportSignedEvent = withEventDigest({
    schemaVersion: "boulder.planner-score-workflow.v1",
    kind: "sign-report",
    studyId,
    sequence: 5,
    occurredAt: "2026-07-19T01:00:30.000Z",
    previousStateDigest: revealed.stateDigest,
    previousEventDigest: revealed.eventDigest,
    signature: operatorSignature,
    protocolDigest,
    privateMapDigest,
    reportDigest: planningDigest({ report: "fresh-study" }),
    eventDigest: ""
  });
  return applyScoreEvent(revealed, report);
}

function applyScoreEvent(previous: PlannerScoreWorkflowState | undefined, event: unknown): PlannerScoreWorkflowState {
  const result = transitionPlannerScoreWorkflow(previous, event);
  if (!result.valid || !result.state) throw new Error(result.issues.map((issue) => issue.message).join("; "));
  return result.state;
}

function buildGraph(options: GraphOptions = {}): EvidenceGraph {
  const artifacts = new Map<string, unknown>();
  const artifactIndex: PlannerEvidenceArtifact[] = [];
  const add = (path: string, schemaVersion: string, value: unknown): PlannerEvidenceArtifact => {
    const reference = { path, schemaVersion, digest: planningDigest(value) };
    artifacts.set(path, value);
    artifactIndex.push(reference);
    return reference;
  };
  const workflow = add("evidence/score-workflow.json", "boulder.planner-score-workflow.v1", scoreWorkflow(options.scoringCompletedAt));
  const runs = Array.from({ length: 36 }, (_, index) => {
    const runId = `run-${index + 1}`;
    const values = runEvidence(runId, index, options);
    return {
      runId,
      planningPacket: add(`evidence/${runId}/planning.json`, "boulder.planning-packet.v1", values.plan),
      executionPacket: add(`evidence/${runId}/execution.json`, "boulder.execution-packet.v1", values.execution),
      planApprovalReceipt: add(`evidence/${runId}/plan-approval.json`, "boulder.plan-approval.v1", values.planApproval),
      executionApprovalReceipt: add(`evidence/${runId}/execution-approval.json`, "boulder.execution-approval.v1", values.executionApproval),
      preflightReceipt: add(`evidence/${runId}/preflight.json`, "boulder.planner-pre-execution-safety-receipt.v1", values.preflight),
      scopeAttributionReceipt: add(`evidence/${runId}/scope.json`, "boulder.planner-scope-attribution-receipt.v1", values.scope),
      lifecycle: add(`evidence/${runId}/lifecycle.json`, "boulder.common-executor-lifecycle.v1", values.lifecycle),
      finalReceipt: add(`evidence/${runId}/final.json`, "boulder.common-executor-final-receipt.v2", values.finalReceipt)
    };
  });
  const remediationEvidence = add("evidence/remediation.json", plannerStudyRemediationEvidenceSchema, {
    schemaVersion: plannerStudyRemediationEvidenceSchema,
    scoreWorkflow: workflow,
    runs
  });
  return {
    remediationEvidence,
    artifactIndex,
    normalizedRuns: runs.map((run, index) => ({ runId: run.runId, cellId: `${options.mismatchedPlanner && index === 0 ? "other-planner" : `planner-${index + 1}`}:cell-1` })),
    artifacts
  };
}

function signatureIssue(signed: Record<string, unknown>, path: string, expected: typeof executorSignature | typeof operatorSignature): PlannerBenchmarkIssue | undefined {
  const signature = signed.signature;
  if (
    signature === null
    || typeof signature !== "object"
    || Array.isArray(signature)
    || (signature as Record<string, unknown>).algorithm !== expected.algorithm
    || (signature as Record<string, unknown>).keyId !== expected.keyId
    || (signature as Record<string, unknown>).signature !== expected.signature
  ) {
    return { code: "plan.benchmark.evidence_invalid", path, message: "Expected deterministic signer envelope." };
  }
  return undefined;
}

function validateGraph(graph: EvidenceGraph, unreadablePath?: string) {
  return validatePlannerStudyRemediationEvidence({
    remediationEvidence: graph.remediationEvidence,
    artifactIndex: graph.artifactIndex,
    normalizedRuns: graph.normalizedRuns,
    studyId,
    protocolDigest,
    artifactJoined: (reference) => graph.artifacts.has(reference.path),
    readArtifact: (reference) => {
      if (reference.path === unreadablePath) throw new Error("Unreadable indexed evidence.");
      return graph.artifacts.get(reference.path);
    },
    verifyExecutorSignature: async (signed, path) => signatureIssue(signed, path, executorSignature),
    verifyOperatorSignature: async (signed, path) => signatureIssue(signed, path, operatorSignature)
  });
}

test("planner study remediation accepts a fully indexed prospective evidence graph", async () => {
  const graph = buildGraph();
  expect(graph.artifactIndex).toHaveLength(290);
  expect(new Set(graph.artifactIndex.map((artifact) => artifact.path)).size).toBe(graph.artifactIndex.length);
  expect(await validateGraph(graph)).toEqual([]);
});

test("planner study remediation returns an issue for unreadable indexed evidence", async () => {
  const graph = buildGraph();
  const issues = await validateGraph(graph, "evidence/run-1/planning.json");
  expect(issues.some((issue) => issue.path === "remediationEvidence.runs[0].planningPacket" && issue.message.includes("could not be read"))).toBe(true);
});

test("planner study remediation rejects failed final execution evidence", async () => {
  const issues = await validateGraph(buildGraph({ exitCode: 1 }));
  expect(issues.some((issue) => issue.path === "remediationEvidence.runs[0].finalReceipt" && issue.message.includes("successful exit"))).toBe(true);
});

test("planner study remediation rejects legacy single-field workspace evidence", async () => {
  const issues = await validateGraph(buildGraph({ legacyWorkspaceShape: true }));
  expect(issues.some((issue) => issue.path === "remediationEvidence.runs[0].scopeAttributionReceipt" && issue.message.includes("post-execution observed workspace"))).toBe(true);
});

test("planner study remediation rejects cross-artifact chronology faults", async () => {
  for (const options of [
    { scopeOccurredAt: "2026-07-19T00:04:30.000Z" },
    { scoringCompletedAt: "2026-07-19T00:04:30.000Z" }
  ]) {
    const issues = await validateGraph(buildGraph(options));
    expect(issues.some((issue) => issue.path === "remediationEvidence.runs[0]" && issue.message.includes("chronology"))).toBe(true);
  }
});

test("planner study remediation rejects normalized planner identities that disagree with score reveals", async () => {
  const issues = await validateGraph(buildGraph({ mismatchedPlanner: true }));
  expect(issues.some((issue) => issue.path === "remediationEvidence.scoreWorkflow.reveals" && issue.message.includes("normalized planner identity"))).toBe(true);
});

test("planner study remediation rejects unauthenticated preflight signer envelopes", async () => {
  const issues = await validateGraph(buildGraph({ preflightSignature: { ...executorSignature, keyId: "wrong-executor" } }));
  expect(issues.some((issue) => issue.path === "remediationEvidence.runs[0].preflightReceipt" && issue.message.includes("Expected deterministic signer envelope."))).toBe(true);
});
