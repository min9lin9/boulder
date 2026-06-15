import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { benchmarkReportToMarkdown, evaluateBenchmarkFixtures, loadBenchmarkFixtures } from "../src/benchmark";
import { exists } from "../src/fs";
import { defaultManifest, loadManifest } from "../src/manifest";
import { evaluateProductReadiness, productReadinessToMarkdown } from "../src/product-readiness";
import { evaluateQuickstart, quickstartToMarkdown } from "../src/quickstart";
import { evaluateReleaseCheck, releaseCheckToMarkdown } from "../src/release-check";
import { evaluateReleasePlan, releasePlanToMarkdown } from "../src/release-plan";
import { evaluateReplayCheck, replayCheckToMarkdown } from "../src/replay-check";
import { buildReplayRunPlan, replayRunPlanToMarkdown } from "../src/replay-run";
import { scorecardToMarkdown, scoreManifest } from "../src/scorecard";
import { initHarness } from "../src/workflows";
import { tempRepo } from "./helpers/cli";

describe("harness quality scorecard", () => {
  test("scores the root Boulder harness as ready", async () => {
    const root = join(import.meta.dir, "..");
    const manifest = await loadManifest(root);
    const scorecard = scoreManifest(manifest);
    expect(scorecard.score).toBe(100);
    expect(scorecard.rating).toBe("ready");
    expect(scorecard.criteria.some((item) => item.id === "operator-workflow-stack" && item.status === "pass")).toBe(true);
  });

  test("penalizes unsafe external provider policy", () => {
    const manifest = defaultManifest("fixture");
    manifest.providers.externalAllowed = true;
    manifest.providers.approvalRequired = false;
    manifest.verification = [{ name: "smoke", command: "bun test", required: true }];
    const scorecard = scoreManifest(manifest);
    const markdown = scorecardToMarkdown(scorecard);
    expect(scorecard.rating).toBe("needs-work");
    expect(markdown).toContain("provider-policy");
  });
});

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

  test("checks release evidence without publishing", async () => {
    const root = join(import.meta.dir, "..");
    const report = await evaluateReleaseCheck(root);
    const markdown = releaseCheckToMarkdown(report);

    expect(report.status).toBe("ready");
    expect(report.checks.some((item) => item.id === "install-smoke-evidence" && item.status === "pass")).toBe(true);
    expect(report.checks.some((item) => item.id === "github-actions-evidence" && item.status === "pass")).toBe(true);
    expect(markdown).toContain("does not publish");
  });
});

describe("quickstart and replay reports", () => {
  test("summarizes the next first-run commands for a repository", async () => {
    const root = await tempRepo();
    await initHarness(root);
    const quickstart = await evaluateQuickstart(root);
    const markdown = quickstartToMarkdown(quickstart);

    expect(quickstart.status).toBe("ready");
    expect(quickstart.steps.map((item) => item.command)).toContain("boulder inspect --cwd . --json");
    expect(quickstart.steps.map((item) => item.command)).toContain("boulder service-readiness --cwd . --json");
    expect(markdown).toContain("# Boulder Quickstart");
  });

  test("checks public replay fixtures and official docs references", async () => {
    const root = join(import.meta.dir, "..");
    const report = await evaluateReplayCheck(root);
    const markdown = replayCheckToMarkdown(report);

    expect(report.status).toBe("ready");
    expect(report.projects.length).toBeGreaterThanOrEqual(3);
    expect(report.projects.some((item) => item.project === "gajae-code" && item.status === "pass")).toBe(true);
    expect(report.projects.some((item) => item.project === "awesome-codex-subagents" && item.status === "pass")).toBe(true);
    expect(markdown).toContain("official-docs-first");
  });

  test("builds a dry-run command plan from replay fixtures", async () => {
    const root = join(import.meta.dir, "..");
    const plan = await buildReplayRunPlan(root);
    const markdown = replayRunPlanToMarkdown(plan);

    expect(plan.status).toBe("ready");
    expect(plan.projects.every((item) => item.dryRunOnly)).toBe(true);
    expect(markdown).toContain("does not execute");
    expect(markdown).toContain("gajae-code");
  });
});

describe("product readiness and examples", () => {
  test("reports root product readiness evidence gates", async () => {
    const root = join(import.meta.dir, "..");
    const readiness = await evaluateProductReadiness(root);
    const markdown = productReadinessToMarkdown(readiness);

    expect(readiness.checks.some((item) => item.id === "gjc-plan-evidence")).toBe(true);
    expect(readiness.checks.some((item) => item.id === "lazycodex-implementation-evidence")).toBe(true);
    expect(readiness.checks.some((item) => item.id === "published-install-smoke" && item.status === "pass")).toBe(true);
    expect(markdown).toContain("docs/CODEX_OSS_APPLICATION_PACKET.md");
  });

  test("blocks when GJC planning evidence is missing", async () => {
    const root = await tempRepo();
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture" }), "utf8");
    await writeFile(join(root, "README.md"), "# fixture\n", "utf8");
    await writeFile(join(root, "CHANGELOG.md"), "# Changelog\n", "utf8");
    await initHarness(root);
    await writeFile(join(root, "docs", "CODEX_OSS_APPLICATION_PACKET.md"), "# Codex OSS Application Packet\n", "utf8");
    await writeFile(join(root, "docs", "CASE_STUDIES.md"), "# Case Studies\n", "utf8");
    await writeFile(join(root, "docs", "lazycodex-implementation-summary.md"), "# LazyCodex\n", "utf8");

    const readiness = await evaluateProductReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "gjc-plan-evidence" && item.status === "fail")).toBe(true);
  });

  test("checked-in example harnesses include Boulder outputs", async () => {
    const examples = [
      ["typescript-library", "bun run test"],
      ["python-package", "python -m pip check"],
      ["mcp-server", "bun run typecheck"]
    ];

    for (const [name, command] of examples) {
      const root = join(import.meta.dir, "..", "examples", name);
      expect(await exists(join(root, "BOULDER.md"))).toBe(true);
      expect(await exists(join(root, "docs", "CODEX_WORKFLOW_NOTES.md"))).toBe(true);
      const manifest = await readFile(join(root, "boulder.yaml"), "utf8");
      expect(manifest).toContain(command);
      expect(manifest).toContain("name: superpowers");
      expect(manifest).toContain("name: gstack");
      expect(manifest).toContain("name: compound");
    }
  });
});
