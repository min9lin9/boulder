import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { exists } from "../src/fs";
import { exportHarness } from "../src/export";
import { inspectRepo } from "../src/inspect";
import { defaultManifest } from "../src/manifest";
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
    const boulder = await readFile(join(root, "BOULDER.md"), "utf8");
    expect(boulder).toContain("## Operator Contract");
    expect(boulder).toContain("Record command evidence before claims.");
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
      expect(await exists(join(root, "docs", "VERIFICATION_REPORT.md"))).toBe(true);
      expect(await exists(join(root, "docs", "CODEX_WORKFLOW_NOTES.md"))).toBe(true);
      const manifest = await readFile(join(root, "boulder.yaml"), "utf8");
      expect(manifest).toContain(command);
    });
  }
});
