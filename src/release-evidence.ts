import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeGeneratedText } from "./fs";
import { RELEASE_RECOVERY_CODES } from "./recovery-codes";
import {
  RELEASE_EVIDENCE_TARGETS,
  checkReleaseEvidenceBundle,
  parseReleaseEvidenceBundle,
  releaseEvidenceIssue,
  releaseEvidenceParseFailure,
  renderReleaseEvidenceBundle,
  type ReleaseEvidenceBundleV1,
  type ReleaseEvidenceIssue,
  type ReleaseEvidenceParseResult,
  type ReleaseEvidenceTarget
} from "./release-evidence-bundle";

export {
  RELEASE_EVIDENCE_TARGETS,
  checkReleaseEvidenceBundle,
  parseReleaseEvidenceBundle,
  renderReleaseEvidenceBundle
} from "./release-evidence-bundle";
export type {
  ReleaseEvidenceBundleV1,
  ReleaseEvidenceExpectation,
  ReleaseEvidenceIssue,
  ReleaseEvidenceParseResult,
  ReleaseEvidenceTarget,
  ReleaseEvidenceValidation
} from "./release-evidence-bundle";

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

type PackageInfo = {
  readonly name: string;
  readonly version: string;
};

export async function planReleaseEvidenceRefresh(root: string): Promise<ReleaseEvidenceRefreshPlan> {
  const parsed = await loadBundle(root);
  if (!parsed.ok) return { status: "blocked", targets: [], issues: parsed.issues };

  const packageInfo = await loadPackageInfo(root);
  if (!packageInfo) {
    return blocked(RELEASE_RECOVERY_CODES.malformedInput, "package.json must contain name and version");
  }

  const bundle = await refreshBundle(root, parsed.value, packageInfo);
  const packDryRunFileCount = await currentPackDryRunTotal(root);
  if (packDryRunFileCount === null) {
    return blocked(RELEASE_RECOVERY_CODES.packFileCountMismatch, "live pack dry-run total must be available before refreshing release evidence");
  }

  const bundleWithPackCount = withPackFileCount(bundle, packDryRunFileCount);
  if (!hasCurrentExternalReleaseEvidence(bundleWithPackCount, packageInfo.version)) {
    return blocked(RELEASE_RECOVERY_CODES.versionMismatch, `external release evidence must already prove ${packageInfo.version}`);
  }

  const validation = checkReleaseEvidenceBundle(parseReleaseEvidenceBundle(bundleWithPackCount), {
    packageJsonVersion: packageInfo.version,
    cliVersion: packageInfo.version,
    tag: `v${packageInfo.version}`,
    releaseCommit: bundleWithPackCount.releaseCommit,
    packDryRunFileCount
  });
  if (validation.status === "fail") return { status: "blocked", targets: [], issues: validation.issues };

  return { status: "ready", targets: await buildRefreshTargets(root, bundleWithPackCount), issues: [] };
}

export async function writeReleaseEvidenceRefresh(root: string, plan: ReleaseEvidenceRefreshPlan): Promise<void> {
  if (plan.status === "blocked") return;
  for (const target of plan.targets) {
    await writeGeneratedText(root, target.path, target.content, true);
  }
}

async function loadBundle(root: string): Promise<ReleaseEvidenceParseResult> {
  try {
    const text = await readFile(join(root, "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json"), "utf8");
    return parseReleaseEvidenceBundle(JSON.parse(text));
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return releaseEvidenceParseFailure(RELEASE_RECOVERY_CODES.malformedInput, "release evidence manifest must be readable JSON");
  }
}

async function loadPackageInfo(root: string): Promise<PackageInfo | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    if (isPackageInfo(parsed)) return { name: parsed.name, version: parsed.version };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
  }
  return null;
}

async function refreshBundle(root: string, bundle: ReleaseEvidenceBundleV1, packageInfo: PackageInfo): Promise<ReleaseEvidenceBundleV1> {
  return refreshVersionFields(
    bundle,
    packageInfo,
    await currentGitCommit(root, ["rev-list", "-n", "1", `v${packageInfo.version}`])
  );
}

function refreshVersionFields(
  bundle: ReleaseEvidenceBundleV1,
  packageInfo: PackageInfo,
  tagCommit: string
): ReleaseEvidenceBundleV1 {
  return {
    ...bundle,
    packageName: packageInfo.name,
    packageJsonVersion: packageInfo.version,
    cliVersion: packageInfo.version,
    tag: `v${packageInfo.version}`,
    tagCommit: tagCommit || bundle.tagCommit,
    packDryRun: { ...bundle.packDryRun, packageVersion: packageInfo.version }
  };
}

function withPackFileCount(bundle: ReleaseEvidenceBundleV1, fileCount: number): ReleaseEvidenceBundleV1 {
  return { ...bundle, packDryRun: { ...bundle.packDryRun, fileCount } };
}

function hasCurrentExternalReleaseEvidence(bundle: ReleaseEvidenceBundleV1, version: string): boolean {
  return bundle.publishedVersion === version &&
    bundle.installSmoke.exitCode === 0 &&
    bundle.installSmoke.command.includes(`@${version}`);
}

async function buildRefreshTargets(root: string, bundle: ReleaseEvidenceBundleV1): Promise<readonly ReleaseEvidenceRefreshTarget[]> {
  const rendered = renderReleaseEvidenceBundle(bundle);
  return await Promise.all(RELEASE_EVIDENCE_TARGETS.map(async (path) => {
    const current = await readExisting(root, path);
    const content = path === "docs/PRODUCT_READINESS.md" ? mergeProductReadinessLine(current, rendered[path]) : rendered[path];
    return { path, changed: current !== content, beforeBytes: current.length, afterBytes: content.length, content };
  }));
}

async function currentGitCommit(root: string, args: readonly string[]): Promise<string> {
  return await new Promise<string>((resolve) => {
    exec(`git ${args.map(shellQuote).join(" ")}`, { cwd: root }, (error, stdout) => {
      resolve(error ? "" : stdout.trim());
    });
  });
}

async function currentPackDryRunTotal(root: string): Promise<number | null> {
  return await new Promise<number | null>((resolve) => {
    exec("bun pm pack --dry-run --ignore-scripts", { cwd: root }, (error, stdout, stderr) => {
      if (error) {
        resolve(null);
        return;
      }
      const match = /^Total files:\s*(\d+)$/im.exec(`${stdout}\n${stderr}`);
      resolve(match?.[1] ? Number(match[1]) : null);
    });
  });
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

function blocked(code: ReleaseEvidenceIssue["code"], message: string): ReleaseEvidenceRefreshPlan {
  return { status: "blocked", targets: [], issues: [releaseEvidenceIssue(code, message)] };
}

function isPackageInfo(value: unknown): value is PackageInfo {
  return isRecord(value) &&
    typeof value["name"] === "string" &&
    typeof value["version"] === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
