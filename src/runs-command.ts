import { prettyJson } from "./cli-format";
import { latestRunEvent, listRunEvents, pruneRunEvents, runEventsList, showRunEvent } from "./run-events";

export async function runRunsCommand(commandArgs: readonly string[], args: readonly string[], cwd: string, json: boolean): Promise<void> {
  if (!json) {
    console.error("ERROR runs.json_required: runs list/show/prune require --json.");
    process.exitCode = 1;
    return;
  }

  const action = commandArgs[1] ?? "list";
  if (action === "list") {
    console.log(prettyJson(runEventsList(await listRunEvents(cwd))));
    return;
  }

  if (action === "show") {
    const event = args.includes("--latest") ? await latestRunEvent(cwd) : await showRunEvent(cwd, runIdFromCommandArgs(commandArgs));
    if (!event) {
      console.error("ERROR runs.not_found: No matching run event found.");
      process.exitCode = 1;
      return;
    }
    console.log(prettyJson(event));
    return;
  }

  if (action === "prune") {
    console.log(prettyJson(await pruneRunEvents(cwd, retentionDays(args), retentionKeep(args))));
    return;
  }

  console.error(`Unknown runs command: ${action}`);
  process.exitCode = 1;
}

function runIdFromCommandArgs(commandArgs: readonly string[]): string {
  return commandArgs.find((arg, index) => index > 1 && !arg.startsWith("-")) ?? "";
}

function retentionDays(args: readonly string[]): number {
  const value = optionValue(args, "--older-than") ?? "30d";
  const match = /^(\d+)d$/.exec(value);
  return match?.[1] ? Number(match[1]) : 30;
}

function retentionKeep(args: readonly string[]): number {
  const value = optionValue(args, "--keep") ?? "200";
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 200;
}

function optionValue(args: readonly string[], flag: string): string | null {
  const index = args.findIndex((arg) => arg === flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : null;
}
