import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { exists } from "../src/fs";
import { defaultManifest, loadManifest } from "../src/manifest";
import { evaluateProductReadiness, productReadinessToMarkdown } from "../src/product-readiness";
import { scorecardToMarkdown, scoreManifest } from "../src/scorecard";
import { initHarness } from "../src/workflows";
import { removeTempRepo, tempRepo } from "./helpers/cli";

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
    try {
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
    } finally {
      await removeTempRepo(root);
    }
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
