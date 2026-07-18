import { verifyPlanApprovalReceipt, type PlannerLocalApprovalKey } from "./plan-approval.js";
import { receiptMatchesChallenge } from "./plan-receipts.js";
import { canonicalizePlanningValue, planningDigest, sha256Digest } from "./planning-canonical.js";
import { validatePlanRunState, type PlanRunState } from "./plan-state.js";
import { validatePlanningPacket, type PlanningPacket } from "./planning-packet.js";
import { validateExecutionPacket, type ExecutionPacket } from "./execution-packet.js";

export type ExecutionConversionIssueCode =
  | "plan.execution_conversion.packet_invalid"
  | "plan.execution_conversion.approval_invalid"
  | "plan.execution_conversion.approval_stale"
  | "plan.execution_conversion.review_invalid"
  | "plan.execution_conversion.reference_invalid"
  | "plan.execution_conversion.command_untrusted"
  | "plan.execution_conversion.handoff_forbidden";

export interface ExecutionConversionIssue {
  readonly code: ExecutionConversionIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface ExecutionConversionContext {
  readonly planningPacket: unknown;
  readonly planRunState: unknown;
  readonly trustedReceiptKey: PlannerLocalApprovalKey;
}

export type ExecutionConversionResult =
  | { readonly ok: true; readonly value: ExecutionPacket }
  | { readonly ok: false; readonly issues: readonly ExecutionConversionIssue[] };

const trustedSources = new Set(["manifest", "package-script", "user-approved"]);
const handoffKeyPattern = /handoff/;

export function convertPlanningPacketToExecutionPacket(context: ExecutionConversionContext): ExecutionConversionResult {
  const issues: ExecutionConversionIssue[] = [];
  if (hasExternalHandoff(context.planningPacket)) {
    issues.push(issue("plan.execution_conversion.handoff_forbidden", "planningPacket", "External Handoff fields are not part of local execution conversion."));
  }
  const validation = validatePlanningPacket(context.planningPacket);
  if (!validation.valid) {
    issues.push(issue("plan.execution_conversion.packet_invalid", "planningPacket", "Planning packet must be currently valid."));
    return { ok: false, issues };
  }
  const packet = validation.value as PlanningPacket;
  const stateIssues = validatePlanRunState(context.planRunState);
  if (stateIssues.length > 0 || !isCurrentApprovedState(context.planRunState)) {
    issues.push(issue("plan.execution_conversion.approval_stale", "planRunState", "Conversion requires the current trusted approved plan state."));
    return { ok: false, issues };
  }
  const state = context.planRunState;
  const authority = state.authority;
  const challenge = state.currentChallenges.plan!;
  const receipt = authority.planApprovalReceipt!;
  if (!verifyPlanApprovalReceipt(receipt, context.trustedReceiptKey)) {
    issues.push(issue("plan.execution_conversion.approval_invalid", "planRunState.authority.planApprovalReceipt", "Plan approval receipt must be valid and authenticated by the trusted receipt key."));
  }
  if (state.runId !== packet.runId
    || challenge.runId !== state.runId
    || receipt.runId !== state.runId
    || authority.packetDigest !== packet.packetDigest
    || authority.planApprovalDigest !== planningDigest(receipt)
    || !receiptMatchesChallenge(receipt, challenge)
    || receipt.bindings.packetDigest !== authority.packetDigest
    || receipt.bindings.sourceDigest !== state.sourceDigest
    || receipt.bindings.structuralReviewDigest !== authority.structuralReviewDigest
    || receipt.bindings.semanticReviewDigest !== authority.semanticReviewDigest) {
    issues.push(issue("plan.execution_conversion.approval_stale", "planRunState.authority", "Plan approval authority does not exactly bind the consumed challenge, packet, source, and review digests."));
  }
  if (packet.review.structural !== "pass" || packet.review.semantic !== "pass" || packet.review.unresolvedFindings.length > 0) {
    issues.push(issue("plan.execution_conversion.review_invalid", "planningPacket.review", "Planning packet requires passing resolved structural and semantic review."));
  }
  if (packet.approvalPolicy.plan !== "required" || packet.approvalPolicy.execution !== "required") {
    issues.push(issue("plan.execution_conversion.approval_invalid", "planningPacket.approvalPolicy", "Execution conversion requires separate plan and execution approval gates."));
  }
  if (issues.length > 0) return { ok: false, issues };

  const verificationById = new Map(packet.verification.map((verification) => [verification.id, verification]));
  const acceptanceById = new Map(packet.acceptanceCriteria.map((criterion) => [criterion.id, criterion]));
  for (const task of packet.tasks) {
    if (task.evidenceIds.length === 0 || task.acceptanceIds.length === 0 || task.verificationIds.length === 0) {
      issues.push(issue("plan.execution_conversion.reference_invalid", `planningPacket.tasks.${task.id}`, "Every execution task requires acceptance, verification, and evidence traceability."));
    }
    const criteria = task.acceptanceIds.map((id) => acceptanceById.get(id));
    if (criteria.some((criterion) => !criterion)) {
      issues.push(issue("plan.execution_conversion.reference_invalid", `planningPacket.tasks.${task.id}.acceptanceIds`, "Task references a missing acceptance criterion."));
      continue;
    }
    const acceptedVerificationIds = new Set(criteria.flatMap((criterion) => criterion!.verificationIds));
    const acceptedEvidenceIds = new Set(criteria.flatMap((criterion) => criterion!.evidenceIds));
    for (const id of task.verificationIds) {
      if (!verificationById.has(id) || !acceptedVerificationIds.has(id)) issues.push(issue("plan.execution_conversion.reference_invalid", `planningPacket.tasks.${task.id}.verificationIds`, "Task verification must be required by one of its acceptance criteria."));
    }
    for (const id of task.evidenceIds) {
      if (!acceptedEvidenceIds.has(id)) issues.push(issue("plan.execution_conversion.reference_invalid", `planningPacket.tasks.${task.id}.evidenceIds`, "Task evidence must be required by one of its acceptance criteria."));
    }
  }
  const commands = packet.verification.filter((verification) => verification.kind === "command");
  if (commands.length === 0 || commands.some((command) => !command.command || !trustedSources.has(command.source))) {
    issues.push(issue("plan.execution_conversion.command_untrusted", "planningPacket.verification", "Execution commands must be present and from trusted planning sources."));
  }
  if (issues.length > 0) return { ok: false, issues };

  const orderedTasks = topologicalTasks(packet);
  const executionPacket: ExecutionPacket = {
    schemaVersion: "boulder.execution-packet.v1",
    planningPacketDigest: packet.packetDigest,
    approvalReceiptDigest: sha256Digest(canonicalizePlanningValue(receipt)),
    objective: packet.objective,
    allowedMutationPaths: [...packet.scope.allowedPaths],
    forbiddenPaths: [...packet.scope.forbiddenPaths, ...packet.scope.protectedPaths],
    nonGoals: [...packet.scope.nonGoals],
    orderedTasks: orderedTasks.map((task) => ({ id: task.id, planningTaskId: task.id, dependsOn: [...task.dependsOn], paths: [...task.paths], steps: [...task.steps], acceptanceIds: [...task.acceptanceIds], verificationIds: [...task.verificationIds] })),
    acceptanceCriteria: packet.acceptanceCriteria.map((criterion) => ({ id: criterion.id, verificationIds: [...criterion.verificationIds], evidenceIds: [...criterion.evidenceIds] })),
    verificationCommands: commands.map((command) => ({ id: command.id, command: command.command!, source: command.source as "manifest" | "package-script" | "user-approved" })),
    evidenceRequirements: orderedTasks.map((task) => ({ taskId: task.id, evidenceIds: [...task.evidenceIds] })),
    risks: packet.risks.map((risk) => ({ ...risk })),
    riskControls: orderedTasks.flatMap((task) => packet.risks.map((risk) => ({ taskId: task.id, riskId: risk.id, control: risk.mitigation }))),
    rollback: packet.risks.map((risk) => risk.rollback),
    executionApproval: { required: true, schemaVersion: "boulder.execution-approval.v1" }
  };
  if (validateExecutionPacket(executionPacket).length > 0) {
    return { ok: false, issues: [issue("plan.execution_conversion.packet_invalid", "executionPacket", "Converted execution packet failed local validation.")] };
  }
  return { ok: true, value: executionPacket };
}

function topologicalTasks(packet: PlanningPacket): readonly PlanningPacket["tasks"][number][] {
  const pending = new Map(packet.tasks.map((task, index) => [task.id, { task, index }]));
  const ordered: PlanningPacket["tasks"][number][] = [];
  while (pending.size > 0) {
    const next = [...pending.values()].filter(({ task }) => task.dependsOn.every((dependency) => !pending.has(dependency))).sort((left, right) => left.index - right.index)[0];
    if (!next) throw new TypeError("Planning packet task graph must be acyclic.");
    ordered.push(next.task);
    pending.delete(next.task.id);
  }
  return ordered;
}

function hasExternalHandoff(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasExternalHandoff);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nestedValue]) =>
    handoffKeyPattern.test(normalizeKey(key)) || hasExternalHandoff(nestedValue));
}

function normalizeKey(key: string): string {
  return key.normalize("NFKC").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function issue(code: ExecutionConversionIssueCode, path: string, message: string): ExecutionConversionIssue {
  return { code, path, message };
}
function isCurrentApprovedState(value: unknown): value is PlanRunState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as PlanRunState;
  const authority = state.authority;
  const challenge = state.currentChallenges.plan;
  return state.status === "approved"
    && !state.sourceDrift
    && !!challenge
    && challenge.status === "consumed"
    && !!authority.planApprovalReceipt
    && typeof authority.packetDigest === "string"
    && typeof authority.structuralReviewDigest === "string"
    && typeof authority.semanticReviewDigest === "string"
    && typeof authority.planApprovalDigest === "string";
}
