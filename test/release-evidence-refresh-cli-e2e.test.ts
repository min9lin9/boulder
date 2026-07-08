import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import releaseManifest from "../docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json" with { type: "json" };
import packageJson from "../package.json" with { type: "json" };
import { RELEASE_EVIDENCE_TARGETS } from "../src/release-evidence";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

describe("release evidence refresh CLI", () => {
  test("reports every renderer target in dry-run JSON", async () => {
    const result = await runBoulder(["release", "evidence", "refresh", "--dry-run", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    expect(refreshTargetPaths(result.stdout).sort()).toEqual([...RELEASE_EVIDENCE_TARGETS].sort());
  });

  test("blocks mismatched bundle without writes", async () => {
    const root = await tempRepo();
    const untouched = "keep this exact file\nTotal files: 146\n";

    try {
      await write(root, "package.json", JSON.stringify({ name: packageJson.name, version: packageJson.version }, null, 2));
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json", JSON.stringify({
        ...releaseManifest,
        packDryRun: { ...releaseManifest.packDryRun, fileCount: 999 }
      }, null, 2));
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt", untouched);
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", "CI\nCommit: 806330e\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", "old install smoke\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/ci.txt", "old ci\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/release-plan.json", "{}\n");
      await write(root, "docs/PRODUCT_READINESS.md", "- public-release-check: pass - release-check ready for 0.1.15\n");

      const result = await runBoulder(["release", "evidence", "refresh", "--write", "--json", "--cwd", root]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("release.pack_file_count_mismatch");
      expect(await readFile(join(root, "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt"), "utf8")).toBe(untouched);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("write updates approved targets and leaves adjacent files alone", async () => {
    const root = await tempRepo();
    const adjacent = "adjacent evidence\n";

    try {
      await writeRefreshFixture(root, JSON.stringify(releaseManifest, null, 2));
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/not-a-target.txt", adjacent);

      const result = await runBoulder(["release", "evidence", "refresh", "--write", "--json", "--cwd", root]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(await readFile(join(root, "docs/CASE_STUDIES/evidence/release-workflow/not-a-target.txt"), "utf8")).toBe(adjacent);
      expect(await readFile(join(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt"), "utf8")).toContain(`bunx boulder-oss-cli@${packageJson.version} --version`);
      expect(await readFile(join(root, "docs/PRODUCT_READINESS.md"), "utf8")).toContain(`- public-release-check: pass - release-check ready for ${packageJson.version}`);
    } finally {
      await removeTempRepo(root);
    }
  });
});

async function writeRefreshFixture(root: string, manifest: string): Promise<void> {
  await write(root, "package.json", JSON.stringify({ name: packageJson.name, version: packageJson.version }, null, 2));
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json", manifest);
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt", "Package version: 0.1.15\nTotal files: 146\n");
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", "CI\nCommit: 806330e\n");
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", "old install smoke\n");
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/ci.txt", "old ci\n");
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/release-plan.json", "{}\n");
  await write(root, "docs/PRODUCT_READINESS.md", [
    "# Product Readiness",
    "",
    "- public-release-check: pass - release-check ready for 0.1.15",
    "- limitations-explicit: pass - docs/CODEX_OSS_APPLICATION_PACKET.md",
    ""
  ].join("\n"));
}

function refreshTargetPaths(source: string): string[] {
  const payload: unknown = JSON.parse(source);
  if (!isRecord(payload) || !Array.isArray(payload.targets)) return [];
  return payload.targets.flatMap((target) => {
    if (!isRecord(target) || typeof target.path !== "string") return [];
    return [target.path];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
