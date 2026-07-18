import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { canonicalizePlanningValue, planningDigest } from "../src/planning-canonical";
import { validatePlanningPacket } from "../src/planning-packet";

async function validPacket(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(import.meta.dir, "..", "fixtures", "planning-packets", "valid.json"), "utf8"));
}

describe("planning canonical values", () => {
  test("rejects non-JSON values with a stable error and invalid digest", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const sparse = ["first", , "third"];
    const values: readonly unknown[] = [
      new Date(),
      /pattern/,
      new Number(1),
      Object.create({ inherited: true }),
      sparse,
      cyclic,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      undefined,
      () => undefined,
      Symbol("value"),
      1n,
      { nested: undefined },
      { nested: () => undefined },
      { nested: Symbol("value") },
      { nested: 1n },
    ];

    for (const value of values) {
      let message = "";
      try {
        canonicalizePlanningValue(value);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toBe("Planning values must be finite JSON values.");
      expect(planningDigest(value)).toBe("invalid:non-json-value");
    }
  });

  test("keeps object keys canonical while preserving array order", () => {
    const first = { items: ["first", "second"], nested: { b: 2, a: 1 } };
    const reorderedKeys = { nested: { a: 1, b: 2 }, items: ["first", "second"] };
    const reorderedArray = { nested: { a: 1, b: 2 }, items: ["second", "first"] };

    expect(canonicalizePlanningValue(first)).toBe(canonicalizePlanningValue(reorderedKeys));
    expect(planningDigest(first)).toBe(planningDigest(reorderedKeys));
    expect(planningDigest(first)).not.toBe(planningDigest(reorderedArray));
  });

  test("returns stable validation issues when packet content is not JSON", async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const invalidValues: readonly unknown[] = [
      new Date(),
      ["present", , "sparse"],
      cyclic,
      Number.NaN,
      undefined,
      () => undefined,
      Symbol("value"),
      1n,
    ];

    for (const invalidValue of invalidValues) {
      const packet = await validPacket();
      packet.nonJson = invalidValue;
      const result = validatePlanningPacket(packet);
      expect(result.valid).toBe(false);
      expect(result.issues.some((issue) =>
        issue.id === "plan.packet.invalid"
        && issue.path === "$.packetDigest"
        && issue.message === "Packet digest does not match canonical content."
      )).toBe(true);
    }
  });
});
