import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { benchmarkReportToMarkdown, evaluateBenchmarkFixtures, loadBenchmarkFixtures } from "../src/benchmark";
import { evaluateReleaseCheck, releaseCheckToMarkdown } from "../src/release-check";
import { evaluateReleasePlan, releasePlanToMarkdown } from "../src/release-plan";
import { removeTempRepo, runCommand, tempRepo, write } from "./helpers/cli";

describe("benchmark and release reports", () => {
  test("loads root benchmark fixtures and avoids leaderboard claims", async () => {
    const root = join(import.meta.dir, "..");
    const fixtures = await loadBenchmarkFixtures(root);
    const report = evaluateBenchmarkFixtures(fixtures);
    const markdown = benchmarkReportToMarkdown(report);

    expect(fixtures.length).toBe(3);
    expect(report.readyCount).toBe(3);
    expect(report.results.every((item) => item.rating === "ready")).toBe(true);
    expect(markdown).toContain("not a runtime speed benchmark");
  });

  test("rates the root release plan as ready and keeps publish manual", async () => {
    const root = join(import.meta.dir, "..");
    const plan = await evaluateReleasePlan(root);
    const markdown = releasePlanToMarkdown(plan);

    expect(plan.status).toBe("ready");
    expect(plan.checks.every((item) => item.status === "pass")).toBe(true);
    expect(plan.checks.some((item) => item.id === "pipeline-planning-evidence")).toBe(true);
    expect(markdown).toContain("npm publish is not automated");
  });

  test("reports root release evidence as ready after 0.1.16 publish and tag evidence", async () => {
    const root = join(import.meta.dir, "..");
    const report = await evaluateReleaseCheck(root);
    const markdown = releaseCheckToMarkdown(report);

    expect(report.version).toBe("0.1.16");
    expect(report.status).toBe("ready");
    expect(report.checks.some((item) => item.id === "ci-bun-engine" && item.status === "pass")).toBe(true);
    expect(report.checks.some((item) => item.id === "changelog-version" && item.status === "pass")).toBe(true);
    expect(report.checks.some((item) => item.id === "install-smoke-version" && item.status === "pass")).toBe(true);
    expect(report.checks.some((item) => item.id === "published-version-evidence" && item.status === "pass")).toBe(true);
    expect(report.checks.some((item) => item.id === "git-tag-local" && item.status === "pass")).toBe(true);
    expect(report.checks.some((item) => item.id === "install-smoke-evidence" && item.status === "pass")).toBe(true);
    expect(report.checks.some((item) => item.id === "github-actions-evidence" && item.status === "pass")).toBe(true);
    expect(report.checks.some((item) => item.id === "release-evidence-manifest" && item.status === "pass")).toBe(true);
    expect(report.nextCommands).toEqual([]);
    expect(markdown).toContain("does not publish");
    expect(markdown).toContain("Status: ready");
    expect(markdown).not.toContain("npm publish --access public");
    expect(markdown).not.toContain("git tag v");
    expect(markdown).not.toContain("gh release create");
  });

  test("reports release evidence as ready after publish and tag in a release fixture", async () => {
    const root = await tempRepo();
    try {
      await write(root, "package.json", JSON.stringify({ name: "boulder-oss-cli", version: "1.2.3" }));
      await write(root, "docs/RELEASE_WORKFLOW.md", "npm publish\nGitHub Release\ntag\n");
      await write(root, ".github/workflows/ci.yml", 'bun-version: "1.3.14"\n');
      await write(root, "CHANGELOG.md", "## 1.2.3\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", "bunx boulder-oss-cli\n1.2.3\nPublished version: 1.2.3\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", "CI\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt", "boulder-oss-cli\nTotal files\n");
      await runCommand("git init", root);
      await runCommand("git config user.email test@example.com", root);
      await runCommand("git config user.name Test", root);
      await runCommand("git add .", root);
      await runCommand("git commit -m init", root);
      await runCommand("git tag v1.2.3", root);
      const releaseCommit = (await runCommand("git rev-parse HEAD", root)).stdout.trim();
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", `CI\nCommit: ${releaseCommit}\n`);
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json", JSON.stringify({
        schemaVersion: 1,
        packageName: "boulder-oss-cli",
        packageJsonVersion: "1.2.3",
        cliVersion: "1.2.3",
        tag: "v1.2.3",
        tagCommit: releaseCommit,
        releaseCommit,
        publishedVersion: "1.2.3",
        installSmoke: {
          command: "bunx boulder-oss-cli@1.2.3 --version",
          exitCode: 0,
          generatedAt: "2026-07-07"
        },
        githubActions: {
          runUrl: "https://github.com/example/repo/actions/runs/1"
        },
        packDryRun: {
          fileCount: 10,
          packageVersion: "1.2.3"
        },
        limitations: []
      }));

      const report = await evaluateReleaseCheck(root);

      expect(report.status).toBe("ready");
      expect(report.nextCommands).toEqual([]);
      expect(report.checks.every((item) => item.status === "pass")).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("reports blocker-first release next commands without publish automation", async () => {
    const root = await tempRepo();
    try {
      await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", version: "1.2.3" }), "utf8");

      const report = await evaluateReleaseCheck(root);

      expect(report.status).toBe("blocked");
      expect(report.nextCommands.length).toBeGreaterThan(0);
      expect(report.nextCommands.join("\n")).toContain("Update docs/RELEASE_WORKFLOW.md");
      expect(report.nextCommands.join("\n")).not.toContain("npm publish --access public");
      expect(report.nextCommands.join("\n")).not.toContain("git tag v");
      expect(report.nextCommands.join("\n")).not.toContain("gh release create");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("blocks malformed structured release evidence manifests", async () => {
    const root = await tempRepo();
    try {
      await write(root, "package.json", JSON.stringify({ name: "fixture", version: "1.2.3" }));
      await write(root, "docs/RELEASE_WORKFLOW.md", "npm publish\nGitHub Release\ntag\n");
      await write(root, ".github/workflows/ci.yml", 'bun-version: "1.3.14"\n');
      await write(root, "CHANGELOG.md", "## 1.2.3\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", "bunx boulder-oss-cli\n1.2.3\nPublished version: 1.2.3\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", "CI\nCommit: 1111111\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt", "boulder-oss-cli\nTotal files\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json", JSON.stringify({
        schemaVersion: 1,
        packageName: "boulder-oss-cli",
        packageJsonVersion: "1.2.3",
        cliVersion: "1.2.3",
        tag: "v1.2.3",
        tagCommit: "0000000000000000000000000000000000000000",
        releaseCommit: "0000000000000000000000000000000000000000",
        publishedVersion: "1.2.3",
        installSmoke: {
          command: "bunx boulder-oss-cli@1.2.3 --version",
          exitCode: 0,
          generatedAt: "2026-07-07"
        },
        githubActions: {
          runUrl: "https://github.com/example/repo/actions/runs/1"
        },
        packDryRun: {
          fileCount: 10,
          packageVersion: "1.2.3"
        },
        limitations: []
      }));
      await runCommand("git init", root);
      await runCommand("git config user.email test@example.com", root);
      await runCommand("git config user.name Test", root);
      await runCommand("git add .", root);
      await runCommand("git commit -m init", root);
      await runCommand("git tag v1.2.3", root);

      const report = await evaluateReleaseCheck(root);
      const manifest = report.checks.find((item) => item.id === "release-evidence-manifest");

      expect(report.status).toBe("blocked");
      expect(manifest?.status).toBe("fail");
      expect(manifest?.evidence).toContain("tagCommit must match local tag");
    } finally {
      await removeTempRepo(root);
    }
  });
});
