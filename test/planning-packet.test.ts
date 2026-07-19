import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { canonicalizePlanningValue, planningDigest } from "../src/planning-canonical";
import { validatePlanningPacket } from "../src/planning-packet";

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(import.meta.dir, "..", "fixtures", "planning-packets", `${name}.json`), "utf8"));
}
async function validPacket(): Promise<Record<string, unknown>> {
  return structuredClone(await fixture("valid")) as Record<string, unknown>;
}

describe("planning packet v1", () => {
  test("accepts the valid fixture", async () => {
    const result = validatePlanningPacket(await fixture("valid"));
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test("reports stable targeted errors for the invalid fixture", async () => {
    const result = validatePlanningPacket(await fixture("invalid"));
    expect(result.valid).toBe(false);
    expect(result.issues.map((entry) => entry.id)).toContain("plan.schema.unsupported");
    expect(result.issues.map((entry) => entry.id)).toContain("plan.run_id.invalid");
    expect(result.issues.map((entry) => entry.id)).toContain("plan.scope.protected_conflict");
  });

  test("canonical digest ignores object order and whitespace but preserves array order", () => {
    const first = { items: ["first", "second"], nested: { b: 2, a: 1 } };
    const reorderedKeys = { nested: { a: 1, b: 2 }, items: ["first", "second"] };
    const reorderedArray = { nested: { a: 1, b: 2 }, items: ["second", "first"] };
    expect(canonicalizePlanningValue(first)).toBe(canonicalizePlanningValue(reorderedKeys));
    expect(planningDigest(first)).toBe(planningDigest(reorderedKeys));
    expect(planningDigest(first)).not.toBe(planningDigest(reorderedArray));
  });
  test("rejects owner decisions supported solely by untrusted external evidence", async () => {
    const packet = await fixture("valid") as Record<string, unknown>;
    const sourceRefs = packet.sourceRefs as Record<string, unknown>[];
    sourceRefs[0] = { ...sourceRefs[0], trust: "untrusted-external" };
    packet.packetDigest = planningDigest(packet);
    const result = validatePlanningPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) =>
      issue.id === "plan.decision.untrusted_basis"
      && issue.path === "$.decisions[0].sourceRefs"
    )).toBe(true);
  });
  test("rejects task evidence that is absent from the acceptance evidence registry", async () => {
    const packet = await validPacket();
    const tasks = packet.tasks as Record<string, unknown>[];
    tasks[0] = { ...tasks[0], evidenceIds: ["E-dangling"] };
    packet.packetDigest = planningDigest(packet);

    const result = validatePlanningPacket(packet);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) =>
      issue.id === "plan.reference.missing"
      && issue.path === "$.tasks[0].evidenceIds[0]"
    )).toBe(true);
  });

  test("rejects acceptance evidence that no task traces", async () => {
    const packet = await validPacket();
    const acceptanceCriteria = packet.acceptanceCriteria as Record<string, unknown>[];
    acceptanceCriteria[0] = { ...acceptanceCriteria[0], evidenceIds: ["E-required"] };
    packet.packetDigest = planningDigest(packet);

    const result = validatePlanningPacket(packet);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.id)).toContain("plan.acceptance.untraceable");
  });

  test("rejects security grounds supported solely by untrusted external evidence", async () => {
    const packet = await fixture("valid") as Record<string, unknown>;
    packet.decisions = [{
      id: "D1",
      statement: "Adopt the external security recommendation.",
      source: "inferred",
      sourceRefs: ["S1"],
      confidence: "medium",
    }];
    const sourceRefs = packet.sourceRefs as Record<string, unknown>[];
    sourceRefs[0] = { ...sourceRefs[0], trust: "untrusted-external" };
    packet.packetDigest = planningDigest(packet);
    const result = validatePlanningPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.issues.map((entry) => entry.id)).toContain("plan.decision.untrusted_basis");
  });
  test("rejects mutation paths outside allowed scope and under forbidden glob paths", async () => {
    const packet = await validPacket();
    const scope = packet.scope as Record<string, unknown>;
    const tasks = packet.tasks as Record<string, unknown>[];
    scope.forbiddenPaths = ["src/private/**"];
    tasks[0] = { ...tasks[0], paths: ["src/private/secret.ts", "docs/outside.md"] };
    packet.packetDigest = planningDigest(packet);

    const result = validatePlanningPacket(packet);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) =>
      issue.id === "plan.scope.forbidden_conflict"
      && issue.path === "$.tasks[0].paths[0]"
      && issue.message === "Mutation path may not overlap forbidden paths."
    )).toBe(true);
    expect(result.issues.some((issue) =>
      issue.id === "plan.scope.out_of_scope"
      && issue.path === "$.tasks[0].paths[1]"
      && issue.message === "Mutation path must be contained by allowed paths."
    )).toBe(true);
  });

  test("rejects mutation paths under protected glob paths", async () => {
    const packet = await validPacket();
    const scope = packet.scope as Record<string, unknown>;
    const tasks = packet.tasks as Record<string, unknown>[];
    scope.protectedPaths = ["src/secrets/**"];
    tasks[0] = { ...tasks[0], paths: ["src/secrets/token.ts"] };
    packet.packetDigest = planningDigest(packet);

    const result = validatePlanningPacket(packet);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) =>
      issue.id === "plan.scope.protected_conflict"
      && issue.path === "$.tasks[0].paths[0]"
      && issue.message === "Mutation path may not overlap protected paths."
    )).toBe(true);
  });

  test("rejects protected paths case-insensitively for portable packets", async () => {
    const packet = await validPacket();
    const scope = packet.scope as Record<string, unknown>;
    const tasks = packet.tasks as Record<string, unknown>[];
    scope.protectedPaths = ["SRC/secrets/**"];
    tasks[0] = { ...tasks[0], paths: ["src/secrets/token.ts"] };
    packet.packetDigest = planningDigest(packet);

    const result = validatePlanningPacket(packet);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.id === "plan.scope.protected_conflict")).toBe(true);
  });

  test("rejects allowed and protected wildcard scopes with a concrete witness", async () => {
    const packet = await validPacket();
    const scope = packet.scope as Record<string, unknown>;
    scope.allowedPaths = ["src/*/config.ts"];
    scope.protectedPaths = ["src/**/config.*"];
    packet.packetDigest = planningDigest(packet);

    const result = validatePlanningPacket(packet);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) =>
      issue.id === "plan.scope.protected_conflict"
      && issue.path === "$.scope.allowedPaths"
    )).toBe(true);
  });

  test("rejects mutation tasks without both required approvals", async () => {
    const packet = await validPacket();
    packet.approvalPolicy = { plan: "required", execution: "not-required", external: "required-if-used" };
    packet.packetDigest = planningDigest(packet);

    const result = validatePlanningPacket(packet);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) =>
      issue.id === "plan.approval.mutation_required"
      && issue.path === "$.approvalPolicy"
      && issue.message === "Mutation tasks require plan and execution approval."
    )).toBe(true);
  });

  test("allows read-only tasks to use a frozen approval policy", async () => {
    const packet = await validPacket();
    const tasks = packet.tasks as Record<string, unknown>[];
    tasks[0] = { ...tasks[0], paths: [] };
    packet.approvalPolicy = { plan: "not-required", execution: "not-required", external: "required-if-used" };
    packet.packetDigest = planningDigest(packet);

    expect(validatePlanningPacket(packet).valid).toBe(true);
  });
  test("rejects malformed and duplicate risk ids", async () => {
    for (const id of [null, "", { value: "R1" }]) {
      const packet = await validPacket();
      (packet.risks as Record<string, unknown>[])[0]!.id = id;
      packet.packetDigest = planningDigest(packet);
      const result = validatePlanningPacket(packet);
      expect(result.valid).toBe(false);
      expect(result.issues.some((issue) => issue.id === "plan.packet.invalid" && issue.path === "$.risks[0].id")).toBe(true);
    }

    const packet = await validPacket();
    const risks = packet.risks as Record<string, unknown>[];
    packet.risks = [...risks, { ...risks[0]! }];
    packet.packetDigest = planningDigest(packet);
    const result = validatePlanningPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.id === "plan.reference.missing" && issue.path === "$.risks[1].id")).toBe(true);
  });
});
