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
    await contentCheck(root, "published-version-evidence", "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", [`Published version: ${version}`]),
    await contentCheck(root, "github-actions-evidence", "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", ["CI"]),
    await localTagCheck(root, version),
    await releaseManifestCheck(root, version),
    await contentCheck(root, "pack-dry-run-evidence", "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt", ["boulder-oss-cli", "Total files"])
  ];
  const status = checks.every((item) => item.status === "pass") ? "ready" : "blocked";
  return {
    version,
    status,
    checks,
    nextCommands: nextCommandsFor(status, checks, version)
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

function nextCommandsFor(status: ReleaseCheckReport["status"], checks: readonly ReleaseEvidenceCheck[], version: string): readonly string[] {
  if (status === "ready") {
    return [];
  }

  const failing = new Set(checks.filter((item) => item.status === "fail").map((item) => item.id));
  const commands: string[] = [];

  if (failing.has("ci-bun-engine")) {
    commands.push("Update .github/workflows/ci.yml to use Bun 1.3.14.");
  }
  if (failing.has("release-workflow-doc")) {
    commands.push("Update docs/RELEASE_WORKFLOW.md with the manual publish, tag, and GitHub Release workflow.");
  }
  if (failing.has("changelog-version")) {
    commands.push(`Add CHANGELOG.md entry for ${version}.`);
  }
  if (failing.has("install-smoke-evidence") || failing.has("install-smoke-version") || failing.has("published-version-evidence")) {
    commands.push(`Refresh docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt for ${version}.`);
  }
  if (failing.has("github-actions-evidence")) {
    commands.push("Refresh docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt with CI evidence.");
  }
  if (failing.has("git-tag-local")) {
    commands.push(`Record local tag evidence for v${version} after the release commit is ready.`);
  }
  if (failing.has("release-evidence-manifest")) {
    commands.push(`Refresh docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json for ${version}.`);
  }
  if (failing.has("pack-dry-run-evidence")) {
    commands.push("Refresh docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt with package dry-run evidence.");
  }

  return commands;
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

async function releaseManifestCheck(root: string, version: string): Promise<ReleaseEvidenceCheck> {
  const relativePath = "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json";
  const path = join(root, relativePath);
  if (!await exists(path)) {
    return { id: "release-evidence-manifest", status: "fail", evidence: `missing ${relativePath}` };
  }

  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    const errors = await validateReleaseManifest(root, version, parsed);
    return {
      id: "release-evidence-manifest",
      status: errors.length ? "fail" : "pass",
      evidence: errors.length ? `${relativePath}: ${errors.join("; ")}` : relativePath
    };
  } catch {
    return {
      id: "release-evidence-manifest",
      status: "fail",
      evidence: `${relativePath}: invalid JSON`
    };
  }
}

async function validateReleaseManifest(root: string, version: string, manifest: unknown): Promise<string[]> {
  if (!isRecord(manifest)) {
    return ["top-level value must be an object"];
  }

  const errors: string[] = [];
  expectLiteral(errors, manifest, "schemaVersion", 1);
  expectLiteral(errors, manifest, "packageName", "boulder-oss-cli");
  expectLiteral(errors, manifest, "packageJsonVersion", version);
  expectLiteral(errors, manifest, "cliVersion", version);
  expectLiteral(errors, manifest, "tag", `v${version}`);
  expectString(errors, manifest, "tagCommit");
  expectString(errors, manifest, "releaseCommit");
  expectLiteral(errors, manifest, "publishedVersion", version);
  expectStringArray(errors, manifest, "limitations");
  expectObjectField(errors, manifest, "installSmoke", (value) => {
    expectString(errors, value, "command");
    expectLiteral(errors, value, "exitCode", 0);
    expectString(errors, value, "generatedAt");
  });
  expectObjectField(errors, manifest, "githubActions", (value) => {
    expectString(errors, value, "runUrl");
  });
  expectObjectField(errors, manifest, "packDryRun", (value) => {
    expectNumber(errors, value, "fileCount");
    expectLiteral(errors, value, "packageVersion", version);
  });

  const tagCommit = typeof manifest.tagCommit === "string" ? manifest.tagCommit.trim() : "";
  if (tagCommit) {
    const expectedTagCommit = await tagCommitFor(root, `v${version}`);
    if (expectedTagCommit && tagCommit !== expectedTagCommit) {
      errors.push(`tagCommit must match local tag v${version}`);
    }
  }

  const releaseCommit = typeof manifest.releaseCommit === "string" ? manifest.releaseCommit.trim() : "";
  if (releaseCommit) {
    const currentCommit = await currentHead(root);
    const documentedCommit = await documentedGithubActionsCommit(root);
    if (releaseCommit !== currentCommit && releaseCommit !== documentedCommit) {
      errors.push("releaseCommit must match HEAD or the documented GitHub Actions commit");
    }
  }

  return errors;
}

async function tagCommitFor(root: string, tag: string): Promise<string> {
  try {
    return (await execStdout(`git rev-list -n 1 ${shellQuote(tag)}`, root)).trim();
  } catch {
    return "";
  }
}

async function currentHead(root: string): Promise<string> {
  try {
    return (await execStdout("git rev-parse HEAD", root)).trim();
  } catch {
    return "";
  }
}

async function documentedGithubActionsCommit(root: string): Promise<string> {
  try {
    const content = await readFile(join(root, "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt"), "utf8");
    const match = /^Commit:\s*([0-9a-f]{7,40})$/im.exec(content);
    if (!match) {
      return "";
    }
    return (await execStdout(`git rev-parse ${shellQuote(match[1])}`, root)).trim();
  } catch {
    return "";
  }
}

function expectLiteral(errors: string[], record: Record<string, unknown>, key: string, expected: string | number): void {
  if (record[key] !== expected) {
    errors.push(`${key} must be ${String(expected)}`);
  }
}

function expectString(errors: string[], record: Record<string, unknown>, key: string): void {
  if (typeof record[key] !== "string" || !record[key].trim()) {
    errors.push(`${key} must be a non-empty string`);
  }
}

function expectNumber(errors: string[], record: Record<string, unknown>, key: string): void {
  if (typeof record[key] !== "number" || !Number.isFinite(record[key])) {
    errors.push(`${key} must be a finite number`);
  }
}

function expectStringArray(errors: string[], record: Record<string, unknown>, key: string): void {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${key} must be a string array`);
  }
}

function expectObjectField(errors: string[], record: Record<string, unknown>, key: string, validate: (value: Record<string, unknown>) => void): void {
  const value = record[key];
  if (!isRecord(value)) {
    errors.push(`${key} must be an object`);
    return;
  }
  validate(value);
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
