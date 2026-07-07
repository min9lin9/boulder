import { symlink } from "node:fs/promises";
import { exec } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { evaluateProductReadiness } from "../src/product-readiness";
import { tempRepo, write } from "./helpers/cli";

async function writeReadyPublicProductFixture(root: string): Promise<void> {
  const version = "1.2.3";
  await write(root, "package.json", JSON.stringify({ name: "fixture", version }, null, 2));
  await write(root, "CHANGELOG.md", `# Changelog\n\n## ${version}\n\n- Fixture release.\n`);
  await write(root, "README.md", `# Fixture\n\nboulder-oss-cli@${version}\n`);
  await write(root, "docs/RELEASE_WORKFLOW.md", "npm publish\nGitHub Release\ntag\n");
  await write(root, "docs/CODEX_OSS_APPLICATION_PACKET.md", "pull request review\nmaintainer automation\nrelease workflow\ncore OSS work\nDoes not claim\nOpenAI acceptance\nruntime scale\n");
  await write(root, "docs/CASE_STUDIES/README.md", "https://github.com/min9lin9/boulder\nexternally inspectable public repo\n");
  await write(root, "docs/CASE_STUDIES/pr-review.md", "# PR review\n");
  await write(root, "docs/CASE_STUDIES/release-workflow.md", "# Release workflow\n");
  await write(root, "docs/CASE_STUDIES/core-implementation.md", "# Core implementation\n");
  await write(root, "docs/CASE_STUDIES/evidence/core-implementation/gjc-plan.md", "GJC Plan\nAccepted Scope\nRejected Scope Creep\n");
  await write(root, "docs/CASE_STUDIES/evidence/core-implementation/lazycodex-implementation-summary.md", "LazyCodex\nValidation Contract\nBoulder verify\n");
  await write(root, "docs/CASE_STUDIES/evidence/pr-review/BOULDER_EXPORT.md", "# Export\n");
  await write(root, "docs/CASE_STUDIES/evidence/core-implementation/BOULDER_EXPORT.md", "# Export\n");
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/ci.txt", "bun run ci\n35 pass\n");
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", "https://github.com/min9lin9/boulder/actions/runs/27290627860\nCI\nsuccess\n");
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", `bunx boulder-oss-cli --help\nboulder-oss-cli\n${version}\nPublished version: ${version}\nResult: success\nUsage:\nexit: 0\n`);
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt", "boulder-oss-cli\nTotal files\n");
  await write(root, "docs/TRUST_SUPPORT_SECURITY.md", "Support channels\nSecurity policy\nResponsible disclosure\nNo credential access\nRollback\n");
  await write(root, "docs/CODEX_OSS_FINAL_AUDIT.md", "Local readiness\nPublic product readiness\nDoes Not Claim\nBlocked Below 9.0\nOpenAI acceptance\n");
  await write(root, ".github/workflows/ci.yml", "name: CI\non: [push, pull_request]\njobs:\n  smoke:\n    steps:\n      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: \"1.3.14\"\n      - run: bun run ci\n");
  await write(root, ".github/ISSUE_TEMPLATE/bug_report.yml", "name: Bug report\n");
  await write(root, ".github/ISSUE_TEMPLATE/feature_request.yml", "name: Feature request\n");
  await write(root, ".github/ISSUE_TEMPLATE/ai_contribution.yml", "name: AI-assisted contribution\n");
  await write(root, ".github/ISSUE_TEMPLATE/documentation.yml", "name: Documentation\n");
  await write(root, "SECURITY.md", "Responsible disclosure\n");
  await write(root, "fixtures/handoffs/low.json", "{\"gjcPlan\":true,\"lazycodexResult\":true,\"acceptanceCriteria\":[]}\n");
  await write(root, "fixtures/handoffs/medium.json", "{\"gjcPlan\":true,\"lazycodexResult\":true,\"acceptanceCriteria\":[]}\n");
  await write(root, "fixtures/handoffs/high.json", "{\"gjcPlan\":true,\"lazycodexResult\":true,\"acceptanceCriteria\":[]}\n");
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "fixture@example.com"]);
  await git(root, ["config", "user.name", "Fixture"]);
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "fixture"]);
  await git(root, ["tag", `v${version}`]);
  const releaseCommit = await gitOutput(root, ["rev-parse", "HEAD"]);
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", `https://github.com/min9lin9/boulder/actions/runs/27290627860\nCI\nsuccess\nCommit: ${releaseCommit}\n`);
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json", JSON.stringify({
    schemaVersion: 1,
    packageName: "boulder-oss-cli",
    packageJsonVersion: version,
    cliVersion: version,
    tag: `v${version}`,
    tagCommit: releaseCommit,
    releaseCommit,
    publishedVersion: version,
    installSmoke: {
      command: `bunx boulder-oss-cli@${version} --version`,
      exitCode: 0,
      generatedAt: "2026-07-07"
    },
    githubActions: {
      runUrl: "https://github.com/min9lin9/boulder/actions/runs/27290627860"
    },
    packDryRun: {
      fileCount: 10,
      packageVersion: version
    },
    limitations: []
  }));
}

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    exec(`git ${args.join(" ")}`, { cwd }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function gitOutput(cwd: string, args: readonly string[]): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    exec(`git ${args.join(" ")}`, { cwd }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}

describe("tight product readiness", () => {
  test("rates a public evidence fixture as ready", async () => {
    const root = await tempRepo("boulder-product-readiness-");
    await writeReadyPublicProductFixture(root);

    const readiness = await evaluateProductReadiness(root);

    expect(readiness.status).toBe("ready");
    expect(readiness.checks.every((item) => item.status === "pass")).toBe(true);
  });

  test("blocks when published install smoke evidence is missing", async () => {
    const root = await tempRepo("boulder-product-readiness-");
    await writeReadyPublicProductFixture(root);
    await write(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", "manual publish pending\n");

    const readiness = await evaluateProductReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "published-install-smoke" && item.status === "fail")).toBe(true);
  });

  test("blocks when release tag or published install evidence does not match package version", async () => {
    const root = await tempRepo("boulder-product-readiness-");
    await writeReadyPublicProductFixture(root);
    await write(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", "bunx boulder-oss-cli --help\nboulder-oss-cli\n1.2.3\nPublished version: 0.0.0\nResult: success\nUsage:\nexit: 0\n");

    const readiness = await evaluateProductReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "public-release-check" && item.status === "fail")).toBe(true);
    expect(readiness.checks.some((item) => item.evidence.includes("published-version-evidence"))).toBe(true);
  });

  test("blocks duplicate copy artifacts in the release tree", async () => {
    const root = await tempRepo("boulder-product-readiness-");
    await writeReadyPublicProductFixture(root);
    await write(root, "src/pipeline 2.ts", "export const duplicate = true;\n");

    const readiness = await evaluateProductReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "clean-release-tree" && item.status === "fail")).toBe(true);
  });

  test("ignores broken local codegraph symlinks during release tree scan", async () => {
    const root = await tempRepo("boulder-product-readiness-");
    await writeReadyPublicProductFixture(root);
    await symlink(join(root, "missing-codegraph-target"), join(root, ".codegraph"));

    const readiness = await evaluateProductReadiness(root);

    expect(readiness.status).toBe("ready");
    expect(readiness.checks.some((item) => item.id === "clean-release-tree" && item.status === "pass")).toBe(true);
  });
});
