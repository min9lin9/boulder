import { describe, expect, test } from "bun:test";
import { readinessEntriesForReport } from "../src/readiness-registry";
import { evaluateReleaseCheck } from "../src/release-check";
import { runCommand, tempRepo, write } from "./helpers/cli";

describe("release package metadata", () => {
  test("blocks missing repository url", async () => {
    const root = await readyReleaseFixture({
      name: "boulder-oss-cli",
      version: "1.2.3",
      license: "MIT",
      homepage: "https://github.com/min9lin9/boulder#readme",
      bugs: { url: "https://github.com/min9lin9/boulder/issues" }
    });

    const report = await evaluateReleaseCheck(root);
    const metadata = report.checks.find((check) => check.id === "package-metadata");
    const registry = readinessEntriesForReport("release-check").find((entry) => entry.id === "package-metadata");

    expect(report.status).toBe("blocked");
    expect(metadata?.status).toBe("fail");
    expect(metadata?.evidence).toContain("repository.url");
    expect(registry?.recoveryHintId).toBe("package.metadata_missing");
  });
});

async function readyReleaseFixture(packageJson: Record<string, unknown>): Promise<string> {
  const root = await tempRepo();
  await write(root, "package.json", JSON.stringify(packageJson, null, 2));
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
  return root;
}
