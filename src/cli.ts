import { resolve } from "node:path";
import { benchmarkReportToMarkdown, evaluateBenchmarkFixtures, loadBenchmarkFixtures } from "./benchmark";
import { evaluateCapabilityDoctor } from "./capability-doctor";
import { formatDoctorReport, formatFieldEvidenceResult, formatLines } from "./cli-format";
import { writeText } from "./fs";
import { exportHarness } from "./export";
import { recordFieldEvidence } from "./field-evidence";
import { inspectRepo, inspectionToMarkdown } from "./inspect";
import { loadManifest } from "./manifest";
import { buildPipelinePlan, formatPipelinePlan, invalidFrictionMessage, isFrictionLevel } from "./pipeline";
import { evaluateProductReadiness, productReadinessToMarkdown } from "./product-readiness";
import { evaluateQuickstart, quickstartToMarkdown } from "./quickstart";
import { evaluateReleaseCheck, releaseCheckToMarkdown } from "./release-check";
import { evaluateReleasePlan, releasePlanToMarkdown } from "./release-plan";
import { scorecardToMarkdown, scoreManifest } from "./scorecard";
import { evaluateServiceReadiness, serviceReadinessToMarkdown } from "./service-readiness";
import { formatManifestIssues, hasManifestErrors, validateManifest } from "./validation";
import { initHarness } from "./workflows";
import { verifyHarness, verifyResultsToMarkdown } from "./verify";

type CliOptions = {
  cwd: string;
  force: boolean;
  dryRun: boolean;
  json: boolean;
  friction: string;
  runId: string;
  evidence: string;
};

const VERSION = "0.1.7";

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
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(quickstartToMarkdown(report));
    return;
  }
  if (command === "inspect") {
    const inspection = await inspectRepo(options.cwd);
    if (options.json) {
      console.log(JSON.stringify(inspection, null, 2));
      return;
    }
    const markdown = inspectionToMarkdown(inspection);
    await writeText(resolve(options.cwd, "docs", "REPO_BRIEF.md"), markdown, true);
    console.log(markdown);
    return;
  }
  if (command === "verify") {
    const results = await verifyHarness(options.cwd, options.dryRun);
    const markdown = verifyResultsToMarkdown(results);
    await writeText(resolve(options.cwd, "docs", "VERIFICATION_REPORT.md"), markdown, true);
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
    const plan = buildPipelinePlan(options.friction);
    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }
    console.log(formatPipelinePlan(plan));
    return;
  }
  if (command === "scorecard") {
    const manifest = await loadManifest(options.cwd);
    const scorecard = scoreManifest(manifest);
    if (options.json) {
      console.log(JSON.stringify(scorecard, null, 2));
      return;
    }
    const markdown = scorecardToMarkdown(scorecard);
    await writeText(resolve(options.cwd, "docs", "HARNESS_QUALITY_SCORECARD.md"), markdown, true);
    console.log(markdown);
    return;
  }
  if (command === "benchmark") {
    const fixtures = await loadBenchmarkFixtures(options.cwd);
    const report = evaluateBenchmarkFixtures(fixtures);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    const markdown = benchmarkReportToMarkdown(report);
    await writeText(resolve(options.cwd, "docs", "BENCHMARK_FIXTURE_REPORT.md"), markdown, true);
    console.log(markdown);
    return;
  }
  if (command === "release-plan") {
    const plan = await evaluateReleasePlan(options.cwd);
    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }
    const markdown = releasePlanToMarkdown(plan);
    await writeText(resolve(options.cwd, "docs", "RELEASE_PLAN.md"), markdown, true);
    console.log(markdown);
    return;
  }
  if (command === "release-check") {
    const report = await evaluateReleaseCheck(options.cwd);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      if (report.status === "blocked") process.exitCode = 1;
      return;
    }
    console.log(releaseCheckToMarkdown(report));
    if (report.status === "blocked") process.exitCode = 1;
    return;
  }
  if (command === "product-readiness") {
    const readiness = await evaluateProductReadiness(options.cwd);
    if (options.json) {
      console.log(JSON.stringify(readiness, null, 2));
      if (readiness.status === "blocked") process.exitCode = 1;
      return;
    }
    const markdown = productReadinessToMarkdown(readiness);
    await writeText(resolve(options.cwd, "docs", "PRODUCT_READINESS.md"), markdown, true);
    console.log(markdown);
    if (readiness.status === "blocked") process.exitCode = 1;
    return;
  }
  if (command === "service-readiness") {
    const readiness = await evaluateServiceReadiness(options.cwd);
    if (options.json) {
      console.log(JSON.stringify(readiness, null, 2));
      if (readiness.status === "blocked") process.exitCode = 1;
      return;
    }
    const markdown = serviceReadinessToMarkdown(readiness);
    await writeText(resolve(options.cwd, "docs", "SERVICE_READINESS.md"), markdown, true);
    console.log(markdown);
    if (readiness.status === "blocked") process.exitCode = 1;
    return;
  }
  if (command === "doctor") {
    const report = await evaluateCapabilityDoctor(options.cwd);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
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
      console.log(JSON.stringify(result, null, 2));
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

function parseOptions(args: string[]): CliOptions {
  const cwd = optionValue(args, "--cwd");
  const friction = optionValue(args, "--friction");
  const runId = optionValue(args, "--run-id");
  const evidence = optionValue(args, "--evidence");
  return {
    cwd: cwd ? resolve(cwd) : process.cwd(),
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
    json: args.includes("--json"),
    friction: friction ?? "medium",
    runId: runId ?? "field-run",
    evidence: evidence ?? "evidence/field-readiness/field-run"
  };
}

function optionValue(args: readonly string[], flag: string): string | null {
  const index = args.findIndex((arg) => arg === flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
}

function printHelp(): void {
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
