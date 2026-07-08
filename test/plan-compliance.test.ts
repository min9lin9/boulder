import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..");
const PLAN_PATH = join(ROOT, ".omo", "plans", "boulder-9-3-plus-verified.md");
const EVIDENCE_DIR = join(ROOT, ".omo", "evidence", "boulder-9-3-plus-verified");

const REQUIRED_EVIDENCE = [
  "task-1-baseline.txt",
  "task-1-blocked-fixture.txt",
  "task-2-bundle-tests.txt",
  "task-2-mismatch.txt",
  "task-3-package-contract.txt",
  "task-3-unclassified-file.txt",
  "task-4-doc-registry.txt",
  "task-4-i18n-failure.txt",
  "task-5-refresh-dry-run.json",
  "task-5-refresh-failure.txt",
  "task-6-registry-tests.txt",
  "task-6-duplicate-id.txt",
  "task-7-inspect.json",
  "task-7-diff-failure.json",
  "task-8-runs-list.json",
  "task-8-redaction.txt",
  "task-8-prune.json",
  "task-9-workflow-map.json",
  "task-9-workflow-failure.txt",
  "task-10-release-check-ready.json",
  "task-10-metadata-failure.json"
] as const;

const REQUIRED_GUARDRAILS = [
  "No hosted OpenAI Apps SDK app, plugin marketplace listing, mobile app, login surface, web app, SEO/GEO/AEO implementation.",
  "No custom npm token manager and no npm secret persistence.",
  "No claim that npm account/package settings are verified unless the evidence comes from npm/GitHub external state.",
  "No run log that stores raw workspace file bodies, credentials, private user data, or protected file content.",
  "9.3+ is documented as a review target"
] as const;

describe("9.3+ plan compliance", () => {
  test("required task evidence and guardrails are present", async () => {
    expect(await validatePlanCompliance(EVIDENCE_DIR)).toEqual({
      evidenceCount: REQUIRED_EVIDENCE.length,
      guardrailCount: REQUIRED_GUARDRAILS.length
    });
  });

  test("fails when required evidence is missing", async () => {
    await expect(validatePlanCompliance(join(ROOT, "test", "fixtures", "missing-plan-evidence"))).rejects.toThrow("missing evidence");
  });
});

async function validatePlanCompliance(evidenceDir: string): Promise<{ evidenceCount: number; guardrailCount: number }> {
  const plan = await readFile(PLAN_PATH, "utf8");
  for (const todo of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    if (!plan.includes(`- [x] ${todo}.`)) throw new Error(`todo ${todo} is not complete`);
  }
  for (const guardrail of REQUIRED_GUARDRAILS) {
    if (!plan.includes(guardrail)) throw new Error(`missing guardrail: ${guardrail}`);
  }
  for (const evidence of REQUIRED_EVIDENCE) {
    await expectEvidence(join(evidenceDir, evidence));
  }
  return { evidenceCount: REQUIRED_EVIDENCE.length, guardrailCount: REQUIRED_GUARDRAILS.length };
}

async function expectEvidence(path: string): Promise<void> {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`missing evidence: ${path}`);
  }
}
