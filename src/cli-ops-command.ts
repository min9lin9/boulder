import { resolve } from "node:path";
import { evaluateCapabilityDoctor } from "./capability-doctor";
import { formatDoctorReport, formatFieldEvidenceResult, prettyJson } from "./cli-format";
import { recordReadinessRunIfRequested, recordRunIfRequested, runEventCommand, severityForStatus } from "./cli-run-recording";
import { writeGeneratedText } from "./fs";
import { diffEvidence, inspectEvidence, recordFieldEvidence } from "./field-evidence";
import { evaluateProductReadiness, productReadinessToMarkdown } from "./product-readiness";
import { evaluateReleaseCheck, releaseCheckToMarkdown } from "./release-check";
import { planReleaseEvidenceRefresh, writeReleaseEvidenceRefresh, type ReleaseEvidenceRefreshPlan } from "./release-evidence";
import { evaluateReleasePlan, releasePlanToMarkdown } from "./release-plan";
import { evaluateReplayCheck, replayCheckToMarkdown } from "./replay-check";
import { buildReplayRunPlan, replayRunPlanToMarkdown } from "./replay-run";
import { evaluateServiceReadiness, serviceReadinessToMarkdown } from "./service-readiness";

export type CliOptions = {
  readonly cwd: string;
  readonly json: boolean;
  readonly dryRun: boolean;
  readonly runId: string;
  readonly evidence: string;
};

export async function runOperationalCommand(command: string, commandArgs: readonly string[], args: readonly string[], options: CliOptions, startedAt: string): Promise<boolean> {
  if (command === "release-plan") return await runReleasePlanCommand(args, options, startedAt);
  if (command === "release" && commandArgs[1] === "evidence" && commandArgs[2] === "refresh") return await runReleaseEvidenceRefreshCommand(args, options, startedAt);
  if (command === "release-check") return await runReleaseCheckCommand(args, options, startedAt);
  if (command === "evidence" && commandArgs[1] === "inspect") return await runEvidenceInspectCommand(args, options, startedAt);
  if (command === "evidence" && commandArgs[1] === "diff") return await runEvidenceDiffCommand(args, options, startedAt);
  if (command === "replay-check") return await runReplayCheckCommand(options);
  if (command === "replay-run") return await runReplayRunCommand(options);
  if (command === "product-readiness") return await runProductReadinessCommand(args, options, startedAt);
  if (command === "service-readiness") return await runServiceReadinessCommand(args, options, startedAt);
  if (command === "doctor") return await runDoctorCommand(options);
  if (command === "record" && args.includes("field-readiness")) return await runFieldReadinessCommand(options);
  return false;
}

async function runReleasePlanCommand(args: readonly string[], options: CliOptions, startedAt: string): Promise<true> {
  const plan = await evaluateReleasePlan(options.cwd);
  await recordRunIfRequested(args, options.cwd, {
    eventName: "release-plan",
    command: runEventCommand(args),
    startedAt,
    completedAt: new Date().toISOString(),
    severity: severityForStatus(plan.status),
    status: plan.status,
    checkIds: plan.checks.map((check) => check.id),
    recoveryHintIds: [],
    artifactPaths: options.json ? [] : ["docs/RELEASE_PLAN.md"]
  });
  if (options.json) {
    console.log(prettyJson(plan));
    return true;
  }
  const markdown = releasePlanToMarkdown(plan);
  await writeGeneratedText(options.cwd, "docs/RELEASE_PLAN.md", markdown, true);
  console.log(markdown);
  return true;
}

async function runReleaseEvidenceRefreshCommand(args: readonly string[], options: CliOptions, startedAt: string): Promise<true> {
  const wantsDryRun = args.includes("--dry-run");
  const wantsWrite = args.includes("--write");
  if (wantsDryRun === wantsWrite) {
    console.error("ERROR release.mode_required: Use exactly one of --dry-run or --write.");
    process.exitCode = 1;
    return true;
  }

  const plan = await planReleaseEvidenceRefresh(options.cwd);
  if (wantsWrite && plan.status === "ready") await writeReleaseEvidenceRefresh(options.cwd, plan);
  await recordRunIfRequested(args, options.cwd, {
    eventName: "release evidence refresh",
    command: runEventCommand(args),
    startedAt,
    completedAt: new Date().toISOString(),
    severity: severityForStatus(plan.status),
    status: plan.status,
    checkIds: plan.targets.map((target) => target.path),
    recoveryHintIds: plan.issues.map((issue) => issue.code),
    artifactPaths: plan.targets.map((target) => target.path)
  });
  if (options.json) {
    console.log(prettyJson(refreshPlanForJson(plan, wantsWrite ? "write" : "dry-run")));
  } else {
    console.log(refreshPlanToMarkdown(plan, wantsWrite ? "write" : "dry-run"));
  }
  if (plan.status === "blocked") process.exitCode = 1;
  return true;
}

async function runReleaseCheckCommand(args: readonly string[], options: CliOptions, startedAt: string): Promise<true> {
  const report = await evaluateReleaseCheck(options.cwd);
  await recordReadinessRunIfRequested(args, options.cwd, "release-check", "release-check", startedAt, report.status, report.checks, []);
  if (options.json) {
    console.log(prettyJson(report));
  } else {
    console.log(releaseCheckToMarkdown(report));
  }
  if (report.status === "blocked") process.exitCode = 1;
  return true;
}

async function runEvidenceInspectCommand(args: readonly string[], options: CliOptions, startedAt: string): Promise<true> {
  const report = await inspectEvidence(options.cwd);
  await recordRunIfRequested(args, options.cwd, {
    eventName: "evidence inspect",
    command: runEventCommand(args),
    startedAt,
    completedAt: new Date().toISOString(),
    severity: severityForStatus(report.status),
    status: report.status,
    checkIds: report.evidence.map((item) => item.id),
    recoveryHintIds: [],
    artifactPaths: report.evidence.map((item) => item.evidence)
  });
  console.log(prettyJson(report));
  return true;
}

async function runEvidenceDiffCommand(args: readonly string[], options: CliOptions, startedAt: string): Promise<true> {
  const report = await diffEvidence(optionValue(args, "--from") ? resolve(optionValue(args, "--from") ?? "") : "", optionValue(args, "--to") ? resolve(optionValue(args, "--to") ?? "") : "");
  await recordRunIfRequested(args, options.cwd, {
    eventName: "evidence diff",
    command: runEventCommand(args),
    startedAt,
    completedAt: new Date().toISOString(),
    severity: severityForStatus(report.status),
    status: report.status,
    checkIds: report.changedEvidenceIds,
    recoveryHintIds: report.issues.map((issue) => issue.code),
    artifactPaths: report.issues.map((issue) => issue.path)
  });
  console.log(prettyJson(report));
  if (report.status === "blocked") process.exitCode = 1;
  return true;
}

async function runReplayCheckCommand(options: CliOptions): Promise<true> {
  const report = await evaluateReplayCheck(options.cwd);
  if (options.json) {
    console.log(prettyJson(report));
  } else {
    console.log(replayCheckToMarkdown(report));
  }
  if (report.status === "blocked") process.exitCode = 1;
  return true;
}

async function runReplayRunCommand(options: CliOptions): Promise<true> {
  const plan = await buildReplayRunPlan(options.cwd, options.dryRun);
  if (options.json) {
    console.log(prettyJson(plan));
  } else {
    console.log(replayRunPlanToMarkdown(plan));
  }
  if (plan.status === "blocked") process.exitCode = 1;
  return true;
}

async function runProductReadinessCommand(args: readonly string[], options: CliOptions, startedAt: string): Promise<true> {
  const readiness = await evaluateProductReadiness(options.cwd);
  await recordReadinessRunIfRequested(args, options.cwd, "product-readiness", "product-readiness", startedAt, readiness.status, readiness.checks, options.json ? [] : ["docs/PRODUCT_READINESS.md"]);
  if (options.json) {
    console.log(prettyJson(readiness));
  } else {
    const markdown = productReadinessToMarkdown(readiness);
    await writeGeneratedText(options.cwd, "docs/PRODUCT_READINESS.md", markdown, true);
    console.log(markdown);
  }
  if (readiness.status === "blocked") process.exitCode = 1;
  return true;
}

async function runServiceReadinessCommand(args: readonly string[], options: CliOptions, startedAt: string): Promise<true> {
  const readiness = await evaluateServiceReadiness(options.cwd);
  await recordReadinessRunIfRequested(args, options.cwd, "service-readiness", "service-readiness", startedAt, readiness.status, readiness.checks, options.json ? [] : ["docs/SERVICE_READINESS.md"]);
  if (options.json) {
    console.log(prettyJson(readiness));
  } else {
    const markdown = serviceReadinessToMarkdown(readiness);
    await writeGeneratedText(options.cwd, "docs/SERVICE_READINESS.md", markdown, true);
    console.log(markdown);
  }
  if (readiness.status === "blocked") process.exitCode = 1;
  return true;
}

async function runDoctorCommand(options: CliOptions): Promise<true> {
  const report = await evaluateCapabilityDoctor(options.cwd);
  if (options.json) {
    console.log(prettyJson(report));
  } else {
    console.log(formatDoctorReport(report));
  }
  if (report.status === "fail") process.exitCode = 1;
  return true;
}

async function runFieldReadinessCommand(options: CliOptions): Promise<true> {
  const result = await recordFieldEvidence(options.cwd, options.runId, options.evidence);
  if (options.json) {
    console.log(prettyJson(result));
  } else {
    console.log(formatFieldEvidenceResult(result));
  }
  if (result.status === "fail") process.exitCode = 1;
  return true;
}

function refreshPlanForJson(plan: ReleaseEvidenceRefreshPlan, mode: "dry-run" | "write") {
  return {
    mode,
    status: plan.status,
    targets: plan.targets.map((target) => ({
      path: target.path,
      changed: target.changed,
      beforeBytes: target.beforeBytes,
      afterBytes: target.afterBytes
    })),
    issues: plan.issues
  };
}

function refreshPlanToMarkdown(plan: ReleaseEvidenceRefreshPlan, mode: "dry-run" | "write"): string {
  return [
    `Boulder release evidence refresh ${mode}`,
    `- status: ${plan.status}`,
    ...plan.targets.map((target) => `- ${target.changed ? "update" : "unchanged"}: ${target.path} (${target.beforeBytes} -> ${target.afterBytes} bytes)`),
    ...plan.issues.map((issue) => `- issue: ${issue.code} - ${issue.message}`)
  ].join("\n");
}

function optionValue(args: readonly string[], flag: string): string | null {
  const index = args.findIndex((arg) => arg === flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : null;
}
