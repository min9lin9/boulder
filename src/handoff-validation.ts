import { readFile } from "node:fs/promises";

export type HandoffValidationIssue = {
  readonly path: string;
  readonly message: string;
};

export type HandoffValidationResult = {
  readonly status: "pass" | "fail";
  readonly issues: readonly HandoffValidationIssue[];
};

type JsonObject = Record<string, unknown>;

export async function validateHandoffFile(path: string): Promise<HandoffValidationResult> {
  const content = await readFile(path, "utf8");
  return validateHandoffJson(JSON.parse(content) as unknown);
}

export function validateHandoffJson(value: unknown): HandoffValidationResult {
  const issues: HandoffValidationIssue[] = [];
  if (!isObject(value)) {
    return { status: "fail", issues: [{ path: "$", message: "handoff must be an object" }] };
  }
  requireNonEmptyArray(value, "acceptanceCriteria", issues);
  requireNonEmptyArray(value, "officialDocsSources", issues);
  requireObject(value, "gjcPlan", issues);
  requireObject(value, "lazycodexResult", issues);
  const gjcPlan = value["gjcPlan"];
  if (isObject(gjcPlan)) {
    requireNonEmptyArray(gjcPlan, "acceptanceCriteria", issues, "gjcPlan.acceptanceCriteria");
    requireNonEmptyArray(gjcPlan, "manualQaPlan", issues, "gjcPlan.manualQaPlan");
  }
  const lazycodexResult = value["lazycodexResult"];
  if (isObject(lazycodexResult)) {
    requireArray(lazycodexResult, "changedFiles", issues, "lazycodexResult.changedFiles");
    requireNonEmptyArray(lazycodexResult, "verificationCommands", issues, "lazycodexResult.verificationCommands");
    if (lazycodexResult["readyForReview"] !== true) {
      issues.push({ path: "lazycodexResult.readyForReview", message: "must be true" });
    }
  }
  return { status: issues.length ? "fail" : "pass", issues };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: JsonObject, key: string, issues: HandoffValidationIssue[]): void {
  if (!isObject(value[key])) {
    issues.push({ path: key, message: "must be an object" });
  }
}

function requireArray(
  value: JsonObject,
  key: string,
  issues: HandoffValidationIssue[],
  path = key
): void {
  if (!Array.isArray(value[key])) {
    issues.push({ path, message: "must be an array" });
  }
}

function requireNonEmptyArray(
  value: JsonObject,
  key: string,
  issues: HandoffValidationIssue[],
  path = key
): void {
  const item = value[key];
  if (!Array.isArray(item) || item.length === 0) {
    issues.push({ path, message: "must be a non-empty array" });
  }
}
