import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { validateCriticReview } from "../src/critic-review";
import { validateExecutionPacket } from "../src/execution-packet";
import { canonicalizePlanningValue, sha256Digest } from "../src/planning-canonical";
import { validateApprovalChallengeHistory } from "../src/plan-receipts";
import {
  validatePlannerBenchmarkProvenance,
  validatePlannerBenchmarkReport,
  validatePlannerBenchmarkTrustRoot,
  validatePlannerEvidenceBundle,
  validatePlannerStudyManifest,
  validatePlannerStudyRawRun
} from "../src/planner-benchmark";

const load = async (name: "valid" | "invalid"): Promise<Record<string, any>> => {
  const path = decodeURIComponent(new URL(`../fixtures/planning-contracts/${name}.json`, import.meta.url).pathname);
  return JSON.parse(await readFile(path, "utf8"));
};
const loadBenchmarkFixture = async (name: "study-root" | "invalid-study-root"): Promise<Record<string, any>> => {
  const path = decodeURIComponent(new URL(`../fixtures/planner-benchmarks/${name}.json`, import.meta.url).pathname);
  return JSON.parse(await readFile(path, "utf8"));
};
const withChallengeDigest = (history: Record<string, any>) => {
  const challenge = { ...history.previousChallenge };
  const { challengeDigest: _challengeDigest, ...payload } = challenge;
  return { ...history, previousChallenge: { ...challenge, challengeDigest: sha256Digest(canonicalizePlanningValue(payload)) } };
};
const benchmarkValidators = {
  trustRoot: validatePlannerBenchmarkTrustRoot,
  manifest: validatePlannerStudyManifest,
  rawRun: validatePlannerStudyRawRun,
  evidenceBundle: validatePlannerEvidenceBundle,
  benchmarkReport: validatePlannerBenchmarkReport
} as const;

test("checked-in valid planning contract fixtures satisfy their validators", async () => {
  const valid = await load("valid");
  expect(validateCriticReview(valid.criticReview)).toEqual({ valid: true, issues: [] });
  expect(validateExecutionPacket(valid.executionPacket)).toEqual([]);
  expect(validateApprovalChallengeHistory(withChallengeDigest(valid.challengeHistory))).toEqual([]);
  for (const [family, validator] of Object.entries(benchmarkValidators)) expect(validator(valid[family])).toEqual([]);
  expect(validatePlannerEvidenceBundle({ ...valid.evidenceBundle, normalizedRuns: [valid.normalizedRun] })).toEqual([]);
});

test("checked-in invalid planning contract fixtures retain targeted stable errors", async () => {
  const valid = await load("valid");
  const invalid = await load("invalid");
  expect(validateCriticReview(invalid.criticReview.value).issues.map((issue) => issue.id)).toContain(invalid.criticReview.error);
  expect(validateExecutionPacket(invalid.executionPacket.value).map((issue) => issue.code)).toContain(invalid.executionPacket.error);
  expect(validateApprovalChallengeHistory(invalid.challengeHistory.value).map((issue) => issue.id)).toContain(invalid.challengeHistory.error);
  for (const [family, validator] of Object.entries(benchmarkValidators)) {
    const fixture = invalid[family];
    expect(validator(fixture.value).map((issue) => issue.code)).toContain(fixture.error);
  }
  expect(validatePlannerEvidenceBundle({ ...valid.evidenceBundle, normalizedRuns: [{ ...valid.normalizedRun, ...invalid.normalizedRun.mutation }] }).map((issue) => issue.code)).toContain(invalid.normalizedRun.error);
  for (const fixture of invalid.stableErrors.slice(0, 2)) {
    const value = { ...valid[fixture.family], ...fixture.mutation };
    const validator = fixture.family === "executionPacket" ? validateExecutionPacket : validatePlannerStudyRawRun;
    expect(validator(value).map((issue) => issue.code)).toContain(fixture.error);
  }
  expect(validatePlannerBenchmarkTrustRoot({ ...valid.trustRoot, ...invalid.stableErrors[2].mutation }).map((issue) => issue.code)).toContain(invalid.stableErrors[2].error);
  const provenanceIssues = await validatePlannerBenchmarkProvenance({
    trustRoot: valid.trustRoot,
    protocol: { ...valid.protocol, ...invalid.protocol.mutation },
    manifest: valid.manifest,
    rawRuns: [valid.rawRun],
    bundle: { ...valid.evidenceBundle, normalizedRuns: [valid.normalizedRun] },
    report: valid.benchmarkReport
  });
  expect(provenanceIssues.map((issue) => issue.code)).toContain(invalid.protocol.error);
});
test("study-root fixtures retain the preregistered 36-run matrix without field outcomes", async () => {
  const valid = await loadBenchmarkFixture("study-root");
  const invalid = await loadBenchmarkFixture("invalid-study-root");
  expect(valid.schemaVersion).toBe("boulder.planner-study-root.v1");
  expect(valid.fixtureOnly).toBe(true);
  expect(valid.study.fieldStudyStatus).toBe("NOT_PERFORMED");
  expect(valid.study.matrix.planners).toHaveLength(3);
  expect(valid.study.matrix.taskClasses).toHaveLength(3);
  expect(valid.study.matrix.repositories).toHaveLength(2);
  expect(valid.study.matrix.repeats).toEqual([1, 2]);
  expect(valid.study.matrix.requiredRunCount).toBe(36);
  expect(valid.manifest.cells).toHaveLength(18);
  expect(valid.evidenceBundle.normalizedRuns).toEqual([]);
  expect(invalid.study.matrix.requiredRunCount).toBe(35);
});
