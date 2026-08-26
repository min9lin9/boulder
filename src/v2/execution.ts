import {
  V2_EXECUTION_RESULT_SCHEMA_VERSION,
  type V2Artifact,
  isV2Rfc3339Millis,
  type V2AuthorityVerifier,
  type V2Critique,
  type V2Evidence,
  type V2ExecutionEnvelope,
  type V2ExecutionFailure,
  type V2ExecutionResult,
} from "./contracts.js";
import { digestV2ExecutionResult } from "./canonical.js";
import {
  V2_FIXTURE_CAPABILITY_ID,
  V2_FIXTURE_CAPABILITY_VERSION,
  type V2CapabilityExecutionOutput,
  type V2CapabilityRegistry,
} from "./capability.js";
import { type V2CritiqueEvaluator } from "./critique.js";
import { gateV2StepEffects, type V2EffectGateDecision } from "./effect-gate.js";
import { type V2LifecycleState } from "./lifecycle.js";
import { validateV2Artifact, validateV2Critique, validateV2Evidence, validateV2ExecutionEnvelope, validateV2ExecutionResult, type V2ValidationIssue } from "./validation.js";

export interface V2ExecutionDependencies {
  readonly capabilityRegistry: V2CapabilityRegistry;
  readonly critiqueEvaluator: V2CritiqueEvaluator;
  readonly authorityVerifier?: V2AuthorityVerifier;
  /** Injected UTC RFC3339 time used for authority freshness and evidence provenance. */
  readonly now: string;
}

export type V2ExecutionOutcome =
  | {
    readonly status: "succeeded";
    readonly lifecycle: "critiqued";
    readonly gate: V2EffectGateDecision;
    readonly result: V2ExecutionResult;
    readonly critique: V2Critique;
    readonly artifacts: readonly V2Artifact[];
    readonly evidence: readonly V2Evidence[];
  }
  | {
    readonly status: "blocked";
    readonly lifecycle: V2LifecycleState;
    readonly issues?: readonly V2ValidationIssue[];
    readonly gate?: V2EffectGateDecision;
    readonly result?: V2ExecutionResult;
    readonly critique?: V2Critique;
    readonly failure: V2ExecutionFailure;
  };

export async function executeV2Envelope(value: unknown, dependencies: V2ExecutionDependencies): Promise<V2ExecutionOutcome> {
  const validated = await validateV2ExecutionEnvelope(value);
  if (!validated.ok) {
    return blocked("received", { code: "v2.plan.invalid", message: "Execution envelope is invalid." }, { issues: validated.issues });
  }
  const envelope = validated.value;
  if (envelope.plan.steps.length !== 1) {
    return blocked("plan-validated", { code: "v2.execution.step_count_unsupported", message: "K1 supports exactly one step." });
  }
  if (!isV2Rfc3339Millis(dependencies.now)) {
    return blocked("plan-validated", { code: "v2.execution.time_invalid", message: "Injected execution time is invalid." });
  }
  const step = envelope.plan.steps[0];
  const gate = await gateV2StepEffects(
    envelope.plan,
    step,
    envelope.authorityEvents,
    dependencies.authorityVerifier,
    dependencies.now,
  );
  if (gate.status !== "allowed-no-authority") {
    return blocked("effect-gated", {
      code: gate.reasonCode,
      message: gate.reasonCode === "v2.effect.unsupported"
        ? "Effect is not supported by K1."
        : "Effect authority is not allowed.",
    }, { gate });
  }

  if (step.capabilityBinding.capabilityId !== V2_FIXTURE_CAPABILITY_ID
    || step.capabilityBinding.capabilityVersion !== V2_FIXTURE_CAPABILITY_VERSION) {
    return blocked("executing", { code: "v2.capability.unsupported", message: "Capability binding is not supported." });
  }
  let capability: ReturnType<V2CapabilityRegistry["resolve"]>;
  try {
    capability = dependencies.capabilityRegistry.resolve(step.capabilityBinding);
  } catch {
    return blocked("executing", { code: "v2.capability.execution_failed", message: "Capability execution failed." });
  }
  if (!capability) return blocked("executing", { code: "v2.capability.unsupported", message: "Capability binding is not supported." });
  if (capability.id !== step.capabilityBinding.capabilityId || capability.version !== step.capabilityBinding.capabilityVersion) {
    return blocked("executing", { code: "v2.capability.binding_mismatch", message: "Capability does not match the requested binding." });
  }

  let output: V2CapabilityExecutionOutput;
  try {
    output = await capability.execute({ planDigest: envelope.plan.planDigest, step, observedAt: dependencies.now });
  } catch {
    return blocked("executing", { code: "v2.capability.execution_failed", message: "Capability execution failed." });
  }
  if (!output
    || !Array.isArray(output.artifacts)
    || !Array.isArray(output.evidence)
    || !hasOwnEntries(output.artifacts)
    || !hasOwnEntries(output.evidence)) {
    return blocked("executing", { code: "v2.capability.output_invalid", message: "Capability produced invalid output." });
  }
  const producedArtifacts = await Promise.all(output.artifacts.map((artifact) => validateV2Artifact(artifact)));
  const producedEvidence = await Promise.all(output.evidence.map((evidence) => validateV2Evidence(evidence)));
  if (producedArtifacts.some((result) => !result.ok)
    || producedEvidence.some((result) => !result.ok)
    || !uniqueIds(output.artifacts)
    || !uniqueIds(output.evidence)
    || output.artifacts.some((artifact) => artifact.subjectPlanDigest !== envelope.plan.planDigest
      || artifact.stepId !== step.id
      || artifact.inputDigest !== step.input.digest)
    || output.evidence.some((item) => !output.artifacts.some((artifact) => artifact.id === item.subjectArtifactId
      && artifact.artifactDigest === item.subjectArtifactDigest))
    || !step.requiredEvidenceKinds.every((kind) => output.evidence.some((item) => item.kind === kind))) {
    return blocked("executing", { code: "v2.capability.output_invalid", message: "Capability produced invalid output." });
  }

  const artifacts = output.artifacts;
  const evidence = output.evidence;
  const result = await successfulResult(envelope, artifacts, evidence);
  const resultValidation = await validateV2ExecutionResult(result);
  if (!resultValidation.ok) {
    return blocked("executing", { code: "v2.result.invalid", message: "Generated execution result is invalid." });
  }

  let critique: V2Critique;
  try {
    critique = await dependencies.critiqueEvaluator.evaluate({ result, step, artifacts, evidence });
  } catch {
    return blocked("result-produced", { code: "v2.critique.execution_failed", message: "Critique evaluation failed." }, { result });
  }
  const critiqueValidation = await validateV2Critique(critique);
  if (!critiqueValidation.ok) {
    return blocked("result-produced", { code: "v2.critique.invalid", message: "Critique output is invalid." }, { result });
  }
  critique = critiqueValidation.value;
  if (critique.evaluator.id !== dependencies.critiqueEvaluator.id
    || critique.evaluator.version !== dependencies.critiqueEvaluator.version
    || critique.evaluator.policyDigest !== dependencies.critiqueEvaluator.policyDigest) {
    return blocked("result-produced", { code: "v2.critique.provenance_mismatch", message: "Critique evaluator provenance is invalid." }, { result });
  }
  if (!matchesCritiqueTarget(critique, result)) {
    return blocked("result-produced", { code: "v2.critique.target_mismatch", message: "Critique targets do not match execution output." }, { result });
  }
  const critiqueFailure = critiqueFailureFor(critique);
  if (critiqueFailure) {
    return blocked("result-produced", critiqueFailure, { result, critique });
  }
  return { status: "succeeded", lifecycle: "critiqued", gate, result, critique, artifacts, evidence };
}

export const executeV2ExecutionEnvelope = executeV2Envelope;

async function successfulResult(
  envelope: V2ExecutionEnvelope,
  artifacts: readonly V2Artifact[],
  evidence: readonly V2Evidence[],
): Promise<V2ExecutionResult> {
  const resultWithoutDigest: Omit<V2ExecutionResult, "resultDigest"> = {
    schemaVersion: V2_EXECUTION_RESULT_SCHEMA_VERSION,
    workflowId: envelope.plan.workflowId,
    planDigest: envelope.plan.planDigest,
    stepId: envelope.requestedStepId,
    invocationId: envelope.plan.steps[0].capabilityBinding.invocationId,
    capability: {
      id: envelope.plan.steps[0].capabilityBinding.capabilityId,
      version: envelope.plan.steps[0].capabilityBinding.capabilityVersion,
    },
    status: "succeeded",
    artifactIds: artifacts.map((artifact) => artifact.id),
    artifactDigests: artifacts.map((artifact) => artifact.artifactDigest),
    evidenceIds: evidence.map((item) => item.id),
    evidenceDigests: evidence.map((item) => item.digest),
  };
  return { ...resultWithoutDigest, resultDigest: await digestV2ExecutionResult(resultWithoutDigest) };
}

function uniqueIds(values: readonly { readonly id: string }[]): boolean {
  return new Set(values.map((value) => value.id)).size === values.length;
}
function hasOwnEntries(values: readonly unknown[]): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (!Object.hasOwn(values, index)) return false;
  }
  return true;
}

function matchesCritiqueTarget(critique: V2Critique, result: V2ExecutionResult): boolean {
  return critique.targetResultDigest === result.resultDigest
    && linkedValuesMatch(critique.targetArtifactIds, critique.targetArtifactDigests, result.artifactIds, result.artifactDigests)
    && linkedValuesMatch(critique.evidenceIds, critique.evidenceDigests, result.evidenceIds, result.evidenceDigests);
}

function linkedValuesMatch(
  ids: readonly string[],
  digests: readonly string[],
  expectedIds: readonly string[],
  expectedDigests: readonly string[],
): boolean {
  return ids.length === expectedIds.length
    && digests.length === expectedDigests.length
    && ids.every((id, index) => id === expectedIds[index] && digests[index] === expectedDigests[index]);
}

function critiqueFailureFor(critique: V2Critique): V2ExecutionFailure | undefined {
  if (critique.verdict === "revise") {
    return { code: "v2.critique.revise", message: "Critique requires revision." };
  }
  if (critique.verdict === "human-review") {
    return { code: "v2.critique.human-review", message: "Critique requires human review." };
  }
  if (critique.verdict === "reject") {
    return { code: "v2.critique.rejected", message: "Critique rejected execution output." };
  }
  if (critique.findings.some((finding) => finding.severity === "error")) {
    return { code: "v2.critique.findings_error", message: "Critique contains error findings." };
  }
  return undefined;
}

function blocked(
  lifecycle: V2LifecycleState,
  failure: V2ExecutionFailure,
  extra: Omit<Extract<V2ExecutionOutcome, { readonly status: "blocked" }>, "status" | "lifecycle" | "failure"> = {},
): V2ExecutionOutcome {
  return { status: "blocked", lifecycle, failure, ...extra };
}
