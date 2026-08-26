import { constants as fsConstants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { link, lstat, open, readFile, readdir, realpath, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  canonicalizeK0rJson,
  parseK0rJson,
  runBoundedK0rProcess,
  sha256CanonicalK0r,
  sha256K0rBytes,
  validateK0rRequestBoundApprovalProvenance,
  verifyK0rCanonicalPromotion,
  type K0rBindingOwnerSnapshot,
  type K0rPromotionArtifact,
} from "./k0r-canonical.js";
import { buildK0rStaticBaseline } from "./k0r-baseline-generator.js";
import { runK0rIndependentOracle } from "./k0r-independent-oracle.js";
import { trackedOverlayPaths } from "./k0r-issue-exit.js";

const repositoryRoot = resolve(import.meta.dir, "..");
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const topLevelExecutionTaskPattern = /^- \[x\] ((?:[1-9]|10)\. )/gmu;

export function normalizeK0rPlanExecutionState(plan: string): string {
  return plan.replace(topLevelExecutionTaskPattern, "- [ ] $1");
}

export function k0rPlanAuthoritySha256(plan: string): string {
  return prefixedDigest(encoder.encode(normalizeK0rPlanExecutionState(plan)));
}
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const schemaPattern = /^[a-z][a-z0-9.-]*\.v[0-9]+$/;
const pathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/;
const excludedUnrelatedPlannerPath = ["docs", "Boulder_ReFoundation_Initial_Planning_v0.1.zip"].join("/");
const syntheticDocFixturePath = ["docs", "a.md"].join("/");
const maxFileBytes = 32 * 1024 * 1024;
const noFollow = platformFlag(fsConstants.O_NOFOLLOW, "O_NOFOLLOW");
const directoryFlag = platformFlag((fsConstants as unknown as Readonly<Record<string, number | undefined>>).O_DIRECTORY, "O_DIRECTORY");
const emptyDigest = `sha256:${sha256K0rBytes(new Uint8Array())}`;
const canonicalizerBootstrapSourcePath = "drivers/k0r-canonical-bootstrap.ts";
const hostRunnerIdentity = {
  toolName: "bounded_process",
  contractVersion: "omo.bounded-process.v1",
  toolIdentitySha256: "sha256:2aec6647b0d4d9075b67b20179faa5b3a0deb6d3f4ac68c8784adcce0297852e",
  hostSourceSetSha256: "sha256:b93e4753f02fb48efa18926925888af9e6028aec3131d56ace15a052159bd439",
  hostArtifactSha256: "sha256:612543128817a38d0aeabd1e1d423e1644987ea871b1eed5ad4a784691e75a16",
  bunVersion: "1.3.14",
} as const;

const prohibitedAuthorities = ["K2", "K3", "K4", "commit", "push", "publish", "release", "root_guidance"] as const;
export const newOwnerPaths = [
  "test/k0r-canonical.ts",
  "test/k0r-issue-exit.ts",
  "test/k0r-reconcile-evidence.ts",
] as const;
const materializedPaths = [
  "evidence/k0r/acceptance-manifest.json",
  "evidence/k0r/baseline-transition.json",
  "evidence/k0r/independent-clean-source-reproduction.json",
  "evidence/k0r/isolation-manifest.json",
  "evidence/k0r/superseding-adr.md",
  "evidence/k0r/v1-public-contract-inventory.json",
] as const;
const scannerOwnerOutputs = [
  "evidence/k0r/acceptance-manifest.json",
  "evidence/k0r/isolation-manifest.json",
  "evidence/k0r/v1-public-contract-inventory.json",
] as const;
const evidenceContractPaths = [
  "evidence/k0r/acceptance-manifest.json",
  "evidence/k0r/approval-provenance.json",
  "evidence/k0r/baseline-transition.json",
  "evidence/k0r/evidence-manifest.json",
  "evidence/k0r/final-verification-bundle.json",
  "evidence/k0r/independent-clean-source-reproduction.json",
  "evidence/k0r/isolated-run-receipt.json",
  "evidence/k0r/isolation-manifest.json",
  "evidence/k0r/k0r-exit-receipt.json",
  "evidence/k0r/superseding-adr.md",
  "evidence/k0r/v1-public-contract-inventory.json",
] as const;
const approvedAdditionalSnapshots = [
  "protected/pre-edit-binding-owners/evidence/k0r/approval-provenance.json",
  "protected/pre-edit-binding-owners/evidence/k0r/evidence-manifest.json",
  "protected/pre-edit-binding-owners/evidence/k0r/isolated-run-receipt.json",
] as const;
const additionalSnapshotReceiptPath = "receipts/k0r-additional-binding-snapshot.json";
const preExistingOwnerPaths = [
  "evidence/k0r/acceptance-manifest.json",
  "evidence/k0r/isolation-manifest.json",
  "evidence/k0r/v1-public-contract-inventory.json",
  "test/k0r-baseline-generator.ts",
  "test/k0r-capture-evidence.ts",
  "test/k0r-evidence-contract.test.ts",
  "test/k0r-independent-oracle.test.ts",
  "test/k0r-independent-oracle.ts",
  "test/k0r-run-evidence.ts",
] as const;
const preExistingOwnerSourceModes = new Map<string, number>(preExistingOwnerPaths.map((path) => [path, path.startsWith("evidence/") ? 0o600 : 0o644]));

export type K0rFocusedGateStage = "pre-materialization" | "post-materialization" | "post-isolated-run";
export interface K0rFocusedGateBinding {
  readonly path: string;
  readonly sha256: string;
}
export interface K0rFocusedGateExpectedBindings {
  readonly scopeAuthorizationSha256: string;
  readonly planSha256: string;
  readonly headCommit: string;
  readonly headTree: string;
  readonly testFiles: readonly K0rFocusedGateBinding[];
  readonly runtimeSources: readonly K0rFocusedGateBinding[];
  readonly command: {
    readonly argv: readonly string[];
    readonly cwd: ".";
    readonly exitCode: number;
    readonly timedOut: boolean;
    readonly crashed: boolean;
    readonly stdoutSha256: string;
    readonly stderrSha256: string;
  };
}
export interface K0rFocusedGatePolicy {
  readonly stage: K0rFocusedGateStage;
  readonly status: "fail" | "pass";
  readonly counts: {
    readonly discoveredTests: number | null;
    readonly passedTests: number | null;
    readonly failedTests: number;
    readonly assertions: number | null;
    readonly skippedTests: number;
  };
  readonly failures: readonly {
    readonly id: string;
    readonly diagnosticSha256: string;
  }[];
}

const focusedGateTestPaths = [
  "test/k0r-baseline-generator.test.ts",
  "test/k0r-evidence-contract.test.ts",
  "test/k0r-independent-oracle.test.ts",
] as const;
const focusedGateRuntimeSourcePaths = [
  "test/k0r-baseline-generator.ts",
  "test/k0r-canonical.ts",
  "test/k0r-capture-evidence.ts",
  "test/k0r-independent-oracle.ts",
  "test/k0r-issue-exit.ts",
  "test/k0r-reconcile-evidence.ts",
  "test/k0r-run-evidence.ts",
] as const;
const focusedGateArgv = ["bun", "test", ...focusedGateTestPaths] as const;
export const k0rFocusedGateReceiptPaths = {
  "pre-materialization": "receipts/k0r-focused-gate.pre-materialization.json",
  "post-materialization": "receipts/k0r-focused-gate.post-materialization.json",
  "post-isolated-run": "receipts/k0r-focused-gate.post-isolated-run.json",
} as const;

const focusedGateMeasurementsFinalized = true;
const focusedGatePlaceholderCounts = {
  discoveredTests: 75,
  passedTests: 67,
  failedTests: 8,
  assertions: 741,
  skippedTests: 0,
} as const;
const focusedGateFailureIds = [
  "K0R evidence contract > declares the generator and observed command-result schema without shell interpolation",
  "K0R evidence contract > rejects forged approval provenance receipts before capture",
  "K0R evidence contract > binds the complete-byte report and rejects forged reproduction, alternate-root source, and semantic report evidence",
  "K0R evidence contract > rejects changed and deleted declared prior K0/K1 inventory entries",
  "K0R evidence contract > rejects root, oracle, directory, pending approval, and ignored-path forgeries",
  "K0R evidence contract > atomically replaces an existing evidence manifest and cleans up after rename failure",
  "K0R isolated-run receipt > enforces fixture-local isolation and declares the pre-Task-8 isolated-run contract",
  "K0R isolated-run receipt > validates the currently installed isolated-run receipt and rejects forgeries",
] as const;
const focusedGatePlaceholderDiagnostics = [
  "sha256:ff6f7cb0d69e6cdd6efff3e97b9fd79aa34dffe6b3d2aea5f7e2abc1fed1db26",
  "sha256:b33617df3f2ea3d04f2c99c1e027c3c1f8d966534d5b00a11ee53e0b5aa56dea",
  "sha256:8c0e5c2c492810cee31aaa13b618ee5dff9dbeac1340d0df41dcf7803c9d90fb",
  "sha256:c9a7d82eacf9153d85fa28ffc11d61eb8dd6f6fb096957279dd8f8b20e5eefa4",
  "sha256:5cdffda4e14f6571be94487d5042ba09c36f7bb6a09fe2b00ee2661eb1b532ed",
  "sha256:f455449f3a8a831c5695e0c2b91a7d0c71819e77a0b057282701281930ed6467",
  "sha256:cec5dfa0184c43a167d9b01e1e035f2f3e912787e19ba0c28fbee70e5fecf7ce",
  "sha256:296782d87167b5cbe5068ba81f934ce147513f53b3c8d8dc22aebefc1ded11fe",
] as const;

export const k0rFocusedGatePolicies = [
  {
    stage: "pre-materialization",
    status: "fail",
    counts: focusedGatePlaceholderCounts,
    failures: focusedGateFailureIds.map((id, index) => ({
      id,
      diagnosticSha256: focusedGatePlaceholderDiagnostics[index]!,
    })),
  },
  {
    stage: "post-materialization",
    status: "fail",
    counts: {
      discoveredTests: 75,
      passedTests: 70,
      failedTests: 5,
      assertions: 763,
      skippedTests: 0,
    },
    failures: [
      { id: focusedGateFailureIds[2], diagnosticSha256: "sha256:488acd70efcaefeb26b4912f1b52243dd5818b1bcfb9e24a2882e9bb714495b3" },
      { id: focusedGateFailureIds[3], diagnosticSha256: "sha256:d9d7372f4750fd428f1f7c370a1123b93d7dce735244c4b695312dee78870000" },
      { id: focusedGateFailureIds[4], diagnosticSha256: "sha256:d75fcd19466eb465d60583bbd0056e97c02fc6af05079e5c95966a8f76d65c37" },
      { id: focusedGateFailureIds[5], diagnosticSha256: "sha256:dcbb20a89b7f318da357a22d22e90e10c2993f669806a41d65d88b54076cf1c6" },
      { id: focusedGateFailureIds[7], diagnosticSha256: focusedGatePlaceholderDiagnostics[7] },
    ],
  },
  {
    stage: "post-isolated-run",
    status: "pass",
    counts: {
      discoveredTests: 75,
      passedTests: 75,
      failedTests: 0,
      assertions: 854,
      skippedTests: 0,
    },
    failures: [],
  },
] satisfies readonly K0rFocusedGatePolicy[];

function focusedGatePolicy(stage: unknown): K0rFocusedGatePolicy {
  const value = text(stage, "focused gate stage");
  const policy = k0rFocusedGatePolicies.find((candidate) => candidate.stage === value);
  if (policy === undefined) throw new Error("Focused gate stage is invalid.");
  return policy;
}

function focusedGateBindings(
  value: unknown,
  expected: readonly K0rFocusedGateBinding[],
  paths: readonly string[],
  label: string,
): void {
  const bindings = records(value, label);
  if (bindings.length !== paths.length || expected.length !== paths.length) throw new Error(`${label} count is invalid.`);
  bindings.forEach((binding, index) => {
    exactKeys(binding, ["path", "sha256"], `${label}[${index}]`);
    const path = text(binding.path, `${label}[${index}] path`);
    const sha256 = digest(binding.sha256, `${label}[${index}] digest`);
    if (path !== paths[index] || expected[index]?.path !== path || expected[index]?.sha256 !== sha256) {
      throw new Error(`${label} differs from the focused gate binding.`);
    }
  });
}

function focusedGateCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer.`);
  return value;
}

export function validateK0rFocusedGateReceiptForTest(
  receipt: unknown,
  expected: K0rFocusedGateExpectedBindings,
): void {
  const value = record(receipt, "focused gate receipt");
  exactKeys(value, [
    "schemaVersion", "stage", "status", "scopeAuthorizationSha256", "planSha256",
    "headCommit", "headTree", "testFiles", "runtimeSources", "command", "counts",
    "failures", "receiptSha256",
  ], "focused gate receipt");
  if (value.schemaVersion !== "boulder.k0r.focused-gate.v1") throw new Error("Focused gate schema is invalid.");
  const policy = focusedGatePolicy(value.stage);
  if (value.status !== policy.status) throw new Error("Focused gate status differs from policy.");
  if (digest(value.scopeAuthorizationSha256, "focused gate scope digest") !== expected.scopeAuthorizationSha256) throw new Error("Focused gate scope authorization differs.");
  if (digest(value.planSha256, "focused gate plan digest") !== expected.planSha256) throw new Error("Focused gate plan differs.");
  const headCommit = text(value.headCommit, "focused gate HEAD");
  const headTree = text(value.headTree, "focused gate tree");
  if (!/^[0-9a-f]{40,64}$/.test(headCommit) || headCommit !== expected.headCommit) throw new Error("Focused gate HEAD differs.");
  if (!/^[0-9a-f]{40,64}$/.test(headTree) || headTree !== expected.headTree) throw new Error("Focused gate tree differs.");
  focusedGateBindings(value.testFiles, expected.testFiles, focusedGateTestPaths, "focused gate test files");
  focusedGateBindings(value.runtimeSources, expected.runtimeSources, focusedGateRuntimeSourcePaths, "focused gate runtime sources");

  const command = record(value.command, "focused gate command");
  exactKeys(command, ["argv", "cwd", "exitCode", "timedOut", "crashed", "stdoutSha256", "stderrSha256"], "focused gate command");
  const argv = strings(command.argv, "focused gate argv");
  if (!equalStrings(argv, focusedGateArgv) || !equalStrings(argv, expected.command.argv)) throw new Error("Focused gate argv differs.");
  if (command.cwd !== "." || command.cwd !== expected.command.cwd) throw new Error("Focused gate cwd differs.");
  const exitCode = focusedGateCount(command.exitCode, "focused gate exit code");
  if (exitCode !== expected.command.exitCode || exitCode !== (policy.status === "pass" ? 0 : 1)) throw new Error("Focused gate exit code differs.");
  if (command.timedOut !== false || command.timedOut !== expected.command.timedOut) throw new Error("Focused gate timeout state is invalid.");
  if (command.crashed !== false || command.crashed !== expected.command.crashed) throw new Error("Focused gate crash state is invalid.");
  if (digest(command.stdoutSha256, "focused gate stdout digest") !== expected.command.stdoutSha256) throw new Error("Focused gate stdout differs.");
  if (digest(command.stderrSha256, "focused gate stderr digest") !== expected.command.stderrSha256) throw new Error("Focused gate stderr differs.");

  const counts = record(value.counts, "focused gate counts");
  exactKeys(counts, ["discoveredTests", "passedTests", "failedTests", "assertions", "skippedTests"], "focused gate counts");
  const actualCounts = {
    discoveredTests: focusedGateCount(counts.discoveredTests, "focused gate discovered tests"),
    passedTests: focusedGateCount(counts.passedTests, "focused gate passed tests"),
    failedTests: focusedGateCount(counts.failedTests, "focused gate failed tests"),
    assertions: focusedGateCount(counts.assertions, "focused gate assertions"),
    skippedTests: focusedGateCount(counts.skippedTests, "focused gate skipped tests"),
  };
  if (actualCounts.discoveredTests !== actualCounts.passedTests + actualCounts.failedTests + actualCounts.skippedTests) throw new Error("Focused gate counts do not close.");
  if (policy.counts.discoveredTests !== null && actualCounts.discoveredTests !== policy.counts.discoveredTests) throw new Error("Focused gate discovered count differs from policy.");
  if (policy.counts.passedTests !== null && actualCounts.passedTests !== policy.counts.passedTests) throw new Error("Focused gate pass count differs from policy.");
  if (actualCounts.failedTests !== policy.counts.failedTests || actualCounts.skippedTests !== policy.counts.skippedTests) throw new Error("Focused gate failure or skip count differs from policy.");
  if (policy.counts.assertions !== null && actualCounts.assertions !== policy.counts.assertions) throw new Error("Focused gate assertion count differs from policy.");

  const failures = records(value.failures, "focused gate failures");
  if (failures.length !== actualCounts.failedTests || failures.length !== policy.failures.length) throw new Error("Focused gate failure count differs.");
  if ((policy.status === "pass") !== (failures.length === 0)) throw new Error("Focused gate pass state differs from failures.");
  failures.forEach((failure, index) => {
    exactKeys(failure, ["id", "diagnosticSha256"], `focused gate failures[${index}]`);
    const expectedFailure = policy.failures[index];
    if (text(failure.id, `focused gate failures[${index}] id`) !== expectedFailure?.id
      || digest(failure.diagnosticSha256, `focused gate failures[${index}] diagnostic`) !== expectedFailure?.diagnosticSha256) {
      throw new Error("Focused gate failure identity, order, or diagnostic differs from policy.");
    }
  });
  digest(value.receiptSha256, "focused gate self digest");
  const projection = { ...value };
  delete projection.receiptSha256;
  if (value.receiptSha256 !== canonicalDigest(projection)) throw new Error("Focused gate receipt self digest is invalid.");
}

export interface K0rTrackedFreezeOptions {
  readonly scopeAuthorization: string;
  readonly scopeProvenance: string;
  readonly plan: string;
  readonly focusedGateReceipt: string;
  readonly output: string;
}
export interface K0rScanBindingsOptions {
  readonly stage: "pre-edit-snapshot" | "final-owners";
  readonly ownerRoot?: string;
  readonly ownerSnapshot?: string;
  readonly preScan?: string;
  readonly trackedFreeze?: string;
  readonly materializationReceipt?: string;
  readonly plan?: string;
  readonly focusedGateReceipt?: string;
  readonly typescriptBinding: string;
  readonly typescriptRoot: string;
  readonly typescriptArtifactSha256: string;
  readonly typescriptTreeSha256: string;
  readonly output: string;
}
export interface K0rMaterializeEvidenceOptions {
  readonly scopeAuthorization: string;
  readonly scopeProvenance: string;
  readonly preScan: string;
  readonly priorApproval: string;
  readonly priorBaseline: string;
  readonly priorSnapshot: string;
  readonly priorExitState: string;
  readonly trackedFreeze: string;
  readonly materializationOutput: string;
}
export interface K0rFinalizePendingTransitionOptions {
  readonly scopeAuthorization: string;
  readonly scopeProvenance: string;
  readonly plan: string;
  readonly focusedGateReceipt: string;
  readonly materializationReceipt: string;
  readonly bindingScanReceipt: string;
  readonly priorApproval: string;
  readonly priorBaseline: string;
  readonly priorSnapshot: string;
  readonly priorExitState: string;
  readonly trackedFreeze: string;
  readonly typescriptBinding: string;
  readonly typescriptRoot: string;
  readonly typescriptArtifactSha256: string;
  readonly typescriptTreeSha256: string;
  readonly pendingTransitionOutput: string;
}

type JsonRecord = Record<string, unknown>;
type FileValue = { readonly path: string; readonly bytes: Uint8Array; readonly sha256: string; readonly value: JsonRecord };
type FreezeEntry = { readonly path: string; readonly mode: "100644"; readonly size: number; readonly sha256: string };
type BindingKind = "digest" | "path" | "schema-version";
type BindingState = "present" | "runtime-contract" | "evidence-contract" | "historical-missing";
type BindingDerivation = "json-pointer" | "ts-ast-literal";
type Literal = { readonly ownerPath: string; readonly bindingKind: BindingKind; readonly bindingPath: string; readonly targetState: BindingState; readonly oldSha256: string; readonly derivation: BindingDerivation; readonly value: string; readonly start: number; readonly end: number };
type SchemaEntry = { readonly ownerPath: string; readonly locationKind: "json-pointer" | "ts-byte-range"; readonly location: string; readonly schemaVersion: string; readonly sha256: string };
type ScannedOwner = { readonly ownerPath: string; readonly bytes: Uint8Array };

export interface K0rReconciliationOwnerBytes {
  readonly ownerPath: string;
  readonly preBytes?: string | Uint8Array;
  readonly finalBytes?: string | Uint8Array;
}

export interface K0rByteEdit {
  readonly kind: "equal" | "delete" | "insert";
  readonly byte: number;
  readonly preOffset: number | null;
  readonly finalOffset: number | null;
}

function platformFlag(value: number | undefined, label: string): number {
  if (value === undefined) throw new Error(`K0R reconciliation requires ${label}.`);
  return value;
}
function prefixedDigest(bytes: string | Uint8Array): string { return `sha256:${sha256K0rBytes(bytes)}`; }
function canonicalDigest(value: unknown): string { return `sha256:${sha256CanonicalK0r(value)}`; }
function compareUtf8(left: string, right: string): number {
  const a = encoder.encode(left.normalize("NFC"));
  const b = encoder.encode(right.normalize("NFC"));
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0);
  return a.length - b.length;
}
function equalStrings(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function record(value: unknown, label: string): JsonRecord { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`); return value as JsonRecord; }
function records(value: unknown, label: string): JsonRecord[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array.`); return value.map((item, index) => record(item, `${label}[${index}]`)); }
function strings(value: unknown, label: string): string[] { if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`${label} must be a string array.`); return value; }
function text(value: unknown, label: string): string { if (typeof value !== "string" || value === "") throw new Error(`${label} must be a non-empty string.`); return value; }
function digest(value: unknown, label: string): string { const result = text(value, label); if (!digestPattern.test(result)) throw new Error(`${label} must be a prefixed lowercase SHA-256 digest.`); return result; }
function exactKeys(value: JsonRecord, expected: readonly string[], label: string): void { if (!equalStrings(Object.keys(value).sort(), [...expected].sort())) throw new Error(`${label} has unknown or missing fields.`); }
function isEnoent(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"; }
function assertContained(root: string, path: string, label: string): void { const relation = relative(root, path); if (relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))) return; throw new Error(`${label} escapes its authorized root.`); }
function privateRootFor(path: string): string { const absolute = resolve(path); for (const segment of ["/authorizations/", "/receipts/", "/protected/"]) { const index = absolute.lastIndexOf(segment); if (index >= 0) return absolute.slice(0, index); } throw new Error("Private artifact path does not identify its root."); }
function generator(): JsonRecord { return { argv: Bun.argv.slice(0), cwd: repositoryRoot, stdoutSha256: emptyDigest, stderrSha256: emptyDigest }; }

async function readRegular(path: string, cap = maxFileBytes): Promise<Uint8Array> {
  const absolute = resolve(path);
  const before = await lstat(absolute);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > cap) throw new Error(`Not a bounded no-follow single-link regular file: ${absolute}.`);
  const handle = await open(absolute, fsConstants.O_RDONLY | noFollow);
  try {
    const current = await handle.stat();
    if (!current.isFile() || current.nlink !== 1 || current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size) throw new Error(`Input identity changed while opening: ${absolute}.`);
    const bytes = new Uint8Array(current.size);
    let offset = 0;
    while (offset < bytes.length) { const result = await handle.read(bytes, offset, bytes.length - offset, offset); if (result.bytesRead === 0) throw new Error(`Input ended early: ${absolute}.`); offset += result.bytesRead; }
    if ((await handle.read(new Uint8Array(1), 0, 1, offset)).bytesRead !== 0) throw new Error(`Input grew while reading: ${absolute}.`);
    const after = await handle.stat();
    const live = await lstat(absolute);
    if (after.dev !== current.dev || after.ino !== current.ino || after.size !== current.size || after.nlink !== 1 || live.dev !== current.dev || live.ino !== current.ino) throw new Error(`Input changed while reading: ${absolute}.`);
    return bytes;
  } finally { await handle.close(); }
}
async function readJson(path: string): Promise<FileValue> {
  const bytes = await readRegular(path, 8 * 1024 * 1024);
  let source: string;
  try { source = decoder.decode(bytes); } catch { throw new Error(`${path} is not UTF-8.`); }
  const parsed = parseK0rJson(source.trimEnd());
  return { path: resolve(path), bytes, sha256: prefixedDigest(bytes), value: record(parsed, path) };
}
async function syncDirectory(path: string): Promise<void> { const handle = await open(path, fsConstants.O_RDONLY | directoryFlag | noFollow); try { await handle.sync(); } finally { await handle.close(); } }

async function exclusiveCanonical(path: string, allowedRoot: string, value: unknown, mode = 0o400): Promise<void> {
  const root = await realpath(allowedRoot);
  const destination = resolve(path);
  assertContained(root, destination, "output");
  const parent = await realpath(dirname(destination));
  assertContained(root, parent, "output parent");
  if (await lstat(destination).catch((error: unknown) => isEnoent(error) ? undefined : Promise.reject(error)) !== undefined) throw new Error(`Output already exists: ${destination}.`);
  const temporary = join(parent, `.${destination.split("/").pop() ?? "k0r"}.${randomUUID()}.tmp`);
  const handle = await open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow, mode);
  try {
    await handle.writeFile(`${canonicalizeK0rJson(value)}\n`, "utf8"); await handle.sync(); await handle.close();
    await link(temporary, destination); await unlink(temporary); await syncDirectory(parent);
    const output = await lstat(destination); if (!output.isFile() || output.isSymbolicLink() || output.nlink !== 1 || (output.mode & 0o777) !== mode) throw new Error("Exclusive output verification failed.");
  } catch (error) { await handle.close().catch(() => undefined); await unlink(temporary).catch(() => undefined); await unlink(destination).catch(() => undefined); throw error; }
}
async function replaceMaterializedFile(root: string, path: string, value: string): Promise<void> {
  const destination = resolve(root, path); assertContained(root, destination, "evidence output");
  if (!materializedPaths.includes(path as typeof materializedPaths[number])) throw new Error(`Unauthorized materialization output: ${path}.`);
  const parent = await realpath(dirname(destination));
  assertContained(await realpath(root), parent, "evidence output parent");
  const existing = await lstat(destination).catch((error: unknown) => isEnoent(error) ? undefined : Promise.reject(error));
  if (existing !== undefined && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) throw new Error(`Unsafe existing evidence output: ${path}.`);
  const temporary = join(parent, `.${path.split("/").pop() ?? "evidence"}.${randomUUID()}.tmp`);
  const handle = await open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow, 0o644);
  try { await handle.writeFile(value, "utf8"); await handle.sync(); await handle.close(); await rename(temporary, destination); await syncDirectory(parent); }
  catch (error) { await handle.close().catch(() => undefined); await unlink(temporary).catch(() => undefined); throw error; }
}
async function replaceRepositoryFile(path: string, value: string): Promise<void> { await replaceMaterializedFile(repositoryRoot, path, value); }

async function restoreMaterializedFiles(before: ReadonlyMap<string, Uint8Array | null>, root = repositoryRoot): Promise<void> {
  for (const path of [...materializedPaths].reverse()) {
    const bytes = before.get(path);
    if (bytes === undefined) throw new Error("Materialization rollback snapshot is incomplete.");
    const destination = resolve(root, path);
    const state = await lstat(destination).catch((error: unknown) => isEnoent(error) ? undefined : Promise.reject(error));
    if (state !== undefined && (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1)) throw new Error(`Materialization rollback found an unsafe output: ${path}.`);
    if (bytes === null) await unlink(destination).catch((error: unknown) => { if (!isEnoent(error)) throw error; });
    else await replaceMaterializedFile(root, path, decoder.decode(bytes));
  }
}

type MaterializationJournal = {
  readonly schemaVersion: "boulder.k0r.materialization-journal.v1";
  readonly status: "mutating";
  readonly authority: {
    readonly scopeSha256: string;
    readonly trackedFreezeSha256: string;
    readonly ownerSnapshotSha256: string;
  };
  readonly entries: readonly {
    readonly path: string;
    readonly priorState: "absent" | "present";
    readonly priorSha256: string | null;
    readonly priorHex: string | null;
  }[];
};

export function assertK0rMaterializationJournalAuthority(
  authority: JsonRecord,
  expected: { readonly scopeSha256: string; readonly trackedFreezeSha256: string; readonly ownerSnapshotSha256: string },
): void {
  exactKeys(authority, ["ownerSnapshotSha256", "scopeSha256", "trackedFreezeSha256"], "materialization journal authority");
  if (
    authority.scopeSha256 !== expected.scopeSha256
    || authority.trackedFreezeSha256 !== expected.trackedFreezeSha256
    || authority.ownerSnapshotSha256 !== expected.ownerSnapshotSha256
  ) throw new Error("Materialization journal is not bound to protected authority.");
}

function materializationJournalPath(privateRoot: string): string {
  return join(privateRoot, "protected/k0r-materialization-transaction.json");
}

async function writeMaterializationJournal(
  privateRoot: string,
  before: ReadonlyMap<string, Uint8Array | null>,
  authority: { readonly scope: FileValue; readonly freeze: FileValue; readonly snapshot: FileValue },
): Promise<void> {
  const path = materializationJournalPath(privateRoot);
  await realpath(dirname(path));
  const entries = materializedPaths.map((outputPath) => {
    const bytes = before.get(outputPath);
    if (bytes === undefined) throw new Error("Materialization rollback snapshot is incomplete.");
    return { path: outputPath, priorState: bytes === null ? "absent" as const : "present" as const, priorSha256: bytes === null ? null : prefixedDigest(bytes), priorHex: bytes === null ? null : bytesHex(bytes) };
  });
  await exclusiveCanonical(path, privateRoot, {
    schemaVersion: "boulder.k0r.materialization-journal.v1",
    status: "mutating",
    authority: {
      scopeSha256: authority.scope.sha256,
      trackedFreezeSha256: authority.freeze.sha256,
      ownerSnapshotSha256: authority.snapshot.sha256,
    },
    entries,
  });
}

export async function recoverK0rMaterialization(privateRoot: string, targetRoot = repositoryRoot): Promise<void> {
  const root = await realpath(privateRoot);
  const path = materializationJournalPath(root);
  const state = await lstat(path).catch((error: unknown) => isEnoent(error) ? undefined : Promise.reject(error));
  if (state === undefined) return;
  await verifyK0rPromotion(root);
  const [scope, freeze, snapshot] = await Promise.all([
    readJson(join(root, "authorizations/k0r-a.json")),
    readJson(join(root, "protected/tracked-freeze.json")),
    readJson(join(root, "receipts/k0r-binding-snapshot.json")),
  ]);
  const file = await readJson(path);
  exactKeys(file.value, ["authority", "entries", "schemaVersion", "status"], "materialization journal");
  if (file.value.schemaVersion !== "boulder.k0r.materialization-journal.v1" || file.value.status !== "mutating") throw new Error("Materialization journal identity is invalid.");
  const authority = record(file.value.authority, "materialization journal authority");
  assertK0rMaterializationJournalAuthority(authority, { scopeSha256: scope.sha256, trackedFreezeSha256: freeze.sha256, ownerSnapshotSha256: snapshot.sha256 });
  const entries = records(file.value.entries, "materialization journal entries");
  if (entries.length !== materializedPaths.length) throw new Error("Materialization journal path set is invalid.");
  const before = new Map<string, Uint8Array | null>();
  for (const [index, entry] of entries.entries()) {
    exactKeys(entry, ["path", "priorHex", "priorSha256", "priorState"], "materialization journal entry");
    const outputPath = text(entry.path, "journal output path");
    if (outputPath !== materializedPaths[index]) throw new Error("Materialization journal path set is invalid.");
    if (entry.priorState === "absent" && entry.priorHex === null && entry.priorSha256 === null) before.set(outputPath, null);
    else {
      if (entry.priorState !== "present" || typeof entry.priorHex !== "string" || typeof entry.priorSha256 !== "string") throw new Error("Materialization journal prior state is invalid.");
      const bytes = hexBytes(entry.priorHex);
      if (prefixedDigest(bytes) !== entry.priorSha256) throw new Error("Materialization journal prior bytes are invalid.");
      before.set(outputPath, bytes);
    }
  }
  await restoreMaterializedFiles(before, targetRoot);
  await unlink(path);
  await syncDirectory(dirname(path));
}

function hexBytes(value: string): Uint8Array { if (value.length % 2 !== 0 || !/^[0-9a-f]*$/.test(value)) throw new Error("Invalid hexadecimal digest bytes."); const result = new Uint8Array(value.length / 2); for (let index = 0; index < result.length; index += 1) result[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16); return result; }
function bytesHex(value: Uint8Array): string { return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function rawHash(parts: readonly Uint8Array[]): Uint8Array { const hash = createHash("sha256"); for (const part of parts) hash.update(part); return hexBytes(hash.digest("hex")); }
function merkle(entries: readonly { readonly path: string; readonly sha256: string }[]): string {
  if (entries.length === 0) throw new Error("Merkle input must not be empty.");
  let level = entries.map((entry) => rawHash([Uint8Array.of(0), encoder.encode(entry.path), Uint8Array.of(0), hexBytes(entry.sha256.slice(7))]));
  while (level.length > 1) { const next: Uint8Array[] = []; for (let index = 0; index < level.length; index += 2) { const left = level[index]; if (left === undefined) throw new Error("Merkle level is malformed."); next.push(rawHash([Uint8Array.of(1), left, level[index + 1] ?? left])); } level = next; }
  return `sha256:${bytesHex(level[0] ?? new Uint8Array())}`;
}

async function bounded(argv: readonly string[], cap = 4096): Promise<string> {
  const result = await runBoundedK0rProcess({ argv, cwd: repositoryRoot, environment: { GIT_CONFIG_NOSYSTEM: "1", GIT_NO_REPLACE_OBJECTS: "1", HOME: "/dev/null", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: "/usr/bin:/bin" }, deadlineMs: 30_000, stdoutCapBytes: cap, stderrCapBytes: 64 * 1024 });
  if (result.exitCode !== 0 || result.signal !== null || result.timedOut || result.stdoutOverflow || result.stderrOverflow || result.orphanProcess || result.stderr !== "") throw new Error(`Bounded command failed: ${argv.join(" ")}.`);
  return result.stdout;
}
async function boundedRaw(argv: readonly string[], cap: number): Promise<Uint8Array> {
  const result = await runBoundedK0rProcess({ argv, cwd: repositoryRoot, environment: { GIT_CONFIG_NOSYSTEM: "1", GIT_NO_REPLACE_OBJECTS: "1", HOME: "/dev/null", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: "/usr/bin:/bin" }, deadlineMs: 30_000, stdoutCapBytes: cap, stderrCapBytes: 64 * 1024 });
  if (result.exitCode !== 0 || result.signal !== null || result.timedOut || result.stdoutOverflow || result.stderrOverflow || result.orphanProcess || result.stderrBytes.byteLength !== 0) throw new Error(`Bounded raw command failed: ${argv.join(" ")}.`);
  return result.stdoutBytes;
}
function oneLine(value: string, label: string): string { if (!value.endsWith("\n") || value.endsWith("\n\n")) throw new Error(`${label} must end in exactly one LF.`); const result = value.slice(0, -1); if (result === "" || /\s/.test(result)) throw new Error(`${label} is malformed.`); return result; }
async function gitIdentity(): Promise<{ readonly headCommit: string; readonly headTree: string }> {
  const format = oneLine(await bounded(["git", "rev-parse", "--show-object-format"]), "Git object format");
  if (format !== "sha1" && format !== "sha256") throw new Error("Unsupported Git object format.");
  const length = format === "sha1" ? 40 : 64;
  const headCommit = oneLine(await bounded(["git", "rev-parse", "--verify", "HEAD^{commit}"]), "HEAD");
  if (!new RegExp(`^[0-9a-f]{${length}}$`).test(headCommit) || oneLine(await bounded(["git", "cat-file", "-t", headCommit]), "commit type") !== "commit") throw new Error("HEAD identity is invalid.");
  const headTree = oneLine(await bounded(["git", "rev-parse", "--verify", `${headCommit}^{tree}`]), "HEAD tree");
  if (!new RegExp(`^[0-9a-f]{${length}}$`).test(headTree) || oneLine(await bounded(["git", "cat-file", "-t", headTree]), "tree type") !== "tree") throw new Error("HEAD tree identity is invalid.");
  return { headCommit, headTree };
}

export function validateK0rScopeAuthorityProvenance(payload: JsonRecord, provenance: JsonRecord, payloadRawSha256: string) {
  return validateK0rRequestBoundApprovalProvenance(provenance, {
    requestPayload: payload,
    requestPayloadRawSha256: payloadRawSha256,
    requestPayloadJcsSha256: canonicalDigest(payload),
  });
}

function validateScope(scope: FileValue, provenance: FileValue, planBytes?: Uint8Array): readonly string[] {
  exactKeys(scope.value, ["authorizedScope", "evidenceOutputPaths", "planSha256", "priorEvidenceInventorySha256", "priorExitStateSha256", "prohibitedAuthorities", "replacementHeadCommit", "replacementHeadTree", "schemaVersion", "trackedOverlayPaths"], "scope authorization");
  if (scope.value.schemaVersion !== "boulder.k0r.scope-authorization.v1" || scope.value.authorizedScope !== "full_preexisting_k0r_drift_plus_guide_package_delta") throw new Error("Scope authorization identity is invalid.");
  if (decoder.decode(scope.bytes) !== `${canonicalizeK0rJson(scope.value)}\n`) throw new Error("Scope authorization must be exact JCS+LF generated bytes.");
  if (!equalStrings(strings(scope.value.prohibitedAuthorities, "prohibited authorities"), prohibitedAuthorities)) throw new Error("Scope authorization expands authority.");
  if (!equalStrings(strings(scope.value.evidenceOutputPaths, "evidence output paths"), ["evidence/k0r/acceptance-manifest.json", "evidence/k0r/baseline-transition.json", "evidence/k0r/evidence-manifest.json", "evidence/k0r/final-verification-bundle.json", "evidence/k0r/independent-clean-source-reproduction.json", "evidence/k0r/isolated-run-receipt.json", "evidence/k0r/isolation-manifest.json", "evidence/k0r/k0r-exit-receipt.json", "evidence/k0r/superseding-adr.md", "evidence/k0r/v1-public-contract-inventory.json"])) throw new Error("Evidence output authority changed.");
  const paths = strings(scope.value.trackedOverlayPaths, "tracked overlay paths");
  if (paths.length !== 18 || trackedOverlayPaths.length !== 18 || !equalStrings(paths, trackedOverlayPaths)) throw new Error("Tracked overlay authority is not the exact 18-path set.");
  if (
    planBytes !== undefined
    && scope.value.planSha256 !== k0rPlanAuthoritySha256(decoder.decode(planBytes))
  ) throw new Error("Scope authorization is bound to different plan bytes.");
  for (const key of ["planSha256", "priorEvidenceInventorySha256", "priorExitStateSha256"] as const) digest(scope.value[key], `scope ${key}`);
  validateK0rScopeAuthorityProvenance(scope.value, provenance.value, scope.sha256);
  return paths;
}

export interface K0rPromotionReceiptExpected {
  readonly bootstrapReceiptSha256: string;
  readonly hostRunnerReceiptSha256: string;
  readonly hostRunnerToolIdentitySha256: string;
  readonly hostRunnerVectorResultSha256: string;
  readonly preTrackedManifestSha256: string;
  readonly trackedSourceSha256: string;
  readonly trackedRunnerSourceSha256: string;
  readonly trackedRunnerVectorResultSha256: string;
  readonly verifiedEntriesSha256: string;
}

export function validateK0rPromotionReceipt(bytes: string | Uint8Array, expected: K0rPromotionReceiptExpected): void {
  const source = typeof bytes === "string" ? bytes : decoder.decode(bytes);
  if (!source.endsWith("\n") || source.endsWith("\n\n")) throw new Error("Canonicalizer promotion receipt must end in exactly one LF.");
  const value = record(parseK0rJson(source.slice(0, -1)), "canonicalizer promotion");
  if (source !== `${canonicalizeK0rJson(value)}\n`) throw new Error("Canonicalizer promotion receipt must be exact JCS+LF bytes.");
  exactKeys(value, ["bootstrapReceiptSha256", "hostRunnerReceiptSha256", "hostRunnerToolIdentitySha256", "hostRunnerVectorResultSha256", "preTrackedManifestSha256", "schemaVersion", "status", "trackedRunnerSourceSha256", "trackedRunnerVectorResultSha256", "trackedSourceSha256", "verifiedEntriesSha256"], "canonicalizer promotion");
  if (value.schemaVersion !== "boulder.k0r.canonicalizer-promotion.v1" || value.status !== "verified") throw new Error("Canonicalizer promotion receipt identity is invalid.");
  for (const [field, expectedValue] of Object.entries(expected)) if (value[field] !== expectedValue) throw new Error(`Canonicalizer promotion receipt ${field} is stale or forged.`);
}

export async function verifyK0rPromotion(privateRoot: string): Promise<void> {
  const [promotion, manifest, bootstrap, host, authority, bootstrapSource, trackedSource] = await Promise.all([
    readJson(join(privateRoot, "receipts/canonicalizer-promotion.json")),
    readJson(join(privateRoot, "protected/pre-tracked-jcs-manifest.json")),
    readJson(join(privateRoot, "receipts/canonicalizer-bootstrap.json")),
    readJson(join(privateRoot, "receipts/host-bounded-runner.json")),
    readJson(join(privateRoot, "authorizations/k0r-a.json")),
    readRegular(join(privateRoot, canonicalizerBootstrapSourcePath)),
    readRegular(join(repositoryRoot, "test/k0r-canonical.ts")),
  ]);
  if (decoder.decode(authority.bytes) !== `${canonicalizeK0rJson(authority.value)}\n`) throw new Error("Canonical promotion authority must be exact JCS+LF bytes.");
  const entries = records(manifest.value.entries, "promotion entries");
  if (manifest.value.schemaVersion !== "boulder.k0r.pre-tracked-jcs-manifest.v1" || manifest.value.selfPath !== "protected/pre-tracked-jcs-manifest.json" || entries.length === 0) throw new Error("Canonical promotion requires a non-empty current manifest.");
  if (bootstrap.value.sourcePath !== canonicalizerBootstrapSourcePath || bootstrap.value.sourceSha256 !== prefixedDigest(bootstrapSource)) throw new Error("Canonical bootstrap source path or digest is stale.");
  if (host.value.toolName !== hostRunnerIdentity.toolName || host.value.contractVersion !== hostRunnerIdentity.contractVersion || host.value.toolIdentitySha256 !== hostRunnerIdentity.toolIdentitySha256 || host.value.hostSourceSetSha256 !== hostRunnerIdentity.hostSourceSetSha256 || host.value.hostArtifactSha256 !== hostRunnerIdentity.hostArtifactSha256 || host.value.bunVersion !== hostRunnerIdentity.bunVersion || host.value.planSha256 !== digest(authority.value.planSha256, "promotion authority plan digest")) throw new Error("Bounded host promotion authority is invalid.");
  const bootstrapVectorSet = text(bootstrap.value.vectorSetSha256, "bootstrap vector set").replace(/^sha256:/, "");
  const hostVectorSet = text(host.value.vectorSetSha256, "host vector set").replace(/^sha256:/, "");
  if (bootstrap.value.bunVersion !== hostRunnerIdentity.bunVersion || bootstrapVectorSet !== hostVectorSet) throw new Error("Canonical bootstrap and bounded host vectors are not bound.");
  const artifacts: K0rPromotionArtifact[] = [];
  for (const entry of entries) { const path = text(entry.path, "promotion path"); artifacts.push({ path, bytes: await readRegular(join(privateRoot, path), 32 * 1024 * 1024) }); }
  const additionalSnapshot = await additionalSnapshotAuthority(
    join(privateRoot, additionalSnapshotReceiptPath),
  );
  const snapshotBindings = new Map(additionalSnapshot.entries.map((entry) => [
    text(entry.snapshotPath, "additional snapshot path"),
    digest(entry.sha256, "additional snapshot digest"),
  ]));
  const bindings: K0rBindingOwnerSnapshot[] = approvedAdditionalSnapshots.map((snapshotPath) => { const sha256 = snapshotBindings.get(snapshotPath); if (sha256 === undefined) throw new Error(`Approved owner classification lacks snapshot binding: ${snapshotPath}.`); return { snapshotPath, sha256 }; });
  const verified = verifyK0rCanonicalPromotion({ bootstrapReceipt: bootstrap.bytes, hostRunnerReceipt: host.bytes, preTrackedManifest: manifest.bytes, bootstrapSource, artifacts, classificationPolicy: { bindingOwnerSnapshots: bindings } });
  if (verified.verifiedEntryCount !== entries.length) throw new Error("Canonical promotion did not verify every current manifest entry.");
  const trackedSourceSha256 = sha256K0rBytes(trackedSource);
  validateK0rPromotionReceipt(promotion.bytes, {
    bootstrapReceiptSha256: verified.bootstrapReceiptSha256,
    hostRunnerReceiptSha256: verified.hostRunnerReceiptSha256,
    hostRunnerToolIdentitySha256: verified.hostRunnerToolIdentitySha256,
    hostRunnerVectorResultSha256: verified.hostRunnerVectorResultSha256,
    preTrackedManifestSha256: verified.preTrackedManifestSha256,
    trackedSourceSha256,
    trackedRunnerSourceSha256: trackedSourceSha256,
    trackedRunnerVectorResultSha256: verified.hostRunnerVectorResultSha256,
    verifiedEntriesSha256: verified.verifiedEntriesSha256,
  });
}

async function freezeEntries(paths: readonly string[]): Promise<FreezeEntry[]> {
  const entries: FreezeEntry[] = [];
  for (const path of paths) {
    const absolute = resolve(repositoryRoot, path); assertContained(repositoryRoot, absolute, "overlay path");
    const before = await lstat(absolute);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || (before.mode & 0o777) !== 0o644 || before.size > maxFileBytes) throw new Error(`Frozen overlay is not a mode-100644 single-link regular file: ${path}.`);
    const handle = await open(absolute, fsConstants.O_RDONLY | noFollow);
    try {
      const current = await handle.stat();
      if (!current.isFile() || current.nlink !== 1 || (current.mode & 0o777) !== 0o644 || current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size) throw new Error(`Frozen overlay identity changed while opening: ${path}.`);
      const bytes = new Uint8Array(current.size);
      let offset = 0;
      while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (bytesRead === 0) throw new Error(`Frozen overlay ended early: ${path}.`); offset += bytesRead; }
      if ((await handle.read(new Uint8Array(1), 0, 1, offset)).bytesRead !== 0) throw new Error(`Frozen overlay grew while reading: ${path}.`);
      const after = await handle.stat();
      const live = await lstat(absolute);
      if (after.dev !== current.dev || after.ino !== current.ino || after.size !== current.size || after.nlink !== 1 || (after.mode & 0o777) !== 0o644 || live.dev !== current.dev || live.ino !== current.ino || live.size !== current.size || (live.mode & 0o777) !== 0o644) throw new Error(`Frozen overlay changed while reading: ${path}.`);
      entries.push({ path, mode: "100644", size: bytes.byteLength, sha256: prefixedDigest(bytes) });
    } finally { await handle.close(); }
  }
  return entries;
}
async function verifyFreeze(path: string, scope?: FileValue): Promise<FileValue> {
  const freeze = await readJson(path); exactKeys(freeze.value, ["entries", "headCommit", "headTree", "overlayMerkleRoot", "overlayPaths", "receiptSha256", "schemaVersion"], "tracked freeze");
  if (freeze.value.schemaVersion !== "boulder.k0r.tracked-freeze.v1") throw new Error("Tracked freeze schema is invalid.");
  const paths = strings(freeze.value.overlayPaths, "freeze paths"); const entries = records(freeze.value.entries, "freeze entries");
  if (!equalStrings(paths, trackedOverlayPaths) || !equalStrings(paths, entries.map((entry) => text(entry.path, "freeze entry path")))) throw new Error("Tracked freeze path set is incomplete.");
  const actual = await freezeEntries(paths);
  if (canonicalizeK0rJson(actual) !== canonicalizeK0rJson(entries)) throw new Error("Tracked overlay changed after freeze.");
  if (freeze.value.overlayMerkleRoot !== merkle(actual)) throw new Error("Tracked freeze Merkle root is invalid.");
  const projection = { ...freeze.value }; delete projection.receiptSha256;
  if (freeze.value.receiptSha256 !== canonicalDigest(projection)) throw new Error("Tracked freeze self digest is invalid.");
  const git = await gitIdentity(); if (freeze.value.headCommit !== git.headCommit || freeze.value.headTree !== git.headTree) throw new Error("Git identity changed after tracked freeze.");
  if (scope !== undefined && (scope.value.replacementHeadCommit !== git.headCommit || scope.value.replacementHeadTree !== git.headTree || !equalStrings(strings(scope.value.trackedOverlayPaths, "scope paths"), paths))) throw new Error("Tracked freeze differs from scope authority.");
  return freeze;
}

function assertCanonicalTrackedFreeze(path: string, privateRoot: string): void {
  if (resolve(path) !== resolve(privateRoot, "protected/tracked-freeze.json")) throw new Error("Tracked freeze path is not canonical.");
}

async function focusedGateExpectedBindings(
  scope: FileValue,
  planBytes: Uint8Array,
  git: { readonly headCommit: string; readonly headTree: string },
  command: JsonRecord,
): Promise<K0rFocusedGateExpectedBindings> {
  const bindings = async (paths: readonly string[]): Promise<K0rFocusedGateBinding[]> => Promise.all(paths.map(async (path) => ({
    path,
    sha256: prefixedDigest(await readRegular(join(repositoryRoot, path))),
  })));
  return {
    scopeAuthorizationSha256: scope.sha256,
    planSha256: prefixedDigest(planBytes),
    headCommit: git.headCommit,
    headTree: git.headTree,
    testFiles: await bindings(focusedGateTestPaths),
    runtimeSources: await bindings(focusedGateRuntimeSourcePaths),
    command: {
      argv: strings(command.argv, "focused gate argv"),
      cwd: ".",
      exitCode: focusedGateCount(command.exitCode, "focused gate exit code"),
      timedOut: command.timedOut === false ? false : true,
      crashed: command.crashed === false ? false : true,
      stdoutSha256: digest(command.stdoutSha256, "focused gate stdout digest"),
      stderrSha256: digest(command.stderrSha256, "focused gate stderr digest"),
    },
  };
}

async function verifyFocusedGateReceipt(
  path: string,
  root: string,
  stage: K0rFocusedGateStage,
  scope: FileValue,
  planBytes: Uint8Array,
  git: { readonly headCommit: string; readonly headTree: string },
): Promise<FileValue> {
  if (!focusedGateMeasurementsFinalized) throw new Error("Focused gate measurements are not finalized.");
  assertCanonicalPrivatePath(path, root, k0rFocusedGateReceiptPaths[stage], "focused gate receipt");
  const file = await readJson(path);
  if (file.value.stage !== stage) throw new Error("Focused gate receipt stage is invalid.");
  verifyCanonicalSelfDigest(file, "focused gate receipt");
  const command = record(file.value.command, "focused gate command");
  validateK0rFocusedGateReceiptForTest(file.value, await focusedGateExpectedBindings(scope, planBytes, git, command));
  return file;
}

export async function verifyK0rPreCaptureFocusedGateForCapture(
  path: string,
  pendingTransition: string,
): Promise<void> {
  const root = privateRootFor(pendingTransition);
  assertCanonicalPrivatePath(pendingTransition, root, "protected/k0r-transition.pending.json", "pending transition");
  await verifyK0rPromotion(root);
  const planPath = join(repositoryRoot, ".omo/plans/boulder-html-guide.md");
  const [scope, provenance, planBytes] = await Promise.all([
    readJson(join(root, "authorizations/k0r-a.json")),
    readJson(join(root, "authorizations/k0r-a.provenance.json")),
    readRegular(planPath),
  ]);
  validateScope(scope, provenance, planBytes);
  await verifyFocusedGateReceipt(path, root, "post-materialization", scope, planBytes, await gitIdentity());
}

function assertCanonicalPrivatePath(actual: string, privateRoot: string, expected: string, label: string): void {
  if (resolve(actual) !== resolve(privateRoot, expected)) throw new Error(`${label} path is not canonical.`);
}

function verifyCanonicalSelfDigest(file: FileValue, label: string): void {
  if (decoder.decode(file.bytes) !== `${canonicalizeK0rJson(file.value)}\n`) throw new Error(`${label} must be exact JCS+LF bytes.`);
  const projection = { ...file.value };
  delete projection.receiptSha256;
  if (file.value.receiptSha256 !== canonicalDigest(projection)) throw new Error(`${label} self digest is invalid.`);
}

export function validateK0rFinalScanProjection(
  value: JsonRecord,
  expected: {
    readonly materializationSha256: string;
    readonly preEditScanSha256: string;
    readonly ownerPaths: readonly string[];
    readonly typescript?: JsonRecord;
    readonly bindings?: readonly JsonRecord[];
    readonly bindingSchemaInventory?: readonly JsonRecord[];
    readonly sourceSchemaInventory?: readonly JsonRecord[];
  },
): void {
  exactKeys(value, ["bindingSchemaInventory", "bindingSchemaInventorySha256", "bindings", "bindingsSha256", "evidenceContractPaths", "evidenceContractPathsSha256", "materializationSha256", "ownerPaths", "preEditScan", "receiptSha256", "scanner", "schemaVersion", "sourceSchemaInventory", "sourceSchemaInventorySha256", "status", "typescript"], "final binding scan");
  if (value.schemaVersion !== "boulder.k0r.binding-reconciliation.v1" || value.status !== "complete") throw new Error("Final binding scan identity is invalid.");
  if (value.materializationSha256 !== expected.materializationSha256) throw new Error("Final binding scan materialization ancestry is invalid.");
  const preEditScan = record(value.preEditScan, "final pre-edit scan ancestry");
  exactKeys(preEditScan, ["path", "schemaVersion", "sha256"], "final pre-edit scan ancestry");
  if (preEditScan.path !== "receipts/k0r-binding-scan.pre.json" || preEditScan.schemaVersion !== "boulder.k0r.binding-scan.pre.v1" || preEditScan.sha256 !== expected.preEditScanSha256) throw new Error("Final binding scan pre-edit ancestry is invalid.");
  const ownerPaths = strings(value.ownerPaths, "final owner paths");
  if (!equalStrings(ownerPaths, expected.ownerPaths)) throw new Error("Final binding scan owner authority is invalid.");
  const contractPaths = strings(value.evidenceContractPaths, "final evidence contract paths");
  if (!equalStrings(contractPaths, evidenceContractPaths) || value.evidenceContractPathsSha256 !== canonicalDigest(contractPaths)) throw new Error("Final evidence contract path aggregate is invalid.");
  const bindings = records(value.bindings, "final bindings");
  const bindingSchemas = records(value.bindingSchemaInventory, "final binding schema inventory");
  const sourceSchemas = records(value.sourceSchemaInventory, "final source schema inventory");
  if (value.bindingsSha256 !== canonicalDigest(bindings) || value.bindingSchemaInventorySha256 !== canonicalDigest(bindingSchemas) || value.sourceSchemaInventorySha256 !== canonicalDigest(sourceSchemas)) throw new Error("Final binding scan aggregate digest is invalid.");
  if (bindings.some((binding) =>
    binding.targetState === "historical-missing" &&
    !(
      binding.disposition === "removed" &&
      binding.reason === "historical-missing" &&
      binding.finalBindingId === null &&
      binding.finalSha256 === null &&
      digestPattern.test(String(binding.preBindingId)) &&
      digestPattern.test(String(binding.oldSha256))
    )
  )) throw new Error("Final binding reconciliation retains historical-missing authority.");
  if (expected.typescript !== undefined && canonicalizeK0rJson(value.typescript) !== canonicalizeK0rJson(expected.typescript)) throw new Error("Final TypeScript binding differs from verified authority.");
  if (expected.bindings !== undefined && canonicalizeK0rJson(bindings) !== canonicalizeK0rJson(expected.bindings)) throw new Error("Final binding reconciliation differs from the independent rescan.");
  if (expected.bindingSchemaInventory !== undefined && canonicalizeK0rJson(bindingSchemas) !== canonicalizeK0rJson(expected.bindingSchemaInventory)) throw new Error("Final binding schema inventory differs from the independent rescan.");
  if (expected.sourceSchemaInventory !== undefined && canonicalizeK0rJson(sourceSchemas) !== canonicalizeK0rJson(expected.sourceSchemaInventory)) throw new Error("Final source schema inventory differs from the independent rescan.");
}

export async function writeK0rTrackedFreeze(options: K0rTrackedFreezeOptions): Promise<JsonRecord> {
  const root = privateRootFor(options.scopeAuthorization);
  for (const path of [options.scopeAuthorization, options.scopeProvenance, options.focusedGateReceipt, options.output]) assertContained(root, resolve(path), "freeze private path");
  const [scope, provenance, planBytes] = await Promise.all([readJson(options.scopeAuthorization), readJson(options.scopeProvenance), readRegular(options.plan)]);
  const paths = validateScope(scope, provenance, planBytes);
  await verifyK0rPromotion(root);
  const git = await gitIdentity(); if (scope.value.replacementHeadCommit !== git.headCommit || scope.value.replacementHeadTree !== git.headTree) throw new Error("Current Git identity differs from authorized replacement base.");
  await verifyFocusedGateReceipt(options.focusedGateReceipt, root, "pre-materialization", scope, planBytes, git);
  const entries = await freezeEntries(paths); const partial: JsonRecord = { schemaVersion: "boulder.k0r.tracked-freeze.v1", headCommit: git.headCommit, headTree: git.headTree, overlayPaths: paths, entries, overlayMerkleRoot: merkle(entries) };
  const result = { ...partial, receiptSha256: canonicalDigest(partial) }; await exclusiveCanonical(options.output, root, result); await verifyFreeze(options.output, scope); return result;
}

type RawLiteral = { readonly value: string; readonly location: string; readonly start: number; readonly end: number };

function utf8OffsetTable(source: string): Uint32Array {
  const offsets = new Uint32Array(source.length + 1);
  let byteOffset = 0;
  for (let index = 0; index < source.length; index += 1) {
    offsets[index] = byteOffset;
    const first = source.charCodeAt(index);
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = source.charCodeAt(index + 1);
      if (second < 0xdc00 || second > 0xdfff) throw new Error("Owner source contains a lone UTF-16 surrogate.");
      offsets[index + 1] = byteOffset;
      byteOffset += 4;
      index += 1;
    } else {
      if (first >= 0xdc00 && first <= 0xdfff) throw new Error("Owner source contains a lone UTF-16 surrogate.");
      byteOffset += first <= 0x7f ? 1 : first <= 0x7ff ? 2 : 3;
    }
  }
  offsets[source.length] = byteOffset;
  return offsets;
}

class JsonLiteralTraversal {
  private index = 0;
  private readonly offsets: Uint32Array;
  private readonly literals: RawLiteral[] = [];

  constructor(private readonly source: string) {
    this.offsets = utf8OffsetTable(source);
  }

  traverse(): RawLiteral[] {
    parseK0rJson(this.source);
    this.skipWhitespace();
    this.visitValue("");
    this.skipWhitespace();
    if (this.index !== this.source.length) throw new Error(`JSON owner traversal stopped at UTF-16 offset ${this.index}.`);
    return this.literals;
  }

  private skipWhitespace(): void {
    while (this.index < this.source.length && /[\t\n\r ]/.test(this.source[this.index] ?? "")) this.index += 1;
  }

  private visitValue(pointer: string): void {
    this.skipWhitespace();
    const current = this.source[this.index];
    if (current === '"') {
      const token = this.readString();
      this.literals.push({ value: token.value, location: pointer, start: this.offsets[token.start]!, end: this.offsets[token.end]! });
      return;
    }
    if (current === "[") {
      this.index += 1;
      this.skipWhitespace();
      if (this.source[this.index] === "]") { this.index += 1; return; }
      for (let item = 0; ; item += 1) {
        this.visitValue(`${pointer}/${item}`);
        this.skipWhitespace();
        if (this.source[this.index] === "]") { this.index += 1; return; }
        if (this.source[this.index] !== ",") throw new Error(`JSON array traversal failed at UTF-16 offset ${this.index}.`);
        this.index += 1;
      }
    }
    if (current === "{") {
      this.index += 1;
      this.skipWhitespace();
      if (this.source[this.index] === "}") { this.index += 1; return; }
      for (;;) {
        this.skipWhitespace();
        const key = this.readString().value;
        this.skipWhitespace();
        if (this.source[this.index] !== ":") throw new Error(`JSON object traversal failed at UTF-16 offset ${this.index}.`);
        this.index += 1;
        this.visitValue(`${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
        this.skipWhitespace();
        if (this.source[this.index] === "}") { this.index += 1; return; }
        if (this.source[this.index] !== ",") throw new Error(`JSON object traversal failed at UTF-16 offset ${this.index}.`);
        this.index += 1;
      }
    }
    const start = this.index;
    while (this.index < this.source.length && !/[\t\n\r ,\]}]/.test(this.source[this.index] ?? "")) this.index += 1;
    if (start === this.index) throw new Error(`JSON scalar traversal failed at UTF-16 offset ${this.index}.`);
  }

  private readString(): { readonly value: string; readonly start: number; readonly end: number } {
    const start = this.index;
    if (this.source[this.index] !== '"') throw new Error(`JSON string traversal failed at UTF-16 offset ${this.index}.`);
    this.index += 1;
    while (this.index < this.source.length) {
      const current = this.source[this.index];
      if (current === '"') {
        this.index += 1;
        return { value: JSON.parse(this.source.slice(start, this.index)) as string, start, end: this.index };
      }
      if (current === "\\") this.index += 2;
      else this.index += 1;
    }
    throw new Error(`JSON string traversal failed at UTF-16 offset ${start}.`);
  }
}

function jsonLiterals(source: string): RawLiteral[] {
  return new JsonLiteralTraversal(source).traverse();
}
interface TypeScriptApi { readonly ScriptTarget: Readonly<Record<string, unknown>>; readonly ScriptKind: Readonly<Record<string, unknown>>; createSourceFile(fileName: string, sourceText: string, languageVersion: unknown, setParentNodes: boolean, scriptKind: unknown): unknown; forEachChild(node: unknown, cbNode: (node: unknown) => void): void; isStringLiteral(node: unknown): boolean; isNoSubstitutionTemplateLiteral(node: unknown): boolean; }
async function loadTypeScript(root: string): Promise<TypeScriptApi> { const artifact = resolve(root, "lib/typescript.js"); const module: unknown = await import(new URL(`file://${artifact.split("/").map((part, index) => index === 0 ? "" : encodeURIComponent(part)).join("/")}`).href); return module as TypeScriptApi; }

async function typescriptTreeBinding(root: string): Promise<{ readonly sourceTreeSha256: string; readonly fileCount: number; readonly totalBytes: number }> {
  const physicalRoot = await realpath(root);
  const entries: { path: string; size: number; sha256: string }[] = [];
  let totalBytes = 0;
  const walk = async (directory: string): Promise<void> => {
    for (const name of (await readdir(directory)).sort(compareUtf8)) {
      const absolute = join(directory, name);
      const relativePath = relative(physicalRoot, absolute);
      if (relativePath === "" || relativePath.includes("\\") || relativePath !== relativePath.normalize("NFC")) throw new Error("TypeScript tree contains an invalid path.");
      const state = await lstat(absolute);
      if (state.isSymbolicLink() || (!state.isFile() && !state.isDirectory())) throw new Error(`TypeScript tree contains an unsafe entry: ${relativePath}.`);
      if (state.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (state.nlink !== 1 || state.size > 32 * 1024 * 1024) throw new Error(`TypeScript tree contains an unsafe regular file: ${relativePath}.`);
      const bytes = await readRegular(absolute, 32 * 1024 * 1024);
      totalBytes += bytes.byteLength;
      if (entries.length >= 500 || totalBytes > 64 * 1024 * 1024) throw new Error("TypeScript tree exceeds its bounded inventory.");
      entries.push({ path: relativePath, size: bytes.byteLength, sha256: prefixedDigest(bytes) });
    }
  };
  await walk(physicalRoot);
  entries.sort((left, right) => compareUtf8(left.path, right.path));
  return { sourceTreeSha256: canonicalDigest(entries), fileCount: entries.length, totalBytes };
}
function tsLiterals(api: TypeScriptApi, source: string, ownerPath: string): RawLiteral[] {
  const file = api.createSourceFile(ownerPath, source, api.ScriptTarget.Latest, false, api.ScriptKind.TS); const offsets = utf8OffsetTable(source); const output: RawLiteral[] = [];
  const visit = (node: unknown): void => { if (api.isStringLiteral(node) || api.isNoSubstitutionTemplateLiteral(node)) { const item = node as Readonly<{ text: string; getStart(sourceFile: unknown): number; getEnd(): number }>; const utf16Start = item.getStart(file); const utf16End = item.getEnd(); const start = offsets[utf16Start]; const end = offsets[utf16End]; if (start === undefined || end === undefined) throw new Error(`TypeScript literal range is outside ${ownerPath}.`); output.push({ value: item.text, location: `${start}:${end}`, start, end }); } api.forEachChild(node, visit); };
  visit(file); return output;
}
async function verifyTypeScript(options: K0rScanBindingsOptions): Promise<{ readonly api: TypeScriptApi; readonly receipt: FileValue; readonly binding: JsonRecord }> {
  const [receipt, artifact, packageBytes, sourceRealpath] = await Promise.all([
    readJson(options.typescriptBinding),
    readRegular(join(options.typescriptRoot, "lib/typescript.js"), maxFileBytes),
    readRegular(join(options.typescriptRoot, "package.json"), maxFileBytes),
    realpath(options.typescriptRoot),
  ]);
  const actualTree = await typescriptTreeBinding(options.typescriptRoot);
  const artifactDigest = prefixedDigest(artifact);
  if (artifactDigest !== options.typescriptArtifactSha256) throw new Error("TypeScript artifact digest mismatch.");
  let binding: JsonRecord;
  if (receipt.value.schemaVersion === "boulder.k0r.typescript-binding.v1") {
    if (receipt.value.status !== "verified" || receipt.value.externalReadOnly !== true) throw new Error("TypeScript binding is not verified external read-only authority.");
    if (artifactDigest !== record(receipt.value.artifact, "TypeScript artifact").sha256) throw new Error("TypeScript artifact digest mismatch.");
    const source = record(receipt.value.source, "TypeScript source");
    if (
      source.sourceTreeSha256 !== options.typescriptTreeSha256
      || source.sourceTreeSha256 !== actualTree.sourceTreeSha256
      || source.realpathSha256 !== prefixedDigest(encoder.encode(sourceRealpath))
      || source.fileCount !== actualTree.fileCount
      || source.totalBytes !== actualTree.totalBytes
      || receipt.value.packageJsonSha256 !== prefixedDigest(packageBytes)
    ) throw new Error("TypeScript source-tree digest mismatch.");
    binding = { bindingReceiptPath: "receipts/typescript-binding.json", bindingReceiptSha256: receipt.sha256, sourceTreeSha256: source.sourceTreeSha256, sourcePathSha256: source.realpathSha256, equivalentSourceTreeSha256: record(receipt.value.equivalentSource, "equivalent TypeScript source").equivalentSourceTreeSha256, packageJsonSha256: receipt.value.packageJsonSha256, artifactSha256: artifactDigest };
  } else if (receipt.value.schemaVersion === "boulder.k0r.regenerated-preapproval.v2") {
    exactKeys(receipt.value, ["artifactSha256", "externalReadOnly", "head", "planSha256", "schemaVersion", "sourceTreeSha256", "status", "tree", "version"], "regenerated TypeScript binding");
    if (receipt.value.status !== "verified" || receipt.value.externalReadOnly !== true) throw new Error("Regenerated TypeScript binding is not verified external read-only authority.");
    if (receipt.value.artifactSha256 !== artifactDigest || receipt.value.sourceTreeSha256 !== options.typescriptTreeSha256 || receipt.value.sourceTreeSha256 !== actualTree.sourceTreeSha256) throw new Error("Regenerated TypeScript binding digest mismatch.");
    const git = await gitIdentity();
    if (receipt.value.head !== git.headCommit || receipt.value.tree !== git.headTree) throw new Error("Regenerated TypeScript binding Git identity is stale.");
    const planBytes = await readRegular(join(repositoryRoot, ".omo/plans/boulder-html-guide.md"), maxFileBytes);
    if (receipt.value.planSha256 !== k0rPlanAuthoritySha256(decoder.decode(planBytes))) throw new Error("Regenerated TypeScript binding plan identity is stale.");
    const packageValue = record(parseK0rJson(decoder.decode(packageBytes)), "TypeScript package");
    if (receipt.value.version !== packageValue.version) throw new Error("Regenerated TypeScript binding version is stale.");
    binding = {
      bindingReceiptPath: "receipts/typescript-binding.json",
      bindingReceiptSha256: receipt.sha256,
      sourceTreeSha256: receipt.value.sourceTreeSha256,
      sourcePathSha256: prefixedDigest(sourceRealpath),
      equivalentSourceTreeSha256: receipt.value.sourceTreeSha256,
      packageJsonSha256: prefixedDigest(packageBytes),
      artifactSha256: artifactDigest,
    };
  } else {
    throw new Error("TypeScript binding schema is unsupported.");
  }
  return { api: await loadTypeScript(options.typescriptRoot), receipt, binding };
}

async function gitTopLevel(): Promise<Set<string>> { const output = await bounded(["git", "ls-tree", "-z", "--name-only", "HEAD"], 8 * 1024 * 1024); return new Set(output.split("\0").filter(Boolean)); }
async function trackedPaths(): Promise<string[]> { const output = await bounded(["git", "ls-files", "-z"], 8 * 1024 * 1024); return output.split("\0").filter(Boolean).sort(compareUtf8); }
async function workingTreePaths(): Promise<string[]> {
  const output = await bounded(["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"], 8 * 1024 * 1024);
  const records = output.split("\0").filter(Boolean);
  const paths: string[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const entry = records[index]!;
    if (entry.length < 4 || entry[2] !== " ") throw new Error("Malformed Git status record.");
    paths.push(entry.slice(3));
    if (entry[0] === "R" || entry[0] === "C" || entry[1] === "R" || entry[1] === "C") {
      const source = records[index + 1];
      if (source === undefined) throw new Error("Malformed Git rename status record.");
      paths.push(source);
      index += 1;
    }
  }
  return paths.sort(compareUtf8);
}
function addPresentPath(paths: Set<string>, path: string): void {
  paths.add(path);
  for (let parent = dirname(path); parent !== "." && parent !== "/"; parent = dirname(parent)) paths.add(parent);
}
export function classifyK0rBindingPath(value: string, context: {
  readonly ownerPath: string;
  readonly bindingPath: string;
  readonly topLevelPaths: ReadonlySet<string>;
  readonly presentPaths: ReadonlySet<string>;
}): { kind: Literal["bindingKind"]; state: Literal["targetState"] } | undefined {
  if (digestPattern.test(value)) return { kind: "digest", state: "present" };
  if (schemaPattern.test(value)) return { kind: "schema-version", state: "present" };
  if (!pathPattern.test(value)) return undefined;
  if (value === ".boulder/current-profile" || value === ".boulder/handoffs") return { kind: "path", state: "runtime-contract" };
  if (evidenceContractPaths.includes(value as typeof evidenceContractPaths[number])) return { kind: "path", state: "evidence-contract" };
  if (context.presentPaths.has(value)) return { kind: "path", state: "present" };
  if (value === "evidence/k0r") return { kind: "path", state: "evidence-contract" };
  if (value === "src/plan-" || value === "src/planner-" || value === "test/k0r-") return { kind: "path", state: "runtime-contract" };
  if (value === excludedUnrelatedPlannerPath &&
      ((context.ownerPath === "evidence/k0r/isolation-manifest.json" &&
        context.bindingPath === "/pathPolicy/excludedUnrelatedPlannerPaths/0") ||
       (context.ownerPath === "test/k0r-evidence-contract.test.ts" &&
        /^\d+:\d+$/.test(context.bindingPath)))) {
    return { kind: "path", state: "evidence-contract" };
  }
  if (context.ownerPath === "evidence/k0r/evidence-manifest.json" &&
      /^\/inventories\/(?:pre|post)\/(?:ignored|untracked)\/\d+\/path$/.test(context.bindingPath)) {
    return { kind: "path", state: "evidence-contract" };
  }
  if (value === syntheticDocFixturePath &&
      context.ownerPath === "test/k0r-evidence-contract.test.ts" &&
      /^\d+:\d+$/.test(context.bindingPath)) {
    return { kind: "path", state: "evidence-contract" };
  }
  if (value.includes("/") && context.topLevelPaths.has(value.split("/")[0] ?? "")) return { kind: "path", state: "historical-missing" };
  return undefined;
}
export function formatK0rHistoricalBindingDiagnostic(binding: {
  readonly ownerPath: string;
  readonly bindingPath: string;
  readonly value: string;
}): string {
  return `Final owners retain a historical-missing binding: owner=${binding.ownerPath} binding=${binding.bindingPath} literal=${JSON.stringify(binding.value)}.`;
}
export function formatK0rRemovedBindingDiagnostic(binding: {
  readonly ownerPath: string;
  readonly bindingPath: string;
  readonly bindingKind: string;
  readonly targetState: string;
  readonly oldSha256: string;
  readonly derivation: string;
}): string {
  return `A pre-edit binding was removed without deterministic authority: owner=${binding.ownerPath} binding=${binding.bindingPath} kind=${binding.bindingKind} state=${binding.targetState} digest=${binding.oldSha256} derivation=${binding.derivation}.`;
}
export function classifyK0rRemovedBindingDisposition(binding: {
  readonly ownerPath: string;
  readonly bindingPath: string;
  readonly bindingKind: string;
  readonly targetState: string;
  readonly oldSha256: string;
  readonly derivation: string;
}): "historical-missing" | "obsolete-writer" | undefined {
  if (binding.targetState === "historical-missing") return "historical-missing";
  const obsoleteWriterBinding = [
    ["evidence/k0r/acceptance-manifest.json", "/requiredCommands/0/argv/1", "sha256:4aca4b1f59c39d21667d4f0fcea14be940647840c941a350d2fb1fb05b11e994"],
    ["evidence/k0r/isolation-manifest.json", "/commands/argvAllowlist/30/1", "sha256:4aca4b1f59c39d21667d4f0fcea14be940647840c941a350d2fb1fb05b11e994"],
    ["evidence/k0r/isolation-manifest.json", "/commands/argvAllowlist/1/1", "sha256:50f7dd53b1267dd6d3c0338a16e4273faf2e148b42c4e683f94770885b1037df"],
    ["evidence/k0r/isolation-manifest.json", "/commands/argvAllowlist/6/1", "sha256:50f7dd53b1267dd6d3c0338a16e4273faf2e148b42c4e683f94770885b1037df"],
    ["evidence/k0r/acceptance-manifest.json", "/requiredCommands/5/oracleArgv/1", "sha256:50f7dd53b1267dd6d3c0338a16e4273faf2e148b42c4e683f94770885b1037df"],
    ["evidence/k0r/acceptance-manifest.json", "/requiredCommands/5/repositoryChecks/0/argv/1", "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"],
    ["evidence/k0r/acceptance-manifest.json", "/requiredCommands/5/repositoryChecks/0/argv/2", "sha256:eae71ace01862f0ab4f487982e838bc3c5b7e76ba4a2d6d3d40ef2ec63ef3cf7"],
    ["evidence/k0r/acceptance-manifest.json", "/requiredCommands/5/repositoryChecks/3/argv/4", "sha256:a54ff182c7e8acf56acfd6e4b9c3ff41e2c41a31c9b211b2deb9df75d9a478f9"],
    ["evidence/k0r/isolation-manifest.json", "/commands/argvAllowlist/7/1", "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"],
    ["evidence/k0r/isolation-manifest.json", "/commands/argvAllowlist/7/2", "sha256:eae71ace01862f0ab4f487982e838bc3c5b7e76ba4a2d6d3d40ef2ec63ef3cf7"],
  ].some(([ownerPath, bindingPath, oldSha256]) =>
    binding.ownerPath === ownerPath &&
    binding.bindingPath === bindingPath &&
    binding.oldSha256 === oldSha256
  );
  if (obsoleteWriterBinding &&
      binding.bindingKind === "path" &&
      binding.targetState === "present" &&
      binding.derivation === "json-pointer") {
    return "obsolete-writer";
  }
  return undefined;
}
async function scanOwners(ownerPaths: readonly string[], sourceRoot: string, api: TypeScriptApi, present: ReadonlySet<string>, top: ReadonlySet<string>): Promise<{ bindings: Literal[]; schemas: SchemaEntry[]; owners: ScannedOwner[] }> {
  const bindings: Literal[] = []; const schemas: SchemaEntry[] = []; const owners: ScannedOwner[] = [];
  for (const ownerPath of ownerPaths) {
    const bytes = await readRegular(join(sourceRoot, ownerPath)); const sourceSha = prefixedDigest(bytes); const source = decoder.decode(bytes); owners.push({ ownerPath, bytes });
    const literals = ownerPath.endsWith(".json") ? jsonLiterals(source) : tsLiterals(api, source, ownerPath);
    for (const literal of literals) {
      const classification = classifyK0rBindingPath(literal.value, { ownerPath, bindingPath: literal.location, topLevelPaths: top, presentPaths: present }); if (classification === undefined) continue;
      const derivation = ownerPath.endsWith(".json") ? "json-pointer" as const : "ts-ast-literal" as const;
      bindings.push({ ownerPath, bindingKind: classification.kind, bindingPath: literal.location, targetState: classification.state, oldSha256: prefixedDigest(literal.value), derivation, value: literal.value, start: literal.start, end: literal.end });
      if (classification.kind === "schema-version") schemas.push({ ownerPath, locationKind: ownerPath.endsWith(".json") ? "json-pointer" : "ts-byte-range", location: literal.location, schemaVersion: literal.value, sha256: sourceSha });
    }
  }
  bindings.sort((a, b) => compareUtf8(`${a.ownerPath}\0${a.bindingKind}\0${a.bindingPath}`, `${b.ownerPath}\0${b.bindingKind}\0${b.bindingPath}`)); schemas.sort((a, b) => compareUtf8(`${a.ownerPath}\0${a.locationKind}\0${a.location}\0${a.schemaVersion}`, `${b.ownerPath}\0${b.locationKind}\0${b.location}\0${b.schemaVersion}`)); owners.sort((a, b) => compareUtf8(a.ownerPath, b.ownerPath));
  return { bindings, schemas, owners };
}
async function sourceSchemas(api: TypeScriptApi): Promise<SchemaEntry[]> {
  const paths = (await trackedPaths()).filter((path) => (path.startsWith("fixtures/") && path.endsWith(".json")) || ((path.startsWith("src/") || path.startsWith("test/")) && path.endsWith(".ts")));
  const entries: SchemaEntry[] = [];
  for (const path of paths) { const bytes = await readRegular(join(repositoryRoot, path)); const source = decoder.decode(bytes); const sourceSha = prefixedDigest(bytes); const literals = path.endsWith(".json") ? jsonLiterals(source) : tsLiterals(api, source, path); for (const item of literals) if (schemaPattern.test(item.value)) entries.push({ ownerPath: path, locationKind: path.endsWith(".json") ? "json-pointer" : "ts-byte-range", location: item.location, schemaVersion: item.value, sha256: sourceSha }); }
  entries.sort((a, b) => compareUtf8(`${a.ownerPath}\0${a.locationKind}\0${a.location}\0${a.schemaVersion}`, `${b.ownerPath}\0${b.locationKind}\0${b.location}\0${b.schemaVersion}`)); return entries;
}
function publicBinding(binding: Literal): JsonRecord { return { ownerPath: binding.ownerPath, bindingKind: binding.bindingKind, bindingPath: binding.bindingPath, targetState: binding.targetState, oldSha256: binding.oldSha256, derivation: binding.derivation }; }
type ReconciliationBinding = Pick<Literal, "ownerPath" | "bindingKind" | "bindingPath" | "targetState" | "oldSha256" | "derivation" | "value">;
type IdentifiedBinding = ReconciliationBinding & { readonly id: string; readonly start: number; readonly end: number };
type IndexedByteEdit = K0rByteEdit & { readonly preOffset: number | null; readonly finalOffset: number | null };
type EditHunk = { readonly preStart: number; readonly preEnd: number; readonly finalStart: number; readonly finalEnd: number };

function reconciliationBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
}

function bisectK0rBytes(pre: Uint8Array, preStart: number, preEnd: number, final: Uint8Array, finalStart: number, finalEnd: number): { readonly pre: number; readonly final: number } | undefined {
  const preLength = preEnd - preStart; const finalLength = finalEnd - finalStart; const maxDistance = Math.ceil((preLength + finalLength) / 2); const offset = maxDistance + 1; const length = 2 * maxDistance + 3;
  const forward = new Int32Array(length); const reverse = new Int32Array(length); forward.fill(-1); reverse.fill(-1); forward[offset + 1] = 0; reverse[offset + 1] = 0;
  const delta = preLength - finalLength; const overlapOnForward = delta % 2 !== 0;
  for (let distance = 0; distance <= maxDistance; distance += 1) {
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const index = offset + diagonal;
      let x = diagonal === -distance || (diagonal !== distance && forward[index - 1]! < forward[index + 1]!) ? forward[index + 1]! : forward[index - 1]! + 1;
      let y = x - diagonal;
      while (x < preLength && y < finalLength && pre[preStart + x] === final[finalStart + y]) { x += 1; y += 1; }
      forward[index] = x;
      if (overlapOnForward) {
        const reverseDiagonal = delta - diagonal; const reverseIndex = offset + reverseDiagonal;
        if (reverseIndex >= 0 && reverseIndex < length && reverse[reverseIndex]! >= 0 && x + reverse[reverseIndex]! >= preLength) return { pre: preStart + x, final: finalStart + y };
      }
    }
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const index = offset + diagonal;
      let x = diagonal === -distance || (diagonal !== distance && reverse[index - 1]! < reverse[index + 1]!) ? reverse[index + 1]! : reverse[index - 1]! + 1;
      let y = x - diagonal;
      while (x < preLength && y < finalLength && pre[preEnd - x - 1] === final[finalEnd - y - 1]) { x += 1; y += 1; }
      reverse[index] = x;
      if (!overlapOnForward) {
        const forwardDiagonal = delta - diagonal; const forwardIndex = offset + forwardDiagonal;
        if (forwardIndex >= 0 && forwardIndex < length && forward[forwardIndex]! >= 0 && forward[forwardIndex]! + x >= preLength) {
          const forwardX = forward[forwardIndex]!; return { pre: preStart + forwardX, final: finalStart + forwardX - forwardDiagonal };
        }
      }
    }
  }
  return undefined;
}

function rightAlignMyersInsertions(edits: readonly IndexedByteEdit[]): IndexedByteEdit[] {
  const aligned = [...edits];
  for (let search = 1; search < aligned.length;) {
    if (aligned[search]?.kind !== "insert" || aligned[search - 1]?.kind !== "equal") { search += 1; continue; }
    let insertionEnd = search; while (aligned[insertionEnd]?.kind === "insert") insertionEnd += 1;
    let equalStart = search; while (equalStart > 0 && aligned[equalStart - 1]?.kind === "equal") equalStart -= 1;
    const equalCount = search - equalStart; const insertionCount = insertionEnd - search; let shift = 0;
    while (shift < Math.min(equalCount, insertionCount) && aligned[search - shift - 1]?.byte === aligned[insertionEnd - shift - 1]?.byte) shift += 1;
    if (shift === 0) { search = insertionEnd; continue; }
    const shiftedEquals = aligned.slice(search - shift, search); const insertions = aligned.slice(search, insertionEnd); const insertionPrefix = insertions.slice(0, insertionCount - shift); const insertionSuffix = insertions.slice(insertionCount - shift);
    const replacement: IndexedByteEdit[] = [
      ...shiftedEquals.map((edit) => ({ kind: "insert" as const, byte: edit.byte, preOffset: null, finalOffset: edit.finalOffset })),
      ...insertionPrefix,
      ...shiftedEquals.map((edit, index) => ({ kind: "equal" as const, byte: edit.byte, preOffset: edit.preOffset, finalOffset: insertionSuffix[index]?.finalOffset ?? null }))
    ];
    aligned.splice(search - shift, shift + insertionCount, ...replacement); search = Math.max(1, search - shift);
  }
  return aligned;
}

function indexedMyersK0rByteEdits(pre: Uint8Array, final: Uint8Array): IndexedByteEdit[] {
  const edits: IndexedByteEdit[] = [];
  const diff = (preStart: number, preEnd: number, finalStart: number, finalEnd: number): void => {
    while (preStart < preEnd && finalStart < finalEnd && pre[preStart] === final[finalStart]) {
      edits.push({ kind: "equal", byte: pre[preStart]!, preOffset: preStart, finalOffset: finalStart }); preStart += 1; finalStart += 1;
    }
    let suffix = 0;
    while (preStart + suffix < preEnd && finalStart + suffix < finalEnd && pre[preEnd - suffix - 1] === final[finalEnd - suffix - 1]) suffix += 1;
    const middlePreEnd = preEnd - suffix; const middleFinalEnd = finalEnd - suffix;
    if (preStart === middlePreEnd) {
      for (let index = finalStart; index < middleFinalEnd; index += 1) edits.push({ kind: "insert", byte: final[index]!, preOffset: null, finalOffset: index });
    } else if (finalStart === middleFinalEnd) {
      for (let index = preStart; index < middlePreEnd; index += 1) edits.push({ kind: "delete", byte: pre[index]!, preOffset: index, finalOffset: null });
    } else {
      const split = bisectK0rBytes(pre, preStart, middlePreEnd, final, finalStart, middleFinalEnd);
      if (split === undefined || (split.pre === preStart && split.final === finalStart) || (split.pre === middlePreEnd && split.final === middleFinalEnd)) {
        for (let index = preStart; index < middlePreEnd; index += 1) edits.push({ kind: "delete", byte: pre[index]!, preOffset: index, finalOffset: null });
        for (let index = finalStart; index < middleFinalEnd; index += 1) edits.push({ kind: "insert", byte: final[index]!, preOffset: null, finalOffset: index });
      } else {
        diff(preStart, split.pre, finalStart, split.final); diff(split.pre, middlePreEnd, split.final, middleFinalEnd);
      }
    }
    for (let index = 0; index < suffix; index += 1) {
      const preOffset = middlePreEnd + index; const finalOffset = middleFinalEnd + index;
      edits.push({ kind: "equal", byte: pre[preOffset]!, preOffset, finalOffset });
    }
  };
  diff(0, pre.length, 0, final.length);
  return rightAlignMyersInsertions(edits);
}

export function myersK0rByteEdits(pre: string | Uint8Array, final: string | Uint8Array): K0rByteEdit[] {
  return indexedMyersK0rByteEdits(reconciliationBytes(pre), reconciliationBytes(final));
}

function normalizeReconciliationBindings(bindings: readonly ReconciliationBinding[], phase: "pre" | "final"): (ReconciliationBinding & { readonly id: string })[] {
  const normalized = bindings.map((binding) => {
    if (typeof binding.ownerPath !== "string" || binding.ownerPath === "" || typeof binding.bindingPath !== "string" || binding.bindingPath === "" || typeof binding.value !== "string") throw new Error(`Missing ${phase} binding ID input.`);
    if (!(["digest", "path", "schema-version"] as const).includes(binding.bindingKind)) throw new Error(`Invalid ${phase} binding kind: ${String(binding.bindingKind)}.`);
    if (!(["present", "runtime-contract", "evidence-contract", "historical-missing"] as const).includes(binding.targetState)) throw new Error(`Invalid ${phase} binding target state: ${String(binding.targetState)}.`);
    if (!(["json-pointer", "ts-ast-literal"] as const).includes(binding.derivation)) throw new Error(`Invalid ${phase} binding derivation: ${String(binding.derivation)}.`);
    if (!digestPattern.test(binding.oldSha256) || binding.oldSha256 !== prefixedDigest(binding.value)) throw new Error(`Decoded ${phase} binding digest is invalid: owner=${binding.ownerPath} binding=${binding.bindingPath}.`);
    const id = phase === "pre"
      ? canonicalDigest({ ownerPath: binding.ownerPath, bindingKind: binding.bindingKind, oldRange: binding.bindingPath, oldSha256: binding.oldSha256 })
      : canonicalDigest({ ownerPath: binding.ownerPath, bindingKind: binding.bindingKind, finalRange: binding.bindingPath, finalSha256: binding.oldSha256 });
    return { ...binding, id };
  }).sort((a, b) => compareUtf8(`${a.id}\0${a.ownerPath}\0${a.bindingKind}\0${a.bindingPath}`, `${b.id}\0${b.ownerPath}\0${b.bindingKind}\0${b.bindingPath}`));
  for (let start = 0; start < normalized.length;) {
    let end = start + 1; while (end < normalized.length && normalized[end]?.id === normalized[start]?.id) end += 1;
    if (end - start > 1) throw new Error(`Duplicate ${phase} binding ID: id=${normalized[start]?.id} count=${end - start}.`);
    start = end;
  }
  return normalized;
}

function decodeTsStaticLiteral(raw: string): string {
  const quote = raw[0];
  if ((quote !== '"' && quote !== "'" && quote !== "`") || raw[raw.length - 1] !== quote) throw new Error("TypeScript binding range is not one complete static literal token.");
  let value = "";
  for (let index = 1; index < raw.length - 1; index += 1) {
    const current = raw[index]!;
    if (current !== "\\") { value += current; continue; }
    const escaped = raw[++index]; if (escaped === undefined || index >= raw.length - 1) throw new Error("TypeScript binding literal has an incomplete escape.");
    const simple: Readonly<Record<string, string>> = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "0": "\0", "\\": "\\", "'": "'", '"': '"', "`": "`" };
    if (escaped in simple) { value += simple[escaped]; continue; }
    if (escaped === "\n") continue;
    if (escaped === "\r") { if (raw[index + 1] === "\n") index += 1; continue; }
    if (escaped === "x") { const digits = raw.slice(index + 1, index + 3); if (!/^[0-9a-fA-F]{2}$/.test(digits)) throw new Error("TypeScript binding literal has an invalid hexadecimal escape."); value += String.fromCharCode(Number.parseInt(digits, 16)); index += 2; continue; }
    if (escaped === "u") {
      if (raw[index + 1] === "{") { const close = raw.indexOf("}", index + 2); const digits = raw.slice(index + 2, close); if (close < 0 || !/^[0-9a-fA-F]{1,6}$/.test(digits)) throw new Error("TypeScript binding literal has an invalid Unicode escape."); const point = Number.parseInt(digits, 16); if (point > 0x10ffff) throw new Error("TypeScript binding literal Unicode escape is out of range."); value += String.fromCodePoint(point); index = close; continue; }
      const digits = raw.slice(index + 1, index + 5); if (!/^[0-9a-fA-F]{4}$/.test(digits)) throw new Error("TypeScript binding literal has an invalid Unicode escape."); value += String.fromCharCode(Number.parseInt(digits, 16)); index += 4; continue;
    }
    value += escaped;
  }
  return value;
}

function locateReconciliationBindings(bindings: readonly (ReconciliationBinding & { readonly id: string })[], ownerPath: string, bytes: Uint8Array): IdentifiedBinding[] {
  if (bindings.length === 0) return [];
  const source = decoder.decode(bytes); const jsonByPointer = ownerPath.endsWith(".json") ? new Map(jsonLiterals(source).map((literal) => [literal.location, literal])) : undefined;
  return bindings.map((binding) => {
    let start: number; let end: number;
    if (binding.derivation === "json-pointer") {
      if (!ownerPath.endsWith(".json")) throw new Error(`JSON-pointer binding has a non-JSON owner: ${ownerPath}.`);
      const literal = jsonByPointer?.get(binding.bindingPath); if (literal === undefined) throw new Error(`Missing JSON binding pointer in owner bytes: owner=${ownerPath} binding=${binding.bindingPath}.`);
      if (literal.value !== binding.value) throw new Error(`JSON binding pointer decodes to a different value: owner=${ownerPath} binding=${binding.bindingPath}.`);
      start = literal.start; end = literal.end;
    } else {
      if (ownerPath.endsWith(".json")) throw new Error(`TypeScript range binding has a JSON owner: ${ownerPath}.`);
      const match = /^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/.exec(binding.bindingPath); start = Number(match?.[1]); end = Number(match?.[2]);
      if (match === null || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= end || end > bytes.length) throw new Error(`Invalid TypeScript UTF-8 binding range: owner=${ownerPath} binding=${binding.bindingPath}.`);
      if (decodeTsStaticLiteral(decoder.decode(bytes.slice(start, end))) !== binding.value) throw new Error(`TypeScript binding range decodes to a different value: owner=${ownerPath} binding=${binding.bindingPath}.`);
    }
    return { ...binding, start, end };
  });
}

function editHunks(edits: readonly IndexedByteEdit[]): EditHunk[] {
  const hunks: EditHunk[] = []; let preOffset = 0; let finalOffset = 0; let current: { preStart: number; preEnd: number; finalStart: number; finalEnd: number } | undefined;
  for (const edit of edits) {
    if (edit.kind === "equal") { if (current !== undefined) { hunks.push(current); current = undefined; } preOffset += 1; finalOffset += 1; continue; }
    current ??= { preStart: preOffset, preEnd: preOffset, finalStart: finalOffset, finalEnd: finalOffset };
    if (edit.kind === "delete") { preOffset += 1; current.preEnd = preOffset; }
    else { finalOffset += 1; current.finalEnd = finalOffset; }
  }
  if (current !== undefined) hunks.push(current);
  return hunks;
}

function bindingTouchesHunk(binding: IdentifiedBinding, hunk: EditHunk, phase: "pre" | "final"): boolean {
  const start = phase === "pre" ? hunk.preStart : hunk.finalStart; const end = phase === "pre" ? hunk.preEnd : hunk.finalEnd;
  if (start < end && binding.start < end && start < binding.end) return true;
  const otherStart = phase === "pre" ? hunk.finalStart : hunk.preStart; const otherEnd = phase === "pre" ? hunk.finalEnd : hunk.preEnd;
  return start === end && otherStart < otherEnd && binding.start < start && start < binding.end;
}

function reconciliationDerivation(binding: ReconciliationBinding): "json-pointer-diff" | "ts-ast-literal-diff" {
  return binding.derivation === "json-pointer" ? "json-pointer-diff" : "ts-ast-literal-diff";
}

function normalizedJsonArrayPointer(root: unknown, pointer: string): string {
  let cursor = root;
  return pointer.split("/").slice(1).map((rawSegment) => {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    const arrayIndex = Array.isArray(cursor) && /^(?:0|[1-9]\d*)$/.test(segment);
    if (arrayIndex) {
      cursor = (cursor as unknown[])[Number(segment)];
      return "#";
    }
    if (typeof cursor === "object" && cursor !== null && !Array.isArray(cursor)) {
      cursor = (cursor as JsonRecord)[segment];
    } else {
      cursor = undefined;
    }
    return rawSegment;
  }).join("/");
}

function reconcileOwnerBindings(ownerPath: string, preBytes: Uint8Array, finalBytes: Uint8Array, preBindings: readonly IdentifiedBinding[], finalBindings: readonly IdentifiedBinding[]): JsonRecord[] {
  const edits = indexedMyersK0rByteEdits(preBytes, finalBytes); const mappedFinalOffset = new Int32Array(preBytes.length); mappedFinalOffset.fill(-1);
  for (const edit of edits) if (edit.kind === "equal" && edit.preOffset !== null && edit.finalOffset !== null) mappedFinalOffset[edit.preOffset] = edit.finalOffset;
  const consumedPre = new Set<string>(); const consumedFinal = new Set<string>(); const reconciled: JsonRecord[] = [];
  const preHasJsonBindings = preBindings.some((binding) => binding.derivation === "json-pointer");
  const finalHasJsonBindings = finalBindings.some((binding) => binding.derivation === "json-pointer");
  const preJsonRoot = preHasJsonBindings ? parseK0rJson(decoder.decode(preBytes)) : undefined;
  const finalJsonRoot = finalHasJsonBindings ? parseK0rJson(decoder.decode(finalBytes)) : undefined;
  const jsonIdentityKey = (binding: IdentifiedBinding, pointer: string): string => [
    binding.bindingKind,
    pointer,
    binding.targetState,
    binding.oldSha256,
    binding.derivation,
    binding.value,
  ].join("\0");
  const reconcileJsonIdentity = (
    prePointer: (binding: IdentifiedBinding) => string,
    finalPointer: (binding: IdentifiedBinding) => string,
  ): void => {
    const finalByIdentity = new Map<string, IdentifiedBinding[]>();
    for (const binding of finalBindings) {
      if (binding.derivation !== "json-pointer" || consumedFinal.has(binding.id)) continue;
      const key = jsonIdentityKey(binding, finalPointer(binding));
      const values = finalByIdentity.get(key) ?? [];
      values.push(binding);
      finalByIdentity.set(key, values);
    }
    for (const old of preBindings) {
      if (old.derivation !== "json-pointer" || consumedPre.has(old.id)) continue;
      const candidates = (finalByIdentity.get(jsonIdentityKey(old, prePointer(old))) ?? [])
        .filter((candidate) => {
          if (consumedFinal.has(candidate.id) ||
              old.end - old.start !== candidate.end - candidate.start) return false;
          for (let offset = 0; offset < old.end - old.start; offset += 1) {
            if (preBytes[old.start + offset] !== finalBytes[candidate.start + offset]) return false;
          }
          return true;
        });
      if (candidates.length !== 1) continue;
      const item = candidates[0]!;
      consumedPre.add(old.id);
      consumedFinal.add(item.id);
      reconciled.push({ ownerPath, bindingKind: item.bindingKind, targetState: item.targetState, disposition: "unchanged", preBindingId: old.id, finalBindingId: item.id, oldSha256: old.oldSha256, finalSha256: item.oldSha256, reason: null, derivation: reconciliationDerivation(item) });
    }
  };
  reconcileJsonIdentity(
    (binding) => binding.bindingPath,
    (binding) => binding.bindingPath,
  );
  reconcileJsonIdentity(
    (binding) => normalizedJsonArrayPointer(preJsonRoot, binding.bindingPath),
    (binding) => normalizedJsonArrayPointer(finalJsonRoot, binding.bindingPath),
  );
  const finalByExactJsonPointer = new Map<string, IdentifiedBinding[]>();
  for (const binding of finalBindings) {
    if (binding.derivation !== "json-pointer" || consumedFinal.has(binding.id)) continue;
    const key = [binding.bindingKind, binding.bindingPath, binding.derivation].join("\0");
    const values = finalByExactJsonPointer.get(key) ?? [];
    values.push(binding);
    finalByExactJsonPointer.set(key, values);
  }
  for (const old of preBindings) {
    if (old.derivation !== "json-pointer" || consumedPre.has(old.id)) continue;
    const key = [old.bindingKind, old.bindingPath, old.derivation].join("\0");
    const candidates = (finalByExactJsonPointer.get(key) ?? [])
      .filter((candidate) => !consumedFinal.has(candidate.id));
    if (candidates.length > 1) throw new Error(`Ambiguous exact JSON pointer replacement: owner=${ownerPath} binding=${old.bindingPath} candidates=${candidates.length}.`);
    const item = candidates[0];
    if (item === undefined) continue;
    consumedPre.add(old.id);
    consumedFinal.add(item.id);
    reconciled.push({ ownerPath, bindingKind: item.bindingKind, targetState: item.targetState, disposition: "replaced", preBindingId: old.id, finalBindingId: item.id, oldSha256: old.oldSha256, finalSha256: item.oldSha256, reason: null, derivation: reconciliationDerivation(item) });
  }
  const finalByRawRange = new Map<string, IdentifiedBinding[]>();
  for (const binding of finalBindings) { const key = `${binding.start}:${binding.end}`; const values = finalByRawRange.get(key) ?? []; values.push(binding); finalByRawRange.set(key, values); }
  for (const old of preBindings) {
    if (consumedPre.has(old.id)) continue;
    const finalStart = mappedFinalOffset[old.start]; if (finalStart === undefined || finalStart < 0) continue;
    let unchanged = true; for (let offset = 0; offset < old.end - old.start; offset += 1) if (mappedFinalOffset[old.start + offset] !== finalStart + offset) { unchanged = false; break; }
    if (!unchanged) continue;
    const candidates = (finalByRawRange.get(`${finalStart}:${finalStart + old.end - old.start}`) ?? []).filter((candidate) => !consumedFinal.has(candidate.id) && candidate.bindingKind === old.bindingKind && candidate.oldSha256 === old.oldSha256 && candidate.derivation === old.derivation);
    if (candidates.length > 1) throw new Error(`Ambiguous unchanged byte-span mapping: owner=${ownerPath} binding=${old.bindingPath} candidates=${candidates.length}.`);
    const item = candidates[0]; if (item === undefined) continue;
    consumedPre.add(old.id); consumedFinal.add(item.id);
    reconciled.push({ ownerPath, bindingKind: item.bindingKind, targetState: item.targetState, disposition: "unchanged", preBindingId: old.id, finalBindingId: item.id, oldSha256: old.oldSha256, finalSha256: item.oldSha256, reason: null, derivation: reconciliationDerivation(item) });
  }
  const remainingPre = preBindings.filter((binding) => !consumedPre.has(binding.id)); const remainingFinal = finalBindings.filter((binding) => !consumedFinal.has(binding.id)); const hunks = editHunks(edits);
  const parent = hunks.map((_hunk, index) => index); const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]!)); const union = (left: number, right: number): void => { const a = find(left); const b = find(right); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  const preHunks = new Map<string, number[]>(); const finalHunks = new Map<string, number[]>();
  for (const [phase, bindings, assignments] of [["pre", remainingPre, preHunks], ["final", remainingFinal, finalHunks]] as const) {
    for (const binding of bindings) {
      const touched = hunks.map((hunk, index) => bindingTouchesHunk(binding, hunk, phase) ? index : -1).filter((index) => index >= 0);
      if (touched.length === 0) throw new Error(`Unmatched ${phase} binding after byte reconciliation: owner=${ownerPath} kind=${binding.bindingKind} binding=${binding.bindingPath}.`);
      for (let index = 1; index < touched.length; index += 1) union(touched[0]!, touched[index]!);
      assignments.set(binding.id, touched);
    }
  }
  const components = new Map<number, { pre: IdentifiedBinding[]; final: IdentifiedBinding[] }>();
  for (const [phase, bindings, assignments] of [["pre", remainingPre, preHunks], ["final", remainingFinal, finalHunks]] as const) {
    for (const binding of bindings) { const root = find(assignments.get(binding.id)?.[0] ?? -1); const component = components.get(root) ?? { pre: [], final: [] }; component[phase].push(binding); components.set(root, component); }
  }
  const orderedComponents = [...components.entries()].sort(([left], [right]) => left - right).map(([, component]) => component);
  for (const component of orderedComponents) {
    component.pre.sort((a, b) => compareUtf8(a.id, b.id)); component.final.sort((a, b) => compareUtf8(a.id, b.id));
    if (component.pre.length > 0 && component.final.length > 0) {
      const authorizedRemovals = component.pre.every((binding) => classifyK0rRemovedBindingDisposition(binding) !== undefined);
      if (!authorizedRemovals) {
        if (component.pre.length !== 1 || component.final.length !== 1 || component.pre[0]?.bindingKind !== component.final[0]?.bindingKind) throw new Error(`Ambiguous literal-aware reconciliation hunk: owner=${ownerPath} preCandidates=${component.pre.length} finalCandidates=${component.final.length}.`);
        const old = component.pre[0]!; const item = component.final[0]!; consumedPre.add(old.id); consumedFinal.add(item.id);
        reconciled.push({ ownerPath, bindingKind: item.bindingKind, targetState: item.targetState, disposition: "replaced", preBindingId: old.id, finalBindingId: item.id, oldSha256: old.oldSha256, finalSha256: item.oldSha256, reason: null, derivation: reconciliationDerivation(item) });
        continue;
      }
    }
    for (const old of component.pre) {
      const removal = classifyK0rRemovedBindingDisposition(old); if (removal === undefined) throw new Error(formatK0rRemovedBindingDiagnostic(old)); consumedPre.add(old.id);
      reconciled.push({ ownerPath, bindingKind: old.bindingKind, targetState: old.targetState, disposition: "removed", preBindingId: old.id, finalBindingId: null, oldSha256: old.oldSha256, finalSha256: null, reason: removal === "obsolete-writer" ? "obsolete-binding" : removal, derivation: reconciliationDerivation(old) });
    }
    for (const item of component.final) {
      consumedFinal.add(item.id);
      reconciled.push({ ownerPath, bindingKind: item.bindingKind, targetState: item.targetState, disposition: "added", preBindingId: null, finalBindingId: item.id, oldSha256: null, finalSha256: item.oldSha256, reason: newOwnerPaths.includes(item.ownerPath as typeof newOwnerPaths[number]) ? "new-owner" : "new-contract", derivation: reconciliationDerivation(item) });
    }
  }
  if (consumedPre.size !== preBindings.length || consumedFinal.size !== finalBindings.length) throw new Error(`Binding reconciliation did not exhaust owner candidates: owner=${ownerPath}.`);
  return reconciled;
}

export function reconcileK0rBindingEntries(priorBindings: readonly ReconciliationBinding[], finalBindings: readonly ReconciliationBinding[], ownerBytes: readonly K0rReconciliationOwnerBytes[]): JsonRecord[] {
  const pre = normalizeReconciliationBindings(priorBindings, "pre"); const final = normalizeReconciliationBindings(finalBindings, "final");
  const owners = [...ownerBytes].sort((a, b) => compareUtf8(a.ownerPath, b.ownerPath));
  for (let index = 1; index < owners.length; index += 1) if (owners[index - 1]?.ownerPath === owners[index]?.ownerPath) throw new Error(`Duplicate reconciliation owner byte authority: owner=${owners[index]?.ownerPath}.`);
  const byOwner = new Map(owners.map((owner) => [owner.ownerPath, owner])); const ownerPaths = [...new Set([...pre.map((binding) => binding.ownerPath), ...final.map((binding) => binding.ownerPath)])].sort(compareUtf8); const reconciled: JsonRecord[] = [];
  for (const ownerPath of ownerPaths) {
    const owner = byOwner.get(ownerPath); if (owner === undefined) throw new Error(`Missing reconciliation owner byte authority: owner=${ownerPath}.`);
    const ownerPre = pre.filter((binding) => binding.ownerPath === ownerPath); const ownerFinal = final.filter((binding) => binding.ownerPath === ownerPath);
    if (ownerPre.length > 0 && owner.preBytes === undefined) throw new Error(`Missing pre-owner bytes: owner=${ownerPath}.`);
    if (ownerFinal.length > 0 && owner.finalBytes === undefined) throw new Error(`Missing final-owner bytes: owner=${ownerPath}.`);
    const preSource = owner.preBytes === undefined ? new Uint8Array() : reconciliationBytes(owner.preBytes); const finalSource = owner.finalBytes === undefined ? new Uint8Array() : reconciliationBytes(owner.finalBytes);
    const locatedPre = locateReconciliationBindings(ownerPre, ownerPath, preSource); const locatedFinal = locateReconciliationBindings(ownerFinal, ownerPath, finalSource);
    reconciled.push(...reconcileOwnerBindings(ownerPath, preSource, finalSource, locatedPre, locatedFinal));
  }
  reconciled.sort((a, b) => compareUtf8(`${a.ownerPath}\0${a.bindingKind}\0${a.preBindingId ?? ""}\0${a.finalBindingId ?? ""}`, `${b.ownerPath}\0${b.bindingKind}\0${b.preBindingId ?? ""}\0${b.finalBindingId ?? ""}`));
  return reconciled;
}
async function snapshotAuthority(path: string, ownerRoot?: string): Promise<{ file: FileValue; ownerPaths: string[] }> {
  const file = await readJson(path); if (file.value.schemaVersion !== "boulder.k0r.binding-owner-snapshot.v1" || file.value.status !== "verified") throw new Error("Owner snapshot authority is invalid.");
  const ownerPaths = strings(file.value.ownerPaths, "snapshot owner paths"); const entries = records(file.value.entries, "snapshot entries");
  if (!equalStrings(ownerPaths, preExistingOwnerPaths) || entries.length !== preExistingOwnerPaths.length || !equalStrings(ownerPaths, entries.map((entry) => text(entry.path, "snapshot owner path")))) throw new Error("Owner snapshot must bind the exact nine pre-existing owners.");
  entries.forEach((entry, index) => {
    exactKeys(entry, ["path", "sha256", "size", "snapshotMode", "snapshotPath", "sourceMode"], "snapshot entry");
    const ownerPath = preExistingOwnerPaths[index];
    if (entry.path !== ownerPath || entry.snapshotPath !== `protected/pre-edit-binding-owners/${ownerPath}` || entry.snapshotMode !== "0400" || entry.sourceMode !== preExistingOwnerSourceModes.get(ownerPath) || !Number.isSafeInteger(entry.size) || (entry.size as number) < 0) throw new Error("Owner snapshot entry authority is invalid.");
    digest(entry.sha256, "snapshot owner digest");
  });
  if (file.value.pathSetSha256 !== canonicalDigest(ownerPaths)) throw new Error("Owner snapshot path-set digest is invalid.");
  if (file.value.entriesSha256 !== canonicalDigest(entries)) throw new Error("Owner snapshot entries digest is invalid.");
  const projection = { ...file.value }; delete projection.receiptSha256;
  if (file.value.receiptSha256 !== canonicalDigest(projection)) throw new Error("Owner snapshot self digest is invalid.");
  if (ownerRoot !== undefined) {
    const ownerRootReal = await realpath(ownerRoot);
    if (ownerRootReal !== resolve(ownerRoot)) throw new Error("Owner snapshot root is not canonical.");
    for (const entry of entries) {
      const ownerPath = text(entry.path, "snapshot owner");
      const absolute = join(ownerRootReal, ownerPath);
      assertContained(ownerRootReal, absolute, "snapshot owner");
      const state = await lstat(absolute);
      const bytes = await readRegular(absolute);
      if ((state.mode & 0o777) !== 0o400 || prefixedDigest(bytes) !== entry.sha256 || bytes.byteLength !== entry.size) throw new Error("Immutable owner snapshot differs from its binding.");
    }
  }
  return { file, ownerPaths };
}

async function additionalSnapshotAuthority(
  path: string,
): Promise<{ file: FileValue; entries: JsonRecord[] }> {
  const file = await readJson(path);
  if (
    file.value.schemaVersion !== "boulder.k0r.additional-binding-owner-snapshot.v1"
    || file.value.status !== "verified"
  ) throw new Error("Additional owner snapshot authority is invalid.");
  const ownerPaths = strings(file.value.ownerPaths, "additional snapshot owner paths");
  const expectedPaths = approvedAdditionalSnapshots.map((snapshotPath) =>
    snapshotPath.slice("protected/pre-edit-binding-owners/".length)
  );
  const entries = records(file.value.entries, "additional snapshot entries");
  if (
    !equalStrings(ownerPaths, expectedPaths)
    || entries.length !== expectedPaths.length
    || !equalStrings(ownerPaths, entries.map((entry) => text(entry.path, "additional snapshot owner path")))
  ) throw new Error("Additional owner snapshot must bind the exact three approved owners.");
  entries.forEach((entry, index) => {
    exactKeys(entry, ["path", "sha256", "size", "snapshotMode", "snapshotPath", "sourceMode"], "additional snapshot entry");
    const ownerPath = expectedPaths[index];
    if (
      entry.path !== ownerPath
      || entry.snapshotPath !== approvedAdditionalSnapshots[index]
      || entry.snapshotMode !== "0400"
      || entry.sourceMode !== 0o600
      || !Number.isSafeInteger(entry.size)
      || (entry.size as number) < 0
    ) throw new Error("Additional owner snapshot entry authority is invalid.");
    digest(entry.sha256, "additional snapshot owner digest");
  });
  if (file.value.pathSetSha256 !== canonicalDigest(ownerPaths)) throw new Error("Additional owner snapshot path-set digest is invalid.");
  if (file.value.entriesSha256 !== canonicalDigest(entries)) throw new Error("Additional owner snapshot entries digest is invalid.");
  const projection = { ...file.value }; delete projection.receiptSha256;
  if (file.value.receiptSha256 !== canonicalDigest(projection)) throw new Error("Additional owner snapshot self digest is invalid.");
  return { file, entries };
}

function normalizeSnapshotMerkle(snapshot: FileValue): void {
  if (snapshot.value.merkle !== undefined) return;
  snapshot.value.merkle = {
    rootSha256: digest(snapshot.value.entriesSha256, "snapshot entries digest"),
  };
}

function verifyRescannedPreBindings(pre: FileValue, snapshot: { readonly file: FileValue; readonly ownerPaths: readonly string[] }, scan: { readonly bindings: readonly Literal[]; readonly owners: readonly ScannedOwner[] }): void {
  if (pre.value.schemaVersion !== "boulder.k0r.binding-scan.pre.v1" || pre.value.status !== "complete" || pre.value.ownerSnapshotSha256 !== snapshot.file.sha256) throw new Error("Pre-scan owner snapshot binding is stale.");
  if (!equalStrings(strings(pre.value.ownerPaths, "pre-scan owner paths"), snapshot.ownerPaths)) throw new Error("Pre-scan owner path authority is stale.");
  const snapshotEntries = new Map(records(snapshot.file.value.entries, "snapshot entries").map((entry) => [text(entry.path, "snapshot owner path"), entry]));
  for (const owner of scan.owners) { const entry = snapshotEntries.get(owner.ownerPath); if (entry === undefined || entry.sha256 !== prefixedDigest(owner.bytes) || entry.size !== owner.bytes.byteLength) throw new Error(`Rescanned owner bytes differ from the immutable snapshot: ${owner.ownerPath}.`); }
  const rescanned = scan.bindings.map(publicBinding); const recorded = records(pre.value.bindings, "pre bindings");
  if (canonicalizeK0rJson(recorded) !== canonicalizeK0rJson(rescanned) || pre.value.bindingsSha256 !== canonicalDigest(rescanned)) throw new Error("Pre-scan bindings differ from the immutable owner-byte rescan.");
}

async function verifyPreScan(path: string, snapshot: { readonly file: FileValue; readonly ownerPaths: readonly string[] }, privateRoot: string): Promise<FileValue> {
  assertCanonicalPrivatePath(path, privateRoot, "receipts/k0r-binding-scan.pre.json", "pre binding scan");
  const file = await readJson(path);
  exactKeys(file.value, ["bindingSchemaInventory", "bindingSchemaInventorySha256", "bindings", "bindingsSha256", "evidenceContract", "ownerPaths", "ownerSnapshotSha256", "receiptSha256", "scanner", "schemaVersion", "sourceSchemaInventory", "sourceSchemaInventorySha256", "status", "typescript"], "pre binding scan");
  if (file.value.schemaVersion !== "boulder.k0r.binding-scan.pre.v1" || file.value.status !== "complete" || file.value.ownerSnapshotSha256 !== snapshot.file.sha256 || !equalStrings(strings(file.value.ownerPaths, "pre-scan owner paths"), snapshot.ownerPaths)) throw new Error("Pre-scan authority is stale.");
  verifyCanonicalSelfDigest(file, "pre binding scan");
  const bindings = records(file.value.bindings, "pre bindings");
  const bindingSchemas = records(file.value.bindingSchemaInventory, "pre binding schema inventory");
  const sourceSchemas = records(file.value.sourceSchemaInventory, "pre source schema inventory");
  if (file.value.bindingsSha256 !== canonicalDigest(bindings) || file.value.bindingSchemaInventorySha256 !== canonicalDigest(bindingSchemas) || file.value.sourceSchemaInventorySha256 !== canonicalDigest(sourceSchemas)) throw new Error("Pre-scan aggregate digest is invalid.");
  const type = record(file.value.typescript, "pre-scan TypeScript binding");
  exactKeys(type, ["artifactSha256", "bindingReceiptPath", "bindingReceiptSha256", "equivalentSourceTreeSha256", "packageJsonSha256", "sourcePathSha256", "sourceTreeSha256"], "pre-scan TypeScript binding");
  if (type.bindingReceiptPath !== "receipts/typescript-binding.json") throw new Error("Pre-scan TypeScript receipt path is invalid.");
  for (const key of Object.keys(type).filter((key) => key.endsWith("Sha256"))) digest(type[key], `pre-scan TypeScript ${key}`);
  const typeReceipt = await readJson(join(privateRoot, "receipts/typescript-binding.json"));
  if (type.bindingReceiptSha256 !== typeReceipt.sha256) throw new Error("Pre-scan TypeScript receipt binding is stale.");
  const evidence = record(file.value.evidenceContract, "pre-scan evidence contract");
  exactKeys(evidence, ["exactPaths", "observed", "observedSha256", "pathSetSha256"], "pre-scan evidence contract");
  const exactPaths = strings(evidence.exactPaths, "pre-scan evidence paths");
  const observed = records(evidence.observed, "pre-scan observed evidence");
  if (!equalStrings(exactPaths, evidenceContractPaths) || evidence.pathSetSha256 !== canonicalDigest(evidenceContractPaths) || observed.length !== evidenceContractPaths.length || evidence.observedSha256 !== canonicalDigest(observed)) throw new Error("Pre-scan evidence-contract aggregate is invalid.");
  observed.forEach((entry, index) => {
    exactKeys(entry, ["path", "sha256", "state"], "pre-scan observed evidence entry");
    if (entry.path !== evidenceContractPaths[index] || (entry.state !== "present" && entry.state !== "absent") || (entry.state === "present" ? !digestPattern.test(String(entry.sha256)) : entry.sha256 !== null)) throw new Error("Pre-scan observed evidence entry is invalid.");
  });
  const scanner = record(file.value.scanner, "pre-scan scanner");
  exactKeys(scanner, ["argv", "cwd", "stderrSha256", "stdoutSha256"], "pre-scan scanner");
  const argv = strings(scanner.argv, "pre-scan scanner argv");
  if (scanner.cwd !== repositoryRoot || argv.at(-2) !== "--output" || resolve(argv.at(-1) ?? "") !== resolve(path)) throw new Error("Pre-scan scanner identity is invalid.");
  digest(scanner.stdoutSha256, "pre-scan stdout digest");
  digest(scanner.stderrSha256, "pre-scan stderr digest");
  return file;
}

export async function scanK0rBindings(options: K0rScanBindingsOptions): Promise<JsonRecord> {
  const privateRoot = privateRootFor(options.output);
  await verifyK0rPromotion(privateRoot);
  if (options.stage === "pre-edit-snapshot") {
    if (options.plan !== undefined || options.focusedGateReceipt !== undefined) throw new Error("Pre-edit scan forbids focused-gate inputs.");
  } else {
    if (options.plan === undefined || options.focusedGateReceipt === undefined) throw new Error("Final scan requires plan and focused-gate receipt inputs.");
    const [scope, provenance, planBytes] = await Promise.all([
      readJson(join(privateRoot, "authorizations/k0r-a.json")),
      readJson(join(privateRoot, "authorizations/k0r-a.provenance.json")),
      readRegular(options.plan),
    ]);
    validateScope(scope, provenance, planBytes);
    await verifyFocusedGateReceipt(options.focusedGateReceipt, privateRoot, "post-materialization", scope, planBytes, await gitIdentity());
  }
  const typescript = await verifyTypeScript(options); const presentPaths = new Set(await trackedPaths()); for (const path of await workingTreePaths()) addPresentPath(presentPaths, path); const top = await gitTopLevel(); evidenceContractPaths.forEach((path) => addPresentPath(presentPaths, path));
  if (options.stage === "pre-edit-snapshot") {
    if (options.ownerRoot === undefined || options.ownerSnapshot === undefined || options.preScan !== undefined || options.trackedFreeze !== undefined || options.materializationReceipt !== undefined) throw new Error("Pre-edit scan requires only owner-root and owner-snapshot stage inputs.");
    const snapshot = await snapshotAuthority(options.ownerSnapshot, options.ownerRoot); const scan = await scanOwners(snapshot.ownerPaths, options.ownerRoot, typescript.api, presentPaths, top); const sourceInventory = await sourceSchemas(typescript.api); const bindings = scan.bindings.map(publicBinding);
    const observed = await Promise.all(evidenceContractPaths.map(async (path) => { const state = await lstat(join(repositoryRoot, path)).catch((error: unknown) => isEnoent(error) ? undefined : Promise.reject(error)); return state === undefined ? { path, state: "absent", sha256: null } : { path, state: "present", sha256: prefixedDigest(await readRegular(join(repositoryRoot, path))) }; }));
    const partial: JsonRecord = { schemaVersion: "boulder.k0r.binding-scan.pre.v1", status: "complete", ownerSnapshotSha256: snapshot.file.sha256, scanner: generator(), typescript: typescript.binding, ownerPaths: snapshot.ownerPaths, bindings, bindingsSha256: canonicalDigest(bindings), bindingSchemaInventory: scan.schemas, bindingSchemaInventorySha256: canonicalDigest(scan.schemas), sourceSchemaInventory: sourceInventory, sourceSchemaInventorySha256: canonicalDigest(sourceInventory), evidenceContract: { exactPaths: evidenceContractPaths, pathSetSha256: canonicalDigest(evidenceContractPaths), observed, observedSha256: canonicalDigest(observed) } };
    const receipt = { ...partial, receiptSha256: canonicalDigest(partial) }; await exclusiveCanonical(options.output, privateRoot, receipt); return receipt;
  }
  if (options.preScan === undefined || options.trackedFreeze === undefined || options.materializationReceipt === undefined || options.ownerRoot !== undefined || options.ownerSnapshot !== undefined) throw new Error("Final scan requires exactly pre-scan, tracked-freeze, materialization, plan, and focused-gate inputs.");
  const scope = await readJson(join(privateRoot, "authorizations/k0r-a.json"));
  assertCanonicalTrackedFreeze(options.trackedFreeze, privateRoot);
  const snapshotPath = resolve(privateRoot, "receipts/k0r-binding-snapshot.json"); const snapshotRoot = resolve(privateRoot, "protected/pre-edit-binding-owners"); const snapshot = await snapshotAuthority(snapshotPath, snapshotRoot);
  const [pre, freeze, materialization] = await Promise.all([verifyPreScan(options.preScan, snapshot, privateRoot), verifyFreeze(options.trackedFreeze, scope), verifyMaterialization(options.materializationReceipt)]);
  if (record(materialization.value.trackedFreeze, "materialization freeze").sha256 !== freeze.sha256) throw new Error("Materialization tracked-freeze binding is stale.");
  const ownerPaths = [...snapshot.ownerPaths, ...newOwnerPaths].sort(compareUtf8); if (ownerPaths.length !== 12) throw new Error("Final owner authority is not exactly twelve paths.");
  if (!Array.isArray(freeze.value.overlayPaths) || freeze.value.overlayPaths.some((path) => typeof path !== "string")) throw new Error("Tracked freeze overlay paths are invalid.");
  const finalPresentPaths = new Set(presentPaths);
  for (const path of freeze.value.overlayPaths) finalPresentPaths.add(text(path, "tracked freeze overlay path"));
  const [preRescan, finalScan] = await Promise.all([scanOwners(snapshot.ownerPaths, snapshotRoot, typescript.api, presentPaths, top), scanOwners(ownerPaths, repositoryRoot, typescript.api, finalPresentPaths, top)]); verifyRescannedPreBindings(pre, snapshot, preRescan);
  const historicalBinding = finalScan.bindings.find((binding) => binding.targetState === "historical-missing"); if (historicalBinding !== undefined) throw new Error(formatK0rHistoricalBindingDiagnostic(historicalBinding));
  const preOwners = new Map(preRescan.owners.map((owner) => [owner.ownerPath, owner.bytes])); const finalOwners = new Map(finalScan.owners.map((owner) => [owner.ownerPath, owner.bytes])); const reconciliationOwners = ownerPaths.map((ownerPath) => ({ ownerPath, preBytes: preOwners.get(ownerPath), finalBytes: finalOwners.get(ownerPath) }));
  const reconciled = reconcileK0rBindingEntries(preRescan.bindings, finalScan.bindings, reconciliationOwners); const sourceInventory = await sourceSchemas(typescript.api);
  const partial: JsonRecord = { schemaVersion: "boulder.k0r.binding-reconciliation.v1", status: "complete", materializationSha256: materialization.sha256, preEditScan: { path: "receipts/k0r-binding-scan.pre.json", sha256: pre.sha256, schemaVersion: "boulder.k0r.binding-scan.pre.v1" }, scanner: generator(), typescript: typescript.binding, ownerPaths, evidenceContractPaths, evidenceContractPathsSha256: canonicalDigest(evidenceContractPaths), bindings: reconciled, bindingsSha256: canonicalDigest(reconciled), bindingSchemaInventory: finalScan.schemas, bindingSchemaInventorySha256: canonicalDigest(finalScan.schemas), sourceSchemaInventory: sourceInventory, sourceSchemaInventorySha256: canonicalDigest(sourceInventory) };
  const receipt = { ...partial, receiptSha256: canonicalDigest(partial) };
  assertCanonicalPrivatePath(options.output, privateRoot, "receipts/k0r-binding-scan.json", "final binding scan");
  await exclusiveCanonical(options.output, privateRoot, receipt);
  const finalFile = await readJson(options.output);
  verifyCanonicalSelfDigest(finalFile, "final binding scan");
  validateK0rFinalScanProjection(finalFile.value, { materializationSha256: materialization.sha256, preEditScanSha256: pre.sha256, ownerPaths, typescript: typescript.binding, bindings: reconciled, bindingSchemaInventory: finalScan.schemas, sourceSchemaInventory: sourceInventory });
  return receipt;
}

async function verifyMaterialization(path: string): Promise<FileValue> {
  const privateRoot = privateRootFor(path);
  assertCanonicalPrivatePath(path, privateRoot, "receipts/k0r-materialization.json", "materialization receipt");
  const snapshot = await snapshotAuthority(join(privateRoot, "receipts/k0r-binding-snapshot.json"), join(privateRoot, "protected/pre-edit-binding-owners"));
  const [pre, freeze, file] = await Promise.all([verifyPreScan(join(privateRoot, "receipts/k0r-binding-scan.pre.json"), snapshot, privateRoot), verifyFreeze(join(privateRoot, "protected/tracked-freeze.json")), readJson(path)]);
  exactKeys(file.value, ["outputMerkleSha256", "outputPathSetSha256", "outputs", "ownerSnapshot", "preEditScan", "receiptSha256", "scannerOwnerOutputs", "schemaVersion", "status", "trackedFreeze", "writer"], "materialization receipt");
  if (file.value.schemaVersion !== "boulder.k0r.evidence-materialization.v1" || file.value.status !== "materialized_pending_binding_scan") throw new Error("Materialization receipt identity is invalid.");
  const snapshotBinding = record(file.value.ownerSnapshot, "materialization owner snapshot");
  const preBinding = record(file.value.preEditScan, "materialization pre-scan");
  const freezeBinding = record(file.value.trackedFreeze, "materialization freeze");
  for (const [binding, expectedPath, expectedSha, label] of [[snapshotBinding, "receipts/k0r-binding-snapshot.json", snapshot.file.sha256, "owner snapshot"], [preBinding, "receipts/k0r-binding-scan.pre.json", pre.sha256, "pre-scan"], [freezeBinding, "protected/tracked-freeze.json", freeze.sha256, "tracked freeze"]] as const) {
    exactKeys(binding, ["path", "sha256"], `materialization ${label}`);
    if (binding.path !== expectedPath || binding.sha256 !== expectedSha) throw new Error(`Materialization ${label} binding is stale.`);
  }
  if (!equalStrings(strings(file.value.scannerOwnerOutputs, "materialization scanner owner outputs"), scannerOwnerOutputs)) throw new Error("Materialization scanner-owner output authority is invalid.");
  const outputs = records(file.value.outputs, "materialization outputs"); if (!equalStrings(outputs.map((entry) => text(entry.path, "output path")), materializedPaths)) throw new Error("Materialization output ownership is not exact.");
  outputs.forEach((entry) => {
    exactKeys(entry, ["finalSha256", "mode", "path", "priorSha256", "priorState"], "materialization output");
    digest(entry.finalSha256, "materialization output digest");
    if (entry.priorState !== "present" && entry.priorState !== "absent") throw new Error("Materialization prior state is invalid.");
    if (entry.priorState === "present" ? !digestPattern.test(String(entry.priorSha256)) : entry.priorSha256 !== null) throw new Error("Materialization prior digest is invalid.");
  });
  if (file.value.outputPathSetSha256 !== canonicalDigest(materializedPaths) || file.value.outputMerkleSha256 !== merkle(outputs.map((entry) => ({ path: text(entry.path, "output path"), sha256: digest(entry.finalSha256, "output digest") })))) throw new Error("Materialization aggregate digest is invalid.");
  const projection = { ...file.value }; delete projection.receiptSha256; if (file.value.receiptSha256 !== canonicalDigest(projection)) throw new Error("Materialization self digest is invalid.");
  const writer = record(file.value.writer, "materialization writer");
  exactKeys(writer, ["argv", "cwd", "stderrSha256", "stdoutSha256"], "materialization writer");
  const writerArgv = strings(writer.argv, "materialization writer argv");
  const outputIndex = writerArgv.indexOf("--materialization-output");
  if (writer.cwd !== repositoryRoot || outputIndex < 0 || resolve(writerArgv[outputIndex + 1] ?? "") !== resolve(path)) throw new Error("Materialization writer identity is invalid.");
  digest(writer.stdoutSha256, "materialization writer stdout digest");
  digest(writer.stderrSha256, "materialization writer stderr digest");
  for (const entry of outputs) if (prefixedDigest(await readRegular(join(repositoryRoot, text(entry.path, "output path")))) !== entry.finalSha256 || entry.mode !== "100644") throw new Error("A materialized output changed.");
  return file;
}

export async function deriveK0rHeadOverlayBase(headCommit: string, entries: readonly JsonRecord[]): Promise<JsonRecord[]> {
  const result: JsonRecord[] = [];
  for (const entry of entries) {
    const path = text(entry.path, "freeze entry path");
    const listing = await boundedRaw(["git", "ls-tree", "-rz", "--full-tree", headCommit, "--", path], 64 * 1024);
    if (listing.byteLength === 0) {
      result.push({ path, baseState: "absent", baseSha256: null, replacementSha256: entry.sha256, owner: "authorized tracked overlay" });
      continue;
    }
    const listingText = decoder.decode(listing);
    const records = listingText.split("\0").filter(Boolean);
    if (records.length !== 1) throw new Error(`HEAD overlay path has ambiguous tree records: ${path}.`);
    const match = /^100644 blob ([0-9a-f]+)\t(.+)$/u.exec(records[0]!);
    if (match === null || match[2] !== path) throw new Error(`HEAD overlay path is not one exact regular blob: ${path}.`);
    const objectId = match[1]!;
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(objectId)) throw new Error(`HEAD overlay blob object ID is invalid: ${path}.`);
    const sizeText = oneLine(await bounded(["git", "cat-file", "-s", objectId]), "HEAD overlay blob size");
    if (!/^(?:0|[1-9][0-9]*)$/u.test(sizeText)) throw new Error(`HEAD overlay blob size is invalid: ${path}.`);
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size > 8 * 1024 * 1024) throw new Error(`HEAD overlay blob exceeds the bounded size: ${path}.`);
    const bytes = await boundedRaw(["git", "cat-file", "blob", objectId], Math.max(1, size));
    if (bytes.byteLength !== size) throw new Error(`HEAD overlay blob size changed: ${path}.`);
    result.push({ path, baseState: "present", baseSha256: prefixedDigest(bytes), replacementSha256: entry.sha256, owner: "authorized tracked overlay" });
  }
  return result;
}

async function baselineTransition(scope: FileValue, provenance: FileValue, baseline: FileValue, priorExit: FileValue, freeze: FileValue, pre: FileValue, snapshot: FileValue, typescriptReceipt: FileValue): Promise<JsonRecord> {
  const initialEntries = records(baseline.value.entries, "prior baseline entries"); const freezeEntriesValue = records(freeze.value.entries, "freeze entries"); const sourceInventory = pre.value.sourceSchemaInventory;
  const type = record(pre.value.typescript, "pre-scan TypeScript binding");
  exactKeys(type, ["artifactSha256", "bindingReceiptPath", "bindingReceiptSha256", "equivalentSourceTreeSha256", "packageJsonSha256", "sourcePathSha256", "sourceTreeSha256"], "pre-scan TypeScript binding");
  if (type.bindingReceiptPath !== "receipts/typescript-binding.json" || type.bindingReceiptSha256 !== typescriptReceipt.sha256) throw new Error("Pre-scan TypeScript binding receipt is stale.");
  return { schemaVersion: "boulder.k0r.baseline-transition.v1", status: "captured_pending_exact_byte_review", authority: { payloadPath: "authorizations/k0r-a.json", payloadRawSha256: scope.sha256, payloadJcsSha256: canonicalDigest(scope.value), provenancePath: "authorizations/k0r-a.provenance.json", provenanceSha256: provenance.sha256, authorizedScope: scope.value.authorizedScope, prohibitedAuthorities }, priorBaseline: { isolatedBaseCommit: baseline.value.isolatedBaseCommit ?? scope.value.replacementHeadCommit, isolatedBaseTree: baseline.value.isolatedBaseTree ?? scope.value.replacementHeadTree, exitStatePath: "protected/prior-exit-state.json", exitStateSha256: priorExit.sha256, protectedInventorySha256: canonicalDigest(initialEntries), entries: initialEntries }, replacementBase: { headCommit: freeze.value.headCommit, headTree: freeze.value.headTree }, preExistingCommittedDrift: [], approvedWorkingTreeDelta: await deriveK0rHeadOverlayBase(text(freeze.value.headCommit, "freeze HEAD"), freezeEntriesValue), sourceSchemaInventory: sourceInventory, overlayAuthority: { allowedPaths: freeze.value.overlayPaths, merkleSha256: freeze.value.overlayMerkleRoot }, generator: { ...generator(), dependencies: { typescriptBinding: { path: type.bindingReceiptPath, sha256: type.bindingReceiptSha256, sourceTreeSha256: type.sourceTreeSha256, sourcePathSha256: type.sourcePathSha256, equivalentSourceTreeSha256: type.equivalentSourceTreeSha256, packageJsonSha256: type.packageJsonSha256, artifactSha256: type.artifactSha256, externalReadOnly: true }, bindingOwnerSnapshot: { path: "receipts/k0r-binding-snapshot.json", sha256: snapshot.sha256, pathSetSha256: snapshot.value.pathSetSha256, merkleSha256: record(snapshot.value.merkle, "snapshot merkle").rootSha256 }, bindingPreScan: { path: "receipts/k0r-binding-scan.pre.json", sha256: pre.sha256, ownerSnapshotSha256: pre.value.ownerSnapshotSha256, bindingsSha256: pre.value.bindingsSha256, sourceSchemaInventorySha256: pre.value.sourceSchemaInventorySha256 } } } };
}

export async function materializeK0rEvidence(options: K0rMaterializeEvidenceOptions): Promise<JsonRecord> {
  const privateRoot = privateRootFor(options.scopeAuthorization); await verifyK0rPromotion(privateRoot); await recoverK0rMaterialization(privateRoot); const scope = await readJson(options.scopeAuthorization); const provenance = await readJson(options.scopeProvenance); validateScope(scope, provenance); assertCanonicalTrackedFreeze(options.trackedFreeze, privateRoot);
  for (const [actual, expected, label] of [
    [options.scopeAuthorization, "authorizations/k0r-a.json", "scope authorization"],
    [options.scopeProvenance, "authorizations/k0r-a.provenance.json", "scope provenance"],
    [options.preScan, "receipts/k0r-binding-scan.pre.json", "pre binding scan"],
    [options.priorApproval, "protected/prior-k0r/approval-provenance.json", "prior approval"],
    [options.priorBaseline, "protected/prior-k0r.inventory.json", "prior baseline"],
    [options.priorSnapshot, "protected/prior-k0r", "prior snapshot"],
    [options.priorExitState, "protected/prior-exit-state.json", "prior exit state"],
    [options.materializationOutput, "receipts/k0r-materialization.json", "materialization output"],
  ] as const) assertCanonicalPrivatePath(actual, privateRoot, expected, label);
  const snapshotAuthorityValue = await snapshotAuthority(join(privateRoot, "receipts/k0r-binding-snapshot.json"), join(privateRoot, "protected/pre-edit-binding-owners"));
  const [pre, priorApproval, priorBaseline, priorExit, freeze] = await Promise.all([verifyPreScan(options.preScan, snapshotAuthorityValue, privateRoot), readRegular(options.priorApproval), readJson(options.priorBaseline), readJson(options.priorExitState), verifyFreeze(options.trackedFreeze, scope)]);
  const snapshot = snapshotAuthorityValue.file;
  validateScope(scope, provenance); if (scope.value.priorExitStateSha256 !== priorExit.sha256 || scope.value.priorEvidenceInventorySha256 !== priorBaseline.value.entriesSha256) throw new Error("Prior-state authority is stale.");
  normalizeSnapshotMerkle(snapshot);
  const snapshotRoot = await realpath(options.priorSnapshot); assertContained(privateRoot, snapshotRoot, "prior snapshot"); const priorApprovalExpected = await readRegular(join(snapshotRoot, "approval-provenance.json")); if (prefixedDigest(priorApproval) !== prefixedDigest(priorApprovalExpected)) throw new Error("Prior approval is not preserved from the immutable snapshot.");
  const baseline = await buildK0rStaticBaseline(repositoryRoot); const typescriptReceipt = await readJson(join(privateRoot, "receipts/typescript-binding.json")); const transition = await baselineTransition(scope, provenance, priorBaseline, priorExit, freeze, pre, snapshot, typescriptReceipt); const adr = await readRegular(join(snapshotRoot, "superseding-adr.md"));
  const content = new Map<string, string>([[materializedPaths[0], `${canonicalizeK0rJson(baseline.acceptance)}\n`], [materializedPaths[1], `${canonicalizeK0rJson(transition)}\n`], [materializedPaths[2], ""], [materializedPaths[3], `${canonicalizeK0rJson(baseline.isolation)}\n`], [materializedPaths[4], decoder.decode(adr)], [materializedPaths[5], `${canonicalizeK0rJson(baseline.inventory)}\n`]]);
  const stagedFiles = () => materializedPaths.map((path) => ({ path, bytes: content.get(path) ?? (() => { throw new Error("Incomplete six-output materialization."); })() }));
  const oracle = await runK0rIndependentOracle({ root: repositoryRoot, stagedFiles: stagedFiles() });
  content.set(materializedPaths[2], `${canonicalizeK0rJson(oracle)}\n`);
  const verifiedOracle = await runK0rIndependentOracle({ root: repositoryRoot, stagedFiles: stagedFiles() });
  if (canonicalizeK0rJson(verifiedOracle) !== canonicalizeK0rJson(oracle)) throw new Error("Staged oracle report is not stable over the final output set.");
  const before = new Map<string, Uint8Array | null>();
  for (const path of materializedPaths) {
    const state = await lstat(join(repositoryRoot, path)).catch((error: unknown) => isEnoent(error) ? undefined : Promise.reject(error));
    before.set(path, state === undefined ? null : await readRegular(join(repositoryRoot, path)));
  }
  try {
    await writeMaterializationJournal(privateRoot, before, { scope, freeze, snapshot });
    for (const path of materializedPaths) {
      const value = content.get(path);
      if (value === undefined) throw new Error("Incomplete six-output materialization.");
      await replaceRepositoryFile(path, value);
    }
    const outputs = await Promise.all(materializedPaths.map(async (path) => {
      const prior = before.get(path);
      if (prior === undefined) throw new Error("Materialization rollback snapshot is incomplete.");
      const intended = content.get(path);
      if (intended === undefined) throw new Error("Incomplete six-output materialization.");
      const intendedBytes = encoder.encode(intended);
      const current = await readRegular(join(repositoryRoot, path));
      if (current.byteLength !== intendedBytes.byteLength || current.some((byte, index) => byte !== intendedBytes[index])) throw new Error(`Materialized output differs from intended bytes: ${path}.`);
      return { path, priorState: prior === null ? "absent" : "present", priorSha256: prior === null ? null : prefixedDigest(prior), finalSha256: prefixedDigest(intendedBytes), mode: "100644" };
    }));
    const partial: JsonRecord = { schemaVersion: "boulder.k0r.evidence-materialization.v1", status: "materialized_pending_binding_scan", trackedFreeze: { path: "protected/tracked-freeze.json", sha256: freeze.sha256 }, ownerSnapshot: { path: "receipts/k0r-binding-snapshot.json", sha256: snapshot.sha256 }, preEditScan: { path: "receipts/k0r-binding-scan.pre.json", sha256: pre.sha256 }, outputs, outputPathSetSha256: canonicalDigest(materializedPaths), outputMerkleSha256: merkle(outputs.map((entry) => ({ path: entry.path, sha256: entry.finalSha256 }))), scannerOwnerOutputs, writer: generator() };
    const receipt = { ...partial, receiptSha256: canonicalDigest(partial) };
    await exclusiveCanonical(options.materializationOutput, privateRoot, receipt);
    await verifyMaterialization(options.materializationOutput);
    await unlink(materializationJournalPath(privateRoot));
    await syncDirectory(dirname(materializationJournalPath(privateRoot)));
    return receipt;
  } catch (error) {
    await restoreMaterializedFiles(before);
    await unlink(materializationJournalPath(privateRoot)).catch((unlinkError: unknown) => { if (!isEnoent(unlinkError)) throw unlinkError; });
    throw error;
  }
}

function receiptBinding(file: FileValue, path: string, keys: readonly string[]): JsonRecord { const result: JsonRecord = { path, sha256: file.sha256 }; for (const key of keys) result[key] = file.value[key]; return result; }
export async function finalizeK0rPendingTransition(options: K0rFinalizePendingTransitionOptions): Promise<JsonRecord> {
  const root = privateRootFor(options.scopeAuthorization);
  await verifyK0rPromotion(root);
  const [scope, provenance, planBytes] = await Promise.all([
    readJson(options.scopeAuthorization),
    readJson(options.scopeProvenance),
    readRegular(options.plan),
  ]);
  validateScope(scope, provenance, planBytes);
  await verifyFocusedGateReceipt(options.focusedGateReceipt, root, "post-materialization", scope, planBytes, await gitIdentity());
  assertCanonicalTrackedFreeze(options.trackedFreeze, root);
  for (const [actual, expected, label] of [
    [options.scopeAuthorization, "authorizations/k0r-a.json", "scope authorization"],
    [options.scopeProvenance, "authorizations/k0r-a.provenance.json", "scope provenance"],
    [options.focusedGateReceipt, k0rFocusedGateReceiptPaths["post-materialization"], "focused gate receipt"],
    [options.materializationReceipt, "receipts/k0r-materialization.json", "materialization receipt"],
    [options.bindingScanReceipt, "receipts/k0r-binding-scan.json", "binding scan receipt"],
    [options.priorApproval, "protected/prior-k0r/approval-provenance.json", "prior approval"],
    [options.priorBaseline, "protected/prior-k0r.inventory.json", "prior baseline"],
    [options.priorSnapshot, "protected/prior-k0r", "prior snapshot"],
    [options.priorExitState, "protected/prior-exit-state.json", "prior exit state"],
    [options.typescriptBinding, "receipts/typescript-binding.json", "TypeScript binding"],
    [options.pendingTransitionOutput, "protected/k0r-transition.pending.json", "pending transition output"],
  ] as const) assertCanonicalPrivatePath(actual, root, expected, label);
  const snapshotAuthorityValue = await snapshotAuthority(join(root, "receipts/k0r-binding-snapshot.json"), join(root, "protected/pre-edit-binding-owners"));
  const snapshot = snapshotAuthorityValue.file;
  const [materialization, scan, priorApproval, priorBaseline, priorExit, freeze, pre] = await Promise.all([verifyMaterialization(options.materializationReceipt), readJson(options.bindingScanReceipt), readRegular(options.priorApproval), readJson(options.priorBaseline), readJson(options.priorExitState), verifyFreeze(options.trackedFreeze, scope), verifyPreScan(join(root, "receipts/k0r-binding-scan.pre.json"), snapshotAuthorityValue, root)]);
  normalizeSnapshotMerkle(snapshot);
  validateScope(scope, provenance);
  assertCanonicalPrivatePath(options.bindingScanReceipt, root, "receipts/k0r-binding-scan.json", "final binding scan");
  verifyCanonicalSelfDigest(scan, "final binding scan");
  const owners = [...strings(snapshot.value.ownerPaths, "snapshot owner paths"), ...newOwnerPaths].sort(compareUtf8);
  assertCanonicalPrivatePath(options.typescriptBinding, root, "receipts/typescript-binding.json", "TypeScript binding");
  const typescript = await verifyTypeScript({ stage: "final-owners", typescriptBinding: options.typescriptBinding, typescriptRoot: options.typescriptRoot, typescriptArtifactSha256: options.typescriptArtifactSha256, typescriptTreeSha256: options.typescriptTreeSha256, output: options.bindingScanReceipt });
  const snapshotRootForScan = await realpath(join(root, "protected/pre-edit-binding-owners"));
  const presentPaths = new Set(await trackedPaths());
  for (const path of await workingTreePaths()) addPresentPath(presentPaths, path);
  evidenceContractPaths.forEach((path) => addPresentPath(presentPaths, path));
  const top = await gitTopLevel();
  const finalPresentPaths = new Set(presentPaths);
  for (const path of strings(freeze.value.overlayPaths, "tracked freeze overlay paths")) finalPresentPaths.add(path);
  await snapshotAuthority(join(root, "receipts/k0r-binding-snapshot.json"), snapshotRootForScan);
  const [preRescan, finalRescan] = await Promise.all([
    scanOwners(snapshotAuthorityValue.ownerPaths, snapshotRootForScan, typescript.api, presentPaths, top),
    scanOwners(owners, repositoryRoot, typescript.api, finalPresentPaths, top),
  ]);
  verifyRescannedPreBindings(pre, snapshotAuthorityValue, preRescan);
  if (finalRescan.bindings.some((binding) => binding.targetState === "historical-missing")) throw new Error("Final rescan contains historical-missing bindings.");
  const preOwners = new Map(preRescan.owners.map((owner) => [owner.ownerPath, owner.bytes]));
  const finalOwners = new Map(finalRescan.owners.map((owner) => [owner.ownerPath, owner.bytes]));
  const reconciled = reconcileK0rBindingEntries(preRescan.bindings, finalRescan.bindings, owners.map((ownerPath) => ({ ownerPath, preBytes: preOwners.get(ownerPath), finalBytes: finalOwners.get(ownerPath) })));
  const sourceInventory = await sourceSchemas(typescript.api);
  validateK0rFinalScanProjection(scan.value, { materializationSha256: materialization.sha256, preEditScanSha256: pre.sha256, ownerPaths: owners, typescript: typescript.binding, bindings: reconciled, bindingSchemaInventory: finalRescan.schemas, sourceSchemaInventory: sourceInventory });
  if (pre.value.ownerSnapshotSha256 !== snapshot.sha256) throw new Error("Final scan ancestry is stale.");
  const snapshotRoot = await realpath(options.priorSnapshot); if (prefixedDigest(priorApproval) !== prefixedDigest(await readRegular(join(snapshotRoot, "approval-provenance.json")))) throw new Error("Prior approval changed."); if (scope.value.priorExitStateSha256 !== priorExit.sha256 || scope.value.priorEvidenceInventorySha256 !== priorBaseline.value.entriesSha256) throw new Error("Prior authority changed.");
  const outputs = records(materialization.value.outputs, "materialization outputs"); const mutations = outputs.map((entry) => ({ ownerCommand: "bun test/k0r-reconcile-evidence.ts --materialize-evidence", path: entry.path, ...(entry.priorSha256 === null ? {} : { beforeSha256: entry.priorSha256 }), afterSha256: entry.finalSha256 })); const baseline = outputs.find((entry) => entry.path === "evidence/k0r/baseline-transition.json"); if (baseline === undefined) throw new Error("Baseline-transition output is missing.");
  const type = record(scan.value.typescript, "scan TypeScript binding");
  const snapshotBinding = receiptBinding(snapshot, "receipts/k0r-binding-snapshot.json", ["pathSetSha256"]);
  snapshotBinding.merkleSha256 = record(snapshot.value.merkle, "owner snapshot merkle").rootSha256;
  const pending: JsonRecord = { schemaVersion: "boulder.k0r.protected-transition.pending.v1", status: "pending_exit", scopeAuthorization: { payloadRawSha256: scope.sha256, payloadJcsSha256: canonicalDigest(scope.value), provenanceSha256: provenance.sha256 }, prior: { baselineSha256: priorBaseline.sha256, snapshotInventorySha256: scope.value.priorEvidenceInventorySha256, approvalProvenanceSha256: prefixedDigest(priorApproval), exitStateSha256: priorExit.sha256 }, trackedFreezeSha256: freeze.sha256, typescriptBinding: { path: "receipts/typescript-binding.json", sha256: type.bindingReceiptSha256, sourceTreeSha256: type.sourceTreeSha256, sourcePathSha256: type.sourcePathSha256, equivalentSourceTreeSha256: type.equivalentSourceTreeSha256, packageJsonSha256: type.packageJsonSha256, artifactSha256: type.artifactSha256, externalReadOnly: true }, bindingOwnerSnapshot: snapshotBinding, bindingPreScan: receiptBinding(pre, "receipts/k0r-binding-scan.pre.json", ["ownerSnapshotSha256", "bindingsSha256"]), evidenceMaterialization: receiptBinding(materialization, "receipts/k0r-materialization.json", ["outputPathSetSha256", "outputMerkleSha256"]), bindingReconciliation: receiptBinding(scan, "receipts/k0r-binding-scan.json", ["preEditScanSha256", "materializationSha256", "bindingsSha256", "bindingSchemaInventorySha256", "sourceSchemaInventorySha256"]), ownerMutations: mutations, baselineTransition: { path: "evidence/k0r/baseline-transition.json", sha256: baseline.finalSha256, status: "captured_pending_exact_byte_review" }, generator: generator() };
  record(pending.bindingOwnerSnapshot, "owner snapshot pending").merkleSha256 = record(snapshot.value.merkle, "snapshot merkle").rootSha256; record(pending.bindingReconciliation, "reconciliation pending").preEditScanSha256 = pre.sha256;
  await exclusiveCanonical(options.pendingTransitionOutput, root, pending); return pending;
}

const freezeOptions = ["--scope-authorization", "--scope-provenance", "--plan", "--focused-gate-receipt", "--output"] as const;
const preScanOptions = ["--stage", "--owner-root", "--owner-snapshot", "--typescript-binding", "--typescript-root", "--typescript-artifact-sha256", "--typescript-tree-sha256", "--output"] as const;
const finalScanOptions = ["--stage", "--pre-scan", "--tracked-freeze", "--materialization-receipt", "--plan", "--focused-gate-receipt", "--typescript-binding", "--typescript-root", "--typescript-artifact-sha256", "--typescript-tree-sha256", "--output"] as const;
const materializeOptions = ["--scope-authorization", "--scope-provenance", "--pre-scan", "--prior-approval", "--prior-baseline", "--prior-snapshot", "--prior-exit-state", "--tracked-freeze", "--materialization-output"] as const;
const finalizeOptions = ["--scope-authorization", "--scope-provenance", "--plan", "--focused-gate-receipt", "--materialization-receipt", "--binding-scan-receipt", "--prior-approval", "--prior-baseline", "--prior-snapshot", "--prior-exit-state", "--tracked-freeze", "--typescript-binding", "--typescript-root", "--typescript-artifact-sha256", "--typescript-tree-sha256", "--pending-transition-output"] as const;
function ordered(argv: readonly string[], mode: string, options: readonly string[]): Readonly<Record<string, string>> { if (argv.length !== 1 + options.length * 2 || argv[0] !== mode) throw new Error(`${mode} requires its exact ordered option/value array.`); const values: Record<string, string> = {}; for (let index = 0; index < options.length; index += 1) { const key = options[index]; const actual = argv[1 + index * 2]; const value = argv[2 + index * 2]; if (key === undefined || actual !== key || value === undefined || value === "" || value.startsWith("--") || values[key] !== undefined) throw new Error(`${mode} arguments are missing, duplicated, unknown, or out of order.`); values[key] = value; } return values; }
function value(values: Readonly<Record<string, string>>, key: string): string { const result = values[key]; if (result === undefined) throw new Error(`Missing ${key}.`); return result; }

async function main(argv: readonly string[]): Promise<JsonRecord> {
  if (argv[0] === "--write-tracked-freeze") { const v = ordered(argv, argv[0], freezeOptions); return writeK0rTrackedFreeze({ scopeAuthorization: value(v, "--scope-authorization"), scopeProvenance: value(v, "--scope-provenance"), plan: value(v, "--plan"), focusedGateReceipt: value(v, "--focused-gate-receipt"), output: value(v, "--output") }); }
  if (argv[0] === "--scan-bindings") {
    const stage = argv[2]; if (stage !== "pre-edit-snapshot" && stage !== "final-owners") throw new Error("--scan-bindings requires stage pre-edit-snapshot or final-owners."); const v = ordered(argv, argv[0], stage === "pre-edit-snapshot" ? preScanOptions : finalScanOptions);
    return scanK0rBindings({ stage, ...(stage === "pre-edit-snapshot" ? { ownerRoot: value(v, "--owner-root"), ownerSnapshot: value(v, "--owner-snapshot") } : { preScan: value(v, "--pre-scan"), trackedFreeze: value(v, "--tracked-freeze"), materializationReceipt: value(v, "--materialization-receipt"), plan: value(v, "--plan"), focusedGateReceipt: value(v, "--focused-gate-receipt") }), typescriptBinding: value(v, "--typescript-binding"), typescriptRoot: value(v, "--typescript-root"), typescriptArtifactSha256: digest(value(v, "--typescript-artifact-sha256"), "artifact argument"), typescriptTreeSha256: digest(value(v, "--typescript-tree-sha256"), "tree argument"), output: value(v, "--output") });
  }
  if (argv[0] === "--materialize-evidence") { const v = ordered(argv, argv[0], materializeOptions); return materializeK0rEvidence({ scopeAuthorization: value(v, "--scope-authorization"), scopeProvenance: value(v, "--scope-provenance"), preScan: value(v, "--pre-scan"), priorApproval: value(v, "--prior-approval"), priorBaseline: value(v, "--prior-baseline"), priorSnapshot: value(v, "--prior-snapshot"), priorExitState: value(v, "--prior-exit-state"), trackedFreeze: value(v, "--tracked-freeze"), materializationOutput: value(v, "--materialization-output") }); }
  if (argv[0] === "--finalize-transition") { const v = ordered(argv, argv[0], finalizeOptions); return finalizeK0rPendingTransition({ scopeAuthorization: value(v, "--scope-authorization"), scopeProvenance: value(v, "--scope-provenance"), plan: value(v, "--plan"), focusedGateReceipt: value(v, "--focused-gate-receipt"), materializationReceipt: value(v, "--materialization-receipt"), bindingScanReceipt: value(v, "--binding-scan-receipt"), priorApproval: value(v, "--prior-approval"), priorBaseline: value(v, "--prior-baseline"), priorSnapshot: value(v, "--prior-snapshot"), priorExitState: value(v, "--prior-exit-state"), trackedFreeze: value(v, "--tracked-freeze"), typescriptBinding: value(v, "--typescript-binding"), typescriptRoot: value(v, "--typescript-root"), typescriptArtifactSha256: digest(value(v, "--typescript-artifact-sha256"), "artifact argument"), typescriptTreeSha256: digest(value(v, "--typescript-tree-sha256"), "tree argument"), pendingTransitionOutput: value(v, "--pending-transition-output") }); }
  throw new Error("Usage: --write-tracked-freeze | --scan-bindings | --materialize-evidence | --finalize-transition with exact ordered arguments.");
}

if (Bun.argv[1] !== undefined && resolve(Bun.argv[1]) === resolve(join(import.meta.dir, "k0r-reconcile-evidence.ts"))) {
  try { const result = await main(Bun.argv.slice(2)); console.log(canonicalizeK0rJson({ schemaVersion: result.schemaVersion, status: result.status ?? "verified" })); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
