import type { evaluateCapabilityDoctor } from "./capability-doctor";
import type { recordFieldEvidence } from "./field-evidence";

export function formatLines(title: string, lines: readonly string[]): string {
  return [title, ...lines.map((line) => `- ${line}`)].join("\n");
}

export function formatDoctorReport(report: Awaited<ReturnType<typeof evaluateCapabilityDoctor>>): string {
  return [
    "Boulder capability doctor",
    `- status: ${report.status}`,
    ...report.capabilities.map((item) => `- capability: ${item.id} (${item.kind}, ${item.lane})`),
    ...report.issues.map((item) => `- ${item.severity}: ${item.id} - ${item.message}`)
  ].join("\n");
}

export function formatFieldEvidenceResult(result: Awaited<ReturnType<typeof recordFieldEvidence>>): string {
  return [
    "Boulder field-readiness record",
    `- status: ${result.status}`,
    `- run-id: ${result.runId}`,
    `- manifest: ${result.manifestPath}`,
    ...result.checks.map((item) => `- ${item.id}: ${item.status} - ${item.evidence}`)
  ].join("\n");
}
