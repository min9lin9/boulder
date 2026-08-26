import { canonicalizePlanningValue, planningDigest, sha256Digest, type PlanningProducer, type PlanningSourceRef, type PlanningValidationIssue } from "./planning-canonical.js";
import { validatePlanningPacket, type PlanningPacket } from "./planning-packet.js";

export type PlannerId = "gjc" | "boulder-native" | "lazycodex";

export interface PlannerOutputNormalizationContext {
  readonly plannerId: PlannerId;
  readonly runId: string;
  readonly createdAt: string;
  readonly producer: PlanningProducer;
  readonly task: PlanningPacket["task"];
  /** Digest of the exact UTF-16 JavaScript string supplied as rawOutput. */
  readonly rawOutputDigest: string;
  /** Independently supplied evidence eligible to promote matching planner source references. */
  readonly trustedSourceRefs: readonly PlanningSourceRef[];
}

export interface PlannerNormalizationArtifact {
  readonly schemaVersion: "boulder.planner-normalization-artifact.v1";
  readonly artifactDigest: string;
  /** Exact UTF-16 JavaScript string supplied to normalizePlannerOutput. */
  readonly rawOutput: string;
  readonly rawOutputDigest: string;
  readonly planMarkdown: string;
  readonly plannerId: PlannerId;
  readonly context: Omit<PlannerOutputNormalizationContext, "rawOutputDigest">;
  readonly packet: PlanningPacket;
  readonly packetDigest: string;
}

export interface PlannerOutputNormalizationSuccess {
  readonly valid: true;
  readonly packet: PlanningPacket;
  readonly canonicalPacket: string;
  readonly planMarkdown: string;
  readonly rawOutputDigest: string;
  readonly artifact: PlannerNormalizationArtifact;
  readonly issues: readonly [];
}

export interface PlannerOutputNormalizationFailure {
  readonly valid: false;
  readonly rawOutputDigest: string;
  readonly issues: readonly PlanningValidationIssue[];
}

export type PlannerOutputNormalizationResult = PlannerOutputNormalizationSuccess | PlannerOutputNormalizationFailure;

type Shape = true | ObjectShape | readonly [Shape];
type ObjectShape = { readonly [key: string]: Shape | OptionalShape };
interface OptionalShape { readonly optional: true; readonly shape: Shape; }

const optional = (shape: Shape): OptionalShape => ({ optional: true, shape });
const plannerIds = new Set<PlannerId>(["gjc", "boulder-native", "lazycodex"]);
const substantiveShape = {
  objective: true,
  decisions: [{ id: true, statement: true, source: true, sourceRefs: [true], confidence: true }],
  scope: { allowedPaths: [true], forbiddenPaths: [true], protectedPaths: [true], nonGoals: [true] },
  tasks: [{ id: true, title: true, dependsOn: [true], paths: [true], steps: [true], acceptanceIds: [true], verificationIds: [true], evidenceIds: [true] }],
  acceptanceCriteria: [{ id: true, statement: true, verificationIds: [true], evidenceIds: [true] }],
  verification: [{ id: true, kind: true, command: optional(true), scenario: optional(true), source: true, required: true, evidencePath: true }],
  risks: [{ id: true, severity: true, trigger: true, mitigation: true, rollback: true, approvalGate: true }],
  approvalPolicy: { plan: true, execution: true, external: true },
  review: { structural: true, semantic: true, unresolvedFindings: [true] },
  sourceRefs: [{ id: true, path: true, sha256: true, kind: true, trust: true, symbol: optional(true), lineHint: optional(true) }],
} satisfies ObjectShape;
const outputShape: ObjectShape = { schemaVersion: true, plannerId: true, planMarkdown: true, ...substantiveShape };
const contextShape: ObjectShape = {
  plannerId: true,
  runId: true,
  createdAt: true,
  producer: { adapter: true, mode: true, host: true, toolVersion: true, model: optional(true) },
  task: { rawTaskHash: true, normalizedSummary: true, profileId: true, analysisRef: true },
  rawOutputDigest: true,
  trustedSourceRefs: [{ id: true, path: true, sha256: true, kind: true, trust: true, symbol: optional(true), lineHint: optional(true) }],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function issue(id: string, path: string, message: string): PlanningValidationIssue {
  return { id, path, message };
}

function isOptionalShape(shape: Shape | OptionalShape): shape is OptionalShape {
  return typeof shape === "object" && !Array.isArray(shape) && Object.hasOwn(shape, "optional");
}

function validateShape(value: unknown, shape: Shape | OptionalShape, path: string, issues: PlanningValidationIssue[]): void {
  if (isOptionalShape(shape)) {
    validateShape(value, shape.shape, path, issues);
    return;
  }
  if (shape === true) return;
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) {
      issues.push(issue("plan.normalizer.field_invalid", path, "Expected an array."));
      return;
    }
    value.forEach((item, index) => validateShape(item, shape[0], `${path}[${index}]`, issues));
    return;
  }
  if (!isRecord(value)) {
    issues.push(issue("plan.normalizer.field_invalid", path, "Expected an object."));
    return;
  }
  const objectShape = shape as ObjectShape;
  for (const key of Object.keys(objectShape)) {
    const fieldShape = objectShape[key]!;
    if (!isOptionalShape(fieldShape) && !Object.hasOwn(value, key)) issues.push(issue("plan.normalizer.field_missing", `${path}.${key}`, "Required field is missing."));
  }
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(objectShape, key)) issues.push(issue("plan.normalizer.field_unknown", `${path}.${key}`, "Unknown field is not allowed."));
    else validateShape(value[key], objectShape[key]!, `${path}.${key}`, issues);
  }
}

class DuplicateJsonMemberError extends Error {}

function scanJsonForDuplicateMembers(rawOutput: string): void {
  let index = 0;
  const whitespace = (): void => { while (/\s/.test(rawOutput[index] ?? "")) index += 1; };
  const string = (): string => {
    const start = index;
    if (rawOutput[index] !== "\"") throw new SyntaxError("Expected a string.");
    index += 1;
    while (index < rawOutput.length) {
      const character = rawOutput[index++]!;
      if (character === "\"") return JSON.parse(rawOutput.slice(start, index)) as string;
      if (character === "\\") {
        const escape = rawOutput[index++];
        if (escape === "u") {
          const digits = rawOutput.slice(index, index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) throw new SyntaxError("Invalid unicode escape.");
          index += 4;
        } else if (escape === undefined || !"\"\\/bfnrt".includes(escape)) throw new SyntaxError("Invalid string escape.");
      } else if (character < " ") throw new SyntaxError("Invalid control character.");
    }
    throw new SyntaxError("Unterminated string.");
  };
  const value = (): void => {
    whitespace();
    if (rawOutput[index] === "{") {
      index += 1; whitespace();
      const keys = new Set<string>();
      if (rawOutput[index] === "}") { index += 1; return; }
      while (true) {
        whitespace();
        const key = string();
        if (keys.has(key)) throw new DuplicateJsonMemberError();
        keys.add(key);
        whitespace();
        if (rawOutput[index++] !== ":") throw new SyntaxError("Expected a colon.");
        value(); whitespace();
        if (rawOutput[index] === "}") { index += 1; return; }
        if (rawOutput[index++] !== ",") throw new SyntaxError("Expected a comma.");
      }
    }
    if (rawOutput[index] === "[") {
      index += 1; whitespace();
      if (rawOutput[index] === "]") { index += 1; return; }
      while (true) {
        value(); whitespace();
        if (rawOutput[index] === "]") { index += 1; return; }
        if (rawOutput[index++] !== ",") throw new SyntaxError("Expected a comma.");
      }
    }
    if (rawOutput[index] === "\"") { string(); return; }
    const start = index;
    while (index < rawOutput.length && !/[\s,\]}]/.test(rawOutput[index]!)) index += 1;
    if (start === index) throw new SyntaxError("Expected a JSON value.");
    JSON.parse(rawOutput.slice(start, index));
  };
  whitespace(); value(); whitespace();
  if (index !== rawOutput.length) throw new SyntaxError("Unexpected trailing JSON content.");
}

function parseRawOutput(rawOutput: string): { readonly value?: Record<string, unknown>; readonly issues: readonly PlanningValidationIssue[] } {
  try {
    scanJsonForDuplicateMembers(rawOutput);
    const value: unknown = JSON.parse(rawOutput);
    if (!isRecord(value)) return { issues: [issue("plan.normalizer.envelope_invalid", "$", "Planner output must be a JSON object.")] };
    return { value, issues: [] };
  } catch (error) {
    if (error instanceof DuplicateJsonMemberError) return { issues: [issue("plan.normalizer.duplicate_key", "$", "Duplicate JSON member names are not allowed.")] };
    return { issues: [issue("plan.normalizer.json_invalid", "$", "Planner output must be strict JSON.")] };
  }
}

export function plannerNormalizationArtifactDigest(artifact: Omit<PlannerNormalizationArtifact, "artifactDigest">): string {
  return sha256Digest(canonicalizePlanningValue(artifact));
}

function validatePlannerClaims(value: Record<string, unknown>, issues: PlanningValidationIssue[]): void {
  const decisions = Array.isArray(value.decisions) ? value.decisions : [];
  decisions.forEach((decision, index) => {
    if (isRecord(decision) && decision.source !== "inferred") issues.push(issue("plan.normalizer.trust_claim", `$.decisions[${index}].source`, "Planner decisions must enter normalization as inferred."));
  });
  const verification = Array.isArray(value.verification) ? value.verification : [];
  verification.forEach((entry, index) => {
    if (isRecord(entry) && entry.source !== "planner-proposed") issues.push(issue("plan.normalizer.trust_claim", `$.verification[${index}].source`, "Planner verification must enter normalization as planner-proposed."));
  });
  const review = isRecord(value.review) ? value.review : {};
  if (review.structural !== "pending" || review.semantic !== "pending") issues.push(issue("plan.normalizer.trust_claim", "$.review", "Planner output cannot claim independent review results."));
  const sourceRefs = Array.isArray(value.sourceRefs) ? value.sourceRefs : [];
  sourceRefs.forEach((sourceRef, index) => {
    if (isRecord(sourceRef) && sourceRef.trust !== "untrusted-external") issues.push(issue("plan.normalizer.trust_claim", `$.sourceRefs[${index}].trust`, "Planner source trust must remain untrusted until independently verified."));
  });
}
function sourceRefIdentity(sourceRef: Record<string, unknown>): string | undefined {
  if (!isNonEmptyString(sourceRef.id)
    || !isNonEmptyString(sourceRef.path)
    || !isNonEmptyString(sourceRef.sha256)
    || !isNonEmptyString(sourceRef.kind)) return undefined;
  return canonicalizePlanningValue([
    sourceRef.id,
    sourceRef.path,
    sourceRef.sha256,
    sourceRef.kind,
    typeof sourceRef.symbol === "string" ? sourceRef.symbol : null,
    typeof sourceRef.lineHint === "string" ? sourceRef.lineHint : null,
  ]);
}

function promoteSourceRefs(value: Record<string, unknown>, context: PlannerOutputNormalizationContext, issues: PlanningValidationIssue[]): readonly PlanningSourceRef[] | undefined {
  const trustedCatalog = Array.isArray(context.trustedSourceRefs) ? context.trustedSourceRefs : [];
  const catalogByIdentity = new Map<string, PlanningSourceRef>();
  const catalogById = new Set<string>();
  trustedCatalog.forEach((sourceRef, index) => {
    if (!isRecord(sourceRef)) {
      issues.push(issue("plan.normalizer.source_catalog_invalid", `$context.trustedSourceRefs[${index}]`, "Trusted source catalog entries must be source references."));
      return;
    }
    const identity = sourceRefIdentity(sourceRef);
    if (!identity || !["operator-contract", "repo-instruction", "repo-evidence", "official-external"].includes(sourceRef.trust as string)) {
      issues.push(issue("plan.normalizer.source_catalog_invalid", `$context.trustedSourceRefs[${index}]`, "Trusted source catalog entries must have a complete trusted identity."));
      return;
    }
    const typedSourceRef = sourceRef as unknown as PlanningSourceRef;
    if (catalogByIdentity.has(identity) || catalogById.has(typedSourceRef.id)) {
      issues.push(issue("plan.normalizer.source_catalog_duplicate", `$context.trustedSourceRefs[${index}]`, "Trusted source catalog identities must be unique."));
      return;
    }
    catalogByIdentity.set(identity, typedSourceRef);
    catalogById.add(typedSourceRef.id);
  });

  const rawSourceRefs = Array.isArray(value.sourceRefs) ? value.sourceRefs : [];
  const rawIds = new Set<string>();
  const rawIdentities = new Set<string>();
  const promoted: PlanningSourceRef[] = [];
  rawSourceRefs.forEach((sourceRef, index) => {
    if (!isRecord(sourceRef)) {
      issues.push(issue("plan.normalizer.source_ref_invalid", `$.sourceRefs[${index}]`, "Planner source references must be complete."));
      return;
    }
    const identity = sourceRefIdentity(sourceRef);
    if (!identity) {
      issues.push(issue("plan.normalizer.source_ref_invalid", `$.sourceRefs[${index}]`, "Planner source references must be complete."));
      return;
    }
    const typedSourceRef = sourceRef as unknown as PlanningSourceRef;
    if (rawIdentities.has(identity) || rawIds.has(typedSourceRef.id)) {
      issues.push(issue("plan.normalizer.source_ref_duplicate", `$.sourceRefs[${index}]`, "Planner source reference identities must be unique."));
      return;
    }
    rawIds.add(typedSourceRef.id);
    rawIdentities.add(identity);
    const trustedSourceRef = catalogByIdentity.get(identity);
    if (!trustedSourceRef) {
      const issueId = catalogById.has(typedSourceRef.id) ? "plan.normalizer.source_ref_mismatch" : "plan.normalizer.source_ref_unknown";
      issues.push(issue(issueId, `$.sourceRefs[${index}]`, "Planner source reference does not exactly match the trusted source catalog."));
      return;
    }
    if (sourceRef.symbol !== trustedSourceRef.symbol
      || sourceRef.lineHint !== trustedSourceRef.lineHint) {
      issues.push(issue("plan.normalizer.source_ref_mismatch", `$.sourceRefs[${index}]`, "Planner source reference location does not match the trusted source catalog."));
      return;
    }
    promoted.push(trustedSourceRef);
  });
  return issues.length === 0 ? promoted : undefined;
}

function validateConnectedPlan(value: Record<string, unknown>, issues: PlanningValidationIssue[]): void {
  for (const key of ["tasks", "acceptanceCriteria", "verification"] as const) {
    if (!Array.isArray(value[key]) || value[key].length === 0) issues.push(issue("plan.normalizer.plan_empty", `$.${key}`, "Scored planner output requires a non-empty planning graph."));
  }
  const tasks = Array.isArray(value.tasks) ? value.tasks : [];
  tasks.forEach((task, index) => {
    if (!isRecord(task)) return;
    for (const key of ["acceptanceIds", "verificationIds", "evidenceIds"] as const) {
      if (!Array.isArray(task[key]) || task[key].length === 0) issues.push(issue("plan.normalizer.graph_disconnected", `$.tasks[${index}].${key}`, "Every task must connect acceptance, verification, and evidence."));
    }
  });
  const criteria = Array.isArray(value.acceptanceCriteria) ? value.acceptanceCriteria : [];
  criteria.forEach((criterion, index) => {
    if (!isRecord(criterion)) return;
    for (const key of ["verificationIds", "evidenceIds"] as const) {
      if (!Array.isArray(criterion[key]) || criterion[key].length === 0) issues.push(issue("plan.normalizer.graph_disconnected", `$.acceptanceCriteria[${index}].${key}`, "Every acceptance criterion must connect verification and evidence."));
    }
  });
  const criteriaById = new Map<string, Record<string, unknown>>();
  criteria.forEach((criterion) => {
    if (isRecord(criterion) && isNonEmptyString(criterion.id)) criteriaById.set(criterion.id, criterion);
  });
  const ownedCriteria = new Set<string>();
  tasks.forEach((task, taskIndex) => {
    if (!isRecord(task) || !Array.isArray(task.acceptanceIds)) return;
    const expectedVerification = new Set<string>();
    const expectedEvidence = new Set<string>();
    task.acceptanceIds.forEach((acceptanceId) => {
      if (typeof acceptanceId !== "string") return;
      ownedCriteria.add(acceptanceId);
      const criterion = criteriaById.get(acceptanceId);
      if (!criterion) return;
      if (Array.isArray(criterion.verificationIds)) criterion.verificationIds.forEach((id) => { if (typeof id === "string") expectedVerification.add(id); });
      if (Array.isArray(criterion.evidenceIds)) criterion.evidenceIds.forEach((id) => { if (typeof id === "string") expectedEvidence.add(id); });
    });
    const actualVerification = new Set(Array.isArray(task.verificationIds) ? task.verificationIds.filter((id): id is string => typeof id === "string") : []);
    const actualEvidence = new Set(Array.isArray(task.evidenceIds) ? task.evidenceIds.filter((id): id is string => typeof id === "string") : []);
    const sameSet = (first: ReadonlySet<string>, second: ReadonlySet<string>) => first.size === second.size && [...first].every((id) => second.has(id));
    if (!sameSet(actualVerification, expectedVerification)) issues.push(issue("plan.normalizer.graph_disconnected", `$.tasks[${taskIndex}].verificationIds`, "Task verification links must exactly match its acceptance criteria."));
    if (!sameSet(actualEvidence, expectedEvidence)) issues.push(issue("plan.normalizer.graph_disconnected", `$.tasks[${taskIndex}].evidenceIds`, "Task evidence links must exactly match its acceptance criteria."));
  });
  criteriaById.forEach((_criterion, id) => {
    if (!ownedCriteria.has(id)) issues.push(issue("plan.normalizer.graph_disconnected", "$.acceptanceCriteria", `Acceptance criterion ${id} is not owned by any task.`));
  });
}

export function normalizePlannerOutput(rawOutput: string, context: PlannerOutputNormalizationContext): PlannerOutputNormalizationResult {
  const rawOutputDigest = sha256Digest(rawOutput);
  const issues: PlanningValidationIssue[] = [];
  validateShape(context, contextShape, "$context", issues);
  if (!plannerIds.has(context.plannerId)) issues.push(issue("plan.normalizer.planner_invalid", "$context.plannerId", "Planner id is unsupported."));
  if (!isRecord(context.producer) || context.producer.adapter !== context.plannerId) issues.push(issue("plan.normalizer.planner_mismatch", "$context.producer.adapter", "Trusted producer adapter must match planner id."));
  if (context.rawOutputDigest !== rawOutputDigest) issues.push(issue("plan.normalizer.raw_digest_mismatch", "$context.rawOutputDigest", "Trusted raw output digest does not match the supplied string."));


  const parsed = parseRawOutput(rawOutput);
  issues.push(...parsed.issues);
  if (!parsed.value) return { valid: false, rawOutputDigest, issues };
  validateShape(parsed.value, outputShape, "$", issues);
  if (parsed.value.schemaVersion !== "boulder.planner-output.v1") issues.push(issue("plan.normalizer.schema_unsupported", "$.schemaVersion", "Unsupported planner output schema."));
  if (!plannerIds.has(parsed.value.plannerId as PlannerId)) issues.push(issue("plan.normalizer.planner_invalid", "$.plannerId", "Planner id is unsupported."));
  else if (parsed.value.plannerId !== context.plannerId) issues.push(issue("plan.normalizer.planner_mismatch", "$.plannerId", "Planner output id does not match trusted context."));
  if (!isNonEmptyString(parsed.value.planMarkdown)) issues.push(issue("plan.normalizer.field_invalid", "$.planMarkdown", "Plan markdown must be non-empty."));
  validatePlannerClaims(parsed.value, issues);
  validateConnectedPlan(parsed.value, issues);
  const sourceRefs = promoteSourceRefs(parsed.value, context, issues);
  if (issues.length > 0 || !sourceRefs) return { valid: false, rawOutputDigest, issues };
  const planMarkdown = parsed.value.planMarkdown as string;

  const packetContent = parsed.value;
  const packet = {
    schemaVersion: "boulder.planning-packet.v1" as const,
    runId: context.runId,
    createdAt: context.createdAt,
    packetDigest: "",
    producer: context.producer,
    task: context.task,
    objective: packetContent.objective,
    decisions: packetContent.decisions,
    scope: packetContent.scope,
    tasks: packetContent.tasks,
    acceptanceCriteria: packetContent.acceptanceCriteria,
    verification: packetContent.verification,
    risks: packetContent.risks,
    approvalPolicy: packetContent.approvalPolicy,
    review: packetContent.review,
    sourceRefs,
  };
  packet.packetDigest = planningDigest(packet);
  const validation = validatePlanningPacket(packet);
  if (!validation.valid || !validation.value) return { valid: false, rawOutputDigest, issues: validation.issues };
  const artifactWithoutDigest = {
    schemaVersion: "boulder.planner-normalization-artifact.v1" as const,
    rawOutput,
    rawOutputDigest,
    planMarkdown,
    plannerId: context.plannerId,
    context: { plannerId: context.plannerId, runId: context.runId, createdAt: context.createdAt, producer: context.producer, task: context.task, trustedSourceRefs: context.trustedSourceRefs },
    packet: validation.value,
    packetDigest: validation.value.packetDigest,
  };
  const artifact: PlannerNormalizationArtifact = { ...artifactWithoutDigest, artifactDigest: plannerNormalizationArtifactDigest(artifactWithoutDigest) };
  return { valid: true, packet: validation.value, canonicalPacket: canonicalizePlanningValue(validation.value), planMarkdown, rawOutputDigest, artifact, issues: [] };
}
