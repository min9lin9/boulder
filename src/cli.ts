import { benchmarkReportToMarkdown, evaluateBenchmarkFixtures, loadBenchmarkFixtures } from "./benchmark";
import { bootstrapInterviewToMarkdown, buildBootstrapInterview } from "./bootstrap-interview";
import { runCapabilityCommand } from "./capability-command";
import { formatLines, prettyJson, printHelp } from "./cli-format";
import { runOperationalCommand } from "./cli-ops-command";
import { optionValue, parseOptions, valueAfter } from "./cli-options";
import { runControlKernelCommand } from "./control-kernel-command";
import { UnsafeGeneratedWritePathError, writeGeneratedText } from "./fs";
import { exportHarness } from "./export";
import { runHandoffCommand } from "./handoff-command";
import { inspectRepo, inspectionToMarkdown } from "./inspect";
import { loadManifest } from "./manifest";
import { buildPipelinePlan, formatPipelinePlan, invalidFrictionMessage, isFrictionLevel } from "./pipeline";
import { runProfileCommand } from "./profile-command";
import { evaluateQuickstart, quickstartToMarkdown } from "./quickstart";
import { runRoutineCommand } from "./routine-command";
import { runRunsCommand } from "./runs-command";
import { scorecardToMarkdown, scoreManifest } from "./scorecard";
import { formatManifestIssues, hasManifestErrors, validateManifest } from "./validation";
import { initHarness } from "./workflows";
import { verifyHarness, verifyResultsToMarkdown } from "./verify";
import { buildPrimaryWorkflowMap } from "./workflow-map";
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
  const startedAt = new Date().toISOString();
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
  if (command === "workflow" && parsed.commandArgs[1] === "map") {
    if (!options.json) {
      console.error("ERROR workflow.json_required: Use workflow map --json.");
      process.exitCode = 1;
      return;
    }
    console.log(prettyJson(buildPrimaryWorkflowMap()));
    return;
  }
  if (await runRoutineCommand(parsed.commandArgs, options)) {
    return;
  }
  if (command === "runs") {
    await runRunsCommand(parsed.commandArgs, args, options.cwd, options.json);
    return;
  }
  if (command === "control") {
    await runControlKernelCommand(args, { cwd: options.cwd, json: options.json });
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
  if (await runOperationalCommand(command, parsed.commandArgs, args, options, startedAt)) {
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

function parseArgv(args: readonly string[]): { readonly command: string; readonly commandArgs: readonly string[] } {
  const commandArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (GLOBAL_VALUE_FLAGS.has(arg)) {
      if (valueAfter(args, index)) index += 1;
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

const GLOBAL_VALUE_FLAGS = new Set(["--cwd", "--friction", "--run-id", "--evidence", "--from", "--to", "--older-than", "--keep"]);
const GLOBAL_BOOLEAN_FLAGS = new Set(["--json", "--force", "--dry-run", "--record-run", "--latest"]);
