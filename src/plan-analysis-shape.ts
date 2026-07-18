import { canonicalizePlanningValue, sha256Digest } from "./planning-canonical.js";

export type PlanAnalysisIssueCode =
  | "plan.analysis.schema_invalid"
  | "plan.analysis.digest_invalid"
  | "plan.analysis.dimension_invalid";

export interface PlanAnalysisIssue {
  readonly code: PlanAnalysisIssueCode;
  readonly path: string;
  readonly message: string;
}

export type PlanAnalysisDimensionId =
  | "ambiguity"
  | "impact"
  | "irreversibility"
  | "externality"
  | "verification_gap";

export interface PlanAnalysisDimension {
  readonly id: PlanAnalysisDimensionId;
  readonly level: 0 | 1 | 2 | 3 | 4;
  readonly points: number;
  readonly reasons: readonly string[];
}

export interface PlanAnalysis {
  readonly schemaVersion: "boulder.plan-analysis.v1";
  readonly runId: string;
  readonly taskHash: string;
  readonly requestedFriction: "direct" | "focused" | "deep" | null;
  readonly selectedMode: "direct" | "focused" | "deep";
  readonly score: number;
  readonly confidence: "low" | "medium" | "high";
  readonly dimensions: readonly PlanAnalysisDimension[];
  readonly hardOverrides: readonly string[];
  readonly questionBudget: number | null;
  readonly approvalMinimum: readonly ("plan" | "execution" | "external")[];
}

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const dimensions: readonly PlanAnalysisDimensionId[] = ["ambiguity", "impact", "irreversibility", "externality", "verification_gap"];
const weights: Readonly<Record<PlanAnalysisDimensionId, number>> = {
  ambiguity: 25,
  impact: 20,
  irreversibility: 20,
  externality: 15,
  verification_gap: 20,
};
const modes = ["direct", "focused", "deep"] as const;
const hardOverridePolicies = [
  { id: "security-sensitive", minimumMode: "deep", external: false },
  { id: "destructive-operation", minimumMode: "deep", external: false },
  { id: "release-or-production", minimumMode: "deep", external: true },
  { id: "public-contract", minimumMode: "focused", external: false },
  { id: "external-dependency", minimumMode: "focused", external: false },
  { id: "external-provider", minimumMode: "deep", external: true },
  { id: "high-accuracy-review", minimumMode: "deep", external: false },
] as const;

const issue = (code: PlanAnalysisIssueCode, path: string, message: string): PlanAnalysisIssue => ({ code, path, message });

export function planAnalysisDigest(value: unknown): string {
  return sha256Digest(canonicalizePlanningValue(value));
}

export function validatePlanAnalysisShape(value: unknown): readonly PlanAnalysisIssue[] {
  const issues: PlanAnalysisIssue[] = [];
  if (!isRecord(value)) return [issue("plan.analysis.schema_invalid", "$", "Plan analysis must be an object.")];
  if (!hasExactKeys(value, ["schemaVersion", "runId", "taskHash", "requestedFriction", "selectedMode", "score", "confidence", "dimensions", "hardOverrides", "questionBudget", "approvalMinimum"])) issues.push(issue("plan.analysis.schema_invalid", "$", "Plan analysis fields must match boulder.plan-analysis.v1."));
  if (value.schemaVersion !== "boulder.plan-analysis.v1") issues.push(issue("plan.analysis.schema_invalid", "schemaVersion", "Unsupported plan analysis schema."));
  if (!nonEmpty(value.runId)) issues.push(issue("plan.analysis.schema_invalid", "runId", "Run id must be non-empty."));
  if (typeof value.taskHash !== "string" || !digestPattern.test(value.taskHash)) issues.push(issue("plan.analysis.digest_invalid", "taskHash", "Task hash must be a sha256 digest."));
  if (!(value.requestedFriction === null || value.requestedFriction === "direct" || value.requestedFriction === "focused" || value.requestedFriction === "deep")) issues.push(issue("plan.analysis.schema_invalid", "requestedFriction", "Requested friction is invalid."));
  if (!["direct", "focused", "deep"].includes(value.selectedMode as string)) issues.push(issue("plan.analysis.schema_invalid", "selectedMode", "Selected mode is invalid."));
  if (!isScore(value.score)) issues.push(issue("plan.analysis.schema_invalid", "score", "Score must be an integer from 0 through 100."));
  if (!["low", "medium", "high"].includes(value.confidence as string)) issues.push(issue("plan.analysis.schema_invalid", "confidence", "Confidence is invalid."));
  if (!validDimensions(value.dimensions)) issues.push(issue("plan.analysis.dimension_invalid", "dimensions", "Dimensions must include each RFC dimension exactly once with correct weighted points."));
  if (Array.isArray(value.dimensions) && isScore(value.score) && dimensionsHaveValidPoints(value.dimensions) && value.score !== sumPoints(value.dimensions)) issues.push(issue("plan.analysis.schema_invalid", "score", "Score must equal the sum of dimension points."));
  const overrideValid = validHardOverrides(value.hardOverrides);
  const hardOverrides: readonly string[] = overrideValid ? value.hardOverrides as readonly string[] : [];
  if (!overrideValid) issues.push(issue("plan.analysis.schema_invalid", "hardOverrides", "Hard overrides must be known, unique, and in canonical order."));
  if (!(value.questionBudget === null || (Number.isInteger(value.questionBudget) && typeof value.questionBudget === "number" && value.questionBudget >= 0))) issues.push(issue("plan.analysis.schema_invalid", "questionBudget", "Question budget must be a non-negative integer or null."));
  if (isMode(value.selectedMode) && !validQuestionBudget(value.questionBudget, value.selectedMode)) issues.push(issue("plan.analysis.schema_invalid", "questionBudget", "Question budget must match the selected mode."));
  if (!validApprovals(value.approvalMinimum)) issues.push(issue("plan.analysis.schema_invalid", "approvalMinimum", "Approval minimum is invalid."));
  if (isMode(value.selectedMode) && overrideValid && !sameArray(value.approvalMinimum, expectedApprovals(value.selectedMode, hardOverrides))) issues.push(issue("plan.analysis.schema_invalid", "approvalMinimum", "Approval minimum must match the selected mode and hard overrides."));
  if (isScore(value.score) && isConfidence(value.confidence) && isMode(value.selectedMode) && (value.requestedFriction === null || isMode(value.requestedFriction)) && overrideValid && value.selectedMode !== expectedMode(value.score, value.confidence, value.requestedFriction, hardOverrides)) issues.push(issue("plan.analysis.schema_invalid", "selectedMode", "Selected mode must match score, confidence, requested friction, and hard overrides."));
  return issues;
}

export function formatPlanAnalysis(value: unknown): string {
  const issues = validatePlanAnalysisShape(value);
  if (issues.length > 0) throw new TypeError(`Invalid plan analysis: ${issues.map((entry) => entry.path).join(", ")}`);
  return canonicalizePlanningValue(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(nonEmpty);
}

function validDimensions(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== dimensions.length) return false;
  const seen = new Set<string>();
  return value.every((dimension) => {
    if (!isRecord(dimension) || !hasExactKeys(dimension, ["id", "level", "points", "reasons"])) return false;
    const id = dimension.id;
    if (typeof id !== "string" || !dimensions.includes(id as PlanAnalysisDimensionId) || seen.has(id)) return false;
    seen.add(id);
    return Number.isInteger(dimension.level) && typeof dimension.level === "number" && dimension.level >= 0 && dimension.level <= 4
      && dimension.points === weightedPoints(dimension.level, weights[id as PlanAnalysisDimensionId])
      && stringArray(dimension.reasons) && dimension.reasons.length > 0;
  }) && seen.size === dimensions.length;
}

function dimensionsHaveValidPoints(value: readonly unknown[]): boolean {
  return value.every((dimension) => {
    if (!isRecord(dimension) || typeof dimension.id !== "string" || typeof dimension.level !== "number" || typeof dimension.points !== "number") return false;
    return dimensions.includes(dimension.id as PlanAnalysisDimensionId)
      && Number.isInteger(dimension.level)
      && dimension.level >= 0
      && dimension.level <= 4
      && dimension.points === weightedPoints(dimension.level, weights[dimension.id as PlanAnalysisDimensionId]);
  });
}

function weightedPoints(level: number, weight: number): number {
  return Math.round(level / 4 * weight);
}

function sumPoints(value: readonly unknown[]): number {
  return value.reduce<number>((total, dimension) => total + (isRecord(dimension) && typeof dimension.points === "number" ? dimension.points : 0), 0);
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

function validApprovals(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every((approval) => approval === "plan" || approval === "execution" || approval === "external") && new Set(value).size === value.length;
}
function isMode(value: unknown): value is PlanAnalysis["selectedMode"] {
  return typeof value === "string" && modes.includes(value as PlanAnalysis["selectedMode"]);
}

function isConfidence(value: unknown): value is PlanAnalysis["confidence"] {
  return value === "low" || value === "medium" || value === "high";
}

function validHardOverrides(value: unknown): value is readonly (typeof hardOverridePolicies[number]["id"])[] {
  if (!Array.isArray(value) || !value.every(nonEmpty)) return false;
  let previousIndex = -1;
  for (const id of value) {
    const index = hardOverridePolicies.findIndex((policy) => policy.id === id);
    if (index <= previousIndex) return false;
    previousIndex = index;
  }
  return true;
}

function expectedMode(score: number, confidence: PlanAnalysis["confidence"], requestedFriction: PlanAnalysis["requestedFriction"], hardOverrides: readonly string[]): PlanAnalysis["selectedMode"] {
  let mode: PlanAnalysis["selectedMode"] = score <= 24 ? "direct" : score <= 54 ? "focused" : "deep";
  if (confidence === "low" && ((score >= 20 && score <= 24) || (score >= 50 && score <= 54))) mode = mode === "direct" ? "focused" : "deep";
  if (requestedFriction !== null && modeIndex(requestedFriction) > modeIndex(mode)) mode = requestedFriction;
  for (const id of hardOverrides) {
    const policy = hardOverridePolicies.find((entry) => entry.id === id);
    if (policy && modeIndex(policy.minimumMode) > modeIndex(mode)) mode = policy.minimumMode;
  }
  return mode;
}

function validQuestionBudget(value: unknown, mode: PlanAnalysis["selectedMode"]): boolean {
  return mode === "direct"
    ? value === 0
    : mode === "focused"
      ? typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3
      : value === null;
}

function expectedApprovals(mode: PlanAnalysis["selectedMode"], hardOverrides: readonly string[]): readonly PlanAnalysis["approvalMinimum"][number][] {
  const approvals: PlanAnalysis["approvalMinimum"][number][] = mode === "direct" ? ["plan"] : ["plan", "execution"];
  if (hardOverrides.some((id) => hardOverridePolicies.find((entry) => entry.id === id)?.external)) approvals.push("external");
  return approvals;
}

function sameArray(value: unknown, expected: readonly unknown[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => entry === expected[index]);
}

function modeIndex(mode: PlanAnalysis["selectedMode"]): number {
  return modes.indexOf(mode);
}


function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}
