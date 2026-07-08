import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..");
const PLAN_PATH = join(ROOT, ".omo", "plans", "boulder-9-3-plus-verified.md");
const MANUAL_QA_SCRIPT = join(ROOT, "script", "qa", "boulder-9-3-plus-manual-qa.sh");
const SCOPE_FIDELITY_SCRIPT = join(ROOT, "script", "qa", "boulder-9-3-plus-scope-fidelity.sh");

const REQUIRED_GUARDRAILS = [
  "No hosted OpenAI Apps SDK app, plugin marketplace listing, mobile app, login surface, web app, SEO/GEO/AEO implementation.",
  "No custom npm token manager and no npm secret persistence.",
  "No claim that npm account/package settings are verified unless the evidence comes from npm/GitHub external state.",
  "No run log that stores raw workspace file bodies, credentials, private user data, or protected file content.",
  "9.3+ is documented as a review target"
] as const;

const REQUIRED_CURRENT_BLOCKED_CONTEXT = [
  "v0.1.16 is a code version",
  "publish/tag/install smoke evidence is required before fully ready",
  "current release/product gates may be blocked if the clean target ref is blocked"
] as const;

describe("9.3+ plan compliance", () => {
  test("completed plan guardrails and final QA assets are present", async () => {
    expect(await validatePlanCompliance([MANUAL_QA_SCRIPT, SCOPE_FIDELITY_SCRIPT])).toEqual({
      qaAssetCount: 2,
      guardrailCount: REQUIRED_GUARDRAILS.length,
      blockedContextCount: REQUIRED_CURRENT_BLOCKED_CONTEXT.length
    });
  });

  test("fails when required QA asset is missing", async () => {
    await expect(validatePlanCompliance([join(ROOT, "test", "fixtures", "missing-plan-evidence", "missing.sh")])).rejects.toThrow("missing QA asset");
  });
});

async function validatePlanCompliance(qaAssets: readonly string[]): Promise<{ qaAssetCount: number; guardrailCount: number; blockedContextCount: number }> {
  const plan = await readFile(PLAN_PATH, "utf8");
  for (const todo of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    if (!plan.includes(`- [x] ${todo}.`)) throw new Error(`todo ${todo} is not complete`);
  }
  for (const finalGate of ["F1. Plan compliance audit", "F2. Code quality review", "F3. Real manual QA", "F4. Scope fidelity"]) {
    if (!plan.includes(finalGate)) throw new Error(`missing final gate: ${finalGate}`);
  }
  for (const guardrail of REQUIRED_GUARDRAILS) {
    if (!plan.includes(guardrail)) throw new Error(`missing guardrail: ${guardrail}`);
  }
  for (const context of REQUIRED_CURRENT_BLOCKED_CONTEXT) {
    if (!plan.includes(context)) throw new Error(`missing current blocked context: ${context}`);
  }
  for (const asset of qaAssets) {
    await expectQaAsset(asset);
  }
  return { qaAssetCount: qaAssets.length, guardrailCount: REQUIRED_GUARDRAILS.length, blockedContextCount: REQUIRED_CURRENT_BLOCKED_CONTEXT.length };
}

async function expectQaAsset(path: string): Promise<void> {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`missing QA asset: ${path}`);
  }
}
