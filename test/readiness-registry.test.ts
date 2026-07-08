import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { evaluateProductReadiness } from "../src/product-readiness";
import { buildReadinessRegistry, readinessEntriesForReport, READINESS_REGISTRY } from "../src/readiness-registry";
import { evaluateReleaseCheck } from "../src/release-check";
import { evaluateServiceReadiness } from "../src/service-readiness";

const ROOT = join(import.meta.dir, "..");
const BASELINE_DIR = join(ROOT, "test", "fixtures", "baselines", "readiness-v0");

describe("readiness registry", () => {
  test("contains recovery hint ids and formatter metadata for every check", () => {
    for (const entry of READINESS_REGISTRY) {
      expect(entry.id.trim()).toBe(entry.id);
      expect(entry.category.trim()).toBe(entry.category);
      expect(entry.recoveryHintId).toContain(".");
      expect(entry.formatter.markdownSection).toBe("Checks");
      expect(entry.formatter.order).toBeGreaterThan(0);
      expect(entry.validator.hook.trim()).toBe(entry.validator.hook);
    }
  });

  test("orders checks deterministically for every readiness report", async () => {
    const release = await evaluateReleaseCheck(ROOT);
    const product = await evaluateProductReadiness(ROOT);
    const service = await evaluateServiceReadiness(ROOT);

    expect(release.checks.map((check) => check.id)).toEqual(readinessEntriesForReport("release-check").map((entry) => entry.id));
    expect(product.checks.map((check) => check.id)).toEqual(readinessEntriesForReport("product-readiness").map((entry) => entry.id));
    expect(service.checks.map((check) => check.id)).toEqual(readinessEntriesForReport("service-readiness").map((entry) => entry.id));
  });

  test("preserves baseline readiness JSON output", async () => {
    expect(await evaluateReleaseCheck(ROOT)).toEqual(await readBaseline("release-check.json"));
    expect(await evaluateProductReadiness(ROOT)).toEqual(await readBaseline("product-readiness.json"));
    expect(await evaluateServiceReadiness(ROOT)).toEqual(await readBaseline("service-readiness.json"));
  });

  test("rejects duplicate check ids", () => {
    const [entry] = READINESS_REGISTRY;
    if (!entry) {
      throw new Error("readiness registry must not be empty");
    }

    let message = "";
    try {
      buildReadinessRegistry([entry, { ...entry, recoveryHintId: "test.duplicate" }]);
    } catch (error) {
      if (error instanceof Error) {
        message = error.message;
      }
    }
    expect(message).toContain("Duplicate readiness check id");
  });
});

async function readBaseline(name: string): Promise<unknown> {
  const parsed: unknown = JSON.parse(await readFile(join(BASELINE_DIR, name), "utf8"));
  return parsed;
}
