import {
  V2_CRITIQUE_SCHEMA_VERSION,
  type V2Artifact,
  type V2Critique,
  type V2CritiqueFinding,
  type V2CritiqueVerdict,
  type V2Digest,
  type V2Evidence,
  type V2EvaluatorProvenance,
  type V2ExecutionResult,
  type V2Step,
} from "./contracts.js";
import { digestV2Critique, digestV2EvaluatorPolicy } from "./canonical.js";
import {
  V2_FIXTURE_CAPABILITY_ID,
  V2_FIXTURE_CAPABILITY_VERSION,
  V2_FIXTURE_EVIDENCE_KIND,
} from "./capability.js";
import { validateV2Artifact, validateV2Evidence, validateV2ExecutionResult } from "./validation.js";

export interface V2CritiqueEvaluationRequest {
  readonly result: V2ExecutionResult;
  readonly step: V2Step;
  readonly artifacts: readonly V2Artifact[];
  readonly evidence: readonly V2Evidence[];
}

export interface V2CritiqueEvaluator {
  readonly id: string;
  readonly version: string;
  readonly policyDigest: V2Digest;
  evaluate(request: V2CritiqueEvaluationRequest): Promise<V2Critique> | V2Critique;
}

export const V2_FIXTURE_EVALUATOR_ID = "fixture-evaluator";
export const V2_FIXTURE_EVALUATOR_VERSION = "1.0.0";
export const V2_FIXTURE_EVALUATOR_POLICY = {
  acceptedEvidenceKinds: [V2_FIXTURE_EVIDENCE_KIND],
  hardFindingSeverities: ["error"],
  policyRevision: "evaluator-policy-1",
} as const;

export async function createV2FixtureCritiqueEvaluator(): Promise<V2CritiqueEvaluator> {
  const policyDigest = await digestV2EvaluatorPolicy(V2_FIXTURE_EVALUATOR_POLICY);
  const evaluator: V2EvaluatorProvenance = {
    id: V2_FIXTURE_EVALUATOR_ID,
    version: V2_FIXTURE_EVALUATOR_VERSION,
    policyDigest,
  };
  return {
    ...evaluator,
    async evaluate(request): Promise<V2Critique> {
      const findings = await evaluateFixtureRequest(request);
      const verdict = verdictFor(findings);
      const critiqueWithoutDigest = {
        schemaVersion: V2_CRITIQUE_SCHEMA_VERSION,
        targetResultDigest: request.result.resultDigest,
        targetArtifactIds: request.result.artifactIds,
        targetArtifactDigests: request.result.artifactDigests,
        evidenceIds: request.result.evidenceIds,
        evidenceDigests: request.result.evidenceDigests,
        evaluator,
        verdict,
        findings,
      } as const;
      return {
        ...critiqueWithoutDigest,
        critiqueDigest: await digestV2Critique(critiqueWithoutDigest as V2Critique),
      };
    },
  };
}

async function evaluateFixtureRequest(request: V2CritiqueEvaluationRequest): Promise<readonly V2CritiqueFinding[]> {
  const findings: V2CritiqueFinding[] = [];
  const artifactsById = new Map(request.artifacts.map((artifact) => [artifact.id, artifact]));
  const evidenceById = new Map(request.evidence.map((evidence) => [evidence.id, evidence]));
  const [resultValidation, artifactValidations, evidenceValidations] = await Promise.all([
    validateV2ExecutionResult(request.result),
    Promise.all(request.artifacts.map((artifact) => validateV2Artifact(artifact))),
    Promise.all(request.evidence.map((evidence) => validateV2Evidence(evidence))),
  ]);
  if (!resultValidation.ok) addFinding(findings, "result-invalid", "error", "Execution result integrity is invalid.");
  for (let index = 0; index < artifactValidations.length; index += 1) {
    if (!artifactValidations[index].ok) addFinding(findings, `artifact-${index}-invalid`, "error", "Artifact integrity is invalid.");
  }
  for (let index = 0; index < evidenceValidations.length; index += 1) {
    if (!evidenceValidations[index].ok) addFinding(findings, `evidence-${index}-invalid`, "error", "Evidence integrity is invalid.");
  }
  if (artifactsById.size !== request.artifacts.length) addFinding(findings, "artifact-duplicates", "error", "Artifacts must have unique IDs.");
  if (evidenceById.size !== request.evidence.length) addFinding(findings, "evidence-duplicates", "error", "Evidence must have unique IDs.");
  if (request.result.status !== "succeeded") addFinding(findings, "result-blocked", "error", "A blocked execution result cannot pass critique.");
  for (const artifact of request.artifacts) {
    if (artifact.subjectPlanDigest !== request.result.planDigest
      || artifact.stepId !== request.step.id
      || artifact.inputDigest !== request.step.input.digest) {
      addFinding(findings, `artifact-${artifact.id}-binding-invalid`, "error", "Artifact does not bind the current execution.");
    }
  }
  if (!sameLinks(request.result.artifactIds, request.result.artifactDigests, request.artifacts, (artifact) => artifact.id, (artifact) => artifact.artifactDigest)) {
    addFinding(findings, "artifact-links-invalid", "error", "Result artifact links do not match generated artifacts.");
  }
  if (!sameLinks(request.result.evidenceIds, request.result.evidenceDigests, request.evidence, (evidence) => evidence.id, (evidence) => evidence.digest)) {
    addFinding(findings, "evidence-links-invalid", "error", "Result evidence links do not match generated evidence.");
  }

  const requiredKinds = new Set(request.step.requiredEvidenceKinds);
  const observedKinds = new Set<string>();
  for (const evidence of request.evidence) {
    const artifact = artifactsById.get(evidence.subjectArtifactId);
    if (!artifact || artifact.artifactDigest !== evidence.subjectArtifactDigest) {
      addFinding(findings, `${evidence.id}-subject-invalid`, "error", "Evidence does not bind a generated artifact.");
      continue;
    }
    observedKinds.add(evidence.kind);
    if (evidence.producer.id !== V2_FIXTURE_CAPABILITY_ID || evidence.producer.version !== V2_FIXTURE_CAPABILITY_VERSION) {
      addFinding(findings, `evidence-${evidence.id}-provenance-invalid`, "error", "Evidence producer provenance is invalid.");
    }
    if (!V2_FIXTURE_EVALUATOR_POLICY.acceptedEvidenceKinds.includes(evidence.kind as typeof V2_FIXTURE_EVIDENCE_KIND)) {
      addFinding(findings, `evidence-${evidence.id}-kind-unaccepted`, "error", "Evidence kind is not accepted by evaluator policy.");
    }
  }
  for (const kind of requiredKinds) {
    if (!observedKinds.has(kind)) addFinding(findings, `evidence-kind-${kind}-missing`, "error", "Required evidence kind is missing.");
  }
  for (const evidenceId of request.result.evidenceIds) {
    if (!evidenceById.has(evidenceId)) addFinding(findings, `evidence-${evidenceId}-missing`, "error", "Result names missing evidence.");
  }
  return findings;
}

function sameLinks<T>(
  ids: readonly string[],
  digests: readonly string[],
  values: readonly T[],
  getId: (value: T) => string,
  getDigest: (value: T) => string,
): boolean {
  return ids.length === values.length
    && digests.length === values.length
    && values.every((value, index) => ids[index] === getId(value) && digests[index] === getDigest(value));
}

function verdictFor(findings: readonly V2CritiqueFinding[]): V2CritiqueVerdict {
  if (findings.some((finding) => V2_FIXTURE_EVALUATOR_POLICY.hardFindingSeverities.includes(finding.severity as "error"))) return "reject";
  return findings.length === 0 ? "pass" : "revise";
}

function addFinding(findings: V2CritiqueFinding[], id: string, severity: V2CritiqueFinding["severity"], message: string): void {
  if (!findings.some((finding) => finding.id === id)) findings.push({ id, severity, message });
}
