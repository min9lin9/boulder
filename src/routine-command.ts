import { formatLines, formatWeeklyRetroReport, prettyJson } from "./cli-format";
import type { CliOptions } from "./cli-options";
import { captureRoutine, InvalidRoutinePathError, InvalidRoutineTaskError } from "./routine";
import { evaluateWeeklyRetro } from "./routine-retro";
import { InvalidSkillProposalArtifactError, InvalidSkillProposalRoutineIdError, MissingSkillProposalRoutineError, proposeSkillFromRoutine } from "./skill-proposal";
import { resolveWorkflowProfile } from "./workflow-profiles";

type RoutineCommandOptions = Pick<CliOptions, "cwd" | "dryRun" | "json">;

export async function runRoutineCommand(args: readonly string[], options: RoutineCommandOptions): Promise<boolean> {
  if (args[0] === "routine" && args[1] === "capture") {
    await runRoutineCapture(args, options);
    return true;
  }
  if (args[0] === "retro" && args[1] === "weekly") {
    await runWeeklyRetro(args, options);
    return true;
  }
  if (args[0] === "skill" && args[1] === "propose") {
    await runSkillPropose(args, options);
    return true;
  }
  return false;
}

async function runRoutineCapture(args: readonly string[], options: RoutineCommandOptions): Promise<void> {
  const write = args.includes("--write");
  if (options.dryRun && write) {
    console.error("ERROR routine.mode_conflict: Use exactly one of --dry-run or --write.");
    process.exitCode = 1;
    return;
  }
  if (!options.dryRun && !write) {
    console.error("ERROR routine.mode_required: Use exactly one of --dry-run or --write.");
    process.exitCode = 1;
    return;
  }
  const resolution = await resolveWorkflowProfile(options.cwd, {});
  try {
    const result = await captureRoutine(options.cwd, optionValue(args, "--task"), resolution.profile.id, write);
    if (options.json) {
      console.log(prettyJson(result));
      return;
    }
    console.log(formatLines("Boulder routine capture", [`status: ${result.status}`, `path: ${result.path}`, `seen-count: ${result.routine.seenCount}`]));
  } catch (error) {
    if (error instanceof InvalidRoutineTaskError) {
      console.error(`ERROR routine.invalid_task: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    if (error instanceof InvalidRoutinePathError) {
      console.error(`ERROR routine.path_invalid: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

async function runWeeklyRetro(args: readonly string[], options: RoutineCommandOptions): Promise<void> {
  if (!options.dryRun || args.includes("--write")) {
    console.error("ERROR retro.mode_required: Use --dry-run.");
    process.exitCode = 1;
    return;
  }
  const report = await evaluateWeeklyRetro(options.cwd);
  if (options.json) {
    console.log(prettyJson(report));
    return;
  }
  console.log(formatWeeklyRetroReport(report));
}

async function runSkillPropose(args: readonly string[], options: RoutineCommandOptions): Promise<void> {
  const write = args.includes("--write");
  if (options.dryRun && write) {
    console.error("ERROR skill_proposal.mode_conflict: Use exactly one of --dry-run or --write.");
    process.exitCode = 1;
    return;
  }
  if (!options.dryRun && !write) {
    console.error("ERROR skill_proposal.mode_required: Use exactly one of --dry-run or --write.");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await proposeSkillFromRoutine(options.cwd, optionValue(args, "--from-routine"), write);
    if (options.json) {
      console.log(prettyJson(result));
      return;
    }
    if (write) {
      console.log(formatLines("Boulder skill proposal written", [`path: ${result.path}`]));
      return;
    }
    console.log(`${formatLines("Boulder skill proposal dry-run", [`path: ${result.path}`])}\n\n${result.markdown}`);
  } catch (error) {
    if (error instanceof InvalidSkillProposalRoutineIdError) {
      console.error(`ERROR skill_proposal.invalid_routine: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    if (error instanceof MissingSkillProposalRoutineError) {
      console.error(`ERROR skill_proposal.routine_missing: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    if (error instanceof InvalidSkillProposalArtifactError) {
      console.error(`ERROR skill_proposal.path_invalid: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function optionValue(args: readonly string[], flag: string): string | null {
  const index = args.findIndex((arg) => arg === flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : null;
}
