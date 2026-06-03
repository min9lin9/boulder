import { resolve } from "node:path";
import { writeText } from "./fs";
import { exportHarness } from "./export";
import { inspectRepo, inspectionToMarkdown } from "./inspect";
import { initHarness } from "./workflows";
import { verifyHarness, verifyResultsToMarkdown } from "./verify";

type CliOptions = {
  cwd: string;
  force: boolean;
  dryRun: boolean;
  json: boolean;
};

const VERSION = "0.1.0";

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
    printLines("Boulder initialized", results);
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
  if (command === "export") {
    const results = await exportHarness(options.cwd, options.force);
    printLines("Boulder export complete", results);
    return;
  }
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

function parseOptions(args: string[]): CliOptions {
  const cwdFlag = args.findIndex((arg) => arg === "--cwd");
  const cwd = cwdFlag >= 0 && args[cwdFlag + 1] ? resolve(args[cwdFlag + 1]) : process.cwd();
  return {
    cwd,
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
    json: args.includes("--json")
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
    "  boulder verify [--cwd path] [--dry-run]",
    "  boulder export [--cwd path] [--force]",
    "",
    "Package:",
    "  bunx boulder-oss-cli <command>",
    ""
  ].join("\n"));
}

function printLines(title: string, lines: string[]): void {
  console.log(title);
  for (const line of lines) {
    console.log(`- ${line}`);
  }
}
