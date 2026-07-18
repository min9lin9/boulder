import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { analyzePlanTask, type PlanFriction } from "./plan-analysis.js";
import { at, exists } from "./fs.js";
import { validatePlanAnalysisShape } from "./plan-analysis-shape.js";
import { inspectRepo } from "./inspect.js";
import { PlanStorePathError, readPlanArtifact, validPlanRunId } from "./plan-store.js";
import { loadManifest, MANIFEST_FILE } from "./manifest.js";
import { validatePlanRunState } from "./plan-state.js";
import { validatePlanningPacket } from "./planning-packet.js";
import { protectedPathsReferencedByTask } from "./path-glob.js";

const subcommands = new Set(["analyze", "show", "validate"]);
const artifactNames = new Map([["analysis", "analysis.json"], ["state", "state.json"], ["packet", "packet.json"]]);

type PlanCommandOptions = Readonly<{ cwd: string; json: boolean }>;
type CommandResult = Readonly<Record<string, unknown>>;
class PlanArtifactParseError extends Error {}

export async function runPlanCommand(args: readonly string[], options: PlanCommandOptions): Promise<void> {
  const parsed = parsePlanArgs(args);
  if (parsed.error) return printError(false, parsed.error);
  if (!parsed.subcommand || !subcommands.has(parsed.subcommand)) {
    return printError(options.json, "ERROR plan.command.invalid: Expected one of: analyze, show, validate.");
  }
  if (parsed.subcommand === "analyze") return runAnalyze(parsed.values, options);
  if (parsed.subcommand === "show") return runShow(parsed.values, options);
  return runValidate(parsed.values, options);
}
/** Uses inferred protected paths only before boulder.yaml has been initialized. */
async function protectedPathsForAnalysis(root: string, inferredProtectedPaths: readonly string[]): Promise<readonly string[]> {
  if (!await exists(at(root, MANIFEST_FILE))) return inferredProtectedPaths;
  return (await loadManifest(root)).protectedPaths;
}

async function runAnalyze(values: ReadonlyMap<string, string>, options: PlanCommandOptions): Promise<void> {
  const task = values.get("--task");
  if (!task || task.trim().length === 0) return printError(options.json, "ERROR plan.task.required: --task is required for plan analyze.");
  const requestedFriction = values.get("--friction");
  if (requestedFriction && !isFriction(requestedFriction)) return printError(options.json, "ERROR plan.friction.invalid: --friction must be direct, focused, or deep.");
  const runId = values.get("--run-id") ?? "analysis";
  if (!validPlanRunId(runId)) return printError(options.json, "ERROR plan.path.invalid: Plan run id must be a safe slug.");
  const inspection = await inspectRepo(options.cwd);
  const referencedProtectedPaths = protectedPathsReferencedByTask(task, await protectedPathsForAnalysis(options.cwd, inspection.protectedPaths));
  const analysis = analyzePlanTask({
    task,
    runId,
    requestedFriction: requestedFriction as PlanFriction | undefined,
    inspection: {
      files: [...inspection.detected.tests, ...inspection.detected.docs, ...inspection.detected.ci],
      publicApi: referencedProtectedPaths.length > 0,
      verificationAvailable: inspection.likelyVerification.length > 0
    },
    protectedPaths: referencedProtectedPaths,
    knownVerificationCommands: inspection.likelyVerification.map((entry) => entry.command)
  });
  const result: CommandResult = {
    schemaVersion: "boulder.plan.command-result.v1",
    command: "plan analyze",
    status: "ready",
    runId: analysis.runId,
    artifacts: [],
    analysis,
    nextActions: []
  };
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(["# Plan Analysis", "", `- Run: ${analysis.runId}`, `- Mode: ${analysis.selectedMode}`, `- Score: ${analysis.score}`, `- Confidence: ${analysis.confidence}`].join("\n"));
}

async function runShow(values: ReadonlyMap<string, string>, options: PlanCommandOptions): Promise<void> {
  const runId = values.get("--run-id");
  if (!runId) return printError(options.json, "ERROR plan.run_id.required: --run-id is required for plan show.");
  if (!validPlanRunId(runId)) return printError(options.json, "ERROR plan.path.invalid: Plan run id must be a safe slug.");
  try {
    const artifacts = await loadRunArtifacts(options.cwd, runId);
    if (Object.keys(artifacts).length === 0) return printError(options.json, "ERROR plan.artifact.missing: No plan artifacts exist for this run.");
    const result: CommandResult = { schemaVersion: "boulder.plan.command-result.v1", command: "plan show", status: "ready", runId, artifacts };
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(["# Plan Run", "", `- Run: ${runId}`, ...Object.keys(artifacts).map((name) => `- ${name}: available`)].join("\n"));
  } catch (error) {
    printStoreError(options.json, error);
  }
}

async function runValidate(values: ReadonlyMap<string, string>, options: PlanCommandOptions): Promise<void> {
  const runId = values.get("--run-id");
  const artifact = values.get("--artifact");
  const input = values.get("--input");
  if (input) {
    const content = await readLocalInput(options.cwd, input, options.json);
    if (content === null) return;
    try {
      return printValidation(options, "input", validateArtifact(artifact ?? inferArtifact(input), parseJson(content)));
    } catch (error) {
      return printStoreError(options.json, error);
    }
  }
  if (!runId) return printError(options.json, "ERROR plan.run_id.required: --run-id is required unless --input is supplied.");
  if (!validPlanRunId(runId)) return printError(options.json, "ERROR plan.path.invalid: Plan run id must be a safe slug.");
  const names = artifact ? [artifact] : [...artifactNames.keys()];
  if (names.some((name) => !artifactNames.has(name))) return printError(options.json, "ERROR plan.artifact.invalid: --artifact must be analysis, state, or packet.");
  try {
    const results: Record<string, unknown> = {};
    for (const name of names) {
      const content = await readPlanArtifact(options.cwd, runId, artifactNames.get(name)!);
      if (content === null) return printError(options.json, `ERROR plan.artifact.missing: ${name} artifact is missing.`);
      results[name] = validateArtifact(name, parseJson(content));
    }
    const valid = Object.values(results).every((result) => (result as { valid: boolean }).valid);
    const result: CommandResult = { schemaVersion: "boulder.plan.command-result.v1", command: "plan validate", status: valid ? "ready" : "blocked", runId, artifacts: results };
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(valid ? "Plan artifacts are valid." : "Plan artifacts are invalid.");
    if (!valid) process.exitCode = 1;
  } catch (error) {
    printStoreError(options.json, error);
  }
}

async function loadRunArtifacts(cwd: string, runId: string): Promise<Record<string, unknown>> {
  const artifacts: Record<string, unknown> = {};
  for (const [name, file] of artifactNames) {
    const content = await readPlanArtifact(cwd, runId, file);
    if (content !== null) artifacts[name] = parseJson(content);
  }
  return artifacts;
}

function validateArtifact(name: string | undefined, value: unknown): { valid: boolean; issues: readonly unknown[] } {
  if (name === "analysis") {
    const issues = validatePlanAnalysisShape(value);
    return { valid: issues.length === 0, issues };
  }
  if (name === "state") {
    const issues = validatePlanRunState(value).map((entry) => ({ code: entry.code, message: entry.message }));
    return { valid: issues.length === 0, issues };
  }
  if (name === "packet") {
    const result = validatePlanningPacket(value);
    return { valid: result.valid, issues: result.issues };
  }
  return { valid: false, issues: [{ code: "plan.artifact.invalid", message: "Artifact type cannot be inferred." }] };
}

function parsePlanArgs(args: readonly string[]): { subcommand: string | null; values: ReadonlyMap<string, string>; error: string | null } {
  const values = new Map<string, string>();
  const valueFlags = new Set(["--run-id", "--task", "--input", "--artifact", "--friction", "--cwd", "--evidence"]);
  const booleanFlags = new Set(["--json", "--force", "--dry-run"]);
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (valueFlags.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) return { subcommand: null, values, error: `ERROR plan.option.value_missing: ${arg} requires a value.` };
      values.set(arg, value);
      index += 1;
    } else if (!booleanFlags.has(arg)) positional.push(arg);
  }
  const planIndex = positional.indexOf("plan");
  const subcommand = planIndex >= 0 ? positional[planIndex + 1] ?? null : null;
  if (subcommand === "show" && !values.has("--run-id") && positional[planIndex + 2]) values.set("--run-id", positional[planIndex + 2]);
  return { subcommand, values, error: null };
}

async function readLocalInput(cwd: string, input: string, json: boolean): Promise<string | null> {
  const target = resolve(cwd, input);
  if (relative(resolve(cwd), target).startsWith("..")) {
    printError(json, "ERROR plan.path.invalid: Input path must stay inside the workspace.");
    return null;
  }
  try { return await readFile(target, "utf8"); } catch { printError(json, "ERROR plan.artifact.missing: Input artifact is missing."); return null; }
}
function parseJson(content: string): unknown {
  try { return JSON.parse(content); } catch { throw new PlanArtifactParseError("Plan artifact contains malformed JSON."); }
}
function inferArtifact(input: string): string | undefined { return input.includes("analysis") ? "analysis" : input.includes("state") ? "state" : input.includes("packet") ? "packet" : undefined; }
function isFriction(value: string): value is PlanFriction { return value === "direct" || value === "focused" || value === "deep"; }
function printValidation(options: PlanCommandOptions, artifact: string, result: { valid: boolean; issues: readonly unknown[] }): void {
  const payload = { schemaVersion: "boulder.plan.command-result.v1", command: "plan validate", status: result.valid ? "ready" : "blocked", artifacts: { [artifact]: result } };
  if (options.json) console.log(JSON.stringify(payload, null, 2)); else console.log(result.valid ? "Plan artifact is valid." : "Plan artifact is invalid.");
  if (!result.valid) process.exitCode = 1;
}
function printStoreError(json: boolean, error: unknown): void {
  if (error instanceof PlanStorePathError) return printError(json, `ERROR plan.path.invalid: ${error.message}`);
  if (error instanceof PlanArtifactParseError) return printError(json, `ERROR plan.artifact.malformed: ${error.message}`);
  printError(json, "ERROR plan.artifact.missing: Plan run or artifact is missing.");
}
function printError(json: boolean, message: string): void { if (json) console.log(JSON.stringify({ schemaVersion: "boulder.error.v1", error: { id: message.split(":")[0].replace("ERROR ", ""), message: message.slice(message.indexOf(":") + 2) } }, null, 2)); else console.error(message); process.exitCode = 1; }
