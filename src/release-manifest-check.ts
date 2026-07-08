import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./fs";
import type { ReleaseEvidenceCheck } from "./release-check";

export async function releaseManifestCheck(root: string, version: string): Promise<ReleaseEvidenceCheck> {
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
    return { id: "release-evidence-manifest", status: "fail", evidence: `${relativePath}: invalid JSON` };
  }
}

async function validateReleaseManifest(root: string, version: string, manifest: unknown): Promise<string[]> {
  if (!isRecord(manifest)) return ["top-level value must be an object"];

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
  await expectCommitFields(errors, root, version, manifest);
  return errors;
}

async function expectCommitFields(errors: string[], root: string, version: string, manifest: Record<string, unknown>): Promise<void> {
  const tagCommit = typeof manifest.tagCommit === "string" ? manifest.tagCommit.trim() : "";
  if (tagCommit) {
    const expectedTagCommit = await gitStdout(root, `git rev-list -n 1 ${shellQuote(`v${version}`)}`);
    if (expectedTagCommit && tagCommit !== expectedTagCommit) {
      errors.push(`tagCommit must match local tag v${version}`);
    }
  }

  const releaseCommit = typeof manifest.releaseCommit === "string" ? manifest.releaseCommit.trim() : "";
  if (releaseCommit) {
    const currentCommit = await gitStdout(root, "git rev-parse HEAD");
    const documentedCommit = await documentedGithubActionsCommit(root);
    if (releaseCommit !== currentCommit && releaseCommit !== documentedCommit) {
      errors.push("releaseCommit must match HEAD or the documented GitHub Actions commit");
    }
  }
}

async function documentedGithubActionsCommit(root: string): Promise<string> {
  try {
    const content = await readFile(join(root, "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt"), "utf8");
    const match = /^Commit:\s*([0-9a-f]{7,40})$/im.exec(content);
    return match ? await gitStdout(root, `git rev-parse ${shellQuote(match[1])}`) : "";
  } catch {
    return "";
  }
}

async function gitStdout(root: string, command: string): Promise<string> {
  try {
    return (await execStdout(command, root)).trim();
  } catch {
    return "";
  }
}

function expectLiteral(errors: string[], record: Record<string, unknown>, key: string, expected: string | number): void {
  if (record[key] !== expected) errors.push(`${key} must be ${String(expected)}`);
}

function expectString(errors: string[], record: Record<string, unknown>, key: string): void {
  if (typeof record[key] !== "string" || !record[key].trim()) errors.push(`${key} must be a non-empty string`);
}

function expectNumber(errors: string[], record: Record<string, unknown>, key: string): void {
  if (typeof record[key] !== "number" || !Number.isFinite(record[key])) errors.push(`${key} must be a finite number`);
}

function expectStringArray(errors: string[], record: Record<string, unknown>, key: string): void {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) errors.push(`${key} must be a string array`);
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
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
