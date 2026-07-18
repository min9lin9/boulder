import { constants } from "node:fs";
import { lstat, open, readdir, realpath, stat, type FileHandle } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import {
  buildPlannerBenchmarkReport,
  validatePlannerBenchmarkProvenance,
  type PlannerBenchmarkIssue,
  type PlannerBenchmarkProvenance,
  type PlannerBenchmarkReport
} from "./planner-benchmark.js";
import { canonicalizePlanningValue, sha256Digest } from "./planning-canonical.js";

export interface PlannerBenchmarkCommandResult {
  readonly schemaVersion: "boulder.planner-benchmark-command-result.v1";
  readonly command: "plan benchmark";
  readonly status: "ready" | "blocked";
  readonly report: PlannerBenchmarkReport;
  readonly issues: readonly PlannerBenchmarkIssue[];
}

const requiredFiles = ["protocol.json", "manifest.json", "bundle.json", "report.json"] as const;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
class StudyEvidencePathError extends Error {
  constructor(message: string, readonly issuePath = "study-root") {
    super(message);
  }
}
class StudyEvidenceDigestError extends Error {
  constructor(readonly artifactPath: string) {
    super(`Study evidence digest does not match the signed index: ${artifactPath}`);
  }
}
class StudyEvidenceInputError extends Error {}
const expectedFileSystemErrorCodes = new Set(["EACCES", "EISDIR", "ENOENT", "ENOTDIR", "EPERM"]);
interface StudyBoundary {
  readonly rootPath: string;
  readonly dev: number;
  readonly ino: number;
}

function expectedFileSystemError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && typeof error.code === "string"
    && expectedFileSystemErrorCodes.has(error.code);
}

function commandIssue(code: PlannerBenchmarkIssue["code"], path: string, message: string): PlannerBenchmarkIssue {
  return { code, path, message };
}

function blocked(issues: readonly PlannerBenchmarkIssue[]): PlannerBenchmarkCommandResult {
  return { schemaVersion: "boulder.planner-benchmark-command-result.v1", command: "plan benchmark", status: "blocked", report: buildPlannerBenchmarkReport({ trustRoot: {}, protocol: {}, manifest: {}, rawRuns: [], bundle: {}, report: {}, evidenceFiles: [] }, issues), issues };
}

function insideBoundary(boundary: StudyBoundary, actual: string): boolean {
  const location = relative(boundary.rootPath, actual);
  return location !== ".." && !location.startsWith(`..${sep}`);
}
async function openedRegularFile(path: string, issuePath = "study-root", boundary?: StudyBoundary): Promise<Readonly<{ bytes: Uint8Array; realPath: string }>> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new StudyEvidencePathError("Evidence input must be a real regular file.", issuePath);
  const actual = await realpath(path);
  if (boundary) {
    const root = await stat(boundary.rootPath);
    if (root.dev !== boundary.dev || root.ino !== boundary.ino || !insideBoundary(boundary, actual)) {
      throw new StudyEvidencePathError("Study evidence boundary changed while it was being resolved.", issuePath);
    }
  }
  const noFollow = constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") throw new StudyEvidencePathError("This platform cannot safely open evidence without following symlinks.", issuePath);
  let handle: FileHandle | undefined;
  try {
    try {
      handle = await open(path, constants.O_RDONLY | noFollow);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ELOOP") throw new StudyEvidencePathError("Evidence input must not traverse symlinks.", issuePath);
      throw error;
    }
    const reopenedPath = await realpath(path);
    const [opened, resolved, reopened, root] = await Promise.all([
      handle.stat(),
      stat(actual),
      stat(reopenedPath),
      boundary ? stat(boundary.rootPath) : undefined
    ]);
    if (!opened.isFile() || !resolved.isFile() || !reopened.isFile()
      || opened.dev !== resolved.dev || opened.ino !== resolved.ino
      || opened.dev !== reopened.dev || opened.ino !== reopened.ino
      || reopenedPath !== actual) {
      throw new StudyEvidencePathError("Evidence input changed while it was being opened.", issuePath);
    }
    if (opened.nlink !== 1 || resolved.nlink !== 1 || reopened.nlink !== 1) {
      throw new StudyEvidencePathError("Evidence input must not have hard-link aliases.", issuePath);
    }
    if (boundary && (!root || root.dev !== boundary.dev || root.ino !== boundary.ino || !insideBoundary(boundary, reopenedPath))) {
      throw new StudyEvidencePathError("Study evidence boundary changed while it was being opened.", issuePath);
    }
    return { bytes: await handle.readFile(), realPath: actual };
  } finally {
    await handle?.close();
  }
}

function safeStudyRelativePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.startsWith("\\") && !/^[A-Za-z]:[\\/]/.test(value) && !value.includes("\\") && !value.split("/").some((part) => part === "" || part === "." || part === "..");
}
function copiedBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", copiedBuffer(value)));
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function regularStudyFile(boundary: StudyBoundary, path: string): Promise<Uint8Array> {
  if (!safeStudyRelativePath(path)) throw new StudyEvidencePathError("Study evidence path is invalid.");
  const candidate = resolve(boundary.rootPath, path);
  if (!insideBoundary(boundary, candidate) || candidate === boundary.rootPath) throw new StudyEvidencePathError("Study evidence path escapes the study root.");
  let current = boundary.rootPath;
  const parts = path.split("/");
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) throw new StudyEvidencePathError("Study evidence must not traverse symlinks.");
    if (index === parts.length - 1 ? !metadata.isFile() : !metadata.isDirectory()) throw new StudyEvidencePathError("Study evidence path has an invalid file type.");
  }
  return (await openedRegularFile(candidate, "study-root", boundary)).bytes;
}

function artifactPaths(bundle: unknown): readonly string[] {
  if (!object(bundle) || !Array.isArray(bundle.artifactIndex)) throw new StudyEvidencePathError("Evidence bundle artifact index is invalid.");
  const paths = new Set<string>();
  return bundle.artifactIndex.map((entry) => {
    if (!object(entry) || !safeStudyRelativePath(entry.path) || paths.has(entry.path)) throw new StudyEvidencePathError("Evidence bundle artifact index has an unsafe or duplicate path.");
    paths.add(entry.path);
    return entry.path;
  });
}

async function indexedEvidenceFiles(boundary: StudyBoundary, bundle: unknown): Promise<PlannerBenchmarkProvenance["evidenceFiles"]> {
  const paths = artifactPaths(bundle);
  const artifactIndex = (bundle as { artifactIndex: readonly Record<string, unknown>[] }).artifactIndex;
  return Promise.all(paths.map(async (path) => {
    const bytes = await regularStudyFile(boundary, path);
    const reference = artifactIndex.find((entry) => entry.path === path);
    if (!reference || reference.digest !== await sha256Bytes(bytes)) throw new StudyEvidenceDigestError(path);
    return { path, bytes };
  }));
}

async function rawRuns(boundary: StudyBoundary): Promise<readonly unknown[]> {
  const directory = join(boundary.rootPath, "raw-runs");
  try {
    const metadata = await lstat(directory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new StudyEvidencePathError("Raw-run directory must be a real directory.");
    const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
    return Promise.all(names.map(async (name) => {
      const value = JSON.parse(new TextDecoder().decode(await regularStudyFile(boundary, `raw-runs/${name}`)));
      if (!object(value)) throw new StudyEvidenceInputError("Raw-run record must be an object.");
      return value;
    }));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

function envelopeProvenance(value: unknown, trustRoot: unknown): PlannerBenchmarkProvenance | undefined {
  if (!object(value)) return undefined;
  const bundle = value.bundle;
  if (value.schemaVersion !== "boulder.planner-study-root.v1" || !object(value.protocol) || !object(value.manifest) || !object(bundle) || !object(value.report) || !Array.isArray(value.rawRuns) || !value.rawRuns.every(object) || !Array.isArray(value.evidenceFiles)) return undefined;
  const paths = new Set<string>();
  const evidenceFiles = value.evidenceFiles.map((entry) => {
    if (!object(entry) || !safeStudyRelativePath(entry.path) || typeof entry.bytes !== "string" || !/^[A-Za-z0-9_-]*$/.test(entry.bytes) || paths.has(entry.path)) return undefined;
    paths.add(entry.path);
    try {
      const encoded = entry.bytes.replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(`${encoded}${"=".repeat((4 - encoded.length % 4) % 4)}`);
      return { path: entry.path, bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
    } catch {
      return undefined;
    }
  });
  if (evidenceFiles.some((entry) => !entry)) return undefined;
  return { trustRoot, protocol: value.protocol, manifest: value.manifest, bundle, report: value.report, rawRuns: value.rawRuns, evidenceFiles: evidenceFiles as PlannerBenchmarkProvenance["evidenceFiles"] };
}

const notPerformedFixtureDigest = "sha256:4d110938e873454206c6e90f8c3379e66877c7f675ae78b558291b579ae81d61";

function notPerformedEnvelope(value: unknown): boolean {
  try {
    return sha256Digest(canonicalizePlanningValue(value)) === notPerformedFixtureDigest;
  } catch {
    return false;
  }
}

/** Loads local, operator-supplied evidence only; it never invokes a provider or executes a study run. */
export async function evaluatePlannerBenchmark(input: Readonly<{ trustRootPath: string; studyRootPath: string }>): Promise<PlannerBenchmarkCommandResult> {
  try {
    const requestedTrustRoot = resolve(input.trustRootPath);
    const requestedStudyRoot = resolve(input.studyRootPath);
    const [trustFile, requestedStudyRootStats] = await Promise.all([
      openedRegularFile(requestedTrustRoot, "--trust-root"),
      lstat(requestedStudyRoot)
    ]);
    if (requestedStudyRootStats.isSymbolicLink() || !(requestedStudyRootStats.isFile() || requestedStudyRootStats.isDirectory())) throw new StudyEvidencePathError("Study root must be a real file or directory.");
    const studyFile = requestedStudyRootStats.isFile() ? await openedRegularFile(requestedStudyRoot) : undefined;
    const studyRoot = studyFile?.realPath ?? await realpath(requestedStudyRoot);
    const rootMetadata = requestedStudyRootStats.isDirectory() ? await stat(studyRoot) : undefined;
    if (rootMetadata && (rootMetadata.dev !== requestedStudyRootStats.dev || rootMetadata.ino !== requestedStudyRootStats.ino)) {
      throw new StudyEvidencePathError("Study root changed while its boundary was being established.");
    }
    const boundary = rootMetadata ? { rootPath: studyRoot, dev: rootMetadata.dev, ino: rootMetadata.ino } : undefined;
    const location = boundary ? relative(boundary.rootPath, trustFile.realPath) : "";
    if (trustFile.realPath === studyRoot || (boundary && location !== ".." && !location.startsWith(`..${sep}`))) {
      return blocked([commandIssue("plan.benchmark.study_path_invalid", "--trust-root", "Trust root must be external to the study-root file or directory boundary.")]);
    }
    const trustRoot = JSON.parse(new TextDecoder().decode(trustFile.bytes));
    if (studyFile) {
      const envelope = JSON.parse(new TextDecoder().decode(studyFile.bytes));
      if (notPerformedEnvelope(envelope)) {
        const report = { ...buildPlannerBenchmarkReport({ trustRoot: {}, protocol: {}, manifest: {}, rawRuns: [], bundle: {}, report: {}, evidenceFiles: [] }), reasons: ["field_study_not_performed"] as const };
        return { schemaVersion: "boulder.planner-benchmark-command-result.v1", command: "plan benchmark", status: "blocked", report, issues: [] };
      }
      const provenance = envelopeProvenance(envelope, trustRoot);
      if (!provenance) throw new StudyEvidenceInputError("Invalid study-root envelope.");
      const issues = await validatePlannerBenchmarkProvenance(provenance);
      const generated = buildPlannerBenchmarkReport(provenance, issues);
      return { schemaVersion: "boulder.planner-benchmark-command-result.v1", command: "plan benchmark", status: generated.decision === "HOLD" ? "blocked" : "ready", report: generated, issues };
    }
    if (!boundary) throw new StudyEvidencePathError("Study directory boundary is unavailable.");
    const artifacts = await Promise.all(requiredFiles.map(async (name) => JSON.parse(new TextDecoder().decode(await regularStudyFile(boundary, name)))));
    const provenance: PlannerBenchmarkProvenance = { trustRoot, protocol: artifacts[0], manifest: artifacts[1], bundle: artifacts[2], report: artifacts[3], rawRuns: await rawRuns(boundary), evidenceFiles: await indexedEvidenceFiles(boundary, artifacts[2]) };
    const issues = await validatePlannerBenchmarkProvenance(provenance);
    const generated = buildPlannerBenchmarkReport(provenance, issues);
    return { schemaVersion: "boulder.planner-benchmark-command-result.v1", command: "plan benchmark", status: generated.decision === "HOLD" ? "blocked" : "ready", report: generated, issues };
  } catch (error) {
    if (error instanceof StudyEvidencePathError) return blocked([commandIssue("plan.benchmark.study_path_invalid", error.issuePath, error.message)]);
    if (error instanceof StudyEvidenceDigestError) return blocked([commandIssue("plan.benchmark.digest_mismatch", `artifactIndex.${error.artifactPath}`, error.message)]);
    if (error instanceof StudyEvidenceInputError || error instanceof SyntaxError || expectedFileSystemError(error)) return blocked([commandIssue("plan.benchmark.provenance_missing", "study-root", "Study root must be a readable study-root envelope or directory containing protocol.json, manifest.json, bundle.json, report.json, and raw-runs evidence.")]);
    throw error;
  }
}

export async function runPlannerBenchmarkCommand(args: readonly string[], options: Readonly<{ json: boolean }>): Promise<void> {
  const values = new Map<string, string>();
  let result: PlannerBenchmarkCommandResult | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option !== "--trust-root" && option !== "--study-root") {
      result = blocked([commandIssue("plan.benchmark.provenance_missing", option, `Unknown plan benchmark option: ${option}`)]);
      break;
    }
    if (values.has(option)) {
      result = blocked([commandIssue("plan.benchmark.provenance_missing", option, `${option} may be provided only once.`)]);
      break;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      const issues = [commandIssue("plan.benchmark.provenance_missing", option, `${option} requires a path.`)];
      result = blocked(issues);
      break;
    }
    values.set(option, value);
    index += 1;
  }
  if (!result) {
    const trustRootPath = values.get("--trust-root");
    const studyRootPath = values.get("--study-root");
    if (!trustRootPath || !studyRootPath) {
      const issues = [commandIssue("plan.benchmark.provenance_missing", "args", "--trust-root and --study-root are required.")];
      result = blocked(issues);
    } else result = await evaluatePlannerBenchmark({ trustRootPath, studyRootPath });
  }
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`Planner benchmark: ${result.report.decision} | scored=${result.report.metrics.scoredRunCount} eligible=${result.report.metrics.eligibleRunCount} failures=${result.report.metrics.executionFailureCount} caps=${result.report.metrics.criticalCapCount} | reasons=${result.report.reasons.join(",") || "none"}${result.issues.length > 0 ? ` | issues=${result.issues.map((entry) => entry.code).join(",")}` : ""}`);
  if (result.status === "blocked") process.exitCode = 1;
}
