import { benchmarkReportToMarkdown, evaluateBenchmarkFixtures, loadBenchmarkFixtures } from "./benchmark";
import { evaluateCapabilityDoctor } from "./capability-doctor";
import { formatDoctorReport, formatFieldEvidenceResult, formatLines, prettyJson, printHelp } from "./cli-format";
import { parseOptions } from "./cli-options";
import { writeText } from "./fs";
import { exportHarness } from "./export";
import { recordFieldEvidence } from "./field-evidence";
import { runHandoffCommand } from "./handoff-command";
import { inspectRepo, inspectionToMarkdown } from "./inspect";
import { loadManifest } from "./manifest";
import { buildPipelinePlan, formatPipelinePlan, invalidFrictionMessage, isFrictionLevel } from "./pipeline";
import { runProfileCommand } from "./profile-command";
import { evaluateProductReadiness, productReadinessToMarkdown } from "./product-readiness";
import { evaluateQuickstart, quickstartToMarkdown } from "./quickstart";
import { evaluateReleaseCheck, releaseCheckToMarkdown } from "./release-check";
import { evaluateReleasePlan, releasePlanToMarkdown } from "./release-plan";
import { evaluateReplayCheck, replayCheckToMarkdown } from "./replay-check";
import { buildReplayRunPlan, replayRunPlanToMarkdown } from "./replay-run";
import { scorecardToMarkdown, scoreManifest } from "./scorecard";
import { evaluateServiceReadiness, serviceReadinessToMarkdown } from "./service-readiness";
import { formatManifestIssues, hasManifestErrors, validateManifest } from "./validation";
import { initHarness } from "./workflows";
import { verifyHarness, verifyResultsToMarkdown } from "./verify";
import { executorsFromResolvedProfile, resolveWorkflowProfile } from "./workflow-profiles";

const VERSION = "0.1.14";

export async function main(args: string[]): Promise<void> {
  const command = args.find((arg) => !arg.startsWith("-")) ?? "help";
  const options = parseOptions(args);
  if (command === "version" || args.includes("--version")) {
    console.log(VERSION);
    return;
  }
  if (command === "help" || args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
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
    await writeText(`${options.cwd}/docs/REPO_BRIEF.md`, markdown, true);
    console.log(markdown);
    return;
  }
  if (command === "profile") {
    await runProfileCommand(args, { cwd: options.cwd, json: options.json });
    return;
  }
  if (command === "handoff") {
    await runHandoffCommand(args, { cwd: options.cwd, json: options.json, force: options.force });
    return;
  }
  if (command === "verify") {
    const results = await verifyHarness(options.cwd, options.dryRun);
    const markdown = verifyResultsToMarkdown(results);
    await writeText(`${options.cwd}/docs/VERIFICATION_REPORT.md`, markdown, true);
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
    await writeText(`${options.cwd}/docs/HARNESS_QUALITY_SCORECARD.md`, markdown, true);
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
    await writeText(`${options.cwd}/docs/BENCHMARK_FIXTURE_REPORT.md`, markdown, true);
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
    await writeText(`${options.cwd}/docs/RELEASE_PLAN.md`, markdown, true);
    console.log(markdown);
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
    await writeText(`${options.cwd}/docs/PRODUCT_READINESS.md`, markdown, true);
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
    await writeText(`${options.cwd}/docs/SERVICE_READINESS.md`, markdown, true);
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
