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
