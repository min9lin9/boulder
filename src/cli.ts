import { resolve } from "node:path";
import { benchmarkReportToMarkdown, evaluateBenchmarkFixtures, loadBenchmarkFixtures } from "./benchmark";
import { writeText } from "./fs";
import { exportHarness } from "./export";
import { inspectRepo, inspectionToMarkdown } from "./inspect";
import { loadManifest } from "./manifest";
import { buildPipelinePlan, formatPipelinePlan, invalidFrictionMessage, isFrictionLevel } from "./pipeline";
import { evaluateReleasePlan, releasePlanToMarkdown } from "./release-plan";
import { scorecardToMarkdown, scoreManifest } from "./scorecard";
import { formatManifestIssues, hasManifestErrors, validateManifest } from "./validation";
import { initHarness } from "./workflows";
import { verifyHarness, verifyResultsToMarkdown } from "./verify";

type CliOptions = {
  cwd: string;
  force: boolean;
  dryRun: boolean;
  json: boolean;
  friction: string;
};

const VERSION = "0.1.6";

export async function main(args: string[]): Promise<void> {
  const command = args.find((arg) => !arg.startsWith("-")) ?? "help";
  const options = parseOptions(args);
  if (command === "help" || args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  if (command === "version" || args.includes("--version")) {
    console.log(VERSION);
    return;
  }
  if (command === "init") {
    const results = await initHarness(options.cwd, options.force);
    console.log(formatLines("Boulder initialized", results));
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
  const cwdFlag = args.findIndex((arg) => arg === "--cwd");
  const frictionFlag = args.findIndex((arg) => arg === "--friction");
  const cwd = cwdFlag >= 0 && args[cwdFlag + 1] ? resolve(args[cwdFlag + 1]) : process.cwd();
  return {
    cwd,
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
    json: args.includes("--json"),
    friction: frictionFlag >= 0 && args[frictionFlag + 1] ? args[frictionFlag + 1] : "medium"
  };
}

function printHelp(): void {
  console.log([
    "boulder",
    "",
    "A min9lin9 operator kit for turning OSS repositories into evidence-backed Codex workflows.",
    "",
    "Usage:",
    "  boulder init [--cwd path] [--force]",
    "  boulder inspect [--cwd path] [--json]",
    "  boulder validate [--cwd path]",
    "  boulder verify [--cwd path] [--dry-run]",
    "  boulder pipeline [--cwd path] [--friction low|medium|high] [--json]",
    "  boulder scorecard [--cwd path] [--json]",
    "  boulder benchmark [--cwd path] [--json]",
    "  boulder release-plan [--cwd path] [--json]",
    "  boulder export [--cwd path] [--force]",
    "",
    "Package:",
    "  bunx boulder-oss-cli <command>",
    ""
  ].join("\n"));
}

function formatLines(title: string, lines: readonly string[]): string {
  return [title, ...lines.map((line) => `- ${line}`)].join("\n");
}
