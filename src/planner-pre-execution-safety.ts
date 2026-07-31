import { verifyExecutionApprovalReceipt } from "./execution-approval.js";
import { verifyPlanApprovalReceipt, type PlannerLocalApprovalKey } from "./plan-approval.js";
import { validateExecutionApprovalReceipt, validatePlanApprovalReceipt, type ExecutionApprovalReceipt, type PlanApprovalReceipt } from "./plan-receipts.js";
import { canonicalizePlanningValue, planningDigest, sha256Digest } from "./planning-canonical.js";
import { validateExecutionPacket, type ExecutionPacket } from "./execution-packet.js";
import { validatePlanningPacket, type PlanningPacket } from "./planning-packet.js";
import { globMatches } from "./path-glob.js";

export interface PlannerPreExecutionSafetyIssue {
  readonly id: string;
  readonly path: string;
  readonly message: string;
}

export interface PlannerPreExecutionSafetyInput {
  readonly planningPacket: unknown;
  readonly executionPacket: unknown;
  readonly planApprovalReceipt: unknown;
  readonly executionApprovalReceipt: unknown;
  readonly plannerLocalApprovalKey?: PlannerLocalApprovalKey;
  readonly approvalReceiptsAuthenticated?: boolean;
  readonly authorizedWorkspace: {
    readonly identity: string;
    readonly frozenRevision: string;
  };
  readonly currentWorkspace: {
    readonly identity: string;
    readonly frozenRevision: string;
  };
  readonly evaluatedAt: string;
}

export interface PlannerPreExecutionSafetySignatureEnvelope {
  readonly algorithm: "Ed25519";
  readonly keyId: string;
  readonly signature: string;
}

export interface PlannerPreExecutionSafetyReceipt {
  readonly schemaVersion: "boulder.planner-pre-execution-safety-receipt.v1";
  readonly planningPacketDigest: string;
  readonly executionPacketDigest: string;
  readonly planApprovalReceiptDigest: string;
  readonly executionApprovalReceiptDigest: string;
  readonly authorizedWorkspaceIdentity: string;
  readonly currentWorkspaceIdentity: string;
  readonly authorizedFrozenRevision: string;
  readonly currentFrozenRevision: string;
  readonly allowed: boolean;
  readonly issues: readonly PlannerPreExecutionSafetyIssue[];
  readonly evaluatedAt: string;
  readonly receiptDigest: string;
  readonly signature?: PlannerPreExecutionSafetySignatureEnvelope;
}

export interface PlannerPreExecutionSafetyReceiptValidation {
  readonly valid: boolean;
  readonly issues: readonly PlannerPreExecutionSafetyIssue[];
}

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const handoffKeyPattern = /handoff|transport/;

export function evaluatePlannerPreExecutionSafety(input: PlannerPreExecutionSafetyInput): PlannerPreExecutionSafetyReceipt {
  const issues: PlannerPreExecutionSafetyIssue[] = [];
  const planningPacketDigest = planningDigest(input.planningPacket);
  const executionPacketDigest = planningDigest(input.executionPacket);
  const planApprovalReceiptDigest = planningDigest(input.planApprovalReceipt);
  const executionApprovalReceiptDigest = planningDigest(input.executionApprovalReceipt);

  if (hasHandoffField(input)) {
    issue(issues, "plan.pre_execution_safety.handoff_forbidden", "$", "Handoff fields and transports are forbidden before local execution.");
  }

  const planning = validatePlanningPacket(input.planningPacket);
  if (!planning.valid) {
    issue(issues, "plan.pre_execution_safety.planning_packet_invalid", "$.planningPacket", "Planning packet must pass current structural validation.");
  }

  const executionIssues = validateExecutionPacket(input.executionPacket);
  if (executionIssues.length > 0) {
    issue(issues, "plan.pre_execution_safety.execution_packet_invalid", "$.executionPacket", "Execution packet must pass current structural validation.");
  }

  const planApprovalIssues = validatePlanApprovalReceipt(input.planApprovalReceipt);
  if (planApprovalIssues.length > 0) {
    issue(issues, "plan.pre_execution_safety.plan_approval_invalid", "$.planApprovalReceipt", "Plan approval receipt must have the plan approval purpose and envelope.");
  }

  const executionApprovalIssues = validateExecutionApprovalReceipt(input.executionApprovalReceipt);
  if (executionApprovalIssues.length > 0) {
    issue(issues, "plan.pre_execution_safety.execution_approval_invalid", "$.executionApprovalReceipt", "Execution approval receipt must have the execution approval purpose and envelope.");
  }
  const planApprovalAuthenticated = input.approvalReceiptsAuthenticated === true
    || verifyPlanApprovalReceipt(input.planApprovalReceipt as PlanApprovalReceipt, input.plannerLocalApprovalKey as PlannerLocalApprovalKey);
  if (!planApprovalAuthenticated) {
    issue(issues, "plan.pre_execution_safety.plan_approval_unauthenticated", "$.planApprovalReceipt", "Plan approval receipt must be authenticated by the caller-supplied planner-local approval key or a trusted signed attestation.");
  }
  const executionApprovalAuthenticated = input.approvalReceiptsAuthenticated === true
    || verifyExecutionApprovalReceipt(input.executionApprovalReceipt as ExecutionApprovalReceipt, input.plannerLocalApprovalKey as PlannerLocalApprovalKey);
  if (!executionApprovalAuthenticated) {
    issue(issues, "plan.pre_execution_safety.execution_approval_unauthenticated", "$.executionApprovalReceipt", "Execution approval receipt must be authenticated by the caller-supplied planner-local approval key or a trusted signed attestation.");
  }

  const workspace = workspaceIssues(input);
  issues.push(...workspace);

  if (planning.valid && executionIssues.length === 0 && planApprovalIssues.length === 0 && executionApprovalIssues.length === 0) {
    const planningPacket = planning.value as PlanningPacket;
    const executionPacket = input.executionPacket as ExecutionPacket;
    const planApprovalReceipt = input.planApprovalReceipt as PlanApprovalReceiptShape;
    const executionApprovalReceipt = input.executionApprovalReceipt as ExecutionApprovalReceiptShape;

    validateBindings(
      issues,
      planningPacket,
      executionPacket,
      planApprovalReceipt,
      executionApprovalReceipt,
      planningPacketDigest,
      executionPacketDigest,
      planApprovalReceiptDigest
    );
    validateScope(issues, planningPacket, executionPacket);
    validateRisks(issues, planningPacket, executionPacket);
    validateTraceability(issues, planningPacket, executionPacket);
  }

  const receiptWithoutDigest = {
    schemaVersion: "boulder.planner-pre-execution-safety-receipt.v1" as const,
    planningPacketDigest,
    executionPacketDigest,
    planApprovalReceiptDigest,
    executionApprovalReceiptDigest,
    authorizedWorkspaceIdentity: workspaceIdentity(input.authorizedWorkspace),
    currentWorkspaceIdentity: workspaceIdentity(input.currentWorkspace),
    authorizedFrozenRevision: frozenRevision(input.authorizedWorkspace),
    currentFrozenRevision: frozenRevision(input.currentWorkspace),
    allowed: issues.length === 0,
    issues: canonicalIssues(issues),
    evaluatedAt: typeof input.evaluatedAt === "string" ? input.evaluatedAt : ""
  };
  return { ...receiptWithoutDigest, receiptDigest: receiptDigest(receiptWithoutDigest) };
}

export function validatePlannerPreExecutionSafetyReceipt(
  value: unknown,
  input: PlannerPreExecutionSafetyInput
): PlannerPreExecutionSafetyReceiptValidation {
  const issues: PlannerPreExecutionSafetyIssue[] = [];
  if (!isRecord(value)) {
    return { valid: false, issues: [{ id: "plan.pre_execution_safety.receipt_invalid", path: "$", message: "Safety receipt must be an object." }] };
  }

  const expected = evaluatePlannerPreExecutionSafety(input);
  if (value.schemaVersion !== expected.schemaVersion) {
    issue(issues, "plan.pre_execution_safety.receipt_invalid", "$.schemaVersion", "Unsupported pre-execution safety receipt schema.");
  }
  for (const key of [
    "planningPacketDigest",
    "executionPacketDigest",
    "planApprovalReceiptDigest",
    "executionApprovalReceiptDigest"
  ] as const) {
    if (typeof value[key] !== "string" || !digestPattern.test(value[key])) {
      issue(issues, "plan.pre_execution_safety.receipt_invalid", `$.${key}`, "Receipt digest must be a sha256 digest.");
    }
  }
  for (const key of [
    "authorizedWorkspaceIdentity",
    "currentWorkspaceIdentity",
    "authorizedFrozenRevision",
    "currentFrozenRevision"
  ] as const) {
    if (!nonEmpty(value[key])) issue(issues, "plan.pre_execution_safety.receipt_invalid", `$.${key}`, "Workspace binding must be non-empty.");
  }
  if (typeof value.allowed !== "boolean") issue(issues, "plan.pre_execution_safety.receipt_invalid", "$.allowed", "allowed must be boolean.");
  if (!validIssues(value.issues)) issue(issues, "plan.pre_execution_safety.receipt_invalid", "$.issues", "Issues must be canonically ordered safety issues.");
  if (!utc(value.evaluatedAt)) issue(issues, "plan.pre_execution_safety.receipt_invalid", "$.evaluatedAt", "evaluatedAt must be UTC ISO-8601.");
  if (typeof value.receiptDigest !== "string" || !digestPattern.test(value.receiptDigest)) issue(issues, "plan.pre_execution_safety.receipt_invalid", "$.receiptDigest", "receiptDigest must be a sha256 digest.");
  if (hasHandoffField(value)) issue(issues, "plan.pre_execution_safety.handoff_forbidden", "$", "Handoff fields and transports are forbidden in safety receipts.");
  if (!hasExactKeys(value, [
    "schemaVersion",
    "planningPacketDigest",
    "executionPacketDigest",
    "planApprovalReceiptDigest",
    "executionApprovalReceiptDigest",
    "authorizedWorkspaceIdentity",
    "currentWorkspaceIdentity",
    "authorizedFrozenRevision",
    "currentFrozenRevision",
    "allowed",
    "issues",
    "evaluatedAt",
    "receiptDigest",
    "signature"
  ])) {
    issue(issues, "plan.pre_execution_safety.receipt_invalid", "$", "Safety receipt must contain exactly the defined signed receipt fields.");
  }
  if (!signatureShape(value.signature)) {
    issue(issues, "plan.pre_execution_safety.receipt_invalid", "$.signature", "Safety receipt requires an Ed25519 signature envelope.");
  }

  const receipt = value as Partial<PlannerPreExecutionSafetyReceipt>;
  if (receipt.receiptDigest !== receiptDigest(value)) {
    issue(issues, "plan.pre_execution_safety.receipt_invalid", "$.receiptDigest", "Receipt digest does not match canonical content.");
  }
  if (!sameReceipt(receipt, expected)) {
    issue(issues, "plan.pre_execution_safety.receipt_binding_invalid", "$", "Receipt does not exactly bind the evaluated packets, approvals, workspace, revision, and issues.");
  }
  return { valid: issues.length === 0, issues: canonicalIssues(issues) };
}

type PlanApprovalReceiptShape = {
  readonly runId: string;
  readonly purpose: "plan";
  readonly bindings: {
    readonly packetDigest: string;
  };
};

type ExecutionApprovalReceiptShape = {
  readonly runId: string;
  readonly purpose: "execution";
  readonly bindings: {
    readonly planningPacketDigest: string;
    readonly planApprovalDigest: string;
    readonly executionPacketDigest: string;
  };
};

function validateBindings(
  issues: PlannerPreExecutionSafetyIssue[],
  planningPacket: PlanningPacket,
  executionPacket: ExecutionPacket,
  planApprovalReceipt: PlanApprovalReceiptShape,
  executionApprovalReceipt: ExecutionApprovalReceiptShape,
  planningPacketDigest: string,
  executionPacketDigest: string,
  planApprovalReceiptDigest: string
): void {
  if (planningPacket.packetDigest !== planningPacketDigest
    || executionPacket.planningPacketDigest !== planningPacketDigest
    || executionPacket.approvalReceiptDigest !== planApprovalReceiptDigest
    || planApprovalReceipt.runId !== planningPacket.runId
    || planApprovalReceipt.purpose !== "plan"
    || planApprovalReceipt.bindings.packetDigest !== planningPacketDigest) {
    issue(issues, "plan.pre_execution_safety.plan_binding_invalid", "$.planApprovalReceipt", "Planning packet and plan approval receipt must bind the same current plan.");
  }
  if (executionApprovalReceipt.runId !== planningPacket.runId
    || executionApprovalReceipt.purpose !== "execution"
    || executionApprovalReceipt.bindings.planningPacketDigest !== planningPacketDigest
    || executionApprovalReceipt.bindings.planApprovalDigest !== planApprovalReceiptDigest
    || executionApprovalReceipt.bindings.executionPacketDigest !== executionPacketDigest) {
    issue(issues, "plan.pre_execution_safety.execution_binding_invalid", "$.executionApprovalReceipt", "Execution approval receipt must bind the current plan, plan approval, and execution packet.");
  }
  if (planningPacket.review.structural !== "pass" || planningPacket.review.semantic !== "pass" || planningPacket.review.unresolvedFindings.length > 0
    || planningPacket.approvalPolicy.plan !== "required" || planningPacket.approvalPolicy.execution !== "required") {
    issue(issues, "plan.pre_execution_safety.approval_gate_missing", "$.planningPacket", "Execution requires passing reviews and separate required plan and execution approval gates.");
  }
}

function validateScope(issues: PlannerPreExecutionSafetyIssue[], planningPacket: PlanningPacket, executionPacket: ExecutionPacket): void {
  for (const path of executionPacket.allowedMutationPaths) {
    if (!planningPacket.scope.allowedPaths.some((allowed) => scopePathWithin(allowed, path))) {
      issue(issues, "plan.pre_execution_safety.scope_expanded", "$.executionPacket.allowedMutationPaths", "Execution allowed paths must equal or narrow planning allowed paths.");
      break;
    }
  }
  const requiredForbidden = [...planningPacket.scope.forbiddenPaths, ...planningPacket.scope.protectedPaths];
  for (const path of requiredForbidden) {
    if (!executionPacket.forbiddenPaths.includes(path)) {
      issue(issues, "plan.pre_execution_safety.protection_weakened", "$.executionPacket.forbiddenPaths", "Execution forbidden paths must retain every planning forbidden and protected path.");
      break;
    }
  }
}

function validateRisks(issues: PlannerPreExecutionSafetyIssue[], planningPacket: PlanningPacket, executionPacket: ExecutionPacket): void {
  const executionRiskById = new Map(executionPacket.risks.map((risk) => [risk.id, risk]));
  for (const risk of planningPacket.risks) {
    if (risk.severity !== "high" && risk.severity !== "critical") continue;
    const executionRisk = executionRiskById.get(risk.id);
    if (!nonEmpty(risk.mitigation) || !nonEmpty(risk.rollback) || risk.approvalGate === "none"
      || !executionRisk
      || executionRisk.severity !== risk.severity
      || !nonEmpty(executionRisk.mitigation)
      || !nonEmpty(executionRisk.rollback)
      || !executionRisk.approvalGate
      || executionRisk.approvalGate === "none") {
      issue(issues, "plan.pre_execution_safety.high_risk_control_missing", `$.executionPacket.risks.${risk.id}`, "High and critical risks require matching mitigation, rollback, and approval gates.");
    }
  }
  for (const risk of executionPacket.risks) {
    if (risk.severity === "high" || risk.severity === "critical") {
      if (!nonEmpty(risk.mitigation) || !nonEmpty(risk.rollback) || !risk.approvalGate || risk.approvalGate === "none") {
        issue(issues, "plan.pre_execution_safety.high_risk_control_missing", `$.executionPacket.risks.${risk.id}`, "High and critical risks require mitigation, rollback, and approval gates.");
      }
    }
  }
  const controls = new Set(executionPacket.riskControls.map((control) => `${control.taskId}\u0000${control.riskId}`));
  for (const task of executionPacket.orderedTasks) {
    for (const risk of executionPacket.risks) {
      if (!controls.has(`${task.id}\u0000${risk.id}`)) {
        issue(issues, "plan.pre_execution_safety.risk_control_incomplete", "$.executionPacket.riskControls", "Every execution task requires a control for every execution risk.");
        return;
      }
    }
  }
}

function validateTraceability(issues: PlannerPreExecutionSafetyIssue[], planningPacket: PlanningPacket, executionPacket: ExecutionPacket): void {
  const planningTasks = new Map(planningPacket.tasks.map((task) => [task.id, task]));
  const executionTaskPlanningIds = executionPacket.orderedTasks.map((task) => task.planningTaskId);
  const executionTaskIds = executionPacket.orderedTasks.map((task) => task.id);
  const evidenceTaskIds = executionPacket.evidenceRequirements.map((requirement) => requirement.taskId);
  if (!exactOneToOne([...planningTasks.keys()], executionTaskPlanningIds)
    || new Set(executionTaskIds).size !== executionTaskIds.length
    || !exactOneToOne(executionTaskIds, evidenceTaskIds)) {
    issue(issues, "plan.pre_execution_safety.traceability_incomplete", "$.executionPacket.orderedTasks", "Execution must retain exactly one traceable task and evidence mapping for every planning task.");
    return;
  }
  const criteria = new Map(executionPacket.acceptanceCriteria.map((criterion) => [criterion.id, criterion]));
  const evidence = new Map(executionPacket.evidenceRequirements.map((requirement) => [requirement.taskId, requirement.evidenceIds]));
  for (const task of executionPacket.orderedTasks) {
    const planningTask = planningTasks.get(task.planningTaskId)!;
    const taskEvidence = evidence.get(task.id);
    const acceptedCriteria = task.acceptanceIds.map((id) => criteria.get(id));
    if (!sameMembers(task.acceptanceIds, planningTask.acceptanceIds)
      || !sameMembers(task.verificationIds, planningTask.verificationIds)
      || !sameMembers(taskEvidence ?? [], planningTask.evidenceIds)
      || acceptedCriteria.some((criterion) => !criterion)
      || !taskEvidence
      || !acceptedCriteria.every((criterion) => criterion!.verificationIds.every((id) => task.verificationIds.includes(id))
        && criterion!.evidenceIds.every((id) => taskEvidence.includes(id)))) {
      issue(issues, "plan.pre_execution_safety.traceability_incomplete", `$.executionPacket.orderedTasks.${task.id}`, "Every task must retain complete acceptance, verification, and evidence traceability.");
      return;
    }
  }
}

function workspaceIssues(input: PlannerPreExecutionSafetyInput): readonly PlannerPreExecutionSafetyIssue[] {
  const issues: PlannerPreExecutionSafetyIssue[] = [];
  const authorizedIdentity = workspaceIdentity(input.authorizedWorkspace);
  const currentIdentity = workspaceIdentity(input.currentWorkspace);
  const authorizedRevision = frozenRevision(input.authorizedWorkspace);
  const currentRevision = frozenRevision(input.currentWorkspace);
  if (!nonEmpty(authorizedIdentity) || !nonEmpty(currentIdentity) || authorizedIdentity !== currentIdentity) {
    issue(issues, "plan.pre_execution_safety.workspace_mismatch", "$.currentWorkspace.identity", "Current workspace must exactly match the authorized workspace identity.");
  }
  if (!nonEmpty(authorizedRevision) || !nonEmpty(currentRevision) || authorizedRevision !== currentRevision) {
    issue(issues, "plan.pre_execution_safety.revision_mismatch", "$.currentWorkspace.frozenRevision", "Current workspace must exactly match the authorized frozen revision.");
  }
  if (!utc(input.evaluatedAt)) issue(issues, "plan.pre_execution_safety.evaluated_at_invalid", "$.evaluatedAt", "evaluatedAt must be UTC ISO-8601.");
  return issues;
}

export function canonicalPlannerPreExecutionSafetyReceiptUnsignedPayload(receipt: unknown): string {
  return canonicalizePlanningValue(receipt);
}

export function canonicalPlannerPreExecutionSafetyReceiptSigningPayload(receipt: PlannerPreExecutionSafetyReceipt): string {
  const { signature: _signature, ...signedReceipt } = receipt;
  return canonicalizePlanningValue({
    domain: "boulder.planner-pre-execution-safety-receipt-signature.v1",
    payload: signedReceipt
  });
}

export function finalizePlannerPreExecutionSafetyReceipt(
  receipt: Omit<PlannerPreExecutionSafetyReceipt, "signature">,
  signature: PlannerPreExecutionSafetySignatureEnvelope
): PlannerPreExecutionSafetyReceipt {
  return { ...receipt, signature };
}

function receiptDigest(value: Record<string, unknown>): string {
  const { receiptDigest: _receiptDigest, signature: _signature, ...unsignedReceipt } = value;
  return sha256Digest(canonicalPlannerPreExecutionSafetyReceiptUnsignedPayload(unsignedReceipt));
}

function sameReceipt(receipt: Partial<PlannerPreExecutionSafetyReceipt>, expected: PlannerPreExecutionSafetyReceipt): boolean {
  return receipt.planningPacketDigest === expected.planningPacketDigest
    && receipt.executionPacketDigest === expected.executionPacketDigest
    && receipt.planApprovalReceiptDigest === expected.planApprovalReceiptDigest
    && receipt.executionApprovalReceiptDigest === expected.executionApprovalReceiptDigest
    && receipt.authorizedWorkspaceIdentity === expected.authorizedWorkspaceIdentity
    && receipt.currentWorkspaceIdentity === expected.currentWorkspaceIdentity
    && receipt.authorizedFrozenRevision === expected.authorizedFrozenRevision
    && receipt.currentFrozenRevision === expected.currentFrozenRevision
    && receipt.allowed === expected.allowed
    && receipt.evaluatedAt === expected.evaluatedAt
    && receipt.receiptDigest === expected.receiptDigest
    && sameIssues(receipt.issues, expected.issues);
}

function validIssues(value: unknown): value is readonly PlannerPreExecutionSafetyIssue[] {
  return Array.isArray(value)
    && value.every((entry) => isRecord(entry) && nonEmpty(entry.id) && typeof entry.path === "string" && nonEmpty(entry.message))
    && sameIssues(value as readonly PlannerPreExecutionSafetyIssue[], canonicalIssues(value as readonly PlannerPreExecutionSafetyIssue[]));
}

function sameIssues(left: unknown, right: readonly PlannerPreExecutionSafetyIssue[]): boolean {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((issue, index) => isRecord(issue)
      && issue.id === right[index]?.id
      && issue.path === right[index]?.path
      && issue.message === right[index]?.message);
}

function canonicalIssues(issues: readonly PlannerPreExecutionSafetyIssue[]): readonly PlannerPreExecutionSafetyIssue[] {
  return [...issues].sort((left, right) => `${left.id}\u0000${left.path}\u0000${left.message}`.localeCompare(`${right.id}\u0000${right.path}\u0000${right.message}`));
}

function hasHandoffField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasHandoffField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => handoffKeyPattern.test(normalizeKey(key)) || hasHandoffField(nested));
}

function normalizeKey(value: string): string {
  return value.normalize("NFKC").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function hasGlob(value: string): boolean {
  return value.includes("*") || value.includes("?");
}
function scopePathWithin(allowed: string, candidate: string): boolean {
  if (allowed === candidate || allowed === "**") return true;
  if (!hasGlob(candidate) && globMatches(allowed, candidate)) return true;
  return allowed.endsWith("/**") && candidate.startsWith(allowed.slice(0, -2));
}

function workspaceIdentity(value: unknown): string {
  return isRecord(value) && typeof value.identity === "string" ? value.identity : "";
}

function frozenRevision(value: unknown): string {
  return isRecord(value) && typeof value.frozenRevision === "string" ? value.frozenRevision : "";
}

function exactOneToOne(expectedIds: readonly string[], mappedIds: readonly string[]): boolean {
  return expectedIds.length === mappedIds.length
    && new Set(expectedIds).size === expectedIds.length
    && new Set(mappedIds).size === mappedIds.length
    && mappedIds.every((id) => expectedIds.includes(id));
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && new Set(left).size === left.length
    && new Set(right).size === right.length
    && left.every((value) => right.includes(value))
    && right.every((value) => left.includes(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function signatureShape(value: unknown): value is PlannerPreExecutionSafetySignatureEnvelope {
  return isRecord(value)
    && hasExactKeys(value, ["algorithm", "keyId", "signature"])
    && value.algorithm === "Ed25519"
    && nonEmpty(value.keyId)
    && typeof value.signature === "string"
    && /^[A-Za-z0-9_-]{86}$/.test(value.signature);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function utc(value: unknown): value is string {
  return typeof value === "string" && value.endsWith("Z") && !Number.isNaN(Date.parse(value));
}

function issue(issues: PlannerPreExecutionSafetyIssue[], id: string, path: string, message: string): void {
  issues.push({ id, path, message });
}
