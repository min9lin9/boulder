import { validateCommonExecutorFinalReceipt, validateCommonExecutorLifecycle } from "./common-executor-evidence.js";
import { validateExecutionPacket } from "./execution-packet.js";
import { planningDigest } from "./planning-canonical.js";
import { validatePlannerPreExecutionSafetyReceipt } from "./planner-pre-execution-safety.js";
import { validatePlannerScoreWorkflow } from "./planner-score-workflow.js";
import { validatePlannerScopeAttributionReceipt } from "./planner-scope-attribution.js";
import { validatePlanningPacket } from "./planning-packet.js";
import type { PlannerBenchmarkIssue, PlannerEvidenceArtifact } from "./planner-benchmark.js";

export const plannerStudyRemediationPolicy = "scope-lifecycle-score-v1" as const;
export const plannerStudyRemediationEvidenceSchema = "boulder.planner-study-remediation-evidence.v1" as const;

type ArtifactReference = PlannerEvidenceArtifact;
type JsonRecord = Record<string, unknown>;

export interface PlannerStudyRemediationValidationInput {
  readonly remediationEvidence: unknown;
  readonly artifactIndex: readonly unknown[];
  readonly normalizedRuns: readonly unknown[];
  readonly studyId: string;
  readonly protocolDigest: string;
  readonly artifactJoined: (reference: ArtifactReference) => boolean;
  readonly readArtifact: (reference: ArtifactReference) => unknown;
  readonly verifyExecutorSignature: (signed: JsonRecord, path: string) => Promise<PlannerBenchmarkIssue | undefined>;
  readonly verifyOperatorSignature: (signed: JsonRecord, path: string) => Promise<PlannerBenchmarkIssue | undefined>;
}

const schemas = {
  planningPacket: "boulder.planning-packet.v1",
  executionPacket: "boulder.execution-packet.v1",
  planApprovalReceipt: "boulder.plan-approval.v1",
  executionApprovalReceipt: "boulder.execution-approval.v1",
  preflightReceipt: "boulder.planner-pre-execution-safety-receipt.v1",
  scopeAttributionReceipt: "boulder.planner-scope-attribution-receipt.v1",
  lifecycle: "boulder.common-executor-lifecycle.v1",
  finalReceipt: "boulder.common-executor-final-receipt.v2",
  scoreWorkflow: "boulder.planner-score-workflow.v1"
} as const;

const remediationKeys = ["schemaVersion", "scoreWorkflow", "runs"] as const;
const runArtifactKeys = [
  "planningPacket",
  "executionPacket",
  "planApprovalReceipt",
  "executionApprovalReceipt",
  "preflightReceipt",
  "scopeAttributionReceipt",
  "lifecycle",
  "finalReceipt"
] as const;
const runKeys = ["runId", ...runArtifactKeys] as const;
const digestPattern = /^sha256:[a-f0-9]{64}$/;

export async function validatePlannerStudyRemediationEvidence(
  input: PlannerStudyRemediationValidationInput
): Promise<readonly PlannerBenchmarkIssue[]> {
  const issues: PlannerBenchmarkIssue[] = [];
  if (!artifactShape(input.remediationEvidence) || input.remediationEvidence.schemaVersion !== plannerStudyRemediationEvidenceSchema) {
    return [issue("remediationEvidence", "Fresh studies require one indexed remediation-evidence artifact.")];
  }
  const remediationReference = input.remediationEvidence;
  if (!input.artifactJoined(remediationReference) || !input.artifactIndex.some((entry) => sameArtifact(entry, remediationReference))) {
    return [issue("remediationEvidence", "Remediation evidence must be byte-verified by the signed artifact index.")];
  }
  const evidenceRead = readArtifact(input, remediationReference, "remediationEvidence", issues);
  if (!evidenceRead.ok) return issues;
  const evidence = evidenceRead.value;
  if (!record(evidence) || !exactKeys(evidence, remediationKeys) || evidence.schemaVersion !== plannerStudyRemediationEvidenceSchema || !artifactShape(evidence.scoreWorkflow) || !Array.isArray(evidence.runs)) {
    return [issue("remediationEvidence", "Remediation evidence schema is invalid.")];
  }

  const scoreWorkflow = evidence.scoreWorkflow as ArtifactReference;
  const scoreWorkflowJoined = scoreWorkflow.schemaVersion === schemas.scoreWorkflow
    && input.artifactJoined(scoreWorkflow)
    && input.artifactIndex.some((entry) => sameArtifact(entry, scoreWorkflow));
  if (!scoreWorkflowJoined) {
    issues.push(issue("remediationEvidence.scoreWorkflow", "Score workflow must be indexed and byte-verified."));
  }
  const workflowRead = scoreWorkflowJoined
    ? readArtifact(input, scoreWorkflow, "remediationEvidence.scoreWorkflow", issues)
    : { ok: false as const };
  const workflow = workflowRead.ok ? workflowRead.value : undefined;
  const workflowValidation = validatePlannerScoreWorkflow(workflow);
  if (!workflowValidation.valid || !record(workflow) || workflow.phase !== "report-signed" || !Array.isArray(workflow.events) || workflow.events.length !== 5) {
    issues.push(issue("remediationEvidence.scoreWorkflow", "Fresh studies require a complete prospective score workflow through report signing."));
  } else {
    if (workflow.studyId !== input.studyId || workflow.protocolDigest !== input.protocolDigest) {
      issues.push(issue("remediationEvidence.scoreWorkflow", "Score workflow must bind the exact fresh study and frozen protocol."));
    }
    for (const event of workflow.events) {
      if (!record(event)) continue;
      const signatureIssue = await input.verifyOperatorSignature(event, `remediationEvidence.scoreWorkflow.events.${event.sequence}`);
      if (signatureIssue) issues.push(signatureIssue);
      if (event.kind === "lock-scored-sheet" && record(event.scoreLockReceipt)) {
        const lockSignatureIssue = await input.verifyOperatorSignature(event.scoreLockReceipt, `remediationEvidence.scoreWorkflow.lockReceipt`);
        if (lockSignatureIssue) issues.push(lockSignatureIssue);
      }
    }
  }

  const normalizedRunIds = new Set<string>();
  for (const run of input.normalizedRuns) {
    if (!record(run) || !text(run.runId) || normalizedRunIds.has(run.runId)) {
      issues.push(issue("normalizedRuns", "Fresh remediation evidence requires uniquely identified normalized runs."));
      continue;
    }
    normalizedRunIds.add(run.runId);
  }
  if (record(workflow) && Array.isArray(workflow.reveals)) {
    const revealedRunIds = workflow.reveals
      .filter(record)
      .map((reveal) => reveal.runId)
      .filter(text);
    if (
      revealedRunIds.length !== normalizedRunIds.size
      || new Set(revealedRunIds).size !== revealedRunIds.length
      || revealedRunIds.some((runId) => !normalizedRunIds.has(runId))
    ) {
      issues.push(issue("remediationEvidence.scoreWorkflow.reveals", "Score workflow reveals must bind every normalized run exactly once."));
    }
  }
  const normalizedPlannerByRunId = normalizedPlannerBindings(input.normalizedRuns);
  if (record(workflow) && Array.isArray(workflow.reveals)) {
    for (const reveal of workflow.reveals) {
      if (!record(reveal) || !text(reveal.runId) || !text(reveal.plannerId)) continue;
      if (normalizedPlannerByRunId.get(reveal.runId) !== reveal.plannerId) {
        issues.push(issue("remediationEvidence.scoreWorkflow.reveals", "Score workflow reveals must bind each run to its normalized planner identity."));
        break;
      }
    }
  }
  const preregisteredAt = record(workflow)
    && Array.isArray(workflow.events)
    && record(workflow.events[0])
    && typeof workflow.events[0].occurredAt === "string"
    ? workflow.events[0].occurredAt
    : "";
  const scoringCompletedAt = record(workflow)
    && Array.isArray(workflow.events)
    && record(workflow.events[1])
    && typeof workflow.events[1].occurredAt === "string"
    ? workflow.events[1].occurredAt
    : "";
  const remediationRunIds = new Set<string>();
  for (const [index, entry] of (evidence.runs as unknown[]).entries()) {
    const path = `remediationEvidence.runs[${index}]`;
    if (!record(entry) || !exactKeys(entry, runKeys) || !text(entry.runId) || remediationRunIds.has(entry.runId)) {
      issues.push(issue(path, "Every remediation record must have one exact, unique run identity and complete artifact references."));
      continue;
    }
    remediationRunIds.add(entry.runId);
    if (!normalizedRunIds.has(entry.runId)) {
      issues.push(issue(`${path}.runId`, "Remediation evidence cannot contain a dangling run."));
      continue;
    }
    await validateRun(entry, path, input, preregisteredAt, scoringCompletedAt, issues);
  }
  if (remediationRunIds.size !== normalizedRunIds.size || [...normalizedRunIds].some((runId) => !remediationRunIds.has(runId))) {
    issues.push(issue("remediationEvidence.runs", "Fresh remediation evidence requires exactly one record for every normalized run."));
  }
  return issues;
}

async function validateRun(
  entry: JsonRecord,
  path: string,
  input: PlannerStudyRemediationValidationInput,
  preregisteredAt: string,
  scoringCompletedAt: string,
  issues: PlannerBenchmarkIssue[]
): Promise<void> {
  const references: Partial<Record<keyof typeof schemas, ArtifactReference>> = {};
  let allReferencesJoined = true;
  for (const key of runArtifactKeys) {
    const reference = entry[key];
    if (!artifactShape(reference) || reference.schemaVersion !== schemas[key]) {
      issues.push(issue(`${path}.${key}`, "Remediation artifacts require the exact current schema."));
      allReferencesJoined = false;
      continue;
    }
    references[key] = reference;
    if (!input.artifactJoined(reference) || !input.artifactIndex.some((indexed) => sameArtifact(indexed, reference))) {
      issues.push(issue(`${path}.${key}`, "Remediation artifact is missing, tampered, or dangling from the signed index."));
      allReferencesJoined = false;
    }
  }
  if (!completeReferences(references) || !allReferencesJoined) return;

  const reads = [
    readArtifact(input, references.planningPacket, `${path}.planningPacket`, issues),
    readArtifact(input, references.executionPacket, `${path}.executionPacket`, issues),
    readArtifact(input, references.planApprovalReceipt, `${path}.planApprovalReceipt`, issues),
    readArtifact(input, references.executionApprovalReceipt, `${path}.executionApprovalReceipt`, issues),
    readArtifact(input, references.preflightReceipt, `${path}.preflightReceipt`, issues),
    readArtifact(input, references.scopeAttributionReceipt, `${path}.scopeAttributionReceipt`, issues),
    readArtifact(input, references.lifecycle, `${path}.lifecycle`, issues),
    readArtifact(input, references.finalReceipt, `${path}.finalReceipt`, issues)
  ] as const;
  if (reads.some((read) => !read.ok)) return;
  const [planningPacket, executionPacket, planApprovalReceipt, executionApprovalReceipt, preflightReceipt, scopeReceipt, lifecycle, finalReceipt] = reads.map((read) => read.ok ? read.value : undefined);
  if (![planningPacket, executionPacket, planApprovalReceipt, executionApprovalReceipt, preflightReceipt, scopeReceipt, lifecycle, finalReceipt].every(record)) {
    issues.push(issue(path, "Remediation artifacts must contain parseable JSON records."));
    return;
  }
  const planning = planningPacket as JsonRecord;
  const execution = executionPacket as JsonRecord;
  const planApproval = planApprovalReceipt as JsonRecord;
  const executionApproval = executionApprovalReceipt as JsonRecord;
  const preflightValue = preflightReceipt as JsonRecord;
  const scopeValue = scopeReceipt as JsonRecord;
  const lifecycleValue = lifecycle as JsonRecord;
  const finalValue = finalReceipt as JsonRecord;
  const planningValidation = validatePlanningPacket(planning);
  const executionValidation = validateExecutionPacket(execution);
  if (!planningValidation.valid || executionValidation.length > 0) {
    issues.push(issue(path, "Remediation planning and execution packets must pass their canonical validators."));
    return;
  }
  if ([planning, execution, planApproval, executionApproval, preflightValue, scopeValue, lifecycleValue, finalValue].some(hasHandoffField)) {
    issues.push(issue(path, "Fresh remediation evidence forbids Handoff transport and fields."));
  }

  const workspace = workspaceFromPreflight(preflightValue);
  if (!workspace) {
    issues.push(issue(`${path}.preflightReceipt`, "Preflight receipt must bind a current authorized workspace and frozen revision."));
    return;
  }
  let preflightSignatureAuthenticated = false;
  if (!record(preflightValue.signature)) {
    issues.push(issue(`${path}.preflightReceipt.signature`, "Fresh preflight receipt requires an executor signature."));
  } else {
    const signatureIssue = await input.verifyExecutorSignature(preflightValue, `${path}.preflightReceipt`);
    if (signatureIssue) issues.push(signatureIssue);
    else preflightSignatureAuthenticated = true;
  }
  const preflight = validatePlannerPreExecutionSafetyReceipt(preflightValue, {
    planningPacket: planning,
    executionPacket: execution,
    planApprovalReceipt: planApproval,
    executionApprovalReceipt: executionApproval,
    approvalReceiptsAuthenticated: preflightSignatureAuthenticated,
    authorizedWorkspace: workspace,
    currentWorkspace: workspace,
    evaluatedAt: typeof preflightValue.evaluatedAt === "string" ? preflightValue.evaluatedAt : ""
  });
  if (!preflight.valid || preflightValue.allowed !== true) issues.push(issue(`${path}.preflightReceipt`, "Preflight receipt must validate and allow this exact execution."));

  const finalValidation = validateCommonExecutorFinalReceipt(finalValue, lifecycleValue);
  if (!finalValidation.valid || finalValue.runId !== entry.runId) issues.push(issue(`${path}.finalReceipt`, "Fresh runs require a validated v2 final receipt with complete termination facts."));
  const termination = record(finalValue.termination) ? finalValue.termination : undefined;
  const verification = record(finalValue.verification) ? finalValue.verification : undefined;
  if (!termination || termination.kind !== "exit" || termination.exitCode !== 0
    || !verification || !record(verification.test) || verification.test.outcome !== "passed"
    || !record(verification.typecheck) || verification.typecheck.outcome !== "passed") {
    issues.push(issue(`${path}.finalReceipt`, "Fresh eligible runs require successful exit, test, and typecheck evidence."));
  }
  const lifecycleValidation = validateCommonExecutorLifecycle(lifecycleValue);
  if (!lifecycleValidation.valid || lifecycleValue.runId !== entry.runId) issues.push(issue(`${path}.lifecycle`, "Fresh runs require a complete common-executor lifecycle."));
  const lifecycleEvents = Array.isArray(lifecycleValue.events) ? lifecycleValue.events : [];
  const preflightEvent = lifecycleEvents[0];
  if (!record(preflightEvent) || preflightEvent.preflightDigest !== preflightValue.receiptDigest) {
    issues.push(issue(`${path}.lifecycle`, "Lifecycle preflight event must bind the validated preflight receipt."));
  }

  const patchDigest = typeof scopeValue.patchDigest === "string" ? scopeValue.patchDigest : "";
  const authorizedWorkspaceIdentityDigest = planningDigest(workspace.identity);
  const hasIndependentWorkspaceObservation = digestValue(scopeValue.authorizedWorkspaceIdentityDigest)
    && digestValue(scopeValue.observedWorkspaceIdentityDigest)
    && scopeValue.workspaceIdentityDigest === undefined;
  if (!hasIndependentWorkspaceObservation) {
    issues.push(issue(`${path}.scopeAttributionReceipt`, "Fresh scope evidence requires distinct authorized and post-execution observed workspace digest fields."));
  }
  const observedWorkspaceIdentityDigest = hasIndependentWorkspaceObservation
    ? scopeValue.observedWorkspaceIdentityDigest as string
    : "";
  const scopeIssues = validatePlannerScopeAttributionReceipt(scopeValue, {
    runId: entry.runId as string,
    planningPacket: planning as unknown as { runId: string; packetDigest: string; scope: { protectedPaths: readonly string[] } },
    executionPacket: execution as unknown as { allowedMutationPaths: readonly string[]; forbiddenPaths: readonly string[] },
    preflightReceiptDigest: typeof preflightValue.receiptDigest === "string" ? preflightValue.receiptDigest : "",
    workspaceIdentityDigest: authorizedWorkspaceIdentityDigest,
    authorizedWorkspaceIdentityDigest,
    observedWorkspaceIdentityDigest,
    baselineRevision: workspace.frozenRevision,
    patchDigest
  });
  if (scopeIssues.length > 0 || scopeValue.status !== "passed") issues.push(issue(`${path}.scopeAttributionReceipt`, "Eligibility scope must derive only from a valid signed passed scope receipt."));
  if (!validRunChronology(preregisteredAt, scoringCompletedAt, planApproval, executionApproval, preflightValue, lifecycleEvents, scopeValue)) {
    issues.push(issue(path, "Fresh run evidence must follow preregistration, preflight, execution, scope attribution, verification, and finalization chronology."));
  }
  if (!verification || !Array.isArray(verification.artifactDigests) || !verification.artifactDigests.includes(patchDigest)) {
    issues.push(issue(`${path}.scopeAttributionReceipt.patchDigest`, "Scope patch digest must be present in the finalized lifecycle verification evidence."));
  }
  if (!record(finalValue.signature)) issues.push(issue(`${path}.finalReceipt.signature`, "Fresh final receipt requires an executor signature."));
  else {
    const signatureIssue = await input.verifyExecutorSignature(finalValue, `${path}.finalReceipt`);
    if (signatureIssue) issues.push(signatureIssue);
  }
  if (!record(scopeValue.signature)) issues.push(issue(`${path}.scopeAttributionReceipt.signature`, "Fresh scope receipt requires an executor signature."));
  else {
    const signatureIssue = await input.verifyExecutorSignature(scopeValue, `${path}.scopeAttributionReceipt`);
    if (signatureIssue) issues.push(signatureIssue);
  }
}

function hasHandoffField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasHandoffField);
  if (!record(value)) return false;
  return Object.entries(value).some(([key, nested]) => /handoff|transport/i.test(key) || hasHandoffField(nested));
}
function workspaceFromPreflight(value: JsonRecord): { readonly identity: string; readonly frozenRevision: string } | undefined {
  if (!text(value.authorizedWorkspaceIdentity) || !text(value.authorizedFrozenRevision) || value.currentWorkspaceIdentity !== value.authorizedWorkspaceIdentity || value.currentFrozenRevision !== value.authorizedFrozenRevision) return undefined;
  return { identity: value.authorizedWorkspaceIdentity, frozenRevision: value.authorizedFrozenRevision };
}

type ArtifactRead = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

function readArtifact(
  input: PlannerStudyRemediationValidationInput,
  reference: ArtifactReference,
  path: string,
  issues: PlannerBenchmarkIssue[]
): ArtifactRead {
  try {
    return { ok: true, value: input.readArtifact(reference) };
  } catch {
    issues.push(issue(path, "Indexed remediation artifact could not be read as evidence."));
    return { ok: false };
  }
}

function normalizedPlannerBindings(runs: readonly unknown[]): ReadonlyMap<string, string> {
  const bindings = new Map<string, string>();
  for (const run of runs) {
    if (!record(run) || !text(run.runId) || !text(run.cellId)) continue;
    const separator = run.cellId.indexOf(":");
    if (separator <= 0) continue;
    bindings.set(run.runId, run.cellId.slice(0, separator));
  }
  return bindings;
}

function validRunChronology(
  preregisteredAt: string,
  scoringCompletedAt: string,
  planApproval: JsonRecord,
  executionApproval: JsonRecord,
  preflight: JsonRecord,
  lifecycleEvents: readonly unknown[],
  scope: JsonRecord
): boolean {
  if (
    !isoTime(preregisteredAt)
    || !isoTime(scoringCompletedAt)
    || !isoTime(planApproval.approvedAt)
    || !isoTime(executionApproval.approvedAt)
    || !isoTime(preflight.evaluatedAt)
    || !isoTime(scope.occurredAt)
    || lifecycleEvents.length !== 5
    || !lifecycleEvents.every(record)
  ) return false;
  const timestamps = lifecycleEvents.map((event) => event.timestamp);
  if (!timestamps.every(isoTime)) return false;
  return Date.parse(preregisteredAt) < Date.parse(planApproval.approvedAt)
    && Date.parse(planApproval.approvedAt) < Date.parse(executionApproval.approvedAt)
    && Date.parse(executionApproval.approvedAt) < Date.parse(preflight.evaluatedAt)
    && Date.parse(preflight.evaluatedAt) <= Date.parse(timestamps[0] as string)
    && Date.parse(timestamps[2] as string) < Date.parse(scope.occurredAt)
    && Date.parse(scope.occurredAt) <= Date.parse(timestamps[3] as string)
    && Date.parse(timestamps[4] as string) < Date.parse(scoringCompletedAt);
}

function completeReferences(value: Partial<Record<keyof typeof schemas, ArtifactReference>>): value is Record<Exclude<keyof typeof schemas, "scoreWorkflow">, ArtifactReference> {
  return (Object.keys(schemas) as (keyof typeof schemas)[])
    .filter((key) => key !== "scoreWorkflow")
    .every((key) => value[key] !== undefined);
}

function artifactShape(value: unknown): value is ArtifactReference {
  return record(value) && safePath(value.path) && typeof value.schemaVersion === "string" && typeof value.digest === "string" && digestPattern.test(value.digest);
}

function sameArtifact(value: unknown, expected: ArtifactReference): boolean {
  return artifactShape(value) && value.path === expected.path && value.digest === expected.digest && value.schemaVersion === expected.schemaVersion;
}

function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safePath(value: unknown): value is string {
  return text(value) && !value.startsWith("/") && !value.startsWith("\\") && !/^[A-Za-z]:[\\/]/.test(value) && !value.includes("\\") && !value.split("/").some((part) => part === "" || part === "." || part === "..");
}

function digestValue(value: unknown): value is string {
  return typeof value === "string" && digestPattern.test(value);
}

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isoTime(value: unknown): value is string {
  return typeof value === "string" && value.endsWith("Z") && !Number.isNaN(Date.parse(value));
}

function issue(path: string, message: string): PlannerBenchmarkIssue {
  return { code: "plan.benchmark.evidence_invalid", path, message };
}
