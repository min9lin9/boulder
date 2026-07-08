import { readinessEntriesForReport, type ReadinessReportId } from "./readiness-registry";
import { recordRunEvent, type RecordRunEventInput, type RunEventName, type RunEventSeverity, type RunEventStatus } from "./run-events";

export type ReportCheck = {
  readonly id: string;
  readonly status: "pass" | "fail";
};

export async function recordReadinessRunIfRequested(
  args: readonly string[],
  cwd: string,
  eventName: RunEventName,
  report: ReadinessReportId,
  startedAt: string,
  status: RunEventStatus,
  checks: readonly ReportCheck[],
  artifactPaths: readonly string[]
): Promise<void> {
  await recordRunIfRequested(args, cwd, {
    eventName,
    command: runEventCommand(args),
    startedAt,
    completedAt: new Date().toISOString(),
    severity: severityForStatus(status),
    status,
    checkIds: checks.map((check) => check.id),
    recoveryHintIds: recoveryHintIds(report, checks),
    artifactPaths
  });
}

export async function recordRunIfRequested(args: readonly string[], cwd: string, input: RecordRunEventInput): Promise<void> {
  if (!args.includes("--record-run")) return;
  await recordRunEvent(cwd, input);
}

export function runEventCommand(args: readonly string[]): string {
  const command = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--record-run") continue;
    if (arg === "--cwd") {
      index += 1;
      continue;
    }
    command.push(arg);
  }
  return command.join(" ");
}

export function severityForStatus(status: RunEventStatus): RunEventSeverity {
  return status === "ready" || status === "pilot-ready" || status === "pass" ? "info" : "error";
}

function recoveryHintIds(report: ReadinessReportId, checks: readonly ReportCheck[]): readonly string[] {
  const ids = new Set(checks.filter((check) => check.status === "fail").map((check) => check.id));
  return readinessEntriesForReport(report).filter((entry) => ids.has(entry.id)).map((entry) => entry.recoveryHintId);
}
