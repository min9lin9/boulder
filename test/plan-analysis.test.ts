import { describe, expect, test } from "bun:test";
import {
  analyzePlanTask,
  normalizePlanTask,
  type PlanAnalysisInspection,
  type PlanFriction,
} from "../src/plan-analysis";

const base = {
  runId: "run-fixed",
  task: "Update src/example.ts with tests and verification.",
  inspection: { files: ["src/example.ts"], verificationAvailable: true },
  knownVerificationCommands: ["bun test test/example.test.ts"],
} as const;
type ScoreThresholdCase = readonly [
  name: string,
  task: string,
  inspection: PlanAnalysisInspection,
  commands: readonly string[],
  selectedMode: PlanFriction,
];

const scoreThresholdCases: readonly ScoreThresholdCase[] = [
  ["direct boundary", "Update src/example.ts with tests and verification.", { files: ["src/example.ts"], verificationAvailable: true }, ["bun test"], "direct"],
  ["focused boundary", "Update public API with tests and verification.", { files: ["src/a.ts", "src/b.ts"], publicApi: true, verificationAvailable: true }, ["bun test"], "focused"],
  ["deep boundary", "Perform a destructive operation with tests and verification.", { destructive: true, verificationAvailable: true }, ["bun test"], "deep"],
];

type HardOverrideCase = readonly [
  override: string,
  task: string,
  selectedMode: PlanFriction,
];

const hardOverrideCases: readonly HardOverrideCase[] = [
  ["security-sensitive", "Review security with tests and verification.", "deep"],
  ["destructive-operation", "Perform data migration with tests and verification.", "deep"],
  ["release-or-production", "Prepare release with tests and verification.", "deep"],
  ["public-contract", "Change public API with tests and verification.", "focused"],
  ["external-dependency", "Add new external dependency with tests and verification.", "focused"],
  ["external-provider", "Make credential access with tests and verification.", "deep"],
  ["high-accuracy-review", "Perform high-accuracy review with tests and verification.", "deep"],
];

describe("deterministic plan analysis", () => {
  test("uses RFC weights, levels, rounded points, and direct question policy", () => {
    const analysis = analyzePlanTask(base);
    expect(analysis.dimensions).toEqual([
      { id: "ambiguity", level: 1, points: 6, reasons: ["ambiguity assessed at level 1."] },
      { id: "impact", level: 1, points: 5, reasons: ["impact assessed at level 1."] },
      { id: "irreversibility", level: 0, points: 0, reasons: ["irreversibility assessed at level 0."] },
      { id: "externality", level: 0, points: 0, reasons: ["externality assessed at level 0."] },
      { id: "verification_gap", level: 0, points: 0, reasons: ["verification_gap assessed at level 0."] },
    ]);
    expect(analysis.score).toBe(11);
    expect(analysis.selectedMode).toBe("direct");
    expect(analysis.questionBudget).toBe(0);
    expect(analysis.approvalMinimum).toEqual(["plan"]);
  });

  for (const [name, task, inspection, commands, selectedMode] of scoreThresholdCases) {
    test(`selects ${name} score threshold`, () => {
      expect(analyzePlanTask({ ...base, task, inspection, knownVerificationCommands: commands }).selectedMode).toBe(selectedMode);
    });
  }

  for (const [override, task, selectedMode] of hardOverrideCases) {
    test(`records hard override ${override}`, () => {
      const analysis = analyzePlanTask({ ...base, task, requestedFriction: "direct" });
      expect(analysis.hardOverrides).toContain(override);
      expect(analysis.selectedMode).toBe(selectedMode);
    });
  }

  test("honors higher requested friction and cannot lower an override", () => {
    expect(analyzePlanTask({ ...base, requestedFriction: "deep" }).selectedMode).toBe("deep");
    expect(analyzePlanTask({ ...base, task: "Change public API with tests and verification.", requestedFriction: "direct" }).selectedMode).toBe("focused");
  });
  test("does not upgrade low-confidence scores already above a threshold", () => {
    const analysis = analyzePlanTask({
      runId: "run-low-confidence",
      task: "Update src/example.ts with tests and verification.",
    });
    expect(analysis.score >= 25).toBe(true);
    expect(analysis.score <= 30).toBe(true);
    expect(analysis.confidence).toBe("low");
    expect(analysis.selectedMode).toBe("focused");
  });

  test("distinguishes reversible migration from data migration", () => {
    const reversible = analyzePlanTask({ ...base, task: "Perform reversible migration with tests and verification." });
    const dataMigration = analyzePlanTask({ ...base, task: "Perform data migration with tests and verification." });

    expect(reversible.dimensions.find((dimension) => dimension.id === "irreversibility")?.level).toBe(2);
    expect(reversible.hardOverrides).not.toContain("destructive-operation");
    expect(dataMigration.dimensions.find((dimension) => dimension.id === "irreversibility")?.level).toBe(4);
    expect(dataMigration.hardOverrides).toContain("destructive-operation");
    expect(dataMigration.selectedMode).toBe("deep");
  });

  test("scores a network read as externality level two", () => {
    const analysis = analyzePlanTask({ ...base, task: "Read network metadata with tests and verification." });
    expect(analysis.dimensions.find((dimension) => dimension.id === "externality")).toEqual({
      id: "externality",
      level: 2,
      points: 8,
      reasons: ["externality assessed at level 2."]
    });
  });

  test("normalizes task whitespace and excludes volatile run id from task digest", () => {
    const left = analyzePlanTask({ ...base, task: "  Update   src/example.ts\nwith tests and verification. ", runId: "run-one" });
    const right = analyzePlanTask({ ...base, task: "Update src/example.ts with tests and verification.", runId: "run-two" });
    expect(normalizePlanTask("  a\n b  ")).toBe("a b");
    expect(left.taskHash).toBe(right.taskHash);
    expect({ ...left, runId: "fixed" }).toEqual({ ...right, runId: "fixed" });
  });

  test("does not mutate supplied inspection or input arrays", () => {
    const input = { ...base, protectedPaths: ["src/config.ts"], knownVerificationCommands: ["bun test"] };
    const before = structuredClone(input);
    analyzePlanTask(input);
    expect(input).toEqual(before);
  });
});
