import { planningDigest, type PlanningEnvelope, type PlanningValidationIssue, type PlanningValidationResult } from "./planning-canonical.js";
import { globMatches, globPatternsIntersect } from "./path-glob.js";

export type VerificationSource = "manifest" | "package-script" | "user-approved" | "planner-proposed" | "repo-text";

export interface PlanningPacket extends PlanningEnvelope {
  readonly schemaVersion: "boulder.planning-packet.v1";
  readonly task: { readonly rawTaskHash: string; readonly normalizedSummary: string; readonly profileId: string; readonly analysisRef: string };
  readonly objective: string;
  readonly decisions: readonly { readonly id: string; readonly statement: string; readonly source: "maintainer" | "default" | "inferred"; readonly sourceRefs: readonly string[]; readonly confidence: "low" | "medium" | "high" }[];
  readonly scope: { readonly allowedPaths: readonly string[]; readonly forbiddenPaths: readonly string[]; readonly protectedPaths: readonly string[]; readonly nonGoals: readonly string[] };
  readonly tasks: readonly { readonly id: string; readonly title: string; readonly dependsOn: readonly string[]; readonly paths: readonly string[]; readonly steps: readonly string[]; readonly acceptanceIds: readonly string[]; readonly verificationIds: readonly string[]; readonly evidenceIds: readonly string[] }[];
  readonly acceptanceCriteria: readonly { readonly id: string; readonly statement: string; readonly verificationIds: readonly string[]; readonly evidenceIds: readonly string[] }[];
  readonly verification: readonly { readonly id: string; readonly kind: "command" | "scenario" | "inspection"; readonly command?: string; readonly scenario?: string; readonly source: VerificationSource; readonly required: boolean; readonly evidencePath: string }[];
  readonly risks: readonly { readonly id: string; readonly severity: "low" | "medium" | "high" | "critical"; readonly trigger: string; readonly mitigation: string; readonly rollback: string; readonly approvalGate: "none" | "plan" | "execution" | "external" }[];
  readonly approvalPolicy: { readonly plan: "required" | "not-required"; readonly execution: "required" | "not-required"; readonly external: "required" | "not-required" | "required-if-used" };
  readonly review: { readonly structural: "pending" | "pass" | "fail"; readonly semantic: "pending" | "pass" | "fail"; readonly unresolvedFindings: readonly string[] };
}

const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const trustedCommandSources = new Set<VerificationSource>(["manifest", "package-script", "user-approved"]);
const securityGroundsPattern = /\bsecur(?:ity|e|ed|ing)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function issue(issues: PlanningValidationIssue[], id: string, path: string, message: string): void {
  issues.push({ id, path, message });
}

function validPath(path: unknown): path is string {
  return typeof path === "string" && path.length > 0 && !path.startsWith("/") && !path.includes("\\") && !/^[A-Za-z]:/.test(path) && path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function overlaps(first: string, second: string): boolean {
  return globPatternsIntersect(first.toLowerCase(), second.toLowerCase());
}

function ids(items: unknown, path: string, issues: PlanningValidationIssue[]): Set<string> {
  const result = new Set<string>();
  if (!Array.isArray(items)) {
    issue(issues, "plan.packet.invalid", path, "Expected an array.");
    return result;
  }
  items.forEach((item, index) => {
    const id = isRecord(item) ? item.id : undefined;
    if (!nonEmpty(id)) issue(issues, "plan.packet.invalid", `${path}[${index}].id`, "Expected a non-empty id.");
    else if (result.has(id)) issue(issues, "plan.reference.missing", `${path}[${index}].id`, "Ids must be unique.");
    else result.add(id);
  });
  return result;
}

function references(values: unknown, known: Set<string>, path: string, issues: PlanningValidationIssue[]): void {
  if (!Array.isArray(values)) {
    issue(issues, "plan.packet.invalid", path, "Expected an array of ids.");
    return;
  }
  values.forEach((value, index) => {
    if (!nonEmpty(value) || !known.has(value)) issue(issues, "plan.reference.missing", `${path}[${index}]`, "Referenced id does not exist.");
  });
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function hasUniqueNonEmptyIds(items: unknown): boolean {
  if (!Array.isArray(items)) return false;
  const seen = new Set<string>();
  return items.every((item) => {
    const id = isRecord(item) ? item.id : undefined;
    if (!nonEmpty(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}


function isPlanningPacket(value: unknown): value is PlanningPacket {
  if (!isRecord(value)) return false;
  return value.schemaVersion === "boulder.planning-packet.v1"
    && nonEmpty(value.runId)
    && nonEmpty(value.createdAt)
    && nonEmpty(value.packetDigest)
    && isRecord(value.producer)
    && nonEmpty(value.producer.adapter)
    && (value.producer.mode === "direct" || value.producer.mode === "focused" || value.producer.mode === "deep")
    && nonEmpty(value.producer.host)
    && nonEmpty(value.producer.toolVersion)
    && (value.producer.model === undefined || typeof value.producer.model === "string")
    && Array.isArray(value.sourceRefs)
    && value.sourceRefs.every((ref) => isRecord(ref)
      && nonEmpty(ref.id)
      && validPath(ref.path)
      && nonEmpty(ref.sha256)
      && (ref.kind === "code" || ref.kind === "test" || ref.kind === "manifest" || ref.kind === "documentation" || ref.kind === "policy")
      && (ref.trust === "operator-contract" || ref.trust === "repo-instruction" || ref.trust === "repo-evidence" || ref.trust === "official-external" || ref.trust === "untrusted-external")
      && (ref.symbol === undefined || typeof ref.symbol === "string")
      && (ref.lineHint === undefined || typeof ref.lineHint === "string"))
    && isRecord(value.task)
    && nonEmpty(value.task.rawTaskHash)
    && nonEmpty(value.task.normalizedSummary)
    && nonEmpty(value.task.profileId)
    && nonEmpty(value.task.analysisRef)
    && nonEmpty(value.objective)
    && Array.isArray(value.decisions)
    && value.decisions.every((decision) => isRecord(decision)
      && nonEmpty(decision.id)
      && nonEmpty(decision.statement)
      && (decision.source === "maintainer" || decision.source === "default" || decision.source === "inferred")
      && isStringArray(decision.sourceRefs)
      && (decision.confidence === "low" || decision.confidence === "medium" || decision.confidence === "high"))
    && isRecord(value.scope)
    && isStringArray(value.scope.allowedPaths)
    && isStringArray(value.scope.forbiddenPaths)
    && isStringArray(value.scope.protectedPaths)
    && isStringArray(value.scope.nonGoals)
    && Array.isArray(value.tasks)
    && value.tasks.every((task) => isRecord(task)
      && nonEmpty(task.id)
      && nonEmpty(task.title)
      && isStringArray(task.dependsOn)
      && isStringArray(task.paths)
      && isStringArray(task.steps)
      && isStringArray(task.acceptanceIds)
      && isStringArray(task.verificationIds)
      && isStringArray(task.evidenceIds))
    && Array.isArray(value.acceptanceCriteria)
    && value.acceptanceCriteria.every((criterion) => isRecord(criterion)
      && nonEmpty(criterion.id)
      && nonEmpty(criterion.statement)
      && isStringArray(criterion.verificationIds)
      && isStringArray(criterion.evidenceIds))
    && Array.isArray(value.verification)
    && value.verification.every((verification) => isRecord(verification)
      && nonEmpty(verification.id)
      && (verification.kind === "command" || verification.kind === "scenario" || verification.kind === "inspection")
      && (verification.command === undefined || typeof verification.command === "string")
      && (verification.scenario === undefined || typeof verification.scenario === "string")
      && (verification.source === "manifest" || verification.source === "package-script" || verification.source === "user-approved" || verification.source === "planner-proposed" || verification.source === "repo-text")
      && typeof verification.required === "boolean"
      && validPath(verification.evidencePath))
    && Array.isArray(value.risks)
    && value.risks.every((risk) => isRecord(risk)
      && nonEmpty(risk.id)
      && (risk.severity === "low" || risk.severity === "medium" || risk.severity === "high" || risk.severity === "critical")
      && nonEmpty(risk.trigger)
      && nonEmpty(risk.mitigation)
      && nonEmpty(risk.rollback)
      && (risk.approvalGate === "none" || risk.approvalGate === "plan" || risk.approvalGate === "execution" || risk.approvalGate === "external"))
    && hasUniqueNonEmptyIds(value.risks)
    && isRecord(value.approvalPolicy)
    && (value.approvalPolicy.plan === "required" || value.approvalPolicy.plan === "not-required")
    && (value.approvalPolicy.execution === "required" || value.approvalPolicy.execution === "not-required")
    && (value.approvalPolicy.external === "required" || value.approvalPolicy.external === "not-required" || value.approvalPolicy.external === "required-if-used")
    && isRecord(value.review)
    && (value.review.structural === "pending" || value.review.structural === "pass" || value.review.structural === "fail")
    && (value.review.semantic === "pending" || value.review.semantic === "pass" || value.review.semantic === "fail")
    && isStringArray(value.review.unresolvedFindings);
}

export function validatePlanningPacket(value: unknown): PlanningValidationResult<PlanningPacket> {
  const issues: PlanningValidationIssue[] = [];
  if (!isRecord(value)) return { valid: false, issues: [{ id: "plan.packet.invalid", path: "$", message: "Packet must be an object." }] };
  const packet = value;
  if (packet.schemaVersion !== "boulder.planning-packet.v1") issue(issues, "plan.schema.unsupported", "$.schemaVersion", "Unsupported planning packet schema.");
  if (!nonEmpty(packet.runId) || !runIdPattern.test(packet.runId)) issue(issues, "plan.run_id.invalid", "$.runId", "Run id must be a safe slug.");
  if (!nonEmpty(packet.createdAt) || Number.isNaN(Date.parse(packet.createdAt)) || !packet.createdAt.endsWith("Z")) issue(issues, "plan.packet.invalid", "$.createdAt", "createdAt must be UTC ISO-8601.");
  if (!nonEmpty(packet.packetDigest) || !digestPattern.test(packet.packetDigest) || packet.packetDigest !== planningDigest(value)) issue(issues, "plan.packet.invalid", "$.packetDigest", "Packet digest does not match canonical content.");
  if (!isRecord(packet.producer) || !nonEmpty(packet.producer.adapter) || !["direct", "focused", "deep"].includes(packet.producer.mode as string) || !nonEmpty(packet.producer.host) || !nonEmpty(packet.producer.toolVersion)) issue(issues, "plan.packet.invalid", "$.producer", "Producer must contain adapter, mode, host, and toolVersion.");
  if (!isRecord(packet.task) || !nonEmpty(packet.task.rawTaskHash) || !nonEmpty(packet.task.normalizedSummary) || !nonEmpty(packet.task.profileId) || !nonEmpty(packet.task.analysisRef)) issue(issues, "plan.packet.invalid", "$.task", "Task fields are required.");
  if (!nonEmpty(packet.objective)) issue(issues, "plan.objective.missing", "$.objective", "Objective is required.");

  const sourceIds = ids(packet.sourceRefs, "$.sourceRefs", issues);
  if (Array.isArray(packet.sourceRefs)) packet.sourceRefs.forEach((ref, index) => {
    if (!isRecord(ref) || !validPath(ref.path) || !nonEmpty(ref.sha256) || !digestPattern.test(ref.sha256)) issue(issues, "plan.packet.invalid", `$.sourceRefs[${index}]`, "Source references require a safe path and sha256 digest.");
  });
  const sourceTrustById = new Map<string, string>();
  if (Array.isArray(packet.sourceRefs)) packet.sourceRefs.forEach((ref) => {
    if (isRecord(ref) && nonEmpty(ref.id) && typeof ref.trust === "string") sourceTrustById.set(ref.id, ref.trust);
  });
  const hasTrustedEvidence = (sourceRefs: unknown): boolean => Array.isArray(sourceRefs)
    && sourceRefs.some((sourceRef) => {
      const trust = sourceTrustById.get(sourceRef);
      return trust !== undefined && trust !== "untrusted-external";
    });
  const hasSecurityGrounds = (decision: Record<string, unknown>): boolean => typeof decision.statement === "string"
    && securityGroundsPattern.test(decision.statement);
  if (!Array.isArray(packet.decisions)) issue(issues, "plan.packet.invalid", "$.decisions", "Expected decisions.");
  else packet.decisions.forEach((decision, index) => {
    if (!isRecord(decision) || !nonEmpty(decision.id) || !nonEmpty(decision.statement) || !["maintainer", "default", "inferred"].includes(decision.source as string) || !["low", "medium", "high"].includes(decision.confidence as string)) issue(issues, "plan.packet.invalid", `$.decisions[${index}]`, "Decision is invalid.");
    else {
      references(decision.sourceRefs, sourceIds, `$.decisions[${index}].sourceRefs`, issues);
      if ((decision.source === "maintainer" || hasSecurityGrounds(decision))
        && !hasTrustedEvidence(decision.sourceRefs)) {
        issue(issues, "plan.decision.untrusted_basis", `$.decisions[${index}].sourceRefs`, "Owner decisions and security grounds require trusted evidence.");
      }
    }
  });

  if (!isRecord(packet.scope)) issue(issues, "plan.packet.invalid", "$.scope", "Scope is required.");
  else {
    const scope = packet.scope;
    for (const key of ["allowedPaths", "forbiddenPaths", "protectedPaths"] as const) {
      if (!Array.isArray(scope[key])) issue(issues, "plan.packet.invalid", `$.scope.${key}`, "Expected paths.");
      else scope[key].forEach((path, index) => { if (!validPath(path)) issue(issues, "plan.scope.path_invalid", `$.scope.${key}[${index}]`, "Path must be workspace-relative and safe."); });
    }
    if (!Array.isArray(scope.nonGoals) || scope.nonGoals.some((goal) => !nonEmpty(goal))) issue(issues, "plan.packet.invalid", "$.scope.nonGoals", "Non-goals are required.");
    if (Array.isArray(scope.allowedPaths) && Array.isArray(scope.protectedPaths)) for (const allowed of scope.allowedPaths) for (const protectedPath of scope.protectedPaths) if (typeof allowed === "string" && typeof protectedPath === "string" && overlaps(allowed, protectedPath)) issue(issues, "plan.scope.protected_conflict", "$.scope.allowedPaths", "Allowed paths may not overlap protected paths.");
  }

  const taskIds = ids(packet.tasks, "$.tasks", issues);
  const acceptanceIds = ids(packet.acceptanceCriteria, "$.acceptanceCriteria", issues);
  const verificationIds = ids(packet.verification, "$.verification", issues);
  ids(packet.risks, "$.risks", issues);
  const evidenceIds = new Set<string>();
  if (Array.isArray(packet.acceptanceCriteria)) packet.acceptanceCriteria.forEach((criterion) => {
    if (isRecord(criterion) && Array.isArray(criterion.evidenceIds)) criterion.evidenceIds.filter(nonEmpty).forEach((id) => evidenceIds.add(id));
  });
  const hasMutationTask = Array.isArray(packet.tasks) && packet.tasks.some((task) => isRecord(task) && Array.isArray(task.paths) && task.paths.length > 0);
  if (Array.isArray(packet.tasks)) packet.tasks.forEach((task, index) => {
    if (!isRecord(task) || !nonEmpty(task.title) || !Array.isArray(task.paths) || !Array.isArray(task.steps) || task.paths.some((path) => !validPath(path)) || task.steps.some((step) => !nonEmpty(step))) issue(issues, "plan.packet.invalid", `$.tasks[${index}]`, "Task fields are invalid.");
    else {
      references(task.dependsOn, taskIds, `$.tasks[${index}].dependsOn`, issues);
      references(task.acceptanceIds, acceptanceIds, `$.tasks[${index}].acceptanceIds`, issues);
      references(task.verificationIds, verificationIds, `$.tasks[${index}].verificationIds`, issues);
      if (!Array.isArray(task.evidenceIds) || task.evidenceIds.some((id) => !nonEmpty(id))) issue(issues, "plan.reference.missing", `$.tasks[${index}].evidenceIds`, "Evidence ids are required.");
      else references(task.evidenceIds, evidenceIds, `$.tasks[${index}].evidenceIds`, issues);
      if (isRecord(packet.scope)) {
        const allowedPaths = packet.scope.allowedPaths;
        const forbiddenPaths = packet.scope.forbiddenPaths;
        const protectedPaths = packet.scope.protectedPaths;
        if (Array.isArray(allowedPaths) && Array.isArray(forbiddenPaths) && Array.isArray(protectedPaths)) task.paths.forEach((path, pathIndex) => {
          if (!allowedPaths.some((allowedPath: unknown) => typeof allowedPath === "string" && globMatches(allowedPath.toLowerCase(), path.toLowerCase()))) issue(issues, "plan.scope.out_of_scope", `$.tasks[${index}].paths[${pathIndex}]`, "Mutation path must be contained by allowed paths.");
          if (forbiddenPaths.some((forbiddenPath: unknown) => typeof forbiddenPath === "string" && globMatches(forbiddenPath.toLowerCase(), path.toLowerCase()))) issue(issues, "plan.scope.forbidden_conflict", `$.tasks[${index}].paths[${pathIndex}]`, "Mutation path may not overlap forbidden paths.");
          if (protectedPaths.some((protectedPath: unknown) => typeof protectedPath === "string" && globMatches(protectedPath.toLowerCase(), path.toLowerCase()))) issue(issues, "plan.scope.protected_conflict", `$.tasks[${index}].paths[${pathIndex}]`, "Mutation path may not overlap protected paths.");
        });
      }
    }
  });
  if (Array.isArray(packet.tasks)) {
    const taskById = new Map(packet.tasks.filter(isRecord).filter((task): task is Record<string, unknown> & { id: string } => nonEmpty(task.id)).map((task) => [task.id, task]));
    const visiting = new Set<string>(); const visited = new Set<string>();
    const visit = (id: string): void => { if (visiting.has(id)) { issue(issues, "plan.graph.cycle", "$.tasks", "Task dependencies must form a DAG."); return; } if (visited.has(id)) return; visiting.add(id); const dependencies = taskById.get(id)?.dependsOn; if (Array.isArray(dependencies)) dependencies.filter(nonEmpty).forEach((dependency) => { if (taskById.has(dependency)) visit(dependency); }); visiting.delete(id); visited.add(id); };
    taskById.forEach((_task, id) => visit(id));
  }
  if (Array.isArray(packet.acceptanceCriteria)) packet.acceptanceCriteria.forEach((criterion, index) => {
    if (!isRecord(criterion) || !nonEmpty(criterion.statement)) issue(issues, "plan.packet.invalid", `$.acceptanceCriteria[${index}]`, "Acceptance criterion is invalid.");
    else { references(criterion.verificationIds, verificationIds, `$.acceptanceCriteria[${index}].verificationIds`, issues); if (!Array.isArray(criterion.evidenceIds) || criterion.evidenceIds.length === 0 || criterion.evidenceIds.some((id) => !nonEmpty(id))) issue(issues, "plan.acceptance.untraceable", `$.acceptanceCriteria[${index}].evidenceIds`, "Acceptance requires evidence."); if (!Array.isArray(criterion.verificationIds) || criterion.verificationIds.length === 0) issue(issues, "plan.acceptance.untraceable", `$.acceptanceCriteria[${index}].verificationIds`, "Acceptance requires verification."); }
  });
  if (Array.isArray(packet.acceptanceCriteria) && Array.isArray(packet.tasks)) {
    const taskEvidenceIds = new Set<string>();
    packet.tasks.forEach((task) => {
      if (isRecord(task) && Array.isArray(task.evidenceIds)) task.evidenceIds.filter(nonEmpty).forEach((id) => taskEvidenceIds.add(id));
    });
    evidenceIds.forEach((id) => {
      if (!taskEvidenceIds.has(id)) issue(issues, "plan.acceptance.untraceable", "$.acceptanceCriteria", `Required evidence ${id} is not traced by a task.`);
    });
  }
  if (Array.isArray(packet.verification)) packet.verification.forEach((verification, index) => {
    if (!isRecord(verification) || !nonEmpty(verification.id) || !["command", "scenario", "inspection"].includes(verification.kind as string) || typeof verification.required !== "boolean" || !validPath(verification.evidencePath)) issue(issues, "plan.packet.invalid", `$.verification[${index}]`, "Verification is invalid.");
    else { if (verification.kind === "command" && (!nonEmpty(verification.command) || !trustedCommandSources.has(verification.source as VerificationSource))) issue(issues, "plan.verification.command_untrusted", `$.verification[${index}]`, "Commands require a trusted source."); if (verification.kind === "scenario" && !nonEmpty(verification.scenario)) issue(issues, "plan.packet.invalid", `$.verification[${index}].scenario`, "Scenarios require a description."); }
  });
  if (!Array.isArray(packet.risks)) issue(issues, "plan.packet.invalid", "$.risks", "Expected risks.");
  else packet.risks.forEach((risk, index) => { if (!isRecord(risk) || !nonEmpty(risk.id) || !["low", "medium", "high", "critical"].includes(risk.severity as string) || !nonEmpty(risk.trigger) || !nonEmpty(risk.mitigation) || !nonEmpty(risk.rollback) || !["none", "plan", "execution", "external"].includes(risk.approvalGate as string)) issue(issues, "plan.packet.invalid", `$.risks[${index}]`, "Risk is invalid."); else if ((risk.severity === "high" || risk.severity === "critical") && risk.approvalGate === "none") issue(issues, "plan.risk.override_unhandled", `$.risks[${index}]`, "High risks require an approval gate."); });
  if (!isRecord(packet.approvalPolicy) || !["required", "not-required"].includes(packet.approvalPolicy.plan as string) || !["required", "not-required"].includes(packet.approvalPolicy.execution as string) || !["required", "not-required", "required-if-used"].includes(packet.approvalPolicy.external as string)) issue(issues, "plan.packet.invalid", "$.approvalPolicy", "Approval policy is invalid.");
  else if (hasMutationTask && (packet.approvalPolicy.plan !== "required" || packet.approvalPolicy.execution !== "required")) issue(issues, "plan.approval.mutation_required", "$.approvalPolicy", "Mutation tasks require plan and execution approval.");
  if (!isRecord(packet.review) || !["pending", "pass", "fail"].includes(packet.review.structural as string) || !["pending", "pass", "fail"].includes(packet.review.semantic as string) || !Array.isArray(packet.review.unresolvedFindings)) issue(issues, "plan.packet.invalid", "$.review", "Review is invalid.");
  if (issues.length > 0) return { valid: false, issues };
  if (!isPlanningPacket(packet)) {
    return { valid: false, issues: [{ id: "plan.packet.invalid", path: "$", message: "Packet has invalid field types." }] };
  }
  return { valid: true, value: packet, issues };
}
