import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./fs";

export type ReleaseEvidenceCheck = {
  readonly id: string;
  readonly status: "pass" | "fail";
  readonly evidence: string;
};

export type ReleaseCheckReport = {
  readonly version: string;
  readonly status: "ready" | "blocked";
  readonly checks: readonly ReleaseEvidenceCheck[];
  readonly nextCommands: readonly string[];
};

export async function evaluateReleaseCheck(root: string): Promise<ReleaseCheckReport> {
  const version = await packageVersion(root);
  const checks = [
    await contentCheck(root, "release-workflow-doc", "docs/RELEASE_WORKFLOW.md", ["npm publish", "GitHub Release", "tag"]),
    await contentCheck(root, "changelog-version", "CHANGELOG.md", [`## ${version}`]),
    await contentCheck(root, "install-smoke-evidence", "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", ["bunx boulder-oss-cli"]),
    await contentCheck(root, "github-actions-evidence", "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", ["CI"]),
    await contentCheck(root, "pack-dry-run-evidence", "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt", ["boulder-oss-cli", "Total files"])
  ];
  return {
    version,
    status: checks.every((item) => item.status === "pass") ? "ready" : "blocked",
    checks,
    nextCommands: [
      "bun run ci",
      "npm publish --access public",
      `git tag v${version} # only when this version has not already been tagged`,
      `gh release create v${version} --notes-file <release-notes.md>`
    ]
  };
}

export function releaseCheckToMarkdown(report: ReleaseCheckReport): string {
  return [
    "# Release Check",
    "",
    `Version: ${report.version}`,
    `Status: ${report.status}`,
    "",
    "This command checks release evidence and does not publish, tag, or create a GitHub Release.",
    "",
    "## Checks",
    "",
    ...report.checks.map((check) => `- ${check.id}: ${check.status} - ${check.evidence}`),
    "",
    "## Next Commands",
    "",
    ...report.nextCommands.map((command) => `- \`${command}\``),
    ""
  ].join("\n");
}

async function contentCheck(root: string, id: string, relativePath: string, terms: readonly string[]): Promise<ReleaseEvidenceCheck> {
  const path = join(root, relativePath);
  if (!await exists(path)) {
    return { id, status: "fail", evidence: `missing ${relativePath}` };
  }
  const content = await readFile(path, "utf8");
  const missing = terms.filter((term) => !content.includes(term));
  return {
    id,
    status: missing.length ? "fail" : "pass",
    evidence: missing.length ? `${relativePath} missing terms: ${missing.join(", ")}` : relativePath
  };
}

async function packageVersion(root: string): Promise<string> {
  const parsed: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (isRecord(parsed) && typeof parsed.version === "string" && parsed.version.trim()) {
    return parsed.version;
  }
  return "0.0.0";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
