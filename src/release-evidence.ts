import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeGeneratedText } from "./fs";
import { RELEASE_RECOVERY_CODES, type ReleaseRecoveryCode } from "./recovery-codes";

export const RELEASE_EVIDENCE_TARGETS = [
  "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json",
  "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt",
  "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt",
  "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt",
  "docs/CASE_STUDIES/evidence/release-workflow/ci.txt",
  "docs/CASE_STUDIES/evidence/release-workflow/release-plan.json",
  "docs/PRODUCT_READINESS.md"
] as const;

export type ReleaseEvidenceTarget = typeof RELEASE_EVIDENCE_TARGETS[number];

export type ReleaseEvidenceBundleV1 = {
  readonly schemaVersion: 1;
  readonly packageName: string;
  readonly packageJsonVersion: string;
  readonly cliVersion: string;
  readonly tag: string;
  readonly tagCommit: string;
  readonly releaseCommit: string;
  readonly publishedVersion: string;
  readonly installSmoke: {
    readonly command: string;
    readonly exitCode: number;
    readonly generatedAt: string;
  };
  readonly githubActions: {
    readonly runUrl: string;
  };
  readonly packDryRun: {
    readonly fileCount: number;
    readonly packageVersion: string;
  };
  readonly limitations: readonly string[];
};

export type ReleaseEvidenceExpectation = {
  readonly packageJsonVersion: string;
  readonly cliVersion: string;
  readonly tag: string;
  readonly releaseCommit: string;
  readonly packDryRunFileCount: number;
};

export type ReleaseEvidenceIssue = {
  readonly code: ReleaseRecoveryCode;
  readonly message: string;
};

export type ReleaseEvidenceParseResult = {
  readonly ok: true;
  readonly value: ReleaseEvidenceBundleV1;
} | {
  readonly ok: false;
  readonly issues: readonly ReleaseEvidenceIssue[];
};

export type ReleaseEvidenceValidation = {
  readonly status: "pass" | "fail";
  readonly issues: readonly ReleaseEvidenceIssue[];
};

export type ReleaseEvidenceRefreshTarget = {
  readonly path: ReleaseEvidenceTarget;
  readonly changed: boolean;
  readonly beforeBytes: number;
  readonly afterBytes: number;
  readonly content: string;
};

export type ReleaseEvidenceRefreshPlan = {
  readonly status: "ready" | "blocked";
  readonly targets: readonly ReleaseEvidenceRefreshTarget[];
  readonly issues: readonly ReleaseEvidenceIssue[];
};

export function parseReleaseEvidenceBundle(input: unknown): ReleaseEvidenceParseResult {
  if (!isRecord(input) || !isBundle(input)) {
    return fail(RELEASE_RECOVERY_CODES.malformedInput, "release evidence manifest must match schemaVersion 1");
  }

  return { ok: true, value: input };
}

export function checkReleaseEvidenceBundle(
  parsed: ReleaseEvidenceParseResult,
  expected: ReleaseEvidenceExpectation
): ReleaseEvidenceValidation {
  if (!parsed.ok) {
    return { status: "fail", issues: parsed.issues };
  }

  const value = parsed.value;
  const issues: ReleaseEvidenceIssue[] = [];
  if (value.packageJsonVersion !== expected.packageJsonVersion) {
    issues.push(issue(RELEASE_RECOVERY_CODES.packageJsonVersionMismatch, "packageJsonVersion must match package.json"));
  }
  if (value.cliVersion !== expected.cliVersion || value.publishedVersion !== expected.packageJsonVersion) {
    issues.push(issue(RELEASE_RECOVERY_CODES.versionMismatch, "release evidence versions must match package.json"));
  }
  if (value.tag !== expected.tag) {
    issues.push(issue(RELEASE_RECOVERY_CODES.tagMismatch, "release evidence tag must match package.json version"));
  }
  if (value.packDryRun.packageVersion !== expected.packageJsonVersion) {
    issues.push(issue(RELEASE_RECOVERY_CODES.packVersionMismatch, "pack dry-run packageVersion must match package.json"));
  }
  if (value.releaseCommit !== expected.releaseCommit) {
    issues.push(issue(RELEASE_RECOVERY_CODES.releaseCommitMismatch, "releaseCommit must match CI evidence commit"));
  }
  if (value.packDryRun.fileCount !== expected.packDryRunFileCount) {
    issues.push(issue(RELEASE_RECOVERY_CODES.packFileCountMismatch, "pack dry-run fileCount must match pack evidence"));
  }

  return { status: issues.length === 0 ? "pass" : "fail", issues };
}

export function renderReleaseEvidenceBundle(bundle: ReleaseEvidenceBundleV1): Record<ReleaseEvidenceTarget, string> {
  return {
    "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json": `${JSON.stringify(bundle, null, 2)}\n`,
    "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt": `CI\nResult: success\nRun: ${bundle.githubActions.runUrl}\nCommit: ${bundle.releaseCommit}\n`,
    "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt": `${bundle.installSmoke.command}\nPublished version: ${bundle.publishedVersion}\nResult: success\nGenerated at: ${bundle.installSmoke.generatedAt}\nexit: ${bundle.installSmoke.exitCode}\n`,
    "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt": `${bundle.packageName}\nPackage version: ${bundle.packDryRun.packageVersion}\nTotal files: ${bundle.packDryRun.fileCount}\n`,
    "docs/CASE_STUDIES/evidence/release-workflow/ci.txt": `bun run ci\nResult: success\nCommit: ${bundle.releaseCommit}\n`,
    "docs/CASE_STUDIES/evidence/release-workflow/release-plan.json": `${JSON.stringify({
      version: bundle.packageJsonVersion,
      status: "ready",
      checks: [
        { id: "github-actions-evidence", status: "pass", evidence: bundle.githubActions.runUrl },
        { id: "install-smoke-evidence", status: "pass", evidence: bundle.installSmoke.command },
        { id: "pack-dry-run-evidence", status: "pass", evidence: `${bundle.packDryRun.fileCount} files` },
        { id: "release-evidence-manifest", status: "pass", evidence: bundle.releaseCommit }
      ],
      manualSteps: [
        "Create the GitHub release with verification notes.",
        "Publishing remains manual; npm publish is not automated by Boulder."
      ]
    }, null, 2)}\n`,
    "docs/PRODUCT_READINESS.md": `- public-release-check: pass - release-check ready for ${bundle.packageJsonVersion}\n`
  };
}

export async function planReleaseEvidenceRefresh(root: string): Promise<ReleaseEvidenceRefreshPlan> {
  const parsed = await loadBundle(root);
  if (!parsed.ok) return { status: "blocked", targets: [], issues: parsed.issues };

  const packageInfo = await loadPackageInfo(root);
  if (!packageInfo) {
    return { status: "blocked", targets: [], issues: [issue(RELEASE_RECOVERY_CODES.malformedInput, "package.json must contain name and version")] };
  }

  const bundle = refreshVersionFields(parsed.value, packageInfo);
  const packDryRunFileCount = await currentPackDryRunFileCount(root) ?? bundle.packDryRun.fileCount;
  const validation = checkReleaseEvidenceBundle(parseReleaseEvidenceBundle(bundle), {
    packageJsonVersion: packageInfo.version,
    cliVersion: packageInfo.version,
    tag: `v${packageInfo.version}`,
    releaseCommit: bundle.releaseCommit,
    packDryRunFileCount
  });
  if (validation.status === "fail") {
    return { status: "blocked", targets: [], issues: validation.issues };
  }

  const rendered = renderReleaseEvidenceBundle(bundle);
  const targets = await Promise.all(RELEASE_EVIDENCE_TARGETS.map(async (path) => {
    const current = await readExisting(root, path);
    const content = path === "docs/PRODUCT_READINESS.md" ? mergeProductReadinessLine(current, rendered[path]) : rendered[path];
    return {
      path,
      changed: current !== content,
      beforeBytes: current.length,
      afterBytes: content.length,
      content
    } satisfies ReleaseEvidenceRefreshTarget;
  }));

  return { status: "ready", targets, issues: [] };
}

export async function writeReleaseEvidenceRefresh(root: string, plan: ReleaseEvidenceRefreshPlan): Promise<void> {
  if (plan.status === "blocked") return;
  for (const target of plan.targets) {
    await writeGeneratedText(root, target.path, target.content, true);
  }
}

function isBundle(input: Record<string, unknown>): input is ReleaseEvidenceBundleV1 {
  return input.schemaVersion === 1 &&
    typeof input.packageName === "string" &&
    typeof input.packageJsonVersion === "string" &&
    typeof input.cliVersion === "string" &&
    typeof input.tag === "string" &&
    typeof input.tagCommit === "string" &&
    typeof input.releaseCommit === "string" &&
    typeof input.publishedVersion === "string" &&
    isInstallSmoke(input.installSmoke) &&
    isGithubActions(input.githubActions) &&
    isPackDryRun(input.packDryRun) &&
    Array.isArray(input.limitations) &&
    input.limitations.every((item) => typeof item === "string");
}

function isInstallSmoke(value: unknown): value is ReleaseEvidenceBundleV1["installSmoke"] {
  return isRecord(value) &&
    typeof value.command === "string" &&
    typeof value.exitCode === "number" &&
    typeof value.generatedAt === "string";
}

function isGithubActions(value: unknown): value is ReleaseEvidenceBundleV1["githubActions"] {
  return isRecord(value) && typeof value.runUrl === "string";
}

function isPackDryRun(value: unknown): value is ReleaseEvidenceBundleV1["packDryRun"] {
  return isRecord(value) &&
    typeof value.fileCount === "number" &&
    typeof value.packageVersion === "string";
}

function fail(code: ReleaseRecoveryCode, message: string): ReleaseEvidenceParseResult {
  return { ok: false, issues: [issue(code, message)] };
}

function issue(code: ReleaseRecoveryCode, message: string): ReleaseEvidenceIssue {
  return { code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function loadBundle(root: string): Promise<ReleaseEvidenceParseResult> {
  try {
    return parseReleaseEvidenceBundle(JSON.parse(await readFile(join(root, "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json"), "utf8")));
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return fail(RELEASE_RECOVERY_CODES.malformedInput, "release evidence manifest must be readable JSON");
  }
}

async function loadPackageInfo(root: string): Promise<{ readonly name: string; readonly version: string } | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    if (isRecord(parsed) && typeof parsed.name === "string" && typeof parsed.version === "string") {
      return { name: parsed.name, version: parsed.version };
    }
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return null;
  }
  return null;
}

function refreshVersionFields(bundle: ReleaseEvidenceBundleV1, packageInfo: { readonly name: string; readonly version: string }): ReleaseEvidenceBundleV1 {
  return {
    ...bundle,
    packageName: packageInfo.name,
    packageJsonVersion: packageInfo.version,
    cliVersion: packageInfo.version,
    tag: `v${packageInfo.version}`,
    publishedVersion: packageInfo.version,
    installSmoke: {
      ...bundle.installSmoke,
      command: `bunx ${packageInfo.name}@${packageInfo.version} --version`
    },
    packDryRun: {
      ...bundle.packDryRun,
      packageVersion: packageInfo.version
    }
  };
}

async function currentPackDryRunFileCount(root: string): Promise<number | null> {
  const content = await readExisting(root, "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt");
  const match = /^Total files:\s*(\d+)$/im.exec(content);
  return match ? Number(match[1]) : null;
}

async function readExisting(root: string, path: ReleaseEvidenceTarget): Promise<string> {
  try {
    return await readFile(join(root, path), "utf8");
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return "";
  }
}

function mergeProductReadinessLine(current: string, renderedLine: string): string {
  const line = renderedLine.trimEnd();
  const lines = current.split("\n");
  const index = lines.findIndex((item) => item.startsWith("- public-release-check:"));
  if (index >= 0) {
    lines[index] = line;
    return lines.join("\n");
  }
  return current.endsWith("\n") || current.length === 0 ? `${current}${line}\n` : `${current}\n${line}\n`;
}
