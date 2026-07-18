import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

describe("boulder CLI e2e cleanup safety", () => {
  test("renders release-check ready JSON without publishing", async () => {
    const root = join(import.meta.dir, "..");

    const result = await runBoulder(["release-check", "--cwd", root, "--json"]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(payload.version).toBe("0.1.16");
    expect(payload.status).toBe("ready");
    expect(payload.checks.some((item: { id: string; status: string }) => item.id === "release-workflow-doc" && item.status === "pass")).toBe(true);
    expect(payload.checks.some((item: { id: string; status: string }) => item.id === "published-version-evidence" && item.status === "pass")).toBe(true);
    expect(payload.checks.some((item: { id: string; status: string }) => item.id === "git-tag-local" && item.status === "pass")).toBe(true);
    expect(payload.nextCommands).toEqual([]);
  });

  test("renders replay-check fixture evidence", async () => {
    const root = join(import.meta.dir, "..");

    const result = await runBoulder(["replay-check", "--cwd", root, "--json"]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(payload.status).toBe("ready");
    expect(payload.projects.some((item: { project: string; status: string }) => item.project === "gajae-code" && item.status === "pass")).toBe(true);
  });

  test("renders replay-run dry-run plan", async () => {
    const root = join(import.meta.dir, "..");

    const result = await runBoulder(["replay-run", "--cwd", root, "--dry-run", "--json"]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(payload.status).toBe("ready");
    expect(payload.projects.every((item: { dryRunOnly: boolean }) => item.dryRunOnly)).toBe(true);
  });

  test("preserves root release-plan and initialized export surface", async () => {
    // Given
    const root = join(import.meta.dir, "..");
    const target = await tempRepo();
    try {
      await runBoulder(["init", "--cwd", target]);

      // When
      const releasePlan = await runBoulder(["release-plan", "--cwd", root, "--json"]);
      const exported = await runBoulder(["export", "--cwd", target, "--force"]);

      // Then
      expect(releasePlan.exitCode).toBe(0);
      expect(exported.exitCode).toBe(0);
      expect(releasePlan.stdout).toContain('"status": "ready"');
      expect(exported.stdout).toContain("Boulder export complete");
    } finally {
      await removeTempRepo(target);
    }
  });

  test("renders capability doctor json for installed Codex tools", async () => {
    const root = await tempRepo();
    try {
      await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
        skills: [{ id: "omo:ulw-plan", status: "installed" }],
        mcpServers: [{ id: "lennys-podcast-mcp", status: "available", officialDocsUrl: "https://github.com/example/lennys-podcast-mcp#readme" }],
        plugins: [{ id: "superpowers", status: "installed" }],
        runtimes: [{ id: "bun", version: "1.3.14" }]
      }));

      const result = await runBoulder(["doctor", "--cwd", root, "--json"]);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.status).toBe("warn");
      expect(payload.capabilities.some((item: { id: string; lane: string }) => item.id === "omo:ulw-plan" && item.lane === "plan")).toBe(true);
      expect(payload.capabilities.some((item: { id: string; kind: string; status: string }) => item.id === "gajae-code" && item.kind === "adapter" && item.status === "configured-unverified")).toBe(true);
      expect(payload.capabilities.some((item: { id: string; kind: string; status: string }) => item.id === "lazycodex" && item.kind === "adapter" && item.status === "configured-unverified")).toBe(true);
      expect(payload.issues.some((item: { id: string }) => item.id === "gajae-code-bun-runtime")).toBe(false);
      expect(payload.issues.some((item: { id: string }) => item.id === "gajae-code-adapter-unverified")).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("renders active profile in human capability doctor output", async () => {
    const root = await tempRepo();
    try {
      await write(root, ".boulder/current-profile", "research-default\n");
      await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
        skills: [{ id: "codex", status: "available" }],
        mcpServers: [],
        plugins: [],
        runtimes: [{ id: "bun", version: "1.3.14" }]
      }));

      const result = await runBoulder(["doctor", "--cwd", root]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("active-profile: research-default (project-current; research)");
      expect(result.stdout).toContain("external-default: blocked");
      expect(result.stdout).toContain("external-approval-required: true");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("records field-readiness evidence through the CLI", async () => {
    const root = await tempRepo();
    const evidencePath = "evidence/field-readiness/oss-run-1";
    try {
      await write(root, `${evidencePath}/activation-transcript.txt`, "boulder inspect\nboulder service-readiness\n");
      await write(root, `${evidencePath}/first-readiness.json`, "{\"status\":\"pilot-ready\"}\n");
      await write(root, `${evidencePath}/second-readiness-delta.json`, "{\"changedRecommendations\":[\"add public evidence link\"]}\n");
      await write(root, `${evidencePath}/share-safe-artifact-url.txt`, "https://github.com/min9lin9/boulder/pull/1\n");
      await write(root, `${evidencePath}/decision-log.json`, "{\"outcome\":\"request-changes\"}\n");
      await write(root, `${evidencePath}/official-docs-refresh.json`, "{\"officialDocsFirst\":true,\"docsUrls\":[\"https://github.com/min9lin9/boulder#readme\"]}\n");
      await write(root, `${evidencePath}/generated-metrics.json`, "{\"generatedFromEvidence\":true,\"metrics\":[\"time-to-first-readiness-delta\",\"readiness delta count\",\"public evidence link count\"]}\n");

      const result = await runBoulder(["record", "field-readiness", "--run-id", "oss-run-1", "--evidence", evidencePath, "--cwd", root, "--json"]);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.status).toBe("pass");
      expect(await readFile(join(root, evidencePath, "manifest.json"), "utf8")).toContain("\"runId\": \"oss-run-1\"");
    } finally {
      await removeTempRepo(root);
    }
  });
});
