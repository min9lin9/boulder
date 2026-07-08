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
    "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt": `${bundle.githubActions.runUrl}\n`,
    "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt": `${bundle.installSmoke.command}\nexit: ${bundle.installSmoke.exitCode}\n`,
    "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt": `${bundle.packageName}\nPackage version: ${bundle.packDryRun.packageVersion}\nTotal files: ${bundle.packDryRun.fileCount}\n`,
    "docs/CASE_STUDIES/evidence/release-workflow/ci.txt": "",
    "docs/CASE_STUDIES/evidence/release-workflow/release-plan.json": "",
    "docs/PRODUCT_READINESS.md": ""
  };
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
