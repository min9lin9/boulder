import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { digestV2Artifact, digestV2Critique, digestV2Evidence } from "../src/v2/canonical.js";
import { createV2FixtureCapability, createV2FixtureCapabilityRegistry, V2_FIXTURE_ARTIFACT_KIND, V2_FIXTURE_EVIDENCE_KIND, V2_FIXTURE_SUMMARY_SCHEMA_ID } from "../src/v2/capability.js";
import { createV2FixtureCritiqueEvaluator } from "../src/v2/critique.js";
import { type V2Artifact, type V2Critique, type V2Evidence, type V2ExecutionEnvelope } from "../src/v2/contracts.js";
import { executeV2Envelope } from "../src/v2/execution.js";
import { createV2InMemoryAuthorityVerifier } from "../src/v2/effect-gate.js";

const now = "2026-07-20T00:04:59.999Z";
const authorityPublicKey = "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo";

async function noneEnvelope(): Promise<V2ExecutionEnvelope> {
  return JSON.parse(await readFile(join(import.meta.dir, "../fixtures/v2-kernel/valid-none-effect-execution.json"), "utf8")) as V2ExecutionEnvelope;
}
function expectBlockedWithoutOutputs(
  outcome: Awaited<ReturnType<typeof executeV2Envelope>>,
  code: string,
  lifecycle?: "executing",
): void {
  expect(outcome.status).toBe("blocked");
  if (outcome.status !== "blocked") throw new Error("execution must be blocked");
  expect(outcome.failure.code).toBe(code);
  if (lifecycle) {
    expect(outcome.lifecycle).toBe(lifecycle);
    expect("result" in outcome).toBe(false);
  }
  expect("artifacts" in outcome).toBe(false);
  expect("evidence" in outcome).toBe(false);
  expect("critique" in outcome).toBe(false);
}
function expectCritiqueBlockedWithRetainedResult(
  outcome: Awaited<ReturnType<typeof executeV2Envelope>>,
  code: string,
): void {
  expect(outcome.status).toBe("blocked");
  if (outcome.status !== "blocked") throw new Error("critique must block execution");
  expect(outcome.lifecycle).toBe("result-produced");
  expect(outcome.failure.code).toBe(code);
  expect("result" in outcome).toBe(true);
  expect(outcome.result?.status).toBe("succeeded");
  expect("artifacts" in outcome).toBe(false);
  expect("evidence" in outcome).toBe(false);
  expect("critique" in outcome).toBe(false);
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

async function rebindEvidence(
  evidence: V2Evidence,
  binding: Pick<V2Evidence, "subjectArtifactId" | "subjectArtifactDigest">,
): Promise<V2Evidence> {
  const { digest: ignored, ...withoutDigest } = evidence;
  void ignored;
  const value = { ...withoutDigest, ...binding };
  return { ...value, digest: await digestV2Evidence(value) };
}

async function rehashCritique(critique: V2Critique): Promise<V2Critique> {
  const { critiqueDigest: ignored, ...withoutDigest } = critique;
  void ignored;
  return { ...withoutDigest, critiqueDigest: await digestV2Critique(withoutDigest as V2Critique) };
}

describe("v2 execution", () => {
  test("executes none effects deterministically and retains exact Artifact, Evidence, Result, and Critique links", async () => {
    const evaluator = await createV2FixtureCritiqueEvaluator();
    const outcome = await executeV2Envelope(await noneEnvelope(), { capabilityRegistry: createV2FixtureCapabilityRegistry(), critiqueEvaluator: evaluator, now });
    expect(outcome.status).toBe("succeeded");
    if (outcome.status !== "succeeded") throw new Error("none effect must execute");
    expect(outcome.lifecycle).toBe("critiqued");
    expect(outcome.gate).toEqual({ status: "allowed-no-authority" });
    expect(outcome.artifacts).toHaveLength(1);
    expect(outcome.evidence).toHaveLength(1);
    const artifact = outcome.artifacts[0];
    const evidence = outcome.evidence[0];
    expect(artifact.id).toBe("artifact-1");
    expect(artifact.kind).toBe(V2_FIXTURE_ARTIFACT_KIND);
    expect(artifact.schemaId).toBe(V2_FIXTURE_SUMMARY_SCHEMA_ID);
    expect(artifact.content).toEqual({ canonicalMessage: "BOULDER", length: 7 });
    expect(evidence.id).toBe("evidence-1");
    expect(evidence.kind).toBe(V2_FIXTURE_EVIDENCE_KIND);
    expect(evidence.subjectArtifactId).toBe(artifact.id);
    expect(evidence.subjectArtifactDigest).toBe(artifact.artifactDigest);
    expect(evidence.observedAt).toBe(now);
    expect(evidence.payload).toEqual({ output: "BOULDER" });
    expect(outcome.result.status).toBe("succeeded");
    expect(outcome.result.artifactIds).toEqual([artifact.id]);
    expect(outcome.result.artifactDigests).toEqual([artifact.artifactDigest]);
    expect(outcome.result.evidenceIds).toEqual([evidence.id]);
    expect(outcome.result.evidenceDigests).toEqual([evidence.digest]);
    expect(outcome.critique.verdict).toBe("pass");
    expect(outcome.critique.targetResultDigest).toBe(outcome.result.resultDigest);
    expect(outcome.critique.targetArtifactIds).toEqual([artifact.id]);
    expect(outcome.critique.targetArtifactDigests).toEqual([artifact.artifactDigest]);
    expect(outcome.critique.evidenceIds).toEqual([evidence.id]);
    expect(outcome.critique.evidenceDigests).toEqual([evidence.digest]);
  });

  test("ends verified non-none effects as unsupported without resolving or invoking a capability or emitting outputs", async () => {
    const fixture = JSON.parse(await readFile(join(import.meta.dir, "../fixtures/v2-kernel/valid-ed25519-authority-unsupported-effect.json"), "utf8"));
    let resolves = 0;
    let invocations = 0;
    const capability = createV2FixtureCapability();
    const registry = {
      resolve() {
        resolves += 1;
        return { ...capability, async execute(request: Parameters<typeof capability.execute>[0]) { invocations += 1; return capability.execute(request); } };
      },
    };
    const event = fixture.envelope.authorityEvents[0];
    const authorityVerifier = createV2InMemoryAuthorityVerifier({
      available: true,
      policyRevision: fixture.envelope.plan.policySnapshot.policyRevision,
      keys: [{ issuer: event.issuer, keyId: event.keyId, status: "active", publicKey: authorityPublicKey }],
      consumedNonces: new Set(),
    });
    let evaluations = 0;
    const evaluator = await createV2FixtureCritiqueEvaluator();
    const critiqueEvaluator = {
      ...evaluator,
      async evaluate(request: Parameters<typeof evaluator.evaluate>[0]) {
        evaluations += 1;
        return evaluator.evaluate(request);
      },
    };
    const outcome = await executeV2Envelope(fixture.envelope, { capabilityRegistry: registry, critiqueEvaluator, now: fixture.clock, authorityVerifier });
    expect(outcome.status).toBe("blocked");
    if (outcome.status !== "blocked") throw new Error("non-none effect must block");
    expect(outcome.lifecycle).toBe("effect-gated");
    expect(outcome.failure.code).toBe("v2.effect.unsupported");
    expect("result" in outcome).toBe(false);
    expect("artifacts" in outcome).toBe(false);
    expect("evidence" in outcome).toBe(false);
    expect("critique" in outcome).toBe(false);
    expect(resolves).toBe(0);
    expect(invocations).toBe(0);
    expect(evaluations).toBe(0);
  });
  test("rejects artifacts bound to another plan, step, or input before emitting outputs", async () => {
    for (const field of ["plan", "step", "input"] as const) {
      const capability = createV2FixtureCapability();
      const registry = {
        resolve() {
          return {
            ...capability,
            async execute(request: Parameters<typeof capability.execute>[0]) {
              const output = await capability.execute(request);
              return {
                ...output,
                artifacts: [await rebindArtifact(output.artifacts[0], {
                  subjectPlanDigest: field === "plan" ? request.step.input.digest : request.planDigest,
                  stepId: field === "step" ? "step-2" : request.step.id,
                  inputDigest: field === "input" ? request.planDigest : request.step.input.digest,
                })],
              };
            },
          };
        },
      };
      expectBlockedWithoutOutputs(
        await executeV2Envelope(await noneEnvelope(), { capabilityRegistry: registry, critiqueEvaluator: await createV2FixtureCritiqueEvaluator(), now }),
        "v2.capability.output_invalid",
        "executing",
      );
    }
  });

  test("rejects dangling and substituted evidence before emitting outputs", async () => {
    for (const subject of ["dangling", "substituted"] as const) {
      const capability = createV2FixtureCapability();
      const registry = {
        resolve() {
          return {
            ...capability,
            async execute(request: Parameters<typeof capability.execute>[0]) {
              const output = await capability.execute(request);
              return {
                ...output,
                evidence: [await rebindEvidence(output.evidence[0], {
                  subjectArtifactId: subject === "dangling" ? "artifact-2" : output.artifacts[0].id,
                  subjectArtifactDigest: subject === "substituted" ? request.planDigest : output.artifacts[0].artifactDigest,
                })],
              };
            },
          };
        },
      };
      expectBlockedWithoutOutputs(
        await executeV2Envelope(await noneEnvelope(), { capabilityRegistry: registry, critiqueEvaluator: await createV2FixtureCritiqueEvaluator(), now }),
        "v2.capability.output_invalid",
        "executing",
      );
    }
  });

  test("rejects missing required evidence, malformed capability output, and capability throws without partial outputs", async () => {
    const evaluator = await createV2FixtureCritiqueEvaluator();
    const capability = createV2FixtureCapability();
    const missingEvidence = {
      resolve() {
        return {
          ...capability,
          async execute(request: Parameters<typeof capability.execute>[0]) {
            const output = await capability.execute(request);
            return { ...output, evidence: [] };
          },
        };
      },
    };
    expectBlockedWithoutOutputs(
      await executeV2Envelope(await noneEnvelope(), { capabilityRegistry: missingEvidence, critiqueEvaluator: evaluator, now }),
      "v2.capability.output_invalid",
      "executing",
    );

    const malformedOutput = {
      resolve() {
        return {
          ...capability,
          async execute(request: Parameters<typeof capability.execute>[0]) {
            const output = await capability.execute(request);
            return { ...output, artifacts: [{ ...output.artifacts[0], id: "" }] };
          },
        };
      },
    };
    expectBlockedWithoutOutputs(
      await executeV2Envelope(await noneEnvelope(), { capabilityRegistry: malformedOutput, critiqueEvaluator: evaluator, now }),
      "v2.capability.output_invalid",
      "executing",
    );

    const throwingCapability = {
      resolve() {
        return { ...capability, execute() { throw new Error("capability failure"); } };
      },
    };
    expectBlockedWithoutOutputs(
      await executeV2Envelope(await noneEnvelope(), { capabilityRegistry: throwingCapability, critiqueEvaluator: evaluator, now }),
      "v2.capability.execution_failed",
      "executing",
    );
  });

  test("reports registry misses and returned version mismatches without partial outputs", async () => {
    const evaluator = await createV2FixtureCritiqueEvaluator();
    expectBlockedWithoutOutputs(
      await executeV2Envelope(await noneEnvelope(), { capabilityRegistry: { resolve() { return undefined; } }, critiqueEvaluator: evaluator, now }),
      "v2.capability.unsupported",
      "executing",
    );

    const capability = createV2FixtureCapability();
    expectBlockedWithoutOutputs(
      await executeV2Envelope(await noneEnvelope(), {
        capabilityRegistry: { resolve() { return { ...capability, version: "2.0.0" }; } },
        critiqueEvaluator: evaluator,
        now,
      }),
      "v2.capability.binding_mismatch",
      "executing",
    );
  });

  test("rejects unrelated and reordered critiques without partial outputs", async () => {
    const evaluator = await createV2FixtureCritiqueEvaluator();
    const unrelatedEvaluator = {
      ...evaluator,
      async evaluate(request: Parameters<typeof evaluator.evaluate>[0]) {
        return rehashCritique({ ...(await evaluator.evaluate(request)), targetResultDigest: request.result.planDigest });
      },
    };
    expectBlockedWithoutOutputs(
      await executeV2Envelope(await noneEnvelope(), { capabilityRegistry: createV2FixtureCapabilityRegistry(), critiqueEvaluator: unrelatedEvaluator, now }),
      "v2.critique.target_mismatch",
    );

    const capability = createV2FixtureCapability();
    const twoArtifactRegistry = {
      resolve() {
        return {
          ...capability,
          async execute(request: Parameters<typeof capability.execute>[0]) {
            const output = await capability.execute(request);
            const { artifactDigest: firstArtifactDigest, ...secondArtifactWithoutDigest } = output.artifacts[0];
            void firstArtifactDigest;
            const secondArtifactValue = { ...secondArtifactWithoutDigest, id: "artifact-2" };
            const secondArtifact = { ...secondArtifactValue, artifactDigest: await digestV2Artifact(secondArtifactValue) };
            const { digest: firstEvidenceDigest, ...secondEvidenceWithoutDigest } = output.evidence[0];
            void firstEvidenceDigest;
            const secondEvidenceValue = {
              ...secondEvidenceWithoutDigest,
              id: "evidence-2",
              subjectArtifactId: secondArtifact.id,
              subjectArtifactDigest: secondArtifact.artifactDigest,
            };
            const secondEvidence = { ...secondEvidenceValue, digest: await digestV2Evidence(secondEvidenceValue) };
            return { artifacts: [...output.artifacts, secondArtifact], evidence: [...output.evidence, secondEvidence] };
          },
        };
      },
    };
    const reorderedEvaluator = {
      ...evaluator,
      async evaluate(request: Parameters<typeof evaluator.evaluate>[0]) {
        const critique = await evaluator.evaluate(request);
        return rehashCritique({
          ...critique,
          targetArtifactIds: [...critique.targetArtifactIds].reverse(),
          targetArtifactDigests: [...critique.targetArtifactDigests].reverse(),
          evidenceIds: [...critique.evidenceIds].reverse(),
          evidenceDigests: [...critique.evidenceDigests].reverse(),
        });
      },
    };
    expectBlockedWithoutOutputs(
      await executeV2Envelope(await noneEnvelope(), { capabilityRegistry: twoArtifactRegistry, critiqueEvaluator: reorderedEvaluator, now }),
      "v2.critique.target_mismatch",
    );
  });
  test("rejects malformed critiques after retaining the result without emitting outputs", async () => {
    const evaluator = await createV2FixtureCritiqueEvaluator();
    const malformedEvaluator = {
      ...evaluator,
      async evaluate(request: Parameters<typeof evaluator.evaluate>[0]) {
        const critique = await evaluator.evaluate(request);
        return { ...critique, critiqueDigest: "sha256:malformed" as V2Critique["critiqueDigest"] };
      },
    };
    expectCritiqueBlockedWithRetainedResult(
      await executeV2Envelope(await noneEnvelope(), {
        capabilityRegistry: createV2FixtureCapabilityRegistry(),
        critiqueEvaluator: malformedEvaluator,
        now,
      }),
      "v2.critique.invalid",
    );
  });

  test("rejects canonically rehashed critiques with mismatched evaluator provenance", async () => {
    const evaluator = await createV2FixtureCritiqueEvaluator();
    const cases: readonly {
      readonly field: "id" | "version" | "policyDigest";
      readonly mutate: (provenance: V2Critique["evaluator"]) => V2Critique["evaluator"];
    }[] = [
      { field: "id", mutate: (provenance) => ({ ...provenance, id: "other-evaluator" }) },
      { field: "version", mutate: (provenance) => ({ ...provenance, version: "2.0.0" }) },
      { field: "policyDigest", mutate: (provenance) => ({ ...provenance, policyDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000" }) },
    ];

    for (const candidate of cases) {
      const mismatchedEvaluator = {
        ...evaluator,
        async evaluate(request: Parameters<typeof evaluator.evaluate>[0]) {
          const critique = await evaluator.evaluate(request);
          return rehashCritique({ ...critique, evaluator: candidate.mutate(critique.evaluator) });
        },
      };
      expectCritiqueBlockedWithRetainedResult(
        await executeV2Envelope(await noneEnvelope(), {
          capabilityRegistry: createV2FixtureCapabilityRegistry(),
          critiqueEvaluator: mismatchedEvaluator,
          now,
        }),
        "v2.critique.provenance_mismatch",
      );
    }
  });

  test("blocks every non-semantic critique verdict and retains validated diagnostics", async () => {
    const evaluator = await createV2FixtureCritiqueEvaluator();
    const cases: readonly {
      readonly verdict: V2Critique["verdict"];
      readonly findings?: V2Critique["findings"];
      readonly code: string;
    }[] = [
      { verdict: "revise", code: "v2.critique.revise" },
      { verdict: "human-review", code: "v2.critique.human-review" },
      { verdict: "reject", code: "v2.critique.rejected" },
      {
        verdict: "pass",
        findings: [{ id: "hard-finding", severity: "error", message: "A hard finding remains." }],
        code: "v2.critique.findings_error",
      },
    ];

    for (const candidate of cases) {
      const blockingEvaluator = {
        ...evaluator,
        async evaluate(request: Parameters<typeof evaluator.evaluate>[0]) {
          const critique = await evaluator.evaluate(request);
          return rehashCritique({
            ...critique,
            verdict: candidate.verdict,
            findings: candidate.findings ?? critique.findings,
          });
        },
      };
      const outcome = await executeV2Envelope(await noneEnvelope(), {
        capabilityRegistry: createV2FixtureCapabilityRegistry(),
        critiqueEvaluator: blockingEvaluator,
        now,
      });

      expect(outcome.status).toBe("blocked");
      if (outcome.status !== "blocked") throw new Error("non-semantic critique must block");
      expect(outcome.lifecycle).toBe("result-produced");
      expect(outcome.failure.code).toBe(candidate.code);
      expect(outcome.result?.status).toBe("succeeded");
      expect(outcome.critique?.verdict).toBe(candidate.verdict);
      expect("artifacts" in outcome).toBe(false);
      expect("evidence" in outcome).toBe(false);
    }
  });

  test("blocks throwing critiques without partial outputs", async () => {
    const evaluator = await createV2FixtureCritiqueEvaluator();
    const throwingEvaluator = {
      ...evaluator,
      evaluate() { throw new Error("critique failure"); },
    };
    expectBlockedWithoutOutputs(
      await executeV2Envelope(await noneEnvelope(), { capabilityRegistry: createV2FixtureCapabilityRegistry(), critiqueEvaluator: throwingEvaluator, now }),
      "v2.critique.execution_failed",
    );
  });
});
