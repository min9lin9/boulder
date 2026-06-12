import type { evaluateCapabilityDoctor } from "./capability-doctor";
import type { recordFieldEvidence } from "./field-evidence";

export function formatLines(title: string, lines: readonly string[]): string {
  return [title, ...lines.map((line) => `- ${line}`)].join("\n");
}

export function printHelp(): void {
  console.log([
    "boulder",
    "",
    "A min9lin9 operator kit for turning OSS repositories into evidence-backed Codex workflows.",
    "",
    "Usage:",
    "  boulder init [--cwd path] [--force]",
    "  boulder quickstart [--cwd path] [--json]",
    "  boulder onboard [--cwd path] [--json]",
    "  boulder inspect [--cwd path] [--json]",
    "  boulder validate [--cwd path]",
    "  boulder verify [--cwd path] [--dry-run]",
    "  boulder pipeline [--cwd path] [--friction low|medium|high] [--json]",
    "  boulder scorecard [--cwd path] [--json]",
    "  boulder benchmark [--cwd path] [--json]",
    "  boulder release-plan [--cwd path] [--json]",
    "  boulder release-check [--cwd path] [--json]",
    "  boulder replay-check [--cwd path] [--json]",
    "  boulder replay-run [--cwd path] --dry-run [--json]",
    "  boulder product-readiness [--cwd path] [--json]",
    "  boulder service-readiness [--cwd path] [--json]",
    "  boulder doctor [--cwd path] [--json]",
    "  boulder record field-readiness --run-id id --evidence path [--cwd path] [--json]",
    "  boulder export [--cwd path] [--force]",
    "",
    "Package:",
    "  bunx boulder-oss-cli <command>",
    ""
  ].join("\n"));
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
