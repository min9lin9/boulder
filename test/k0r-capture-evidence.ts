import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { canonicalizeK0r, runK0rIndependentOracle } from "./k0r-independent-oracle.js";
import { isolatedRunReceiptPath, validateK0rIsolatedRunReceipt } from "./k0r-run-evidence.js";

const repositoryRoot = resolve(import.meta.dir, "..");
export const approvalReceiptPath = "evidence/k0r/approval-provenance.json";
export const consensusPlanSha256 = "sha256:12c210a0c57a611f3450c78e7e4743b11ae10258a682ea47a3eef4a1033d5c3a";
const selectedApprovalBranch = "superseding-adr";
const authorizedApprovalScope = "K0R evidence/ADR preparation only";
const prohibitedApprovalActions = ["K2 authority", "K3 authority", "K4 authority", "repository actions", "publication actions", "release actions", "root-guidance actions"] as const;
const generatedManifestPath = "evidence/k0r/evidence-manifest.json";
const outputDirectory = "evidence/k0r";
const textEncoder = new TextEncoder();
const sha256Pattern = /^sha256:[0-9a-f]{64}$/;
const oracleVectorIds = ["algorithm-unsupported", "key-unknown", "key-revoked", "event-digest-invalid", "signature-invalid", "timestamp-invalid", "expired", "stale", "policy-mismatch", "binding-workflow", "binding-plan-revision", "binding-step", "binding-effect", "binding-class", "binding-scope", "binding-input", "replayed", "verifier-unavailable"] as const;
const oracleArtifacts = {
  baseline: "fixtures/v2-kernel/valid-ed25519-authority-unsupported-effect.json",
  mutations: "fixtures/v2-kernel/invalid-authority-vectors.json",
  none: "fixtures/v2-kernel/valid-none-effect-execution.json"
} as const;
const expectedOracleArtifactDigests = {
  baseline: "sha256:0172bc8c3241db159f45b45d5320a466e612856afa2ca6c3478d6d55f5fda750",
  mutations: "sha256:88ed614d1757525c543d86e71b301887b9160465ea9b5126193045d4d0d388ec",
  none: "sha256:df3a2d6da157837886206a2512e50868e1b468b9b48dbcf5ce4bba582cc7c754"
} as const;
const implementationRequiredK0rPaths = [
  approvalReceiptPath,
  "evidence/k0r/superseding-adr.md",
  "evidence/k0r/acceptance-manifest.json",
  generatedManifestPath,
  "evidence/k0r/independent-clean-source-reproduction.json",
  "evidence/k0r/isolation-manifest.json",
  "evidence/k0r/isolated-run-receipt.json",
  "evidence/k0r/v1-public-contract-inventory.json",
  "test/k0r-capture-evidence.ts",
  "test/k0r-globals.d.ts",
  "test/k0r-evidence-contract.test.ts",
  "test/k0r-independent-oracle.test.ts",
  "test/k0r-independent-oracle.ts",
  "test/k0r-run-evidence.ts"
] as const;
const requiredK0rArtifacts = implementationRequiredK0rPaths.filter((path) => path !== generatedManifestPath);

type RecordValue = Record<string, unknown>;
type Classification = "k0r" | "prior-k0-k1" | "unrelated-existing";
type DirtyEntry = { readonly path: string; readonly status: string; readonly sha256: string; readonly classification: Classification; readonly initialSha256?: string };
type Inventory = { readonly tracked: readonly DirtyEntry[]; readonly untracked: readonly DirtyEntry[]; readonly ignored: readonly DirtyEntry[] };
type CommandResult = { readonly id: string; readonly argv: readonly string[]; readonly cwd: "."; readonly exitCode: number; readonly stdoutSha256: string; readonly stderrSha256: string };
export type K0rCaptureTestHooks = { readonly beforePostInventory?: () => Promise<void>; readonly rename?: (from: string, to: string) => Promise<void> };

export type K0rEvidenceManifest = {
  readonly schemaVersion: "boulder.k0r.evidence-manifest.v2";
  readonly status: "evidence_collected_pending_review";
  readonly approvalProvenance: { readonly path: typeof approvalReceiptPath; readonly sha256: string; readonly schemaVersion: "boulder.k0r.approval-provenance.v1"; readonly status: "scope_approved_adr_exact_bytes_pending"; readonly consensusPlanSha256: typeof consensusPlanSha256; readonly selectedBranch: typeof selectedApprovalBranch; readonly authorizedScope: typeof authorizedApprovalScope; readonly prohibitedActions: readonly string[] };
  readonly head: { readonly commit: string; readonly tree: string; readonly diffSha256: string };
  readonly rootAgents: { readonly path: "AGENTS.md"; readonly sha256: string; readonly headSha256: string; readonly matchesHead: true };
  readonly provenance: { readonly runtime: { readonly bunVersion: string; readonly gitVersion: string }; readonly commandResults: readonly CommandResult[]; readonly isolation: RecordValue };
  readonly inventories: { readonly pre: Inventory; readonly post: Inventory; readonly generatedManifestExcludedFromOwnInventory: true };
  readonly mutationAssessment: { readonly declaredK0rMutations: readonly string[]; readonly undeclaredMutations: readonly string[]; readonly count: number };
  readonly k0rArtifacts: readonly { readonly path: string; readonly sha256: string }[];
  readonly commandIdentities: readonly { readonly id: string; readonly command: string; readonly expected: string }[];
  readonly independentOracle: RecordValue;
  readonly reviews: { readonly architect: { readonly status: "pending_review"; readonly exactByteApproval: false }; readonly critic: { readonly status: "pending_review"; readonly exactByteApproval: false }; readonly maintainerAdr: { readonly status: "pending_review"; readonly exactByteApproval: false }; readonly exitReceipt: { readonly status: "not_issued"; readonly approved: false }; readonly pendingReviewCount: number };
  readonly externalSelfHash: { readonly policy: "not_recorded"; readonly reason: string };
};

export async function captureK0rEvidence(options: { readonly root?: string; readonly outputPath?: string; readonly approvalReceipt?: string; readonly testHooks?: K0rCaptureTestHooks } = {}): Promise<K0rEvidenceManifest> {
  const root = await safeRoot(options.root === undefined ? repositoryRoot : options.root);
  const receiptPath = options.approvalReceipt;
  if (receiptPath === undefined) throw new Error("--approval-receipt is required.");
  if (receiptPath !== approvalReceiptPath) throw new Error("--approval-receipt must name the repository-relative K0R approval provenance receipt.");
  assertRepositoryRelative(root, receiptPath, "approval receipt");
  const outputPath = await safeOutputPath(root, options.outputPath);
  const commands: CommandResult[] = [];
  const git = async (id: string, args: readonly string[]): Promise<string> => runGit(root, commands, id, args);
  const contracts = await readContracts(root);
  rejectPendingCapture(contracts);
  const { allowedK0rPaths, initialInventory } = validateContracts(contracts);
  const receipt = await readApprovalProvenance(root, receiptPath);
  const approvalProvenance = validateApprovalProvenance(receipt.value, receipt.sha256);
  await requireFiles(root, requiredK0rArtifacts);
  await validateK0rIsolatedRunReceipt(await readSafeBytes(root, isolatedRunReceiptPath), root);
  const [currentAgents, headAgents] = await Promise.all([sha256File(root, "AGENTS.md"), git("root-agents-head", ["show", "HEAD:AGENTS.md"]).then(sha256Text)]);
  if (currentAgents !== headAgents) throw new Error("Root AGENTS.md differs from HEAD and cannot be bound for K0R.");
  const pre = await dirtyInventory(root, initialInventory, allowedK0rPaths, git);
  const artifactPaths = await discoverK0rArtifacts(root, allowedK0rPaths, git);
  const k0rArtifacts = await Promise.all(artifactPaths.map(async (path) => ({ path, sha256: await sha256File(root, path) })));
  const reportSha256 = await sha256File(root, "evidence/k0r/independent-clean-source-reproduction.json");
  const oracle = await oracleBinding(root, contracts.oracle, reportSha256);
  await options.testHooks?.beforePostInventory?.();
  const post = await dirtyInventory(root, initialInventory, allowedK0rPaths, git);
  const mutationAssessment = assessMutations(pre, post, allowedK0rPaths);
  if (mutationAssessment.count !== 0) throw new Error(`Capture introduced undeclared mutations: ${mutationAssessment.undeclaredMutations.join(", ")}.`);
  const manifest: K0rEvidenceManifest = {
    schemaVersion: "boulder.k0r.evidence-manifest.v2",
    status: "evidence_collected_pending_review",
    approvalProvenance,
    head: { commit: (await git("head-commit", ["rev-parse", "HEAD"])).trim(), tree: (await git("head-tree", ["rev-parse", "HEAD^{tree}"])).trim(), diffSha256: sha256Text(await git("repo-diff", ["diff", "--binary", "HEAD"])) },
    rootAgents: { path: "AGENTS.md", sha256: currentAgents, headSha256: headAgents, matchesHead: true },
    provenance: { runtime: { bunVersion: Bun.version, gitVersion: (await git("git-version", ["--version"])).trim() }, commandResults: commands, isolation: contracts.isolation["isolation"] as RecordValue },
    inventories: { pre, post, generatedManifestExcludedFromOwnInventory: true },
    mutationAssessment,
    k0rArtifacts,
    commandIdentities: commandBindings(contracts.acceptance),
    independentOracle: oracle,
    reviews: reviewRequirements(contracts.acceptance),
    externalSelfHash: { policy: "not_recorded", reason: "A generated manifest cannot bind its own bytes without circularity; exact-byte reviews and maintainer ADR approval bind it externally." }
  };
  await atomicWrite(root, outputPath, `${JSON.stringify(manifest, null, 2)}\n`, options.testHooks?.rename);
  return manifest;
}

async function readContracts(root: string): Promise<{ acceptance: RecordValue; isolation: RecordValue; inventory: RecordValue; oracle: RecordValue }> {
  const [acceptance, isolation, inventory, oracle] = await Promise.all([readJson(root, "evidence/k0r/acceptance-manifest.json"), readJson(root, "evidence/k0r/isolation-manifest.json"), readJson(root, "evidence/k0r/v1-public-contract-inventory.json"), readJson(root, "evidence/k0r/independent-clean-source-reproduction.json")]);
  return { acceptance, isolation, inventory, oracle };
}

async function readJson(root: string, path: string): Promise<RecordValue> {
  try { return recordValue(JSON.parse(await readSafeFile(root, path)), path); } catch (error) { throw new Error(`Required K0R artifact is missing or malformed: ${path}. ${error instanceof Error ? error.message : String(error)}`); }
}
async function readApprovalProvenance(root: string, path: string): Promise<{ readonly value: RecordValue; readonly sha256: string }> {
  try {
    const bytes = await readSafeBytes(root, path);
    return { value: recordValue(JSON.parse(new TextDecoder().decode(bytes)), path), sha256: sha256Bytes(bytes) };
  } catch (error) {
    throw new Error(`Required K0R artifact is missing or malformed: ${path}. ${error instanceof Error ? error.message : String(error)}`);
  }
}
function validateContracts(contracts: { acceptance: RecordValue; isolation: RecordValue; inventory: RecordValue; oracle: RecordValue }): { readonly allowedK0rPaths: ReadonlySet<string>; readonly initialInventory: Map<string, string> } {
  exactKeys(contracts.acceptance, ["schemaVersion", "remediation", "scope", "evidenceBinding", "exitPolicy", "thresholds", "preservation", "approvalProvenance", "requiredArtifacts", "requiredRoles", "requiredCommands", "requiredOutputSchemas", "requiredApprovals", "acceptance"], "acceptance manifest");
  const approval = recordValue(contracts.acceptance["approvalProvenance"], "approval provenance contract");
  exactKeys(approval, ["path", "schemaVersion", "bindingRequired"], "approval provenance contract");
  if (approval["path"] !== approvalReceiptPath || approval["schemaVersion"] !== "boulder.k0r.approval-provenance.v1" || approval["bindingRequired"] !== true) throw new Error("Approval provenance contract is invalid.");
  const receiptArtifact = recordArray(contracts.acceptance["requiredArtifacts"], "required artifacts").find((artifact) => artifact["id"] === "approval-provenance");
  if (receiptArtifact === undefined || receiptArtifact["path"] !== approvalReceiptPath || receiptArtifact["schema"] !== "boulder.k0r.approval-provenance.v1") throw new Error("Approval provenance receipt must be a required K0R artifact.");
  if (!stringArray(contracts.acceptance["requiredOutputSchemas"], "required output schemas").includes("boulder.k0r.approval-provenance.v1")) throw new Error("Approval provenance receipt schema must be a required K0R output schema.");
  exactKeys(contracts.isolation, ["schemaVersion", "status", "purpose", "evidenceBinding", "exitPolicy", "identity", "inventories", "isolation", "pathPolicy", "commands", "reviews", "invalidation"], "isolation manifest");
  const allowedK0rPaths = parseAllowedK0rPaths(contracts.isolation);
  assertExactPathSet(allowedK0rPaths, implementationRequiredK0rPaths, "Isolation allowlist");
  const initial = recordArray(recordValue(contracts.isolation["inventories"], "inventories")["initialPriorK0K1Inventory"], "initial prior K0/K1 inventory");
  const initialInventory = new Map<string, string>();
  for (const entry of initial) {
    exactKeys(entry, ["path", "sha256"], "initial prior K0/K1 entry");
    const path = relativePath(stringValue(entry["path"], "initial inventory path"), "initial inventory path");
    const digest = digestValue(entry["sha256"], "initial inventory digest");
    if (initialInventory.has(path)) throw new Error(`Initial prior K0/K1 inventory duplicates ${path}.`);
    initialInventory.set(path, digest);
  }
  if (initialInventory.size === 0) throw new Error("Initial prior K0/K1 inventory is empty.");
  return { allowedK0rPaths, initialInventory };
}
function parseAllowedK0rPaths(isolation: RecordValue): ReadonlySet<string> {
  const pathPolicy = recordValue(isolation["pathPolicy"], "isolation path policy");
  exactKeys(pathPolicy, ["allowedK0RPaths", "excludedUnrelatedPlannerPaths", "forbiddenActions", "outsideAllowedPathMutationInvalidates", "excludedPathAccessInvalidates"], "isolation path policy");
  const paths = stringArray(pathPolicy["allowedK0RPaths"], "isolation allowed K0R paths");
  const allowed = new Set<string>();
  for (const path of paths) {
    const normalized = relativePath(path, "isolation allowed K0R path");
    if (!isK0rPath(normalized) || allowed.has(normalized)) throw new Error("Isolation allowlist contains an invalid or duplicate K0R path.");
    allowed.add(normalized);
  }
  return allowed;
}
function assertExactPathSet(actual: ReadonlySet<string>, expected: readonly string[], label: string): void {
  if (actual.size !== expected.length || expected.some((path) => !actual.has(path))) throw new Error(`${label} does not exactly match implementation-required K0R paths.`);
}

function validateApprovalProvenance(receipt: RecordValue, sha256: string): K0rEvidenceManifest["approvalProvenance"] {
  exactKeys(receipt, ["schemaVersion", "status", "consensusPlanSha256", "nonAuthoritativeProvenance", "selectedBranch", "authorizedScope", "prohibitedActions", "approvalLimits"], "approval provenance receipt");
  if (receipt["schemaVersion"] !== "boulder.k0r.approval-provenance.v1") throw new Error("Approval provenance receipt schema version is invalid.");
  if (receipt["status"] !== "scope_approved_adr_exact_bytes_pending") throw new Error("Approval provenance receipt status is invalid.");
  if (digestValue(receipt["consensusPlanSha256"], "approval provenance consensus plan digest") !== consensusPlanSha256) throw new Error("Approval provenance consensus plan SHA-256 is invalid.");
  const provenance = stringValue(receipt["nonAuthoritativeProvenance"], "approval provenance text");
  if (!provenance.startsWith("Original session-local plan path was ") || !provenance.endsWith("; this provenance text conveys no authority.")) throw new Error("Approval provenance text is invalid.");
  if (receipt["selectedBranch"] !== selectedApprovalBranch) throw new Error("Approval provenance selected branch is invalid.");
  if (receipt["authorizedScope"] !== authorizedApprovalScope) throw new Error("Approval provenance authorized scope is invalid.");
  const prohibitedActions = stringArray(receipt["prohibitedActions"], "approval provenance prohibited actions");
  if (JSON.stringify(prohibitedActions) !== JSON.stringify(prohibitedApprovalActions)) throw new Error("Approval provenance prohibited actions are invalid.");
  const limits = recordValue(receipt["approvalLimits"], "approval provenance approval limits");
  exactKeys(limits, ["adrExactByteApproval", "k0rExitReceipt"], "approval provenance approval limits");
  if (limits["adrExactByteApproval"] !== false || limits["k0rExitReceipt"] !== false) throw new Error("Approval provenance receipt cannot grant ADR exact-byte approval or K0R exit.");
  return { path: approvalReceiptPath, sha256, schemaVersion: "boulder.k0r.approval-provenance.v1", status: "scope_approved_adr_exact_bytes_pending", consensusPlanSha256, selectedBranch: selectedApprovalBranch, authorizedScope: authorizedApprovalScope, prohibitedActions };
}

async function requireFiles(root: string, paths: readonly string[]): Promise<void> { await Promise.all(paths.map((path) => readSafeFile(root, path).then(() => undefined))); }

async function discoverK0rArtifacts(root: string, allowedK0rPaths: ReadonlySet<string>, git: (id: string, args: readonly string[]) => Promise<string>): Promise<string[]> {
  const paths = (await git("discover-artifacts", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean);
  const candidates = new Set([...requiredK0rArtifacts, ...paths.filter(isK0rPath)]);
  for (const path of candidates) if (!allowedK0rPaths.has(path)) throw new Error(`K0R artifact escapes allowed paths: ${path}.`);
  return [...candidates].filter((path) => path !== generatedManifestPath).sort();
}

async function dirtyInventory(root: string, initial: Map<string, string>, allowedK0rPaths: ReadonlySet<string>, git: (id: string, args: readonly string[]) => Promise<string>): Promise<Inventory> {
  const raw = await git("status-inventory", ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching"]);
  const entries = await Promise.all(parsePorcelain(raw).filter((entry) => entry.path !== generatedManifestPath).map(async (entry) => {
    const path = relativePath(entry.path, "git status path");
    if (isK0rPath(path) && !allowedK0rPaths.has(path)) throw new Error(`K0R mutation escapes allowed paths: ${path}.`);
    const initialSha256 = initial.get(path);
    let sha256: string;
    try {
      const ignoredState = entry.status === "!!" ? await lstat(join(root, path)) : null;
      sha256 = ignoredState !== null && (!ignoredState.isFile() || ignoredState.isSymbolicLink())
        ? sha256Text(`ignored-path-marker:${path}:${ignoredState.isDirectory() ? "directory" : ignoredState.isSymbolicLink() ? "symlink" : "special"}`)
        : await sha256File(root, path);
    } catch (error) {
      if (initialSha256 !== undefined) throw new Error(`Initial prior K0/K1 inventory path is missing: ${path}.`);
      throw error;
    }
    if (initialSha256 !== undefined && initialSha256 !== sha256) throw new Error(`Initial prior K0/K1 inventory digest differs: ${path}.`);
    return { path, status: entry.status, sha256, classification: initialSha256 === undefined ? isK0rPath(path) ? "k0r" : "unrelated-existing" : "prior-k0-k1", ...(initialSha256 === undefined ? {} : { initialSha256 }) } as DirtyEntry;
  }));
  for (const path of initial.keys()) if (!entries.some((entry) => entry.path === path)) throw new Error(`Initial prior K0/K1 inventory path is missing from current inventory: ${path}.`);
  entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return { tracked: entries.filter((entry) => entry.status !== "??" && entry.status !== "!!"), untracked: entries.filter((entry) => entry.status === "??"), ignored: entries.filter((entry) => entry.status === "!!") };
}

function parsePorcelain(raw: string): { path: string; status: string }[] {
  const fields = raw.split("\0");
  const records: { path: string; status: string }[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field === "") continue;
    if (field.length < 4 || field[2] !== " ") throw new Error("Unexpected git status porcelain record.");
    const status = field.slice(0, 2);
    const rawPath = field.slice(3);
    const path = status === "!!" && rawPath.endsWith("/") ? rawPath.slice(0, -1) : rawPath;
    relativePath(path, "git status path");
    records.push({ path, status });
    if ((status.includes("R") || status.includes("C")) && fields[++index] === undefined) throw new Error("Truncated git rename porcelain record.");
  }
  return records;
}

async function oracleBinding(root: string, oracle: RecordValue, reportSha256: string): Promise<RecordValue> {
  exactKeys(oracle, ["schemaVersion", "reproductionMode", "status", "oracleSourceSha256", "artifacts", "reproduced", "derivedPublicKey", "generationSetDigest", "vectorIds", "seedMaterial", "failures"], "oracle report");
  if (oracle["schemaVersion"] !== "boulder.k0r-independent-oracle-report.v1" || oracle["reproductionMode"] !== "complete-byte-independent" || oracle["status"] !== "pass") throw new Error("Independent oracle report must be a passing complete-byte-independent v1 report.");
  const artifacts = recordValue(oracle["artifacts"], "oracle artifacts");
  const reproduced = recordValue(oracle["reproduced"], "oracle reproduced artifacts");
  exactKeys(artifacts, Object.keys(oracleArtifacts), "oracle artifacts");
  exactKeys(reproduced, Object.keys(oracleArtifacts), "oracle reproduced artifacts");
  for (const id of Object.keys(oracleArtifacts) as (keyof typeof oracleArtifacts)[]) {
    const path = oracleArtifacts[id];
    const declared = digestValue(artifacts[id], `oracle artifact ${id}`);
    const expected = expectedOracleArtifactDigests[id];
    if (declared !== expected || await sha256File(root, path) !== expected) throw new Error(`Oracle artifact digest is stale: ${id}.`);
    const reproduction = recordValue(reproduced[id], `oracle reproduced artifact ${id}`);
    exactKeys(reproduction, ["sha256", "fixtureSha256", "byteMatch"], `oracle reproduced artifact ${id}`);
    if (digestValue(reproduction["sha256"], `oracle reproduced ${id} digest`) !== expected || digestValue(reproduction["fixtureSha256"], `oracle reproduced ${id} fixture digest`) !== declared || reproduction["byteMatch"] !== true) throw new Error(`Oracle reproduction binding is invalid: ${id}.`);
  }
  const declaredOracleSource = digestValue(oracle["oracleSourceSha256"], "oracle source digest");
  if (declaredOracleSource !== await sha256File(root, "test/k0r-independent-oracle.ts")) throw new Error("Oracle source digest is stale.");
  if (oracle["derivedPublicKey"] !== "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo") throw new Error("Oracle derived public key is invalid.");
  if (digestValue(oracle["generationSetDigest"], "generation set digest") !== "sha256:cae1b30b108761597e83350dd359206a87edc629231f7fcbffba9cc599117b65") throw new Error("Oracle generation-set digest is invalid.");
  const vectors = stringArray(oracle["vectorIds"], "oracle vectorIds");
  if (JSON.stringify(vectors) !== JSON.stringify(oracleVectorIds)) throw new Error("Oracle vector IDs are missing, reordered, or forged.");
  const seed = recordValue(oracle["seedMaterial"], "oracle seed material");
  exactKeys(seed, ["status", "scannedFileCount"], "oracle seed material");
  if (seed["status"] !== "absentOutsideApprovedOracleAndGenerator" || !Number.isSafeInteger(seed["scannedFileCount"]) || (seed["scannedFileCount"] as number) < 1) throw new Error("Independent oracle seed material must be measured absent outside the approved oracle and generator.");
  const measuredOracle = await runK0rIndependentOracle({ root });
  if (canonicalizeOracleReport(oracle) !== canonicalizeOracleReport(measuredOracle)) throw new Error("Independent oracle report does not match the remeasured canonical report.");
  if (!Array.isArray(oracle["failures"]) || oracle["failures"].length !== 0 || !oracle["failures"].every((item) => typeof item === "string")) throw new Error("Passing oracle reports cannot contain failures.");
  return { reportPath: "evidence/k0r/independent-clean-source-reproduction.json", reportSha256, reproductionMode: oracle["reproductionMode"], status: "pass", artifactDigests: artifacts, reproduced, oracleSourceSha256: oracle["oracleSourceSha256"], generationSetDigest: oracle["generationSetDigest"], vectorIds: vectors, seedMaterial: seed };
}

function commandBindings(acceptance: RecordValue): { id: string; command: string; expected: string }[] {
  const commands = recordArray(acceptance["requiredCommands"], "required commands").map((command) => ({ id: stringValue(command["id"], "command id"), command: stringValue(command["command"], "command"), expected: stringValue(command["expected"], "command expected result") }));
  if (commands.length === 0 || !commands.some((command) => command.id === "evidence-generator")) throw new Error("K0R command identity allowlist must include the generator.");
  return commands;
}

function reviewRequirements(acceptance: RecordValue): K0rEvidenceManifest["reviews"] {
  const approvals = recordArray(acceptance["requiredApprovals"], "required approvals");
  const required = ["architect-exact-byte-review", "critic-exact-byte-review", "maintainer-adr-exact-byte-approval"];
  for (const id of required) if (approvals.find((approval) => approval["id"] === id)?.["status"] !== "pending_review") throw new Error(`${id} must remain pending_review.`);
  if (approvals.find((approval) => approval["id"] === "k0r-exit-receipt")?.["status"] !== "not_issued") throw new Error("K0R exit receipt must remain not_issued.");
  return { architect: { status: "pending_review", exactByteApproval: false }, critic: { status: "pending_review", exactByteApproval: false }, maintainerAdr: { status: "pending_review", exactByteApproval: false }, exitReceipt: { status: "not_issued", approved: false }, pendingReviewCount: 4 };
}

function assessMutations(pre: Inventory, post: Inventory, allowedK0rPaths: ReadonlySet<string>): K0rEvidenceManifest["mutationAssessment"] {
  const flattened = (inventory: Inventory) => [...inventory.tracked, ...inventory.untracked, ...inventory.ignored].map((entry) => `${entry.status}\0${entry.path}\0${entry.sha256}`).sort();
  const before = new Set(flattened(pre));
  const after = new Set(flattened(post));
  const changed = [...new Set([...before, ...after])].filter((entry) => !before.has(entry) || !after.has(entry)).map((entry) => entry.split("\0")[1] ?? "").filter((path) => path !== generatedManifestPath).sort();
  const declaredK0rMutations = changed.filter((path) => allowedK0rPaths.has(path));
  return { declaredK0rMutations, undeclaredMutations: changed.filter((path) => !allowedK0rPaths.has(path)), count: changed.filter((path) => !allowedK0rPaths.has(path)).length };
}

function rejectPendingCapture(contracts: Record<string, RecordValue>): void { for (const [name, contract] of Object.entries(contracts)) findPendingCapture(contract, name); }
function findPendingCapture(value: unknown, path: string): void { if (value === "pending_capture") throw new Error(`pending_capture remains in K0R evidence field: ${path}.`); if (Array.isArray(value)) value.forEach((item, index) => findPendingCapture(item, `${path}[${index}]`)); else if (typeof value === "object" && value !== null) for (const [key, item] of Object.entries(value)) findPendingCapture(item, `${path}.${key}`); }
function isK0rPath(path: string): boolean { return path.startsWith("evidence/k0r/") || path.startsWith("test/k0r-"); }

async function safeRoot(path: string): Promise<string> { const root = await realpath(resolve(path)); const state = await lstat(root); if (!state.isDirectory() || state.isSymbolicLink()) throw new Error("Repository root must be a real directory."); return root; }
async function safeOutputPath(root: string, requested: string | undefined): Promise<string> { const path = requested === undefined ? join(root, generatedManifestPath) : resolve(requested); const repositoryPath = relative(root, path); assertRepositoryRelative(root, repositoryPath, "output path"); if (repositoryPath !== generatedManifestPath) throw new Error("Evidence output must be the authoritative K0R evidence manifest path."); await safeDirectory(root, outputDirectory); const existing = await lstat(path).catch(() => null); if (existing !== null && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) throw new Error("Evidence output destination must be a single-link regular file."); return path; }
async function readSafeFile(root: string, path: string): Promise<string> { return new TextDecoder().decode(await readSafeBytes(root, path)); }
async function readSafeBytes(root: string, path: string): Promise<Uint8Array> { return readFile(await safeFilePath(root, path)); }
async function sha256File(root: string, path: string): Promise<string> { return sha256Bytes(await readSafeBytes(root, path)); }
async function safeDirectory(root: string, path: string): Promise<string> { let current = root; for (const component of relativePath(path, "directory").split("/")) { current = join(current, component); const state = await lstat(current); if (!state.isDirectory() || state.isSymbolicLink()) throw new Error(`K0R path contains an unsafe directory: ${path}.`); const actual = await realpath(current); assertContained(root, actual, path); } return current; }
async function safeFilePath(root: string, path: string): Promise<string> { const normalized = relativePath(path, "path"); const parts = normalized.split("/"); const name = parts.pop(); if (name === undefined) throw new Error("K0R input path is empty."); const directory = parts.length === 0 ? root : await safeDirectory(root, parts.join("/")); const full = join(directory, name); const state = await lstat(full); if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1) throw new Error(`K0R input must be a single-link regular file: ${normalized}.`); const actual = await realpath(full); assertContained(root, actual, normalized); return actual; }
async function atomicWrite(root: string, destination: string, content: string, replace: (from: string, to: string) => Promise<void> = rename): Promise<void> { const directory = await safeDirectory(root, outputDirectory); const temporary = join(directory, `.evidence-manifest.${randomUUID()}.tmp`); const handle = await open(temporary, "wx", 0o600); try { await handle.writeFile(content, "utf8"); await handle.sync(); await handle.close(); await replace(temporary, destination); } catch (error) { await handle.close().catch(() => undefined); await unlink(temporary).catch(() => undefined); throw error; } }
function assertContained(root: string, path: string, label: string): void { if (path !== root && relative(root, path).startsWith("..")) throw new Error(`${label} escapes repository root.`); }
function assertRepositoryRelative(root: string, path: string, label: string): void { relativePath(path, label); const full = resolve(root, path); assertContained(root, full, label); }
function relativePath(path: string, label: string): string { if (isAbsolute(path) || path === "" || path.split(/[\\/]/).some((part) => part === "" || part === "." || part === "..")) throw new Error(`${label} must be a repository-relative path.`); return path.replaceAll("\\", "/"); }
function sha256Bytes(bytes: Uint8Array): string { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function sha256Text(text: string): string { return sha256Bytes(textEncoder.encode(text)); }
function canonicalizeOracleReport(value: unknown): string { return canonicalizeK0r(JSON.parse(JSON.stringify(value))); }
async function runGit(root: string, commands: CommandResult[], id: string, args: readonly string[]): Promise<string> {
  const result = await execGit(root, args);
  commands.push({ id, argv: ["git", ...args], cwd: ".", exitCode: result.exitCode, stdoutSha256: sha256Text(result.stdout), stderrSha256: sha256Text(result.stderr) });
  if (result.exitCode !== 0) throw new Error(`Git command failed: git ${args.join(" ")}. ${result.stderr.trim()}`);
  return result.stdout;
}
function execGit(cwd: string, args: readonly string[]): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, exitCode: error === null ? 0 : typeof error.code === "number" ? error.code : 1 });
    });
  });
}
function exactKeys(value: RecordValue, keys: readonly string[], label: string): void { if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} has unexpected keys.`); }
function recordValue(value: unknown, label: string): RecordValue { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`); return value as RecordValue; }
function recordArray(value: unknown, label: string): RecordValue[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array.`); return value.map((item, index) => recordValue(item, `${label}[${index}]`)); }
function stringArray(value: unknown, label: string): string[] { if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`${label} must be a string array.`); return value as string[]; }
function stringValue(value: unknown, label: string): string { if (typeof value !== "string") throw new Error(`${label} must be a string.`); return value; }
function digestValue(value: unknown, label: string): string { const digest = stringValue(value, label); if (!sha256Pattern.test(digest)) throw new Error(`${label} must be a SHA-256 digest.`); return digest; }

if (Bun.argv[1] !== undefined && resolve(Bun.argv[1]) === resolve(join(import.meta.dir, "k0r-capture-evidence.ts"))) { const args = Bun.argv.slice(2); const receiptIndex = args.indexOf("--approval-receipt"); const receipt = receiptIndex === -1 ? undefined : args[receiptIndex + 1]; try { const manifest = await captureK0rEvidence({ approvalReceipt: receipt }); console.log(JSON.stringify({ path: generatedManifestPath, status: manifest.status })); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; } }
