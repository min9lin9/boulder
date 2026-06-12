import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { evaluateProductReadiness } from "../src/product-readiness";

async function tempRepo(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "boulder-product-readiness-"));
}

async function write(root: string, path: string, content: string): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function writeReadyPublicProductFixture(root: string): Promise<void> {
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
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", "bunx boulder-oss-cli --help\nboulder-oss-cli\n");
  await write(root, "docs/TRUST_SUPPORT_SECURITY.md", "Support channels\nSecurity policy\nResponsible disclosure\nNo credential access\nRollback\n");
  await write(root, "docs/CODEX_OSS_FINAL_AUDIT.md", "Local readiness\nPublic product readiness\nDoes Not Claim\nBlocked Below 9.0\nOpenAI acceptance\n");
  await write(root, ".github/workflows/ci.yml", "name: CI\non: [push, pull_request]\njobs:\n  smoke:\n    steps:\n      - run: bun run ci\n");
  await write(root, ".github/ISSUE_TEMPLATE/bug_report.md", "# Bug\n");
  await write(root, ".github/ISSUE_TEMPLATE/support_request.md", "# Support\n");
  await write(root, ".github/ISSUE_TEMPLATE/case_study.md", "# Case Study\n");
  await write(root, "SECURITY.md", "Responsible disclosure\n");
  await write(root, "fixtures/handoffs/low.json", "{\"gjcPlan\":true,\"lazycodexResult\":true,\"acceptanceCriteria\":[]}\n");
  await write(root, "fixtures/handoffs/medium.json", "{\"gjcPlan\":true,\"lazycodexResult\":true,\"acceptanceCriteria\":[]}\n");
  await write(root, "fixtures/handoffs/high.json", "{\"gjcPlan\":true,\"lazycodexResult\":true,\"acceptanceCriteria\":[]}\n");
}

describe("tight product readiness", () => {
  test("rates a public evidence fixture as ready", async () => {
    const root = await tempRepo();
    await writeReadyPublicProductFixture(root);

    const readiness = await evaluateProductReadiness(root);

    expect(readiness.status).toBe("ready");
    expect(readiness.checks.every((item) => item.status === "pass")).toBe(true);
  });

  test("blocks when published install smoke evidence is missing", async () => {
    const root = await tempRepo();
    await writeReadyPublicProductFixture(root);
    await write(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", "manual publish pending\n");

    const readiness = await evaluateProductReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "published-install-smoke" && item.status === "fail")).toBe(true);
  });

  test("blocks duplicate copy artifacts in the release tree", async () => {
    const root = await tempRepo();
    await writeReadyPublicProductFixture(root);
    await write(root, "src/pipeline 2.ts", "export const duplicate = true;\n");

    const readiness = await evaluateProductReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "clean-release-tree" && item.status === "fail")).toBe(true);
  });
});
