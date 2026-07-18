import { describe, expect, test } from "bun:test";
import { formatPlanAnalysis, planAnalysisDigest, validatePlanAnalysisShape } from "../src/plan-analysis-shape";

const weights = {
  ambiguity: 25,
  impact: 20,
  irreversibility: 20,
  externality: 15,
  verification_gap: 20,
} as const;

type DimensionId = keyof typeof weights;

function analysis(levels: Partial<Record<DimensionId, number>> = {}): Record<string, unknown> {
  const dimensions = (Object.keys(weights) as DimensionId[]).map((id) => {
    const level = levels[id] ?? 2;
    return {
      id,
      level,
      points: Math.round(level / 4 * weights[id]),
      reasons: ["RFC-defined assessment."],
    };
  });
  const score = dimensions.reduce((total, dimension) => total + dimension.points, 0);
  const selectedMode = score <= 24 ? "direct" : score <= 54 ? "focused" : "deep";
  return {
    schemaVersion: "boulder.plan-analysis.v1",
    runId: "5a9c8d44-0000-4000-8000-000000000000",
    taskHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    requestedFriction: null,
    selectedMode,
    score,
    confidence: "high",
    dimensions,
    hardOverrides: [],
    questionBudget: selectedMode === "direct" ? 0 : selectedMode === "focused" ? 3 : null,
    approvalMinimum: selectedMode === "direct" ? ["plan"] : ["plan", "execution"],
  };
}

function issuePaths(value: unknown): readonly string[] {
  return validatePlanAnalysisShape(value).map((entry) => `${entry.code}:${entry.path}`);
}

describe("plan analysis v1 shape", () => {
  test("accepts RFC v1 field names and all five weighted dimensions", () => {
    const value = analysis();

    expect(validatePlanAnalysisShape(value)).toEqual([]);
    expect(formatPlanAnalysis(value).slice(0, 1)).toBe("{");
  });

  test("rejects legacy or missing v1 fields", () => {
    const value = analysis();
    value.totalScore = value.score;
    delete value.score;

    expect(issuePaths(value)).toContain("plan.analysis.schema_invalid:$");
    expect(issuePaths(value)).toContain("plan.analysis.schema_invalid:score");
  });

  test("accepts level boundaries and RFC rounding for each fixed weight", () => {
    const minimum = analysis({ ambiguity: 0, impact: 0, irreversibility: 0, externality: 0, verification_gap: 0 });
    const maximum = analysis({ ambiguity: 4, impact: 4, irreversibility: 4, externality: 4, verification_gap: 4 });
    const rounded = analysis({ ambiguity: 1, impact: 1, irreversibility: 3, externality: 3, verification_gap: 1 });

    expect((minimum.dimensions as { points: number }[]).map((dimension) => dimension.points)).toEqual([0, 0, 0, 0, 0]);
    expect((maximum.dimensions as { points: number }[]).map((dimension) => dimension.points)).toEqual([25, 20, 20, 15, 20]);
    expect((rounded.dimensions as { points: number }[]).map((dimension) => dimension.points)).toEqual([6, 5, 15, 11, 5]);
    expect(validatePlanAnalysisShape(minimum)).toEqual([]);
    expect(validatePlanAnalysisShape(maximum)).toEqual([]);
    expect(validatePlanAnalysisShape(rounded)).toEqual([]);
  });

  test("rejects tampered dimension arithmetic with a stable dimensions error", () => {
    const value = analysis();
    ((value.dimensions as { points: number }[])[0]).points = 12;

    expect(issuePaths(value)).toEqual(["plan.analysis.dimension_invalid:dimensions"]);
  });

  test("rejects tampered total arithmetic with a stable score error", () => {
    const value = analysis();
    value.score = 41;

    expect(issuePaths(value)).toEqual(["plan.analysis.schema_invalid:score"]);
  });

  test("calculates a digest over the exact v1 payload", () => {
    const value = analysis();
    const originalDigest = planAnalysisDigest(value);
    value.runId = "another-run";

    expect(planAnalysisDigest(value)).not.toBe(originalDigest);
    let digestError = "";
    try { planAnalysisDigest({ invalid: Number.NaN }); } catch (error) { digestError = error instanceof Error ? error.message : String(error); }
    expect(digestError).toContain("Planning values must be finite JSON values.");
  });
  test("rejects mode, question budget, approval, and hard override contradictions", () => {
    const cases: readonly [string, (value: Record<string, unknown>) => void, string][] = [
      ["score mode", (value) => { value.selectedMode = "deep"; }, "selectedMode"],
      ["low-confidence boundary", (value) => {
        const dimensions = value.dimensions as { level: number; points: number }[];
        dimensions.forEach((dimension) => { dimension.level = 0; dimension.points = 0; });
        dimensions[2].level = 4;
        dimensions[2].points = 20;
        value.score = 20;
        value.confidence = "low";
        value.selectedMode = "direct";
        value.questionBudget = 0;
        value.approvalMinimum = ["plan"];
      }, "selectedMode"],
      ["requested friction", (value) => { value.requestedFriction = "deep"; }, "selectedMode"],
      ["override minimum", (value) => { value.hardOverrides = ["security-sensitive"]; }, "selectedMode"],
      ["focused null budget", (value) => { value.questionBudget = null; }, "questionBudget"],
      ["focused budget", (value) => { value.questionBudget = 4; }, "questionBudget"],
      ["deep budget", (value) => { value.selectedMode = "deep"; value.questionBudget = 3; }, "questionBudget"],
      ["approval", (value) => { value.approvalMinimum = ["plan"]; }, "approvalMinimum"],
      ["external approval", (value) => { value.selectedMode = "deep"; value.hardOverrides = ["release-or-production"]; value.questionBudget = null; }, "approvalMinimum"],
      ["unknown override", (value) => { value.hardOverrides = ["unknown"]; }, "hardOverrides"],
      ["duplicate override", (value) => { value.hardOverrides = ["public-contract", "public-contract"]; }, "hardOverrides"],
      ["override order", (value) => { value.hardOverrides = ["public-contract", "security-sensitive"]; }, "hardOverrides"],
    ];
    for (const [, mutate, path] of cases) {
      const value = analysis();
      mutate(value);
      expect(issuePaths(value)).toContain(`plan.analysis.schema_invalid:${path}`);
    }
  });
});
