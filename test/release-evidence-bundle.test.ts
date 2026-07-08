import { describe, expect, test } from "bun:test";
import releaseManifest from "../docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json" with { type: "json" };
import packageJson from "../package.json" with { type: "json" };
import { RELEASE_RECOVERY_CODES } from "../src/recovery-codes";
import {
  RELEASE_EVIDENCE_TARGETS,
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
  "docs/CASE_STUDIES/evidence/release-workflow/release-plan.json",
  "docs/PRODUCT_READINESS.md"
] as const;

const RELEASE_EXPECTATION = {
  packageJsonVersion: packageJson.version,
  cliVersion: packageJson.version,
  tag: `v${packageJson.version}`
} as const;

describe("ReleaseEvidenceBundleV1", () => {
  test("parses existing release manifest and renders only plan targets", () => {
    const parsed = parseReleaseEvidenceBundle(releaseManifest);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const rendered = renderReleaseEvidenceBundle(parsed.value);

    expect(RELEASE_EVIDENCE_TARGETS).toEqual(PLAN_TARGETS);
    expect(Object.keys(rendered).sort()).toEqual([...PLAN_TARGETS].sort());
    expect(rendered["docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json"]).toContain('"packageJsonVersion": "0.1.15"');
    expect(rendered["docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt"]).toContain(releaseManifest.githubActions.runUrl);
    expect(rendered["docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt"]).toContain(releaseManifest.installSmoke.command);
    expect(rendered["docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt"]).toContain("Total files: 146");
  });

  test("rejects malformed input with a stable recovery code", () => {
    const validation = checkReleaseEvidenceBundle(parseReleaseEvidenceBundle({ schemaVersion: 1 }), RELEASE_EXPECTATION);

    expect(validation.status).toBe("fail");
    expect(validation.issues.map((issue) => issue.code)).toEqual([RELEASE_RECOVERY_CODES.malformedInput]);
  });

  test("mismatch rejects package, CLI, tag, and pack versions with stable recovery codes", () => {
    const parsed = parseReleaseEvidenceBundle(releaseManifest);

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

    const codes = checkReleaseEvidenceBundle(parseReleaseEvidenceBundle(mismatched), RELEASE_EXPECTATION).issues.map((issue) => issue.code);

    expect(codes).toContain(RELEASE_RECOVERY_CODES.packageJsonVersionMismatch);
    expect(codes).toContain(RELEASE_RECOVERY_CODES.versionMismatch);
    expect(codes).toContain(RELEASE_RECOVERY_CODES.tagMismatch);
    expect(codes).toContain(RELEASE_RECOVERY_CODES.packVersionMismatch);
  });
});
