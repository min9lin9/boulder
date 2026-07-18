import type {
  ControlDecisionSeal,
  ControlEvidenceManifest,
  ControlPolicy,
  ControlRunEvent
} from "./control-kernel-types";

type JsonRecord = Record<string, unknown>;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;
const RUN_STATUSES = ["completed", "failed", "blocked"] as const;
const TOOL_STATUSES = ["completed", "failed", "blocked"] as const;
const CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"] as const;
const SOURCE_TYPES = ["document", "database", "api", "human", "derived"] as const;
const SEVERITIES = ["critical", "major"] as const;
const OPERATORS = ["gte", "lte", "eq"] as const;

export function validateControlRunEvent(value: unknown): readonly string[] {
  if (!record(value)) return ["run-event:object-required"];
  const issues: string[] = [];
  exact(value, "schemaVersion", "boulder.control.run-event.v1", "run-event", issues);
  for (const field of ["runId", "caseId", "taskId", "agentId", "agentVersion", "profileId", "profileVersion", "idempotencyKey", "policyId", "policyVersion", "promptVersion"]) {
    validId(value, field, "run-event", issues);
  }
  if (value.parentRunId !== null && !isId(value.parentRunId)) issues.push("run-event:parentRunId-invalid");
  for (const field of ["startedAt", "completedAt", "evidenceCutoffAt"]) validIso(value, field, "run-event", issues);
  for (const field of ["evidenceManifestHash", "policyHash"]) validHash(value, field, "run-event", issues);
  validChoice(value, "status", RUN_STATUSES, "run-event", issues);
  validateModel(value.model, issues);
  validateToolCalls(value.toolCalls, issues);
  validateStringArray(value.artifactHashes, "run-event:artifactHashes", HASH, issues);
  validateMetricMap(value.metrics, issues);
  validateStringArray(value.hardFailureSignals, "run-event:hardFailureSignals", ID, issues);
  if (isIso(value.startedAt) && isIso(value.completedAt) && Date.parse(value.completedAt) < Date.parse(value.startedAt)) {
    issues.push("run-event:completedAt-before-startedAt");
  }
  return unique(issues);
}

export function validateControlEvidenceManifest(value: unknown): readonly string[] {
  if (!record(value)) return ["evidence-manifest:object-required"];
  const issues: string[] = [];
  exact(value, "schemaVersion", "boulder.control.evidence-manifest.v1", "evidence-manifest", issues);
  for (const field of ["manifestId", "caseId"]) validId(value, field, "evidence-manifest", issues);
  for (const field of ["evidenceCutoffAt", "generatedAt"]) validIso(value, field, "evidence-manifest", issues);
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    issues.push("evidence-manifest:entries-invalid");
    return unique(issues);
  }
  const evidenceIds: string[] = [];
  value.entries.forEach((entry, index) => validateEvidenceEntry(entry, index, value.evidenceCutoffAt, evidenceIds, issues));
  if (new Set(evidenceIds).size !== evidenceIds.length) issues.push("evidence-manifest:duplicate-evidenceId");
  return unique(issues);
}

export function validateControlPolicy(value: unknown): readonly string[] {
  if (!record(value)) return ["policy:object-required"];
  const issues: string[] = [];
  exact(value, "schemaVersion", "boulder.control.policy.v1", "policy", issues);
  for (const field of ["id", "version"]) validId(value, field, "policy", issues);
  validateChoiceArray(value.blockingSeverities, "policy:blockingSeverities", SEVERITIES, true, issues);
  const ids: string[] = [];
  const signals: string[] = [];
  if (!Array.isArray(value.hardFailures)) issues.push("policy:hardFailures-invalid");
  else value.hardFailures.forEach((rule, index) => validateHardFailureRule(rule, index, ids, signals, issues));
  if (new Set(ids).size !== ids.length) issues.push("policy:duplicate-hard-failure-id");
  if (new Set(signals).size !== signals.length) issues.push("policy:duplicate-hard-failure-signal");
  const metrics: string[] = [];
  if (!Array.isArray(value.metricRules)) issues.push("policy:metricRules-invalid");
  else value.metricRules.forEach((rule, index) => validateMetricRule(rule, index, metrics, issues));
  if (new Set(metrics).size !== metrics.length) issues.push("policy:duplicate-metric-rule");
  return unique(issues);
}

export function validateControlDecisionSeal(value: unknown): readonly string[] {
  if (!record(value)) return ["decision-seal:object-required"];
  const issues: string[] = [];
  exact(value, "schemaVersion", "boulder.control.decision-seal.v1", "decision-seal", issues);
  exact(value, "algorithm", "sha256-canonical-json", "decision-seal", issues);
  for (const field of ["runId", "caseId", "taskId", "policyId", "policyVersion"]) validId(value, field, "decision-seal", issues);
  validIso(value, "sealedAt", "decision-seal", issues);
  for (const field of ["runHash", "evidenceManifestHash", "policyHash", "sealHash"]) validHash(value, field, "decision-seal", issues);
  return unique(issues);
}

export function isControlRunEvent(value: unknown): value is ControlRunEvent { return validateControlRunEvent(value).length === 0; }
export function isControlEvidenceManifest(value: unknown): value is ControlEvidenceManifest { return validateControlEvidenceManifest(value).length === 0; }
export function isControlPolicy(value: unknown): value is ControlPolicy { return validateControlPolicy(value).length === 0; }
export function isControlDecisionSeal(value: unknown): value is ControlDecisionSeal { return validateControlDecisionSeal(value).length === 0; }

function validateModel(value: unknown, issues: string[]): void {
  if (!record(value)) { issues.push("run-event:model-object-required"); return; }
  for (const field of ["provider", "name", "version"]) validId(value, field, "run-event:model", issues);
}

function validateToolCalls(value: unknown, issues: string[]): void {
  if (!Array.isArray(value)) { issues.push("run-event:toolCalls-invalid"); return; }
  value.forEach((call, index) => {
    const prefix = `run-event:toolCalls[${index}]`;
    if (!record(call)) { issues.push(`${prefix}-object-required`); return; }
    for (const field of ["toolId", "toolVersion", "action"]) validId(call, field, prefix, issues);
    validChoice(call, "status", TOOL_STATUSES, prefix, issues);
    validHash(call, "inputHash", prefix, issues);
    if (call.outputHash !== null && !isHash(call.outputHash)) issues.push(`${prefix}:outputHash-invalid`);
  });
}

function validateEvidenceEntry(value: unknown, index: number, cutoffValue: unknown, ids: string[], issues: string[]): void {
  const prefix = `evidence-manifest:entries[${index}]`;
  if (!record(value)) { issues.push(`${prefix}-object-required`); return; }
  for (const field of ["evidenceId", "sourceVersion"]) validId(value, field, prefix, issues);
  if (isId(value.evidenceId)) ids.push(value.evidenceId);
  validHash(value, "sha256", prefix, issues);
  validChoice(value, "sourceType", SOURCE_TYPES, prefix, issues);
  validChoice(value, "classification", CLASSIFICATIONS, prefix, issues);
  validIso(value, "observedAt", prefix, issues);
  if (value.sourceUriHash !== null && !isHash(value.sourceUriHash)) issues.push(`${prefix}:sourceUriHash-invalid`);
  if (isIso(value.observedAt) && isIso(cutoffValue) && Date.parse(value.observedAt) > Date.parse(cutoffValue)) issues.push(`${prefix}-after-cutoff`);
}

function validateHardFailureRule(value: unknown, index: number, ids: string[], signals: string[], issues: string[]): void {
  const prefix = `policy:hardFailures[${index}]`;
  if (!record(value)) { issues.push(`${prefix}-object-required`); return; }
  for (const field of ["id", "signal"]) validId(value, field, prefix, issues);
  if (isId(value.id)) ids.push(value.id);
  if (isId(value.signal)) signals.push(value.signal);
  validChoice(value, "severity", SEVERITIES, prefix, issues);
  validDescription(value, prefix, issues);
}

function validateMetricRule(value: unknown, index: number, metrics: string[], issues: string[]): void {
  const prefix = `policy:metricRules[${index}]`;
  if (!record(value)) { issues.push(`${prefix}-object-required`); return; }
  validId(value, "metricId", prefix, issues);
  if (isId(value.metricId)) metrics.push(value.metricId);
  validChoice(value, "operator", OPERATORS, prefix, issues);
  if (typeof value.threshold !== "number" || !Number.isFinite(value.threshold)) issues.push(`${prefix}:threshold-invalid`);
  validDescription(value, prefix, issues);
}

function exact(value: JsonRecord, field: string, expected: string, prefix: string, issues: string[]): void {
  if (value[field] !== expected) issues.push(`${prefix}:${field}-must-equal-${expected}`);
}

function validId(value: JsonRecord, field: string, prefix: string, issues: string[]): void {
  if (!isId(value[field])) issues.push(`${prefix}:${field}-invalid`);
}

function validHash(value: JsonRecord, field: string, prefix: string, issues: string[]): void {
  if (!isHash(value[field])) issues.push(`${prefix}:${field}-invalid`);
}

function validIso(value: JsonRecord, field: string, prefix: string, issues: string[]): void {
  if (!isIso(value[field])) issues.push(`${prefix}:${field}-invalid`);
}

function validChoice<T extends string>(value: JsonRecord, field: string, allowed: readonly T[], prefix: string, issues: string[]): void {
  if (typeof value[field] !== "string" || !allowed.some((item) => item === value[field])) issues.push(`${prefix}:${field}-invalid`);
}

function validateChoiceArray<T extends string>(value: unknown, prefix: string, allowed: readonly T[], nonEmpty: boolean, issues: string[]): void {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0) || !value.every((item) => typeof item === "string" && allowed.some((candidate) => candidate === item))) {
    issues.push(`${prefix}-invalid`);
  }
}

function validateStringArray(value: unknown, prefix: string, pattern: RegExp, issues: string[]): void {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && pattern.test(item))) issues.push(`${prefix}-invalid`);
}

function validateMetricMap(value: unknown, issues: string[]): void {
  if (!record(value)) { issues.push("run-event:metrics-object-required"); return; }
  for (const [key, metric] of Object.entries(value)) {
    if (!ID.test(key)) issues.push(`run-event:metrics-key-invalid:${key}`);
    if (typeof metric !== "number" || !Number.isFinite(metric)) issues.push(`run-event:metrics-value-invalid:${key}`);
  }
}

function validDescription(value: JsonRecord, prefix: string, issues: string[]): void {
  if (typeof value.description !== "string" || value.description.trim().length === 0 || value.description.length > 500) issues.push(`${prefix}:description-invalid`);
}

function isIso(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function isHash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function record(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function unique(values: readonly string[]): readonly string[] { return Array.from(new Set(values)); }
