import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ServiceGateCheck {
  id: string;
  status: "pass" | "fail";
  evidence: string;
}

interface GateRequirement {
  id: string;
  key: string;
  validate(value: unknown): string[];
}

const GATE_FIXTURE = "fixtures/service-readiness/gates.json";

const REQUIRED_SHARE_BLOCKS = ["local paths", "secrets", "private repo assumptions", "unsupported claims"];
const REQUIRED_METRICS = ["time-to-first-readiness-delta", "readiness delta count", "public evidence link count"];
const DECISION_OUTCOMES = ["merge", "reject", "defer", "request-changes"];

const GATE_REQUIREMENTS: GateRequirement[] = [
  {
    id: "activation-gate",
    key: "activationGate",
    validate: (value) => [
      ...requirePassStatus(value),
      ...requireNumberAtMost(value, "timeToFirstReadinessDeltaMinutes", 15),
      ...requireString(value, "evidencePath")
    ]
  },
  {
    id: "repeat-run-gate",
    key: "repeatRunGate",
    validate: (value) => [
      ...requirePassStatus(value),
      ...requireStringArray(value, "changedRecommendations"),
      ...requireString(value, "evidencePath")
    ]
  },
  {
    id: "share-safe-gate",
    key: "shareSafeGate",
    validate: (value) => [
      ...requirePassStatus(value),
      ...requireStringArray(value, "checkedArtifactPaths"),
      ...requireStringArrayIncludes(value, "blockedPatterns", REQUIRED_SHARE_BLOCKS),
      ...requireString(value, "evidencePath")
    ]
  },
  {
    id: "decision-impact-gate",
    key: "decisionImpactGate",
    validate: (value) => [
      ...requirePassStatus(value),
      ...requireAllowedStringArray(value, "outcomes", DECISION_OUTCOMES),
      ...requireString(value, "evidencePath")
    ]
  },
  {
    id: "external-replay-gate",
    key: "externalReplayGate",
    validate: (value) => [
      ...requirePassStatus(value),
      ...requireBoolean(value, "officialDocsFirst", true),
      ...requireString(value, "publicTarget"),
      ...requireString(value, "evidencePath")
    ]
  },
  {
    id: "metrics-gate",
    key: "metricsGate",
    validate: (value) => [
      ...requirePassStatus(value),
      ...requireBoolean(value, "generatedFromEvidence", true),
      ...requireStringArrayIncludes(value, "metrics", REQUIRED_METRICS),
      ...requireString(value, "evidencePath")
    ]
  }
];

export async function evaluateServiceGates(root: string): Promise<ServiceGateCheck> {
  const path = join(root, GATE_FIXTURE);
  const parsed = await readJson(path);
  if (!isRecord(parsed)) {
    return {
      id: "service-acceptance-gates",
      status: "fail",
      evidence: `missing or invalid ${GATE_FIXTURE}`
    };
  }

  const failures = GATE_REQUIREMENTS.flatMap((requirement) => {
    const issues = requirement.validate(parsed[requirement.key]);
    return issues.map((issue) => `${requirement.id}: ${issue}`);
  });

  return {
    id: "service-acceptance-gates",
    status: failures.length ? "fail" : "pass",
    evidence: failures.length ? failures.join("; ") : GATE_FIXTURE
  };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function requirePassStatus(value: unknown): string[] {
  if (!isRecord(value)) {
    return ["missing gate object"];
  }
  return value.status === "pass" ? [] : ["status must be pass"];
}

function requireString(value: unknown, field: string): string[] {
  if (!isRecord(value) || typeof value[field] !== "string" || value[field].trim() === "") {
    return [`${field} must be a non-empty string`];
  }
  return [];
}

function requireNumberAtMost(value: unknown, field: string, max: number): string[] {
  if (!isRecord(value) || typeof value[field] !== "number" || value[field] > max) {
    return [`${field} must be a number <= ${max}`];
  }
  return [];
}

function requireBoolean(value: unknown, field: string, expected: boolean): string[] {
  if (!isRecord(value) || value[field] !== expected) {
    return [`${field} must be ${String(expected)}`];
  }
  return [];
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!isRecord(value) || !isNonEmptyStringArray(value[field])) {
    return [`${field} must be a non-empty string array`];
  }
  return [];
}

function requireStringArrayIncludes(value: unknown, field: string, required: string[]): string[] {
  if (!isRecord(value) || !isNonEmptyStringArray(value[field])) {
    return [`${field} must be a non-empty string array`];
  }
  const actual = new Set(value[field]);
  const missing = required.filter((item) => !actual.has(item));
  return missing.length ? [`${field} missing: ${missing.join(", ")}`] : [];
}

function requireAllowedStringArray(value: unknown, field: string, allowed: string[]): string[] {
  if (!isRecord(value) || !isNonEmptyStringArray(value[field])) {
    return [`${field} must be a non-empty string array`];
  }
  const invalid = value[field].filter((item) => !allowed.includes(item));
  return invalid.length ? [`${field} invalid: ${invalid.join(", ")}`] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim() !== "");
}
