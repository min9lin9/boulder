import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./fs";
import { evaluateReleaseCheck } from "./release-check";

export type ProductReadinessCheck = {
  readonly id: string;
  readonly status: "pass" | "fail";
  readonly evidence: string;
};

export type ProductReadiness = {
  readonly status: "ready" | "blocked";
  readonly checks: readonly ProductReadinessCheck[];
  readonly nextSteps: readonly string[];
};

type ContentRequirement = {
  readonly path: string;
  readonly contains?: readonly string[];
};

const SKIPPED_SCAN_DIRECTORIES = new Set([".git", "node_modules", ".bun"]) as ReadonlySet<string>;

export async function evaluateProductReadiness(root: string): Promise<ProductReadiness> {
  const checks = [
    await cleanReleaseTreeCheck(root),
    await contentCheck(root, "codex-oss-application-packet", {
      path: "docs/CODEX_OSS_APPLICATION_PACKET.md",
      contains: ["pull request review", "maintainer automation", "release workflow", "core OSS work"]
    }),
    await contentCheck(root, "public-case-study-index", {
      path: "docs/CASE_STUDIES/README.md",
      contains: ["https://github.com/", "externally inspectable"]
    }),
    await allFilesCheck(root, "public-case-studies", [
      "docs/CASE_STUDIES/pr-review.md",
      "docs/CASE_STUDIES/release-workflow.md",
      "docs/CASE_STUDIES/core-implementation.md"
    ]),
    await contentCheck(root, "gjc-plan-evidence", {
      path: "docs/CASE_STUDIES/evidence/core-implementation/gjc-plan.md",
      contains: ["GJC Plan", "Accepted Scope", "Rejected Scope Creep"]
    }),
    await contentCheck(root, "lazycodex-implementation-evidence", {
      path: "docs/CASE_STUDIES/evidence/core-implementation/lazycodex-implementation-summary.md",
      contains: ["LazyCodex", "Validation Contract", "Boulder verify"]
    }),
    await allFilesCheck(root, "boulder-verify-evidence", [
      "docs/CASE_STUDIES/evidence/pr-review/BOULDER_EXPORT.md",
      "docs/CASE_STUDIES/evidence/core-implementation/BOULDER_EXPORT.md",
      "docs/CASE_STUDIES/evidence/release-workflow/ci.txt"
    ]),
    await contentCheck(root, "public-ci-workflow", {
      path: ".github/workflows/ci.yml",
      contains: ["pull_request", "push", "bun run ci"]
    }),
    await contentCheck(root, "public-ci-run-evidence", {
      path: "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt",
      contains: ["https://github.com/min9lin9/boulder/actions/runs/", "CI", "success"]
    }),
    await contentCheck(root, "published-install-smoke", {
      path: "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt",
      contains: ["bunx boulder-oss-cli --help", "boulder-oss-cli", "Result: success", "exit: 0", "Usage:"]
    }),
    await publicReleaseCheck(root),
    await contentCheck(root, "limitations-explicit", {
      path: "docs/CODEX_OSS_APPLICATION_PACKET.md",
      contains: ["Does not claim", "OpenAI acceptance", "runtime scale"]
    }),
    await contentCheck(root, "trust-support-security-posture", {
      path: "docs/TRUST_SUPPORT_SECURITY.md",
      contains: ["Support channels", "Security policy", "Responsible disclosure", "No credential access", "Rollback"]
    }),
    await allFilesCheck(root, "public-support-templates", [
      ".github/ISSUE_TEMPLATE/bug_report.yml",
      ".github/ISSUE_TEMPLATE/feature_request.yml",
      ".github/ISSUE_TEMPLATE/ai_contribution.yml",
      ".github/ISSUE_TEMPLATE/documentation.yml",
      "SECURITY.md"
    ]),
    await allFilesCheck(root, "gjc-lazycodex-handoff-fixtures", [
      "fixtures/handoffs/low.json",
      "fixtures/handoffs/medium.json",
      "fixtures/handoffs/high.json"
    ]),
    await contentCheck(root, "final-audit", {
      path: "docs/CODEX_OSS_FINAL_AUDIT.md",
      contains: ["Local readiness", "Public product readiness", "Does Not Claim", "Blocked Below 9.0", "OpenAI acceptance"]
    })
  ];
  const isReady = checks.every((item) => item.status === "pass");
  return {
    status: isReady ? "ready" : "blocked",
    checks,
    nextSteps: isReady
      ? ["Public product gate is ready; keep OpenAI acceptance and adoption outside Boulder claims."]
      : ["Fill every failed public product evidence path before claiming 9.5+ readiness."]
  };
}

async function publicReleaseCheck(root: string): Promise<ProductReadinessCheck> {
  const release = await evaluateReleaseCheck(root);
  const failing = release.checks.filter((item) => item.status === "fail");
  return {
    id: "public-release-check",
    status: release.status === "ready" ? "pass" : "fail",
    evidence: release.status === "ready"
      ? `release-check ready for ${release.version}`
      : `release-check ${release.status}: ${failing.map((item) => `${item.id}=${item.evidence}`).join("; ")}`
  };
}

export function productReadinessToMarkdown(readiness: ProductReadiness): string {
  return [
    "# Product Readiness",
    "",
    `Status: ${readiness.status}`,
    "",
    "## Checks",
    "",
    ...readiness.checks.map((check) => `- ${check.id}: ${check.status} - ${check.evidence}`),
    "",
    "## Next Steps",
    "",
    ...readiness.nextSteps.map((step) => `- ${step}`),
    ""
  ].join("\n");
}

async function contentCheck(root: string, id: string, requirement: ContentRequirement): Promise<ProductReadinessCheck> {
  const path = join(root, requirement.path);
  const content = await safeRead(path);
  const missing = (requirement.contains ?? []).filter((item) => !content.includes(item));
  return {
    id,
    status: content && missing.length === 0 ? "pass" : "fail",
    evidence: content
      ? missing.length ? `${requirement.path} missing terms: ${missing.join(", ")}` : requirement.path
      : `missing ${requirement.path}`
  };
}

async function allFilesCheck(root: string, id: string, paths: readonly string[]): Promise<ProductReadinessCheck> {
  const missing = [];
  for (const path of paths) {
    if (!await exists(join(root, path))) missing.push(path);
  }
  return {
    id,
    status: missing.length ? "fail" : "pass",
    evidence: missing.length ? `missing ${missing.join(", ")}` : paths.join(", ")
  };
}

async function cleanReleaseTreeCheck(root: string): Promise<ProductReadinessCheck> {
  const duplicateArtifacts = await findDuplicateCopyArtifacts(root);
  return {
    id: "clean-release-tree",
    status: duplicateArtifacts.length ? "fail" : "pass",
    evidence: duplicateArtifacts.length
      ? `duplicate copy artifacts: ${duplicateArtifacts.join(", ")}`
      : "no duplicate copy artifacts found"
  };
}

async function findDuplicateCopyArtifacts(root: string): Promise<readonly string[]> {
  const artifacts: string[] = [];
  await collectDuplicateCopyArtifacts(root, "", artifacts);
  return artifacts;
}

async function collectDuplicateCopyArtifacts(root: string, relativeDir: string, artifacts: string[]): Promise<void> {
  const entries = await readdir(join(root, relativeDir));
  for (const entry of entries) {
    const relativePath = relativeDir ? `${relativeDir}/${entry}` : entry;
    const entryStat = await stat(join(root, relativePath)) as { isDirectory(): boolean; isFile(): boolean };
    if (entryStat.isDirectory()) {
      if (!SKIPPED_SCAN_DIRECTORIES.has(entry)) {
        await collectDuplicateCopyArtifacts(root, relativePath, artifacts);
      }
      continue;
    }
    if (entryStat.isFile() && / 2\.[^/]+$/.test(entry)) {
      artifacts.push(relativePath);
    }
  }
}

async function safeRead(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}
