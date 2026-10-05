import { exec } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { exists } from "../src/fs";
import { exportHarness } from "../src/export";
import { inspectRepo } from "../src/inspect";
import { defaultManifest, loadManifest } from "../src/manifest";
import { validateManifest } from "../src/validation";
import { initHarness } from "../src/workflows";
import { verifyHarness } from "../src/verify";

async function tempRepo(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "boulder-test-"));
}

async function runBoulder(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const command = ["bun", "bin/boulder.ts", ...args.map(shellQuote)].join(" ");
  return await new Promise((resolveRun) => {
    exec(command, { cwd: join(import.meta.dir, ".."), timeout: 5000 }, (error, stdout, stderr) => {
      const failure = error as { code?: number } | null;
      resolveRun({ exitCode: failure?.code ?? 0, stdout, stderr });
    });
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
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

  test("manifest validation accepts supported executor modes", () => {
    const base = defaultManifest("fixture");
    const manifest = {
      ...base,
      executors: {
        planning: { ...base.executors.planning, mode: "packet-only" as const },
        execution: { ...base.executors.execution, mode: "approval-gated-send" as const },
        fallback: base.executors.fallback
      }
    };

    const issues = validateManifest(manifest);

    expect(issues.some((item) => item.path.startsWith("executors.") && item.severity === "error")).toBe(false);
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

describe("operator workflow pipeline", () => {
  test("workflow command renders high friction operator pipeline", async () => {
    const result = await runBoulder(["workflow", "--friction", "high"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Boulder pipeline plan");
    expect(result.stdout).toContain("- friction: high");
    expect(result.stdout).toContain("stage: deep-interview");
    expect(result.stdout).toContain("stage: pm-debate");
    expect(result.stdout).toContain("stage: cso-qa");
  });

  test("workflow command renders the medium plan by default", async () => {
    const result = await runBoulder(["workflow"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("- friction: medium");
    expect(result.stdout).not.toContain("stage: cso-qa");
  });

  test("workflow command returns JSON catalog", async () => {
    const result = await runBoulder(["workflow", "--json"]);
    const parsed = JSON.parse(result.stdout) as { pipelines: Array<{ friction: string }> };

    expect(result.exitCode).toBe(0);
    expect(parsed.pipelines.map((item) => item.friction).join(",")).toBe("low,medium,high");
  });

  test("workflow command returns a single plan as JSON with --friction", async () => {
    const result = await runBoulder(["workflow", "--friction", "low", "--json"]);
    const parsed = JSON.parse(result.stdout) as { friction: string; stages: Array<{ id: string }> };

    expect(result.exitCode).toBe(0);
    expect(parsed.friction).toBe("low");
    expect(parsed.stages.map((stage) => stage.id).join(",")).toBe("classification,synthesizer");
  });

  test("workflow command rejects unknown friction", async () => {
    const result = await runBoulder(["workflow", "--friction", "impossible"]);

    expect(result.exitCode).toBeGreaterThan(0);
    expect(result.stderr).toContain("Unsupported friction level");
    expect(result.stdout).toBe("");
  });

  test("workflow command rejects missing friction value", async () => {
    const result = await runBoulder(["workflow", "--friction"]);

    expect(result.exitCode).toBeGreaterThan(0);
    expect(result.stderr).toContain("Missing friction value");
    expect(result.stdout).toBe("");
  });

  test("help lists workflow command without dropping export", async () => {
    const result = await runBoulder(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("boulder export");
    expect(result.stdout).toContain("boulder workflow");
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
