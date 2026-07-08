import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { evaluateProductReadiness } from "../src/product-readiness";
import { evaluateReleaseCheck } from "../src/release-check";
import { evaluateReleasePlan } from "../src/release-plan";
import { evaluateServiceReadiness } from "../src/service-readiness";
import { runCommand } from "./helpers/cli";

const ROOT = join(import.meta.dir, "..");
const BASELINE_DIR = join(import.meta.dir, "fixtures", "baselines", "readiness-v0");

describe("readiness v0 baseline fixtures", () => {
  test("match current release and readiness gate outputs", async () => {
    await expectCurrentBaselines(BASELINE_DIR);
  });

  test("blocks mismatched release manifest fixture", async () => {
    const fixtureDir = join(tmpdir(), `boulder-readiness-baseline-${Date.now()}`);
    try {
      await copyBaselineFixtures(BASELINE_DIR, fixtureDir);
      const releaseCheckPath = join(fixtureDir, "release-check.json");
      const releaseCheck = JSON.parse(await readFile(releaseCheckPath, "utf8"));
      if (!isRecord(releaseCheck)) throw new Error("release-check baseline must be an object");
      const manifestCheck = findCheck(releaseCheck, "release-evidence-manifest");
      manifestCheck["status"] = "pass";
      manifestCheck["evidence"] = "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json";
      await write(releaseCheckPath, `${JSON.stringify(releaseCheck, null, 2)}\n`);

      await expect(expectCurrentBaselines(fixtureDir)).rejects.toThrow("release-check.json mismatch");
    } finally {
      await rm(fixtureDir, { force: true, recursive: true });
    }
  });
});

async function expectCurrentBaselines(baselineDir: string): Promise<void> {
  await expectJsonBaseline("release-check.json", await evaluateReleaseCheck(ROOT), baselineDir);
  await expectJsonBaseline("product-readiness.json", await evaluateProductReadiness(ROOT), baselineDir);
  await expectJsonBaseline("service-readiness.json", await evaluateServiceReadiness(ROOT), baselineDir);
  await expectJsonBaseline("release-plan.json", await evaluateReleasePlan(ROOT), baselineDir);

  const pack = await runCommand("bun pm pack --dry-run --ignore-scripts", ROOT);
  expect(pack.exitCode).toBe(0);
  expectWithLabel(`${pack.stdout}${pack.stderr}`, await readFile(join(baselineDir, "pack-dry-run.txt"), "utf8"), "pack-dry-run.txt");
}

async function expectJsonBaseline(name: string, actual: unknown, baselineDir: string): Promise<void> {
  expectWithLabel(actual, JSON.parse(await readFile(join(baselineDir, name), "utf8")), name);
}

function expectWithLabel(actual: unknown, expected: unknown, label: string): void {
  try {
    expect(actual).toEqual(expected);
  } catch (error) {
    throw new Error(`${label} mismatch`, { cause: error });
  }
}

async function copyBaselineFixtures(sourceDir: string, targetDir: string): Promise<void> {
  for (const name of ["release-check.json", "product-readiness.json", "service-readiness.json", "release-plan.json", "pack-dry-run.txt"]) {
    await write(join(targetDir, name), await readFile(join(sourceDir, name), "utf8"));
  }
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findCheck(report: Record<string, unknown>, id: string): Record<string, unknown> {
  const checks = report["checks"];
  if (!Array.isArray(checks)) throw new Error("release-check baseline checks must be an array");
  const check = checks.find((item): item is Record<string, unknown> => isRecord(item) && item["id"] === id);
  if (!check) throw new Error(`release-check baseline missing ${id}`);
  return check;
}
