// allow: SIZE_OK - readiness regression suite keeps cross-gate fixture assertions together; split when adding a new readiness domain.
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
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
import { runCommand, tempRepo, write } from "./helpers/cli";

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

  test("reports root release evidence as ready after 0.1.16 is published and tagged", async () => {
    const root = join(import.meta.dir, "..");
    const report = await evaluateReleaseCheck(root);
    const markdown = releaseCheckToMarkdown(report);

    expect(report.version).toBe("0.1.16");
    expect(report.status).toBe("ready");
    expect(report.checks.every((item) => item.status === "pass")).toBe(true);
    expect(report.checks.some((item) => item.id === "published-version-evidence")).toBe(true);
    expect(report.checks.some((item) => item.id === "git-tag-local")).toBe(true);
    expect(report.checks.some((item) => item.id === "release-evidence-manifest")).toBe(true);
    expect(report.nextCommands).toEqual([]);
    expect(markdown).toContain("Status: ready");
    expect(markdown).not.toContain("npm publish --access public");
    expect(markdown).not.toContain("git tag v");
    expect(markdown).not.toContain("gh release create");
  });

  test("reports release evidence as ready after publish and tag in a release fixture", async () => {
    const root = await tempRepo();
    await write(root, "package.json", JSON.stringify(releasePackageJson("1.2.3")));
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
  });

  test("blocks forged releaseCommit in archive-style release evidence", async () => {
    const root = await tempRepo();
    const releaseCommit = "1111111111111111111111111111111111111111";
    await write(root, "package.json", JSON.stringify(releasePackageJson("1.2.3")));
    await write(root, "docs/RELEASE_WORKFLOW.md", "npm publish\nGitHub Release\ntag\n");
    await write(root, ".github/workflows/ci.yml", 'bun-version: "1.3.14"\n');
    await write(root, "CHANGELOG.md", "## 1.2.3\n");
    await write(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", "bunx boulder-oss-cli\n1.2.3\nPublished version: 1.2.3\n");
    await write(root, "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", `CI\nCommit: ${releaseCommit}\n`);
    await write(root, "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt", "boulder-oss-cli\nTotal files\n");
    await write(root, "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json", JSON.stringify({
      schemaVersion: 1,
      packageName: "boulder-oss-cli",
      packageJsonVersion: "1.2.3",
      cliVersion: "1.2.3",
      tag: "v1.2.3",
      tagCommit: releaseCommit,
      releaseCommit: "2222222222222222222222222222222222222222",
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
    const manifest = report.checks.find((item) => item.id === "release-evidence-manifest");

    expect(report.status).toBe("blocked");
    expect(manifest?.status).toBe("fail");
    expect(manifest?.evidence).toContain("releaseCommit must match HEAD or the documented GitHub Actions commit");
  });

  test("blocks archive releaseCommit without documented GitHub Actions commit evidence", async () => {
    const root = await tempRepo();
    const releaseCommit = "1111111111111111111111111111111111111111";
    await write(root, "package.json", JSON.stringify(releasePackageJson("1.2.3")));
    await write(root, "docs/RELEASE_WORKFLOW.md", "npm publish\nGitHub Release\ntag\n");
    await write(root, ".github/workflows/ci.yml", 'bun-version: "1.3.14"\n');
    await write(root, "CHANGELOG.md", "## 1.2.3\n");
    await write(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", "bunx boulder-oss-cli\n1.2.3\nPublished version: 1.2.3\n");
    await write(root, "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", "CI\nResult: success\n");
    await write(root, "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt", "boulder-oss-cli\nTotal files\n");
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
    const manifest = report.checks.find((item) => item.id === "release-evidence-manifest");

    expect(report.status).toBe("blocked");
    expect(manifest?.status).toBe("fail");
    expect(manifest?.evidence).toContain("releaseCommit requires local HEAD or documented GitHub Actions commit evidence");
  });

  test("reports blocker-first release next commands without publish automation", async () => {
    const root = await tempRepo();
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", version: "1.2.3" }), "utf8");

    const report = await evaluateReleaseCheck(root);

    expect(report.status).toBe("blocked");
    expect(report.nextCommands.length).toBeGreaterThan(0);
    expect(report.nextCommands.join("\n")).toContain("Update docs/RELEASE_WORKFLOW.md");
    expect(report.nextCommands.join("\n")).not.toContain("npm publish --access public");
    expect(report.nextCommands.join("\n")).not.toContain("git tag v");
    expect(report.nextCommands.join("\n")).not.toContain("gh release create");
  });

  test("blocks malformed structured release evidence manifests", async () => {
    const root = await tempRepo();
    await write(root, "package.json", JSON.stringify(releasePackageJson("1.2.3")));
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
  });
});

describe("quickstart and replay reports", () => {
  test("summarizes the next first-run commands for a repository", async () => {
    const root = await tempRepo();
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

describe("readiness wording hygiene", () => {
  test("service strategy separates local readiness from external field backing", async () => {
    const root = join(import.meta.dir, "..");
    const review = await readFile(join(root, "docs", "SERVICE_STRATEGY_REVIEW.md"), "utf8");

    expect(review).toContain("Current executable gate");
    expect(review).toContain("Boulder is `ready` for the local CLI service workflow");
    expect(review).toContain("External adoption evidence: not field-backed");
    expect(review).not.toContain("product-readiness remains blocked");
    expect(review).not.toContain("Boulder is `pilot-ready` as a service workflow foundation");
  });
});

describe("repeat-use evidence hygiene", () => {
  test("ships a metric log template with the required field contract", async () => {
    const root = join(import.meta.dir, "..");
    const raw = await readFile(join(root, "fixtures/service-readiness/metric-log-template.json"), "utf8");
    const keys = Object.keys(JSON.parse(raw) as Record<string, unknown>);

    expect(keys.sort()).toEqual([
      "actorType",
      "boulderVersion",
      "commands",
      "completedAt",
      "limitations",
      "publicEvidenceUrl",
      "readinessAfter",
      "readinessBefore",
      "readinessDelta",
      "runId",
      "shareSafe",
      "startedAt",
      "targetRepo"
    ].sort());
  });

  test("keeps public evidence free of local paths and npm identity traces", async () => {
    const root = join(import.meta.dir, "..");
    const paths = await packageSurfaceFiles(root);
    const blocked = /\/Users\/|\/private\/tmp\/|file:\/|npm owner ls|npm whoami|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const leaks: string[] = [];

    for (const path of paths) {
      const content = await readFile(path, "utf8");
      if (blocked.test(content)) {
        leaks.push(path);
      }
    }

    expect(leaks).toEqual([]);
  });
});

async function packageSurfaceFiles(root: string): Promise<readonly string[]> {
  return [
    join(root, "README.md"),
    join(root, "CHANGELOG.md"),
    join(root, "CONTRIBUTING.md"),
    join(root, "SECURITY.md"),
    ...(await recursiveFiles(join(root, "docs"))),
    ...(await recursiveFiles(join(root, "fixtures")))
  ].filter((path) => /\.(md|json|txt|ya?ml)$/.test(path)
    && !/SESSION_SUMMARY/.test(path)
    && !/NEXT_.*GAP.*PLAN/.test(path));
}

async function recursiveFiles(root: string): Promise<readonly string[]> {
  const entries = await readdir(root);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry);
    if ((await stat(path)).isDirectory()) files.push(...await recursiveFiles(path));
    else files.push(path);
  }
  return files;
}

function releasePackageJson(version: string): Record<string, unknown> {
  return {
    name: "boulder-oss-cli",
    version,
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/min9lin9/boulder.git"
    },
    homepage: "https://github.com/min9lin9/boulder#readme",
    bugs: {
      url: "https://github.com/min9lin9/boulder/issues"
    }
  };
}
