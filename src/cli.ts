import { resolve } from "node:path";
import { benchmarkReportToMarkdown, evaluateBenchmarkFixtures, loadBenchmarkFixtures } from "./benchmark";
import { bootstrapInterviewToMarkdown, buildBootstrapInterview } from "./bootstrap-interview";
import { runCapabilityCommand } from "./capability-command";
import { evaluateCapabilityDoctor } from "./capability-doctor";
import { formatDoctorReport, formatFieldEvidenceResult, formatLines, prettyJson, printHelp } from "./cli-format";
import { parseOptions } from "./cli-options";
import { UnsafeGeneratedWritePathError, writeGeneratedText } from "./fs";
import { exportHarness } from "./export";
import { diffEvidence, inspectEvidence, recordFieldEvidence } from "./field-evidence";
import { runHandoffCommand } from "./handoff-command";
import { inspectRepo, inspectionToMarkdown } from "./inspect";
import { loadManifest } from "./manifest";
import { buildPipelinePlan, formatPipelinePlan, invalidFrictionMessage, isFrictionLevel } from "./pipeline";
import { runProfileCommand } from "./profile-command";
import { evaluateProductReadiness, productReadinessToMarkdown } from "./product-readiness";
import { evaluateQuickstart, quickstartToMarkdown } from "./quickstart";
import { evaluateReleaseCheck, releaseCheckToMarkdown } from "./release-check";
import { planReleaseEvidenceRefresh, writeReleaseEvidenceRefresh, type ReleaseEvidenceRefreshPlan } from "./release-evidence";
import { evaluateReleasePlan, releasePlanToMarkdown } from "./release-plan";
import { evaluateReplayCheck, replayCheckToMarkdown } from "./replay-check";
import { buildReplayRunPlan, replayRunPlanToMarkdown } from "./replay-run";
import { runRoutineCommand } from "./routine-command";
import { scorecardToMarkdown, scoreManifest } from "./scorecard";
import { evaluateServiceReadiness, serviceReadinessToMarkdown } from "./service-readiness";
import { formatManifestIssues, hasManifestErrors, validateManifest } from "./validation";
import { initHarness } from "./workflows";
import { verifyHarness, verifyResultsToMarkdown } from "./verify";
import { executorsFromResolvedProfile, resolveWorkflowProfile } from "./workflow-profiles";

const VERSION = "0.1.16";

export async function main(args: string[]): Promise<void> {
  try {
    await runMain(args);
  } catch (error) {
    if (error instanceof UnsafeGeneratedWritePathError) {
      console.error(`ERROR fs.path_invalid: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

async function runMain(args: string[]): Promise<void> {
  const parsed = parseArgv(args);
  const command = parsed.command;
  const options = parseOptions(args);
  if (command === "version" || args.includes("--version")) { console.log(VERSION); return; }
  if (command === "help" || args.includes("--help") || args.includes("-h")) { printHelp(); return; }
  if (command === "init") {
    const results = await initHarness(options.cwd, options.force);
    console.log(formatLines("Boulder initialized", results));
    return;
  }
  if (command === "quickstart" || command === "onboard") {
    const report = await evaluateQuickstart(options.cwd);
    if (options.json) {
      console.log(prettyJson(report));
      return;
    }
    console.log(quickstartToMarkdown(report));
    return;
  }
  if (command === "inspect") {
    const inspection = await inspectRepo(options.cwd);
    if (options.json) {
      console.log(prettyJson(inspection));
      return;
    }
    const markdown = inspectionToMarkdown(inspection);
    await writeGeneratedText(options.cwd, "docs/REPO_BRIEF.md", markdown, true);
    console.log(markdown);
    return;
  }
  if (command === "profile") {
    await runProfileCommand(args, { cwd: options.cwd, json: options.json });
    return;
  }
  if (command === "capability") {
    await runCapabilityCommand(args, { cwd: options.cwd, json: options.json });
    return;
  }
  if (await runRoutineCommand(parsed.commandArgs, options)) {
    return;
  }
  if (command === "bootstrap" && args.includes("interview")) {
    const report = buildBootstrapInterview(optionValue(args, "--task"));
    if (options.json) {
      console.log(prettyJson(report));
      return;
    }
    console.log(bootstrapInterviewToMarkdown(report));
    return;
  }
  if (command === "handoff") {
    await runHandoffCommand(args, { cwd: options.cwd, json: options.json, force: options.force });
    return;
  }
  if (command === "verify") {
    const results = await verifyHarness(options.cwd, options.dryRun);
    const markdown = verifyResultsToMarkdown(results);
    await writeGeneratedText(options.cwd, "docs/VERIFICATION_REPORT.md", markdown, true);
    console.log(markdown);
    if (results.some((item) => item.required && item.status === "failed")) {
      process.exitCode = 1;
    }
    return;
  }
  if (command === "validate") {
    const manifest = await loadManifest(options.cwd);
    const issues = validateManifest(manifest);
    console.log(formatManifestIssues(issues));
    if (hasManifestErrors(issues)) {
      process.exitCode = 1;
    }
    return;
  }
  if (command === "pipeline") {
    if (!isFrictionLevel(options.friction)) {
      console.error(invalidFrictionMessage(options.friction));
      process.exitCode = 1;
      return;
    }
    const resolution = await resolveWorkflowProfile(options.cwd, {});
    const plan = buildPipelinePlan(options.friction, executorsFromResolvedProfile(resolution.profile), resolution.profile);
    if (options.json) {
      console.log(prettyJson(plan));
      return;
    }
    console.log(formatPipelinePlan(plan));
    return;
  }
  if (command === "scorecard") {
    const manifest = await loadManifest(options.cwd);
    const scorecard = scoreManifest(manifest);
    if (options.json) {
      console.log(prettyJson(scorecard));
      return;
    }
    const markdown = scorecardToMarkdown(scorecard);
    await writeGeneratedText(options.cwd, "docs/HARNESS_QUALITY_SCORECARD.md", markdown, true);
    console.log(markdown);
    return;
  }
  if (command === "benchmark") {
    const fixtures = await loadBenchmarkFixtures(options.cwd);
    const report = evaluateBenchmarkFixtures(fixtures);
    if (options.json) {
      console.log(prettyJson(report));
      return;
    }
    const markdown = benchmarkReportToMarkdown(report);
    await writeGeneratedText(options.cwd, "docs/BENCHMARK_FIXTURE_REPORT.md", markdown, true);
    console.log(markdown);
    return;
  }
  if (command === "release-plan") {
    const plan = await evaluateReleasePlan(options.cwd);
    if (options.json) {
      console.log(prettyJson(plan));
      return;
    }
    const markdown = releasePlanToMarkdown(plan);
    await writeGeneratedText(options.cwd, "docs/RELEASE_PLAN.md", markdown, true);
    console.log(markdown);
    return;
  }
  if (command === "release" && parsed.commandArgs[1] === "evidence" && parsed.commandArgs[2] === "refresh") {
    const wantsDryRun = args.includes("--dry-run");
    const wantsWrite = args.includes("--write");
    if (wantsDryRun === wantsWrite) {
      console.error("ERROR release.mode_required: Use exactly one of --dry-run or --write.");
      process.exitCode = 1;
      return;
    }

    const plan = await planReleaseEvidenceRefresh(options.cwd);
    if (wantsWrite && plan.status === "ready") {
      await writeReleaseEvidenceRefresh(options.cwd, plan);
    }
    if (options.json) {
      console.log(prettyJson(refreshPlanForJson(plan, wantsWrite ? "write" : "dry-run")));
      if (plan.status === "blocked") process.exitCode = 1;
      return;
    }
    console.log(refreshPlanToMarkdown(plan, wantsWrite ? "write" : "dry-run"));
    if (plan.status === "blocked") process.exitCode = 1;
    return;
  }
  if (command === "release-check") {
    const report = await evaluateReleaseCheck(options.cwd);
    if (options.json) {
      console.log(prettyJson(report));
      if (report.status === "blocked") process.exitCode = 1;
      return;
    }
    console.log(releaseCheckToMarkdown(report));
    if (report.status === "blocked") process.exitCode = 1;
    return;
  }
  if (command === "evidence" && parsed.commandArgs[1] === "inspect") {
    console.log(prettyJson(await inspectEvidence(options.cwd)));
    return;
  }
  if (command === "evidence" && parsed.commandArgs[1] === "diff") {
    const from = optionValue(args, "--from");
    const to = optionValue(args, "--to");
    const report = await diffEvidence(from ? resolve(from) : "", to ? resolve(to) : "");
    console.log(prettyJson(report));
    if (report.status === "blocked") process.exitCode = 1;
    return;
  }
  if (command === "replay-check") {
    const report = await evaluateReplayCheck(options.cwd);
    if (options.json) {
      console.log(prettyJson(report));
      if (report.status === "blocked") process.exitCode = 1;
      return;
    }
    console.log(replayCheckToMarkdown(report));
    if (report.status === "blocked") process.exitCode = 1;
    return;
  }
  if (command === "replay-run") {
    const plan = await buildReplayRunPlan(options.cwd, options.dryRun);
    if (options.json) {
      console.log(prettyJson(plan));
      if (plan.status === "blocked") process.exitCode = 1;
      return;
    }
    console.log(replayRunPlanToMarkdown(plan));
    if (plan.status === "blocked") process.exitCode = 1;
    return;
  }
  if (command === "product-readiness") {
    const readiness = await evaluateProductReadiness(options.cwd);
    if (options.json) {
      console.log(prettyJson(readiness));
      if (readiness.status === "blocked") process.exitCode = 1;
      return;
    }
    const markdown = productReadinessToMarkdown(readiness);
    await writeGeneratedText(options.cwd, "docs/PRODUCT_READINESS.md", markdown, true);
    console.log(markdown);
    if (readiness.status === "blocked") process.exitCode = 1;
    return;
  }
  if (command === "service-readiness") {
    const readiness = await evaluateServiceReadiness(options.cwd);
    if (options.json) {
      console.log(prettyJson(readiness));
      if (readiness.status === "blocked") process.exitCode = 1;
      return;
    }
    const markdown = serviceReadinessToMarkdown(readiness);
    await writeGeneratedText(options.cwd, "docs/SERVICE_READINESS.md", markdown, true);
    console.log(markdown);
    if (readiness.status === "blocked") process.exitCode = 1;
    return;
  }
  if (command === "doctor") {
    const report = await evaluateCapabilityDoctor(options.cwd);
    if (options.json) {
      console.log(prettyJson(report));
      if (report.status === "fail") process.exitCode = 1;
      return;
    }
    console.log(formatDoctorReport(report));
    if (report.status === "fail") process.exitCode = 1;
    return;
  }
  if (command === "record" && args.includes("field-readiness")) {
    const result = await recordFieldEvidence(options.cwd, options.runId, options.evidence);
    if (options.json) {
      console.log(prettyJson(result));
      if (result.status === "fail") process.exitCode = 1;
      return;
    }
    console.log(formatFieldEvidenceResult(result));
    if (result.status === "fail") process.exitCode = 1;
    return;
  }
  if (command === "export") {
    const results = await exportHarness(options.cwd, options.force);
    console.log(formatLines("Boulder export complete", results));
    return;
  }
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

function optionValue(args: readonly string[], flag: string): string | null {
  const index = args.findIndex((arg) => arg === flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : null;
}

function parseArgv(args: readonly string[]): { readonly command: string; readonly commandArgs: readonly string[] } {
  const commandArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (GLOBAL_VALUE_FLAGS.has(arg)) {
      index += 1;
      continue;
    }
    if (GLOBAL_BOOLEAN_FLAGS.has(arg)) {
      continue;
    }
    commandArgs.push(arg);
  }
  return {
    command: commandArgs.find((arg) => !arg.startsWith("-")) ?? "help",
    commandArgs
  };
}

const GLOBAL_VALUE_FLAGS = new Set(["--cwd", "--friction", "--run-id", "--evidence", "--from", "--to"]);
const GLOBAL_BOOLEAN_FLAGS = new Set(["--json", "--force", "--dry-run"]);

function refreshPlanForJson(plan: ReleaseEvidenceRefreshPlan, mode: "dry-run" | "write"): {
  readonly mode: "dry-run" | "write";
  readonly status: ReleaseEvidenceRefreshPlan["status"];
  readonly targets: readonly {
    readonly path: string;
    readonly changed: boolean;
    readonly beforeBytes: number;
    readonly afterBytes: number;
  }[];
  readonly issues: ReleaseEvidenceRefreshPlan["issues"];
} {
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
