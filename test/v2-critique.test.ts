import { describe, expect, test } from "bun:test";
import { digestV2, digestV2Artifact, digestV2ExecutionResult, digestV2Input } from "../src/v2/canonical.js";
import { createV2FixtureCapability } from "../src/v2/capability.js";
import { createV2FixtureCritiqueEvaluator } from "../src/v2/critique.js";
import { type V2Artifact, type V2ExecutionResult, type V2Step } from "../src/v2/contracts.js";

const now = "2026-07-20T00:04:59.999Z";

async function fixtureRequest(requiredEvidenceKinds: readonly string[]): Promise<{ result: V2ExecutionResult; step: V2Step; artifacts: Awaited<ReturnType<ReturnType<typeof createV2FixtureCapability>["execute"]>>["artifacts"]; evidence: Awaited<ReturnType<ReturnType<typeof createV2FixtureCapability>["execute"]>>["evidence"] }> {
  const input = { schemaId: "org.example.fixture-input.v1", value: { message: "proof" }, digest: await digestV2Input({ value: { message: "proof" } }) };
  const step: V2Step = {
    id: "step-1", dependsOn: [], capabilityBinding: { capabilityId: "fixture-uppercase", capabilityVersion: "1.0.0", invocationId: "invoke-1" }, input,
    declaredEffects: [{ schemaVersion: "boulder.v2.effect.v1", id: "effect-1", class: "none", inputDigest: input.digest, scope: { kind: "memory", resources: [], scopeDigest: await digestV2("boulder.v2.scope.v1", { kind: "memory", resources: [] }) } }],
    requiredEvidenceKinds,
  };
  const output = await createV2FixtureCapability().execute({ planDigest: await digestV2("boulder.v2.plan.v1", { fixture: true }), step, observedAt: now });
  const withoutDigest: Omit<V2ExecutionResult, "resultDigest"> = {
    schemaVersion: "boulder.v2.execution-result.v1",
    workflowId: "workflow-1",
    planDigest: await digestV2("boulder.v2.plan.v1", { fixture: true }),
    stepId: step.id,
    invocationId: step.capabilityBinding.invocationId,
    capability: { id: "fixture-uppercase", version: "1.0.0" },
    status: "succeeded" as const,
    artifactIds: output.artifacts.map((artifact) => artifact.id), artifactDigests: output.artifacts.map((artifact) => artifact.artifactDigest),
    evidenceIds: output.evidence.map((evidence) => evidence.id), evidenceDigests: output.evidence.map((evidence) => evidence.digest),
  };
  return { result: { ...withoutDigest, resultDigest: await digestV2ExecutionResult(withoutDigest) }, step, ...output };
}
async function rebindArtifact(
  artifact: V2Artifact,
  binding: Pick<V2Artifact, "subjectPlanDigest" | "stepId" | "inputDigest">,
): Promise<V2Artifact> {
  const { artifactDigest: ignored, ...withoutDigest } = artifact;
  void ignored;
  const value = { ...withoutDigest, ...binding };
  return { ...value, artifactDigest: await digestV2Artifact(value) };
}

describe("v2 fixture critique", () => {
  test("passes only when every result link, evidence subject, provenance, and required kind is present", async () => {
    const evaluator = await createV2FixtureCritiqueEvaluator();
    const request = await fixtureRequest(["fixture-transform"]);
    const critique = await evaluator.evaluate(request);
    expect(critique.verdict).toBe("pass");
    expect(critique.findings).toEqual([]);
  });

  test("rejects missing required evidence with a hard finding", async () => {
    const evaluator = await createV2FixtureCritiqueEvaluator();
    const request = await fixtureRequest(["required-proof"]);
    const critique = await evaluator.evaluate(request);
    expect(critique.verdict).toBe("reject");
    const finding = critique.findings.find((candidate) => candidate.id === "evidence-kind-required-proof-missing");
    expect(finding?.severity).toBe("error");
    expect(finding?.message).toBe("Required evidence kind is missing.");
  });

  test("rejects evidence whose artifact binding is not a generated artifact", async () => {
    const evaluator = await createV2FixtureCritiqueEvaluator();
    const request = await fixtureRequest(["fixture-transform"]);
    const evidence = { ...request.evidence[0], subjectArtifactDigest: request.result.planDigest };
    const critique = await evaluator.evaluate({ ...request, evidence: [evidence] });
    expect(critique.verdict).toBe("reject");
    const finding = critique.findings.find((candidate) => candidate.id === "evidence-1-subject-invalid");
    expect(finding?.severity).toBe("error");
  });
  test("rejects artifacts bound to another plan, step, or input", async () => {
    const evaluator = await createV2FixtureCritiqueEvaluator();
    for (const field of ["plan", "step", "input"] as const) {
      const request = await fixtureRequest(["fixture-transform"]);
      const artifact = await rebindArtifact(request.artifacts[0], {
        subjectPlanDigest: field === "plan" ? request.step.input.digest : request.result.planDigest,
        stepId: field === "step" ? "step-2" : request.step.id,
        inputDigest: field === "input" ? request.result.planDigest : request.step.input.digest,
      });
      const critique = await evaluator.evaluate({ ...request, artifacts: [artifact] });
      expect(critique.verdict).toBe("reject");
      expect(critique.findings.some((finding) => finding.id === "artifact-artifact-1-binding-invalid"
        && finding.severity === "error"
        && finding.message === "Artifact does not bind the current execution.")).toBe(true);
    }
  });
});
