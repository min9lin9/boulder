import { formatLines, formatWeeklyRetroReport, prettyJson } from "./cli-format";
import { optionValue, type CliOptions } from "./cli-options";
import { WriterBusyError, WriterLockError } from "./evidence-write-lock";
import { EvidenceDescriptorError } from "./evidence/descriptors";
import { attachRoutineEvidence, captureRoutine, InvalidRoutinePathError, InvalidRoutineTaskError, RoutineEvidenceError } from "./routine";
import { evaluateWeeklyRetro } from "./routine-retro";
import { InvalidSkillProposalArtifactError, InvalidSkillProposalRoutineIdError, MissingSkillProposalRoutineError, proposeSkillFromRoutine } from "./skill-proposal";
import { resolveWorkflowProfile } from "./workflow-profiles";

type RoutineCommandOptions = Pick<CliOptions, "cwd" | "dryRun" | "json">;

export async function runRoutineCommand(args: readonly string[], options: RoutineCommandOptions): Promise<boolean> {
  if (args[0] === "routine" && args[1] === "capture") {
    await runRoutineCapture(args, options);
    return true;
  }
  if (args[0] === "routine" && args[1] === "evidence" && args[2] === "add") {
    await runRoutineEvidenceAdd(args, options);
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
    if (error instanceof WriterBusyError) {
      console.error("ERROR trace.writer_busy: another evidence writer is active");
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

async function runRoutineEvidenceAdd(args: readonly string[], options: RoutineCommandOptions): Promise<void> {
  try {
    if (options.dryRun) throw new RoutineEvidenceError("routine.mode_conflict", "Evidence add writes an attachment; --dry-run is not supported.");
    const task = requiredEvidenceOption(args, "--task");
    const ordinal = requiredEvidenceOption(args, "--ordinal");
    const descriptorKind = requiredEvidenceOption(args, "--descriptor-kind");
    const descriptorId = requiredEvidenceOption(args, "--descriptor-id");
    if (!/^[1-9][0-9]*$/.test(ordinal) || !Number.isSafeInteger(Number(ordinal))) {
      throw new RoutineEvidenceError("routine.ordinal_invalid", "--ordinal must be a positive integer.");
    }
    const result = await attachRoutineEvidence(options.cwd, {
      task, ordinal: Number(ordinal), descriptorKind, descriptorId, note: evidenceNote(args)
    });
    if (options.json) {
      console.log(prettyJson(result));
      return;
    }
    console.log(formatLines("Boulder routine evidence", [`status: ${result.status}`, `path: ${result.artifact_path}`, ...result.evidence_refs]));
  } catch (error) {
    if (error instanceof WriterBusyError) {
      console.error("ERROR trace.writer_busy: another evidence writer is active");
    } else if (error instanceof RoutineEvidenceError || error instanceof EvidenceDescriptorError || error instanceof WriterLockError) {
      console.error(`ERROR ${error.code}: ${error.message}`);
    } else if (error instanceof InvalidRoutinePathError) {
      console.error(`ERROR routine.path_invalid: ${error.message}`);
    } else if (error instanceof Error && typeof Reflect.get(error, "code") === "string") {
      console.error(`ERROR routine.evidence_io: ${error.message}`);
    } else {
      throw error;
    }
    process.exitCode = 1;
  }
}

function requiredEvidenceOption(args: readonly string[], flag: string): string {
  const value = optionValue(args, flag);
  if (!value || args.filter((arg) => arg === flag).length !== 1) {
    throw new RoutineEvidenceError("routine.evidence_option_required", `Use exactly one ${flag} with an explicit value.`);
  }
  return value;
}

// Optional human note on the stored ref. Bounded safe text like routine tasks:
// control characters are rejected, whitespace collapses, empty means absent.
function evidenceNote(args: readonly string[]): string | undefined {
  const occurrences = args.filter((arg) => arg === "--note").length;
  if (occurrences === 0) return undefined;
  const value = optionValue(args, "--note");
  if (occurrences !== 1 || !value) {
    throw new RoutineEvidenceError("routine.evidence_note_invalid", "Use at most one --note with an explicit value.");
  }
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!normalized || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new RoutineEvidenceError("routine.evidence_note_invalid", "--note must be non-empty safe text.");
  }
  return normalized;
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
