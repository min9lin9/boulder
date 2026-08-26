import {
  V2_ARTIFACT_SCHEMA_VERSION,
  V2_AUTHORITY_EVENT_SCHEMA_VERSION,
  V2_CRITIQUE_SCHEMA_VERSION,
  V2_EFFECT_SCHEMA_VERSION,
  V2_EXECUTION_ENVELOPE_SCHEMA_VERSION,
  V2_EXECUTION_RESULT_SCHEMA_VERSION,
  V2_EVIDENCE_SCHEMA_VERSION,
  V2_PLAN_SCHEMA_VERSION,
  isV2Base64Url,
  isV2Digest,
  isV2EffectClass,
  isV2ExtensionKey,
  isV2Id,
  isV2Rfc3339Millis,
  type V2Artifact,
  type V2AuthorityEvent,
  type V2Critique,
  type V2Digest,
  type V2EffectDeclaration,
  type V2Evidence,
  type V2ExecutionEnvelope,
  type V2ExecutionResult,
  type V2JsonValue,
  type V2Plan,
} from "./contracts.js";
import {
  V2CanonicalizationError,
  digestV2Artifact,
  digestV2AuthorityEvent,
  digestV2Content,
  digestV2Critique,
  digestV2Evidence,
  digestV2ExecutionResult,
  digestV2Input,
  digestV2Plan,
  digestV2PolicySnapshot,
  digestV2Scope,
} from "./canonical.js";

export interface V2ValidationIssue {
  readonly id: `v2.${string}`;
  readonly path: string;
  readonly message: string;
}
export type V2ValidationResult<T> =
  | { readonly ok: true; readonly value: T; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: readonly V2ValidationIssue[] };

const MAX_ISSUES = 100;
type JsonRecord = Record<string, unknown>;
function asValidatedV2<T>(value: unknown): T {
  return value as unknown as T;
}

class IssueCollector {
  readonly issues: V2ValidationIssue[] = [];
  add(id: `v2.${string}`, path: string, message: string): void {
    if (this.issues.length < MAX_ISSUES) this.issues.push({ id, path, message });
  }
  result<T>(value: T): V2ValidationResult<T> {
    const issues = this.issues.sort((left, right) => compareStable(left.path, right.path) || compareStable(left.id, right.id));
    return issues.length === 0 ? { ok: true, value, issues: [] } : { ok: false, issues };
  }
}

export async function validateV2Plan(value: unknown): Promise<V2ValidationResult<V2Plan>> {
  const issues = new IssueCollector();
  await validatePlan(value, "$", issues);
  return issues.result(asValidatedV2<V2Plan>(value));
}

export async function validateV2ExecutionEnvelope(value: unknown): Promise<V2ValidationResult<V2ExecutionEnvelope>> {
  const issues = new IssueCollector();
  if (!isRecord(value)) {
    issues.add("v2.envelope.type", "$", "Execution envelope must be an object.");
    return issues.result(asValidatedV2<V2ExecutionEnvelope>(value));
  }
  requireExactKeys(value, ["schemaVersion", "plan", "requestedStepId", "extensions"], ["authorityEvents"], "$", issues);
  requireLiteral(value.schemaVersion, V2_EXECUTION_ENVELOPE_SCHEMA_VERSION, "$.schemaVersion", issues);
  await validatePlan(value.plan, "$.plan", issues);
  requireId(value.requestedStepId, "$.requestedStepId", issues);
  validateExtensions(value.extensions, "$.extensions", issues);
  if ("authorityEvents" in value) {
    if (!Array.isArray(value.authorityEvents)) {
      issues.add("v2.authority.events_type", "$.authorityEvents", "Authority events must be an array.");
    } else {
      validateUniqueIds(value.authorityEvents, "$.authorityEvents", issues);
      for (let index = 0; index < value.authorityEvents.length; index += 1) {
        await validateAuthorityEvent(value.authorityEvents[index], `$.authorityEvents[${index}]`, issues);
      }
    }
  }
  if (isRecord(value.plan) && isV2Id(value.requestedStepId) && Array.isArray(value.plan.steps)
    && !value.plan.steps.some((step) => isRecord(step) && step.id === value.requestedStepId)) {
    issues.add("v2.reference.unknown", "$.requestedStepId", "Requested step does not exist in the plan.");
  }
  return issues.result(asValidatedV2<V2ExecutionEnvelope>(value));
}
export async function validateV2AuthorityEvent(value: unknown): Promise<V2ValidationResult<V2AuthorityEvent>> {
  const issues = new IssueCollector();
  await validateAuthorityEvent(value, "$", issues);
  return issues.result(asValidatedV2<V2AuthorityEvent>(value));
}
export async function validateV2EffectDeclaration(value: unknown): Promise<V2ValidationResult<V2EffectDeclaration>> {
  const issues = new IssueCollector();
  await validateEffect(value, "$", issues);
  return issues.result(asValidatedV2<V2EffectDeclaration>(value));
}

export async function validateV2Artifact(value: unknown): Promise<V2ValidationResult<V2Artifact>> {
  const issues = new IssueCollector();
  if (isRecord(value)) {
    requireExactKeys(value, ["schemaVersion", "id", "kind", "schemaId", "subjectPlanDigest", "stepId", "inputDigest", "contentDigest", "content", "artifactDigest"], [], "$", issues);
    requireLiteral(value.schemaVersion, V2_ARTIFACT_SCHEMA_VERSION, "$.schemaVersion", issues);
    requireId(value.id, "$.id", issues); requireNonEmptyString(value.kind, "$.kind", issues); requireNonEmptyString(value.schemaId, "$.schemaId", issues);
    requireDigest(value.subjectPlanDigest, "$.subjectPlanDigest", issues); requireId(value.stepId, "$.stepId", issues); requireDigest(value.inputDigest, "$.inputDigest", issues);
    requireDigest(value.contentDigest, "$.contentDigest", issues); validateJson(value.content, "$.content", issues); requireDigest(value.artifactDigest, "$.artifactDigest", issues);
    if (isJsonValue(value.content)) await compareDigest(value.contentDigest, digestV2Content(value.content), "$.contentDigest", issues);
    await compareDigest(value.artifactDigest, digestV2Artifact(asValidatedV2<V2Artifact>(value)), "$.artifactDigest", issues);
  } else issues.add("v2.artifact.type", "$", "Artifact must be an object.");
  return issues.result(asValidatedV2<V2Artifact>(value));
}

export async function validateV2Evidence(value: unknown): Promise<V2ValidationResult<V2Evidence>> {
  const issues = new IssueCollector();
  if (isRecord(value)) {
    requireExactKeys(value, ["schemaVersion", "id", "kind", "subjectArtifactId", "subjectArtifactDigest", "producer", "observedAt", "digest", "payload"], [], "$", issues);
    requireLiteral(value.schemaVersion, V2_EVIDENCE_SCHEMA_VERSION, "$.schemaVersion", issues); requireId(value.id, "$.id", issues); requireNonEmptyString(value.kind, "$.kind", issues);
    requireId(value.subjectArtifactId, "$.subjectArtifactId", issues); requireDigest(value.subjectArtifactDigest, "$.subjectArtifactDigest", issues); validateProducer(value.producer, "$.producer", issues);
    requireTimestamp(value.observedAt, "$.observedAt", issues); requireDigest(value.digest, "$.digest", issues); validateJson(value.payload, "$.payload", issues);
    await compareDigest(value.digest, digestV2Evidence(asValidatedV2<V2Evidence>(value)), "$.digest", issues);
  } else issues.add("v2.evidence.type", "$", "Evidence must be an object.");
  return issues.result(asValidatedV2<V2Evidence>(value));
}

export async function validateV2ExecutionResult(value: unknown): Promise<V2ValidationResult<V2ExecutionResult>> {
  const issues = new IssueCollector();
  if (isRecord(value)) {
    requireExactKeys(value, ["schemaVersion", "workflowId", "planDigest", "stepId", "invocationId", "capability", "status", "artifactIds", "artifactDigests", "evidenceIds", "evidenceDigests", "resultDigest"], ["failure"], "$", issues);
    requireLiteral(value.schemaVersion, V2_EXECUTION_RESULT_SCHEMA_VERSION, "$.schemaVersion", issues); requireId(value.workflowId, "$.workflowId", issues); requireDigest(value.planDigest, "$.planDigest", issues);
    requireId(value.stepId, "$.stepId", issues); requireId(value.invocationId, "$.invocationId", issues); validateProducer(value.capability, "$.capability", issues);
    if (value.status !== "succeeded" && value.status !== "blocked") issues.add("v2.result.status_invalid", "$.status", "Status must be succeeded or blocked.");
    validateLinkedArrays(value.artifactIds, value.artifactDigests, "$.artifactIds", "$.artifactDigests", issues);
    validateLinkedArrays(value.evidenceIds, value.evidenceDigests, "$.evidenceIds", "$.evidenceDigests", issues); requireDigest(value.resultDigest, "$.resultDigest", issues);
    if (value.status === "blocked") validateFailure(value.failure, "$.failure", issues);
    if (value.status === "succeeded" && "failure" in value) issues.add("v2.result.failure_forbidden", "$.failure", "Successful results cannot contain failure.");
    await compareDigest(value.resultDigest, digestV2ExecutionResult(asValidatedV2<V2ExecutionResult>(value)), "$.resultDigest", issues);
  } else issues.add("v2.result.type", "$", "Execution result must be an object.");
  return issues.result(asValidatedV2<V2ExecutionResult>(value));
}

export async function validateV2Critique(value: unknown): Promise<V2ValidationResult<V2Critique>> {
  const issues = new IssueCollector();
  if (isRecord(value)) {
    requireExactKeys(value, ["schemaVersion", "targetResultDigest", "targetArtifactIds", "targetArtifactDigests", "evidenceIds", "evidenceDigests", "evaluator", "verdict", "findings", "critiqueDigest"], [], "$", issues);
    requireLiteral(value.schemaVersion, V2_CRITIQUE_SCHEMA_VERSION, "$.schemaVersion", issues); requireDigest(value.targetResultDigest, "$.targetResultDigest", issues);
    validateLinkedArrays(value.targetArtifactIds, value.targetArtifactDigests, "$.targetArtifactIds", "$.targetArtifactDigests", issues);
    validateLinkedArrays(value.evidenceIds, value.evidenceDigests, "$.evidenceIds", "$.evidenceDigests", issues); validateEvaluator(value.evaluator, "$.evaluator", issues);
    if (!["pass", "revise", "human-review", "reject"].includes(String(value.verdict))) issues.add("v2.critique.verdict_invalid", "$.verdict", "Verdict is invalid.");
    validateFindings(value.findings, "$.findings", issues); requireDigest(value.critiqueDigest, "$.critiqueDigest", issues);
    await compareDigest(value.critiqueDigest, digestV2Critique(asValidatedV2<V2Critique>(value)), "$.critiqueDigest", issues);
  } else issues.add("v2.critique.type", "$", "Critique must be an object.");
  return issues.result(asValidatedV2<V2Critique>(value));
}

async function validatePlan(value: unknown, path: string, issues: IssueCollector): Promise<void> {
  if (!isRecord(value)) { issues.add("v2.plan.type", path, "Plan must be an object."); return; }
  requireExactKeys(value, ["schemaVersion", "workflowId", "planRevision", "intent", "policySnapshot", "steps", "extensions", "planDigest"], [], path, issues);
  requireLiteral(value.schemaVersion, V2_PLAN_SCHEMA_VERSION, `${path}.schemaVersion`, issues); requireId(value.workflowId, `${path}.workflowId`, issues);
  if (typeof value.planRevision !== "number" || !Number.isInteger(value.planRevision) || !Number.isSafeInteger(value.planRevision) || value.planRevision <= 0) issues.add("v2.plan.revision_invalid", `${path}.planRevision`, "Plan revision must be a positive integer.");
  validateIntent(value.intent, `${path}.intent`, issues); await validatePolicy(value.policySnapshot, `${path}.policySnapshot`, issues); validateExtensions(value.extensions, `${path}.extensions`, issues);
  if (!Array.isArray(value.steps) || value.steps.length === 0) { issues.add("v2.plan.steps_invalid", `${path}.steps`, "Plan must contain at least one step."); }
  else {
    validateUniqueIds(value.steps, `${path}.steps`, issues);
    for (let index = 0; index < value.steps.length; index += 1) await validateStep(value.steps[index], `${path}.steps[${index}]`, issues);
    validateDependencies(value.steps, `${path}.steps`, issues);
  }
  requireDigest(value.planDigest, `${path}.planDigest`, issues);
  await compareDigest(value.planDigest, digestV2Plan(asValidatedV2<V2Plan>(value)), `${path}.planDigest`, issues);
}

function validateIntent(value: unknown, path: string, issues: IssueCollector): void {
  if (!isRecord(value)) { issues.add("v2.intent.type", path, "Intent must be an object."); return; }
  requireExactKeys(value, ["id", "objective", "acceptance"], [], path, issues); requireId(value.id, `${path}.id`, issues); requireNonEmptyString(value.objective, `${path}.objective`, issues); validateStringArray(value.acceptance, `${path}.acceptance`, issues, true);
}
async function validatePolicy(value: unknown, path: string, issues: IssueCollector): Promise<void> {
  if (!isRecord(value)) { issues.add("v2.policy.type", path, "Policy snapshot must be an object."); return; }
  requireExactKeys(value, ["policyRevision", "digest"], [], path, issues); requireNonEmptyString(value.policyRevision, `${path}.policyRevision`, issues); requireDigest(value.digest, `${path}.digest`, issues);
  await compareDigest(value.digest, digestV2PolicySnapshot(asValidatedV2<{ policyRevision: string; digest: V2Digest }>(value)), `${path}.digest`, issues);
}
async function validateStep(value: unknown, path: string, issues: IssueCollector): Promise<void> {
  if (!isRecord(value)) { issues.add("v2.step.type", path, "Step must be an object."); return; }
  requireExactKeys(value, ["id", "dependsOn", "capabilityBinding", "input", "declaredEffects", "requiredEvidenceKinds"], [], path, issues);
  requireId(value.id, `${path}.id`, issues); validateIdArray(value.dependsOn, `${path}.dependsOn`, issues); validateBinding(value.capabilityBinding, `${path}.capabilityBinding`, issues);
  await validateInput(value.input, `${path}.input`, issues);
  if (!Array.isArray(value.declaredEffects) || value.declaredEffects.length === 0) issues.add("v2.step.effects_invalid", `${path}.declaredEffects`, "Each step needs at least one effect declaration.");
  else { validateUniqueIds(value.declaredEffects, `${path}.declaredEffects`, issues); for (let index = 0; index < value.declaredEffects.length; index += 1) await validateEffect(value.declaredEffects[index], `${path}.declaredEffects[${index}]`, issues); }
  if (isRecord(value.input) && isV2Digest(value.input.digest) && Array.isArray(value.declaredEffects)) {
    for (let index = 0; index < value.declaredEffects.length; index += 1) {
      const effect = value.declaredEffects[index];
      if (isRecord(effect) && isV2Digest(effect.inputDigest) && effect.inputDigest !== value.input.digest) {
        issues.add("v2.effect.input_mismatch", `${path}.declaredEffects[${index}].inputDigest`, "Effect input digest must match the step input.");
      }
    }
  }
  validateStringArray(value.requiredEvidenceKinds, `${path}.requiredEvidenceKinds`, issues, true);
}
function validateBinding(value: unknown, path: string, issues: IssueCollector): void {
  if (!isRecord(value)) { issues.add("v2.binding.type", path, "Capability binding must be an object."); return; }
  requireExactKeys(value, ["capabilityId", "capabilityVersion", "invocationId"], [], path, issues); requireId(value.capabilityId, `${path}.capabilityId`, issues); requireNonEmptyString(value.capabilityVersion, `${path}.capabilityVersion`, issues); requireId(value.invocationId, `${path}.invocationId`, issues);
}
async function validateInput(value: unknown, path: string, issues: IssueCollector): Promise<void> {
  if (!isRecord(value)) { issues.add("v2.input.type", path, "Input must be an object."); return; }
  requireExactKeys(value, ["schemaId", "digest", "value"], [], path, issues); requireNonEmptyString(value.schemaId, `${path}.schemaId`, issues); requireDigest(value.digest, `${path}.digest`, issues); validateJson(value.value, `${path}.value`, issues);
  if (isJsonValue(value.value)) await compareDigest(value.digest, digestV2Input({ value: value.value }), `${path}.digest`, issues);
}
async function validateEffect(value: unknown, path: string, issues: IssueCollector): Promise<void> {
  if (!isRecord(value)) { issues.add("v2.effect.type", path, "Effect declaration must be an object."); return; }
  requireExactKeys(value, ["schemaVersion", "id", "class", "scope", "inputDigest"], [], path, issues); requireLiteral(value.schemaVersion, V2_EFFECT_SCHEMA_VERSION, `${path}.schemaVersion`, issues); requireId(value.id, `${path}.id`, issues);
  if (!isV2EffectClass(value.class)) issues.add("v2.effect.class_invalid", `${path}.class`, "Effect class is invalid."); requireDigest(value.inputDigest, `${path}.inputDigest`, issues);
  if (!isRecord(value.scope)) { issues.add("v2.scope.type", `${path}.scope`, "Scope must be an object."); return; }
  requireExactKeys(value.scope, ["kind", "resources", "scopeDigest"], [], `${path}.scope`, issues); requireNonEmptyString(value.scope.kind, `${path}.scope.kind`, issues); validateStringArray(value.scope.resources, `${path}.scope.resources`, issues, true); requireDigest(value.scope.scopeDigest, `${path}.scope.scopeDigest`, issues);
  if (value.class === "none" && (!Array.isArray(value.scope.resources) || value.scope.resources.length !== 0)) issues.add("v2.effect.none_scope", `${path}.scope.resources`, "None effects require an empty resource list.");
  await compareDigest(value.scope.scopeDigest, digestV2Scope(asValidatedV2<{ kind: string; resources: readonly string[]; scopeDigest: V2Digest }>(value.scope)), `${path}.scope.scopeDigest`, issues);
}

async function validateAuthorityEvent(value: unknown, path: string, issues: IssueCollector): Promise<void> {
  if (!isRecord(value)) { issues.add("v2.authority.event_type", path, "Authority event must be an object."); return; }
  requireExactKeys(value, ["schemaVersion", "id", "issuer", "keyId", "algorithm", "signedAt", "expiresAt", "policyRevision", "workflowId", "planRevision", "stepId", "effectId", "effectClass", "scopeDigest", "inputDigest", "nonce", "eventDigest", "signature"], [], path, issues);
  requireLiteral(value.schemaVersion, V2_AUTHORITY_EVENT_SCHEMA_VERSION, `${path}.schemaVersion`, issues); requireId(value.id, `${path}.id`, issues); requireNonEmptyString(value.issuer, `${path}.issuer`, issues); requireNonEmptyString(value.keyId, `${path}.keyId`, issues);
  if (value.algorithm !== "Ed25519") issues.add("v2.authority.algorithm_invalid", `${path}.algorithm`, "Only Ed25519 is supported."); requireTimestamp(value.signedAt, `${path}.signedAt`, issues); requireTimestamp(value.expiresAt, `${path}.expiresAt`, issues); requireNonEmptyString(value.policyRevision, `${path}.policyRevision`, issues);
  requireId(value.workflowId, `${path}.workflowId`, issues); if (typeof value.planRevision !== "number" || !Number.isInteger(value.planRevision) || !Number.isSafeInteger(value.planRevision) || value.planRevision <= 0) issues.add("v2.authority.revision_invalid", `${path}.planRevision`, "Plan revision must be positive.");
  requireId(value.stepId, `${path}.stepId`, issues); requireId(value.effectId, `${path}.effectId`, issues); if (!isV2EffectClass(value.effectClass)) issues.add("v2.authority.effect_class_invalid", `${path}.effectClass`, "Effect class is invalid."); requireDigest(value.scopeDigest, `${path}.scopeDigest`, issues); requireDigest(value.inputDigest, `${path}.inputDigest`, issues);
  if (!isV2Base64Url(value.nonce, 16, 32)) issues.add("v2.authority.nonce_invalid", `${path}.nonce`, "Nonce must be canonical base64url for 16 to 32 bytes."); requireDigest(value.eventDigest, `${path}.eventDigest`, issues); if (!isV2Base64Url(value.signature, 64, 64)) issues.add("v2.authority.signature_encoding_invalid", `${path}.signature`, "Signature must be canonical base64url for 64 bytes.");
  await compareDigest(value.eventDigest, digestV2AuthorityEvent(asValidatedV2<V2AuthorityEvent>(value)), `${path}.eventDigest`, issues);
}

const V2_RESERVED_EXTENSION_NAMESPACE = "boulder.";
function validateExtensions(value: unknown, path: string, issues: IssueCollector): void {
  if (!isRecord(value)) { issues.add("v2.extensions.type", path, "Extensions must be an object."); return; }
  for (const key of Object.keys(value)) { if (!isV2ExtensionKey(key) || key.startsWith(V2_RESERVED_EXTENSION_NAMESPACE)) issues.add("v2.extensions.key_invalid", `${path}.${key}`, "Extension keys must use non-reserved reverse-domain names."); validateJson(value[key], `${path}.${key}`, issues); }
}
function validateProducer(value: unknown, path: string, issues: IssueCollector): void {
  if (!isRecord(value)) { issues.add("v2.provenance.type", path, "Provenance must be an object."); return; }
  requireExactKeys(value, ["id", "version"], [], path, issues); requireId(value.id, `${path}.id`, issues); requireNonEmptyString(value.version, `${path}.version`, issues);
}
function validateEvaluator(value: unknown, path: string, issues: IssueCollector): void {
  if (!isRecord(value)) { issues.add("v2.evaluator.type", path, "Evaluator must be an object."); return; }
  requireExactKeys(value, ["id", "version", "policyDigest"], [], path, issues); requireId(value.id, `${path}.id`, issues); requireNonEmptyString(value.version, `${path}.version`, issues); requireDigest(value.policyDigest, `${path}.policyDigest`, issues);
}
function validateFailure(value: unknown, path: string, issues: IssueCollector): void {
  if (!isRecord(value)) { issues.add("v2.result.failure_required", path, "Blocked results require a failure object."); return; }
  requireExactKeys(value, ["code", "message"], [], path, issues); requireNonEmptyString(value.code, `${path}.code`, issues); requireNonEmptyString(value.message, `${path}.message`, issues);
}
function validateFindings(value: unknown, path: string, issues: IssueCollector): void {
  if (!Array.isArray(value)) { issues.add("v2.critique.findings_type", path, "Findings must be an array."); return; }
  for (let index = 0; index < value.length; index += 1) { const finding = value[index]; if (!isRecord(finding)) { issues.add("v2.critique.finding_type", `${path}[${index}]`, "Finding must be an object."); continue; } requireExactKeys(finding, ["id", "severity", "message"], [], `${path}[${index}]`, issues); requireNonEmptyString(finding.id, `${path}[${index}].id`, issues); if (!["info", "warning", "error"].includes(String(finding.severity))) issues.add("v2.critique.severity_invalid", `${path}[${index}].severity`, "Finding severity is invalid."); requireNonEmptyString(finding.message, `${path}[${index}].message`, issues); }
}

function validateDependencies(steps: readonly unknown[], path: string, issues: IssueCollector): void {
  const ids = new Set<string>(); for (const step of steps) if (isRecord(step) && isV2Id(step.id)) ids.add(step.id);
  const graph = new Map<string, readonly string[]>();
  for (let index = 0; index < steps.length; index += 1) { const step = steps[index]; if (!isRecord(step) || !isV2Id(step.id) || !Array.isArray(step.dependsOn)) continue; const dependencies = step.dependsOn.filter(isV2Id); graph.set(step.id, dependencies); for (let dependencyIndex = 0; dependencyIndex < dependencies.length; dependencyIndex += 1) if (!ids.has(dependencies[dependencyIndex])) issues.add("v2.reference.unknown", `${path}[${index}].dependsOn[${dependencyIndex}]`, "Step dependency does not exist."); }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): void => { if (visiting.has(id)) { issues.add("v2.dependency.cycle", path, "Step dependencies contain a cycle."); return; } if (visited.has(id)) return; visiting.add(id); for (const dependency of graph.get(id) ?? []) visit(dependency); visiting.delete(id); visited.add(id); };
  for (const id of graph.keys()) visit(id);
}
function validateLinkedArrays(ids: unknown, digests: unknown, idsPath: string, digestsPath: string, issues: IssueCollector): void {
  validateIdArray(ids, idsPath, issues);
  if (!Array.isArray(digests)) { issues.add("v2.array.type", digestsPath, "Digest links must be an array."); return; }
  const seen = new Set<string>();
  for (let index = 0; index < digests.length; index += 1) {
    requireDigest(digests[index], `${digestsPath}[${index}]`, issues);
    if (typeof digests[index] === "string") {
      if (seen.has(digests[index])) issues.add("v2.array.duplicate", `${digestsPath}[${index}]`, "Array values must be duplicate-free.");
      seen.add(digests[index]);
    }
  }
  if (Array.isArray(ids) && ids.length !== digests.length) issues.add("v2.link.length_mismatch", digestsPath, "ID and digest links must have equal lengths.");
}
function validateIdArray(value: unknown, path: string, issues: IssueCollector): void { if (!Array.isArray(value)) { issues.add("v2.array.type", path, "IDs must be an array."); return; } const seen = new Set<string>(); for (let index = 0; index < value.length; index += 1) { requireId(value[index], `${path}[${index}]`, issues); if (typeof value[index] === "string") { if (seen.has(value[index])) issues.add("v2.array.duplicate", `${path}[${index}]`, "Array values must be duplicate-free."); seen.add(value[index]); } } }
function validateStringArray(value: unknown, path: string, issues: IssueCollector, nonEmpty: boolean): void { if (!Array.isArray(value)) { issues.add("v2.array.type", path, "Value must be an array."); return; } const seen = new Set<string>(); for (let index = 0; index < value.length; index += 1) { if (typeof value[index] !== "string" || (nonEmpty && value[index].length === 0)) issues.add("v2.field.string_invalid", `${path}[${index}]`, "Value must be a non-empty string."); else if (seen.has(value[index])) issues.add("v2.array.duplicate", `${path}[${index}]`, "Array values must be duplicate-free."); else seen.add(value[index]); } }
function validateUniqueIds(values: readonly unknown[], path: string, issues: IssueCollector): void { const seen = new Set<string>(); for (let index = 0; index < values.length; index += 1) { const value = values[index]; if (!isRecord(value) || !isV2Id(value.id)) continue; if (seen.has(value.id)) issues.add("v2.reference.duplicate", `${path}[${index}].id`, "IDs must be unique."); seen.add(value.id); } }
function requireExactKeys(value: JsonRecord, required: readonly string[], optional: readonly string[], path: string, issues: IssueCollector): void { const allowed = new Set([...required, ...optional]); for (const key of required) if (!(key in value)) issues.add("v2.field.required", `${path}.${key}`, "Required field is missing."); for (const key of Object.keys(value)) if (!allowed.has(key)) issues.add("v2.field.unknown", `${path}.${key}`, "Unknown field is not permitted."); }
function requireLiteral(value: unknown, expected: string, path: string, issues: IssueCollector): void { if (value !== expected) issues.add("v2.schema.invalid", path, `Expected ${expected}.`); }
function requireId(value: unknown, path: string, issues: IssueCollector): void { if (!isV2Id(value)) issues.add("v2.id.invalid", path, "ID must be a safe slug."); }
function requireDigest(value: unknown, path: string, issues: IssueCollector): void { if (!isV2Digest(value)) issues.add("v2.digest.invalid", path, "Digest must be sha256 with lowercase hexadecimal."); }
function requireTimestamp(value: unknown, path: string, issues: IssueCollector): void { if (!isV2Rfc3339Millis(value)) issues.add("v2.timestamp.invalid", path, "Timestamp must be UTC RFC3339 with milliseconds."); }
function requireNonEmptyString(value: unknown, path: string, issues: IssueCollector): void { if (typeof value !== "string" || value.length === 0) issues.add("v2.field.string_invalid", path, "Value must be a non-empty string."); }
function validateJson(value: unknown, path: string, issues: IssueCollector, depth = 0): void { if (depth > 100) { issues.add("v2.json.depth_exceeded", path, "JSON value is too deeply nested."); return; } if (value === null || typeof value === "boolean") return; if (typeof value === "string") { if (hasLoneSurrogate(value)) issues.add("v2.json.invalid_string", path, "Strings cannot contain lone surrogate code points."); return; } if (typeof value === "number") { if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) issues.add("v2.json.invalid_number", path, "Number is outside I-JSON."); return; } if (Array.isArray(value)) { for (let index = 0; index < value.length; index += 1) validateJson(value[index], `${path}[${index}]`, issues, depth + 1); return; } if (isRecord(value)) { for (const key of Object.keys(value)) { if (hasLoneSurrogate(key)) issues.add("v2.json.invalid_string", `${path}.${key}`, "Strings cannot contain lone surrogate code points."); validateJson(value[key], `${path}.${key}`, issues, depth + 1); } return; } issues.add("v2.json.invalid", path, "Value is not JSON."); }
function isJsonValue(value: unknown): value is V2JsonValue { const issues = new IssueCollector(); validateJson(value, "$", issues); return issues.issues.length === 0; }
function hasLoneSurrogate(value: string): boolean { for (let index = 0; index < value.length; index += 1) { const code = value.charCodeAt(index); if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(index + 1); if (!(next >= 0xdc00 && next <= 0xdfff)) return true; index += 1; } else if (code >= 0xdc00 && code <= 0xdfff) return true; } return false; }
function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
async function compareDigest(actual: unknown, expected: Promise<V2Digest>, path: string, issues: IssueCollector): Promise<void> {
  if (!isV2Digest(actual)) return;
  try {
    if (actual !== await expected) issues.add("v2.digest.mismatch", path, "Digest does not match its canonical projection.");
  } catch (error) {
    if (error instanceof V2CanonicalizationError) {
      issues.add("v2.digest.projection_invalid", path, error.message);
      return;
    }
    throw error;
  }
}
