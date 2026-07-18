import {
  isControlDecisionSeal,
  isControlEvidenceManifest,
  isControlPolicy,
  isControlRunEvent,
  validateControlDecisionSeal,
  validateControlEvidenceManifest,
  validateControlPolicy,
  validateControlRunEvent
} from "./control-kernel-validation";
import type {
  ControlDecisionSeal,
  ControlEvidenceManifest,
  ControlEvaluation,
  ControlPolicy,
  ControlRunEvent,
  MetricCheck,
  SealVerification,
  TriggeredHardFailure
} from "./control-kernel-types";

export * from "./control-kernel-types";
export {
  isControlDecisionSeal,
  isControlEvidenceManifest,
  isControlPolicy,
  isControlRunEvent,
  validateControlDecisionSeal,
  validateControlEvidenceManifest,
  validateControlPolicy,
  validateControlRunEvent
} from "./control-kernel-validation";

export async function evaluateControlRun(runValue: unknown, manifestValue: unknown, policyValue: unknown): Promise<ControlEvaluation> {
  const runIssues = validateControlRunEvent(runValue);
  const manifestIssues = validateControlEvidenceManifest(manifestValue);
  const policyIssues = validateControlPolicy(policyValue);
  const issues = [...runIssues, ...manifestIssues, ...policyIssues];
  const run = runIssues.length === 0 ? runValue as ControlRunEvent : null;
  const manifest = manifestIssues.length === 0 ? manifestValue as ControlEvidenceManifest : null;
  const policy = policyIssues.length === 0 ? policyValue as ControlPolicy : null;
  const manifestHash = manifest ? await hashControlValue(manifest) : zeroHash();
  const policyHash = policy ? await hashControlValue(policy) : zeroHash();

  if (run && manifest) {
    if (run.caseId !== manifest.caseId) issues.push("binding:caseId-mismatch");
    if (run.evidenceCutoffAt !== manifest.evidenceCutoffAt) issues.push("binding:evidence-cutoff-mismatch");
    if (run.evidenceManifestHash !== manifestHash) issues.push("binding:evidence-manifest-hash-mismatch");
  }
  if (run && policy) {
    if (run.policyId !== policy.id) issues.push("binding:policy-id-mismatch");
    if (run.policyVersion !== policy.version) issues.push("binding:policy-version-mismatch");
    if (run.policyHash !== policyHash) issues.push("binding:policy-hash-mismatch");
  }
  if (run?.status !== undefined && run.status !== "completed") issues.push(`run-status:${run.status}`);
  if (run) {
    for (const call of run.toolCalls) {
      if (call.status === "completed" && call.outputHash === null) issues.push(`tool-call:completed-output-missing:${call.toolId}`);
    }
    const allowedSignals = new Set(policy?.hardFailures.map((rule) => rule.signal) ?? []);
    for (const signal of run.hardFailureSignals) {
      if (!allowedSignals.has(signal)) issues.push(`hard-failure-signal-unregistered:${signal}`);
    }
  }

  const triggeredHardFailures = run && policy ? triggeredFailures(run, policy) : [];
  const metricChecks = run && policy ? evaluateMetrics(run, policy) : [];
  const blocked = issues.length > 0 || triggeredHardFailures.some((item) => item.blocked) || metricChecks.some((item) => item.status === "fail");
  return {
    schemaVersion: "boulder.control.evaluation.v1",
    runId: run?.runId ?? "invalid-run",
    caseId: run?.caseId ?? manifest?.caseId ?? "invalid-case",
    policyId: policy?.id ?? run?.policyId ?? "invalid-policy",
    policyVersion: policy?.version ?? run?.policyVersion ?? "invalid-version",
    status: blocked ? "blocked" : "eligible",
    evidenceManifestHash: manifestHash,
    policyHash,
    triggeredHardFailures,
    metricChecks,
    issues: unique(issues)
  };
}

export async function createControlDecisionSeal(
  runValue: unknown,
  manifestValue: unknown,
  policyValue: unknown,
  sealedAt = new Date().toISOString()
): Promise<ControlDecisionSeal> {
  const evaluation = await evaluateControlRun(runValue, manifestValue, policyValue);
  const issues = [...evaluation.issues];
  if (!isIso(sealedAt)) issues.push("decision-seal:sealedAt-invalid");
  if (issues.length > 0) throw new Error(`Invalid control seal input: ${unique(issues).join(", ")}`);
  const run = runValue as ControlRunEvent;
  const manifest = manifestValue as ControlEvidenceManifest;
  const policy = policyValue as ControlPolicy;
  const unsigned = {
    schemaVersion: "boulder.control.decision-seal.v1" as const,
    algorithm: "sha256-canonical-json" as const,
    runId: run.runId,
    caseId: run.caseId,
    taskId: run.taskId,
    policyId: policy.id,
    policyVersion: policy.version,
    sealedAt,
    runHash: await hashControlValue(run),
    evidenceManifestHash: await hashControlValue(manifest),
    policyHash: await hashControlValue(policy)
  };
  return { ...unsigned, sealHash: await hashControlValue(unsigned) };
}

export async function verifyControlDecisionSeal(
  sealValue: unknown,
  runValue: unknown,
  manifestValue: unknown,
  policyValue: unknown
): Promise<SealVerification> {
  const evaluation = await evaluateControlRun(runValue, manifestValue, policyValue);
  const issues = [...validateControlDecisionSeal(sealValue), ...evaluation.issues];
  if (issues.length > 0 || !isControlDecisionSeal(sealValue) || !isControlRunEvent(runValue) || !isControlEvidenceManifest(manifestValue) || !isControlPolicy(policyValue)) {
    return { status: "invalid", issues: unique(issues) };
  }
  const seal = sealValue;
  const run = runValue;
  const manifest = manifestValue;
  const policy = policyValue;
  const runHash = await hashControlValue(run);
  const manifestHash = await hashControlValue(manifest);
  const policyHash = await hashControlValue(policy);
  if (seal.runId !== run.runId) issues.push("decision-seal:runId-mismatch");
  if (seal.caseId !== run.caseId || seal.caseId !== manifest.caseId) issues.push("decision-seal:caseId-mismatch");
  if (seal.taskId !== run.taskId) issues.push("decision-seal:taskId-mismatch");
  if (seal.policyId !== run.policyId || seal.policyId !== policy.id) issues.push("decision-seal:policyId-mismatch");
  if (seal.policyVersion !== run.policyVersion || seal.policyVersion !== policy.version) issues.push("decision-seal:policyVersion-mismatch");
  if (seal.runHash !== runHash) issues.push("decision-seal:run-hash-mismatch");
  if (seal.evidenceManifestHash !== manifestHash) issues.push("decision-seal:evidence-manifest-hash-mismatch");
  if (seal.policyHash !== policyHash) issues.push("decision-seal:policy-hash-mismatch");
  const unsigned = { ...seal } as Record<string, unknown>;
  delete unsigned.sealHash;
  if (seal.sealHash !== await hashControlValue(unsigned)) issues.push("decision-seal:seal-hash-mismatch");
  return { status: issues.length === 0 ? "valid" : "invalid", issues: unique(issues) };
}

export async function hashControlValue(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (record(value)) {
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) => value[key] === undefined ? [] : [[key, canonicalize(value[key])]]));
  }
  return value;
}

function triggeredFailures(run: ControlRunEvent, policy: ControlPolicy): readonly TriggeredHardFailure[] {
  const signals = new Set(run.hardFailureSignals);
  const blocking = new Set(policy.blockingSeverities);
  return policy.hardFailures.filter((rule) => signals.has(rule.signal)).map((rule) => ({ ...rule, blocked: blocking.has(rule.severity) }));
}

function evaluateMetrics(run: ControlRunEvent, policy: ControlPolicy): readonly MetricCheck[] {
  return policy.metricRules.map((rule) => {
    const actual = Object.prototype.hasOwnProperty.call(run.metrics, rule.metricId) ? run.metrics[rule.metricId] ?? null : null;
    const pass = actual !== null && (rule.operator === "gte" ? actual >= rule.threshold : rule.operator === "lte" ? actual <= rule.threshold : actual === rule.threshold);
    return { ...rule, actual, status: pass ? "pass" : "fail" };
  });
}

function isIso(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

function zeroHash(): string {
  return "0".repeat(64);
}
