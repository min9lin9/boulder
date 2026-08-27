import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { canonicalizeK0rJson, runBoundedK0rProcess, sha256CanonicalK0r } from "./k0r-canonical.js";
import { runK0rIndependentOracle } from "./k0r-independent-oracle.js";
import { verifyK0rPending } from "./k0r-issue-exit.js";

const repositoryRoot = resolve(import.meta.dir, "..");
export const isolatedRunReceiptPath = "evidence/k0r/isolated-run-receipt.json";
export const isolatedPriorSnapshotMode = 0o600;
const generatedEvidenceManifestPath = "evidence/k0r/evidence-manifest.json";
export const isolatedRunSchemaVersion = "boulder.k0r.isolated-run-receipt.v1";
export const isolatedRunCommandArgv = [
  "bun", "test/k0r-run-evidence.ts", "--write",
  "--pending-transition", "${QA_ROOT}/protected/k0r-transition.pending.json",
  "--private-candidate", "${QA_ROOT}/receipts/isolated-run.candidate.json",
  "--private-work-root", "${QA_ROOT}/work/isolated-run",
] as const;
export const isolatedRepositoryCheckArgv = [
  ["bun", "test/k0r-issue-exit.ts", "--verify-pending", "${QA_ROOT}/protected/k0r-transition.pending.json", "--private-root", "${QA_ROOT}"],
  ["bun", "test", "test/k0r-independent-oracle.test.ts"],
  ["bun", "test", "${NON_K0R_TEST_FILES}"],
  ["bunx", "--no-install", "tsc", "--noEmit"],
  ["bun", "pm", "pack", "--dry-run", "--ignore-scripts"],
] as const;
export const isolatedOracleArgv = ["bun", "test/k0r-run-evidence.ts", "--isolated-oracle"] as const;

export function resolveK0rRepositoryCheckExecution(index: number): { readonly location: "repository" | "boulder"; readonly readOnlyBoulder: boolean } {
  if (!Number.isInteger(index) || index < 0 || index >= isolatedRepositoryCheckArgv.length) throw new Error(`K0R repository check index is invalid: ${index}.`);
  return index === 0
    ? { location: "repository", readOnlyBoulder: true }
    : { location: "boulder", readOnlyBoulder: false };
}
const bwrapVersionArgv = ["bwrap", "--version"] as const;
const networkBreachProbeArgv = ["bun", "-e", "await fetch(\"http://198.51.100.1:9\", { signal: AbortSignal.timeout(1000) }); process.exit(0);"] as const;
const systemRuntimePaths = ["/usr", "/lib", "/lib64", "/etc"] as const;
const sandboxMandatoryArgs = ["--die-with-parent", "--new-session", "--unshare-net", "--clearenv"] as const;
const sandboxDestinations = {
  repository: "/workspace",
  typescript: "/k0r/typescript",
  home: "/k0r/home",
  cache: "/k0r/cache",
  tmp: "/tmp",
  registry: "/k0r/registry",
  credentials: "/k0r/credentials",
  boulder: "/k0r/boulder",
  runtimeExecutable: "/k0r/runtime/bun"
} as const;

export const isolatedSourceBundlePaths = [
  "test/k0r-run-evidence.ts",
  "test/k0r-baseline-generator.ts",
  "test/k0r-independent-oracle.ts",
  "test/k0r-canonical.ts",
  "test/k0r-issue-exit.ts",
  "test/k0r-reconcile-evidence.ts",
  "test/boulder-guide-contract.test.ts",
  "test/helpers/boulder-guide.ts",
  "fixtures/v2-kernel/valid-ed25519-authority-unsupported-effect.json",
  "fixtures/v2-kernel/invalid-authority-vectors.json",
  "fixtures/v2-kernel/valid-none-effect-execution.json"
] as const;
const packageInventoryPath = "fixtures/package-inventory/packaged-files.v0.json";
const docRegistryPath = "fixtures/docs/doc-registry.v0.json";
const packDryRunBaselinePath = "test/fixtures/baselines/readiness-v0/pack-dry-run.txt";
const packageInventoryContractTestPath = "test/package-inventory-contract.test.ts";
export const disposableGeneratedInventoryPaths = [packageInventoryPath, docRegistryPath, packDryRunBaselinePath, packageInventoryContractTestPath, generatedEvidenceManifestPath] as const;
const disposableInventoryDerivationAlgorithm = "k0r.disposable-inventories";
const disposableInventoryDerivationVersion = "v2";
const safeEnvironmentNames = ["BOULDER_ROOT", "BUN_INSTALL_CACHE_DIR", "GIT_AUTHOR_DATE", "GIT_AUTHOR_EMAIL", "GIT_AUTHOR_NAME", "GIT_COMMITTER_DATE", "GIT_COMMITTER_EMAIL", "GIT_COMMITTER_NAME", "HOME", "LANG", "NPM_CONFIG_CACHE", "NPM_CONFIG_REGISTRY", "NPM_CONFIG_USERCONFIG", "PATH", "TMPDIR", "XDG_CACHE_HOME"] as const;
const sha256Pattern = /^sha256:[0-9a-f]{64}$/;
export const isolatedReleaseTag = "v0.1.17";
const releaseManifestPath = "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json";
const runRootPlaceholder = "${K0R_TEMP_ROOT}";
const historicalTagBundleFileName = `release-${isolatedReleaseTag}.bundle`;
const deterministicGitEnvironment = {
  GIT_AUTHOR_NAME: "Boulder K0R",
  GIT_AUTHOR_EMAIL: "boulder-k0r@example.invalid",
  GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "Boulder K0R",
  GIT_COMMITTER_EMAIL: "boulder-k0r@example.invalid",
  GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z"
} as const;
const canonicalPendingEvidenceManifest = `${JSON.stringify({
  schemaVersion: "boulder.k0r.evidence-manifest.v2",
  status: "not_run",
  disposition: "disposable_isolated_capture_placeholder"
}, null, 2)}\n`;
export const historicalTagBundleArgv = [
  ["git", "rev-parse", "--verify", `refs/tags/${isolatedReleaseTag}^{}`],
  ["git", "bundle", "create", `${runRootPlaceholder}/tmp/${historicalTagBundleFileName}`, `refs/tags/${isolatedReleaseTag}`],
  ["git", "bundle", "list-heads", `${runRootPlaceholder}/tmp/${historicalTagBundleFileName}`]
] as const;
const isolatedPackDryRunArgv = ["bun", "pm", "pack", "--dry-run", "--ignore-scripts"] as const;
const headSourceArchiveFileName = "head-source.tar";
export const isolatedGitSetupArgv = [
  ["git", "init", "--quiet"],
  ["git", "add", "--all"],
  ["git", "commit", "--quiet", "--message", "K0R isolated clean source"],
  ["git", "rev-parse", "HEAD"],
  ["git", "rev-parse", "HEAD^{tree}"],
  ["git", "fetch", "--no-tags", `/tmp/${historicalTagBundleFileName}`, `refs/tags/${isolatedReleaseTag}:refs/tags/${isolatedReleaseTag}`],
  ["git", "rev-parse", "HEAD"],
  ["git", "rev-parse", "--verify", `refs/tags/${isolatedReleaseTag}^{}`]
] as const;

type RecordValue = Record<string, unknown>;
type InventoryEntry = { readonly path: string; readonly kind: "directory" | "file"; readonly sha256: string };
type CommandResult = { readonly argv: readonly string[]; readonly cwd: "."; readonly envNames: readonly string[]; readonly exitCode: number; readonly stdoutSha256: string; readonly stderrSha256: string };
type CleanTempInventory = {
  readonly tracked: readonly string[];
  readonly untracked: readonly string[];
  readonly gitMetadata: {
    readonly packageVersion: string;
    readonly tag: typeof isolatedReleaseTag;
    readonly commit: string;
    readonly tree: string;
    readonly tagCommit: string;
    readonly historicalTagBundle: {
      readonly path: string;
      readonly sha256: string;
      readonly sourceTagCommit: string;
      readonly removed: true;
      readonly commands: readonly CommandResult[];
    };
    readonly commands: readonly CommandResult[];
  };
};

export type K0rRunEvidenceCommand =
  | { readonly mode: "isolated-oracle" }
  | { readonly mode: "write"; readonly pendingTransition: string; readonly privateCandidate: string; readonly privateWorkRoot: string };

export function parseK0rRunEvidenceArgv(argv: readonly string[]): K0rRunEvidenceCommand {
  if (argv.length === 1 && argv[0] === "--isolated-oracle") return { mode: "isolated-oracle" };
  if (
    argv.length === 7
    && argv[0] === "--write"
    && argv[1] === "--pending-transition"
    && argv[3] === "--private-candidate"
    && argv[5] === "--private-work-root"
  ) {
    const value = (index: number): string => {
      const candidate = argv[index];
      if (candidate === undefined || candidate === "" || candidate.startsWith("--")) throw new Error("Task 8 runner option value is invalid.");
      return candidate;
    };
    return { mode: "write", pendingTransition: value(2), privateCandidate: value(4), privateWorkRoot: value(6) };
  }
  throw new Error("Expected exact Task 8 --write arguments or --isolated-oracle.");
}

async function resolveNonK0rTestArgv(root: string): Promise<string[]> {
  const files = (await readdir(join(root, "test")))
    .filter((name) => name.endsWith(".test.ts") && !name.startsWith("k0r-"))
    .sort()
    .map((name) => `test/${name}`);
  if (files.length === 0) throw new Error("Non-K0R test set is empty.");
  return ["bun", "test", ...files];
}

export async function resolveK0rRepositoryCheckArgv(root: string, pendingTransition = "${QA_ROOT}/protected/k0r-transition.pending.json", privateRoot = "${QA_ROOT}"): Promise<readonly (readonly string[])[]> {
  return [
    ["bun", "test/k0r-issue-exit.ts", "--verify-pending", pendingTransition, "--private-root", privateRoot],
    ["bun", "test", "test/k0r-independent-oracle.test.ts"],
    await resolveNonK0rTestArgv(root),
    ["bunx", "--no-install", "tsc", "--noEmit"],
    ["bun", "pm", "pack", "--dry-run", "--ignore-scripts"],
  ];
}

type SourceDerivation = {
  readonly base: { readonly archiveSha256: string; readonly commit: string; readonly tree: string };
  readonly overlay: {
    readonly allowedPaths: readonly string[];
    readonly files: readonly { readonly path: string; readonly baseSha256: string | null; readonly overlaySha256: string }[];
    readonly merkleSha256: string;
    readonly generatedInventories: {
      readonly algorithm: typeof disposableInventoryDerivationAlgorithm;
      readonly version: typeof disposableInventoryDerivationVersion;
      readonly pack: { readonly argv: readonly string[]; readonly outputSha256: string; readonly pathsSha256: string };
      readonly entries: readonly { readonly path: typeof disposableGeneratedInventoryPaths[number]; readonly sourceSha256: string; readonly resultSha256: string; readonly excludedPaths: readonly string[]; readonly transformation: string }[];
    };
  };
};
type SourceBundle = { readonly derivation: SourceDerivation; readonly files: readonly { readonly path: string; readonly sha256: string }[]; readonly merkleSha256: string };
type DependencyPolicy = {
  readonly bunLockPath: "bun.lock";
  readonly typescriptExecutable: "tsc";
  readonly typescriptPackageName: "typescript";
  readonly typescriptPackageVersionRange: "^6.0.3";
  readonly typescriptPackageJsonPath: "package.json";
  readonly typescriptArtifactPath: "lib/tsc.js";
  readonly readOnlyDestinations: readonly string[];
};
type IsolationPolicy = { readonly argvAllowlist: readonly (readonly string[])[]; readonly hostHomeProbePath: string; readonly runtimeExecutableDestination: string; readonly dependencies: DependencyPolicy; readonly allowedOverlayPaths: readonly string[]; readonly sourceDerivationDirtyExclusions: readonly string[] };
type DependencyBinding = {
  readonly bunLock: { readonly path: "bun.lock"; readonly sha256: string };
  readonly typescript: {
    readonly executable: "tsc";
    readonly packageName: "typescript";
    readonly packageJsonPath: "package.json";
    readonly packageJsonSha256: string;
    readonly version: string;
    readonly artifactPath: "lib/tsc.js";
    readonly artifactSha256: string;
    readonly treeSha256: string;
  };
  readonly readOnlyDestinations: readonly string[];
};
type ResolvedDependencyBinding = { readonly binding: DependencyBinding; readonly typescriptPackageRoot: string };
type RuntimeBinding = { readonly source: string; readonly destination: string };
type DedicatedRoots = { readonly home: string; readonly cache: string; readonly tmp: string; readonly registry: string; readonly credentials: string; readonly boulder: string };
type HistoricalTagBundle = {
  readonly path: string;
  readonly sha256: string;
  readonly sourceTagCommit: string;
  readonly commands: readonly CommandResult[];
};
export type K0rIsolationBoundaryPhase = "fixture-root-ready" | "access-complete";
export type K0rIsolationBoundaryAccess = {
  readonly phase: "access-complete";
  readonly resources: readonly { readonly id: "evidenceRoot" | "tempRoot" | "sourceBundlePath" | "candidatePath"; readonly path: string; readonly device: number; readonly inode: number }[];
};
type K0rIsolationBoundaryEvent = { readonly phase: "fixture-root-ready"; readonly fixtureRoot: string; readonly temporaryRoot: string } | K0rIsolationBoundaryAccess;
const isolationBoundaryHandlers = new Map<string, (event: K0rIsolationBoundaryEvent) => Promise<void>>();
const isolationBoundaryEvents = new Map<string, K0rIsolationBoundaryEvent>();

export function registerK0rIsolationBoundaryHandler(runId: string, handler: (event: K0rIsolationBoundaryEvent) => Promise<void>): () => void {
  if (runId === "" || isolationBoundaryHandlers.has(runId)) throw new Error(`K0R isolation boundary handler is already registered: ${runId}.`);
  isolationBoundaryHandlers.set(runId, handler);
  return () => {
    isolationBoundaryHandlers.delete(runId);
    isolationBoundaryEvents.delete(`${runId}\0fixture-root-ready`);
    isolationBoundaryEvents.delete(`${runId}\0access-complete`);
  };
}

export async function onIsolationBoundary(runId: string, phase: K0rIsolationBoundaryPhase): Promise<void> {
  const event = isolationBoundaryEvents.get(`${runId}\0${phase}`);
  if (event === undefined || event.phase !== phase) throw new Error(`K0R isolation boundary event is unavailable or out of order: ${runId}:${phase}.`);
  const handler = isolationBoundaryHandlers.get(runId);
  if (handler !== undefined) await handler(event);
}

export type K0rIsolatedRunReceipt = {
  readonly schemaVersion: typeof isolatedRunSchemaVersion;
  readonly status: "not_run" | "pass_pending_exact_byte_review" | "fail";
  readonly networkSurface: "none";
  readonly run: null | {
    readonly sourceBundle: SourceBundle;
    readonly dependencyBinding: DependencyBinding;
    readonly staticBoundary: { readonly networkImports: readonly string[]; readonly productV2Imports: readonly string[] };
    readonly runtime: { readonly bunVersion: string; readonly gitVersion: string; readonly bwrapVersion: string; readonly bun: CommandResult; readonly git: CommandResult };
    readonly isolation: {
      readonly safeEnvNames: readonly string[];
      readonly rootOwnership: { readonly rootOwnedByRun: true; readonly dedicatedRootsOwnedByRun: true; readonly credentialsRootEmpty: true; readonly hostRootsUsed: false };
      readonly sandbox: {
        readonly runtime: "bwrap";
        readonly mandatoryArgs: readonly string[];
        readonly readOnlySystemRuntimePaths: readonly string[];
        readonly repositoryDestination: string;
        readonly writableDedicatedRootDestinations: readonly string[];
        readonly runtimeExecutableDestination: string;
        readonly enforcement: { readonly networkNamespaceDenied: true; readonly hostHomePathDenied: true; readonly probes: readonly CommandResult[] };
      };
      readonly cleanTempInventory: CleanTempInventory;
      readonly preInventory: readonly InventoryEntry[];
      readonly postInventory: readonly InventoryEntry[];
      readonly cleanup: { readonly attempted: true; readonly succeeded: boolean; readonly inventoriesEqual: true; readonly rootAgentsRechecked: true };
    };
    readonly oracle: CommandResult & { readonly reportSha256: string; readonly reportStatus: "pass" | "fail" };
    readonly commands: readonly CommandResult[];
  };
};

export const notRunK0rIsolatedRunReceipt: K0rIsolatedRunReceipt = {
  schemaVersion: isolatedRunSchemaVersion,
  status: "not_run",
  networkSurface: "none",
  run: null
};

export async function runK0rIsolatedEvidence(options: { readonly root?: string; readonly outputPath?: string; readonly runId?: string; readonly pendingTransition?: string; readonly privateCandidate?: string; readonly privateWorkRoot?: string } = {}): Promise<K0rIsolatedRunReceipt> {
  const root = await realpath(resolve(options.root ?? repositoryRoot));
  let privateQaRoot: string | undefined;
  if (options.pendingTransition !== undefined || options.privateCandidate !== undefined || options.privateWorkRoot !== undefined) {
    if (options.pendingTransition === undefined || options.privateCandidate === undefined || options.privateWorkRoot === undefined) throw new Error("Task 8 private paths must be supplied together.");
    const qaRoot = await canonicalPrivateQaRoot(options.pendingTransition);
    privateQaRoot = qaRoot;
    await recoverIsolatedPublication(root, qaRoot, options.pendingTransition);
    if (
      resolve(options.pendingTransition) !== join(qaRoot, "protected/k0r-transition.pending.json")
      || resolve(options.privateCandidate) !== join(qaRoot, "receipts/isolated-run.candidate.json")
      || resolve(options.privateWorkRoot) !== join(qaRoot, "work/isolated-run")
    ) throw new Error("Task 8 private paths are not canonical.");
    await verifiedContainedDirectory(qaRoot, dirname(options.pendingTransition));
    await verifiedContainedDirectory(qaRoot, dirname(options.privateCandidate));
    await verifiedContainedDirectory(qaRoot, dirname(options.privateWorkRoot));
    const pendingBytes = await readImmutablePrivateFile(options.pendingTransition, 0o400);
    const pending = recordValue(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(pendingBytes)), "pending transition");
    if (pending["schemaVersion"] !== "boulder.k0r.protected-transition.pending.v1" || pending["status"] !== "pending_exit") throw new Error("Task 8 pending transition identity is invalid.");
    await verifyK0rPending(options.pendingTransition, qaRoot);
    if (sha256Bytes(await readImmutablePrivateFile(options.pendingTransition, 0o400)) !== sha256Bytes(pendingBytes)) throw new Error("Task 8 pending transition changed during verification.");
  }
  const runId = options.runId ?? randomUUID();
  const temporaryRoot = options.privateWorkRoot === undefined
    ? await mkdtemp(join(tmpdir(), "boulder-k0r-isolated-"))
    : resolve(options.privateWorkRoot);
  if (options.privateWorkRoot !== undefined) {
    await mkdir(temporaryRoot, { recursive: false });
    const workState = await lstat(temporaryRoot);
    if (!workState.isDirectory() || workState.isSymbolicLink() || (workState.mode & 0o777) !== 0o700) throw new Error("Private isolated work root is not mode 0700.");
  }
  const roots = {
    home: join(temporaryRoot, "home"),
    cache: join(temporaryRoot, "cache"),
    tmp: join(temporaryRoot, "tmp"),
    registry: join(temporaryRoot, "registry"),
    credentials: join(temporaryRoot, "credentials-empty"),
    boulder: join(temporaryRoot, "boulder")
  };
  let cleanupSucceeded = false;
  try {
    await Promise.all(Object.values(roots).map((path) => mkdir(path, { recursive: true })));
    const descriptor = Object.freeze({
      fixtureRoot: root,
      temporaryRoot,
      evidenceRoot: join(root, "evidence/k0r"),
      tempRoot: temporaryRoot,
      sourceBundlePath: join(root, "test/k0r-run-evidence.ts"),
      candidatePath: options.privateCandidate ?? options.outputPath ?? isolatedRunReceiptPath
    });
    isolationBoundaryEvents.set(`${runId}\0fixture-root-ready`, { phase: "fixture-root-ready", fixtureRoot: descriptor.fixtureRoot, temporaryRoot: descriptor.temporaryRoot });
    await onIsolationBoundary(runId, "fixture-root-ready");
    const contestedPaths = { ...descriptor, candidatePath: options.privateCandidate === undefined ? resolve(root, descriptor.candidatePath) : resolve(descriptor.candidatePath) };
    if (options.privateCandidate === undefined && contestedPaths.candidatePath !== join(root, isolatedRunReceiptPath)) throw new Error("Isolated-run receipt output path is fixed.");
    if (options.privateCandidate !== undefined && await pathExists(contestedPaths.candidatePath)) throw new Error("Private isolated candidate already exists.");
    if (options.privateCandidate === undefined) {
      const resources = await Promise.all((["evidenceRoot", "tempRoot", "sourceBundlePath", "candidatePath"] as const).map(async (id) => {
        const path = await realpath(contestedPaths[id]);
        const state = await lstat(path);
        return { id, path, device: state.dev, inode: state.ino };
      }));
      isolationBoundaryEvents.set(`${runId}\0access-complete`, { phase: "access-complete", resources });
      await onIsolationBoundary(runId, "access-complete");
    }
    const outputPath = contestedPaths.candidatePath;
    const environment = isolatedEnvironment(roots);
    const hostEnvironment = hostIsolatedEnvironment(roots);
    const policy = bindK0rRunRoot(await readK0rIsolationPolicy(root), temporaryRoot, privateQaRoot);
    const dependencies = await bindK0rDependencies(root, policy.dependencies);
    const bwrapVersionResult = await runHostCommand(bwrapVersionArgv, root, hostEnvironment, policy);
    if (bwrapVersionResult.exitCode !== 0 || bwrapVersionResult.stdout.trim() === "") throw new Error("bwrap is unavailable or unusable for K0R isolation.");
    const sourceBundle = await copyAndVerifySourceBundle(root, roots, hostEnvironment, environment, policy, dependencies);
    const staticBoundary = await staticBoundaryCheck(roots.boulder);
    const historicalTagBundle = await createHistoricalTagBundle(root, join(roots.tmp, historicalTagBundleFileName), hostEnvironment, policy);
    const cleanTempInventory = await cleanTempTrackedInventory(root, roots, environment, policy, dependencies, historicalTagBundle);
    const preInventory = await inventory(temporaryRoot);
    const [bunResult, gitResult] = await Promise.all([
      runCommand(["bun", "--version"], "boulder", root, roots, environment, policy, dependencies, true),
      runCommand(["git", "--version"], "boulder", root, roots, environment, policy, dependencies, true)
    ]);
    const bun = observedCommand(bunResult);
    const git = observedCommand(gitResult);
    const networkBreachProbe = await runCommand(networkBreachProbeArgv, "boulder", root, roots, environment, policy, dependencies, true);
    const hostHomeBreachProbe = await runCommand(["/usr/bin/test", "-e", policy.hostHomeProbePath], "boulder", root, roots, environment, policy, dependencies, true);
    if (networkBreachProbe.exitCode === 0 || hostHomeBreachProbe.exitCode === 0) throw new Error("bwrap isolation enforcement probe unexpectedly succeeded.");
    const oracleResult = await runCommand(isolatedOracleArgv, "boulder", root, roots, environment, policy, dependencies, true);
    const oracleReport = parseOracleReport(oracleResult.stdout);
    const commands: CommandResult[] = [];
    const qaRoot = options.pendingTransition === undefined ? "${QA_ROOT}" : resolve(dirname(options.pendingTransition), "..");
    const repositoryChecks = await resolveK0rRepositoryCheckArgv(root, options.pendingTransition, qaRoot);
    for (const [index, argv] of repositoryChecks.entries()) {
      const execution = resolveK0rRepositoryCheckExecution(index);
      commands.push(observedCommand(await runCommand(argv, execution.location, root, roots, environment, policy, dependencies, execution.readOnlyBoulder)));
    }
    for (const path of [roots.home, roots.cache, roots.tmp, roots.registry, roots.credentials]) {
      await rm(path, { recursive: true, force: true });
      await mkdir(path, { recursive: true });
    }
    const postInventory = await inventory(temporaryRoot);
    if (!inventoryEqual(preInventory, postInventory)) throw new Error("Isolated source and dedicated-root inventory changed after cleanup.");
    const rootOwnership = await verifyOwnership(temporaryRoot, roots);
    const status = bun.exitCode === 0 && git.exitCode === 0 && oracleResult.exitCode === 0 && oracleReport.status === "pass" && cleanTempInventory.gitMetadata.historicalTagBundle.commands.every((result) => result.exitCode === 0) && cleanTempInventory.gitMetadata.commands.every((result) => result.exitCode === 0) && commands.every((result) => result.exitCode === 0) ? "pass_pending_exact_byte_review" : "fail";
    await rm(temporaryRoot, { recursive: true, force: true });
    cleanupSucceeded = true;
    const receipt: K0rIsolatedRunReceipt = {
      schemaVersion: isolatedRunSchemaVersion,
      status,
      networkSurface: "none",
      run: {
        sourceBundle,
        dependencyBinding: dependencies.binding,
        staticBoundary,
        runtime: { bunVersion: bunResult.stdout.trim(), gitVersion: gitResult.stdout.trim(), bwrapVersion: bwrapVersionResult.stdout.trim(), bun, git },
        isolation: {
          safeEnvNames: safeEnvironmentNames,
          rootOwnership,
          sandbox: {
            runtime: "bwrap",
            mandatoryArgs: sandboxMandatoryArgs,
            readOnlySystemRuntimePaths: systemRuntimePaths,
            repositoryDestination: sandboxDestinations.repository,
            writableDedicatedRootDestinations: [sandboxDestinations.home, sandboxDestinations.cache, sandboxDestinations.tmp, sandboxDestinations.registry, sandboxDestinations.credentials, sandboxDestinations.boulder],
            runtimeExecutableDestination: sandboxDestinations.runtimeExecutable,
            enforcement: { networkNamespaceDenied: true, hostHomePathDenied: true, probes: [observedCommand(networkBreachProbe), observedCommand(hostHomeBreachProbe)] }
          },
          cleanTempInventory,
          preInventory,
          postInventory,
          cleanup: { attempted: true, succeeded: cleanupSucceeded, inventoriesEqual: true, rootAgentsRechecked: true }
        },
        oracle: { ...observedCommand(oracleResult), reportSha256: sha256Text(oracleResult.stdout), reportStatus: oracleReport.status },
        commands
      }
    };
    const receiptText = `${JSON.stringify(receipt, null, 2)}\n`;
    if (options.privateCandidate === undefined) {
      await writeK0rIsolatedRunReceipt(root, outputPath, receiptText);
      await validateK0rIsolatedRunReceipt(new TextEncoder().encode(receiptText), root);
    } else if (receipt.status === "pass_pending_exact_byte_review") {
      await writePrivateCandidate(options.pendingTransition!, options.privateCandidate, receiptText);
      const candidateBytes = await readImmutablePrivateFile(options.privateCandidate, 0o600);
      const candidate = await validateK0rIsolatedRunReceipt(candidateBytes, root);
      if (candidate.status !== "pass_pending_exact_byte_review") throw new Error("Private isolated candidate is not passing pending review.");
      await installPublicCandidateBytes(root, options.pendingTransition!, options.privateCandidate, candidateBytes);
    }
    return receipt;
  } finally {
    if (!cleanupSucceeded) await rm(temporaryRoot, { recursive: true, force: true });
  }
}
export async function verifyK0rSandboxEnforcement(options: { readonly root?: string } = {}): Promise<{ readonly bwrapVersion: string; readonly networkProbe: CommandResult; readonly hostHomeProbe: CommandResult }> {
  const root = resolve(options.root ?? repositoryRoot);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "boulder-k0r-sandbox-probe-"));
  const roots: DedicatedRoots = {
    home: join(temporaryRoot, "home"),
    cache: join(temporaryRoot, "cache"),
    tmp: join(temporaryRoot, "tmp"),
    registry: join(temporaryRoot, "registry"),
    credentials: join(temporaryRoot, "credentials-empty"),
    boulder: join(temporaryRoot, "boulder")
  };
  try {
    await Promise.all(Object.values(roots).map((path) => mkdir(path, { recursive: true })));
    const environment = isolatedEnvironment(roots);
    const policy = await readK0rIsolationPolicy(root);
    const dependencies = await bindK0rDependencies(root, policy.dependencies);
    const bwrapVersion = await runHostCommand(bwrapVersionArgv, root, environment, policy);
    if (bwrapVersion.exitCode !== 0 || bwrapVersion.stdout.trim() === "") throw new Error("bwrap is unavailable or unusable for K0R isolation.");
    const networkProbe = await runCommand(networkBreachProbeArgv, "boulder", root, roots, environment, policy, dependencies, true);
    const hostHomeProbe = await runCommand(["/usr/bin/test", "-e", policy.hostHomeProbePath], "boulder", root, roots, environment, policy, dependencies, true);
    if (networkProbe.exitCode === 0 || hostHomeProbe.exitCode === 0) throw new Error("bwrap isolation enforcement probe unexpectedly succeeded.");
    return { bwrapVersion: bwrapVersion.stdout.trim(), networkProbe: observedCommand(networkProbe), hostHomeProbe: observedCommand(hostHomeProbe) };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function validateK0rIsolatedRunReceipt(bytes: Uint8Array, sourceRoot?: string): Promise<K0rIsolatedRunReceipt> {
  const receipt = recordValue(JSON.parse(new TextDecoder().decode(bytes)), "isolated-run receipt");
  exactKeys(receipt, ["networkSurface", "run", "schemaVersion", "status"], "isolated-run receipt");
  if (receipt["schemaVersion"] !== isolatedRunSchemaVersion || receipt["networkSurface"] !== "none") throw new Error("Isolated-run receipt identity is invalid.");
  const status = receipt["status"];
  if (status === "not_run") {
    if (receipt["run"] !== null) throw new Error("A not_run isolated receipt must not contain measured output.");
    return receipt as K0rIsolatedRunReceipt;
  }
  if (status !== "pass_pending_exact_byte_review" && status !== "fail") throw new Error("Isolated-run receipt status is invalid.");
  const run = recordValue(receipt["run"], "isolated-run receipt run");
  exactKeys(run, ["commands", "dependencyBinding", "isolation", "oracle", "runtime", "sourceBundle", "staticBoundary"], "isolated-run receipt run");
  const sourceBundle = validateSourceBundle(recordValue(run["sourceBundle"], "isolated source bundle"));
  if (sourceRoot === undefined) throw new Error("A measured isolated receipt requires a source root for hash binding.");
  const policy = await readK0rIsolationPolicy(sourceRoot);
  await validateSourceDerivation(recordValue(recordValue(run["sourceBundle"], "isolated source bundle")["derivation"], "isolated source derivation"), sourceRoot, policy);
  const dependencyBinding = validateDependencyBinding(recordValue(run["dependencyBinding"], "isolated dependency binding"));
  const currentDependencyBinding = (await bindK0rDependencies(sourceRoot, policy.dependencies)).binding;
  if (JSON.stringify(dependencyBinding) !== JSON.stringify(currentDependencyBinding)) throw new Error("Isolated dependency binding is stale.");
  for (const file of sourceBundle) {
    if (sha256Bytes(await readRegularFile(sourceRoot, file.path, "isolated source bundle")) !== file.sha256) throw new Error(`Isolated source bundle hash is stale: ${file.path}.`);
  }
  const boundary = recordValue(run["staticBoundary"], "isolated static boundary");
  exactKeys(boundary, ["networkImports", "productV2Imports"], "isolated static boundary");
  if (stringArray(boundary["networkImports"], "network imports").length !== 0 || stringArray(boundary["productV2Imports"], "product v2 imports").length !== 0) throw new Error("Isolated source bundle imports a forbidden surface.");
  const runtime = recordValue(run["runtime"], "isolated runtime");
  exactKeys(runtime, ["bwrapVersion", "bun", "bunVersion", "git", "gitVersion"], "isolated runtime");
  if (stringValue(runtime["bunVersion"], "Bun version") === "" || stringValue(runtime["gitVersion"], "Git version") === "" || stringValue(runtime["bwrapVersion"], "bwrap version") === "") throw new Error("Isolated runtime versions are invalid.");
  validateCommandResult(recordValue(runtime["bun"], "Bun runtime result"), ["bun", "--version"]);
  validateCommandResult(recordValue(runtime["git"], "Git runtime result"), ["git", "--version"]);
  const isolation = recordValue(run["isolation"], "isolated environment");
  exactKeys(isolation, ["cleanTempInventory", "cleanup", "postInventory", "preInventory", "rootOwnership", "safeEnvNames", "sandbox"], "isolated environment");
  if (JSON.stringify(stringArray(isolation["safeEnvNames"], "safe environment names")) !== JSON.stringify(safeEnvironmentNames)) throw new Error("Isolated receipt environment names are invalid.");
  const ownership = recordValue(isolation["rootOwnership"], "isolated root ownership");
  exactKeys(ownership, ["credentialsRootEmpty", "dedicatedRootsOwnedByRun", "hostRootsUsed", "rootOwnedByRun"], "isolated root ownership");
  if (ownership["rootOwnedByRun"] !== true || ownership["dedicatedRootsOwnedByRun"] !== true || ownership["credentialsRootEmpty"] !== true || ownership["hostRootsUsed"] !== false) throw new Error("Isolated root ownership checks failed.");
  const sandbox = recordValue(isolation["sandbox"], "bwrap sandbox");
  exactKeys(sandbox, ["enforcement", "mandatoryArgs", "readOnlySystemRuntimePaths", "repositoryDestination", "runtime", "runtimeExecutableDestination", "writableDedicatedRootDestinations"], "bwrap sandbox");
  if (sandbox["runtime"] !== "bwrap" || JSON.stringify(stringArray(sandbox["mandatoryArgs"], "bwrap mandatory arguments")) !== JSON.stringify(sandboxMandatoryArgs) || JSON.stringify(stringArray(sandbox["readOnlySystemRuntimePaths"], "bwrap read-only system paths")) !== JSON.stringify(systemRuntimePaths) || sandbox["repositoryDestination"] !== sandboxDestinations.repository || JSON.stringify(stringArray(sandbox["writableDedicatedRootDestinations"], "bwrap writable roots")) !== JSON.stringify([sandboxDestinations.home, sandboxDestinations.cache, sandboxDestinations.tmp, sandboxDestinations.registry, sandboxDestinations.credentials, sandboxDestinations.boulder]) || sandbox["runtimeExecutableDestination"] !== sandboxDestinations.runtimeExecutable) throw new Error("bwrap sandbox policy is invalid.");
  const enforcement = recordValue(sandbox["enforcement"], "bwrap sandbox enforcement");
  exactKeys(enforcement, ["hostHomePathDenied", "networkNamespaceDenied", "probes"], "bwrap sandbox enforcement");
  const probes = recordArray(enforcement["probes"], "bwrap enforcement probes");
  if (enforcement["networkNamespaceDenied"] !== true || enforcement["hostHomePathDenied"] !== true || probes.length !== 2) throw new Error("bwrap sandbox enforcement probes are invalid.");
  validateCommandResult(probes[0] ?? {}, networkBreachProbeArgv);
  validateCommandResult(probes[1] ?? {}, ["/usr/bin/test", "-e", policy.hostHomeProbePath]);
  if (probes.some((probe) => probe["exitCode"] === 0)) throw new Error("bwrap sandbox enforcement probe unexpectedly succeeded.");
  validateInventory(isolation["preInventory"], "pre isolated inventory");
  validateInventory(isolation["postInventory"], "post isolated inventory");
  if (JSON.stringify(isolation["preInventory"]) !== JSON.stringify(isolation["postInventory"])) throw new Error("Isolated source and dedicated-root inventory delta is invalid.");
  const cleanInventory = recordValue(isolation["cleanTempInventory"], "clean temporary inventory");
  exactKeys(cleanInventory, ["gitMetadata", "tracked", "untracked"], "clean temporary inventory");
  const tracked = stringArray(cleanInventory["tracked"], "clean temporary tracked paths");
  const untracked = stringArray(cleanInventory["untracked"], "clean temporary untracked paths");
  if (tracked.length === 0 || JSON.stringify(tracked) !== JSON.stringify([...tracked].sort()) || tracked.some((path) => path === ".git" || path.startsWith(".git/")) || isolatedSourceBundlePaths.some((path) => !tracked.includes(path)) || !tracked.includes("package.json") || untracked.length !== 0) throw new Error("Clean temporary tracked/untracked inventory is invalid.");
  const gitMetadata = recordValue(cleanInventory["gitMetadata"], "clean temporary Git metadata");
  exactKeys(gitMetadata, ["commands", "commit", "historicalTagBundle", "packageVersion", "tag", "tagCommit", "tree"], "clean temporary Git metadata");
  const packageVersion = stringValue(gitMetadata["packageVersion"], "clean temporary package version");
  const releaseTag = await readReleaseTagBinding(sourceRoot, packageVersion);
  if (packageVersion !== stringValue(recordValue(JSON.parse(await readFile(join(sourceRoot, "package.json"), "utf8")), "source package manifest")["version"], "source package version") || gitMetadata["tag"] !== releaseTag.tag || !gitObjectId(gitMetadata["commit"]) || !gitObjectId(gitMetadata["tree"]) || gitMetadata["tagCommit"] !== releaseTag.tagCommit) throw new Error("Clean temporary Git metadata is invalid.");
  const historicalTagBundle = recordValue(gitMetadata["historicalTagBundle"], "historical tag bundle");
  exactKeys(historicalTagBundle, ["commands", "path", "removed", "sha256", "sourceTagCommit"], "historical tag bundle");
  const bundlePath = stringValue(historicalTagBundle["path"], "historical tag bundle path");
  const privateBundleSuffix = `/work/isolated-run/tmp/${historicalTagBundleFileName}`;
  const defaultBundlePath = bundlePath.startsWith(`${tmpdir()}/boulder-k0r-isolated-`) && bundlePath.endsWith(`/${historicalTagBundleFileName}`);
  const privateBundlePath = bundlePath.startsWith("/") && bundlePath.length > privateBundleSuffix.length && bundlePath.endsWith(privateBundleSuffix) && resolve(bundlePath) === bundlePath;
  if ((!defaultBundlePath && !privateBundlePath) || historicalTagBundle["removed"] !== true || !digestValue(historicalTagBundle["sha256"], "historical tag bundle digest") || historicalTagBundle["sourceTagCommit"] !== releaseTag.tagCommit) throw new Error("Historical tag bundle binding is invalid.");
  const bundleCommands = recordArray(historicalTagBundle["commands"], "historical tag bundle commands");
  if (bundleCommands.length !== historicalTagBundleArgv.length) throw new Error("Historical tag bundle command count is invalid.");
  validateCommandResult(bundleCommands[0] ?? {}, historicalTagBundleArgv[0] ?? []);
  validateCommandResult(bundleCommands[1] ?? {}, ["git", "bundle", "create", bundlePath, `refs/tags/${releaseTag.tag}`]);
  validateCommandResult(bundleCommands[2] ?? {}, ["git", "bundle", "list-heads", bundlePath]);
  const gitCommands = recordArray(gitMetadata["commands"], "clean temporary Git commands");
  if (gitCommands.length !== isolatedGitSetupArgv.length) throw new Error("Clean temporary Git command count is invalid.");
  gitCommands.forEach((command, index) => validateCommandResult(command, (isolatedGitSetupArgv[index] ?? []).map((part) => part.replaceAll(runRootPlaceholder, dirname(bundlePath)))));
  const cleanup = recordValue(isolation["cleanup"], "isolated cleanup");
  exactKeys(cleanup, ["attempted", "inventoriesEqual", "rootAgentsRechecked", "succeeded"], "isolated cleanup");
  if (cleanup["attempted"] !== true || cleanup["inventoriesEqual"] !== true || cleanup["rootAgentsRechecked"] !== true || typeof cleanup["succeeded"] !== "boolean" || (status === "pass_pending_exact_byte_review" && cleanup["succeeded"] !== true)) throw new Error("Isolated cleanup result is invalid.");
  const oracle = recordValue(run["oracle"], "isolated oracle");
  exactKeys(oracle, ["argv", "cwd", "envNames", "exitCode", "reportSha256", "reportStatus", "stderrSha256", "stdoutSha256"], "isolated oracle");
  validateCommandResult(oracle, isolatedOracleArgv, true);
  if (!digestValue(oracle["reportSha256"], "isolated oracle report") || (oracle["reportStatus"] !== "pass" && oracle["reportStatus"] !== "fail") || (status === "pass_pending_exact_byte_review" && oracle["reportStatus"] !== "pass")) throw new Error("Isolated oracle report is invalid.");
  const commands = recordArray(run["commands"], "isolated repository commands");
  if (commands.length !== isolatedRepositoryCheckArgv.length) throw new Error("Isolated receipt command count is invalid.");
  const pendingArgv = stringArray(recordValue(commands[0] ?? {}, "pending verification command")["argv"], "pending verification argv");
  if (pendingArgv.length !== 6 || pendingArgv[0] !== "bun" || pendingArgv[1] !== "test/k0r-issue-exit.ts" || pendingArgv[2] !== "--verify-pending" || pendingArgv[4] !== "--private-root") throw new Error("Isolated pending verification argv is invalid.");
  const pendingPath = resolve(pendingArgv[3] ?? "");
  const privateRoot = resolve(pendingArgv[5] ?? "");
  if (pendingPath !== join(privateRoot, "protected/k0r-transition.pending.json")) throw new Error("Isolated pending verification paths are not canonical.");
  const expectedCommands = await resolveK0rRepositoryCheckArgv(sourceRoot, pendingPath, privateRoot);
  commands.forEach((command, index) => validateCommandResult(command, expectedCommands[index] ?? []));
  if (status === "pass_pending_exact_byte_review" && [runtime["bun"], runtime["git"], oracle, ...bundleCommands, ...gitCommands, ...commands].some((result) => recordValue(result, "command result")["exitCode"] !== 0)) throw new Error("Passing isolated receipt contains a nonzero command.");
  return receipt as K0rIsolatedRunReceipt;
}

async function copyAndVerifySourceBundle(root: string, roots: DedicatedRoots, hostEnvironment: Record<string, string>, environment: Record<string, string>, policy: IsolationPolicy, dependencies: ResolvedDependencyBinding): Promise<SourceBundle> {
  const base = await materializeHeadSource(root, roots.boulder, roots.tmp, hostEnvironment, policy);
  const overlay = await applyApprovedOverlay(root, roots.boulder, policy.allowedOverlayPaths);
  const generatedInventories = await deriveDisposableGeneratedInventories(root, roots, environment, policy, dependencies);
  await writeFile(join(roots.boulder, isolatedRunReceiptPath), `${JSON.stringify(notRunK0rIsolatedRunReceipt, null, 2)}\n`, "utf8");
  const files = await Promise.all(isolatedSourceBundlePaths.map(async (path) => {
    const source = await readRegularFile(root, path, "source bundle");
    const copied = await readRegularFile(roots.boulder, path, "isolated source bundle");
    const sourceSha256 = sha256Bytes(source);
    if (sourceSha256 !== sha256Bytes(copied)) throw new Error(`Derived source bundle hash mismatch: ${path}.`);
    return { path, sha256: sourceSha256 };
  }));
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return { derivation: { base, overlay: { ...overlay, generatedInventories } }, files, merkleSha256: merkleDigest(files) };
}

async function materializeHeadSource(root: string, destination: string, temporaryDirectory: string, env: Record<string, string>, policy: IsolationPolicy): Promise<SourceDerivation["base"]> {
  const archivePath = join(temporaryDirectory, headSourceArchiveFileName);
  const [commit, tree] = await Promise.all([
    runHostCommand(["git", "rev-parse", "HEAD"], root, env, policy),
    runHostCommand(["git", "rev-parse", "HEAD^{tree}"], root, env, policy)
  ]);
  if (commit.exitCode !== 0 || tree.exitCode !== 0 || !gitObjectId(commit.stdout.trim()) || !gitObjectId(tree.stdout.trim())) throw new Error("Unable to resolve immutable HEAD source identity.");
  const archive = await runHostCommand(["git", "archive", "--format=tar", "--output", archivePath, "HEAD"], root, env, policy);
  if (archive.exitCode !== 0) throw new Error("Unable to read immutable HEAD archive.");
  const archiveSha256 = sha256Bytes(await readRegularFile(temporaryDirectory, headSourceArchiveFileName, "immutable HEAD archive"));
  const extracted = await runHostCommand(["tar", "-xf", archivePath, "-C", destination], root, env, policy);
  await rm(archivePath, { force: true });
  if (extracted.exitCode !== 0) throw new Error("Unable to extract immutable HEAD archive.");
  return { archiveSha256, commit: commit.stdout.trim(), tree: tree.stdout.trim() };
}

async function applyApprovedOverlay(root: string, destination: string, allowedPaths: readonly string[]): Promise<Omit<SourceDerivation["overlay"], "generatedInventories">> {
  const files: { path: string; baseSha256: string | null; overlaySha256: string }[] = [];
  for (const path of allowedPaths) {
    if (path === packageInventoryPath || path === generatedEvidenceManifestPath) continue;
    const current = await readRegularFile(root, path, "approved source overlay");
    const baseline = await readOptionalRegularFile(destination, path, "immutable HEAD source");
    const baseSha256 = baseline === undefined ? null : sha256Bytes(baseline);
    const overlaySha256 = sha256Bytes(current);
    if (baseSha256 === overlaySha256) continue;
    const target = join(destination, path);
    await mkdir(dirname(target), { recursive: true });
    if (await pathExists(target)) await assertSingleLinkRegularFile(target, "approved source overlay destination");
    await copyFile(join(root, path), target);
    if (sha256Bytes(await readRegularFile(destination, path, "derived source overlay")) !== overlaySha256) throw new Error(`Approved source overlay hash mismatch: ${path}.`);
    files.push({ path, baseSha256, overlaySha256 });
  }
  return { allowedPaths: [...allowedPaths], files, merkleSha256: overlayMerkleDigest(files) };
}

async function readOptionalRegularFile(root: string, path: string, label: string): Promise<Uint8Array | undefined> {
  const fullPath = join(root, path);
  const state = await lstat(fullPath).catch(() => undefined);
  if (state === undefined) return undefined;
  if (!state.isFile() || state.isSymbolicLink()) throw new Error(`${label} must be a regular file: ${path}.`);
  return readFile(fullPath);
}

async function readRegularFile(root: string, path: string, label: string): Promise<Uint8Array> {
  const bytes = await readOptionalRegularFile(root, path, label);
  if (bytes === undefined) throw new Error(`${label} is missing: ${path}.`);
  return bytes;
}
async function deriveDisposableGeneratedInventories(sourceRoot: string, roots: DedicatedRoots, environment: Record<string, string>, policy: IsolationPolicy, dependencies: ResolvedDependencyBinding): Promise<SourceDerivation["overlay"]["generatedInventories"]> {
  const initialPack = await runCommand(isolatedPackDryRunArgv, "boulder", sourceRoot, roots, environment, policy, dependencies);
  if (initialPack.exitCode !== 0) throw new Error(`Unable to measure the initial isolated package inventory: ${initialPack.stderr}`);
  const initialPackResult = parsePackDryRun(initialPack.stdout, "initial isolated package output");
  const initialPackFiles = initialPackResult.files;
  const packageSource = await readRegularFile(sourceRoot, packageInventoryPath, "package inventory overlay");
  const packageInventory = recordValue(JSON.parse(new TextDecoder().decode(packageSource)), "package inventory overlay");
  const sanitizedPackage = sanitizePackageInventory(packageInventory, initialPackResult, policy.sourceDerivationDirtyExclusions);
  const packageContent = `${JSON.stringify(sanitizedPackage.value, null, 2)}\n`;
  await writeFile(join(roots.boulder, packageInventoryPath), packageContent, "utf8");

  const docRegistrySource = await readRegularFile(sourceRoot, docRegistryPath, "documentation registry overlay");
  const docRegistry = recordArray(JSON.parse(new TextDecoder().decode(docRegistrySource)), "documentation registry overlay");
  const sanitizedRegistry = sanitizeDocRegistry(docRegistry, initialPackFiles, policy.sourceDerivationDirtyExclusions);
  const docRegistryContent = `${JSON.stringify(sanitizedRegistry.value, null, 2)}\n`;
  await writeFile(join(roots.boulder, docRegistryPath), docRegistryContent, "utf8");

  const packageTestSource = await readRegularFile(sourceRoot, packageInventoryContractTestPath, "package inventory contract overlay");
  const packageTestContent = rewritePackageInventoryTestConstants(new TextDecoder().decode(packageTestSource), packageInventory, sanitizedPackage.value);
  await writeFile(join(roots.boulder, packageInventoryContractTestPath), packageTestContent, "utf8");

  const finalPack = await runCommand(isolatedPackDryRunArgv, "boulder", sourceRoot, roots, environment, policy, dependencies);
  if (finalPack.exitCode !== 0) throw new Error(`Unable to measure the final isolated package inventory: ${finalPack.stderr}`);
  const finalPackOutput = `${finalPack.stdout}${finalPack.stderr}`;
  const finalPackResult = parsePackDryRun(finalPack.stdout, "final isolated package output");
  const finalPackFiles = finalPackResult.files;
  if (JSON.stringify(initialPackFiles) !== JSON.stringify(finalPackFiles)) throw new Error("Disposable generated inventories changed the isolated package path set.");
  if (JSON.stringify(packageInventoryFiles(sanitizedPackage.value)) !== JSON.stringify(finalPackFiles)) throw new Error("Sanitized package inventory does not classify the final isolated package path set.");
  const packDryRunSource = await readRegularFile(sourceRoot, packDryRunBaselinePath, "package dry-run baseline overlay");
  const packDryRunExcludedPaths = excludedPackPaths(parsePackDryRun(new TextDecoder().decode(packDryRunSource), "package dry-run baseline overlay").files, finalPackFiles, policy.sourceDerivationDirtyExclusions, "package dry-run baseline");
  await writeFile(join(roots.boulder, packDryRunBaselinePath), finalPackOutput, "utf8");
  const evidenceManifestContent = canonicalPendingEvidenceManifest;
  await writeFile(join(roots.boulder, generatedEvidenceManifestPath), evidenceManifestContent, "utf8");

  const entries = [
    derivedGeneratedInventoryEntry(packageInventoryPath, packageSource, new TextEncoder().encode(packageContent), sanitizedPackage.excludedPaths, "classify_isolated_pack_paths"),
    derivedGeneratedInventoryEntry(docRegistryPath, docRegistrySource, new TextEncoder().encode(docRegistryContent), sanitizedRegistry.excludedPaths, "filter_packaged_docs_to_isolated_pack_paths"),
    derivedGeneratedInventoryEntry(packDryRunBaselinePath, packDryRunSource, new TextEncoder().encode(finalPackOutput), packDryRunExcludedPaths, "replace_with_final_isolated_pack_output"),
    derivedGeneratedInventoryEntry(packageInventoryContractTestPath, packageTestSource, new TextEncoder().encode(packageTestContent), sanitizedPackage.excludedPaths, "replace_exact_package_inventory_summary_constants"),
    derivedGeneratedInventoryEntry(generatedEvidenceManifestPath, new TextEncoder().encode(evidenceManifestContent), new TextEncoder().encode(evidenceManifestContent), [], "install_canonical_pending_not_run_evidence_manifest")
  ] as const;
  await updateIsolatedManifestInventory(roots.boulder, entries);
  return {
    algorithm: disposableInventoryDerivationAlgorithm,
    version: disposableInventoryDerivationVersion,
    pack: { argv: [...isolatedPackDryRunArgv], outputSha256: sha256Text(finalPackOutput), pathsSha256: sha256Text(`${finalPackFiles.join("\n")}\n`) },
    entries
  };
}
function sanitizePackageInventory(inventory: RecordValue, isolatedPack: { readonly files: readonly string[]; readonly reportedTotal: number }, sourceDerivationDirtyExclusions: readonly string[]): { readonly value: RecordValue; readonly excludedPaths: readonly string[] } {
  const packed = new Set(isolatedPack.files);
  const sourceClasses = recordArray(inventory["classes"], "package inventory classes");
  const excludedPaths = excludedPackPaths(sourceClasses.flatMap((entry) => stringArray(entry["files"], "package inventory class files")), isolatedPack.files, sourceDerivationDirtyExclusions, "package inventory");
  const classes = sourceClasses.map((entry) => {
    const files = stringArray(entry["files"], "package inventory class files").filter((path) => packed.has(path));
    return { ...entry, count: files.length, files };
  });
  const value = { ...inventory, totalUniqueFiles: new Set(isolatedPack.files).size, totalPackedFiles: isolatedPack.reportedTotal, classes };
  return { value, excludedPaths };
}
function sanitizeDocRegistry(registry: readonly RecordValue[], isolatedPackFiles: readonly string[], sourceDerivationDirtyExclusions: readonly string[]): { readonly value: readonly RecordValue[]; readonly excludedPaths: readonly string[] } {
  const packagedDocs = new Set(isolatedPackFiles.filter((path) => path.startsWith("docs/")));
  const packagedPaths = registry.filter((entry) => entry["packaging"] === "packaged").map((entry) => stringValue(entry["path"], "documentation registry packaged path"));
  const excludedPaths = excludedPackPaths(packagedPaths, [...packagedDocs].sort(), sourceDerivationDirtyExclusions, "documentation registry");
  const value = registry.filter((entry) => entry["packaging"] !== "packaged" || packagedDocs.has(stringValue(entry["path"], "documentation registry path")));
  const registered = value.filter((entry) => entry["packaging"] === "packaged").map((entry) => stringValue(entry["path"], "sanitized documentation registry path")).sort();
  if (JSON.stringify(registered) !== JSON.stringify([...packagedDocs].sort())) throw new Error("Sanitized documentation registry does not match isolated packaged documentation.");
  return { value, excludedPaths };
}
function excludedPackPaths(sourcePaths: readonly string[], isolatedPaths: readonly string[], sourceDerivationDirtyExclusions: readonly string[], label: string): string[] {
  const isolated = new Set(isolatedPaths);
  const excludedPaths = [...new Set(sourcePaths.filter((path) => !isolated.has(path)))].sort();
  if (excludedPaths.some((path) => !sourceDerivationDirtyExclusions.includes(path))) throw new Error(`${label} contains a path absent from the isolated package outside the declared exclusions.`);
  return excludedPaths;
}
function packageInventoryFiles(inventory: RecordValue): string[] {
  return [...new Set(recordArray(inventory["classes"], "sanitized package inventory classes").flatMap((entry) => stringArray(entry["files"], "sanitized package inventory class files")))].sort();
}
function rewritePackageInventoryTestConstants(source: string, sourceInventory: RecordValue, sanitizedInventory: RecordValue): string {
  const sourceClasses = new Map(recordArray(sourceInventory["classes"], "source package inventory classes").map((entry) => [stringValue(entry["class"], "source package inventory class"), stringArray(entry["files"], "source package inventory class files").length]));
  const sanitizedClasses = new Map(recordArray(sanitizedInventory["classes"], "sanitized package inventory classes").map((entry) => [stringValue(entry["class"], "sanitized package inventory class"), stringArray(entry["files"], "sanitized package inventory class files").length]));
  let result = replaceExact(source, `expect(summary.totalUniqueFiles).toBe(${numberValue(sourceInventory["totalUniqueFiles"], "source package inventory total unique files")});`, `expect(summary.totalUniqueFiles).toBe(${numberValue(sanitizedInventory["totalUniqueFiles"], "sanitized package inventory total unique files")});`, "package inventory total unique files");
  result = replaceExact(result, `expect(summary.totalPackedFiles).toBe(${numberValue(sourceInventory["totalPackedFiles"], "source package inventory total packed files")});`, `expect(summary.totalPackedFiles).toBe(${numberValue(sanitizedInventory["totalPackedFiles"], "sanitized package inventory total packed files")});`, "package inventory total packed files");
  for (const [className, sourceCount] of sourceClasses) {
    const sanitizedCount = sanitizedClasses.get(className);
    if (sanitizedCount === undefined) throw new Error(`Sanitized package inventory class is missing: ${className}.`);
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(className) ? className : JSON.stringify(className);
    const suffix = source.includes(`${key}: ${sourceCount},`) ? "," : "";
    result = replaceExact(result, `${key}: ${sourceCount}${suffix}`, `${key}: ${sanitizedCount}${suffix}`, `package inventory ${className} count`);
  }
  return result;
}
function replaceExact(source: string, expected: string, replacement: string, label: string): string {
  const occurrences = source.split(expected).length - 1;
  if (occurrences !== 1) throw new Error(`Expected exactly one ${label} constant in the package inventory contract test.`);
  return source.replace(expected, replacement);
}
function derivedGeneratedInventoryEntry(path: typeof disposableGeneratedInventoryPaths[number], source: Uint8Array, result: Uint8Array, excludedPaths: readonly string[], transformation: string): SourceDerivation["overlay"]["generatedInventories"]["entries"][number] {
  return { path, sourceSha256: sha256Bytes(source), resultSha256: sha256Bytes(result), excludedPaths: [...excludedPaths], transformation };
}
async function updateIsolatedManifestInventory(root: string, entries: readonly SourceDerivation["overlay"]["generatedInventories"]["entries"][number][]): Promise<void> {
  const isolationManifestPath = "evidence/k0r/isolation-manifest.json";
  const manifest = recordValue(JSON.parse(new TextDecoder().decode(await readRegularFile(root, isolationManifestPath, "isolated generated inventory manifest"))), "isolated generated inventory manifest");
  const initialInventory = recordArray(recordValue(manifest["inventories"], "isolated generated inventory inventories")["initialPriorK0K1Inventory"], "isolated generated inventory initial inventory");
  for (const entry of entries) {
    if (entry.path === generatedEvidenceManifestPath) continue;
    const declared = initialInventory.find((candidate) => candidate["path"] === entry.path);
    if (declared === undefined) throw new Error(`Generated inventory is not declared in the K0/K1 inventory: ${entry.path}.`);
    declared["sha256"] = entry.resultSha256;
  }
  await writeFile(join(root, isolationManifestPath), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
async function validateSourceDerivation(derivation: RecordValue, sourceRoot: string, policy: IsolationPolicy): Promise<void> {
  exactKeys(derivation, ["base", "overlay"], "isolated source derivation");
  const base = recordValue(derivation["base"], "isolated source base");
  exactKeys(base, ["archiveSha256", "commit", "tree"], "isolated source base");
  if (!digestValue(base["archiveSha256"], "isolated source archive digest") || !gitObjectId(base["commit"]) || !gitObjectId(base["tree"])) throw new Error("Isolated source base is invalid.");
  const overlay = recordValue(derivation["overlay"], "isolated source overlay");
  exactKeys(overlay, ["allowedPaths", "files", "generatedInventories", "merkleSha256"], "isolated source overlay");
  const allowedPaths = stringArray(overlay["allowedPaths"], "isolated source overlay paths");
  if (JSON.stringify(allowedPaths) !== JSON.stringify(policy.allowedOverlayPaths)) throw new Error("Isolated source overlay paths are unauthorized.");
  const files = recordArray(overlay["files"], "isolated source overlay files").map((entry) => {
    exactKeys(entry, ["baseSha256", "overlaySha256", "path"], "isolated source overlay file");
    const baseSha256 = entry["baseSha256"];
    if (baseSha256 !== null) digestValue(baseSha256, "isolated source overlay base digest");
    return { path: stringValue(entry["path"], "isolated source overlay path"), baseSha256: baseSha256 as string | null, overlaySha256: digestValue(entry["overlaySha256"], "isolated source overlay digest") };
  });
  if (files.some((entry) => !allowedPaths.includes(entry.path)) || JSON.stringify(files.map((entry) => entry.path)) !== JSON.stringify([...files.map((entry) => entry.path)].sort()) || new Set(files.map((entry) => entry.path)).size !== files.length || overlay["merkleSha256"] !== overlayMerkleDigest(files)) throw new Error("Isolated source overlay binding is invalid.");
  const generatedInventories = recordValue(overlay["generatedInventories"], "isolated generated inventories");
  exactKeys(generatedInventories, ["algorithm", "entries", "pack", "version"], "isolated generated inventories");
  if (generatedInventories["algorithm"] !== disposableInventoryDerivationAlgorithm || generatedInventories["version"] !== disposableInventoryDerivationVersion) throw new Error("Isolated generated inventory derivation identity is invalid.");
  const pack = recordValue(generatedInventories["pack"], "isolated generated inventory pack result");
  exactKeys(pack, ["argv", "outputSha256", "pathsSha256"], "isolated generated inventory pack result");
  if (JSON.stringify(stringArray(pack["argv"], "isolated generated inventory pack argv")) !== JSON.stringify(isolatedPackDryRunArgv) || !digestValue(pack["outputSha256"], "isolated generated inventory pack output digest") || !digestValue(pack["pathsSha256"], "isolated generated inventory pack paths digest")) throw new Error("Isolated generated inventory pack result is invalid.");
  const transformations = new Map<typeof disposableGeneratedInventoryPaths[number], string>([
    [packageInventoryPath, "classify_isolated_pack_paths"],
    [docRegistryPath, "filter_packaged_docs_to_isolated_pack_paths"],
    [packDryRunBaselinePath, "replace_with_final_isolated_pack_output"],
    [packageInventoryContractTestPath, "replace_exact_package_inventory_summary_constants"],
    [generatedEvidenceManifestPath, "install_canonical_pending_not_run_evidence_manifest"]
  ]);
  const entries = recordArray(generatedInventories["entries"], "isolated generated inventory entries").map((entry) => {
    exactKeys(entry, ["excludedPaths", "path", "resultSha256", "sourceSha256", "transformation"], "isolated generated inventory entry");
    const path = stringValue(entry["path"], "isolated generated inventory path") as typeof disposableGeneratedInventoryPaths[number];
    const excludedPaths = stringArray(entry["excludedPaths"], "isolated generated inventory exclusions");
    if (transformations.get(path) !== entry["transformation"] || JSON.stringify(excludedPaths) !== JSON.stringify([...excludedPaths].sort()) || new Set(excludedPaths).size !== excludedPaths.length || excludedPaths.some((excludedPath) => !policy.sourceDerivationDirtyExclusions.includes(excludedPath))) throw new Error("Isolated generated inventory entry is invalid.");
    return { path, sourceSha256: digestValue(entry["sourceSha256"], "isolated generated inventory source digest"), resultSha256: digestValue(entry["resultSha256"], "isolated generated inventory result digest"), excludedPaths, transformation: stringValue(entry["transformation"], "isolated generated inventory transformation") };
  });
  if (JSON.stringify(entries.map((entry) => entry.path)) !== JSON.stringify(disposableGeneratedInventoryPaths)) throw new Error("Isolated generated inventory paths are invalid.");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "boulder-k0r-validate-source-"));
  const roots: DedicatedRoots = {
    home: join(temporaryRoot, "home"),
    cache: join(temporaryRoot, "cache"),
    tmp: join(temporaryRoot, "tmp"),
    registry: join(temporaryRoot, "registry"),
    credentials: join(temporaryRoot, "credentials-empty"),
    boulder: join(temporaryRoot, "boulder")
  };
  try {
    await Promise.all(Object.values(roots).map((path) => mkdir(path, { recursive: true })));
    const boundPolicy = bindK0rRunRoot(policy, temporaryRoot);
    const actualBase = await materializeHeadSource(sourceRoot, roots.boulder, roots.tmp, hostIsolatedEnvironment(roots), boundPolicy);
    const actualOverlay = await applyApprovedOverlay(sourceRoot, roots.boulder, policy.allowedOverlayPaths);
    const actualGeneratedInventories = await deriveDisposableGeneratedInventories(sourceRoot, roots, isolatedEnvironment(roots), boundPolicy, await bindK0rDependencies(sourceRoot, policy.dependencies));
    if (JSON.stringify(base) !== JSON.stringify(actualBase) || JSON.stringify(overlay) !== JSON.stringify({ ...actualOverlay, generatedInventories: actualGeneratedInventories })) throw new Error("Isolated source derivation is stale or forged.");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function staticBoundaryCheck(root: string): Promise<{ readonly networkImports: readonly string[]; readonly productV2Imports: readonly string[] }> {
  const violations = { networkImports: [] as string[], productV2Imports: [] as string[] };
  for (const path of isolatedSourceBundlePaths.filter((path) => path.endsWith(".ts"))) {
    const source = await readFile(join(root, path), "utf8");
    for (const match of source.matchAll(/(?:import|export)\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g)) {
      const imported = match[1] ?? "";
      if (/^(?:node:)?(?:http|https|http2|net|tls|dgram|dns|undici)$/.test(imported)) violations.networkImports.push(`${path}:${imported}`);
      if (/(?:^|\/)src\/v2(?:\/|$)|(?:^|\/)v2-[^/]+(?:\.js)?$/.test(imported)) violations.productV2Imports.push(`${path}:${imported}`);
    }
  }
  if (violations.networkImports.length !== 0 || violations.productV2Imports.length !== 0) throw new Error("Isolated source bundle imports a forbidden surface.");
  return violations;
}
async function cleanTempTrackedInventory(root: string, roots: DedicatedRoots, env: Record<string, string>, policy: IsolationPolicy, dependencies: ResolvedDependencyBinding, historicalTagBundle: HistoricalTagBundle): Promise<CleanTempInventory> {
  const packageJson = recordValue(JSON.parse(await readFile(join(roots.boulder, "package.json"), "utf8")), "isolated package manifest");
  const packageVersion = stringValue(packageJson["version"], "isolated package version");
  const releaseTag = await readReleaseTagBinding(root, packageVersion);
  const results: (CommandResult & { readonly stdout: string })[] = [];
  for (const argv of isolatedGitSetupArgv) {
    const result = await runCommand(argv, "boulder", root, roots, env, policy, dependencies);
    if (result.exitCode !== 0) throw new Error("Unable to prepare deterministic clean isolated repository.");
    results.push(result);
  }
  const trackedResult = await runCommand(["git", "ls-files", "-z"], "boulder", root, roots, env, policy, dependencies, true);
  const statusResult = await runCommand(["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"], "boulder", root, roots, env, policy, dependencies, true);
  if (trackedResult.exitCode !== 0 || statusResult.exitCode !== 0) throw new Error("Unable to measure clean isolated repository inventory.");
  const tracked = trackedResult.stdout.split("\0").filter(Boolean).sort();
  const statusEntries = statusResult.stdout.split("\0").filter(Boolean).sort();
  const untracked = statusEntries.filter((entry) => entry.startsWith("?? "));
  if (untracked.length !== 0) throw new Error("Isolated repository has untracked files before execution.");
  const commit = results[3]?.stdout.trim() ?? "";
  const tree = results[4]?.stdout.trim() ?? "";
  const postFetchCommit = results[6]?.stdout.trim() ?? "";
  const tagCommit = results[7]?.stdout.trim() ?? "";
  if (!gitObjectId(commit) || !gitObjectId(tree) || postFetchCommit !== commit || tagCommit !== historicalTagBundle.sourceTagCommit || tagCommit !== releaseTag.tagCommit) throw new Error("Unable to bind deterministic and historical isolated Git provenance.");
  await rm(historicalTagBundle.path, { force: true });
  if (await lstat(historicalTagBundle.path).then(() => true).catch(() => false)) throw new Error("Historical tag bundle cleanup failed.");
  return {
    tracked,
    untracked,
    gitMetadata: {
      packageVersion,
      tag: releaseTag.tag,
      commit,
      tree,
      tagCommit,
      historicalTagBundle: { ...historicalTagBundle, removed: true },
      commands: results.map(observedCommand)
    }
  };
}
async function createHistoricalTagBundle(root: string, bundlePath: string, env: Record<string, string>, policy: IsolationPolicy): Promise<HistoricalTagBundle> {
  const packageVersion = stringValue(recordValue(JSON.parse(await readFile(join(root, "package.json"), "utf8")), "source package manifest")["version"], "source package version");
  const releaseTag = await readReleaseTagBinding(root, packageVersion);
  const sourceTag = await runHostRecordedCommand(historicalTagBundleArgv[0], root, env, policy);
  if (sourceTag.exitCode !== 0 || sourceTag.stdout.trim() !== releaseTag.tagCommit) throw new Error("Source release tag does not match the checked-in release manifest.");
  const bundle = await runHostRecordedCommand(["git", "bundle", "create", bundlePath, `refs/tags/${releaseTag.tag}`], root, env, policy);
  if (bundle.exitCode !== 0) throw new Error("Unable to create the historical release tag bundle.");
  const heads = await runHostRecordedCommand(["git", "bundle", "list-heads", bundlePath], root, env, policy);
  if (heads.exitCode !== 0 || heads.stdout.trim() !== `${releaseTag.tagCommit} refs/tags/${releaseTag.tag}`) throw new Error("Historical release tag bundle does not contain only the checked-in release tag.");
  return { path: bundlePath, sha256: sha256Bytes(await readFile(bundlePath)), sourceTagCommit: releaseTag.tagCommit, commands: [observedCommand(sourceTag), observedCommand(bundle), observedCommand(heads)] };
}

async function readReleaseTagBinding(root: string, packageVersion: string): Promise<{ readonly tag: typeof isolatedReleaseTag; readonly tagCommit: string }> {
  const releaseManifest = recordValue(JSON.parse(await readFile(join(root, releaseManifestPath), "utf8")), "checked-in release manifest");
  const tag = stringValue(releaseManifest["tag"], "checked-in release tag");
  const tagCommit = stringValue(releaseManifest["tagCommit"], "checked-in release tag commit");
  if (releaseManifest["packageJsonVersion"] !== packageVersion || tag !== releaseTagForPackageVersion(packageVersion) || !gitObjectId(tagCommit)) throw new Error("Checked-in release manifest does not bind the current package release tag.");
  return { tag: isolatedReleaseTag, tagCommit };
}

function hostIsolatedEnvironment(roots: DedicatedRoots): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin",
    LANG: "C",
    HOME: roots.home,
    XDG_CACHE_HOME: roots.cache,
    TMPDIR: roots.tmp,
    BUN_INSTALL_CACHE_DIR: roots.registry,
    NPM_CONFIG_CACHE: roots.registry,
    NPM_CONFIG_REGISTRY: `file://${roots.registry}`,
    NPM_CONFIG_USERCONFIG: join(roots.credentials, ".npmrc"),
    BOULDER_ROOT: roots.boulder,
    ...deterministicGitEnvironment
  };
}

function isolatedEnvironment(_roots: DedicatedRoots): Record<string, string> {
  return {
    PATH: `${join(sandboxDestinations.typescript, "bin")}:${dirname(sandboxDestinations.runtimeExecutable)}:/usr/local/bin:/usr/bin`,
    LANG: "C",
    HOME: sandboxDestinations.home,
    XDG_CACHE_HOME: sandboxDestinations.cache,
    TMPDIR: sandboxDestinations.tmp,
    BUN_INSTALL_CACHE_DIR: sandboxDestinations.registry,
    NPM_CONFIG_CACHE: sandboxDestinations.registry,
    NPM_CONFIG_REGISTRY: `file://${sandboxDestinations.registry}`,
    NPM_CONFIG_USERCONFIG: join(sandboxDestinations.credentials, ".npmrc"),
    BOULDER_ROOT: sandboxDestinations.boulder,
    ...deterministicGitEnvironment
  };
}

async function verifyOwnership(root: string, roots: DedicatedRoots): Promise<{ readonly rootOwnedByRun: true; readonly dedicatedRootsOwnedByRun: true; readonly credentialsRootEmpty: true; readonly hostRootsUsed: false }> {
  for (const path of [root, ...Object.values(roots)]) {
    const state = await lstat(path);
    if (!state.isDirectory() || state.isSymbolicLink() || relative(root, path).startsWith("..")) throw new Error("Isolated root ownership check failed.");
  }
  if ((await readdir(roots.credentials)).length !== 0) throw new Error("Isolated credentials root must be empty.");
  return { rootOwnedByRun: true, dedicatedRootsOwnedByRun: true, credentialsRootEmpty: true, hostRootsUsed: false };
}

async function inventory(root: string): Promise<InventoryEntry[]> {
  const entries: InventoryEntry[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      const path = relative(root, full).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        entries.push({ path, kind: "directory", sha256: sha256Text(`directory:${path}`) });
        await visit(full);
      } else if (entry.isFile()) {
        entries.push({ path, kind: "file", sha256: sha256Bytes(await readFile(full)) });
      } else {
        throw new Error(`Isolated inventory contains a non-regular path: ${path}.`);
      }
    }
  }
  await visit(root);
  entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return entries;
}

export async function readK0rIsolationArgvAllowlist(root = repositoryRoot): Promise<readonly (readonly string[])[]> {
  return (await readK0rIsolationPolicy(root)).argvAllowlist;
}
async function readK0rIsolationPolicy(root: string): Promise<IsolationPolicy> {
  const manifest = recordValue(JSON.parse(await readFile(join(root, "evidence/k0r/isolation-manifest.json"), "utf8")), "K0R isolation manifest");
  const acceptance = recordValue(JSON.parse(await readFile(join(root, "evidence/k0r/acceptance-manifest.json"), "utf8")), "K0R acceptance manifest");
  const pathPolicy = recordValue(manifest["pathPolicy"], "K0R path policy");
  const allowedK0RPaths = stringArray(pathPolicy["allowedK0RPaths"], "allowed K0R paths");
  const sourceDerivationDirtyExclusions = stringArray(pathPolicy["excludedUnrelatedPlannerPaths"], "source-derivation dirty exclusions");
  if (sourceDerivationDirtyExclusions.length === 0 || new Set(sourceDerivationDirtyExclusions).size !== sourceDerivationDirtyExclusions.length || sourceDerivationDirtyExclusions.some((path) => !safeRelativePath(path) || path.includes("*"))) throw new Error("K0R source-derivation dirty exclusion policy is invalid.");
  const acceptancePaths = recordArray(acceptance["requiredArtifacts"], "K0R acceptance artifacts").map((artifact) => stringValue(artifact["path"], "K0R acceptance artifact path"));
  const priorK0K1Paths = recordArray(recordValue(manifest["inventories"], "K0R inventories")["initialPriorK0K1Inventory"], "initial K0/K1 inventory").map((entry) => stringValue(entry["path"], "initial K0/K1 inventory path"));
  if (acceptancePaths.some((path) => !allowedK0RPaths.includes(path))) throw new Error("K0R acceptance artifacts must be approved K0R overlay paths.");
  const allowedOverlayPaths = [...new Set([...allowedK0RPaths, ...priorK0K1Paths])].filter((path) => path !== isolatedRunReceiptPath && path !== generatedEvidenceManifestPath).sort();
  if (allowedOverlayPaths.length === 0 || allowedOverlayPaths.some((path) => !safeRelativePath(path))) throw new Error("K0R approved source overlay paths are invalid.");
  const isolation = recordValue(manifest["isolation"], "K0R isolation");
  const sourceDerivation = recordValue(isolation["sourceDerivation"], "K0R source derivation");
  exactKeys(sourceDerivation, ["archiveDigestRequired", "base", "baseCommitAndTreeRequired", "overlay", "overlayPathAndDigestRequired", "unapprovedDirtyPathsExcluded"], "K0R source derivation");
  if (isolation["kind"] !== "head-archive-plus-approved-overlay" || sourceDerivation["base"] !== "immutable HEAD tracked bytes via git archive" || sourceDerivation["baseCommitAndTreeRequired"] !== true || sourceDerivation["archiveDigestRequired"] !== true || sourceDerivation["overlayPathAndDigestRequired"] !== true || sourceDerivation["unapprovedDirtyPathsExcluded"] !== true) throw new Error("K0R immutable source derivation policy is invalid.");
  const commands = recordValue(manifest["commands"], "K0R isolation commands");
  const argvAllowlist = stringArrayArray(commands["argvAllowlist"], "K0R isolation argv allowlist");
  if (argvAllowlist.length === 0 || new Set(argvAllowlist.map((argv) => JSON.stringify(argv))).size !== argvAllowlist.length) throw new Error("K0R isolation argv allowlist is invalid.");
  const dependencyContract = recordValue(recordValue(manifest["isolation"], "K0R isolation")["dependencies"], "K0R dependency contract");
  exactKeys(dependencyContract, ["typescript"], "K0R dependency contract");
  const typescript = recordValue(dependencyContract["typescript"], "K0R TypeScript dependency contract");
  exactKeys(typescript, ["artifactPath", "bunLockPath", "executable", "packageJsonPath", "packageName", "packageTreeDigestRequired", "packageVersionRange", "readOnlyDestinations", "required", "symlinkBoundaryForbidden"], "K0R TypeScript dependency contract");
  const dependencies: DependencyPolicy = {
    bunLockPath: stringValue(typescript["bunLockPath"], "K0R Bun lock path") as DependencyPolicy["bunLockPath"],
    typescriptExecutable: stringValue(typescript["executable"], "K0R TypeScript executable") as DependencyPolicy["typescriptExecutable"],
    typescriptPackageName: stringValue(typescript["packageName"], "K0R TypeScript package name") as DependencyPolicy["typescriptPackageName"],
    typescriptPackageVersionRange: stringValue(typescript["packageVersionRange"], "K0R TypeScript package version range") as DependencyPolicy["typescriptPackageVersionRange"],
    typescriptPackageJsonPath: stringValue(typescript["packageJsonPath"], "K0R TypeScript package path") as DependencyPolicy["typescriptPackageJsonPath"],
    typescriptArtifactPath: stringValue(typescript["artifactPath"], "K0R TypeScript artifact path") as DependencyPolicy["typescriptArtifactPath"],
    readOnlyDestinations: stringArray(typescript["readOnlyDestinations"], "K0R dependency destinations")
  };
  if (typescript["required"] !== true || typescript["packageTreeDigestRequired"] !== true || typescript["symlinkBoundaryForbidden"] !== true || dependencies.bunLockPath !== "bun.lock" || dependencies.typescriptExecutable !== "tsc" || dependencies.typescriptPackageName !== "typescript" || dependencies.typescriptPackageVersionRange !== "^6.0.3" || dependencies.typescriptPackageJsonPath !== "package.json" || dependencies.typescriptArtifactPath !== "lib/tsc.js" || JSON.stringify(dependencies.readOnlyDestinations) !== JSON.stringify([sandboxDestinations.typescript])) throw new Error("K0R immutable TypeScript dependency policy is invalid.");
  const sandbox = recordValue(recordValue(manifest["isolation"], "K0R isolation")["bwrap"], "K0R bwrap policy");
  const runtimeExecutable = recordValue(sandbox["runtimeExecutable"], "K0R bwrap runtime executable");
  exactKeys(runtimeExecutable, ["destination", "hostSource", "logicalArgv0", "readOnly"], "K0R bwrap runtime executable");
  const hostHomeProbePath = stringValue(sandbox["hostHomeProbePath"], "K0R bwrap host-home probe path");
  if (sandbox["runtime"] !== "bwrap" || sandbox["required"] !== true || sandbox["hostHomeBindForbidden"] !== true || JSON.stringify(stringArray(sandbox["mandatoryArgv"], "K0R bwrap mandatory argv")) !== JSON.stringify(sandboxMandatoryArgs) || JSON.stringify(stringArray(sandbox["readOnlySystemRuntimePaths"], "K0R bwrap read-only system paths")) !== JSON.stringify(systemRuntimePaths) || sandbox["readOnlyRepositoryDestination"] !== sandboxDestinations.repository || JSON.stringify(stringArray(sandbox["writableDedicatedRootDestinations"], "K0R bwrap writable roots")) !== JSON.stringify([sandboxDestinations.home, sandboxDestinations.cache, sandboxDestinations.tmp, sandboxDestinations.registry, sandboxDestinations.credentials, sandboxDestinations.boulder]) || runtimeExecutable["hostSource"] !== "Bun.argv[0]" || runtimeExecutable["destination"] !== sandboxDestinations.runtimeExecutable || runtimeExecutable["logicalArgv0"] !== "bun" || runtimeExecutable["readOnly"] !== true || JSON.stringify(stringArray(sandbox["networkBreachProbe"], "K0R bwrap network breach probe")) !== JSON.stringify(networkBreachProbeArgv)) throw new Error("K0R bwrap policy is invalid.");
  if (!hostHomeProbePath.startsWith("/") || hostHomeProbePath === "/") throw new Error("K0R bwrap host-home probe path is invalid.");
  return { argvAllowlist, hostHomeProbePath, runtimeExecutableDestination: sandboxDestinations.runtimeExecutable, dependencies, allowedOverlayPaths, sourceDerivationDirtyExclusions };
}
function bindK0rRunRoot(policy: IsolationPolicy, temporaryRoot: string, qaRoot?: string): IsolationPolicy {
  return {
    ...policy,
    argvAllowlist: policy.argvAllowlist.map((argv) => argv.map((part) => part
      .replaceAll(runRootPlaceholder, temporaryRoot)
      .replaceAll("${QA_ROOT}", qaRoot ?? "${QA_ROOT}")))
  };
}
async function bindK0rDependencies(root: string, policy: DependencyPolicy): Promise<ResolvedDependencyBinding> {
  const projectManifest = recordValue(JSON.parse(await readFile(join(root, "package.json"), "utf8")), "K0R project package manifest");
  if (recordValue(projectManifest["devDependencies"], "K0R project devDependencies")["typescript"] !== policy.typescriptPackageVersionRange) throw new Error("K0R TypeScript version range does not match package.json.");
  const lockBytes = await readRegularDependencyFile(root, policy.bunLockPath);
  const typescriptPackageRoot = await resolveTypescriptPackageRoot(policy.typescriptExecutable);
  const packageBytes = await readRegularDependencyFile(typescriptPackageRoot, policy.typescriptPackageJsonPath);
  const artifactBytes = await readRegularDependencyFile(typescriptPackageRoot, policy.typescriptArtifactPath);
  const packageJson = recordValue(JSON.parse(new TextDecoder().decode(packageBytes)), "K0R TypeScript package manifest");
  const version = stringValue(packageJson["version"], "K0R TypeScript version");
  if (packageJson["name"] !== policy.typescriptPackageName || !satisfiesCaretVersion(version, policy.typescriptPackageVersionRange)) throw new Error("K0R TypeScript package is invalid.");
  return {
    binding: {
      bunLock: { path: policy.bunLockPath, sha256: sha256Bytes(lockBytes) },
      typescript: {
        executable: policy.typescriptExecutable,
        packageName: policy.typescriptPackageName,
        packageJsonPath: policy.typescriptPackageJsonPath,
        packageJsonSha256: sha256Bytes(packageBytes),
        version,
        artifactPath: policy.typescriptArtifactPath,
        artifactSha256: sha256Bytes(artifactBytes),
        treeSha256: await dependencyTreeDigest(typescriptPackageRoot)
      },
      readOnlyDestinations: policy.readOnlyDestinations
    },
    typescriptPackageRoot
  };
}
async function readRegularDependencyFile(root: string, path: string): Promise<Uint8Array> {
  const fullPath = join(root, path);
  const state = await lstat(fullPath);
  if (!state.isFile() || state.isSymbolicLink()) throw new Error(`K0R dependency input must be a regular file: ${path}.`);
  return readFile(fullPath);
}
async function resolveTypescriptPackageRoot(executable: string): Promise<string> {
  const source = await resolveExecutableFromPath(executable);
  const packageRoot = await realpath(dirname(dirname(source)));
  const state = await lstat(packageRoot);
  if (!state.isDirectory() || state.isSymbolicLink() || await realpath(join(packageRoot, "bin", executable)) !== source) throw new Error("K0R TypeScript executable does not resolve to its real package root.");
  return packageRoot;
}
async function resolveExecutableFromPath(executable: string): Promise<string> {
  for (const directory of (process.env.PATH ?? "").split(":")) {
    const candidate = join(directory === "" ? "." : directory, executable);
    const source = await realpath(candidate).catch(() => undefined);
    if (source === undefined) continue;
    const state = await lstat(source);
    if (state.isFile() && !state.isSymbolicLink() && (state.mode & 0o111) !== 0) return source;
  }
  throw new Error(`K0R TypeScript executable is unavailable in PATH: ${executable}.`);
}
async function dependencyTreeDigest(root: string): Promise<string> {
  const entries: string[] = [];
  async function visit(directory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of children) {
      const path = join(directory, entry.name);
      const relativePath = relative(root, path).replaceAll("\\", "/");
      const state = await lstat(path);
      if (state.isSymbolicLink()) throw new Error(`K0R TypeScript package tree contains a symbolic link: ${relativePath}.`);
      if (state.isDirectory()) {
        entries.push(`directory:${relativePath}`);
        await visit(path);
      } else if (state.isFile()) {
        entries.push(`file:${relativePath}\0${sha256Bytes(await readFile(path))}`);
      } else {
        throw new Error(`K0R TypeScript package tree contains a non-regular path: ${relativePath}.`);
      }
    }
  }
  await visit(root);
  return sha256Text(`${entries.join("\n")}\n`);
}
function satisfiesCaretVersion(version: string, range: string): boolean {
  const parsedVersion = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  const parsedRange = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);
  if (parsedVersion === null || parsedRange === null) return false;
  const [major, minor, patch] = parsedVersion.slice(1).map(Number);
  const [minimumMajor, minimumMinor, minimumPatch] = parsedRange.slice(1).map(Number);
  if (major === undefined || minor === undefined || patch === undefined || minimumMajor === undefined || minimumMinor === undefined || minimumPatch === undefined || major !== minimumMajor) return false;
  return minor > minimumMinor || (minor === minimumMinor && patch >= minimumPatch);
}

export function assertK0rAllowedArgv(argv: readonly string[], allowlist: readonly (readonly string[])[]): void {
  if (!allowlist.some((allowed) => JSON.stringify(allowed) === JSON.stringify(argv))) throw new Error(`K0R isolation argv is not allowlisted: ${JSON.stringify(argv)}.`);
}

async function runCommand(argv: readonly string[], location: "repository" | "boulder", root: string, roots: DedicatedRoots, env: Record<string, string>, policy: IsolationPolicy, dependencies: ResolvedDependencyBinding, readOnlyBoulder = false): Promise<CommandResult & { readonly stdout: string; readonly stderr: string }> {
  assertK0rAllowedArgv(argv, policy.argvAllowlist);
  const runtime = await resolveK0rRuntimeExecutable(policy.runtimeExecutableDestination);
  const result = await exec("bwrap", sandboxArgv(argv, location, root, roots, env, runtime, dependencies, readOnlyBoulder), root, { PATH: process.env.PATH ?? "", LANG: "C" });
  return { argv: [...argv], cwd: ".", envNames: safeEnvironmentNames, exitCode: result.exitCode, stdoutSha256: sha256Text(result.stdout), stderrSha256: sha256Text(result.stderr), stdout: result.stdout, stderr: result.stderr };
}

async function runHostCommand(argv: readonly string[], cwd: string, env: Record<string, string>, policy: IsolationPolicy): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> {
  assertK0rAllowedArgv(argv, policy.argvAllowlist);
  return exec(argv[0] ?? "", argv.slice(1), cwd, env);
}

async function runHostRecordedCommand(argv: readonly string[], cwd: string, env: Record<string, string>, policy: IsolationPolicy): Promise<CommandResult & { readonly stdout: string }> {
  const result = await runHostCommand(argv, cwd, env, policy);
  return { argv: [...argv], cwd: ".", envNames: safeEnvironmentNames, exitCode: result.exitCode, stdoutSha256: sha256Text(result.stdout), stderrSha256: sha256Text(result.stderr), stdout: result.stdout };
}

async function resolveK0rRuntimeExecutable(destination: string): Promise<RuntimeBinding> {
  const argv0 = Bun.argv[0];
  if (typeof argv0 !== "string" || argv0 === "") throw new Error("Unable to resolve the host Bun executable for K0R isolation.");
  const source = await realpath(argv0);
  const state = await lstat(source);
  if (!state.isFile() || state.isSymbolicLink() || (state.mode & 0o111) === 0) throw new Error("The resolved host Bun executable is not a regular executable file.");
  return { source, destination };
}

function sandboxArgv(argv: readonly string[], location: "repository" | "boulder", root: string, roots: DedicatedRoots, env: Record<string, string>, runtime: RuntimeBinding, dependencies: ResolvedDependencyBinding, readOnlyBoulder: boolean): string[] {
  const destination = location === "repository" ? sandboxDestinations.repository : sandboxDestinations.boulder;
  const executableArgv = argv[0] === "bun"
    ? [runtime.destination, ...argv.slice(1)]
    : argv[0] === "bunx" && (argv[1] === dependencies.binding.typescript.executable || (argv[1] === "--no-install" && argv[2] === dependencies.binding.typescript.executable))
      ? [runtime.destination, join(sandboxDestinations.typescript, dependencies.binding.typescript.artifactPath), ...argv.slice(argv[1] === "--no-install" ? 3 : 2)]
      : [...argv];
  const privateRootIndex = argv.indexOf("--private-root");
  const privateRoot = privateRootIndex === -1 ? undefined : argv[privateRootIndex + 1];
  if (privateRootIndex !== -1 && (privateRoot === undefined || !privateRoot.startsWith("/"))) throw new Error("Sandbox private root is invalid.");
  return [
    ...sandboxMandatoryArgs,
    "--proc", "/proc",
    "--dev", "/dev",
    ...systemRuntimePaths.flatMap((path) => ["--ro-bind", path, path]),
    "--dir", "/bin",
    "--ro-bind", "/usr/bin/dash", "/bin/sh",
    "--dir", sandboxDestinations.repository,
    "--ro-bind", root, sandboxDestinations.repository,
    "--dir", "/k0r",
    "--dir", sandboxDestinations.typescript,
    "--dir", dirname(runtime.destination),
    "--dir", sandboxDestinations.home,
    "--dir", sandboxDestinations.cache,
    "--dir", sandboxDestinations.tmp,
    "--dir", sandboxDestinations.registry,
    "--dir", sandboxDestinations.credentials,
    "--dir", sandboxDestinations.boulder,
    "--ro-bind", runtime.source, runtime.destination,
    ...(privateRoot === undefined ? [] : ["--ro-bind", privateRoot, privateRoot]),
    "--bind", roots.home, sandboxDestinations.home,
    "--bind", roots.cache, sandboxDestinations.cache,
    "--bind", roots.tmp, sandboxDestinations.tmp,
    "--bind", roots.registry, sandboxDestinations.registry,
    "--bind", roots.credentials, sandboxDestinations.credentials,
    ...(readOnlyBoulder ? ["--ro-bind", roots.boulder, sandboxDestinations.boulder] : ["--bind", roots.boulder, sandboxDestinations.boulder]),
    ...dependencies.binding.readOnlyDestinations.flatMap((path) => ["--ro-bind", dependencies.typescriptPackageRoot, path]),
    "--chdir", destination,
    ...safeEnvironmentNames.flatMap((name) => ["--setenv", name, name === "BOULDER_ROOT" ? destination : env[name] ?? ""]),
    "--",
    ...executableArgv
  ];
}

function observedCommand(result: CommandResult & { readonly stdout: string; readonly stderr?: string }): CommandResult {
  const { stdout: _stdout, stderr: _stderr, ...observed } = result;
  return observed;
}

async function exec(file: string, args: readonly string[], cwd: string, env: Record<string, string>): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> {
  const result = await runBoundedK0rProcess({
    argv: [file, ...args],
    cwd,
    environment: env,
    deadlineMs: 120_000,
    stdoutCapBytes: 8 * 1024 * 1024,
    stderrCapBytes: 8 * 1024 * 1024
  });
  if (result.timedOut || result.stdoutOverflow || result.stderrOverflow || result.orphanProcess) {
    throw new Error(`Bounded K0R command failed: ${result.stderr}`);
  }
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

function parseOracleReport(stdout: string): { readonly status: "pass" | "fail" } {
  try {
    const report = recordValue(JSON.parse(stdout), "isolated oracle report");
    if (report["status"] === "pass" || report["status"] === "fail") return { status: report["status"] };
  } catch {
    // The measured command result still records the failed oracle output hashes.
  }
  return { status: "fail" };
}

export async function writeK0rIsolatedRunReceipt(root: string, outputPath: string, content: string): Promise<void> {
  await writeK0rIsolatedRunReceiptInternal(root, outputPath, content, {});
}

export async function writeK0rIsolatedRunReceiptForTest(root: string, outputPath: string, content: string, testHooks: { readonly beforeRename?: (temporary: string) => Promise<void>; readonly rename?: (temporary: string, destination: string) => Promise<void> }): Promise<void> {
  await writeK0rIsolatedRunReceiptInternal(root, outputPath, content, testHooks);
}

async function writeK0rIsolatedRunReceiptInternal(root: string, outputPath: string, content: string, testHooks: { readonly beforeRename?: (temporary: string) => Promise<void>; readonly rename?: (temporary: string, destination: string) => Promise<void> }): Promise<void> {
  const rootReal = await verifiedContainedDirectory(root, root);
  const destination = resolve(outputPath);
  const expected = join(rootReal, isolatedRunReceiptPath);
  if (destination !== expected) throw new Error("Isolated-run receipt output path is fixed.");
  const parent = await verifiedContainedDirectory(rootReal, dirname(destination));
  if (await pathExists(destination)) await assertSingleLinkRegularFile(destination, "isolated-run receipt destination");
  const temporary = join(parent, `.isolated-run-receipt.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await assertSingleLinkRegularFile(temporary, "isolated-run receipt temporary");
    if (testHooks.beforeRename !== undefined) await testHooks.beforeRename(temporary);
    await assertSingleLinkRegularFile(temporary, "isolated-run receipt temporary");
    if (testHooks.rename === undefined) await rename(temporary, destination);
    else await testHooks.rename(temporary, destination);
    await assertSingleLinkRegularFile(destination, "isolated-run receipt destination");
    if (sha256Bytes(await readFile(destination)) !== sha256Text(content)) throw new Error("Installed isolated-run receipt differs from intended bytes.");
    const directory = await open(parent, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    if (handle !== undefined) await handle.close();
    await rm(temporary, { force: true });
  }
}

async function installPublicCandidateBytes(root: string, pendingPath: string, candidatePath: string, bytes: Uint8Array): Promise<void> {
  const rootReal = await verifiedContainedDirectory(root, root);
  const destination = join(rootReal, isolatedRunReceiptPath);
  const parent = await verifiedContainedDirectory(rootReal, dirname(destination));
  const qaRoot = await canonicalPrivateQaRoot(pendingPath);
  const journalPath = join(qaRoot, "protected/k0r-isolated-publication.json");
  const priorSnapshotPath = join(qaRoot, "protected/prior-k0r/isolated-run-receipt.json");
  const priorSnapshot = await readImmutablePrivateFile(priorSnapshotPath, isolatedPriorSnapshotMode).catch((error: unknown) => error instanceof Error && "code" in error && error.code === "ENOENT" ? undefined : Promise.reject(error));
  const priorExists = priorSnapshot !== undefined;
  const priorBytes = priorSnapshot;
  const liveExists = await pathExists(destination);
  if (liveExists !== priorExists || (liveExists && sha256Bytes(await readImmutablePrivateFile(destination, 0o600)) !== sha256Bytes(priorSnapshot!))) throw new Error("Live isolated receipt differs from protected prior authority.");
  const pendingChecksPath = join(qaRoot, "receipts/k0r-pending-checks.json");
  if (await pathExists(pendingChecksPath)) throw new Error("Pending-checks receipt already exists.");
  if (priorExists) await assertSingleLinkRegularFile(destination, "isolated-run receipt destination");
  const temporary = join(parent, `.isolated-run-receipt.${randomUUID()}.tmp`);
  try {
    await writeIsolatedPublicationJournal(journalPath, qaRoot, pendingPath, priorSnapshot, bytes);
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(new TextDecoder("utf-8", { fatal: true }).decode(bytes), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await assertSingleLinkRegularFile(temporary, "public candidate temporary");
    if (sha256Bytes(await readImmutablePrivateFile(temporary, 0o600)) !== sha256Bytes(bytes)) throw new Error("Public candidate temporary differs from candidate bytes.");
    await rename(temporary, destination);
    if (sha256Bytes(await readImmutablePrivateFile(destination, 0o600)) !== sha256Bytes(bytes)) throw new Error("Installed public receipt differs from candidate bytes.");
    const directory = await open(parent, "r");
    try { await directory.sync(); } finally { await directory.close(); }
    await writePendingChecksReceipt(qaRoot, pendingPath, bytes);
    await rm(candidatePath);
    await rm(journalPath);
  } catch (error) {
    await rm(pendingChecksPath, { force: true });
    if (priorBytes === undefined) await rm(destination, { force: true });
    else await restorePublicReceiptBytes(rootReal, priorBytes);
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeIsolatedPublicationJournal(path: string, qaRoot: string, pendingPath: string, priorBytes: Uint8Array | undefined, intendedBytes: Uint8Array): Promise<void> {
  const value = {
    schemaVersion: "boulder.k0r.isolated-publication-journal.v1",
    status: "mutating",
    pendingTransitionSha256: sha256Bytes(await readImmutablePrivateFile(pendingPath, 0o400)),
    prior: priorBytes === undefined ? { state: "absent", sha256: null } : { state: "present", sha256: sha256Bytes(priorBytes) },
    intendedSha256: sha256Bytes(intendedBytes),
  };
  const parent = await verifiedContainedDirectory(qaRoot, dirname(path));
  const handle = await open(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o400);
  try { await handle.writeFile(`${canonicalizeK0rJson(value)}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); }
  const directory = await open(parent, "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

async function recoverIsolatedPublication(root: string, qaRoot: string, pendingPath: string): Promise<void> {
  const journalPath = join(qaRoot, "protected/k0r-isolated-publication.json");
  if (!await pathExists(journalPath)) return;
  const journalBytes = await readImmutablePrivateFile(journalPath, 0o400);
  const journal = recordValue(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(journalBytes)), "isolated publication journal");
  exactKeys(journal, ["intendedSha256", "pendingTransitionSha256", "prior", "schemaVersion", "status"], "isolated publication journal");
  if (journal["schemaVersion"] !== "boulder.k0r.isolated-publication-journal.v1" || journal["status"] !== "mutating" || journal["pendingTransitionSha256"] !== sha256Bytes(await readImmutablePrivateFile(pendingPath, 0o400))) throw new Error("Isolated publication journal authority is invalid.");
  const prior = recordValue(journal["prior"], "isolated publication prior");
  exactKeys(prior, ["sha256", "state"], "isolated publication prior");
  if (!sha256Pattern.test(stringValue(journal["intendedSha256"], "isolated publication intended digest"))) throw new Error("Isolated publication intended digest is invalid.");
  const priorSnapshotPath = join(qaRoot, "protected/prior-k0r/isolated-run-receipt.json");
  if (prior["state"] === "absent" && prior["sha256"] === null) {
    if (await pathExists(priorSnapshotPath)) throw new Error("Protected prior snapshot contradicts absent publication authority.");
    await rm(join(root, isolatedRunReceiptPath), { force: true });
    const publicDirectory = await open(join(root, dirname(isolatedRunReceiptPath)), "r");
    try { await publicDirectory.sync(); } finally { await publicDirectory.close(); }
  }
  else {
    const priorBytes = await readImmutablePrivateFile(priorSnapshotPath, 0o400);
    if (prior["state"] !== "present" || prior["sha256"] !== sha256Bytes(priorBytes)) throw new Error("Isolated publication prior authority is invalid.");
    await restorePublicReceiptBytes(root, priorBytes);
  }
  await rm(join(qaRoot, "receipts/isolated-run.candidate.json"), { force: true });
  await rm(join(qaRoot, "receipts/k0r-pending-checks.json"), { force: true });
  await rm(journalPath);
  const protectedDirectory = await open(join(qaRoot, "protected"), "r");
  try { await protectedDirectory.sync(); } finally { await protectedDirectory.close(); }
}

async function writePendingChecksReceipt(qaRoot: string, pendingPath: string, isolatedBytes: Uint8Array): Promise<void> {
  const pendingSha256 = sha256Bytes(await readImmutablePrivateFile(pendingPath, 0o400));
  const projection = {
    schemaVersion: "boulder.k0r.pending-checks.v1",
    status: "pass_pending_exact_byte_review",
    pendingTransition: { path: "protected/k0r-transition.pending.json", sha256: pendingSha256 },
    isolatedRunReceipt: { path: isolatedRunReceiptPath, sha256: sha256Bytes(isolatedBytes) },
  };
  const receipt = { ...projection, receiptSha256: `sha256:${sha256CanonicalK0r(projection)}` };
  const content = `${canonicalizeK0rJson(receipt)}\n`;
  const destination = join(qaRoot, "receipts/k0r-pending-checks.json");
  const parent = await verifiedContainedDirectory(qaRoot, dirname(destination));
  const temporary = join(parent, `.k0r-pending-checks.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, "wx", 0o400);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    if (await readFile(temporary, "utf8") !== content) throw new Error("Pending-checks temporary differs from intended bytes.");
    await rename(temporary, destination);
    const state = await lstat(destination);
    if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1 || (state.mode & 0o777) !== 0o400 || await readFile(destination, "utf8") !== content) throw new Error("Pending-checks receipt installation failed.");
    const directory = await open(parent, "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } finally {
    await rm(temporary, { force: true });
  }
}

async function restorePublicReceiptBytes(root: string, bytes: Uint8Array): Promise<void> {
  const destination = join(root, isolatedRunReceiptPath);
  const parent = dirname(destination);
  const temporary = join(parent, `.isolated-run-rollback.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(new TextDecoder("utf-8", { fatal: true }).decode(bytes), "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    await rename(temporary, destination);
    if (sha256Bytes(await readImmutablePrivateFile(destination, 0o600)) !== sha256Bytes(bytes)) throw new Error("Unable to restore prior public isolated receipt.");
    const directory = await open(parent, "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writePrivateCandidate(pendingTransition: string, candidate: string, content: string): Promise<void> {
  const qaRoot = await realpath(resolve(dirname(pendingTransition), ".."));
  const parent = await verifiedContainedDirectory(qaRoot, dirname(resolve(candidate)));
  if (resolve(candidate) !== join(qaRoot, "receipts/isolated-run.candidate.json")) throw new Error("Private candidate path is not canonical.");
  const handle = await open(candidate, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  const state = await lstat(candidate);
  if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1 || (state.mode & 0o777) !== 0o600) throw new Error("Private candidate is not a mode-0600 single-link regular file.");
  const directory = await open(parent, "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

async function verifiedContainedDirectory(root: string, directory: string): Promise<string> {
  const rootState = await lstat(root);
  const directoryState = await lstat(directory);
  if (!rootState.isDirectory() || rootState.isSymbolicLink() || !directoryState.isDirectory() || directoryState.isSymbolicLink()) throw new Error("Isolated-run receipt requires contained real directories.");
  const rootReal = await realpath(root);
  const directoryReal = await realpath(directory);
  const path = relative(rootReal, directoryReal);
  if (path === ".." || path.startsWith("../") || resolve(rootReal, path) !== directoryReal) throw new Error("Isolated-run receipt output directory escapes the root.");
  return directoryReal;
}

async function canonicalPrivateQaRoot(pendingTransition: string): Promise<string> {
  const lexicalRoot = resolve(dirname(pendingTransition), "..");
  const physicalRoot = await realpath(lexicalRoot);
  if (physicalRoot !== lexicalRoot) throw new Error("Task 8 QA root is not canonical.");
  const state = await lstat(physicalRoot);
  if (!state.isDirectory() || state.isSymbolicLink() || (state.mode & 0o777) !== 0o700) throw new Error("Task 8 QA root is not a mode-0700 real directory.");
  return physicalRoot;
}

async function readImmutablePrivateFile(path: string, expectedMode: number): Promise<Uint8Array> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || (before.mode & 0o777) !== expectedMode || before.size > 8 * 1024 * 1024) throw new Error("Task 8 private file is not immutable.");
  const handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const current = await handle.stat();
    if (!current.isFile() || current.nlink !== 1 || (current.mode & 0o777) !== expectedMode || current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size) throw new Error("Task 8 private file identity changed.");
    const bytes = new Uint8Array(current.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) throw new Error("Task 8 private file ended early.");
      offset += bytesRead;
    }
    const after = await handle.stat();
    const live = await lstat(path);
    if (after.dev !== current.dev || after.ino !== current.ino || after.size !== current.size || after.nlink !== 1 || (after.mode & 0o777) !== expectedMode || live.dev !== current.dev || live.ino !== current.ino || (live.mode & 0o777) !== expectedMode) throw new Error("Task 8 private file changed while reading.");
    return bytes;
  } finally {
    await handle.close();
  }
}

async function assertSingleLinkRegularFile(path: string, label: string): Promise<void> {
  const state = await lstat(path);
  if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1) throw new Error(`${label} must be a single-link regular file.`);
}

async function pathExists(path: string): Promise<boolean> {
  return lstat(path).then(() => true).catch(() => false);
}

function validateDependencyBinding(binding: RecordValue): DependencyBinding {
  exactKeys(binding, ["bunLock", "readOnlyDestinations", "typescript"], "isolated dependency binding");
  if (JSON.stringify(stringArray(binding["readOnlyDestinations"], "isolated dependency destinations")) !== JSON.stringify([sandboxDestinations.typescript])) throw new Error("Isolated dependency binding policy is invalid.");
  const bunLock = recordValue(binding["bunLock"], "isolated Bun lock binding");
  exactKeys(bunLock, ["path", "sha256"], "isolated Bun lock binding");
  if (bunLock["path"] !== "bun.lock") throw new Error("Isolated Bun lock binding path is invalid.");
  const typescript = recordValue(binding["typescript"], "isolated TypeScript binding");
  exactKeys(typescript, ["artifactPath", "artifactSha256", "executable", "packageJsonPath", "packageJsonSha256", "packageName", "treeSha256", "version"], "isolated TypeScript binding");
  if (typescript["executable"] !== "tsc" || typescript["packageName"] !== "typescript" || typescript["packageJsonPath"] !== "package.json" || typescript["artifactPath"] !== "lib/tsc.js" || !satisfiesCaretVersion(stringValue(typescript["version"], "isolated TypeScript version"), "^6.0.3")) throw new Error("Isolated TypeScript binding is invalid.");
  return {
    bunLock: { path: "bun.lock", sha256: digestValue(bunLock["sha256"], "isolated Bun lock digest") },
    typescript: {
      executable: "tsc",
      packageName: "typescript",
      packageJsonPath: "package.json",
      packageJsonSha256: digestValue(typescript["packageJsonSha256"], "isolated TypeScript package digest"),
      version: typescript["version"] as string,
      artifactPath: "lib/tsc.js",
      artifactSha256: digestValue(typescript["artifactSha256"], "isolated TypeScript artifact digest"),
      treeSha256: digestValue(typescript["treeSha256"], "isolated TypeScript tree digest")
    },
    readOnlyDestinations: [sandboxDestinations.typescript]
  };
}
function validateSourceBundle(bundle: RecordValue): { readonly path: string; readonly sha256: string }[] {
  exactKeys(bundle, ["derivation", "files", "merkleSha256"], "isolated source bundle");
  const files = recordArray(bundle["files"], "isolated source files");
  if (files.length !== isolatedSourceBundlePaths.length) throw new Error("Isolated source bundle file count is invalid.");
  const normalized = files.map((file) => {
    exactKeys(file, ["path", "sha256"], "isolated source file");
    return { path: stringValue(file["path"], "isolated source path"), sha256: digestValue(file["sha256"], "isolated source digest") };
  });
  if (JSON.stringify(normalized.map((file) => file.path)) !== JSON.stringify([...isolatedSourceBundlePaths].sort())) throw new Error("Isolated source bundle paths are invalid.");
  if (JSON.stringify(normalized) !== JSON.stringify([...normalized].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0))) throw new Error("Isolated source bundle must be sorted.");
  if (bundle["merkleSha256"] !== merkleDigest(normalized)) throw new Error("Isolated source bundle Merkle digest is invalid.");
  return normalized;
}

function validateCommandResult(result: RecordValue, expectedArgv: readonly string[], oracleResult = false): void {
  const keys = ["argv", "cwd", "envNames", "exitCode", "stderrSha256", "stdoutSha256", ...(oracleResult ? ["reportSha256", "reportStatus"] : [])];
  exactKeys(result, keys, "isolated command result");
  if (JSON.stringify(stringArray(result["argv"], "command argv")) !== JSON.stringify(expectedArgv) || result["cwd"] !== "." || JSON.stringify(stringArray(result["envNames"], "command environment names")) !== JSON.stringify(safeEnvironmentNames) || !Number.isSafeInteger(result["exitCode"]) || !digestValue(result["stdoutSha256"], "command stdout") || !digestValue(result["stderrSha256"], "command stderr")) throw new Error("Isolated command result is invalid.");
}

function validateInventory(value: unknown, label: string): void {
  const entries = recordArray(value, label);
  const paths: string[] = [];
  for (const entry of entries) {
    exactKeys(entry, ["kind", "path", "sha256"], label);
    const path = stringValue(entry["path"], `${label} path`);
    if (path === "" || path.startsWith("/") || path.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error(`${label} has an unsafe path.`);
    if (entry["kind"] !== "directory" && entry["kind"] !== "file") throw new Error(`${label} has an invalid kind.`);
    digestValue(entry["sha256"], `${label} digest`);
    paths.push(path);
  }
  if (JSON.stringify(paths) !== JSON.stringify([...paths].sort())) throw new Error(`${label} must be sorted.`);
}

function merkleDigest(files: readonly { readonly path: string; readonly sha256: string }[]): string { return sha256Text(files.map((file) => `${file.path}\0${file.sha256}\n`).join("")); }
function overlayMerkleDigest(files: readonly { readonly path: string; readonly baseSha256: string | null; readonly overlaySha256: string }[]): string { return sha256Text(files.map((file) => `${file.path}\0${file.baseSha256 ?? "absent"}\0${file.overlaySha256}\n`).join("")); }
function inventoryEqual(left: readonly InventoryEntry[], right: readonly InventoryEntry[]): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function safeRelativePath(path: string): boolean { return path !== "" && !path.startsWith("/") && !path.split("/").some((part) => part === "" || part === "." || part === ".."); }
function sha256Bytes(value: Uint8Array): string { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function releaseTagForPackageVersion(version: string): typeof isolatedReleaseTag {
  if (!/^\d+\.\d+\.\d+$/.test(version) || `v${version}` !== isolatedReleaseTag) throw new Error(`Isolated package version must derive ${isolatedReleaseTag}.`);
  return isolatedReleaseTag;
}
function gitObjectId(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{40}$/.test(value); }
function sha256Text(value: string): string { return sha256Bytes(new TextEncoder().encode(value)); }
function parsePackDryRun(output: string, label: string): { readonly files: readonly string[]; readonly reportedTotal: number } {
  const files = new Set<string>();
  let reportedTotal = 0;
  for (const line of output.split("\n")) {
    const match = /^packed\s+\S+\s+(.+)$/.exec(line);
    if (match?.[1] !== undefined) files.add(match[1]);
    const total = /^Total files:\s*(\d+)$/.exec(line);
    if (total?.[1] !== undefined) reportedTotal = Number(total[1]);
  }
  if (files.size === 0 || reportedTotal === 0) throw new Error(`${label} does not contain a complete packed file inventory.`);
  return { files: [...files].sort(), reportedTotal };
}
function numberValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
  return value;
}
function exactKeys(value: RecordValue, keys: readonly string[], label: string): void { if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} has unexpected keys.`); }
function recordValue(value: unknown, label: string): RecordValue { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`); return value as RecordValue; }
function recordArray(value: unknown, label: string): RecordValue[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array.`); return value.map((item, index) => recordValue(item, `${label}[${index}]`)); }
function stringArray(value: unknown, label: string): string[] { if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`${label} must be a string array.`); return value as string[]; }
function stringArrayArray(value: unknown, label: string): string[][] { if (!Array.isArray(value) || !value.every((item) => Array.isArray(item) && item.length > 0 && item.every((part) => typeof part === "string"))) throw new Error(`${label} must be a non-empty string argv-array list.`); return value as string[][]; }
function stringValue(value: unknown, label: string): string { if (typeof value !== "string") throw new Error(`${label} must be a string.`); return value; }
function digestValue(value: unknown, label: string): string { const digest = stringValue(value, label); if (!sha256Pattern.test(digest)) throw new Error(`${label} must be a SHA-256 digest.`); return digest; }

if (Bun.argv[1] !== undefined && resolve(Bun.argv[1]) === resolve(join(import.meta.dir, "k0r-run-evidence.ts"))) {
  try {
    const command = parseK0rRunEvidenceArgv(Bun.argv.slice(2));
    if (command.mode === "isolated-oracle") console.log(JSON.stringify(await runK0rIndependentOracle({ root: repositoryRoot })));
    else {
      const receipt = await runK0rIsolatedEvidence({ pendingTransition: command.pendingTransition, privateCandidate: command.privateCandidate, privateWorkRoot: command.privateWorkRoot });
      console.log(JSON.stringify(receipt.status === "pass_pending_exact_byte_review"
        ? { path: isolatedRunReceiptPath, status: receipt.status, priorPublicEvidencePreserved: false }
        : { path: null, status: receipt.status, priorPublicEvidencePreserved: true }));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
