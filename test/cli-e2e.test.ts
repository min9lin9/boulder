import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { removeTempRepo, runBoulder, runCommand, tempRepo } from "./helpers/cli";

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
});
