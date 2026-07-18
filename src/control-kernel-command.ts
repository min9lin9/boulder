import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { prettyJson } from "./cli-format";
import { optionValue, subcommandAfter } from "./cli-options";
import {
  canonicalize,
  createControlDecisionSeal,
  evaluateControlRun,
  hashControlValue,
  isControlDecisionSeal,
  isControlEvidenceManifest,
  isControlPolicy,
  isControlRunEvent,
  validateControlDecisionSeal,
  validateControlEvidenceManifest,
  validateControlPolicy,
  validateControlRunEvent,
  verifyControlDecisionSeal,
  type ControlDecisionSeal,
  type ControlEvaluation,
  type ControlRunEvent
} from "./control-kernel";
import { exists, noFollowFlag, safeReplaceText } from "./fs";

export type ControlKernelCommandOptions = {
  readonly cwd: string;
  readonly json: boolean;
};

type ArtifactKind = "runs" | "seals";

type RecordResult = {
  readonly status: "recorded" | "already-recorded";
  readonly runId: string;
  readonly path: string;
  readonly runHash: string;
};

type SealResult = {
  readonly status: "sealed" | "already-sealed";
  readonly runId: string;
  readonly path: string;
  readonly seal: ControlDecisionSeal;
};

export class ControlKernelCommandError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ControlKernelCommandError";
    this.code = code;
  }
}

export async function runControlKernelCommand(args: readonly string[], options: ControlKernelCommandOptions): Promise<void> {
  const action = subcommandAfter(args, "control") ?? "help";
  try {
    if (action === "record") {
      const run = await loadRun(options.cwd, requiredOption(args, "--event"));
      print(await recordControlRunEvent(options.cwd, run), options.json);
      return;
    }
    if (action === "evaluate") {
      const run = await loadRun(options.cwd, requiredOption(args, "--event"));
      const manifest = await loadManifest(options.cwd, requiredOption(args, "--manifest"));
      const policy = await loadPolicy(options.cwd, requiredOption(args, "--policy"));
      const evaluation = await evaluateControlRun(run, manifest, policy);
      const result = await storedRunMatches(options.cwd, run) ? evaluation : missingAudit(evaluation);
      print(result, options.json);
      if (result.status === "blocked") process.exitCode = 1;
      return;
    }
    if (action === "seal") {
      const run = await loadRun(options.cwd, requiredOption(args, "--event"));
      const manifest = await loadManifest(options.cwd, requiredOption(args, "--manifest"));
      const policy = await loadPolicy(options.cwd, requiredOption(args, "--policy"));
      if (!await storedRunMatches(options.cwd, run)) {
        throw new ControlKernelCommandError("audit_required", "Record the exact run event before sealing it.");
      }
      print(await recordControlDecisionSeal(options.cwd, await createControlDecisionSeal(run, manifest, policy)), options.json);
      return;
    }
    if (action === "verify-seal") {
      const seal = await loadSeal(options.cwd, requiredOption(args, "--seal"));
      const run = await loadRun(options.cwd, requiredOption(args, "--event"));
      const manifest = await loadManifest(options.cwd, requiredOption(args, "--manifest"));
      const policy = await loadPolicy(options.cwd, requiredOption(args, "--policy"));
      const result = await verifyControlDecisionSeal(seal, run, manifest, policy);
      print(result, options.json);
      if (result.status === "invalid") process.exitCode = 1;
      return;
    }
    if (action === "help") {
      printHelp();
      return;
    }
    throw new ControlKernelCommandError("unknown_command", `Unknown control command: ${action}`);
  } catch (error) {
    const normalized = normalizeError(error);
    console.error(`ERROR control.${normalized.code}: ${normalized.message}`);
    process.exitCode = 1;
  }
}

export async function recordControlRunEvent(root: string, run: ControlRunEvent): Promise<RecordResult> {
  const issues = validateControlRunEvent(run);
  if (issues.length > 0) throw invalidInput("run event", issues);
  const location = await prepareArtifactLocation(root, "runs", run.runId);
  const runHash = await hashControlValue(run);
  if (await exists(location.absolute)) {
    const existing = await readStoredArtifact(root, location.relative);
    if (isControlRunEvent(existing) && await hashControlValue(existing) === runHash) {
      return { status: "already-recorded", runId: run.runId, path: location.relative, runHash };
    }
    throw new ControlKernelCommandError("run_conflict", `Run ID already exists with different content: ${location.relative}`);
  }
  await safeReplaceText(location.absolute, `${prettyJson(canonicalize(run))}\n`);
  if (!await artifactPathIsSafe(root, location.absolute, "runs")) {
    throw new ControlKernelCommandError("path_invalid", `Unsafe control-kernel path after write: ${location.relative}`);
  }
  return { status: "recorded", runId: run.runId, path: location.relative, runHash };
}

export async function recordControlDecisionSeal(root: string, seal: ControlDecisionSeal): Promise<SealResult> {
  const issues = validateControlDecisionSeal(seal);
  if (issues.length > 0) throw invalidInput("decision seal", issues);
  const location = await prepareArtifactLocation(root, "seals", seal.runId);
  if (await exists(location.absolute)) {
    const existing = await readStoredArtifact(root, location.relative);
    if (isControlDecisionSeal(existing) && sameDecisionBinding(existing, seal)) {
      return { status: "already-sealed", runId: seal.runId, path: location.relative, seal: existing };
    }
    throw new ControlKernelCommandError("seal_conflict", `Run ID already has a different seal: ${location.relative}`);
  }
  await safeReplaceText(location.absolute, `${prettyJson(canonicalize(seal))}\n`);
  if (!await artifactPathIsSafe(root, location.absolute, "seals")) {
    throw new ControlKernelCommandError("path_invalid", `Unsafe control-kernel path after write: ${location.relative}`);
  }
  return { status: "sealed", runId: seal.runId, path: location.relative, seal };
}

function missingAudit(evaluation: ControlEvaluation): ControlEvaluation {
  return {
    ...evaluation,
    status: "blocked",
    issues: Array.from(new Set([...evaluation.issues, "audit:recorded-run-missing-or-mismatch"]))
  };
}

async function storedRunMatches(root: string, run: ControlRunEvent): Promise<boolean> {
  const location = artifactLocation(root, "runs", run.runId);
  if (!await exists(location.absolute)) return false;
  try {
    const stored = await readStoredArtifact(root, location.relative);
    return isControlRunEvent(stored) && await hashControlValue(stored) === await hashControlValue(run);
  } catch {
    return false;
  }
}

async function loadRun(root: string, path: string): Promise<ControlRunEvent> {
  const value = await readInput(root, path);
  const issues = validateControlRunEvent(value);
  if (!isControlRunEvent(value)) throw invalidInput("run event", issues);
  return value;
}

async function loadManifest(root: string, path: string) {
  const value = await readInput(root, path);
  const issues = validateControlEvidenceManifest(value);
  if (!isControlEvidenceManifest(value)) throw invalidInput("evidence manifest", issues);
  return value;
}

async function loadPolicy(root: string, path: string) {
  const value = await readInput(root, path);
  const issues = validateControlPolicy(value);
  if (!isControlPolicy(value)) throw invalidInput("policy", issues);
  return value;
}

async function loadSeal(root: string, path: string): Promise<ControlDecisionSeal> {
  const value = await readInput(root, path);
  const issues = validateControlDecisionSeal(value);
  if (!isControlDecisionSeal(value)) throw invalidInput("decision seal", issues);
  return value;
}

async function readStoredArtifact(root: string, relativePath: string): Promise<unknown> {
  const location = resolve(root, relativePath);
  if (!pathIsContained(resolve(root), location)) throw new ControlKernelCommandError("path_invalid", "Stored artifact escaped the workspace.");
  return await readJsonFile(resolve(root), location, relativePath);
}

async function readInput(root: string, requested: string): Promise<unknown> {
  const rootPath = resolve(root);
  const target = resolve(rootPath, requested);
  if (!pathIsContained(rootPath, target)) {
    throw new ControlKernelCommandError("path_invalid", `Input path must stay inside the workspace: ${requested}`);
  }
  return await readJsonFile(rootPath, target, requested);
}

async function readJsonFile(root: string, target: string, displayPath: string): Promise<unknown> {
  if (!await inputPathIsSafe(root, target)) {
    throw new ControlKernelCommandError("path_invalid", `Input path contains a symlink, hardlink, or non-file target: ${displayPath}`);
  }
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(target, constants.O_RDONLY | noFollowFlag());
    return JSON.parse(await handle.readFile("utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new ControlKernelCommandError("input_invalid", `Input is not valid JSON: ${displayPath}`);
    if (isMissing(error)) throw new ControlKernelCommandError("input_missing", `Input file was not found: ${displayPath}`);
    if (isUnsafeOpen(error)) throw new ControlKernelCommandError("path_invalid", `Input path is unsafe: ${displayPath}`);
    throw error;
  } finally {
    await handle?.close();
  }
}

async function inputPathIsSafe(root: string, target: string): Promise<boolean> {
  if (!pathIsContained(root, target)) return false;
  try {
    const rootInfo = await lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return false;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  const parts = relative(root, target).split(/[\\/]/).filter(Boolean);
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index] ?? "");
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) return false;
      if (index < parts.length - 1 && !info.isDirectory()) return false;
      if (index === parts.length - 1 && (!info.isFile() || info.nlink !== 1)) return false;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }
  return parts.length > 0;
}

async function prepareArtifactLocation(root: string, kind: ArtifactKind, id: string): Promise<{ readonly absolute: string; readonly relative: string }> {
  const location = artifactLocation(root, kind, id);
  const rootPath = resolve(root);
  if (!await directoryIsSafe(rootPath)) {
    throw new ControlKernelCommandError("path_invalid", "Workspace root must be a real directory.");
  }
  const directories = [
    join(rootPath, ".boulder"),
    join(rootPath, ".boulder", "control-kernel"),
    join(rootPath, ".boulder", "control-kernel", kind)
  ];
  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
    if (!await directoryIsSafe(directory)) {
      throw new ControlKernelCommandError("path_invalid", `Unsafe control-kernel directory: ${relative(rootPath, directory)}`);
    }
  }
  if (!await artifactPathIsSafe(root, location.absolute, kind)) {
    throw new ControlKernelCommandError("path_invalid", `Unsafe control-kernel path: ${location.relative}`);
  }
  return location;
}

function artifactLocation(root: string, kind: ArtifactKind, id: string): { readonly absolute: string; readonly relative: string } {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) {
    throw new ControlKernelCommandError("path_invalid", `Unsafe control artifact ID: ${id}`);
  }
  const fileName = encodeURIComponent(id);
  const relativePath = `.boulder/control-kernel/${kind}/${fileName}.json`;
  return { absolute: resolve(root, relativePath), relative: relativePath };
}

async function artifactPathIsSafe(root: string, target: string, kind: ArtifactKind): Promise<boolean> {
  const rootPath = resolve(root);
  if (!pathIsContained(rootPath, target)) return false;
  for (const path of [rootPath, join(rootPath, ".boulder"), join(rootPath, ".boulder", "control-kernel"), join(rootPath, ".boulder", "control-kernel", kind)]) {
    try {
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) return false;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }
  try {
    const info = await lstat(target);
    return info.isFile() && !info.isSymbolicLink() && info.nlink === 1;
  } catch (error) {
    if (isMissing(error)) return true;
    throw error;
  }
}

function sameDecisionBinding(left: ControlDecisionSeal, right: ControlDecisionSeal): boolean {
  return left.algorithm === right.algorithm
    && left.runId === right.runId
    && left.caseId === right.caseId
    && left.taskId === right.taskId
    && left.policyId === right.policyId
    && left.policyVersion === right.policyVersion
    && left.runHash === right.runHash
    && left.evidenceManifestHash === right.evidenceManifestHash
    && left.policyHash === right.policyHash;
}

async function directoryIsSafe(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    return info.isDirectory() && !info.isSymbolicLink();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function requiredOption(args: readonly string[], flag: string): string {
  const value = optionValue(args, flag);
  if (!value) throw new ControlKernelCommandError("input_missing", `Missing required option ${flag}.`);
  return value;
}

function invalidInput(label: string, issues: readonly string[]): ControlKernelCommandError {
  return new ControlKernelCommandError("input_invalid", `Invalid ${label}: ${issues.join(", ")}`);
}

function normalizeError(error: unknown): ControlKernelCommandError {
  if (error instanceof ControlKernelCommandError) return error;
  return new ControlKernelCommandError("unexpected", error instanceof Error ? error.message : String(error));
}

function print(value: unknown, json: boolean): void {
  if (json) {
    console.log(prettyJson(value));
    return;
  }
  console.log(prettyJson(value));
}

function printHelp(): void {
  console.log([
    "Boulder control kernel",
    "",
    "  boulder control record --event path [--cwd path] [--json]",
    "  boulder control evaluate --event path --manifest path --policy path [--cwd path] [--json]",
    "  boulder control seal --event path --manifest path --policy path [--cwd path] [--json]",
    "  boulder control verify-seal --seal path --event path --manifest path --policy path [--cwd path] [--json]"
  ].join("\n"));
}

function pathIsContained(root: string, target: string): boolean {
  const relation = relative(root, target).replace(/\\/g, "/");
  return relation.length > 0 && relation !== ".." && !relation.startsWith("../") && !relation.startsWith("/") && !/^[A-Za-z]:\//.test(relation);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, "code") === "ENOENT";
}

function isUnsafeOpen(error: unknown): boolean {
  const code = error instanceof Error ? Reflect.get(error, "code") : null;
  return code === "ELOOP" || code === "EMLINK";
}
