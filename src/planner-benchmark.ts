import { validatePlanningPacket } from "./planning-packet.js";
import { sha256Digest } from "./planning-canonical.js";

export type PlannerBenchmarkErrorCode =
  | "plan.benchmark.trust_root_invalid" | "plan.benchmark.key_unknown" | "plan.benchmark.key_revoked"
  | "plan.benchmark.key_fingerprint_mismatch" | "plan.benchmark.manifest_invalid" | "plan.benchmark.run_invalid"
  | "plan.benchmark.bundle_invalid" | "plan.benchmark.duplicate_run" | "plan.benchmark.replacement_invalid"
  | "plan.benchmark.study_path_invalid" | "plan.benchmark.report_invalid" | "plan.benchmark.provenance_missing"
  | "plan.benchmark.digest_mismatch" | "plan.benchmark.study_identity_mismatch" | "plan.benchmark.signature_invalid"
  | "plan.benchmark.signer_unauthorized" | "plan.benchmark.evidence_invalid";

export interface PlannerBenchmarkIssue {
  readonly code: PlannerBenchmarkErrorCode;
  readonly path: string;
  readonly message: string;
}

export type Ed25519KeyStatus = "active" | "revoked";
export interface Ed25519TrustKey { readonly keyId: string; readonly publicKey: string; readonly fingerprint: string; readonly status: Ed25519KeyStatus; }
export interface PlannerBenchmarkTrustRoot {
  readonly schemaVersion: "boulder.planner-benchmark.trust-root.v1";
  readonly rootId: string;
  readonly createdAt: string;
  readonly delegationPolicy: {
    readonly protocolThreshold: 1;
    readonly allowProtocolDelegation: true;
    readonly requireManifestSignerAuthorization: true;
    readonly requireBundleSignerAuthorization: true;
  };
  readonly keys: readonly Ed25519TrustKey[];
}
export interface SignatureEnvelope { readonly algorithm: "Ed25519"; readonly keyId: string; readonly signature: string; }
export interface PlannerEvidenceFile { readonly path: string; readonly bytes: Uint8Array; }
export interface PlannerEvidenceArtifact { readonly path: string; readonly digest: string; readonly schemaVersion: string; }
export interface PlannerStudyArtifacts {
  readonly rubric: PlannerEvidenceArtifact;
  readonly normalizer: PlannerEvidenceArtifact;
  readonly assignments: PlannerEvidenceArtifact;
  readonly approvals: PlannerEvidenceArtifact;
  readonly redactions: PlannerEvidenceArtifact;
  readonly prospectiveScoreSheet?: PlannerEvidenceArtifact;
  readonly prospectiveScoreLock?: PlannerEvidenceArtifact;
}
export interface PlannerScoreLockReceipt {
  readonly schemaVersion: "boulder.planner-score-lock-receipt.v1";
  readonly sequence: number;
  readonly occurredAt: string;
  readonly kind: "prospective-lock" | "retrospective-attestation";
  readonly scoreSheet: PlannerEvidenceArtifact;
  readonly lockDigest: string;
  readonly blindedItems: readonly { readonly reviewItemId: string; readonly blindedItemDigest: string }[];
}
export interface PlannerScoreRevealReceipt {
  readonly schemaVersion: "boulder.planner-score-reveal-receipt.v1";
  readonly sequence: number;
  readonly occurredAt: string;
  readonly lockDigest: string;
  readonly scoreSheet: PlannerEvidenceArtifact;
  readonly privateAssignment: PlannerEvidenceArtifact;
  readonly reveals: readonly {
    readonly reviewItemId: string;
    readonly runId: string;
    readonly cellId: string;
    readonly repeat: 1 | 2;
    readonly blindedItemDigest: string;
    readonly score: number;
    readonly rawScore: number;
    readonly criticalCaps: readonly CriticalCap[];
    readonly traceabilityPercent: number;
  }[];
}
export interface PlannerStudyProtocol {
  readonly schemaVersion: "boulder.planner-study-protocol.v1";
  readonly studyId: string;
  readonly rubricVersion: string;
  readonly rubricDigest: string;
  readonly normalizerVersion: string;
  readonly normalizerDigest: string;
  readonly normalizerContractDigest: string;
  readonly runnerContractDigest: string;
  readonly protocolSigner: { readonly keyId: string; readonly fingerprint: string };
  readonly delegatedSigners: readonly { readonly keyId: string; readonly fingerprint: string; readonly roles: readonly ("manifest" | "bundle" | "executor")[] }[];
  readonly authorizationPolicy: string;
  readonly redactionPolicy: string;
  readonly blindingPolicy: string;
  readonly scoreLockReceiptDigest?: string;
  readonly privateMapDigest?: string;
  readonly exclusionPolicy: string;
  readonly replacementPolicy: string;
  readonly signature: SignatureEnvelope;
}
export interface PlannerStudyCell { readonly cellId: string; readonly plannerId: string; readonly taskClass: string; readonly repoId: string; }
export interface PlannerStudyManifest {
  readonly schemaVersion: "boulder.planner-study-manifest.v1";
  readonly studyId: string;
  readonly protocolDigest: string;
  readonly tasks: readonly { readonly taskId: string; readonly sha256: string }[];
  readonly repositories: readonly { readonly repoId: string; readonly revision: string }[];
  readonly cells: readonly PlannerStudyCell[];
  readonly repeats: readonly [1, 2];
  readonly randomizationSeed: string;
  readonly signature: SignatureEnvelope;
}
export interface PlannerStudyRawRun {
  readonly schemaVersion: "boulder.planner-study-raw-run.v1";
  readonly runId: string;
  readonly cellId: string;
  readonly repeat: 1 | 2;
  readonly sequence: number;
  readonly protocolDigest: string;
  readonly manifestDigest: string;
  readonly operatorApprovalDigest: string;
  readonly artifacts: readonly PlannerEvidenceArtifact[];
  readonly redactionInputDigest: string;
}
export type CriticalCap =
  | "protected-path-or-external-workspace-violation:max49"
  | "plan-execution-approval-confusion:max59"
  | "missing-hard-override:blocked"
  | "traceability-below-100:promotion-ineligible"
  | "unsupported-superiority-claim:fail";
export interface PlannerBenchmarkRun {
  readonly schemaVersion: "boulder.planner-benchmark-run.v1";
  readonly runId: string;
  readonly cellId: string;
  readonly repeat: 1 | 2;
  readonly sequence: number;
  readonly protocolDigest: string;
  readonly manifestDigest: string;
  readonly rawRunDigest: string;
  readonly sourceDigest: string;
  readonly packetDigest: string;
  readonly reviewDigests: readonly string[];
  readonly approvalDigest: string;
  readonly executionDigest: string;
  readonly verificationDigest: string;
  readonly reviewerDigest: string;
  readonly redactionDigest: string;
  readonly normalizerVersion: string;
  readonly normalizerDigest: string;
  readonly score: number;
  readonly rawScore: number;
  readonly criticalCaps: readonly CriticalCap[];
  readonly traceabilityPercent: number;
  readonly scopeStatus: "passed" | "failed" | "unknown";
  readonly execution: {
    readonly status: "passed" | "failed";
    readonly scopeStatus: "passed" | "failed" | "unknown";
    readonly path: string;
    readonly digest: string;
    readonly schemaVersion: "boulder.planner-execution-receipt.v1";
  };
  readonly reviewItemId: string;
  readonly blindedItemDigest: string;
  readonly replacesRunId?: string;
}
export interface PlannerStudyExclusion {
  readonly runId: string;
  readonly cellId: string;
  readonly repeat: 1 | 2;
  readonly sequence: number;
  readonly reason: string;
  readonly evidenceDigest: string;
  readonly adjudicator: string;
  readonly excludedAt: string;
  readonly replacementOf?: string;
}
export interface PlannerEvidenceBundle {
  readonly schemaVersion: "boulder.planner-evidence-bundle.v1";
  readonly studyId: string;
  readonly protocolDigest: string;
  readonly manifestDigest: string;
  readonly rubricDigest: string;
  readonly normalizerDigest: string;
  readonly normalizedRuns: readonly PlannerBenchmarkRun[];
  readonly exclusions: readonly PlannerStudyExclusion[];
  readonly artifactIndex: readonly PlannerEvidenceArtifact[];
  readonly studyArtifacts: PlannerStudyArtifacts;
  readonly scoreLockReceipt: PlannerScoreLockReceipt;
  readonly scoreRevealReceipt: PlannerScoreRevealReceipt;
  readonly assignmentsDigest: string;
  readonly approvalsDigest: string;
  readonly redactionsDigest: string;
  readonly trustRootFingerprintSetDigest: string;
  readonly studyRootDigest: string;
  readonly signature: SignatureEnvelope;
}
export interface PlannerBenchmarkMetrics {
  readonly scoredRunCount: number;
  readonly eligibleRunCount: number;
  readonly weightedAverage: number | null;
  readonly targetCaseMinimum: number | null;
  readonly maximumRepeatVariance: number | null;
  readonly traceabilityPercent: number | null;
  readonly executionFailureCount: number;
  readonly criticalCapCount: number;
  readonly invalidRunCount: number;
}
export interface PlannerBenchmarkReport {
  readonly schemaVersion: "boulder.planner-benchmark-report.v1";
  readonly bundleDigest: string;
  readonly trustRootFingerprintSetDigest: string;
  readonly eligibleRunIds: readonly string[];
  readonly excludedRunIds: readonly string[];
  readonly decision: "HOLD" | "PREVIEW" | "FIRST_FALLBACK_REVIEW";
  readonly reasons: readonly string[];
  readonly metrics: PlannerBenchmarkMetrics;
}
export interface PlannerBenchmarkProvenance {
  readonly trustRoot: unknown;
  readonly protocol: unknown;
  readonly manifest: unknown;
  readonly rawRuns: readonly unknown[];
  readonly evidenceFiles?: readonly PlannerEvidenceFile[];
  readonly bundle: unknown;
  readonly report: unknown;
}

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const plannerIds = ["gjc", "boulder-native", "lazycodex-ulw-plan"] as const;
const taskClasses = ["small-bug", "medium-feature", "high-risk-change"] as const;
const repositoryIds = ["small-ts-cli", "medium-multi-module"] as const;
const expectedCellIds = new Set(plannerIds.flatMap((plannerId) => taskClasses.flatMap((taskClass) => repositoryIds.map((repoId) => `${plannerId}:${taskClass}:${repoId}`))));
const expectedTaskIds = new Set(["TSG-BUG-01", "TSG-FEAT-01", "TSG-RISK-01", "NI-BUG-01", "NI-FEAT-01", "NI-RISK-01"]);
const plannerOutputIds: Readonly<Record<string, string>> = {
  gjc: "gjc",
  "boulder-native": "boulder-native",
  "lazycodex-ulw-plan": "lazycodex"
};
const frozenProtocolPolicies = {
  authorizationPolicy: "Operator approval is required before external calls and common-executor validation; automated blinded evaluation was explicitly user-authorized and remains disclosed as non-human exploratory evidence.",
  redactionPolicy: "Apply pr8b-redaction-v1 before blinded review while preserving technical evidence.",
  exclusionPolicy: "Exclude only malformed, interrupted, contaminated, or policy-violating runs with signed evidence and adjudicator reason.",
  replacementPolicy: "A replacement must immediately follow and reference the excluded run for the same cell and repeat."
} as const;
const retrospectiveBlindingPolicy = "Reviewer agents receive reviewItemId/blinded planner alias only; the private run map is bound by the reveal receipt after every score item is locked. This repaired receipt is a retrospective chronology attestation and therefore forces HOLD.";
const prospectiveBlindingPolicy = "Reviewer agents receive reviewItemId/blinded planner alias only; assignments, the empty score sheet, the private run map, and a prospective lock receipt are bound by this signed protocol before any scoring begins (prospective lock); the private run map is bound by the reveal receipt after every score item is locked.";
const acceptedBlindingPolicies = new Set([retrospectiveBlindingPolicy, prospectiveBlindingPolicy]);
const taskIdForCell = (cellId: string): string | undefined => {
  const [plannerId, taskClass, repoId, extra] = cellId.split(":");
  if (extra !== undefined || !plannerIds.includes(plannerId as typeof plannerIds[number])) return undefined;
  const repository = repoId === "small-ts-cli" ? "TSG" : repoId === "medium-multi-module" ? "NI" : undefined;
  const task = taskClass === "small-bug" ? "BUG" : taskClass === "medium-feature" ? "FEAT" : taskClass === "high-risk-change" ? "RISK" : undefined;
  return repository && task ? `${repository}-${task}-01` : undefined;
};
const rawRunIds: Readonly<Record<string, string>> = {
  gjc: "gjc",
  "boulder-native": "boulder-native",
  "lazycodex-ulw-plan": "lazycodex-ulw-plan"
};
const rawRunIdentityValid = (raw: PlannerStudyRawRun): boolean => {
  const [plannerId] = raw.cellId.split(":");
  const rawRunId = rawRunIds[plannerId];
  const taskId = taskIdForCell(raw.cellId);
  if (!rawRunId || !taskId) return false;
  const match = new RegExp(`^R([0-9]{2,})-${rawRunId}-${taskId}-r${raw.repeat}(?:-replacement)?$`).exec(raw.runId);
  return Boolean(match) && Number(match?.[1]) === raw.sequence;
};
const rubricCriteria = [
  { id: "scope-correctness", points: 20 },
  { id: "decision-completeness", points: 20 },
  { id: "ac-verification-traceability", points: 15 },
  { id: "safety-approval-discipline", points: 15 },
  { id: "evidence-grounding", points: 10 },
  { id: "question-efficiency", points: 10 },
  { id: "execution-usability", points: 10 }
] as const;
const allowedCriticalCaps = new Set<CriticalCap>([
  "protected-path-or-external-workspace-violation:max49",
  "plan-execution-approval-confusion:max59",
  "missing-hard-override:blocked",
  "traceability-below-100:promotion-ineligible",
  "unsupported-superiority-claim:fail"
]);
const base64urlPattern = /^[A-Za-z0-9_-]+$/;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const validDigest = (value: unknown): value is string => typeof value === "string" && digestPattern.test(value);
const isoTime = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const boundedScore = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
const positiveSafeInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const safePath = (value: unknown): value is string => text(value) && !value.startsWith("/") && !value.startsWith("\\") && !/^[A-Za-z]:[\\/]/.test(value) && !value.includes("\\") && !value.split("/").some((part) => part === "" || part === "." || part === "..");
const issue = (code: PlannerBenchmarkErrorCode, path: string, message: string): PlannerBenchmarkIssue => ({ code, path, message });
const canonical = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : object(value)
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const withoutSignature = (value: Record<string, unknown>): Record<string, unknown> => { const { signature: _signature, ...payload } = value; return payload; };
const hash = (value: unknown): string => sha256Digest(canonical(value));
const unique = (values: readonly string[]): readonly string[] => [...new Set(values)].sort();

function sha256Bytes(input: Uint8Array): string {
  const primes: number[] = [];
  for (let candidate = 2; primes.length < 64; candidate += 1) {
    if (primes.every((prime) => candidate % prime !== 0)) primes.push(candidate);
  }
  const state = primes.slice(0, 8).map((prime) => Math.floor((Math.sqrt(prime) % 1) * 0x100000000));
  const constants = primes.map((prime) => Math.floor((Math.cbrt(prime) % 1) * 0x100000000));
  const padded = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  padded.set(input);
  padded[input.length] = 0x80;
  const length = input.length * 8;
  for (let index = 0; index < 8; index += 1) padded[padded.length - 1 - index] = Math.floor(length / 2 ** (index * 8)) & 0xff;
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(64);
    for (let index = 0; index < 16; index += 1) words[index] = (padded[offset + index * 4] << 24) | (padded[offset + index * 4 + 1] << 16) | (padded[offset + index * 4 + 2] << 8) | padded[offset + index * 4 + 3];
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15];
      const right = words[index - 2];
      words[index] = (((left >>> 7 | left << 25) ^ (left >>> 18 | left << 14) ^ left >>> 3) + words[index - 16] + ((right >>> 17 | right << 15) ^ (right >>> 19 | right << 13) ^ right >>> 10) + words[index - 7]) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const first = (h + ((e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7)) + ((e & f) ^ (~e & g)) + constants[index] + words[index]) >>> 0;
      const second = (((a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + first) >>> 0, c, b, a, (first + second) >>> 0];
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0; state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0; state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
  }
  return `sha256:${state.map((word) => word.toString(16).padStart(8, "0")).join("")}`;
}

function decodeBase64url(value: string): Uint8Array | undefined {
  if (!base64urlPattern.test(value)) return undefined;
  try {
    const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}
function toBase64url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function copiedBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}
function signatureShape(value: unknown): value is SignatureEnvelope {
  return object(value) && value.algorithm === "Ed25519" && text(value.keyId) && text(value.signature) && Boolean(decodeBase64url(value.signature));
}
function artifactShape(value: unknown): value is PlannerEvidenceArtifact {
  return object(value) && safePath(value.path) && validDigest(value.digest) && text(value.schemaVersion);
}
function exactStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
}
function jsonBytes(file: PlannerEvidenceFile | undefined): unknown {
  if (!file) return undefined;
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(file.bytes)); } catch { return undefined; }
}
function textBytes(file: PlannerEvidenceFile | undefined): string | undefined {
  if (!file) return undefined;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(file.bytes); } catch { return undefined; }
}

export function plannerBenchmarkDigest(value: unknown): string { return hash(value); }
export function trustRootFingerprintSetDigest(root: Pick<PlannerBenchmarkTrustRoot, "keys">): string { return hash(root.keys.map((key) => key.fingerprint).sort()); }
export function plannerStudyRootDigest(input: Readonly<{ protocol: Record<string, unknown>; manifest: Record<string, unknown>; bundle: Record<string, unknown>; trustRoot: PlannerBenchmarkTrustRoot }>): string {
  return hash({
    protocol: withoutSignature(input.protocol),
    manifest: withoutSignature(input.manifest),
    rubric: { version: input.protocol.rubricVersion, digest: input.bundle.rubricDigest },
    normalizer: { version: input.protocol.normalizerVersion, digest: input.bundle.normalizerDigest },
    studyArtifacts: input.bundle.studyArtifacts,
    assignmentsDigest: input.bundle.assignmentsDigest,
    approvalsDigest: input.bundle.approvalsDigest,
    redactionsDigest: input.bundle.redactionsDigest,
    trustRoot: input.trustRoot
  });
}

export function validatePlannerBenchmarkTrustRoot(value: unknown): readonly PlannerBenchmarkIssue[] {
  if (!object(value)) return [issue("plan.benchmark.trust_root_invalid", "$", "Trust root must be an object.")];
  const issues: PlannerBenchmarkIssue[] = [];
  if (value.schemaVersion !== "boulder.planner-benchmark.trust-root.v1" || !text(value.rootId) || !isoTime(value.createdAt)) issues.push(issue("plan.benchmark.trust_root_invalid", "$", "Trust root identity is invalid."));
  const policy = value.delegationPolicy;
  if (!object(policy) || policy.protocolThreshold !== 1 || policy.allowProtocolDelegation !== true || policy.requireManifestSignerAuthorization !== true || policy.requireBundleSignerAuthorization !== true) issues.push(issue("plan.benchmark.trust_root_invalid", "delegationPolicy", "Trust-root delegation policy must match v1 exactly."));
  if (!Array.isArray(value.keys) || value.keys.length === 0) return [...issues, issue("plan.benchmark.trust_root_invalid", "keys", "Trust root requires keys.")];
  const ids = new Set<string>();
  for (const [index, entry] of value.keys.entries()) {
    if (!object(entry) || !text(entry.keyId) || !text(entry.publicKey) || !validDigest(entry.fingerprint) || (entry.status !== "active" && entry.status !== "revoked") || ids.has(entry.keyId)) {
      issues.push(issue("plan.benchmark.trust_root_invalid", `keys[${index}]`, "Trust key is invalid."));
      continue;
    }
    ids.add(entry.keyId);
    const publicKey = decodeBase64url(entry.publicKey);
    if (!publicKey || publicKey.length !== 32 || toBase64url(publicKey) !== entry.publicKey) issues.push(issue("plan.benchmark.trust_root_invalid", `keys[${index}].publicKey`, "Trust key public key must be canonical base64url Ed25519 bytes."));
    else if (sha256Bytes(publicKey) !== entry.fingerprint) issues.push(issue("plan.benchmark.key_fingerprint_mismatch", `keys[${index}].fingerprint`, "Trust key fingerprint does not match its public key."));
  }
  return issues;
}
export function trustKeyStatus(root: PlannerBenchmarkTrustRoot, keyId: string): PlannerBenchmarkIssue | undefined {
  const key = root.keys.find((entry) => entry.keyId === keyId);
  return !key ? issue("plan.benchmark.key_unknown", "keyId", "Signer key is not in the trust root.") : key.status === "revoked" ? issue("plan.benchmark.key_revoked", "keyId", "Signer key is revoked.") : undefined;
}

export function validatePlannerStudyManifest(value: unknown): readonly PlannerBenchmarkIssue[] {
  if (!object(value) || value.schemaVersion !== "boulder.planner-study-manifest.v1" || !text(value.studyId) || !validDigest(value.protocolDigest) || !text(value.randomizationSeed) || !Array.isArray(value.tasks) || !Array.isArray(value.repositories) || !Array.isArray(value.cells) || !Array.isArray(value.repeats) || canonical(value.repeats) !== "[1,2]" || !signatureShape(value.signature)) return [issue("plan.benchmark.manifest_invalid", "$", "Manifest requires complete provenance fields.")];
  const taskIds = new Set<string>();
  if (value.tasks.length !== expectedTaskIds.size || !value.tasks.every((task) => object(task) && text(task.taskId) && validDigest(task.sha256) && !taskIds.has(task.taskId) && Boolean(taskIds.add(task.taskId))) || [...expectedTaskIds].some((taskId) => !taskIds.has(taskId))) return [issue("plan.benchmark.manifest_invalid", "tasks", "Manifest must bind the exact six preregistered task identities and digests.")];
  const declaredRepositories = new Set<string>();
  if (value.repositories.length !== repositoryIds.length || !value.repositories.every((repository) => object(repository) && text(repository.repoId) && text(repository.revision) && !declaredRepositories.has(repository.repoId) && Boolean(declaredRepositories.add(repository.repoId)))) return [issue("plan.benchmark.manifest_invalid", "repositories", "Manifest repositories are invalid.")];
  const identities = new Set<string>();
  for (const [index, cell] of value.cells.entries()) {
    if (!object(cell) || !text(cell.cellId) || !text(cell.plannerId) || !text(cell.taskClass) || !text(cell.repoId) || cell.cellId !== `${cell.plannerId}:${cell.taskClass}:${cell.repoId}` || identities.has(cell.cellId)) return [issue("plan.benchmark.manifest_invalid", `cells[${index}]`, "Manifest cells must have unique exact identities.")];
    identities.add(cell.cellId);
  }
  if (identities.size !== expectedCellIds.size || [...expectedCellIds].some((cellId) => !identities.has(cellId)) || repositoryIds.some((repoId) => !declaredRepositories.has(repoId))) return [issue("plan.benchmark.manifest_invalid", "cells", "Manifest must contain the exact preregistered PR8A matrix.")];
  return [];
}

export function validatePlannerStudyRawRun(value: unknown): readonly PlannerBenchmarkIssue[] {
  if (!object(value) || value.schemaVersion !== "boulder.planner-study-raw-run.v1" || !text(value.runId) || !text(value.cellId) || ![1, 2].includes(value.repeat as number) || !positiveSafeInteger(value.sequence) || !validDigest(value.protocolDigest) || !validDigest(value.manifestDigest) || !validDigest(value.operatorApprovalDigest) || !validDigest(value.redactionInputDigest) || !Array.isArray(value.artifacts) || value.artifacts.length === 0) return [issue("plan.benchmark.run_invalid", "$", "Raw run requires complete provenance fields.")];
  const issues = value.artifacts.flatMap((artifact, index) => artifactShape(artifact) ? [] : [issue("plan.benchmark.study_path_invalid", `artifacts[${index}]`, "Artifacts require safe relative paths, digests, and schema versions.")]);
  if (issues.length > 0) return issues;
  const paths = value.artifacts.map((entry) => (entry as PlannerEvidenceArtifact).path);
  return new Set(paths).size === paths.length ? [] : [issue("plan.benchmark.duplicate_run", "artifacts", "Raw-run artifact paths must be unique.")];
}

function scoreLockReceiptShape(value: unknown): value is PlannerScoreLockReceipt {
  return object(value)
    && value.schemaVersion === "boulder.planner-score-lock-receipt.v1"
    && positiveSafeInteger(value.sequence)
    && isoTime(value.occurredAt)
    && (value.kind === "prospective-lock" || value.kind === "retrospective-attestation")
    && artifactShape(value.scoreSheet)
    && validDigest(value.lockDigest)
    && Array.isArray(value.blindedItems)
    && value.blindedItems.every((entry) => object(entry) && text(entry.reviewItemId) && validDigest(entry.blindedItemDigest));
}

function scoreRevealReceiptShape(value: unknown): value is PlannerScoreRevealReceipt {
  return object(value)
    && value.schemaVersion === "boulder.planner-score-reveal-receipt.v1"
    && positiveSafeInteger(value.sequence)
    && isoTime(value.occurredAt)
    && validDigest(value.lockDigest)
    && artifactShape(value.scoreSheet)
    && artifactShape(value.privateAssignment)
    && Array.isArray(value.reveals)
    && value.reveals.every((entry) => object(entry)
      && text(entry.reviewItemId)
      && text(entry.runId)
      && text(entry.cellId)
      && [1, 2].includes(entry.repeat as number)
      && validDigest(entry.blindedItemDigest)
      && boundedScore(entry.score)
      && boundedScore(entry.rawScore)
      && Array.isArray(entry.criticalCaps)
      && entry.criticalCaps.every((cap) => typeof cap === "string" && allowedCriticalCaps.has(cap as CriticalCap))
      && boundedScore(entry.traceabilityPercent));
}
function runShape(value: unknown): value is PlannerBenchmarkRun {
  if (!object(value) || value.schemaVersion !== "boulder.planner-benchmark-run.v1" || !text(value.runId) || !text(value.cellId) || !expectedCellIds.has(value.cellId) || ![1, 2].includes(value.repeat as number) || !positiveSafeInteger(value.sequence) || !boundedScore(value.score) || !boundedScore(value.rawScore) || !boundedScore(value.traceabilityPercent) || (value.scopeStatus !== "passed" && value.scopeStatus !== "failed" && value.scopeStatus !== "unknown") || !Array.isArray(value.criticalCaps) || !value.criticalCaps.every((cap) => typeof cap === "string" && allowedCriticalCaps.has(cap as CriticalCap)) || new Set(value.criticalCaps).size !== value.criticalCaps.length || !object(value.execution) || (value.execution.status !== "passed" && value.execution.status !== "failed") || (value.execution.scopeStatus !== "passed" && value.execution.scopeStatus !== "failed" && value.execution.scopeStatus !== "unknown") || !safePath(value.execution.path) || !validDigest(value.execution.digest) || value.execution.schemaVersion !== "boulder.planner-execution-receipt.v1" || !text(value.reviewItemId) || !validDigest(value.blindedItemDigest)) return false;
  const digestFields = ["protocolDigest", "manifestDigest", "rawRunDigest", "sourceDigest", "packetDigest", "approvalDigest", "executionDigest", "verificationDigest", "reviewerDigest", "redactionDigest", "normalizerDigest"];
  return digestFields.every((field) => validDigest(value[field])) && exactStrings(value.reviewDigests) && value.reviewDigests.every(validDigest) && text(value.normalizerVersion) && (value.replacesRunId === undefined || text(value.replacesRunId));
}
function exclusionShape(value: unknown): value is PlannerStudyExclusion {
  return object(value) && text(value.runId) && text(value.cellId) && [1, 2].includes(value.repeat as number) && positiveSafeInteger(value.sequence) && text(value.reason) && validDigest(value.evidenceDigest) && text(value.adjudicator) && isoTime(value.excludedAt) && (value.replacementOf === undefined || text(value.replacementOf));
}

export function validatePlannerEvidenceBundle(value: unknown): readonly PlannerBenchmarkIssue[] {
  if (!object(value) || value.schemaVersion !== "boulder.planner-evidence-bundle.v1" || !text(value.studyId) || !validDigest(value.protocolDigest) || !validDigest(value.manifestDigest) || !validDigest(value.rubricDigest) || !validDigest(value.normalizerDigest) || !validDigest(value.assignmentsDigest) || !validDigest(value.approvalsDigest) || !validDigest(value.redactionsDigest) || !validDigest(value.trustRootFingerprintSetDigest) || !validDigest(value.studyRootDigest) || !Array.isArray(value.normalizedRuns) || !Array.isArray(value.exclusions) || !Array.isArray(value.artifactIndex) || !object(value.studyArtifacts) || !scoreLockReceiptShape(value.scoreLockReceipt) || !scoreRevealReceiptShape(value.scoreRevealReceipt) || !signatureShape(value.signature)) return [issue("plan.benchmark.bundle_invalid", "$", "Evidence bundle requires complete signed evidence fields.")];
  const issues: PlannerBenchmarkIssue[] = [];
  const artifactPaths = new Set<string>();
  for (const [index, artifact] of value.artifactIndex.entries()) {
    if (!artifactShape(artifact) || artifactPaths.has(artifact.path)) issues.push(issue("plan.benchmark.bundle_invalid", `artifactIndex[${index}]`, "Artifact index entries must be unique, safe, and digested."));
    else artifactPaths.add(artifact.path);
  }
  const prospectiveArtifactsValid = (value.studyArtifacts.prospectiveScoreSheet === undefined && value.studyArtifacts.prospectiveScoreLock === undefined)
    || (artifactShape(value.studyArtifacts.prospectiveScoreSheet) && artifactShape(value.studyArtifacts.prospectiveScoreLock));
  if (![value.studyArtifacts.rubric, value.studyArtifacts.normalizer, value.studyArtifacts.assignments, value.studyArtifacts.approvals, value.studyArtifacts.redactions].every(artifactShape) || !prospectiveArtifactsValid) issues.push(issue("plan.benchmark.bundle_invalid", "studyArtifacts", "Study artifacts are invalid."));
  const runIds = new Set<string>();
  const identities = new Set<string>();
  for (const [index, run] of value.normalizedRuns.entries()) {
    if (!runShape(run)) { issues.push(issue("plan.benchmark.run_invalid", `normalizedRuns[${index}]`, "Scored normalized run requires complete v1 evidence fields.")); continue; }
    const identity = `${run.cellId}:${run.repeat}`;
    if (runIds.has(run.runId) || identities.has(identity)) issues.push(issue("plan.benchmark.duplicate_run", `normalizedRuns[${index}]`, "Scored run identities must be unique."));
    runIds.add(run.runId);
    identities.add(identity);
  }
  const exclusionIds = new Set<string>();
  for (const [index, exclusion] of value.exclusions.entries()) {
    if (!exclusionShape(exclusion)) { issues.push(issue("plan.benchmark.replacement_invalid", `exclusions[${index}]`, "Exclusion requires complete provenance fields.")); continue; }
    if (exclusionIds.has(exclusion.runId)) issues.push(issue("plan.benchmark.duplicate_run", `exclusions[${index}].runId`, "Exclusion IDs must be unique."));
    exclusionIds.add(exclusion.runId);
  }
  return issues;
}

interface DerivedState {
  readonly eligible: readonly string[];
  readonly excluded: readonly string[];
  readonly reasons: readonly string[];
  readonly metrics: PlannerBenchmarkMetrics;
}
function deriveState(value: PlannerBenchmarkProvenance, issues: readonly PlannerBenchmarkIssue[] = []): DerivedState {
  const bundle = object(value.bundle) ? value.bundle : {};
  const runValues = Array.isArray(bundle.normalizedRuns) ? bundle.normalizedRuns : [];
  const runs = runValues.filter(object);
  const exclusions = Array.isArray(bundle.exclusions) ? bundle.exclusions.filter(object) : [];
  const eligible = issues.length === 0
    ? unique(runs.filter((run) => object(run.execution) && run.execution.status === "passed" && run.scopeStatus === "passed" && run.execution.scopeStatus === "passed" && Array.isArray(run.criticalCaps) && run.criticalCaps.length === 0 && run.traceabilityPercent === 100).map((run) => run.runId).filter(text))
    : [];
  const excluded = unique(exclusions.map((entry) => entry.runId).filter(text));
  const target = runs.filter((run) => text(run.cellId) && run.cellId.startsWith("boulder-native:"));
  const weight = (run: Record<string, unknown>): number => (run.cellId as string).includes(":high-risk-change:") ? 2 : (run.cellId as string).includes(":medium-feature:") ? 1.5 : 1;
  const denominator = target.reduce((sum, run) => sum + weight(run), 0);
  const cases = new Map<string, number[]>();
  for (const run of target) if (boundedScore(run.score)) cases.set(run.cellId as string, [...(cases.get(run.cellId as string) ?? []), run.score]);
  const maximumRepeatVariance = cases.size === 6 && [...cases.values()].every((scores) => scores.length === 2) ? Math.max(...[...cases.values()].map((scores) => Math.abs(scores[0] - scores[1]))) : null;
  const invalidCodes = new Set<PlannerBenchmarkErrorCode>(["plan.benchmark.run_invalid", "plan.benchmark.replacement_invalid", "plan.benchmark.evidence_invalid", "plan.benchmark.provenance_missing", "plan.benchmark.digest_mismatch"]);
  const metrics: PlannerBenchmarkMetrics = {
    scoredRunCount: runValues.length,
    eligibleRunCount: eligible.length,
    weightedAverage: target.length === 12 && denominator > 0 ? target.reduce((sum, run) => sum + (boundedScore(run.score) ? run.score : 0) * weight(run), 0) / denominator : null,
    targetCaseMinimum: target.length === 12 && target.every((run) => boundedScore(run.score)) ? Math.min(...target.map((run) => run.score as number)) : null,
    maximumRepeatVariance,
    traceabilityPercent: runs.length > 0 ? Math.min(...runs.map((run) => boundedScore(run.traceabilityPercent) ? run.traceabilityPercent : 0)) : null,
    executionFailureCount: runs.filter((run) => object(run.execution) && run.execution.status === "failed").length,
    criticalCapCount: runs.filter((run) => Array.isArray(run.criticalCaps) && run.criticalCaps.length > 0).length,
    invalidRunCount: issues.filter((entry) => invalidCodes.has(entry.code)).length
  };
  const reasons = unique([
    ...issues.map((entry) => entry.code),
    metrics.criticalCapCount > 0 ? "critical_caps" : "",
    metrics.executionFailureCount > 0 ? "execution_failures" : "",
    eligible.length < 36 ? "insufficient_eligible_runs" : "",
    object(bundle.scoreLockReceipt) && bundle.scoreLockReceipt.kind === "retrospective-attestation" ? "retrospective_lock_attestation" : "",
    runs.some((run) => run.scopeStatus !== "passed" || !object(run.execution) || run.execution.scopeStatus !== "passed") ? "scope_attribution_unknown" : "",
    metrics.traceabilityPercent !== 100 ? "incomplete_traceability" : "",
    metrics.invalidRunCount > 0 ? "invalid_or_malformed_runs" : ""
  ].filter(text));
  return { eligible, excluded, reasons, metrics };
}

export function validatePlannerBenchmarkReport(value: unknown): readonly PlannerBenchmarkIssue[] {
  if (!object(value) || value.schemaVersion !== "boulder.planner-benchmark-report.v1" || !validDigest(value.bundleDigest) || !validDigest(value.trustRootFingerprintSetDigest) || !exactStrings(value.eligibleRunIds) || !exactStrings(value.excludedRunIds) || (value.decision !== "HOLD" && value.decision !== "PREVIEW" && value.decision !== "FIRST_FALLBACK_REVIEW") || !exactStrings(value.reasons) || !object(value.metrics)) return [issue("plan.benchmark.report_invalid", "$", "Benchmark report requires complete canonical fields.")];
  const metrics = value.metrics;
  return !Number.isInteger(metrics.scoredRunCount) || !Number.isInteger(metrics.eligibleRunCount) || !(metrics.weightedAverage === null || boundedScore(metrics.weightedAverage)) || !(metrics.targetCaseMinimum === null || boundedScore(metrics.targetCaseMinimum)) || !(metrics.maximumRepeatVariance === null || boundedScore(metrics.maximumRepeatVariance)) || !(metrics.traceabilityPercent === null || boundedScore(metrics.traceabilityPercent)) || !Number.isInteger(metrics.executionFailureCount) || !Number.isInteger(metrics.criticalCapCount) || !Number.isInteger(metrics.invalidRunCount) ? [issue("plan.benchmark.report_invalid", "metrics", "Benchmark report metrics are invalid.")] : [];
}

function calculatePlannerBenchmarkReport(value: PlannerBenchmarkProvenance, issues: readonly PlannerBenchmarkIssue[]): PlannerBenchmarkReport {
  const root = object(value.trustRoot) && Array.isArray(value.trustRoot.keys) ? value.trustRoot as unknown as PlannerBenchmarkTrustRoot : undefined;
  const derived = deriveState(value, issues);
  const thresholdBlocked = derived.metrics.weightedAverage === null || derived.metrics.weightedAverage < 85;
  const reasons = derived.reasons.length > 0 ? derived.reasons : thresholdBlocked ? ["target_threshold_not_met"] : [];
  const safe = reasons.length === 0;
  const firstFallback = safe && derived.metrics.targetCaseMinimum !== null && derived.metrics.targetCaseMinimum >= 88 && derived.metrics.weightedAverage !== null && derived.metrics.weightedAverage >= 92 && derived.metrics.maximumRepeatVariance !== null && derived.metrics.maximumRepeatVariance <= 5;
  const decision = firstFallback ? "FIRST_FALLBACK_REVIEW" : safe ? "PREVIEW" : "HOLD";
  return {
    schemaVersion: "boulder.planner-benchmark-report.v1",
    bundleDigest: hash(object(value.bundle) ? value.bundle : {}),
    trustRootFingerprintSetDigest: root ? trustRootFingerprintSetDigest(root) : "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    eligibleRunIds: derived.eligible,
    excludedRunIds: derived.excluded,
    decision,
    reasons: reasons.length > 0 ? reasons : decision === "FIRST_FALLBACK_REVIEW" ? ["first_fallback_threshold_met"] : ["preview_threshold_met"],
    metrics: derived.metrics
  };
}

const validatedReports = new WeakMap<object, { readonly fingerprint: string; readonly report: PlannerBenchmarkReport }>();
function provenanceFingerprint(value: PlannerBenchmarkProvenance): string {
  return hash({
    trustRoot: value.trustRoot,
    protocol: value.protocol,
    manifest: value.manifest,
    rawRuns: value.rawRuns,
    bundle: value.bundle,
    report: value.report,
    evidenceFiles: (value.evidenceFiles ?? []).map((file) => ({ path: file.path, digest: sha256Bytes(file.bytes) }))
  });
}
export function buildPlannerBenchmarkReport(value: PlannerBenchmarkProvenance, issues: readonly PlannerBenchmarkIssue[] = []): PlannerBenchmarkReport {
  if (issues.length > 0) return calculatePlannerBenchmarkReport(value, issues);
  const cached = validatedReports.get(value as object);
  if (cached && cached.fingerprint === provenanceFingerprint(value)) return cached.report;
  return calculatePlannerBenchmarkReport(value, [...issues, issue("plan.benchmark.provenance_missing", "validation", "Promotion reports require a successful evidence validation proof.")]);
}

async function verifySignature(root: PlannerBenchmarkTrustRoot, signed: Record<string, unknown>, path: string, role?: "manifest" | "bundle" | "executor", protocol?: Record<string, unknown>): Promise<PlannerBenchmarkIssue | undefined> {
  const signature = signed.signature;
  if (!signatureShape(signature)) return issue("plan.benchmark.signature_invalid", `${path}.signature`, "Signature envelope is invalid.");
  const key = root.keys.find((entry) => entry.keyId === signature.keyId);
  const status = trustKeyStatus(root, signature.keyId);
  if (status) return { ...status, path: `${path}.signature.keyId` };
  if (!key) return issue("plan.benchmark.key_unknown", `${path}.signature.keyId`, "Signer key is not in the trust root.");
  if (role) {
    const authorized = protocol && Array.isArray(protocol.delegatedSigners) && protocol.delegatedSigners.some((delegate) => object(delegate) && delegate.keyId === signature.keyId && delegate.fingerprint === key.fingerprint && Array.isArray(delegate.roles) && delegate.roles.includes(role));
    if (!authorized) return issue("plan.benchmark.signer_unauthorized", `${path}.signature.keyId`, "Signer is not authorized for this artifact role.");
  }
  try {
    const publicKeyBytes = decodeBase64url(key.publicKey);
    const signatureBytes = decodeBase64url(signature.signature);
    if (!publicKeyBytes || !signatureBytes) return issue("plan.benchmark.signature_invalid", `${path}.signature`, "Signature envelope is invalid.");
    const publicKey = await crypto.subtle.importKey("raw", copiedBuffer(publicKeyBytes), { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("Ed25519", publicKey, copiedBuffer(signatureBytes), copiedBuffer(new TextEncoder().encode(canonical(withoutSignature(signed)))));
    return ok ? undefined : issue("plan.benchmark.signature_invalid", `${path}.signature`, "Ed25519 signature verification failed.");
  } catch {
    return issue("plan.benchmark.signature_invalid", `${path}.signature`, "Ed25519 signature verification failed.");
  }
}

function indexArtifacts(bundle: PlannerEvidenceBundle, files: readonly PlannerEvidenceFile[], issues: PlannerBenchmarkIssue[]): { artifacts: Map<string, PlannerEvidenceArtifact>; files: Map<string, PlannerEvidenceFile> } {
  const fileMap = new Map<string, PlannerEvidenceFile>();
  for (const [index, file] of files.entries()) {
    if (!safePath(file.path) || !(file.bytes instanceof Uint8Array) || fileMap.has(file.path)) issues.push(issue("plan.benchmark.evidence_invalid", `evidenceFiles[${index}]`, "Evidence files require unique safe paths and bytes."));
    else fileMap.set(file.path, file);
  }
  const artifacts = new Map<string, PlannerEvidenceArtifact>();
  for (const artifact of bundle.artifactIndex) {
    if (!artifactShape(artifact) || artifacts.has(artifact.path)) continue;
    artifacts.set(artifact.path, artifact);
    const file = fileMap.get(artifact.path);
    if (!file || sha256Bytes(file.bytes) !== artifact.digest) issues.push(issue("plan.benchmark.digest_mismatch", `artifactIndex.${artifact.path}`, "Indexed artifact bytes do not match their signed digest."));
  }
  if (fileMap.size !== artifacts.size || [...fileMap.keys()].some((path) => !artifacts.has(path))) issues.push(issue("plan.benchmark.evidence_invalid", "evidenceFiles", "Evidence bytes must exactly match the signed artifact index."));
  return { artifacts, files: fileMap };
}
function artifactJoined(reference: PlannerEvidenceArtifact, artifacts: ReadonlyMap<string, PlannerEvidenceArtifact>, files: ReadonlyMap<string, PlannerEvidenceFile>): boolean {
  const indexed = artifacts.get(reference.path);
  const file = files.get(reference.path);
  return Boolean(indexed && file && canonical(indexed) === canonical(reference) && sha256Bytes(file.bytes) === reference.digest);
}
function parsedArtifact(reference: PlannerEvidenceArtifact, artifacts: ReadonlyMap<string, PlannerEvidenceArtifact>, files: ReadonlyMap<string, PlannerEvidenceFile>): unknown {
  return artifactJoined(reference, artifacts, files) ? jsonBytes(files.get(reference.path)) : undefined;
}
function concatenatedArtifactDigest(references: readonly PlannerEvidenceArtifact[], artifacts: ReadonlyMap<string, PlannerEvidenceArtifact>, files: ReadonlyMap<string, PlannerEvidenceFile>): string | undefined {
  if (references.length === 0 || !references.every((reference) => artifactJoined(reference, artifacts, files))) return undefined;
  const byteArrays = references.map((reference) => files.get(reference.path)?.bytes).filter((bytes): bytes is Uint8Array => Boolean(bytes));
  if (byteArrays.length !== references.length) return undefined;
  const combined = new Uint8Array(byteArrays.reduce((total, bytes) => total + bytes.length, 0));
  let offset = 0;
  for (const bytes of byteArrays) {
    combined.set(bytes, offset);
    offset += bytes.length;
  }
  return sha256Bytes(combined);
}
function protocolShape(value: unknown): value is PlannerStudyProtocol {
  const prospective = object(value) && value.blindingPolicy === prospectiveBlindingPolicy;
  return object(value)
    && value.schemaVersion === "boulder.planner-study-protocol.v1"
    && text(value.studyId) && text(value.rubricVersion) && validDigest(value.rubricDigest)
    && value.normalizerVersion === "pr8b-strict-packet-v2" && validDigest(value.normalizerDigest)
    && validDigest(value.normalizerContractDigest)
    && validDigest(value.runnerContractDigest)
    && object(value.protocolSigner) && text(value.protocolSigner.keyId) && validDigest(value.protocolSigner.fingerprint)
    && Array.isArray(value.delegatedSigners)
    && value.delegatedSigners.every((delegate) => object(delegate) && text(delegate.keyId) && validDigest(delegate.fingerprint) && Array.isArray(delegate.roles) && delegate.roles.length > 0 && delegate.roles.every((role) => role === "manifest" || role === "bundle" || role === "executor") && new Set(delegate.roles).size === delegate.roles.length)
    && Object.entries(frozenProtocolPolicies).every(([policy, expected]) => value[policy] === expected)
    && acceptedBlindingPolicies.has(value.blindingPolicy as string)
    && (!prospective || validDigest(value.scoreLockReceiptDigest) && validDigest(value.privateMapDigest))
    && signatureShape(value.signature);
}
function containsTerm(values: readonly string[], term: string): boolean {
  return values.some((value) => value.toLowerCase().includes(term));
}
function approvalArtifactValid(value: unknown): boolean {
  return object(value)
    && value.schemaVersion === "boulder.planner-study-approval.v1"
    && value.taskContractApproved === true
    && value.commonExecutorValidationApproved === true
    && value.underlyingModelApproved === "openai-codex/gpt-5.6-sol"
    && object(value.automatedReviewAuthorization)
    && value.automatedReviewAuthorization.approved === true
    && value.automatedReviewAuthorization.provenanceDisclosureRequired === true;
}

function redactionArtifactValid(value: unknown): boolean {
  if (!object(value) || value.schemaVersion !== "boulder.planner-redaction-policy.v1") return false;
  const remove = value.remove;
  const preserve = value.preserve;
  if (!exactStrings(remove) || !exactStrings(preserve) || remove.length === 0 || preserve.length === 0) return false;
  return ["credential", "home", "provider"].every((term) => containsTerm(remove, term))
    && ["path", "symbol", "test", "planner", "approval"].every((term) => containsTerm(preserve, term));
}
function runnerContractValid(value: unknown): boolean {
  if (!object(value)
    || value.schemaVersion !== "boulder.planner-runner-contract.v1"
    || value.transport !== "gjc"
    || value.model !== "openai-codex/gpt-5.6-sol"
    || value.thinking !== "medium"
    || value.scoredRunsStartAfterAmendment !== true
    || value.normalizerVersion !== "pr8b-strict-packet-v2"
    || !validDigest(value.normalizerContractDigest)
    || !exactStrings(value.commonConstraints)
    || !Array.isArray(value.planners)
    || !object(value.personas)) return false;
  const commonConstraints = value.commonConstraints as readonly string[];
  const requiredConstraints = ["planning-only", "read-only repository inspection", "no source edits", "no implementation execution", "same task card and frozen revision"];
  const declaredPlanners = new Set<string>();
  const plannersValid = value.planners.length === plannerIds.length
    && value.planners.every((planner) => object(planner)
      && text(planner.plannerId)
      && plannerIds.includes(planner.plannerId as typeof plannerIds[number])
      && !declaredPlanners.has(planner.plannerId)
      && Boolean(declaredPlanners.add(planner.plannerId)));
  return plannersValid
    && requiredConstraints.every((constraint) => commonConstraints.includes(constraint))
    && plannerIds.every((plannerId) => declaredPlanners.has(plannerId))
    && !canonical(value).toLowerCase().includes("handoff");
}
function executionArtifactGroupValid(
  references: readonly PlannerEvidenceArtifact[],
  schemaVersion: string,
  runId: string,
  status: "passed" | "failed",
  files: ReadonlyMap<string, PlannerEvidenceFile>
): boolean {
  if (references.length === 0 || references.some((reference) => reference.schemaVersion !== schemaVersion)) return false;
  const parsed = references.map((reference) => jsonBytes(files.get(reference.path)));
  if (parsed.every(object)) {
    return parsed.every((entry) => entry.schemaVersion === schemaVersion && entry.runId === runId && entry.status === status);
  }
  if (parsed.some(object)) return false;
  const texts = references.map((reference) => textBytes(files.get(reference.path)));
  if (texts.some((entry) => entry === undefined)) return false;
  const combined = texts.join("\n");
  if (schemaVersion === "boulder.planner-execution-patch.v1") return /^diff --git /m.test(combined) && /^--- /m.test(combined) && /^\+\+\+ /m.test(combined);
  const testFailureMarker = /\b(?:\d+\s+(?:tests?\s+)?fail(?:ed)?|tests?\s+failed|test files?\s+\d+\s+failed|not ok|command failed|exit code [1-9][0-9]*|error TS[0-9]+)\b/i;
  const typecheckFailureMarker = /\b(?:command failed|exit code [1-9][0-9]*|error TS[0-9]+|found [1-9][0-9]* errors?|[1-9][0-9]* errors?|enoent)\b/i;
  if (schemaVersion === "boulder.planner-test-output.v1") {
    return status === "passed"
      ? /\b(?:\d+\s+(?:tests?\s+)?pass(?:ed)?|test files?\s+\d+\s+passed|ok)\b/i.test(combined) && !testFailureMarker.test(combined)
      : testFailureMarker.test(combined);
  }
  if (schemaVersion === "boulder.planner-typecheck-output.v1") {
    return status === "passed"
      ? /\b(tsc|typecheck|typescript)\b/i.test(combined) && !typecheckFailureMarker.test(combined)
      : typecheckFailureMarker.test(combined);
  }
  return false;
}

async function validatePlannerBenchmarkEvidenceGraph(value: PlannerBenchmarkProvenance): Promise<readonly PlannerBenchmarkIssue[]> {
  const protocolValid = protocolShape(value.protocol);
  const rawRuns = Array.isArray(value.rawRuns) ? value.rawRuns : [];
  const issues: PlannerBenchmarkIssue[] = [
    ...validatePlannerBenchmarkTrustRoot(value.trustRoot),
    ...validatePlannerStudyManifest(value.manifest),
    ...validatePlannerEvidenceBundle(value.bundle),
    ...rawRuns.flatMap(validatePlannerStudyRawRun),
    ...(protocolValid ? [] : [issue("plan.benchmark.provenance_missing", "protocol", "Protocol requires complete PR8B provenance, policy, and delegated signer fields.")]),
    ...(Array.isArray(value.rawRuns) ? [] : [issue("plan.benchmark.run_invalid", "rawRuns", "Raw runs must be an array.")])
  ];
  if (!object(value.trustRoot) || !protocolValid || !object(value.manifest) || !object(value.bundle) || issues.some((entry) => entry.code === "plan.benchmark.trust_root_invalid" || entry.code === "plan.benchmark.manifest_invalid" || entry.code === "plan.benchmark.bundle_invalid" || entry.code === "plan.benchmark.run_invalid" || entry.code === "plan.benchmark.replacement_invalid" || entry.code === "plan.benchmark.study_path_invalid")) return [...issues, issue("plan.benchmark.provenance_missing", "$", "Complete structurally valid benchmark evidence is required.")];
  const root = value.trustRoot as unknown as PlannerBenchmarkTrustRoot;
  const protocol = value.protocol as unknown as Record<string, unknown>;
  const manifest = value.manifest;
  const bundle = value.bundle as unknown as PlannerEvidenceBundle;
  if (bundle.normalizedRuns.length !== 36 || new Set(bundle.normalizedRuns.map((run) => `${run.cellId}:${run.repeat}`)).size !== 36) issues.push(issue("plan.benchmark.run_invalid", "normalizedRuns", "Exactly 36 scored cell-repeat rows are required."));
  const bind = (actual: unknown, expected: string, path: string) => { if (actual !== expected) issues.push(issue("plan.benchmark.digest_mismatch", path, "Cross-artifact digest does not match.")); };
  const protocolDigest = hash(protocol);
  const manifestDigest = hash(manifest);
  const fingerprintDigest = trustRootFingerprintSetDigest(root);
  bind(manifest.protocolDigest, protocolDigest, "manifest.protocolDigest");
  bind(bundle.protocolDigest, protocolDigest, "bundle.protocolDigest");
  bind(bundle.manifestDigest, manifestDigest, "bundle.manifestDigest");
  bind(bundle.rubricDigest, protocol.rubricDigest as string, "bundle.rubricDigest");
  bind(bundle.normalizerDigest, protocol.normalizerDigest as string, "bundle.normalizerDigest");
  bind(bundle.trustRootFingerprintSetDigest, fingerprintDigest, "bundle.trustRootFingerprintSetDigest");
  bind(bundle.studyRootDigest, plannerStudyRootDigest({ protocol, manifest, bundle: bundle as unknown as Record<string, unknown>, trustRoot: root }), "bundle.studyRootDigest");
  if (protocol.studyId !== manifest.studyId || protocol.studyId !== bundle.studyId) issues.push(issue("plan.benchmark.study_identity_mismatch", "studyId", "Protocol, manifest, and bundle must bind the same study ID."));

  const indexed = indexArtifacts(bundle, value.evidenceFiles ?? [], issues);
  const studyArtifacts = bundle.studyArtifacts;
  const prospectivePolicy = protocol.blindingPolicy === prospectiveBlindingPolicy;
  const prospectiveScoreSheet = studyArtifacts.prospectiveScoreSheet;
  const prospectiveScoreLock = studyArtifacts.prospectiveScoreLock;
  const studyRefs = [studyArtifacts.rubric, studyArtifacts.normalizer, studyArtifacts.assignments, studyArtifacts.approvals, studyArtifacts.redactions, ...(prospectiveScoreSheet && prospectiveScoreLock ? [prospectiveScoreSheet, prospectiveScoreLock] : [])];
  for (const reference of studyRefs) if (!artifactJoined(reference, indexed.artifacts, indexed.files)) issues.push(issue("plan.benchmark.evidence_invalid", `studyArtifacts.${reference.path}`, "Study artifact is not byte-verified by the signed index."));
  bind(studyArtifacts.rubric.digest, bundle.rubricDigest, "studyArtifacts.rubric");
  bind(studyArtifacts.normalizer.digest, bundle.normalizerDigest, "studyArtifacts.normalizer");
  bind(studyArtifacts.assignments.digest, bundle.assignmentsDigest, "studyArtifacts.assignments");
  bind(studyArtifacts.approvals.digest, bundle.approvalsDigest, "studyArtifacts.approvals");
  bind(studyArtifacts.redactions.digest, bundle.redactionsDigest, "studyArtifacts.redactions");
  if (prospectivePolicy) {
    const prospectiveSheet = prospectiveScoreSheet ? parsedArtifact(prospectiveScoreSheet, indexed.artifacts, indexed.files) : undefined;
    const prospectiveLock = prospectiveScoreLock ? parsedArtifact(prospectiveScoreLock, indexed.artifacts, indexed.files) : undefined;
    const prospectiveItems = object(prospectiveSheet) && prospectiveSheet.schemaVersion === "boulder.blinded-score-sheet.v1" && Array.isArray(prospectiveSheet.items) && prospectiveSheet.items.every(object)
      ? prospectiveSheet.items as Record<string, unknown>[]
      : [];
    const prospectiveReceipt = scoreLockReceiptShape(prospectiveLock) ? prospectiveLock : undefined;
    const prospectiveById = new Map<string, Record<string, unknown>>();
    for (const item of prospectiveItems) if (text(item.reviewItemId) && !prospectiveById.has(item.reviewItemId)) prospectiveById.set(item.reviewItemId, item);
    const prospectiveReceiptItems = prospectiveReceipt ? new Map(prospectiveReceipt.blindedItems.map((entry) => [entry.reviewItemId, entry.blindedItemDigest])) : new Map<string, string>();
    const prospectiveItemsValid = prospectiveItems.length === 36
      && prospectiveById.size === 36
      && prospectiveItems.every((item) => {
        const keys = Object.keys(item).sort();
        const shapeValid = canonical(keys) === canonical(["criticalCaps", "locked", "plannerAlias", "reviewItemId", "scores"])
          || canonical(keys) === canonical(["criticalCaps", "locked", "notes", "plannerAlias", "reviewItemId", "scores"]);
        return shapeValid
          && ["planner-A", "planner-B", "planner-C"].includes(item.plannerAlias as string)
          && item.scores === null
          && item.criticalCaps === null
          && item.locked === false
          && (item.notes === undefined || item.notes === "");
      });
    if (!prospectiveScoreSheet
      || !prospectiveScoreLock
      || !artifactJoined(prospectiveScoreSheet, indexed.artifacts, indexed.files)
      || !artifactJoined(prospectiveScoreLock, indexed.artifacts, indexed.files)
      || prospectiveScoreLock.digest !== protocol.scoreLockReceiptDigest
      || !prospectiveReceipt
      || prospectiveReceipt.kind !== "prospective-lock"
      || canonical(prospectiveReceipt.scoreSheet) !== canonical(prospectiveScoreSheet)
      || prospectiveReceipt.lockDigest !== hash(prospectiveReceipt.blindedItems)
      || !prospectiveItemsValid
      || prospectiveReceipt.blindedItems.length !== 36
      || prospectiveReceiptItems.size !== 36
      || [...prospectiveById].some(([id, item]) => prospectiveReceiptItems.get(id) !== hash(item))) {
      issues.push(issue("plan.benchmark.evidence_invalid", "studyArtifacts.prospectiveScoreLock", "Prospective score lock must byte-bind exactly 36 unique, blinded, unscored items before scoring."));
    }
  }
  if (studyArtifacts.normalizer.schemaVersion !== "boulder.planner-normalizer-source.v1") issues.push(issue("plan.benchmark.evidence_invalid", "studyArtifacts.normalizer", "Normalizer source must be byte-verified under the PR8B source schema."));
  const approvals = parsedArtifact(studyArtifacts.approvals, indexed.artifacts, indexed.files);
  const redactions = parsedArtifact(studyArtifacts.redactions, indexed.artifacts, indexed.files);
  if (!approvalArtifactValid(approvals)) issues.push(issue("plan.benchmark.evidence_invalid", "studyArtifacts.approvals", "Signed study approval must authorize the task and common executor model with automated-review disclosure."));
  if (!redactionArtifactValid(redactions)) issues.push(issue("plan.benchmark.evidence_invalid", "studyArtifacts.redactions", "Signed redaction policy must remove sensitive identifiers and preserve technical and approval evidence."));
  const rubric = parsedArtifact(studyArtifacts.rubric, indexed.artifacts, indexed.files);
  const rubricValid = object(rubric)
    && rubric.schemaVersion === "boulder.planner-rubric.v1"
    && rubric.version === protocol.rubricVersion
    && canonical(rubric.criteria) === canonical(rubricCriteria)
    && Array.isArray(rubric.criticalCaps)
    && canonical([...rubric.criticalCaps].sort()) === canonical([...allowedCriticalCaps].sort());
  if (!rubricValid) issues.push(issue("plan.benchmark.evidence_invalid", "studyArtifacts.rubric", "Authenticated rubric must match the frozen v1 criteria, weights, and critical caps."));
  const runnerReference = bundle.artifactIndex.find((entry) => entry.schemaVersion === "boulder.planner-runner-contract.v1");
  const runnerContract = runnerReference ? parsedArtifact(runnerReference, indexed.artifacts, indexed.files) : undefined;
  if (!runnerReference
    || !artifactJoined(runnerReference, indexed.artifacts, indexed.files)
    || !runnerContractValid(runnerContract)
    || hash(runnerContract) !== protocol.runnerContractDigest
    || (runnerContract as Record<string, unknown>).normalizerContractDigest !== protocol.normalizerContractDigest) {
    issues.push(issue("plan.benchmark.evidence_invalid", "runnerContract", "Signed runner contract must pin GJC transport, the approved model, frozen revision behavior, and exclude external Handoff."));
  }
  const normalizerContractReference = bundle.artifactIndex.find((entry) => entry.schemaVersion === "boulder.planner-normalizer-contract.v2");
  const normalizerContract = normalizerContractReference ? parsedArtifact(normalizerContractReference, indexed.artifacts, indexed.files) : undefined;
  if (!normalizerContractReference
    || !artifactJoined(normalizerContractReference, indexed.artifacts, indexed.files)
    || normalizerContractReference.digest !== protocol.normalizerContractDigest
    || !object(normalizerContract)
    || normalizerContract.schemaVersion !== "boulder.planner-normalizer-contract.v2"
    || normalizerContract.version !== protocol.normalizerVersion
    || normalizerContract.sourceDigest !== protocol.normalizerDigest
    || normalizerContract.inputSchema !== "boulder.planner-output.v1"
    || normalizerContract.artifactSchema !== "boulder.planner-normalization-artifact.v1"
    || normalizerContract.packetSchema !== "boulder.planning-packet.v1"
    || !text(normalizerContract.rawCapture)
    || !text(normalizerContract.trustPolicy)
    || canonical(normalizerContract).toLowerCase().includes("handoff")) {
    issues.push(issue("plan.benchmark.evidence_invalid", "normalizerContract", "Signed normalizer contract must bind the frozen source, schemas, raw capture, and trust policy."));
  }

  const manifestTasks = manifest.tasks as readonly Record<string, unknown>[];
  const taskCards = new Map<string, Record<string, unknown>>();
  for (const task of manifestTasks) {
    const taskId = task.taskId as string;
    const reference = bundle.artifactIndex.find((entry) => entry.path === `task-cards/${taskId}.json`);
    const taskCard = reference ? parsedArtifact(reference, indexed.artifacts, indexed.files) : undefined;
    const expectedRepository = taskId.startsWith("TSG-") ? "small-ts-cli" : "medium-multi-module";
    const expectedClass = taskId.includes("-BUG-") ? "small-bug" : taskId.includes("-FEAT-") ? "medium-feature" : "high-risk-change";
    if (!reference
      || reference.schemaVersion !== "boulder.planner-task-card.v1"
      || reference.digest !== task.sha256
      || !artifactJoined(reference, indexed.artifacts, indexed.files)
      || !object(taskCard)
      || taskCard.schemaVersion !== "boulder.planner-task-card.v1"
      || taskCard.taskId !== taskId
      || taskCard.repoId !== expectedRepository
      || taskCard.taskClass !== expectedClass
      || !text(taskCard.objective)
      || !exactStrings(taskCard.acceptanceCriteria)
      || !exactStrings(taskCard.constraints)) {
      issues.push(issue("plan.benchmark.evidence_invalid", `manifest.tasks.${taskId}`, "Manifest task digest must byte-bind its exact task card, repository, class, and constraints."));
    } else taskCards.set(taskId, taskCard);
  }
  const manifestRepositoryRevisions = new Map((manifest.repositories as readonly Record<string, unknown>[]).map((repository) => [repository.repoId as string, repository.revision as string]));

  const indexedRawById = new Map<string, Record<string, unknown>>();
  for (const [index, reference] of bundle.artifactIndex.filter((entry) => entry.schemaVersion === "boulder.planner-study-raw-run.v1").entries()) {
    const parsed = parsedArtifact(reference, indexed.artifacts, indexed.files);
    if (!object(parsed) || !text(parsed.runId) || validatePlannerStudyRawRun(parsed).length > 0 || indexedRawById.has(parsed.runId)) {
      issues.push(issue("plan.benchmark.evidence_invalid", `artifactIndex.rawRuns[${index}]`, "Indexed raw-run records must be valid and uniquely identified."));
    } else indexedRawById.set(parsed.runId, parsed);
  }
  const rawById = new Map<string, PlannerStudyRawRun>();
  const rawRecordIds = new Set<string>();
  for (const [index, rawValue] of value.rawRuns.entries()) {
    if (!object(rawValue) || !text(rawValue.runId) || validatePlannerStudyRawRun(rawValue).length > 0) continue;
    const raw = rawValue as unknown as PlannerStudyRawRun;
    if (rawById.has(raw.runId)) { issues.push(issue("plan.benchmark.duplicate_run", `rawRuns[${index}]`, "Raw-run IDs must be unique.")); continue; }
    rawById.set(raw.runId, raw);
    bind(raw.protocolDigest, protocolDigest, `rawRuns.${raw.runId}.protocolDigest`);
    bind(raw.manifestDigest, manifestDigest, `rawRuns.${raw.runId}.manifestDigest`);
    bind(raw.operatorApprovalDigest, bundle.approvalsDigest, `rawRuns.${raw.runId}.operatorApprovalDigest`);
    bind(raw.redactionInputDigest, bundle.redactionsDigest, `rawRuns.${raw.runId}.redactionInputDigest`);
    if (!expectedCellIds.has(raw.cellId)) issues.push(issue("plan.benchmark.run_invalid", `rawRuns.${raw.runId}.cellId`, "Raw run is outside the frozen manifest matrix."));
    if (!rawRunIdentityValid(raw)) issues.push(issue("plan.benchmark.run_invalid", `rawRuns.${raw.runId}.identity`, "Raw run ID must bind its planner, task, repository, repeat, and replacement sequence."));
    const expectedPlannerOutputId = plannerOutputIds[raw.cellId.split(":")[0]];
    const plannerOutputs = raw.artifacts.filter((entry) => entry.schemaVersion === "boulder.planner-output.v1");
    const plannerOutputValue = plannerOutputs.length === 1 ? parsedArtifact(plannerOutputs[0], indexed.artifacts, indexed.files) : undefined;
    if (!object(plannerOutputValue) || plannerOutputValue.schemaVersion !== "boulder.planner-output.v1" || plannerOutputValue.plannerId !== expectedPlannerOutputId) {
      issues.push(issue("plan.benchmark.evidence_invalid", `rawRuns.${raw.runId}.plannerOutput`, "Raw run must byte-bind exactly one planner output whose identity matches the signed study cell."));
    }
    for (const artifact of raw.artifacts) if (!artifactJoined(artifact, indexed.artifacts, indexed.files)) issues.push(issue("plan.benchmark.evidence_invalid", `rawRuns.${raw.runId}.artifacts.${artifact.path}`, "Raw artifact bytes do not match the signed index."));
    const indexedRecord = indexedRawById.get(raw.runId);
    if (!indexedRecord || canonical(indexedRecord) !== canonical(raw)) issues.push(issue("plan.benchmark.evidence_invalid", `rawRuns.${raw.runId}.record`, "Raw-run record bytes must exactly match the loaded record."));
    else rawRecordIds.add(raw.runId);
  }
  const rawSequences = [...rawById.values()].map((raw) => raw.sequence).sort((left, right) => left - right);
  if (new Set(rawSequences).size !== rawSequences.length || rawSequences.some((sequence, index) => sequence !== index + 1)) {
    issues.push(issue("plan.benchmark.run_invalid", "rawRuns.sequence", "Raw-run physical sequences must be globally unique and contiguous."));
  }
  if (rawRecordIds.size !== rawById.size || indexedRawById.size !== rawById.size || [...indexedRawById.keys()].some((runId) => !rawById.has(runId))) issues.push(issue("plan.benchmark.evidence_invalid", "rawRuns", "Loaded and indexed raw-run records must form one exact set."));

  const lock = bundle.scoreLockReceipt;
  const reveal = bundle.scoreRevealReceipt;
  const prospectiveReceiptForChronology = prospectiveScoreLock ? parsedArtifact(prospectiveScoreLock, indexed.artifacts, indexed.files) : undefined;
  if (!artifactJoined(lock.scoreSheet, indexed.artifacts, indexed.files) || !artifactJoined(reveal.scoreSheet, indexed.artifacts, indexed.files) || !artifactJoined(reveal.privateAssignment, indexed.artifacts, indexed.files)) issues.push(issue("plan.benchmark.evidence_invalid", "scoreReceipts", "Score lock, reveal, and private assignment artifacts must be byte-verified."));
  if (lock.lockDigest !== hash(lock.blindedItems) || reveal.lockDigest !== lock.lockDigest || reveal.sequence !== lock.sequence + 1 || Date.parse(reveal.occurredAt) <= Date.parse(lock.occurredAt) || prospectivePolicy && (!scoreLockReceiptShape(prospectiveReceiptForChronology) || Date.parse(prospectiveReceiptForChronology.occurredAt) >= Date.parse(lock.occurredAt)) || prospectivePolicy && reveal.privateAssignment.digest !== protocol.privateMapDigest || prospectivePolicy && prospectiveScoreSheet && canonical(lock.scoreSheet) === canonical(prospectiveScoreSheet)) issues.push(issue("plan.benchmark.evidence_invalid", "scoreReceipts", "Scored evidence must use a later lock and bind the prospective private assignment."));
  const lockSheet = parsedArtifact(lock.scoreSheet, indexed.artifacts, indexed.files);
  const revealSheet = parsedArtifact(reveal.scoreSheet, indexed.artifacts, indexed.files);
  const privateAssignment = parsedArtifact(reveal.privateAssignment, indexed.artifacts, indexed.files);
  const lockedItemsSource = object(lockSheet) && lockSheet.schemaVersion === "boulder.blinded-score-sheet.v1" && Array.isArray(lockSheet.items) ? lockSheet.items : undefined;
  const revealedRowsSource = object(revealSheet) && revealSheet.schemaVersion === "boulder.revealed-scores.v1" && Array.isArray(revealSheet.rows) ? revealSheet.rows : undefined;
  const assignmentRowsSource = object(privateAssignment) && privateAssignment.schemaVersion === "boulder.review-private-map.v1" && Array.isArray(privateAssignment.items) ? privateAssignment.items : undefined;
  const scoreArraysValid = Boolean(lockedItemsSource && revealedRowsSource && assignmentRowsSource && lockedItemsSource.every(object) && revealedRowsSource.every(object) && assignmentRowsSource.every(object));
  const lockedItems = scoreArraysValid ? (lockedItemsSource ?? []) as Record<string, unknown>[] : [];
  const revealedRows = scoreArraysValid ? (revealedRowsSource ?? []) as Record<string, unknown>[] : [];
  const assignmentRows = scoreArraysValid ? (assignmentRowsSource ?? []) as Record<string, unknown>[] : [];
  if (!scoreArraysValid || lockedItems.length !== 36 || revealedRows.length !== 36 || assignmentRows.length !== 36 || lock.blindedItems.length !== 36 || reveal.reveals.length !== 36) issues.push(issue("plan.benchmark.evidence_invalid", "scoreReceipts", "Score evidence requires exactly 36 well-formed locked, revealed, and assigned items."));
  const lockedById = new Map<string, Record<string, unknown>>();
  for (const item of lockedItems) if (text(item.reviewItemId) && item.locked === true && !lockedById.has(item.reviewItemId)) lockedById.set(item.reviewItemId, item);
  if (lockedItems.some((item) => "runId" in item || "cellId" in item || "plannerId" in item || "repoId" in item || "taskClass" in item)) issues.push(issue("plan.benchmark.evidence_invalid", "scoreLockReceipt.blinding", "Locked score items must not disclose run or planner identity."));
  const receiptLocked = new Map(lock.blindedItems.map((entry) => [entry.reviewItemId, entry.blindedItemDigest]));
  if (lockedById.size !== lockedItems.length || receiptLocked.size !== lock.blindedItems.length || [...lockedById].some(([id, item]) => receiptLocked.get(id) !== hash(item))) issues.push(issue("plan.benchmark.evidence_invalid", "scoreLockReceipt.blindedItems", "Lock receipt must bind every blinded score item exactly."));
  const revealedById = new Map<string, Record<string, unknown>>();
  for (const row of revealedRows) if (text(row.reviewItemId) && !revealedById.has(row.reviewItemId)) revealedById.set(row.reviewItemId, row);
  const assignmentsById = new Map<string, Record<string, unknown>>();
  for (const row of assignmentRows) if (text(row.reviewItemId) && !assignmentsById.has(row.reviewItemId)) assignmentsById.set(row.reviewItemId, row);
  const receiptReveals = new Map(reveal.reveals.map((entry) => [entry.reviewItemId, entry]));
  if (revealedById.size !== revealedRows.length || assignmentsById.size !== assignmentRows.length || receiptReveals.size !== reveal.reveals.length) issues.push(issue("plan.benchmark.evidence_invalid", "scoreRevealReceipt.reveals", "Reveal and private assignment identities must be unique."));

  const scoredIds = new Set<string>();
  const replacementByPrior = new Map<string, PlannerBenchmarkRun>();
  const plannerAliasByPlanner = new Map<string, string>();
  const plannerByAlias = new Map<string, string>();
  for (const run of bundle.normalizedRuns) {
    scoredIds.add(run.runId);
    bind(run.protocolDigest, protocolDigest, `normalizedRuns.${run.runId}.protocolDigest`);
    bind(run.manifestDigest, manifestDigest, `normalizedRuns.${run.runId}.manifestDigest`);
    bind(run.approvalDigest, bundle.approvalsDigest, `normalizedRuns.${run.runId}.approvalDigest`);
    bind(run.redactionDigest, bundle.redactionsDigest, `normalizedRuns.${run.runId}.redactionDigest`);
    bind(run.normalizerDigest, bundle.normalizerDigest, `normalizedRuns.${run.runId}.normalizerDigest`);
    if (run.normalizerVersion !== protocol.normalizerVersion) issues.push(issue("plan.benchmark.digest_mismatch", `normalizedRuns.${run.runId}.normalizerVersion`, "Run does not use the frozen normalizer version."));
    const raw = rawById.get(run.runId);
    if (!raw) issues.push(issue("plan.benchmark.provenance_missing", `normalizedRuns.${run.runId}.rawRunDigest`, "Every scored run requires raw provenance."));
    else {
      bind(run.rawRunDigest, hash(raw), `normalizedRuns.${run.runId}.rawRunDigest`);
      if (run.cellId !== raw.cellId || run.repeat !== raw.repeat || run.sequence !== raw.sequence) issues.push(issue("plan.benchmark.digest_mismatch", `normalizedRuns.${run.runId}.identity`, "Scored run identity does not match raw provenance."));
      const source = raw.artifacts.find((entry) => entry.schemaVersion === "boulder.planner-trusted-source-catalog.v1");
      const sourceValue = source ? parsedArtifact(source, indexed.artifacts, indexed.files) : undefined;
      const sourceEntries = object(sourceValue) && Array.isArray(sourceValue.entries) ? sourceValue.entries : undefined;
      const [, , expectedRepoId] = run.cellId.split(":");
      const sourceCatalogValid = object(sourceValue)
        && sourceValue.schemaVersion === "boulder.planner-trusted-source-catalog.v1"
        && sourceValue.repoId === expectedRepoId
        && sourceValue.revision === manifestRepositoryRevisions.get(expectedRepoId)
        && Array.isArray(sourceEntries)
        && sourceEntries.length > 0
        && sourceEntries.every((entry) => object(entry) && text(entry.id) && safePath(entry.path) && validDigest(entry.sha256) && text(entry.kind) && entry.trust === "repo-evidence");
      const expectedTaskId = taskIdForCell(run.cellId);
      if (!source || source.digest !== run.sourceDigest || !sourceCatalogValid || !expectedTaskId || !taskCards.has(expectedTaskId)) {
        issues.push(issue("plan.benchmark.evidence_invalid", `normalizedRuns.${run.runId}.sourceDigest`, "Source digest must bind the exact manifest repository revision, repository-evidence catalog, and signed task card."));
      }
      const normalization = raw.artifacts.find((entry) => entry.schemaVersion === "boulder.planner-normalization-artifact.v1");
      const normalizationValue = normalization ? parsedArtifact(normalization, indexed.artifacts, indexed.files) : undefined;
      if (!object(normalizationValue) || normalizationValue.valid !== true || !object(normalizationValue.packet) || normalizationValue.packet.packetDigest !== run.packetDigest || !validatePlanningPacket(normalizationValue.packet).valid) issues.push(issue("plan.benchmark.evidence_invalid", `normalizedRuns.${run.runId}.packetDigest`, "Packet digest and 100% AC traceability must be derived from a valid normalization artifact."));
    }
    const executionReference = indexed.artifacts.get(run.execution.path);
    const executionFile = indexed.files.get(run.execution.path);
    const executionValue = executionFile ? jsonBytes(executionFile) : undefined;
    const executionSignature = object(executionValue)
      ? await verifySignature(root, executionValue, `normalizedRuns.${run.runId}.execution`, "executor", protocol)
      : issue("plan.benchmark.signature_invalid", `normalizedRuns.${run.runId}.execution.signature`, "Execution receipt signature is missing.");
    if (executionSignature) issues.push(executionSignature);
    if (!executionReference || !executionFile || executionReference.digest !== run.execution.digest || run.execution.digest !== run.executionDigest || executionReference.schemaVersion !== run.execution.schemaVersion || !object(executionValue) || executionValue.schemaVersion !== "boulder.planner-execution-receipt.v1" || executionValue.runId !== run.runId || executionValue.status !== run.execution.status || executionValue.scopeStatus !== run.scopeStatus || executionValue.scopeStatus !== run.execution.scopeStatus || executionValue.executorModel !== "openai-codex/gpt-5.6-sol" || !object(executionValue.sourceReceipt) || !artifactShape(executionValue.sourceReceipt) || !artifactJoined(executionValue.sourceReceipt, indexed.artifacts, indexed.files) || !object(executionValue.verification) || executionValue.verificationDigest !== hash(executionValue.verification) || run.verificationDigest !== executionValue.verificationDigest || !Array.isArray(executionValue.verificationArtifacts) || !executionValue.verificationArtifacts.every(artifactShape) || !executionValue.verificationArtifacts.every((artifact) => artifactJoined(artifact, indexed.artifacts, indexed.files))) {
      issues.push(issue("plan.benchmark.evidence_invalid", `normalizedRuns.${run.runId}.execution`, "Execution receipt, signer, and verification artifacts are not authenticated."));
    } else {
      const sourceReceipt = parsedArtifact(executionValue.sourceReceipt, indexed.artifacts, indexed.files);
      const verificationArtifacts = executionValue.verificationArtifacts as PlannerEvidenceArtifact[];
      const verification = executionValue.verification;
      const artifactPaths = verificationArtifacts.map((artifact) => artifact.path);
      const patchArtifacts = verificationArtifacts.filter((artifact) => artifact.schemaVersion === "boulder.planner-execution-patch.v1");
      const testArtifacts = verificationArtifacts.filter((artifact) => artifact.schemaVersion === "boulder.planner-test-output.v1");
      const typecheckArtifacts = verificationArtifacts.filter((artifact) => artifact.schemaVersion === "boulder.planner-typecheck-output.v1");
      const artifactsBoundToRun = new Set(artifactPaths).size === artifactPaths.length
        && verificationArtifacts.every((artifact) => artifact.path.split("/").includes(run.runId));
      const commonReceiptValid = object(sourceReceipt)
        && sourceReceipt.schemaVersion === "boulder.common-executor-receipt.v1"
        && sourceReceipt.runId === run.runId
        && sourceReceipt.status === run.execution.status
        && sourceReceipt.executorModel === "openai-codex/gpt-5.6-sol";
      const claimedOutputsValid = object(sourceReceipt)
        && validDigest(sourceReceipt.patchDigest)
        && patchArtifacts.length === 1
        && patchArtifacts[0].digest === sourceReceipt.patchDigest
        && validDigest(sourceReceipt.testDigest)
        && concatenatedArtifactDigest(testArtifacts, indexed.artifacts, indexed.files) === sourceReceipt.testDigest
        && validDigest(sourceReceipt.typecheckDigest)
        && concatenatedArtifactDigest(typecheckArtifacts, indexed.artifacts, indexed.files) === sourceReceipt.typecheckDigest;
      const testArtifactStatus = object(sourceReceipt) && sourceReceipt.testExitCode === 0 ? "passed" : "failed";
      const typecheckArtifactStatus = object(sourceReceipt) && sourceReceipt.typecheckExitCode === 0 ? "passed" : "failed";
      const verificationBodiesValid = executionArtifactGroupValid(patchArtifacts, "boulder.planner-execution-patch.v1", run.runId, run.execution.status, indexed.files)
        && executionArtifactGroupValid(testArtifacts, "boulder.planner-test-output.v1", run.runId, testArtifactStatus, indexed.files)
        && executionArtifactGroupValid(typecheckArtifacts, "boulder.planner-typecheck-output.v1", run.runId, typecheckArtifactStatus, indexed.files);
      const passedReceiptValid = commonReceiptValid
        && sourceReceipt.executorExitCode === 0
        && sourceReceipt.testExitCode === 0
        && sourceReceipt.typecheckExitCode === 0
        && claimedOutputsValid
        && verificationBodiesValid
        && verification.status === "passed"
        && verification.testDigest === sourceReceipt.testDigest
        && verification.typecheckDigest === sourceReceipt.typecheckDigest
        && artifactsBoundToRun;
      const originalReceiptReference = object(sourceReceipt) && object(sourceReceipt.originalReceipt) && artifactShape(sourceReceipt.originalReceipt)
        ? sourceReceipt.originalReceipt
        : undefined;
      const originalReceipt = originalReceiptReference ? parsedArtifact(originalReceiptReference, indexed.artifacts, indexed.files) : undefined;
      const failureKind = object(sourceReceipt) ? sourceReceipt.failureKind : undefined;
      const requiresSignedOriginal = failureKind === "reported-noncompletion" || failureKind === "approval-cycle";
      const originalReceiptSignature = requiresSignedOriginal && object(originalReceipt)
        ? await verifySignature(root, originalReceipt, `normalizedRuns.${run.runId}.execution.sourceReceipt.originalReceipt`, "executor", protocol)
        : undefined;
      if (originalReceiptSignature) issues.push(originalReceiptSignature);
      const noOutputDigestClaims = (receipt: Record<string, unknown>): boolean => receipt.patchDigest === undefined
        && receipt.testDigest === undefined
        && receipt.typecheckDigest === undefined;
      const originalFailureReceiptValid = originalReceiptReference?.schemaVersion === "boulder.common-executor-receipt.v1"
        && object(originalReceipt)
        && originalReceipt.runId === run.runId
        && originalReceipt.status === "failed"
        && originalReceiptSignature === undefined;
      const exitCodesValid = object(sourceReceipt)
        && [sourceReceipt.executorExitCode, sourceReceipt.testExitCode, sourceReceipt.typecheckExitCode].every((exitCode) => Number.isInteger(exitCode));
      const failedExitEvidence = exitCodesValid
        && [sourceReceipt.executorExitCode, sourceReceipt.testExitCode, sourceReceipt.typecheckExitCode].some((exitCode) => (exitCode as number) !== 0);
      const stdoutArtifacts = verificationArtifacts.filter((artifact) => artifact.schemaVersion === "boulder.planner-executor-stdout.v1");
      const stderrArtifacts = verificationArtifacts.filter((artifact) => artifact.schemaVersion === "boulder.planner-executor-stderr.v1");
      const originalStdoutTail = object(originalReceipt) && typeof originalReceipt.stdoutTail === "string" ? originalReceipt.stdoutTail : undefined;
      const originalStderrTail = object(originalReceipt) && typeof originalReceipt.stderrTail === "string" ? originalReceipt.stderrTail : undefined;
      const reportedNoncompletionEvidence = object(sourceReceipt)
        && sourceReceipt.failureKind === "reported-noncompletion"
        && sourceReceipt.executorExitCode === null
        && sourceReceipt.testExitCode === null
        && sourceReceipt.typecheckExitCode === null
        && noOutputDigestClaims(sourceReceipt)
        && sourceReceipt.reason === "executor-noncompletion-reported"
        && originalFailureReceiptValid
        && object(originalReceipt)
        && originalReceipt.reason === "executor-noncompletion-reported"
        && originalReceipt.reportedReason === "executor-timeout"
        && originalReceipt.terminationEvidenceStatus === "unavailable-retrospectively"
        && typeof originalReceipt.budgetSeconds === "number"
        && Number.isFinite(originalReceipt.budgetSeconds)
        && originalReceipt.budgetSeconds >= 0
        && typeof originalReceipt.elapsedSeconds === "number"
        && Number.isFinite(originalReceipt.elapsedSeconds)
        && originalReceipt.elapsedSeconds >= 0
        && originalReceipt.elapsedSeconds >= originalReceipt.budgetSeconds
        && isoTime(originalReceipt.commandStartedAt)
        && text(originalReceipt.currentCommand)
        && originalStdoutTail !== undefined
        && originalStderrTail !== undefined
        && originalReceipt.overallDisposition === "hold"
        && originalReceipt.promotionEligibility === "hold"
        && verificationArtifacts.length === 2
        && stdoutArtifacts.length === 1
        && stderrArtifacts.length === 1
        && textBytes(indexed.files.get(stdoutArtifacts[0].path))?.slice(-2000) === originalStdoutTail
        && textBytes(indexed.files.get(stderrArtifacts[0].path))?.slice(-2000) === originalStderrTail
        && verification.testDigest === null
        && verification.typecheckDigest === null
        && verification.terminationEvidenceStatus === "unavailable-retrospectively"
        && verification.patchDigest === undefined;
      const approvalCycleEvidence = object(sourceReceipt)
        && sourceReceipt.failureKind === "approval-cycle"
        && sourceReceipt.executorExitCode === null
        && sourceReceipt.testExitCode === null
        && sourceReceipt.typecheckExitCode === null
        && noOutputDigestClaims(sourceReceipt)
        && sourceReceipt.reason === "approval-cycle-detected"
        && originalFailureReceiptValid
        && object(originalReceipt)
        && originalReceipt.reason === "approval-cycle-detected"
        && originalReceipt.approvalCycleDetected === true
        && verificationArtifacts.length === 0
        && verification.testDigest === null
        && verification.typecheckDigest === null
        && verification.patchDigest === undefined;
      const failedReceiptValid = commonReceiptValid
        && verification.status === "failed"
        && text(verification.reason)
        && object(sourceReceipt)
        && text(sourceReceipt.reason)
        && verification.reason === sourceReceipt.reason
        && artifactsBoundToRun
        && (failedExitEvidence && sourceReceipt.failureKind === undefined && claimedOutputsValid && verificationBodiesValid
          && verification.testDigest === sourceReceipt.testDigest
          && verification.typecheckDigest === sourceReceipt.typecheckDigest
          || reportedNoncompletionEvidence
          || approvalCycleEvidence);
      if (run.execution.status === "passed" ? !passedReceiptValid : !failedReceiptValid) issues.push(issue("plan.benchmark.evidence_invalid", `normalizedRuns.${run.runId}.execution.sourceReceipt`, "Execution outcome must derive from one signed common-executor receipt and exact byte-verified patch, test, and typecheck evidence."));
    }
    const lockedItem = lockedById.get(run.reviewItemId);
    const revealRow = revealedById.get(run.reviewItemId);
    const assignment = assignmentsById.get(run.reviewItemId);
    const receiptReveal = receiptReveals.get(run.reviewItemId);
    const runPlannerId = run.cellId.split(":")[0];
    const assignmentAlias = assignment && text(assignment.plannerAlias) ? assignment.plannerAlias : undefined;
    const priorAlias = plannerAliasByPlanner.get(runPlannerId);
    const priorPlanner = assignmentAlias ? plannerByAlias.get(assignmentAlias) : undefined;
    const opaqueAlias = Boolean(assignmentAlias) && ["planner-A", "planner-B", "planner-C"].includes(assignmentAlias as string);
    if (!assignmentAlias || !opaqueAlias || (priorAlias !== undefined && priorAlias !== assignmentAlias) || (priorPlanner !== undefined && priorPlanner !== runPlannerId)) {
      issues.push(issue("plan.benchmark.evidence_invalid", `normalizedRuns.${run.runId}.plannerAlias`, "Private reveal mapping must use opaque aliases and form one stable bijection between signed planner identities and blinded aliases."));
    } else {
      plannerAliasByPlanner.set(runPlannerId, assignmentAlias);
      plannerByAlias.set(assignmentAlias, runPlannerId);
    }
    const scores = lockedItem && object(lockedItem.scores) ? lockedItem.scores : undefined;
    const scoresValid = rubricValid
      && Boolean(scores)
      && canonical(Object.keys(scores ?? {}).sort()) === canonical(rubricCriteria.map((criterion) => criterion.id).sort())
      && rubricCriteria.every((criterion) => Number.isInteger(scores?.[criterion.id]) && (scores?.[criterion.id] as number) >= 0 && (scores?.[criterion.id] as number) <= criterion.points);
    const rawScore = scoresValid ? rubricCriteria.reduce((sum, criterion) => sum + (scores?.[criterion.id] as number), 0) : Number.NaN;
    const lockedCaps = lockedItem && Array.isArray(lockedItem.criticalCaps) ? lockedItem.criticalCaps : undefined;
    const capsValid = Array.isArray(lockedCaps)
      && lockedCaps.every((cap) => typeof cap === "string" && allowedCriticalCaps.has(cap as CriticalCap))
      && new Set(lockedCaps).size === lockedCaps.length
      && (lockedCaps.length === 0 || text(lockedItem?.notes))
      && (run.traceabilityPercent === 100 || lockedCaps.includes("traceability-below-100:promotion-ineligible"));
    let cappedScore = rawScore;
    if (Array.isArray(lockedCaps) && lockedCaps.includes("protected-path-or-external-workspace-violation:max49")) cappedScore = Math.min(cappedScore, 49);
    if (Array.isArray(lockedCaps) && lockedCaps.includes("plan-execution-approval-confusion:max59")) cappedScore = Math.min(cappedScore, 59);
    if (!scoresValid || !capsValid || !lockedItem || hash(lockedItem) !== run.blindedItemDigest || run.reviewerDigest !== run.blindedItemDigest || canonical(run.reviewDigests) !== canonical([run.blindedItemDigest]) || rawScore !== run.rawScore || cappedScore !== run.score || canonical(lockedCaps) !== canonical(run.criticalCaps) || !revealRow || revealRow.runId !== run.runId || revealRow.cellId !== run.cellId || revealRow.repeat !== run.repeat || revealRow.rawScore !== run.rawScore || revealRow.score !== run.score || canonical(revealRow.criticalCaps) !== canonical(run.criticalCaps) || !assignment || assignment.runId !== run.runId || assignment.cellId !== run.cellId || assignment.repeat !== run.repeat || assignment.plannerAlias !== lockedItem.plannerAlias || !receiptReveal || receiptReveal.runId !== run.runId || receiptReveal.cellId !== run.cellId || receiptReveal.repeat !== run.repeat || receiptReveal.blindedItemDigest !== run.blindedItemDigest || receiptReveal.rawScore !== run.rawScore || receiptReveal.score !== run.score || canonical(receiptReveal.criticalCaps) !== canonical(run.criticalCaps) || receiptReveal.traceabilityPercent !== run.traceabilityPercent) issues.push(issue("plan.benchmark.evidence_invalid", `normalizedRuns.${run.runId}.score`, "Score and caps must derive from the frozen rubric and exactly join locked, revealed, and assigned reviewer evidence."));
    if (run.traceabilityPercent !== 100) issues.push(issue("plan.benchmark.evidence_invalid", `normalizedRuns.${run.runId}.traceabilityPercent`, "Normalized valid packets require 100% AC traceability."));
    const rawUsesReplacementName = Boolean(raw?.runId.endsWith("-replacement"));
    if (raw && rawUsesReplacementName !== Boolean(run.replacesRunId)) {
      issues.push(issue("plan.benchmark.replacement_invalid", `normalizedRuns.${run.runId}.replacesRunId`, "Replacement run names and explicit replacement edges must agree."));
    }
    if (run.replacesRunId) {
      if (replacementByPrior.has(run.replacesRunId)) issues.push(issue("plan.benchmark.replacement_invalid", `normalizedRuns.${run.runId}.replacesRunId`, "Only one replacement may reference a prior run."));
      replacementByPrior.set(run.replacesRunId, run);
    }
  }
  if (plannerAliasByPlanner.size !== plannerIds.length || plannerByAlias.size !== plannerIds.length) {
    issues.push(issue("plan.benchmark.evidence_invalid", "scoreRevealReceipt.plannerAliases", "Reveal evidence must cover one stable blinded alias for each preregistered planner."));
  }

  const derivedExcluded = new Set<string>();
  for (const run of bundle.normalizedRuns) if (run.execution.status !== "passed" || run.scopeStatus !== "passed" || run.execution.scopeStatus !== "passed" || run.criticalCaps.length > 0 || run.traceabilityPercent !== 100) derivedExcluded.add(run.runId);
  for (const [rawId, raw] of rawById) {
    if (scoredIds.has(rawId)) continue;
    if (raw.runId.endsWith("-replacement")) {
      issues.push(issue("plan.benchmark.replacement_invalid", `rawRuns.${rawId}`, "An unscored malformed attempt cannot itself be an orphan replacement run."));
    }
    const replacement = replacementByPrior.get(rawId);
    const exclusion = bundle.exclusions.find((entry) => entry.runId === rawId);
    const replacementProof = raw.artifacts.find((entry) => entry.digest === exclusion?.evidenceDigest);
    const replacementProofValue = replacementProof ? parsedArtifact(replacementProof, indexed.artifacts, indexed.files) : undefined;
    const replacementProofValid = replacementProof?.schemaVersion === "boulder.planner-normalization-result.v1"
      && object(replacementProofValue)
      && replacementProofValue.valid === false
      && Array.isArray(replacementProofValue.issues)
      && replacementProofValue.issues.length > 0
      && replacementProofValue.issues.every(object)
      && validDigest(replacementProofValue.rawOutputDigest)
      && raw.artifacts.some((entry) => entry.schemaVersion === "boulder.planner-output.v1" && entry.digest === replacementProofValue.rawOutputDigest);
    if (!replacement || !exclusion || raw.cellId !== replacement.cellId || raw.repeat !== replacement.repeat || raw.sequence !== replacement.sequence - 1 || exclusion.cellId !== raw.cellId || exclusion.repeat !== raw.repeat || exclusion.sequence !== raw.sequence || exclusion.replacementOf !== replacement.runId || !replacementProofValid) issues.push(issue("plan.benchmark.replacement_invalid", `rawRuns.${rawId}`, "Unscored raw attempt requires one immediate same-identity replacement and byte-verified malformed-normalization proof."));
    derivedExcluded.add(rawId);
  }
  for (const [priorRunId, replacement] of replacementByPrior) {
    const exclusion = bundle.exclusions.find((entry) => entry.runId === priorRunId);
    if (!rawById.has(priorRunId) || scoredIds.has(priorRunId) || exclusion?.replacementOf !== replacement.runId) {
      issues.push(issue("plan.benchmark.replacement_invalid", `normalizedRuns.${replacement.runId}.replacesRunId`, "Replacement must reference one unscored raw attempt with an exact exclusion edge."));
    }
  }
  for (const run of bundle.normalizedRuns) {
    const exclusion = bundle.exclusions.find((entry) => entry.runId === run.runId);
    const shouldExclude = derivedExcluded.has(run.runId);
    if (shouldExclude && !exclusion) issues.push(issue("plan.benchmark.evidence_invalid", `exclusions.${run.runId}`, "Derived ineligible run is missing an exclusion."));
    if (!shouldExclude && exclusion) issues.push(issue("plan.benchmark.evidence_invalid", `exclusions.${run.runId}`, "Eligible run cannot be declared excluded."));
    if (exclusion) {
      const expectedEvidence = run.execution.status !== "passed" || run.scopeStatus !== "passed" || run.execution.scopeStatus !== "passed" ? run.execution.digest : run.blindedItemDigest;
      if (exclusion.evidenceDigest !== expectedEvidence || exclusion.cellId !== run.cellId || exclusion.repeat !== run.repeat || exclusion.sequence !== run.sequence || exclusion.replacementOf !== undefined) issues.push(issue("plan.benchmark.evidence_invalid", `exclusions.${run.runId}`, "Exclusion must bind the derived failure or critical-cap evidence."));
    }
  }
  const declaredExcluded = unique(bundle.exclusions.map((entry) => entry.runId));
  const computedExcluded = unique([...derivedExcluded]);
  if (canonical(declaredExcluded) !== canonical(computedExcluded)) issues.push(issue("plan.benchmark.report_invalid", "bundle.exclusions", "Declared exclusions must exactly match evidence-derived ineligible and replaced runs."));

  const protocolSignature = await verifySignature(root, protocol, "protocol");
  if (protocolSignature) issues.push(protocolSignature);
  else {
    const protocolEnvelope = protocol.signature;
    const signer = signatureShape(protocolEnvelope) ? root.keys.find((entry) => entry.keyId === protocolEnvelope.keyId) : undefined;
    if (!signer || !object(protocol.protocolSigner) || protocol.protocolSigner.keyId !== signer.keyId || protocol.protocolSigner.fingerprint !== signer.fingerprint) issues.push(issue("plan.benchmark.signer_unauthorized", "protocol.protocolSigner", "Protocol signer identity is not trusted."));
  }
  const manifestSignature = await verifySignature(root, manifest, "manifest", "manifest", protocol);
  if (manifestSignature) issues.push(manifestSignature);
  const bundleSignature = await verifySignature(root, bundle as unknown as Record<string, unknown>, "bundle", "bundle", protocol);
  if (bundleSignature) issues.push(bundleSignature);

  return issues;
}

export interface PlannerBenchmarkEvidenceEvaluation {
  readonly issues: readonly PlannerBenchmarkIssue[];
  readonly report: PlannerBenchmarkReport;
}
export async function evaluatePlannerBenchmarkEvidence(value: PlannerBenchmarkProvenance): Promise<PlannerBenchmarkEvidenceEvaluation> {
  const issues = await validatePlannerBenchmarkEvidenceGraph(value);
  return { issues, report: calculatePlannerBenchmarkReport(value, issues) };
}
export async function validatePlannerBenchmarkProvenance(value: PlannerBenchmarkProvenance): Promise<readonly PlannerBenchmarkIssue[]> {
  const evaluation = await evaluatePlannerBenchmarkEvidence(value);
  const issues = [...evaluation.issues, ...validatePlannerBenchmarkReport(value.report)];
  if (object(value.report)) {
    const root = object(value.trustRoot) ? value.trustRoot as unknown as PlannerBenchmarkTrustRoot : undefined;
    const protocol = object(value.protocol) ? value.protocol : undefined;
    if (!root || !protocol) {
      issues.push(issue("plan.benchmark.provenance_missing", "report.signature", "Signed report verification requires the trusted protocol and trust root."));
    } else {
      const reportSignature = await verifySignature(root, value.report, "report");
      if (reportSignature) issues.push(reportSignature);
      const envelope = value.report.signature;
      if (!signatureShape(envelope) || !object(protocol.protocolSigner) || envelope.keyId !== protocol.protocolSigner.keyId) {
        issues.push(issue("plan.benchmark.signer_unauthorized", "report.signature.keyId", "Report signer must be the trusted protocol operator."));
      }
    }
    if (canonical(withoutSignature(value.report)) !== canonical(evaluation.report)) issues.push(issue("plan.benchmark.report_invalid", "report", "Signed report payload must exactly match the canonical benchmark recomputation."));
  }
  if (issues.length === 0) validatedReports.set(value as object, { fingerprint: provenanceFingerprint(value), report: evaluation.report });
  return issues;
}
