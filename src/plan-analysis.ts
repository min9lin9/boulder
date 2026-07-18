import { canonicalizePlanningValue, sha256Digest } from "./planning-canonical.js";
import type { PlanAnalysis, PlanAnalysisDimension, PlanAnalysisDimensionId } from "./plan-analysis-shape.js";

export type PlanFriction = "direct" | "focused" | "deep";

export interface PlanAnalysisInspection {
  readonly files?: readonly string[];
  readonly publicApi?: boolean;
  readonly release?: boolean;
  readonly destructive?: boolean;
  readonly credentials?: boolean;
  readonly externalProvider?: boolean;
  readonly verificationAvailable?: boolean;
}

export interface PlanAnalysisInput {
  readonly task: string;
  readonly runId: string;
  readonly requestedFriction?: PlanFriction | null;
  readonly inspection?: PlanAnalysisInspection;
  readonly profile?: Readonly<Record<string, unknown>>;
  readonly manifest?: Readonly<Record<string, unknown>>;
  readonly protectedPaths?: readonly string[];
  readonly knownVerificationCommands?: readonly string[];
}

const dimensions: readonly PlanAnalysisDimensionId[] = ["ambiguity", "impact", "irreversibility", "externality", "verification_gap"];
const weights: Readonly<Record<PlanAnalysisDimensionId, number>> = {
  ambiguity: 25,
  impact: 20,
  irreversibility: 20,
  externality: 15,
  verification_gap: 20,
};
const modes: readonly PlanFriction[] = ["direct", "focused", "deep"];

/** Normalizes only presentation-insignificant task whitespace. */
export function normalizePlanTask(task: string): string {
  return task.trim().replace(/\s+/g, " ");
}

/** Produces a pure RFC v1 analysis; it never inspects the filesystem or invokes tools. */
export function analyzePlanTask(input: PlanAnalysisInput): PlanAnalysis {
  const task = normalizePlanTask(input.task);
  if (task.length === 0) throw new TypeError("Task must be non-empty.");
  if (input.runId.trim().length === 0) throw new TypeError("Run id must be non-empty.");

  const lowerTask = task.toLowerCase();
  const inspection = input.inspection;
  const protectedPaths = input.protectedPaths ?? [];
  const verificationCommands = input.knownVerificationCommands ?? [];
  const overrides = hardOverrides(lowerTask, inspection, protectedPaths);
  const dimensionValues = dimensionLevels(lowerTask, inspection, protectedPaths, verificationCommands);
  const analysisDimensions = dimensions.map((id) => dimension(id, dimensionValues[id]));
  const score = analysisDimensions.reduce((total, entry) => total + entry.points, 0);
  const confidence = confidenceFor(lowerTask, inspection, verificationCommands);
  let selectedMode = scoreMode(score);
  if (confidence === "low" && nearThresholdFromBelow(score)) selectedMode = upgrade(selectedMode);
  const requestedFriction = input.requestedFriction ?? null;
  if (requestedFriction !== null && modeIndex(requestedFriction) > modeIndex(selectedMode)) selectedMode = requestedFriction;
  for (const override of overrides) selectedMode = atLeast(selectedMode, override.minimumMode);

  return {
    schemaVersion: "boulder.plan-analysis.v1",
    runId: input.runId,
    taskHash: sha256Digest(canonicalizePlanningValue(task)),
    requestedFriction,
    selectedMode,
    score,
    confidence,
    dimensions: analysisDimensions,
    hardOverrides: overrides.map((entry) => entry.id),
    questionBudget: selectedMode === "direct" ? 0 : selectedMode === "focused" ? 3 : null,
    approvalMinimum: approvals(selectedMode, overrides),
  };
}

function dimension(id: PlanAnalysisDimensionId, level: number): PlanAnalysisDimension {
  return { id, level: level as 0 | 1 | 2 | 3 | 4, points: Math.round(level / 4 * weights[id]), reasons: [reason(id, level)] };
}

function dimensionLevels(task: string, inspection: PlanAnalysisInspection | undefined, protectedPaths: readonly string[], verificationCommands: readonly string[]): Record<PlanAnalysisDimensionId, number> {
  const ambiguous = /\b(figure out|whatever|somehow|improve|fix it|review)\b/.test(task) || !/\b(tests?|verify|verification|acceptance|must|should)\b/.test(task);
  const publicChange = Boolean(inspection?.publicApi) || /\b(public api|config|schema|package|packaging)\b/.test(task) || protectedPaths.length > 0;
  const destructive = Boolean(inspection?.destructive) || /\b(data migration|delete|deletion|destructive|data loss|production mutation)\b/.test(task);
  const migration = /\bmigration\b/.test(task);
  const external = Boolean(inspection?.credentials || inspection?.externalProvider) || /\b(credential|secret|provider|publish|deploy)\b/.test(task);
  const files = inspection?.files?.length ?? 0;
  return {
    ambiguity: ambiguous ? 3 : /\b(or|alternative|choice)\b/.test(task) ? 2 : 1,
    impact: inspection?.release || /\b(release|repo-wide|cross-component)\b/.test(task) ? 4 : publicChange ? 3 : files > 1 ? 2 : 1,
    irreversibility: destructive ? 4 : migration ? 2 : 0,
    externality: external ? 4 : /\b(dependency|pinned sha|network)\b/.test(task) ? 2 : 0,
    verification_gap: inspection?.verificationAvailable === false || verificationCommands.length === 0 ? 3 : /\b(manual|partial)\b/.test(task) ? 2 : 0,
  };
}

function hardOverrides(task: string, inspection: PlanAnalysisInspection | undefined, protectedPaths: readonly string[]): readonly { readonly id: string; readonly minimumMode: PlanFriction; readonly external: boolean }[] {
  const entries: { id: string; minimumMode: PlanFriction; external: boolean }[] = [];
  const add = (id: string, minimumMode: PlanFriction, external = false) => entries.push({ id, minimumMode, external });
  if (/\b(auth|authorization|security|pii|secret|compliance)\b/.test(task)) add("security-sensitive", "deep");
  if (inspection?.destructive || /\b(data migration|delete|deletion|destructive operation)\b/.test(task)) add("destructive-operation", "deep");
  if (inspection?.release || /\b(release|publish|production deployment|deploy to production)\b/.test(task)) add("release-or-production", "deep", true);
  if (inspection?.publicApi || protectedPaths.length > 0 || /\b(public api|config|schema|packaging)\b/.test(task)) add("public-contract", "focused");
  if (/\b(new external dependency|pinned sha)\b/.test(task)) add("external-dependency", "focused");
  if (inspection?.credentials || inspection?.externalProvider || /\b(credential access|external provider call)\b/.test(task)) add("external-provider", "deep", true);
  if (/\b(interview|high-accuracy review)\b/.test(task)) add("high-accuracy-review", "deep");
  return entries;
}

function confidenceFor(task: string, inspection: PlanAnalysisInspection | undefined, verificationCommands: readonly string[]): "low" | "medium" | "high" {
  if (!inspection || verificationCommands.length === 0) return "low";
  if (/\b(unknown|unclear|tbd)\b/.test(task)) return "low";
  return /\b(tests?|verify|verification|acceptance)\b/.test(task) ? "high" : "medium";
}

function scoreMode(score: number): PlanFriction { return score <= 24 ? "direct" : score <= 54 ? "focused" : "deep"; }
function nearThresholdFromBelow(score: number): boolean { return (score >= 20 && score <= 24) || (score >= 50 && score <= 54); }
function upgrade(mode: PlanFriction): PlanFriction { return mode === "direct" ? "focused" : "deep"; }
function modeIndex(mode: PlanFriction): number { return modes.indexOf(mode); }
function atLeast(left: PlanFriction, right: PlanFriction): PlanFriction { return modeIndex(left) >= modeIndex(right) ? left : right; }
function approvals(mode: PlanFriction, overrides: readonly { readonly external: boolean }[]): readonly ("plan" | "execution" | "external")[] {
  const result: ("plan" | "execution" | "external")[] = mode === "direct" ? ["plan"] : ["plan", "execution"];
  if (overrides.some((entry) => entry.external)) result.push("external");
  return result;
}
function reason(id: PlanAnalysisDimensionId, level: number): string { return `${id} assessed at level ${level}.`; }
