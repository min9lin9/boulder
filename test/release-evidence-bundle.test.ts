import { describe, expect, test } from "bun:test";
import releaseManifest from "../docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json" with { type: "json" };
import packageInventory from "../fixtures/package-inventory/packaged-files.v0.json" with { type: "json" };
import packageJson from "../package.json" with { type: "json" };
import { RELEASE_RECOVERY_CODES } from "../src/recovery-codes";
import {
  RELEASE_EVIDENCE_TARGETS,
  type ReleaseEvidenceBundleV1,
  type ReleaseEvidenceExpectation,
  checkReleaseEvidenceBundle,
  parseReleaseEvidenceBundle,
  renderReleaseEvidenceBundle
} from "../src/release-evidence";

const PLAN_TARGETS = [
  "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json",
  "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt",
  "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt",
  "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt",
  "docs/CASE_STUDIES/evidence/release-workflow/ci.txt",
  "docs/CASE_STUDIES/evidence/release-workflow/release-evidence-plan.json",
  "docs/PRODUCT_READINESS.md"
] as const;

const READY_RELEASE_BUNDLE = {
  ...releaseManifest,
  schemaVersion: 1,
  packageJsonVersion: packageJson.version,
  cliVersion: packageJson.version,
  tag: `v${packageJson.version}`,
  publishedVersion: packageJson.version,
  installSmoke: {
    ...releaseManifest.installSmoke,
    command: `bunx boulder-oss-cli@${packageJson.version} --version`
  },
  packDryRun: {
    ...releaseManifest.packDryRun,
    fileCount: packageInventory.totalPackedFiles,
    packageVersion: packageJson.version
  }
} satisfies ReleaseEvidenceBundleV1;

const READY_RELEASE_EXPECTATION = {
  packageJsonVersion: packageJson.version,
  cliVersion: packageJson.version,
  tag: `v${packageJson.version}`,
  releaseCommit: READY_RELEASE_BUNDLE.releaseCommit,
  packDryRunFileCount: READY_RELEASE_BUNDLE.packDryRun.fileCount
} satisfies ReleaseEvidenceExpectation;

const CHECKED_RELEASE_EXPECTATION = {
  packageJsonVersion: releaseManifest.packageJsonVersion,
  cliVersion: releaseManifest.cliVersion,
  tag: releaseManifest.tag,
  releaseCommit: releaseManifest.releaseCommit,
  packDryRunFileCount: releaseManifest.packDryRun.fileCount
} satisfies ReleaseEvidenceExpectation;

describe("ReleaseEvidenceBundleV1", () => {
  test("validates and renders a ready v0.1.16 bundle for the release evidence targets", () => {
    const parsed = parseReleaseEvidenceBundle(READY_RELEASE_BUNDLE);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const validation = checkReleaseEvidenceBundle(parsed, READY_RELEASE_EXPECTATION);
    const rendered = renderReleaseEvidenceBundle(parsed.value);

    expect(validation.status).toBe("pass");
    expect(validation.issues).toEqual([]);
    expect(RELEASE_EVIDENCE_TARGETS).toEqual(PLAN_TARGETS);
    expect(Object.keys(rendered).sort()).toEqual([...PLAN_TARGETS].sort());
    for (const target of RELEASE_EVIDENCE_TARGETS) {
      expect(rendered[target].trim().length).toBeGreaterThan(0);
    }
    expect(rendered["docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json"]).toContain(`"packageJsonVersion": "${packageJson.version}"`);
    expect(rendered["docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt"]).toContain(releaseManifest.githubActions.runUrl);
    expect(rendered["docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt"]).toContain(READY_RELEASE_BUNDLE.installSmoke.command);
    expect(rendered["docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt"]).toContain(`Total files: ${packageInventory.totalPackedFiles}`);
    expect(rendered["docs/PRODUCT_READINESS.md"]).toBe(`- public-release-check: pass - release-check ready for ${packageJson.version}\n`);
  });

  test("reports checked published release evidence as internally consistent", () => {
    const validation = checkReleaseEvidenceBundle(parseReleaseEvidenceBundle(releaseManifest), CHECKED_RELEASE_EXPECTATION);

    expect(validation.status).toBe("pass");
    expect(validation.issues).toEqual([]);
  });

  test("rejects malformed input with a stable recovery code", () => {
    const validation = checkReleaseEvidenceBundle(parseReleaseEvidenceBundle({ schemaVersion: 1 }), READY_RELEASE_EXPECTATION);

    expect(validation.status).toBe("fail");
    expect(validation.issues.map((issue) => issue.code)).toEqual([RELEASE_RECOVERY_CODES.malformedInput]);
  });

  test("mismatch rejects package, CLI, tag, and pack versions with stable recovery codes", () => {
    const parsed = parseReleaseEvidenceBundle(READY_RELEASE_BUNDLE);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const mismatched = {
      ...parsed.value,
      packageJsonVersion: "0.0.0",
      cliVersion: "0.0.0",
      tag: "v0.0.0",
      publishedVersion: "0.0.0",
      packDryRun: {
        ...parsed.value.packDryRun,
        packageVersion: "0.0.0"
      }
    };

    const codes = checkReleaseEvidenceBundle(parseReleaseEvidenceBundle(mismatched), READY_RELEASE_EXPECTATION).issues.map((issue) => issue.code);

    expect(codes).toContain(RELEASE_RECOVERY_CODES.packageJsonVersionMismatch);
    expect(codes).toContain(RELEASE_RECOVERY_CODES.versionMismatch);
    expect(codes).toContain(RELEASE_RECOVERY_CODES.tagMismatch);
    expect(codes).toContain(RELEASE_RECOVERY_CODES.packVersionMismatch);
  });

  test("mismatch rejects CI release commit drift with a stable recovery code", () => {
    const parsed = parseReleaseEvidenceBundle(READY_RELEASE_BUNDLE);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const mismatched = {
      ...parsed.value,
      releaseCommit: "0000000000000000000000000000000000000000"
    };

    const codes = checkReleaseEvidenceBundle(parseReleaseEvidenceBundle(mismatched), READY_RELEASE_EXPECTATION).issues.map((issue) => issue.code);

    expect(codes).toContain(RELEASE_RECOVERY_CODES.releaseCommitMismatch);
  });

  test("mismatch rejects pack dry-run file count drift with a stable recovery code", () => {
    const parsed = parseReleaseEvidenceBundle(READY_RELEASE_BUNDLE);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const mismatched = {
      ...parsed.value,
      packDryRun: {
        ...parsed.value.packDryRun,
        fileCount: parsed.value.packDryRun.fileCount + 1
      }
    };

    const codes = checkReleaseEvidenceBundle(parseReleaseEvidenceBundle(mismatched), READY_RELEASE_EXPECTATION).issues.map((issue) => issue.code);

    expect(codes).toContain(RELEASE_RECOVERY_CODES.packFileCountMismatch);
  });
});
