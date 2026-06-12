import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { exists } from "../src/fs";
import { benchmarkReportToMarkdown, evaluateBenchmarkFixtures, loadBenchmarkFixtures } from "../src/benchmark";
import { exportHarness } from "../src/export";
import { inspectRepo } from "../src/inspect";
import { defaultManifest, loadManifest } from "../src/manifest";
import { buildPipelinePlan, validatePipelinePlan, type PipelinePlan } from "../src/pipeline";
import { evaluateProductReadiness, productReadinessToMarkdown } from "../src/product-readiness";
import { evaluateQuickstart, quickstartToMarkdown } from "../src/quickstart";
import { evaluateReleaseCheck, releaseCheckToMarkdown } from "../src/release-check";
import { evaluateReleasePlan, releasePlanToMarkdown } from "../src/release-plan";
import { scorecardToMarkdown, scoreManifest } from "../src/scorecard";
import { validateManifest } from "../src/validation";
import { initHarness } from "../src/workflows";
import { verifyHarness } from "../src/verify";

async function tempRepo(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "boulder-test-"));
}

describe("boulder M1 surface", () => {
  test("init creates harness files", async () => {
    const root = await tempRepo();
    const results = await initHarness(root);
    expect(results.some((line) => line.includes("boulder.yaml"))).toBe(true);
    expect(await exists(join(root, "BOULDER.md"))).toBe(true);
    expect(await exists(join(root, "docs", "REPO_BRIEF.md"))).toBe(true);
    expect(await exists(join(root, "docs", "OPERATOR_WORKFLOW_STACK.md"))).toBe(true);
    expect(await exists(join(root, "docs", "HARNESS_QUALITY_SCORECARD.md"))).toBe(true);
    const boulder = await readFile(join(root, "BOULDER.md"), "utf8");
    expect(boulder).toContain("## Operator Contract");
    expect(boulder).toContain("Record command evidence before claims.");
    const stack = await readFile(join(root, "docs", "OPERATOR_WORKFLOW_STACK.md"), "utf8");
    expect(stack).toContain("Superpowers");
    expect(stack).toContain("GStack");
    expect(stack).toContain("Compound");
  });

  test("inspect returns a repo brief shape", async () => {
    const root = await tempRepo();
    await initHarness(root);
    const inspection = await inspectRepo(root);
    expect(inspection.name.length).toBeGreaterThan(0);
    expect(inspection.recommendedWorkflows).toContain("pr-review-prep");
  });

  test("init writes inferred package verification commands", async () => {
    const root = await tempRepo();
    await writeFile(join(root, "package.json"), JSON.stringify({
      name: "fixture-package",
      scripts: {
        test: "bun test",
        build: "bun build src/index.ts"
      }
    }, null, 2), "utf8");
    await initHarness(root);
    const manifest = await readFile(join(root, "boulder.yaml"), "utf8");
    expect(manifest).toContain("name: test");
    expect(manifest).toContain("command: bun run test");
    expect(manifest).toContain("name: build");
    expect(manifest).toContain("command: bun run build");
  });

  test("verify supports dry run", async () => {
    const root = await tempRepo();
    await initHarness(root);
    const results = await verifyHarness(root, true);
    expect(results.every((item) => item.status === "planned")).toBe(true);
  });

  test("manifest validation catches unsafe external provider policy", () => {
    const manifest = defaultManifest("fixture");
    manifest.providers.externalAllowed = true;
    manifest.providers.approvalRequired = false;
    const issues = validateManifest(manifest);
    expect(issues.some((item) => item.severity === "error")).toBe(true);
    expect(issues.map((item) => item.path)).toContain("providers.approvalRequired");
  });

  test("manifest validation requires the har-maker operator stack", () => {
    const manifest = defaultManifest("fixture");
    manifest.workflowStack = manifest.workflowStack.filter((item) => item.name !== "gstack");
    const issues = validateManifest(manifest);
    expect(issues.some((item) => item.path === "workflowStack" && item.severity === "error")).toBe(true);
  });

  test("verify rejects invalid manifests", async () => {
    const root = await tempRepo();
    await initHarness(root);
    await writeFile(join(root, "boulder.yaml"), [
      "name: fixture",
      "description: invalid provider policy",
      "maintainers:",
      "  - min9lin9",
      "workflows:",
      "  - issue-triage",
      "protectedPaths:",
      "  - .env*",
      "verification:",
      "  - name: smoke",
      "    command: echo ok",
      "    required: true",
      "providers:",
      "  default: codex",
      "  externalAllowed: true",
      "  approvalRequired: false",
      "export:",
      "  markdown: true",
      "  codexNotes: true",
      ""
    ].join("\n"), "utf8");
    let message = "";
    try {
      await verifyHarness(root, true);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("External providers require approval gating.");
  });

  test("export writes Codex notes", async () => {
    const root = await tempRepo();
    await initHarness(root);
    const results = await exportHarness(root, true);
    expect(results.some((line) => line.includes("CODEX_WORKFLOW_NOTES.md"))).toBe(true);
    expect(await exists(join(root, "docs", "BOULDER_EXPORT.md"))).toBe(true);
    const exported = await readFile(join(root, "docs", "BOULDER_EXPORT.md"), "utf8");
    expect(exported).toContain("## Operator Pipeline");
    expect(exported).toContain("friction: medium");
    expect(exported).toContain("fail-closed: true");
    expect(exported).not.toContain("stage: cso-qa");
    const notes = await readFile(join(root, "docs", "CODEX_WORKFLOW_NOTES.md"), "utf8");
    expect(notes).toContain("Superpowers spine");
    expect(notes).toContain("GStack gates");
    expect(notes).toContain("Compound learning layer");
  });
});

describe("provider policy fixtures", () => {
  const cases: readonly [string, boolean][] = [
    ["codex-only", false],
    ["external-approved", false],
    ["external-without-approval", true]
  ];

  for (const [name, shouldError] of cases) {
    test(`${name} fixture validates as expected`, async () => {
      const root = join(import.meta.dir, "..", "fixtures", "provider-policies", name);
      const manifest = await loadManifest(root);
      const issues = validateManifest(manifest);
      const hasProviderError = issues.some((item) => item.path === "providers.approvalRequired" && item.severity === "error");
      expect(hasProviderError).toBe(shouldError);
    });
  }
});

describe("pipeline planning surface", () => {
  test("builds a low friction pipeline plan", () => {
    const plan = buildPipelinePlan("low");
    expect(plan.friction).toBe("low");
    expect(plan.failClosed).toBe(true);
    expect(JSON.stringify(plan.stages.map((item) => item.id))).toBe(JSON.stringify(["classification", "synthesizer"]));
    expect(JSON.stringify(plan.approvalGates)).toBe(JSON.stringify([]));
    expect(plan.forbiddenSideEffects).toContain("credential-access");
    expect(JSON.stringify(validatePipelinePlan(plan))).toBe(JSON.stringify([]));
  });

  test("builds a medium friction pipeline plan", () => {
    const plan = buildPipelinePlan("medium");
    expect(plan.friction).toBe("medium");
    expect(JSON.stringify(plan.stages.map((item) => item.id))).toBe(JSON.stringify(["classification", "deep-interview", "pm-debate", "synthesizer"]));
    expect(JSON.stringify(plan.approvalGates)).toBe(JSON.stringify(["pm-debate"]));
    expect(plan.evidenceRequired).toContain("debate-notes");
    expect(JSON.stringify(validatePipelinePlan(plan))).toBe(JSON.stringify([]));
  });

  test("builds a high friction pipeline plan", () => {
    const plan = buildPipelinePlan("high");
    expect(plan.friction).toBe("high");
    expect(JSON.stringify(plan.stages.map((item) => item.id))).toBe(JSON.stringify(["classification", "deep-interview", "pm-debate", "synthesizer", "cso-qa"]));
    expect(plan.stages.find((item) => item.id === "deep-interview")?.depth).toBe("deep");
    expect(JSON.stringify(plan.approvalGates)).toBe(JSON.stringify(["pm-debate", "cso-qa"]));
    expect(plan.evidenceRequired).toContain("security-review");
    expect(JSON.stringify(validatePipelinePlan(plan))).toBe(JSON.stringify([]));
  });

  test("fails closed for forbidden side effects", () => {
    const plan = buildPipelinePlan("high");
    const unsafe: PipelinePlan = {
      ...plan,
      stages: plan.stages.map((item) => item.id === "cso-qa" ? { ...item, allowedSideEffects: ["none", "external-launch"] } : item)
    };
    const issues = validatePipelinePlan(unsafe);
    expect(issues.some((item) => item.id === "pipeline.sideEffect.forbidden" && item.stageId === "cso-qa")).toBe(true);
  });
});

describe("harness quality scorecard", () => {
  test("scores the root Boulder harness as ready", async () => {
    const root = join(import.meta.dir, "..");
    const manifest = await loadManifest(root);
    const scorecard = scoreManifest(manifest);
    expect(scorecard.score).toBe(100);
    expect(scorecard.rating).toBe("ready");
    expect(scorecard.criteria.some((item) => item.id === "operator-workflow-stack" && item.status === "pass")).toBe(true);
  });

  test("scores an approval-gated harness as ready", () => {
    const manifest = defaultManifest("fixture");
    manifest.verification = [{ name: "smoke", command: "bun test", required: true }];
    const scorecard = scoreManifest(manifest);
    expect(scorecard.score).toBeGreaterThan(84);
    expect(scorecard.rating).toBe("ready");
    expect(scorecard.criteria.some((item) => item.id === "provider-policy" && item.status === "pass")).toBe(true);
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
    expect(markdown).toContain("fail");
  });
});

describe("benchmark fixtures", () => {
  test("loads root benchmark fixtures and rates them ready", async () => {
    const root = join(import.meta.dir, "..");
    const fixtures = await loadBenchmarkFixtures(root);
    const report = evaluateBenchmarkFixtures(fixtures);
    expect(fixtures.length).toBe(3);
    expect(report.readyCount).toBe(3);
    expect(report.results.every((item) => item.rating === "ready")).toBe(true);
  });

  test("benchmark report avoids runtime leaderboard claims", async () => {
    const root = join(import.meta.dir, "..");
    const fixtures = await loadBenchmarkFixtures(root);
    const report = evaluateBenchmarkFixtures(fixtures);
    const markdown = benchmarkReportToMarkdown(report);
    expect(markdown).toContain("not a runtime speed benchmark");
    expect(markdown).toContain("benchmark-leadership");
  });
});

describe("release plan", () => {
  test("rates the root release plan as ready", async () => {
    const root = join(import.meta.dir, "..");
    const plan = await evaluateReleasePlan(root);
    expect(plan.status).toBe("ready");
    expect(plan.checks.every((item) => item.status === "pass")).toBe(true);
    expect(plan.checks.some((item) => item.id === "pipeline-planning-evidence" && item.status === "pass")).toBe(true);
  });

  test("release plan report keeps publish manual", async () => {
    const root = join(import.meta.dir, "..");
    const plan = await evaluateReleasePlan(root);
    const markdown = releasePlanToMarkdown(plan);
    expect(markdown).toContain("Publishing remains manual");
    expect(markdown).toContain("npm publish is not automated");
  });
});

describe("quickstart guided flow", () => {
  test("summarizes the next first-run commands for a repository", async () => {
    const root = await tempRepo();
    await initHarness(root);

    const quickstart = await evaluateQuickstart(root);
    const markdown = quickstartToMarkdown(quickstart);

    expect(quickstart.status).toBe("ready");
    expect(quickstart.steps.map((item) => item.command)).toContain("boulder inspect --cwd . --json");
    expect(quickstart.steps.map((item) => item.command)).toContain("boulder service-readiness --cwd . --json");
    expect(markdown).toContain("# Boulder Quickstart");
    expect(markdown).toContain("first-run guided flow");
  });
});

describe("release check", () => {
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

describe("product readiness", () => {
  test("reports root product readiness evidence gates", async () => {
    const root = join(import.meta.dir, "..");
    const readiness = await evaluateProductReadiness(root);
    const markdown = productReadinessToMarkdown(readiness);

    expect(readiness.checks.some((item) => item.id === "codex-oss-application-packet")).toBe(true);
    expect(readiness.checks.some((item) => item.id === "gjc-plan-evidence")).toBe(true);
    expect(readiness.checks.some((item) => item.id === "lazycodex-implementation-evidence")).toBe(true);
    expect(readiness.checks.some((item) => item.id === "boulder-verify-evidence")).toBe(true);
    expect(readiness.checks.some((item) => item.id === "trust-support-security-posture")).toBe(true);
    expect(readiness.checks.some((item) => item.id === "final-audit")).toBe(true);
    expect(readiness.checks.some((item) => item.id === "clean-release-tree")).toBe(true);
    expect(readiness.checks.some((item) => item.id === "published-install-smoke" && item.status === "pass")).toBe(true);
    expect(markdown).toContain("docs/CODEX_OSS_APPLICATION_PACKET.md");
    expect(markdown).toContain("docs/CASE_STUDIES/evidence/core-implementation/gjc-plan.md");
    expect(markdown).toContain("docs/TRUST_SUPPORT_SECURITY.md");
    expect(markdown).toContain("docs/CODEX_OSS_FINAL_AUDIT.md");
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
});

describe("checked-in example harnesses", () => {
  const examples = [
    ["typescript-library", "bun run test"],
    ["python-package", "python -m pip check"],
    ["mcp-server", "bun run typecheck"]
  ];

  for (const [name, command] of examples) {
    test(`${name} has generated Boulder outputs`, async () => {
      const root = join(import.meta.dir, "..", "examples", name);
      expect(await exists(join(root, "BOULDER.md"))).toBe(true);
      expect(await exists(join(root, "boulder.yaml"))).toBe(true);
      expect(await exists(join(root, "docs", "REPO_BRIEF.md"))).toBe(true);
      expect(await exists(join(root, "docs", "OPERATOR_WORKFLOW_STACK.md"))).toBe(true);
      expect(await exists(join(root, "docs", "VERIFICATION_REPORT.md"))).toBe(true);
      expect(await exists(join(root, "docs", "CODEX_WORKFLOW_NOTES.md"))).toBe(true);
      const manifest = await readFile(join(root, "boulder.yaml"), "utf8");
      expect(manifest).toContain(command);
      expect(manifest).toContain("workflowStack:");
      expect(manifest).toContain("name: superpowers");
      expect(manifest).toContain("name: gstack");
      expect(manifest).toContain("name: compound");
    });
  }
});
