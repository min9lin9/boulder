import { exec } from "node:child_process";
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
    await contentCheck(root, "ci-bun-engine", ".github/workflows/ci.yml", ['bun-version: "1.3.14"']),
    await contentCheck(root, "changelog-version", "CHANGELOG.md", [`## ${version}`]),
    await contentCheck(root, "install-smoke-evidence", "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", ["bunx boulder-oss-cli"]),
    await contentCheck(root, "install-smoke-version", "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", [`${version}`]),
    await contentCheck(root, "github-actions-evidence", "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", ["CI"]),
    await localTagCheck(root, version),
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
  try {
    const parsed: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    if (isRecord(parsed) && typeof parsed.version === "string" && parsed.version.trim()) {
      return parsed.version;
    }
  } catch {
    return "0.0.0";
  }
  return "0.0.0";
}

async function localTagCheck(root: string, version: string): Promise<ReleaseEvidenceCheck> {
  const tag = `v${version}`;
  try {
    const stdout = await execStdout(`git tag --list ${shellQuote(tag)}`, root);
    const found = stdout.split("\n").some((line) => line.trim() === tag);
    return {
      id: "git-tag-local",
      status: found ? "pass" : "fail",
      evidence: found ? `local tag ${tag}` : `missing local tag ${tag}`
    };
  } catch {
    return {
      id: "git-tag-local",
      status: "fail",
      evidence: "unable to inspect local git tags"
    };
  }
}

async function execStdout(command: string, cwd: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    exec(command, { cwd, timeout: 10_000 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
