import { link, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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

  test("rejects unsafe generated root and docs write targets", async () => {
    const rootFile = await tempRepo();
    const manifestFile = await tempRepo();
    const docsDir = await tempRepo();
    const docsFile = await tempRepo();
    const hardlinkRoot = await tempRepo();
    const hardlinkDocs = await tempRepo();
    const symlinkRoot = await tempRepo();
    const external = await tempRepo();
    try {
      const rootAlias = join(symlinkRoot, "workspace-link");
      await symlink(external, rootAlias);
      const symlinkRootResult = await runBoulder(["init", "--cwd", rootAlias, "--force"]);
      expectPathInvalid(symlinkRootResult);
      await expect(readFile(join(external, "BOULDER.md"), "utf8")).rejects.toThrow("ENOENT");

      await write(external, "root.md", "original root\n");
      await symlink(join(external, "root.md"), join(rootFile, "BOULDER.md"));
      const rootResult = await runBoulder(["init", "--cwd", rootFile, "--force"]);
      expectPathInvalid(rootResult);
      expect(await readFile(join(external, "root.md"), "utf8")).toBe("original root\n");

      await write(external, "manifest.yaml", "name: original\n");
      await symlink(join(external, "manifest.yaml"), join(manifestFile, "boulder.yaml"));
      const manifestResult = await runBoulder(["init", "--cwd", manifestFile, "--force"]);
      expectPathInvalid(manifestResult);
      expect(await readFile(join(external, "manifest.yaml"), "utf8")).toBe("name: original\n");

      await mkdir(join(external, "docs-target"), { recursive: true });
      await symlink(join(external, "docs-target"), join(docsDir, "docs"));
      const docsDirResult = await runBoulder(["init", "--cwd", docsDir, "--force"]);
      expectPathInvalid(docsDirResult);

      await runBoulder(["init", "--cwd", docsFile]);
      await write(external, "repo-brief.md", "original brief\n");
      await rm(join(docsFile, "docs", "REPO_BRIEF.md"));
      await symlink(join(external, "repo-brief.md"), join(docsFile, "docs", "REPO_BRIEF.md"));
      const docsFileResult = await runBoulder(["inspect", "--cwd", docsFile]);
      expectPathInvalid(docsFileResult);
      expect(await readFile(join(external, "repo-brief.md"), "utf8")).toBe("original brief\n");

      await write(external, "hard-root.md", "hard root\n");
      await link(join(external, "hard-root.md"), join(hardlinkRoot, "BOULDER.md"));
      const hardRootResult = await runBoulder(["init", "--cwd", hardlinkRoot, "--force"]);
      expectPathInvalid(hardRootResult);
      expect(await readFile(join(external, "hard-root.md"), "utf8")).toBe("hard root\n");

      await runBoulder(["init", "--cwd", hardlinkDocs]);
      await write(external, "hard-doc.md", "hard doc\n");
      await rm(join(hardlinkDocs, "docs", "REPO_BRIEF.md"));
      await link(join(external, "hard-doc.md"), join(hardlinkDocs, "docs", "REPO_BRIEF.md"));
      const hardDocsResult = await runBoulder(["inspect", "--cwd", hardlinkDocs]);
      expectPathInvalid(hardDocsResult);
      expect(await readFile(join(external, "hard-doc.md"), "utf8")).toBe("hard doc\n");
    } finally {
      await removeTempRepo(rootFile);
      await removeTempRepo(manifestFile);
      await removeTempRepo(docsDir);
      await removeTempRepo(docsFile);
      await removeTempRepo(hardlinkRoot);
      await removeTempRepo(hardlinkDocs);
      await removeTempRepo(symlinkRoot);
      await removeTempRepo(external);
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
      expect(quickstart.stdout).toContain("boulder bootstrap interview --cwd . --task");
      expect(quickstart.stdout).toContain("boulder service-readiness --cwd . --json");
      expect(onboard.exitCode).toBe(0);
      expect(payload.status).toBe("ready");
      expect(payload.steps.some((item: { command: string }) => item.command === "boulder inspect --cwd . --json")).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("supports global options before root and subcommands", async () => {
    const root = await tempRepo();
    try {
      const init = await runBoulder(["--cwd", root, "init"]);
      const profileList = await runBoulder(["--cwd", root, "profile", "list"]);
      const profileResolve = await runBoulder(["--json", "--cwd", root, "profile", "resolve"]);
      const handoff = await runBoulder(["--cwd", root, "handoff", "packet", "--friction", "medium", "--include", "docs/REPO_BRIEF.md", "--json"]);
      const routine = await runBoulder(["--json", "--cwd", root, "routine", "capture", "--task", "weekly release notes", "--dry-run"]);
      const capability = await runBoulder([
        "--json",
        "--cwd",
        root,
        "capability",
        "import",
        "--from",
        "https://github.com/Yeachan-Heo/gajae-code",
        "--dry-run"
      ]);

      expect(init.exitCode).toBe(0);
      expect(profileList.exitCode).toBe(0);
      expect(profileList.stdout).toContain("programming-default");
      expect(profileResolve.exitCode).toBe(0);
      expect(JSON.parse(profileResolve.stdout).id).toBe("programming-default");
      expect(handoff.exitCode).toBe(0);
      expect(JSON.parse(handoff.stdout).schemaVersion).toBe("boulder.handoff.v1");
      expect(JSON.parse(handoff.stdout).contextSummary.detectedFiles).toContain("docs/REPO_BRIEF.md");
      expect(routine.exitCode).toBe(0);
      expect(JSON.parse(routine.stdout).routine.id).toBe("weekly-release-notes");
      expect(capability.exitCode).toBe(0);
      expect(JSON.parse(capability.stdout).manifest.capabilityId).toBe("gajae-code");
      expect(JSON.parse(capability.stdout).writes).toEqual([]);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("treats missing global value flags followed by another flag as absent", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["pipeline", "--cwd", root, "--friction", "--json"]);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(payload.activeProfile.id).toBe("programming-default");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("renders release-check blockers without publishing", async () => {
    const root = join(import.meta.dir, "..");

    const result = await runBoulder(["release-check", "--cwd", root, "--json"]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(payload.version).toBe("0.1.16");
    expect(payload.status).toBe("blocked");
    expect(payload.checks.some((item: { id: string; status: string }) => item.id === "release-workflow-doc" && item.status === "pass")).toBe(true);
    expect(payload.checks.some((item: { id: string; status: string }) => item.id === "published-version-evidence" && item.status === "fail")).toBe(true);
    expect(payload.checks.some((item: { id: string; status: string }) => item.id === "git-tag-local" && item.status === "fail")).toBe(true);
    expect(payload.nextCommands).toContain("Record local tag evidence for v0.1.16 after the release commit is ready.");
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

function expectPathInvalid(result: { readonly exitCode: number; readonly stderr: string }): void {
  expect(result.exitCode).toBe(1);
  expect(result.stderr.trim()).toBe("ERROR fs.path_invalid: Generated file path must stay inside the workspace without symlink or hardlink targets.");
}
