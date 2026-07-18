import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { evaluateQuickstart, quickstartToMarkdown } from "../src/quickstart";
import { evaluateReplayCheck, replayCheckToMarkdown } from "../src/replay-check";
import { buildReplayRunPlan, replayRunPlanToMarkdown } from "../src/replay-run";
import { initHarness } from "../src/workflows";
import { removeTempRepo, tempRepo, write } from "./helpers/cli";

describe("quickstart and replay reports", () => {
  test("summarizes the next first-run commands for a repository", async () => {
    const root = await tempRepo();
    try {
      await initHarness(root);
      const quickstart = await evaluateQuickstart(root);
      const markdown = quickstartToMarkdown(quickstart);

      expect(quickstart.status).toBe("ready");
      expect(quickstart.checks.some((item) => item.id === "executor-planning" && item.status === "pass")).toBe(true);
      expect(quickstart.checks.some((item) => item.id === "executor-execution" && item.status === "pass")).toBe(true);
      expect(quickstart.steps.map((item) => item.command)).toContain("boulder inspect --cwd . --json");
      expect(quickstart.steps.map((item) => item.command)).toContain('boulder bootstrap interview --cwd . --task "<repeated work>"');
      expect(quickstart.steps.map((item) => item.command)).toContain("boulder capability import --from https://github.com/Yeachan-Heo/gajae-code --dry-run");
      expect(quickstart.steps.map((item) => item.command)).toContain("boulder capability import --from https://github.com/code-yeongyu/lazycodex --dry-run");
      expect(quickstart.steps.map((item) => item.command)).toContain("boulder capability import --from https://github.com/msitarzewski/agency-agents --dry-run");
      expect(quickstart.steps.map((item) => item.command)).toContain("boulder service-readiness --cwd . --json");
      expect(markdown).toContain("# Boulder Quickstart");
      expect(markdown).toContain("plan=gajae-code");
      expect(markdown).toContain("execute=lazycodex");
      expect(markdown).toContain("GJC and LazyCodex are adapter preferences");
      expect(markdown).toContain("Bootstrap task-category profiles");
      expect(markdown).toContain("agency-agents is a profile-scoped subagent catalog");
      expect(markdown).toContain("doctor verifies local installation before live execution");
    } finally {
      await removeTempRepo(root);
    }
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

  test("blocks stale replay docs and replay ref mismatches", async () => {
    const root = await tempRepo();
    try {
      await write(root, "docs/CASE_STUDIES/evidence/external-replay/example.txt", "share-safe replay evidence\n");
      await write(root, "fixtures/replay/example/replay.json", JSON.stringify({
        project: "example",
        repoUrl: "https://github.com/example/repo",
        ref: "v1.0.0",
        officialDocsPath: "fixtures/replay/example/official-docs.json",
        commands: ["bunx boulder-oss-cli inspect --cwd . --json"],
        expectedArtifacts: ["docs/REPO_BRIEF.md"],
        evidencePaths: ["docs/CASE_STUDIES/evidence/external-replay/example.txt"],
        limitations: ["dry-run replay only"]
      }));
      await write(root, "fixtures/replay/example/official-docs.json", JSON.stringify({
        project: "example",
        repoUrl: "https://github.com/example/repo",
        docsUrls: ["https://github.com/example/repo#readme"],
        versionOrRef: "main",
        setupCommands: ["read the README"],
        testCommands: ["run documented tests"],
        contributionPolicy: "Use public issues.",
        securityPolicy: "No secrets.",
        constraints: ["No mutation"],
        retrievedAt: "2025-01-01"
      }));

      const report = await evaluateReplayCheck(root);
      const issues = report.projects.flatMap((item) => item.issues).join("\n");

      expect(report.status).toBe("blocked");
      expect(issues).toContain("replay ref v1.0.0 must match official docs versionOrRef main");
      expect(issues).toContain("official docs are stale");
    } finally {
      await removeTempRepo(root);
    }
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
