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
  test("keeps planner benchmark validation fail-closed with globally ordered options", async () => {
    const root = await tempRepo();
    try {
      const missingRoots = await runBoulder(["plan", "benchmark", "--cwd", root, "--json"]);
      const missingTrustRootValue = await runBoulder(["plan", "benchmark", "--cwd", root, "--trust-root", "--study-root", "fixtures/planner-benchmarks/study-root.json", "--json"]);
      const missingStudyRoot = await runBoulder(["--json", "--cwd", root, "plan", "benchmark", "--trust-root", "fixtures/planner-benchmarks/trust-root.json"]);
      const missingTrustRoot = await runBoulder(["--json", "--cwd", root, "plan", "benchmark", "--study-root", "fixtures/planner-benchmarks/study-root.json"]);
      const human = await runBoulder(["plan", "benchmark", "--cwd", root]);
      const unknownOption = await runBoulder(["plan", "benchmark", "--cwd", root, "--bogus", "--json"]);
      const duplicateTrustRoot = await runBoulder(["plan", "benchmark", "--cwd", root, "--trust-root", "first.json", "--trust-root", "second.json", "--study-root", "study", "--json"]);
      const duplicateStudyRoot = await runBoulder(["plan", "benchmark", "--cwd", root, "--trust-root", "trust.json", "--study-root", "first-study", "--study-root", "second-study", "--json"]);

      for (const result of [missingRoots, missingStudyRoot, missingTrustRoot]) {
        const payload = JSON.parse(result.stdout);
        expect(result.exitCode).toBe(1);
        expect(payload.command).toBe("plan benchmark");
        expect(payload.status).toBe("blocked");
        expect(payload.report.decision).toBe("HOLD");
        expect(payload.issues[0].code).toBe("plan.benchmark.provenance_missing");
      }
      const missingValuePayload = JSON.parse(missingTrustRootValue.stdout);
      expect(missingTrustRootValue.exitCode).toBe(1);
      expect(missingValuePayload.issues[0].code).toBe("plan.benchmark.provenance_missing");
      expect(missingValuePayload.issues[0].path).toBe("--trust-root");
      expect(human.exitCode).toBe(1);
      expect(human.stdout).toContain("Planner benchmark: HOLD");
      for (const [result, path] of [[unknownOption, "--bogus"], [duplicateTrustRoot, "--trust-root"], [duplicateStudyRoot, "--study-root"]] as const) {
        const payload = JSON.parse(result.stdout);
        expect(result.exitCode).toBe(1);
        expect(payload.status).toBe("blocked");
        expect(payload.issues[0].code).toBe("plan.benchmark.provenance_missing");
        expect(payload.issues[0].path).toBe(path);
      }
    } finally {
      await removeTempRepo(root);
    }
  });

  test("resolves planner benchmark roots relative to the selected workspace", async () => {
    const root = await tempRepo();
    try {
      const fixture = await readFile(join(import.meta.dir, "..", "fixtures", "planner-benchmarks", "study-root.json"), "utf8");
      await mkdir(join(root, "fixtures", "planner-benchmarks"), { recursive: true });
      await writeFile(join(root, "trust-root.json"), "{}", "utf8");
      await writeFile(join(root, "fixtures", "planner-benchmarks", "study-root.json"), fixture, "utf8");

      const result = await runBoulder([
        "plan",
        "benchmark",
        "--cwd",
        root,
        "--trust-root",
        "./trust-root.json",
        "--study-root",
        "fixtures/./planner-benchmarks/../planner-benchmarks/study-root.json",
        "--json"
      ]);

      const payload = JSON.parse(result.stdout);
      expect(result.exitCode).toBe(1);
      expect(payload.issues).toEqual([]);
      expect(payload.report.reasons).toEqual(["field_study_not_performed"]);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("supports read-only plan analysis, show, and validation diagnostics", async () => {
    const root = await tempRepo();
    try {
      const analyzed = await runBoulder(["plan", "analyze", "--cwd", root, "--task", "Verify the public API with tests", "--json"]);
      const human = await runBoulder(["plan", "analyze", "--cwd", root, "--task", "Verify the public API with tests"]);
      const noArtifacts = await readFile(join(root, ".boulder", "plans", "analysis", "analysis.json"), "utf8").catch(() => null);
      const missingValue = await runBoulder(["plan", "analyze", "--cwd", root, "--task", "--json"]);
      const invalidSubcommand = await runBoulder(["plan", "start", "--cwd", root]);
      const unsafeRun = await runBoulder(["plan", "show", "--cwd", root, "--run-id", "../unsafe"]);
      const missingRun = await runBoulder(["plan", "show", "--cwd", root, "--run-id", "missing"]);

      expect(analyzed.exitCode).toBe(0);
      expect(JSON.parse(analyzed.stdout).analysis.schemaVersion).toBe("boulder.plan-analysis.v1");
      const direct = await runBoulder(["plan", "analyze", "--cwd", root, "--task", "Update src/example.ts with tests and verification", "--friction", "direct", "--json"]);
      const protectedTasks = [
        "Update .env.local with tests and verification",
        "Update secrets/key.txt with tests and verification",
        "Update ./vendor//pkg/./file.ts with tests and verification",
        "Update vendor\\pkg\\nested\\..\\file.ts with tests and verification"
      ];
      const protectedAnalyses = await Promise.all(protectedTasks.map(async (task) => {
        const result = await runBoulder(["plan", "analyze", "--cwd", root, "--task", task, "--friction", "direct", "--json"]);
        return JSON.parse(result.stdout).analysis;
      }));
      const config = await runBoulder(["plan", "analyze", "--cwd", root, "--task", "Update config validation with tests and verification", "--friction", "direct", "--json"]);
      const security = await runBoulder(["plan", "analyze", "--cwd", root, "--task", "Update security handling with tests and verification", "--friction", "direct", "--json"]);
      const collision = await runBoulder(["plan", "analyze", "--cwd", root, "--task", "Update docs/notsecrets/key.txt with tests and verification", "--friction", "direct", "--json"]);
      await writeFile(join(root, "boulder.yaml"), ["protectedPaths:", "  - contracts/**", ""].join("\n"), "utf8");
      const manifestProtected = await runBoulder(["plan", "analyze", "--cwd", root, "--task", "Update contracts/api.ts with tests and verification", "--friction", "direct", "--json"]);
      await writeFile(join(root, "boulder.yaml"), ["protectedPaths:", "  - package.json", ""].join("\n"), "utf8");
      const rootFileProtected = await runBoulder(["plan", "analyze", "--cwd", root, "--task", "Update package.json with tests and verification", "--friction", "direct", "--json"]);
      const manifestUnprotected = await runBoulder(["plan", "analyze", "--cwd", root, "--task", "Update .env.local with tests and verification", "--friction", "direct", "--json"]);
      await writeFile(join(root, "boulder.yaml"), ["protectedPaths: []", ""].join("\n"), "utf8");
      const manifestEmpty = await runBoulder(["plan", "analyze", "--cwd", root, "--task", "Update .env.local with tests and verification", "--friction", "direct", "--json"]);
      const directAnalysis = JSON.parse(direct.stdout).analysis;
      const configAnalysis = JSON.parse(config.stdout).analysis;
      const securityAnalysis = JSON.parse(security.stdout).analysis;
      const collisionAnalysis = JSON.parse(collision.stdout).analysis;
      const manifestProtectedAnalysis = JSON.parse(manifestProtected.stdout).analysis;
      const manifestUnprotectedAnalysis = JSON.parse(manifestUnprotected.stdout).analysis;
      const manifestEmptyAnalysis = JSON.parse(manifestEmpty.stdout).analysis;
      const rootFileProtectedAnalysis = JSON.parse(rootFileProtected.stdout).analysis;
      expect(directAnalysis.selectedMode).toBe("direct");
      expect(directAnalysis.hardOverrides).not.toContain("public-contract");
      for (const protectedAnalysis of protectedAnalyses) {
        expect(protectedAnalysis.selectedMode).toBe("focused");
        expect(protectedAnalysis.hardOverrides).toContain("public-contract");
      }
      expect(configAnalysis.selectedMode).toBe("focused");
      expect(configAnalysis.hardOverrides).toContain("public-contract");
      expect(securityAnalysis.selectedMode).toBe("deep");
      expect(securityAnalysis.hardOverrides).toContain("security-sensitive");
      expect(collisionAnalysis.selectedMode).toBe("direct");
      expect(collisionAnalysis.hardOverrides).not.toContain("public-contract");
      expect(manifestProtectedAnalysis.selectedMode).toBe("focused");
      expect(manifestProtectedAnalysis.hardOverrides).toContain("public-contract");
      expect(manifestUnprotectedAnalysis.selectedMode).toBe("direct");
      expect(manifestUnprotectedAnalysis.hardOverrides).not.toContain("public-contract");
      expect(manifestEmptyAnalysis.selectedMode).toBe("direct");
      expect(manifestEmptyAnalysis.hardOverrides).not.toContain("public-contract");
      expect(rootFileProtectedAnalysis.selectedMode).toBe("focused");
      expect(rootFileProtectedAnalysis.hardOverrides).toContain("public-contract");
      expect(human.stdout).toContain("# Plan Analysis");
      expect(noArtifacts).toBeNull();
      expect(missingValue.exitCode).toBe(1);
      expect(missingValue.stderr).toContain("ERROR plan.option.value_missing: --task requires a value.");
      expect(invalidSubcommand.exitCode).toBe(1);
      expect(invalidSubcommand.stderr).toContain("ERROR plan.command.invalid");
      expect(unsafeRun.exitCode).toBe(1);
      expect(unsafeRun.stderr).toContain("ERROR plan.path.invalid");
      expect(missingRun.exitCode).toBe(1);
      expect(missingRun.stderr).toContain("ERROR plan.artifact.missing");

      const analysis = JSON.parse(analyzed.stdout).analysis;
      await mkdir(join(root, ".boulder", "plans", "saved"), { recursive: true });
      await writeFile(join(root, ".boulder", "plans", "saved", "analysis.json"), JSON.stringify(analysis), "utf8");
      const valid = await runBoulder(["plan", "validate", "--cwd", root, "--run-id", "saved", "--artifact", "analysis", "--json"]);
      await writeFile(join(root, ".boulder", "plans", "saved", "analysis.json"), "{}", "utf8");
      const invalid = await runBoulder(["plan", "validate", "--cwd", root, "--run-id", "saved", "--artifact", "analysis", "--json"]);

      expect(valid.exitCode).toBe(0);
      expect(JSON.parse(valid.stdout).status).toBe("ready");
      expect(invalid.exitCode).toBe(1);
      expect(JSON.parse(invalid.stdout).status).toBe("blocked");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("renders release-check ready evidence after publishing", async () => {
    const root = join(import.meta.dir, "..");

    const result = await runBoulder(["release-check", "--cwd", root, "--json"]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(payload.version).toBe("0.1.17");
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
