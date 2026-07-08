export type RunEventName =
  | "release-check"
  | "product-readiness"
  | "service-readiness"
  | "release-plan"
  | "release evidence refresh"
  | "evidence inspect"
  | "evidence diff";

export type RunEventSeverity = "info" | "error";
export type RunEventStatus = "ready" | "pilot-ready" | "blocked" | "pass" | "fail";

export type RunEventRecord = {
  readonly schemaVersion: "boulder.run-event.v1";
  readonly runId: string;
  readonly eventName: RunEventName;
  readonly command: string;
  readonly cwdHash: string;
  readonly packageVersion: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly severity: RunEventSeverity;
  readonly status: RunEventStatus;
  readonly checkIds: readonly string[];
  readonly recoveryHintIds: readonly string[];
  readonly artifactPaths: readonly string[];
};

export type RecordRunEventInput = {
  readonly eventName: RunEventName;
  readonly command: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly severity: RunEventSeverity;
  readonly status: RunEventStatus;
  readonly checkIds: readonly string[];
  readonly recoveryHintIds: readonly string[];
  readonly artifactPaths: readonly string[];
};

export type RecordRunEventResult = {
  readonly event: RunEventRecord;
  readonly path: string;
};

export type RunEventsList = {
  readonly schemaVersion: "boulder.runs.list.v1";
  readonly runs: readonly RunEventRecord[];
};

export type RunEventsPruneResult = {
  readonly schemaVersion: "boulder.runs.prune.v1";
  readonly pruned: number;
  readonly kept: number;
};

export function isRunEventRecord(value: unknown): value is RunEventRecord {
  return isRecord(value) &&
    value.schemaVersion === "boulder.run-event.v1" &&
    typeof value.runId === "string" &&
    isRunEventName(value.eventName) &&
    typeof value.command === "string" &&
    typeof value.cwdHash === "string" &&
    typeof value.packageVersion === "string" &&
    typeof value.startedAt === "string" &&
    typeof value.completedAt === "string" &&
    isRunEventSeverity(value.severity) &&
    isRunEventStatus(value.status) &&
    isStringArray(value.checkIds) &&
    isStringArray(value.recoveryHintIds) &&
    isStringArray(value.artifactPaths);
}

function isRunEventName(value: unknown): value is RunEventName {
  return value === "release-check" ||
    value === "product-readiness" ||
    value === "service-readiness" ||
    value === "release-plan" ||
    value === "release evidence refresh" ||
    value === "evidence inspect" ||
    value === "evidence diff";
}

function isRunEventSeverity(value: unknown): value is RunEventSeverity {
  return value === "info" || value === "error";
}

function isRunEventStatus(value: unknown): value is RunEventStatus {
  return value === "ready" || value === "pilot-ready" || value === "blocked" || value === "pass" || value === "fail";
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
