import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { removeTempRepo, runBoulder, runCommand, tempRepo, write } from "./helpers/cli";

describe("boulder CLI e2e cleanup safety", () => {
  test("prints the package version", async () => {
    const root = join(import.meta.dir, "..");
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string };

    const result = await runBoulder(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
  });

  test("keeps duplicate copy artifacts out of package dry run", async () => {
    const root = join(import.meta.dir, "..");

    const result = await runCommand("bun pm pack --dry-run --ignore-scripts", root);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(0);
    expect(output).not.toMatch(/(?:^|\n).* 2\.(?:ts|md|json|js|tsx|mts|cts)(?:\n|$)/);
  });

  test("preserves full init-to-export happy path", async () => {
    // Given
    const root = await tempRepo();

    try {
      // When
      const init = await runBoulder(["init", "--cwd", root]);
      const validate = await runBoulder(["validate", "--cwd", root]);
      const scorecard = await runBoulder(["scorecard", "--cwd", root, "--json"]);
      const exported = await runBoulder(["export", "--cwd", root, "--force"]);

      // Then
      expect(init.exitCode).toBe(0);
      expect(validate.exitCode).toBe(0);
      expect(scorecard.exitCode).toBe(0);
      expect(exported.exitCode).toBe(0);
      expect(init.stdout).toContain("Boulder initialized\n- created: boulder.yaml");
      expect(init.stdout).toContain("- created: docs/REPO_BRIEF.md");
      expect(scorecard.stdout).toContain('"rating": "ready"');
      expect(exported.stdout).toContain(
        "Boulder export complete\n- created: docs/BOULDER_EXPORT.md\n- created: docs/CODEX_WORKFLOW_NOTES.md"
      );
    } finally {
      await removeTempRepo(root);
    }
  });

  test("renders first-run quickstart and onboard surfaces", async () => {
    const root = await tempRepo();
    try {
      await runBoulder(["init", "--cwd", root]);

      const quickstart = await runBoulder(["quickstart", "--cwd", root]);
      const onboard = await runBoulder(["onboard", "--cwd", root, "--json"]);
      const payload = JSON.parse(onboard.stdout);

      expect(quickstart.exitCode).toBe(0);
      expect(quickstart.stdout).toContain("# Boulder Quickstart");
      expect(quickstart.stdout).toContain("boulder service-readiness --cwd . --json");
      expect(onboard.exitCode).toBe(0);
      expect(payload.status).toBe("ready");
      expect(payload.steps.some((item: { command: string }) => item.command === "boulder inspect --cwd . --json")).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("renders release-check evidence without publishing", async () => {
    const root = join(import.meta.dir, "..");

    const result = await runBoulder(["release-check", "--cwd", root, "--json"]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(payload.status).toBe("blocked");
    expect(payload.checks.some((item: { id: string; status: string }) => item.id === "release-workflow-doc" && item.status === "pass")).toBe(true);
    expect(payload.checks.some((item: { id: string; status: string }) => item.id === "git-tag-local" && item.status === "fail")).toBe(true);
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

  test("rejects unsafe provider policy through validate command", async () => {
    // Given
    const root = await tempRepo();
    try {
      await runBoulder(["init", "--cwd", root]);
      await writeFile(
        join(root, "boulder.yaml"),
        [
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
        ].join("\n"),
        "utf8"
      );

      // When
      const result = await runBoulder(["validate", "--cwd", root]);

      // Then
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("External providers require approval gating.");
    } finally {
      await removeTempRepo(root);
    }
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
