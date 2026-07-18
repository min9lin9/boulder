export type ExecutionPacketIssueCode =
  | "plan.execution_packet.schema_invalid"
  | "plan.execution_packet.digest_invalid"
  | "plan.execution_packet.path_invalid"
  | "plan.execution_packet.task_invalid"
  | "plan.execution_packet.verification_untrusted"
  | "plan.execution_packet.approval_invalid";

export interface ExecutionPacketIssue {
  readonly code: ExecutionPacketIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface ExecutionPacketRisk {
  readonly id: string;
  readonly severity?: "low" | "medium" | "high" | "critical";
  readonly trigger?: string;
  readonly mitigation?: string;
  readonly rollback?: string;
  readonly approvalGate?: "none" | "plan" | "execution" | "external";
}

export interface ExecutionPacketTask {
  readonly id: string;
  readonly planningTaskId: string;
  readonly dependsOn: readonly string[];
  readonly paths: readonly string[];
  readonly steps: readonly string[];
  readonly acceptanceIds: readonly string[];
  readonly verificationIds: readonly string[];
}

export interface ExecutionVerificationCommand {
  readonly id: string;
  readonly command: string;
  readonly source: "manifest" | "package-script" | "user-approved";
}
export interface ExecutionAcceptanceCriterion {
  readonly id: string;
  readonly verificationIds: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface ExecutionPacket {
  readonly schemaVersion: "boulder.execution-packet.v1";
  readonly planningPacketDigest: string;
  readonly approvalReceiptDigest: string;
  readonly objective: string;
  readonly allowedMutationPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly nonGoals: readonly string[];
  readonly orderedTasks: readonly ExecutionPacketTask[];
  readonly acceptanceCriteria: readonly ExecutionAcceptanceCriterion[];
  readonly verificationCommands: readonly ExecutionVerificationCommand[];
  readonly evidenceRequirements: readonly { readonly taskId: string; readonly evidenceIds: readonly string[] }[];
  readonly risks: readonly ExecutionPacketRisk[];
  readonly riskControls: readonly { readonly taskId: string; readonly riskId: string; readonly control: string }[];
  readonly rollback: readonly string[];
  readonly executionApproval: { readonly required: true; readonly schemaVersion: "boulder.execution-approval.v1" };
}

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const safeRelativePath = (value: unknown): value is string => typeof value === "string"
  && value.length > 0
  && !value.startsWith("/")
  && !value.startsWith("\\")
  && !/^[A-Za-z]:[\\/]/.test(value)
  && !value.includes("\\")
  && !value.split("/").some((part) => part.length === 0 || part === "." || part === "..");

function globMatches(pattern: string, path: string): boolean {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        if (pattern[index + 2] === "/") {
          expression += "(?:[^/]+/)*";
          index += 2;
        } else {
          expression += ".*";
          index += 1;
        }
      } else {
        expression += "[^/]*";
      }
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${expression}$`).test(path);
}

const issue = (code: ExecutionPacketIssueCode, path: string, message: string): ExecutionPacketIssue => ({ code, path, message });

export function validateExecutionPacket(value: unknown): readonly ExecutionPacketIssue[] {
  const issues: ExecutionPacketIssue[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [issue("plan.execution_packet.schema_invalid", "$", "Execution packet must be an object.")];
  }
  const packet = value as Record<string, unknown>;
  if (packet.schemaVersion !== "boulder.execution-packet.v1") issues.push(issue("plan.execution_packet.schema_invalid", "schemaVersion", "Unsupported execution packet schema."));
  for (const key of ["planningPacketDigest", "approvalReceiptDigest"] as const) {
    if (typeof packet[key] !== "string" || !digestPattern.test(packet[key])) issues.push(issue("plan.execution_packet.digest_invalid", key, "Expected a sha256 digest."));
  }
  if (typeof packet.objective !== "string" || packet.objective.trim().length === 0) issues.push(issue("plan.execution_packet.schema_invalid", "objective", "Objective must be non-empty."));
  for (const key of ["allowedMutationPaths", "forbiddenPaths"] as const) {
    if (!Array.isArray(packet[key]) || packet[key].some((entry) => !safeRelativePath(entry))) issues.push(issue("plan.execution_packet.path_invalid", key, "Paths must be non-empty safe relative POSIX paths."));
  }
  if (!Array.isArray(packet.nonGoals) || packet.nonGoals.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) issues.push(issue("plan.execution_packet.schema_invalid", "nonGoals", "Non-goals must be non-empty strings."));
  if (!Array.isArray(packet.orderedTasks) || packet.orderedTasks.length === 0 || packet.orderedTasks.some((entry) => !validTask(entry)) || !hasUniqueIds(packet.orderedTasks)) issues.push(issue("plan.execution_packet.task_invalid", "orderedTasks", "Tasks must retain unique planning identity, safe paths, non-empty steps, and acceptance traceability."));
  else if (!validDependencies(packet.orderedTasks)) issues.push(issue("plan.execution_packet.task_invalid", "orderedTasks", "Task dependencies must reference ordered task IDs."));
  else if (!taskPathsWithinScope(packet.orderedTasks, packet.allowedMutationPaths as readonly string[], packet.forbiddenPaths as readonly string[])) issues.push(issue("plan.execution_packet.path_invalid", "orderedTasks", "Every task path must match an allowed mutation glob and exclude forbidden globs."));
  if (!Array.isArray(packet.acceptanceCriteria) || packet.acceptanceCriteria.length === 0 || packet.acceptanceCriteria.some((entry) => !validAcceptanceCriterion(entry)) || !hasUniqueIds(packet.acceptanceCriteria)) issues.push(issue("plan.execution_packet.schema_invalid", "acceptanceCriteria", "Acceptance criteria must retain unique IDs with verification and evidence traceability."));
  if (!Array.isArray(packet.verificationCommands) || packet.verificationCommands.length === 0 || packet.verificationCommands.some((entry) => !validVerification(entry))) issues.push(issue("plan.execution_packet.verification_untrusted", "verificationCommands", "Verification commands require a trusted source."));
  if (!Array.isArray(packet.risks) || packet.risks.some((entry) => !validRisk(entry)) || !hasUniqueIds(packet.risks)) issues.push(issue("plan.execution_packet.schema_invalid", "risks", "Risks must have unique non-empty IDs."));
  const taskIds = idsFor(packet.orderedTasks);
  const riskIds = idsFor(packet.risks);
  const acceptanceById = acceptanceCriteriaById(packet.acceptanceCriteria);
  if (Array.isArray(packet.orderedTasks) && packet.orderedTasks.every((entry) => validTask(entry)) && Array.isArray(packet.evidenceRequirements) && acceptanceById && !tasksTraceToAcceptance(packet.orderedTasks, packet.evidenceRequirements, acceptanceById)) issues.push(issue("plan.execution_packet.task_invalid", "orderedTasks", "Each task verification and evidence ID must be traced through its referenced acceptance criteria."));
  if (!Array.isArray(packet.evidenceRequirements) || packet.evidenceRequirements.length !== taskIds.size || packet.evidenceRequirements.some((entry) => !validEvidenceRequirement(entry)) || packet.evidenceRequirements.some((entry) => !taskIds.has((entry as { taskId: string }).taskId)) || !hasUniqueTaskMappings(packet.evidenceRequirements)) issues.push(issue("plan.execution_packet.schema_invalid", "evidenceRequirements", "Evidence requirements must be one non-empty mapping for each ordered task ID."));
  if (!Array.isArray(packet.riskControls) || packet.riskControls.length === 0 || packet.riskControls.some((entry) => !validRiskControl(entry)) || packet.riskControls.some((entry) => {
    const control = entry as { taskId: string; riskId: string };
    return !taskIds.has(control.taskId) || !riskIds.has(control.riskId);
  })) issues.push(issue("plan.execution_packet.schema_invalid", "riskControls", "Risk controls must be non-empty mappings to ordered task and risk IDs."));
  if (!Array.isArray(packet.rollback) || packet.rollback.length === 0 || packet.rollback.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) issues.push(issue("plan.execution_packet.schema_invalid", "rollback", "Rollback must contain non-empty steps."));
  if (!validApproval(packet.executionApproval)) issues.push(issue("plan.execution_packet.approval_invalid", "executionApproval", "Execution approval must remain separately required."));
  return issues;
}

function validTask(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const task = value as Record<string, unknown>;
  return ["id", "planningTaskId"].every((key) => typeof task[key] === "string" && (task[key] as string).trim().length > 0)
    && ["dependsOn", "paths", "steps", "acceptanceIds", "verificationIds"].every((key) => Array.isArray(task[key]))
    && (task.dependsOn as unknown[]).every((dependency) => typeof dependency === "string" && dependency.trim().length > 0)
    && (task.paths as unknown[]).length > 0
    && (task.paths as unknown[]).every(safeRelativePath)
    && (task.steps as unknown[]).length > 0
    && (task.steps as unknown[]).every((step) => typeof step === "string" && step.trim().length > 0)
    && ["acceptanceIds", "verificationIds"].every((key) => (task[key] as unknown[]).length > 0 && (task[key] as unknown[]).every((id) => typeof id === "string" && id.trim().length > 0));
}
function taskPathsWithinScope(tasks: readonly unknown[], allowedPaths: readonly string[], forbiddenPaths: readonly string[]): boolean {
  return tasks.every((task) => (task as ExecutionPacketTask).paths.every((path) =>
    allowedPaths.some((allowedPath) => globMatches(allowedPath, path))
    && !forbiddenPaths.some((forbiddenPath) => globMatches(forbiddenPath, path))));
}
function hasUniqueIds(values: readonly unknown[]): boolean {
  const ids = values.flatMap((value) => value && typeof value === "object" && !Array.isArray(value) && typeof (value as { id?: unknown }).id === "string"
    ? [(value as { id: string }).id]
    : []);
  return ids.length === values.length && ids.every((id) => id.trim().length > 0) && new Set(ids).size === ids.length;
}

function idsFor(values: unknown): ReadonlySet<string> {
  return Array.isArray(values)
    ? new Set(values.flatMap((value) => value && typeof value === "object" && !Array.isArray(value) && typeof (value as { id?: unknown }).id === "string"
      ? [(value as { id: string }).id]
      : []))
    : new Set();
}

function validDependencies(tasks: readonly unknown[]): boolean {
  const taskIds = idsFor(tasks);
  return tasks.every((task) => (task as { dependsOn: readonly string[] }).dependsOn.every((dependency) => taskIds.has(dependency)));
}

function validRisk(value: unknown): value is ExecutionPacketRisk {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).id === "string"
    && ((value as Record<string, unknown>).id as string).trim().length > 0;
}
function validAcceptanceCriterion(value: unknown): value is ExecutionAcceptanceCriterion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const criterion = value as Record<string, unknown>;
  return typeof criterion.id === "string"
    && criterion.id.trim().length > 0
    && ["verificationIds", "evidenceIds"].every((key) => Array.isArray(criterion[key])
      && (criterion[key] as unknown[]).length > 0
      && (criterion[key] as unknown[]).every((id) => typeof id === "string" && id.trim().length > 0));
}

function acceptanceCriteriaById(value: unknown): ReadonlyMap<string, ExecutionAcceptanceCriterion> | undefined {
  if (!Array.isArray(value) || value.some((criterion) => !validAcceptanceCriterion(criterion)) || !hasUniqueIds(value)) return undefined;
  return new Map(value.map((criterion) => [criterion.id, criterion]));
}

function hasUniqueTaskMappings(value: unknown): boolean {
  if (!Array.isArray(value) || value.some((entry) => !validEvidenceRequirement(entry))) return false;
  return new Set(value.map((entry) => (entry as { taskId: string }).taskId)).size === value.length;
}

function tasksTraceToAcceptance(tasks: readonly unknown[], requirements: unknown, acceptanceById: ReadonlyMap<string, ExecutionAcceptanceCriterion>): boolean {
  if (!Array.isArray(requirements) || requirements.some((entry) => !validEvidenceRequirement(entry))) return false;
  const evidenceByTask = new Map(requirements.map((entry) => {
    const requirement = entry as { taskId: string; evidenceIds: readonly string[] };
    return [requirement.taskId, requirement.evidenceIds] as const;
  }));
  return tasks.every((entry) => {
    const task = entry as ExecutionPacketTask;
    const criteria = task.acceptanceIds.map((id) => acceptanceById.get(id));
    if (criteria.some((criterion) => !criterion)) return false;
    const verificationIds = new Set(criteria.flatMap((criterion) => criterion!.verificationIds));
    const evidenceIds = new Set(criteria.flatMap((criterion) => criterion!.evidenceIds));
    return task.verificationIds.every((id) => verificationIds.has(id))
      && (evidenceByTask.get(task.id) ?? []).every((id) => evidenceIds.has(id));
  });
}

function validEvidenceRequirement(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const requirement = value as Record<string, unknown>;
  return typeof requirement.taskId === "string"
    && requirement.taskId.trim().length > 0
    && Array.isArray(requirement.evidenceIds)
    && requirement.evidenceIds.length > 0
    && requirement.evidenceIds.every((evidenceId) => typeof evidenceId === "string" && evidenceId.trim().length > 0);
}

function validRiskControl(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const control = value as Record<string, unknown>;
  return typeof control.taskId === "string"
    && control.taskId.trim().length > 0
    && typeof control.riskId === "string"
    && control.riskId.trim().length > 0
    && typeof control.control === "string"
    && control.control.trim().length > 0;
}

function validVerification(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  return typeof command.id === "string" && typeof command.command === "string" && ["manifest", "package-script", "user-approved"].includes(command.source as string);
}

function validApproval(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const approval = value as Record<string, unknown>;
  return approval.required === true && approval.schemaVersion === "boulder.execution-approval.v1";
}
