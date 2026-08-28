import { describe, expect, test } from "bun:test";
import { canonicalizeV2, digestV2, digestV2Input, digestV2Plan, sha256V2 } from "../src/v2/canonical.js";
import { V2_EFFECT_CLASSES, type V2Plan } from "../src/v2/contracts.js";
import { validateV2Plan } from "../src/v2/validation.js";

const digest = "sha256:0000000000000000000000000000000000000000000000000000000000000000" as const;

async function plan(extensions: Record<string, string> = {}): Promise<V2Plan> {
  const input = { schemaId: "org.example.input.v1", value: { message: "hello" }, digest: await digestV2Input({ value: { message: "hello" } }) };
  const scope = { kind: "memory", resources: [], scopeDigest: await digestV2("boulder.v2.scope.v1", { kind: "memory", resources: [] }) };
  const value = {
    schemaVersion: "boulder.v2.plan.v1",
    workflowId: "workflow-1",
    planRevision: 1,
    intent: { id: "intent-1", objective: "verify v2", acceptance: ["passes"] },
    policySnapshot: { policyRevision: "policy-1", digest: await digestV2("boulder.v2.policy.v1", { policyRevision: "policy-1" }) },
    steps: [{ id: "step-1", dependsOn: [], capabilityBinding: { capabilityId: "fixture-uppercase", capabilityVersion: "1.0.0", invocationId: "invoke-1" }, input, declaredEffects: [{ schemaVersion: "boulder.v2.effect.v1", id: "effect-1", class: "none", scope, inputDigest: input.digest }], requiredEvidenceKinds: ["fixture-transform"] }],
    extensions,
  } as const satisfies Omit<V2Plan, "planDigest">;
  const planDigest = await digestV2Plan({ ...value, planDigest: digest } satisfies V2Plan);
  return { ...value, planDigest } satisfies V2Plan;
}

describe("v2 canonical contracts", () => {
  test("uses JCS key order and hashes the exact domain-LF-canonical preimage", async () => {
    const projection = { z: [true, null], a: { b: "value" } } as const;
    expect(canonicalizeV2(projection)).toBe('{"a":{"b":"value"},"z":[true,null]}');
    expect(await digestV2("boulder.v2.test.v1", projection)).toBe(
      await sha256V2('boulder.v2.test.v1\n{"a":{"b":"value"},"z":[true,null]}'),
    );
    let errorMessage = "";
    try {
      canonicalizeV2({ value: "\ud800" });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    expect(errorMessage).toContain("lone surrogate");
  });

  test("defines all ten effect classes and enforces none's empty scope", async () => {
    expect(V2_EFFECT_CLASSES).toEqual(["none", "local-read", "local-write", "remote-read", "remote-write", "communicate", "financial", "identity", "signing", "destructive"]);
    const value = await plan();
    const invalid = {
      ...value,
      steps: value.steps.map((step) => ({
        ...step,
        declaredEffects: step.declaredEffects.map((effect) => ({
          ...effect,
          scope: { ...effect.scope, resources: ["forbidden"] },
        })),
      })),
    };
    const result = await validateV2Plan(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.id === "v2.effect.none_scope")).toBe(true);
  });

  test("returns validation failures in stable path then id order", async () => {
    const value = await plan();
    const invalid = { ...value, workflowId: "INVALID", planDigest: digest };
    const result = await validateV2Plan(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => `${issue.path}:${issue.id}`)).toEqual([
        "$.planDigest:v2.digest.mismatch",
        "$.workflowId:v2.id.invalid",
      ]);
    }
  });

  test("accepts reverse-domain extensions and rejects unnamespaced and reserved extension keys", async () => {
    expect((await validateV2Plan(await plan({ "io.boulder.partner.audit.v1": "accepted" }))).ok).toBe(true);
    for (const key of ["audit", "boulder.v2"]) {
      const result = await validateV2Plan(await plan({ [key]: "rejected" }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues.some((issue) => issue.id === "v2.extensions.key_invalid" && issue.path === `$.extensions.${key}`)).toBe(true);
    }
  });
});
