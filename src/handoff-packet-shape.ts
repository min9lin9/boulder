import type { HandoffPacket } from "./handoff-packet";

export function isHandoffPacket(value: unknown): value is HandoffPacket {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ["schemaVersion", "destination", "dataPolicy", "task", "contextSummary", "excludedContent"])) return false;
  const schemaVersion = value["schemaVersion"];
  const destination = value["destination"];
  const dataPolicy = value["dataPolicy"];
  const task = value["task"];
  const contextSummary = value["contextSummary"];
  const excludedContent = value["excludedContent"];
  if (schemaVersion !== "boulder.handoff.v1"
    || !isRecord(destination)
    || !isRecord(dataPolicy)
    || !isRecord(task)
    || !isRecord(contextSummary)
    || !isStringArray(excludedContent)) return false;
  if (!hasOnlyKeys(destination, ["adapter", "external"])
    || !hasOnlyKeys(dataPolicy, ["classification", "rawWorkspaceContentIncluded", "approvalRequired", "redaction"])
    || !hasOnlyKeys(task, ["objective", "acceptanceCriteria"])
    || !hasOnlyKeys(contextSummary, ["repoName", "detectedFiles", "relevantFacts"])) return false;
  const redaction = dataPolicy["redaction"];
  if (!isRecord(redaction) || !hasOnlyKeys(redaction, ["status", "method"])) return false;
  return typeof destination["adapter"] === "string"
    && destination["external"] === true
    && dataPolicy["classification"] === "internal"
    && dataPolicy["rawWorkspaceContentIncluded"] === false
    && dataPolicy["approvalRequired"] === true
    && redaction["status"] === "applied"
    && redaction["method"] === "summary-only"
    && typeof task["objective"] === "string"
    && isStringArray(task["acceptanceCriteria"])
    && typeof contextSummary["repoName"] === "string"
    && isStringArray(contextSummary["detectedFiles"])
    && isStringArray(contextSummary["relevantFacts"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
