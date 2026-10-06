import type { evaluateCapabilityDoctor } from "./capability-doctor";
import type { recordFieldEvidence } from "./field-evidence";
import type { WeeklyRetroReport } from "./routine-retro";

export function formatLines(title: string, lines: readonly string[]): string {
  return [title, ...lines.map((line) => `- ${line}`)].join("\n");
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function printHelp(): void {
  console.log([
    "boulder",
    "",
    "A min9lin9 operator kit for turning OSS repositories into evidence-backed Codex workflows.",
    "",
    "Usage:",
    "",
    "Main route:",
    "  boulder init [--cwd path] [--force]",
    "  boulder workflow map --json",
    "  boulder quickstart [--cwd path] [--json]",
    "  boulder onboard [--cwd path] [--json]",
    "  boulder bootstrap interview [--cwd path] [--task text] [--json]",
    "  boulder inspect [--cwd path] [--json]",
    "  boulder profile list [--cwd path] [--json]",
    "  boulder profile resolve [--cwd path] [--profile name] [--task kind] [--json]",
    "  boulder profile show [name] [--cwd path] [--json]",
    "  boulder profile save <name> [--cwd path] [--profile source] [--json]",
    "  boulder profile use <name> [--cwd path] [--json]",
    "  boulder capability import --from source --dry-run|--write [--kind skill|adapter|agent-catalog] [--id id] [--cwd path] [--json]",
    "  boulder capability status [--cwd path] [--json]",
    "  boulder handoff packet [--cwd path] [--adapter name] [--include path] [--json]",
    "  boulder handoff review [--cwd path] [--packet path] [--json]",
    "  boulder handoff send [--cwd path] [--packet path] [--approve-external] [--approval-code code] [--dry-run]",
    "  boulder release-check [--cwd path] [--json]",
    "  boulder product-readiness [--cwd path] [--json]",
    "  boulder service-readiness [--cwd path] [--json]",
    "",
    "Secondary loops:",
    "  boulder routine capture --task text --dry-run|--write [--cwd path] [--json]",
    "  boulder routine evidence add --task id --ordinal 1 --descriptor-kind kind --descriptor-id id [--note text] [--cwd path] [--json]",
    "  boulder retro weekly --dry-run [--cwd path] [--json]",
    "  boulder skill propose --from-routine id --dry-run|--write [--cwd path] [--json]",
    "",
    "Trace observability:",
    "  boulder trace doctor --source openclaw-local --db-path path [--cwd path] [--json]",
    "  boulder trace collect --source openclaw-local --session id --once --dry-run|--write [--cwd path] [--json]",
    "  boulder trace verify --strict [--cwd path] [--json]",
    "  boulder trace serve --host 127.0.0.1 --port 4319 [--cwd path]",
    "  boulder trace link --snapshot id --from-event a --to-event b --run-id uuid --dry-run|--write [--cwd path] [--json]",
    "  boulder trace unlock --confirm [--nonce n] [--cwd path] [--json]",
    "",
    "Utilities:",
    "  boulder validate [--cwd path]",
    "  boulder verify [--cwd path] [--dry-run]",
    "  boulder pipeline [--cwd path] [--friction low|medium|high] [--json]",
    "  boulder workflow [--cwd path] [--friction low|medium|high] [--json]",
    "  boulder scorecard [--cwd path] [--json]",
    "  boulder benchmark [--cwd path] [--json]",
    "  boulder release-plan [--cwd path] [--json]",
    "  boulder release evidence refresh --dry-run|--write [--cwd path] [--json]",
    "  boulder replay-check [--cwd path] [--json]",
    "  boulder replay-run [--cwd path] --dry-run [--json]",
    "  boulder doctor [--cwd path] [--json]",
    "  boulder record field-readiness --run-id id --evidence path [--cwd path] [--json]",
    "  boulder export [--cwd path] [--force]",
    "",
    "Package:",
    "  bunx boulder-oss-cli <command>",
    ""
  ].join("\n"));
}

export function formatWeeklyRetroReport(report: WeeklyRetroReport): string {
  return [
    "Boulder weekly retro dry-run",
    `- status: ${report.status}`,
    `- routines: ${report.routineCount}`,
    ...report.improvementCandidates.map((item) => `- improvement-candidate: ${item.routineId} (${item.seenCount}) - ${item.reason}`),
    ...report.skillProposalCandidates.map((item) => `- skill-proposal-candidate: ${item.routineId} (${item.seenCount}) - ${item.reason}`),
    ...formatAttachedEvidence(report),
    ...report.warnings.map((item) => `- warning: ${item}`)
  ].join("\n");
}

function formatAttachedEvidence(report: WeeklyRetroReport): readonly string[] {
  if (report.attachedEvidence.length === 0 && report.traceBindings.length === 0) return [];
  return [
    "Attached evidence",
    ...report.attachedEvidence.map((item) =>
      `- evidence: ${item.routineId} kind=${safeDisplay(item.kind)} path=${safeDisplay(item.path)}${item.descriptorId === undefined ? "" : ` id=${item.descriptorId}`}`),
    ...report.traceBindings.map((item) =>
      `- trace-binding: ${item.routineId} binding=${item.bindingId}${item.snapshotId === undefined ? " (backing unavailable)" : ` snapshot=${item.snapshotId} run=${item.commandRunId}`}`)
  ];
}

// Rendered metadata is untrusted text: strip control characters like the
// skill-proposal metadata path does.
function safeDisplay(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ");
}

export function formatDoctorReport(report: Awaited<ReturnType<typeof evaluateCapabilityDoctor>>): string {
  const activeProfile = report.activeProfile
    ? [
      `- active-profile: ${report.activeProfile.id} (${report.activeProfile.source}; ${report.activeProfile.purpose})`,
      `- external-default: ${report.activeProfile.externalDefault}`,
      `- external-approval-required: ${report.activeProfile.externalRequiresApproval ? "true" : "false"}`,
      ...report.activeProfile.drift.map((item) => `- profile-${item.severity}: ${item.id} - ${item.message}`)
    ]
    : ["- active-profile: unavailable"];
  return [
    "Boulder capability doctor",
    `- status: ${report.status}`,
    ...activeProfile,
    ...report.capabilities.map((item) => `- capability: ${item.id} (${item.kind}, ${item.lane})`),
    ...report.sourceCandidates.map((item) => `- source-candidate: ${item.capabilityId} (${item.kind}, ${item.status}) - ${item.source}`),
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
