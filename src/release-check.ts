import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./fs";
import { releaseManifestCheck } from "./release-manifest-check";
import { orderReadinessChecks } from "./readiness-registry";

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
    await packageMetadataCheck(root),
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
    checks: orderReadinessChecks("release-check", checks),
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
  if (failing.has("package-metadata")) {
    commands.push("Add repo-verifiable package metadata in package.json: name, version, license, repository.url, homepage, and bugs.url.");
  }

  return commands;
}

async function packageMetadataCheck(root: string): Promise<ReleaseEvidenceCheck> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    if (!isRecord(parsed)) {
      return metadataFailure(["package.json object"]);
    }

    const missing = [
      ...requiredStringFields(parsed, ["name", "version", "license"]),
      ...requiredNestedStringFields(parsed, "repository", ["url"]),
      ...requiredNestedStringFields(parsed, "bugs", ["url"]),
      ...requiredStringFields(parsed, ["homepage"])
    ];
    const repositoryUrl = nestedStringField(parsed, "repository", "url");
    const homepage = stringField(parsed, "homepage");
    const bugsUrl = nestedStringField(parsed, "bugs", "url");
    const compatibility = compatiblePackageUrls(repositoryUrl, homepage, bugsUrl);
    if (!compatibility) {
      missing.push("repository/homepage/bugs GitHub URL compatibility");
    }

    return missing.length ? metadataFailure(missing) : { id: "package-metadata", status: "pass", evidence: "package.json repo-verifiable metadata" };
  } catch {
    return metadataFailure(["package.json"]);
  }
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
  const stdout = await execStdout(`git tag --list ${shellQuote(tag)}`, root);
  const found = stdout.split("\n").some((line) => line.trim() === tag);
  if (found || !await exists(join(root, ".git"))) {
    return { id: "git-tag-local", status: "pass", evidence: `release tag evidence available for ${tag}` };
  }
  if (await releaseManifestTagMatches(root, tag)) {
    return { id: "git-tag-local", status: "pass", evidence: `release manifest tag ${tag}` };
  }
  return { id: "git-tag-local", status: "fail", evidence: `missing local tag ${tag}` };
}

async function releaseManifestTagMatches(root: string, tag: string): Promise<boolean> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(root, "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json"), "utf8"));
    return isRecord(parsed) && parsed.tag === tag;
  } catch {
    return false;
  }
}

async function execStdout(command: string, cwd: string): Promise<string> {
  return await new Promise((resolve) => {
    exec(command, { cwd, timeout: 10_000 }, (error, stdout) => {
      resolve(error ? "" : stdout);
    });
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataFailure(missing: readonly string[]): ReleaseEvidenceCheck {
  return {
    id: "package-metadata",
    status: "fail",
    evidence: `package.json missing repo-verifiable metadata: ${missing.join(", ")}`
  };
}

function requiredStringFields(record: Record<string, unknown>, fields: readonly string[]): string[] {
  return fields.filter((field) => !stringField(record, field));
}

function requiredNestedStringFields(record: Record<string, unknown>, parent: string, fields: readonly string[]): string[] {
  const value = record[parent];
  if (!isRecord(value)) {
    return fields.map((field) => `${parent}.${field}`);
  }
  return fields.filter((field) => !stringField(value, field)).map((field) => `${parent}.${field}`);
}

function compatiblePackageUrls(repositoryUrl: string, homepage: string, bugsUrl: string): boolean {
  const slug = githubSlug(repositoryUrl);
  return !!slug && githubSlug(homepage) === slug && githubSlug(bugsUrl) === slug;
}

function githubSlug(value: string): string {
  const match = /github\.com[:/]([^/#?]+\/[^/#?.]+)(?:\.git)?/i.exec(value);
  return match ? match[1].toLowerCase() : "";
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function nestedStringField(record: Record<string, unknown>, parent: string, key: string): string {
  const value = record[parent];
  return isRecord(value) ? stringField(value, key) : "";
}
