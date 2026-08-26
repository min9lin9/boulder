import { constants as fsConstants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import * as k0rCanonical from "./k0r-canonical.js";

const repositoryRoot = resolve(import.meta.dir, "..");
const exitReceiptPath = "evidence/k0r/k0r-exit-receipt.json";
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const gitOidPattern = /^[0-9a-f]+$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const maxJsonBytes = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const noFollowFlag = requiredPlatformFlag(fsConstants.O_NOFOLLOW, "O_NOFOLLOW");
const directoryFlagValue = requiredPlatformFlag((fsConstants as unknown as Readonly<Record<string, number | undefined>>)["O_DIRECTORY"], "O_DIRECTORY");

const prohibitedAuthorities = ["K2", "K3", "K4", "commit", "push", "publish", "release", "root_guidance"] as const;
const approvedScope = "K0R reconciliation and guide/package re-attestation only";
export const trackedOverlayPaths = [
  "docs/boulder-guide.ko.html",
  "evidence/AGENTS.md",
  "fixtures/docs/doc-registry.v0.json",
  "fixtures/package-inventory/packaged-files.v0.json",
  "test/boulder-guide-contract.test.ts",
  "test/fixtures/baselines/readiness-v0/pack-dry-run.txt",
  "test/helpers/boulder-guide.ts",
  "test/k0r-baseline-generator.test.ts",
  "test/k0r-baseline-generator.ts",
  "test/k0r-canonical.ts",
  "test/k0r-capture-evidence.ts",
  "test/k0r-evidence-contract.test.ts",
  "test/k0r-independent-oracle.test.ts",
  "test/k0r-independent-oracle.ts",
  "test/k0r-issue-exit.ts",
  "test/k0r-reconcile-evidence.ts",
  "test/k0r-run-evidence.ts",
  "test/package-inventory-contract.test.ts"
] as const;
const k0rEvidenceOutputPaths = [
  "evidence/k0r/acceptance-manifest.json",
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

export function assertExactK0rEvidenceOutputPaths(value: readonly string[]): void {
  if (
    value.length !== k0rEvidenceOutputPaths.length
    || value.some((path, index) => path !== k0rEvidenceOutputPaths[index])
  ) {
    throw new Error("Scope authorization must contain the exact ten evidence outputs.");
  }
}
const reconciledEvidencePaths = [
  "evidence/k0r/acceptance-manifest.json",
  "evidence/k0r/baseline-transition.json",
  "evidence/k0r/independent-clean-source-reproduction.json",
  "evidence/k0r/isolation-manifest.json",
  "evidence/k0r/superseding-adr.md",
  "evidence/k0r/v1-public-contract-inventory.json"
] as const;
const invalidationConditions = [
  "any reviewed input byte changes",
  "the protected pending transition changes",
  "the tracked freeze or current Git identity changes",
  "any approval, review, attestation, or provenance binding changes",
  "any unresolved finding is introduced"
] as const;

type JsonRecord = Record<string, unknown>;
type ReviewedInput = { readonly path: string; readonly sha256: string };
type FileValue = { readonly path: string; readonly bytes: Uint8Array; readonly sha256: string; readonly value: JsonRecord };
type ProvenanceIdentity = { readonly key: string; readonly timestamp: string };
type GitIdentity = { readonly objectFormat: "sha1" | "sha256"; readonly headCommit: string; readonly headTree: string };

export type K0rIssueExitCommand =
  | { readonly mode: "write"; readonly values: Readonly<Record<WriteOption, string>> }
  | { readonly mode: "verify"; readonly receipt: string; readonly privateRoot: string; readonly implementerProvenance: string; readonly reviewedInputsManifest: string }
  | { readonly mode: "verify-pending"; readonly pendingTransition: string; readonly privateRoot: string }
  | { readonly mode: "finalize-transition"; readonly pendingTransition: string; readonly exitReceipt: string; readonly replacementBaseline: string; readonly output: string }
  | { readonly mode: "verify-transition"; readonly transition: string };

const writeOptions = [
  "--scope-authorization", "--scope-provenance", "--implementer-provenance",
  "--architect-review", "--architect-provenance", "--critic-review", "--critic-provenance",
  "--reviewed-inputs-manifest", "--maintainer-request", "--maintainer-approval", "--maintainer-provenance",
  "--architect-attestation", "--architect-attestation-provenance",
  "--critic-attestation", "--critic-attestation-provenance", "--pending-transition"
] as const;
type WriteOption = typeof writeOptions[number];
const canonicalWriteRolePaths: Readonly<Record<WriteOption, string>> = {
  "--scope-authorization": "authorizations/k0r-a.json",
  "--scope-provenance": "authorizations/k0r-a.provenance.json",
  "--implementer-provenance": "identities/implementer.provenance.json",
  "--architect-review": "reviews/k0r-architect.json",
  "--architect-provenance": "reviews/k0r-architect.provenance.json",
  "--critic-review": "reviews/k0r-critic.json",
  "--critic-provenance": "reviews/k0r-critic.provenance.json",
  "--reviewed-inputs-manifest": "reviews/k0r-reviewed-inputs.json",
  "--maintainer-request": "reviews/k0r-maintainer-request.json",
  "--maintainer-approval": "reviews/k0r-maintainer.json",
  "--maintainer-provenance": "reviews/k0r-maintainer.provenance.json",
  "--architect-attestation": "reviews/k0r-architect-approval.json",
  "--architect-attestation-provenance": "reviews/k0r-architect-approval.provenance.json",
  "--critic-attestation": "reviews/k0r-critic-approval.json",
  "--critic-attestation-provenance": "reviews/k0r-critic-approval.provenance.json",
  "--pending-transition": "protected/k0r-transition.pending.json",
};

export function parseK0rIssueExitArgv(argv: readonly string[]): K0rIssueExitCommand {
  if (argv[0] === "--write") {
    const expectedLength = 1 + writeOptions.length * 2;
    if (argv.length !== expectedLength) throw new Error("--write requires the exact ordered option/value array.");
    const values: Partial<Record<WriteOption, string>> = {};
    for (let index = 0; index < writeOptions.length; index += 1) {
      const option = writeOptions[index];
      const actual = argv[1 + index * 2];
      const value = argv[2 + index * 2];
      if (option === undefined || actual !== option || value === undefined || value === "" || value.startsWith("--")) throw new Error("--write arguments are missing, empty, duplicated, or out of order.");
      values[option] = value;
    }
    return { mode: "write", values: values as Record<WriteOption, string> };
  }
  if (argv[0] === "--verify" && argv.length === 8 && argv[2] === "--private-root" && argv[4] === "--implementer-provenance" && argv[6] === "--reviewed-inputs-manifest") {
    return { mode: "verify", receipt: requiredArg(argv[1]), privateRoot: requiredArg(argv[3]), implementerProvenance: requiredArg(argv[5]), reviewedInputsManifest: requiredArg(argv[7]) };
  }
  if (argv[0] === "--verify-pending" && argv.length === 4 && argv[2] === "--private-root") {
    return { mode: "verify-pending", pendingTransition: requiredArg(argv[1]), privateRoot: requiredArg(argv[3]) };
  }
  if (argv[0] === "--finalize-transition" && argv.length === 8 && argv[2] === "--exit-receipt" && argv[4] === "--replacement-baseline" && argv[6] === "--output") {
    return { mode: "finalize-transition", pendingTransition: requiredArg(argv[1]), exitReceipt: requiredArg(argv[3]), replacementBaseline: requiredArg(argv[5]), output: requiredArg(argv[7]) };
  }
  if (argv[0] === "--verify-transition" && argv.length === 2) return { mode: "verify-transition", transition: requiredArg(argv[1]) };
  throw new Error("Usage: --write <exact options> | --verify <receipt> --private-root <root> --implementer-provenance <path> --reviewed-inputs-manifest <path> | --verify-pending <transition> --private-root <root> | --finalize-transition <pending> --exit-receipt <receipt> --replacement-baseline <baseline> --output <final> | --verify-transition <final>.");
}

function requiredPlatformFlag(value: number | undefined, name: string): number { if (value === undefined) throw new Error(`This K0R tool requires ${name} support.`); return value; }

function requiredArg(value: string | undefined): string {
  if (value === undefined || value === "" || value.startsWith("--")) throw new Error("A required CLI value is missing.");
  return value;
}

export function validateCanonicalUtcTimestamp(value: unknown, label = "timestamp"): string {
  const timestamp = stringValue(value, label);
  if (encoder.encode(timestamp).length !== 24 || !timestampPattern.test(timestamp) || new Date(timestamp).toISOString() !== timestamp) throw new Error(`${label} is not a canonical host UTC timestamp.`);
  return timestamp;
}

export function validatePendingTransition(value: unknown): JsonRecord {
  const transition = recordValue(value, "pending transition");
  exactKeys(transition, ["baselineTransition", "bindingOwnerSnapshot", "bindingPreScan", "bindingReconciliation", "evidenceMaterialization", "generator", "ownerMutations", "prior", "schemaVersion", "scopeAuthorization", "status", "trackedFreezeSha256", "typescriptBinding"], "pending transition");
  if (transition["schemaVersion"] !== "boulder.k0r.protected-transition.pending.v1" || transition["status"] !== "pending_exit") throw new Error("Pending transition identity is invalid.");
  validateDigest(transition["trackedFreezeSha256"], "pending tracked freeze digest");
  const scope = recordValue(transition["scopeAuthorization"], "pending scope authorization");
  exactKeys(scope, ["payloadJcsSha256", "payloadRawSha256", "provenanceSha256"], "pending scope authorization");
  for (const key of Object.keys(scope)) validateDigest(scope[key], `pending scope ${key}`);
  const prior = recordValue(transition["prior"], "pending prior state");
  exactKeys(prior, ["approvalProvenanceSha256", "baselineSha256", "exitStateSha256", "snapshotInventorySha256"], "pending prior state");
  for (const key of Object.keys(prior)) validateDigest(prior[key], `pending prior ${key}`);
  validatePathDigestStatus(recordValue(transition["baselineTransition"], "pending baseline transition"), "captured_pending_exact_byte_review", "pending baseline transition");
  validateGenerator(recordValue(transition["generator"], "pending generator"));
  const mutations = recordArray(transition["ownerMutations"], "pending owner mutations");
  if (mutations.length !== reconciledEvidencePaths.length) throw new Error("Pending transition owner mutation count is invalid.");
  mutations.forEach((entry, index) => {
    const keys = entry["beforeSha256"] === undefined ? ["afterSha256", "ownerCommand", "path"] : ["afterSha256", "beforeSha256", "ownerCommand", "path"];
    exactKeys(entry, keys, "pending owner mutation");
    if (entry["path"] !== reconciledEvidencePaths[index] || stringValue(entry["ownerCommand"], "owner command") === "") throw new Error("Pending owner mutations are incomplete or out of order.");
    validateDigest(entry["afterSha256"], "owner mutation after digest");
    if (entry["beforeSha256"] !== undefined) validateDigest(entry["beforeSha256"], "owner mutation before digest");
  });
  validateTypedBinding(recordValue(transition["typescriptBinding"], "pending TypeScript binding"));
  validateReceiptBinding(recordValue(transition["bindingOwnerSnapshot"], "pending owner snapshot"), ["merkleSha256", "pathSetSha256"], "receipts/k0r-binding-snapshot.json");
  validateReceiptBinding(recordValue(transition["bindingPreScan"], "pending pre-scan"), ["bindingsSha256", "ownerSnapshotSha256"], "receipts/k0r-binding-scan.pre.json");
  validateReceiptBinding(recordValue(transition["evidenceMaterialization"], "pending materialization"), ["outputMerkleSha256", "outputPathSetSha256"], "receipts/k0r-materialization.json");
  validateReceiptBinding(recordValue(transition["bindingReconciliation"], "pending binding reconciliation"), ["bindingSchemaInventorySha256", "bindingsSha256", "materializationSha256", "preEditScanSha256", "sourceSchemaInventorySha256"], "receipts/k0r-binding-scan.json");
  return transition;
}

export function validateReviewedInputsManifest(value: unknown): readonly ReviewedInput[] {
  const manifest = recordValue(value, "reviewed-input manifest");
  exactKeys(manifest, ["inputPaths", "inputs", "inputsSha256", "schemaVersion", "status"], "reviewed-input manifest");
  if (manifest["schemaVersion"] !== "boulder.k0r.reviewed-inputs.v1" || manifest["status"] !== "frozen") throw new Error("Reviewed-input manifest identity is invalid.");
  const inputPaths = stringArray(manifest["inputPaths"], "reviewed input paths");
  const inputs = reviewedInputs(manifest["inputs"], "reviewed inputs");
  if (inputPaths.length === 0 || inputPaths.length !== inputs.length || inputPaths.some((path, index) => inputs[index]?.path !== path)) throw new Error("Reviewed-input paths and entries differ.");
  assertSortedUniqueInputs(inputs, "reviewed inputs");
  if (sha256Canonical(inputs) !== validateDigest(manifest["inputsSha256"], "reviewed inputs digest")) throw new Error("Reviewed-input aggregate digest is invalid.");
  return inputs;
}

type MaintainerApprovalExpected = {
  readonly reviewedInputs: readonly ReviewedInput[];
  readonly architectReviewSha256: string;
  readonly criticReviewSha256: string;
  readonly adrSha256: string;
  readonly evidenceManifestSha256: string;
  readonly baselineTransitionSha256: string;
};

function buildMaintainerApprovalPayload(expected: MaintainerApprovalExpected): JsonRecord {
  return {
    adrSha256: expected.adrSha256,
    architectReviewSha256: expected.architectReviewSha256,
    baselineTransitionSha256: expected.baselineTransitionSha256,
    criticReviewSha256: expected.criticReviewSha256,
    evidenceManifestSha256: expected.evidenceManifestSha256,
    exactBytesApproved: true,
    prohibitedAuthorities: [...prohibitedAuthorities],
    reviewedInputs: expected.reviewedInputs.map((input) => ({ ...input })),
    schemaVersion: "boulder.k0r.maintainer-approval-payload.v1",
    scope: approvedScope,
  };
}

export function buildMaintainerApprovalRequest(
  expected: MaintainerApprovalExpected,
  requestId = randomUUID(),
): JsonRecord {
  if (!uuidV4Pattern.test(requestId)) throw new Error("Maintainer request ID is not a canonical UUIDv4.");
  const requestPayload = buildMaintainerApprovalPayload(expected);
  const request: JsonRecord = {
    requestId,
    requestPayload,
    requestPayloadJcsSha256: sha256Canonical(requestPayload),
    schemaVersion: "boulder.k0r.maintainer-approval-request.v1",
    status: "awaiting_exact_approval",
  };
  return { ...request, receiptSha256: sha256Canonical(request) };
}

function validateMaintainerApprovalPayload(value: unknown, expected: MaintainerApprovalExpected): JsonRecord {
  const approval = recordValue(value, "maintainer approval request payload");
  exactKeys(approval, ["adrSha256", "architectReviewSha256", "baselineTransitionSha256", "criticReviewSha256", "evidenceManifestSha256", "exactBytesApproved", "prohibitedAuthorities", "reviewedInputs", "schemaVersion", "scope"], "maintainer approval request payload");
  if (approval["schemaVersion"] !== "boulder.k0r.maintainer-approval-payload.v1" || approval["scope"] !== approvedScope || approval["exactBytesApproved"] !== true) throw new Error("Maintainer request payload does not grant the exact K0R scope.");
  if (!equalStrings(stringArray(approval["prohibitedAuthorities"], "maintainer prohibited authorities"), prohibitedAuthorities)) throw new Error("Maintainer request payload changes prohibited authorities.");
  const approvedInputs = reviewedInputs(approval["reviewedInputs"], "maintainer request reviewed inputs");
  assertSortedUniqueInputs(approvedInputs, "maintainer reviewed inputs");
  if (!equalCanonical(approvedInputs, expected.reviewedInputs)) throw new Error("Maintainer request payload is not bound to the reviewed-input manifest.");
  const bindings: Readonly<Record<string, string>> = {
    architectReviewSha256: expected.architectReviewSha256,
    criticReviewSha256: expected.criticReviewSha256,
    adrSha256: expected.adrSha256,
    evidenceManifestSha256: expected.evidenceManifestSha256,
    baselineTransitionSha256: expected.baselineTransitionSha256
  };
  for (const [key, expectedDigest] of Object.entries(bindings)) if (validateDigest(approval[key], `maintainer request ${key}`) !== expectedDigest) throw new Error(`Maintainer request payload ${key} is stale.`);
  return approval;
}

export function validateMaintainerApproval(
  value: unknown,
  requestValue: unknown,
  expected: MaintainerApprovalExpected,
): JsonRecord {
  const request = recordValue(requestValue, "maintainer approval request");
  exactKeys(request, ["receiptSha256", "requestId", "requestPayload", "requestPayloadJcsSha256", "schemaVersion", "status"], "maintainer approval request");
  if (request["schemaVersion"] !== "boulder.k0r.maintainer-approval-request.v1" || request["status"] !== "awaiting_exact_approval") throw new Error("Maintainer approval request identity is invalid.");
  if (!uuidV4Pattern.test(stringValue(request["requestId"], "maintainer request ID"))) throw new Error("Maintainer request ID is not a canonical UUIDv4.");
  const requestPayload = validateMaintainerApprovalPayload(request["requestPayload"], expected);
  const requestPayloadJcsSha256 = sha256Canonical(requestPayload);
  if (validateDigest(request["requestPayloadJcsSha256"], "maintainer request payload digest") !== requestPayloadJcsSha256) throw new Error("Maintainer request payload digest is stale.");
  const requestProjection: JsonRecord = { ...request };
  delete requestProjection["receiptSha256"];
  const requestReceiptSha256 = sha256Canonical(requestProjection);
  if (validateDigest(request["receiptSha256"], "maintainer request receipt digest") !== requestReceiptSha256) throw new Error("Maintainer request receipt digest is invalid.");

  const response = recordValue(value, "maintainer approval response");
  exactKeys(response, ["decision", "requestPayloadJcsSha256", "requestReceiptSha256", "schemaVersion"], "maintainer approval response");
  if (response["schemaVersion"] !== "boulder.k0r.maintainer-approval-response.v1" || response["decision"] !== "approve_exact_frozen_scope") throw new Error("Maintainer approval response does not approve the exact frozen scope.");
  if (validateDigest(response["requestPayloadJcsSha256"], "maintainer response payload digest") !== requestPayloadJcsSha256) throw new Error("Maintainer approval response payload binding is stale.");
  if (validateDigest(response["requestReceiptSha256"], "maintainer response receipt digest") !== requestReceiptSha256) throw new Error("Maintainer approval response request binding is stale.");
  return response;
}

export function validateExactByteReview(value: unknown, role: "architect" | "critic", expectedInputs: readonly ReviewedInput[], implementerSha256: string, priorExitStateSha256: string, baselineTransitionSha256: string): JsonRecord {
  const review = recordValue(value, `${role} review`);
  exactKeys(review, ["baselineTransitionSha256", "findings", "implementerProvenanceSha256", "inputs", "priorExitStateSha256", "reviewerIdentity", "role", "schemaVersion", "verdict"], `${role} review`);
  if (review["schemaVersion"] !== "boulder.k0r.exact-byte-review.v1" || review["role"] !== role || review["verdict"] !== "confirmed" || recordArray(review["findings"], `${role} findings`).length !== 0) throw new Error(`${role} review is not an exact confirmed review.`);
  if (stringValue(review["reviewerIdentity"], `${role} reviewer identity`) === "") throw new Error(`${role} reviewer identity is empty.`);
  if (validateDigest(review["implementerProvenanceSha256"], `${role} implementer digest`) !== implementerSha256 || validateDigest(review["priorExitStateSha256"], `${role} prior exit digest`) !== priorExitStateSha256 || validateDigest(review["baselineTransitionSha256"], `${role} baseline digest`) !== baselineTransitionSha256) throw new Error(`${role} review authority bindings are stale.`);
  const inputs = reviewedInputs(review["inputs"], `${role} inputs`);
  if (!equalCanonical(inputs, expectedInputs)) throw new Error(`${role} review inputs differ from the frozen manifest.`);
  return review;
}

function validateAuthorityProvenanceShape(value: unknown, kind: "implementer" | "task" | "user"): ProvenanceIdentity {
  const provenance = recordValue(value, `${kind} provenance`);
  if (kind === "implementer") {
    exactKeys(provenance, ["captureEventId", "captureTimestamp", "hostEventContentSha256", "hostRecordSha256", "model", "planSha256", "role", "schemaVersion", "sessionId"], "implementer provenance");
    if (provenance["schemaVersion"] !== "boulder.senpi.lead-session-provenance.v1" || provenance["role"] !== "assistant") throw new Error("Implementer provenance is invalid.");
    const sessionId = nonEmpty(provenance["sessionId"], "implementer session");
    const eventId = nonEmpty(provenance["captureEventId"], "implementer event");
    return { key: `lead-session:${sessionId}:${eventId}`, timestamp: validateCanonicalUtcTimestamp(provenance["captureTimestamp"], "implementer capture timestamp") };
  }
  if (kind === "task") {
    exactKeys(provenance, ["completionEvent", "completionEventId", "completionTimestamp", "hostRecordSha256", "model", "parentSessionId", "resultSha256", "reviewerIdentity", "schemaVersion", "taskId", "taskRecord"], "task provenance");
    if (provenance["schemaVersion"] !== "boulder.senpi.task-provenance.v1") throw new Error("Task provenance schema is invalid.");
    const taskId = nonEmpty(provenance["taskId"], "task ID");
    const eventId = nonEmpty(provenance["completionEventId"], "completion event ID");
    const parent = nonEmpty(provenance["parentSessionId"], "parent session ID");
    if (provenance["reviewerIdentity"] !== `senpi-task:${taskId}`) throw new Error("Task reviewer identity is self-asserted or mismatched.");
    validateDigest(provenance["resultSha256"], "task result digest");
    validateDigest(provenance["hostRecordSha256"], "task host-record digest");
    validateTaskRecord(recordValue(provenance["taskRecord"], "task record"));
    validateCompletionEvent(recordValue(provenance["completionEvent"], "completion event"));
    return { key: `task:${parent}:${taskId}:${eventId}`, timestamp: validateCanonicalUtcTimestamp(provenance["completionTimestamp"], "completion timestamp") };
  }
  exactKeys(provenance, ["eventContentSha256", "eventId", "eventLineNumber", "eventLineSha256", "eventTimestamp", "payloadJcsSha256", "payloadPath", "payloadRawSha256", "role", "schemaVersion", "sessionId", "transcript"], "user provenance");
  if (provenance["schemaVersion"] !== "boulder.senpi.user-event-provenance.v1" || provenance["role"] !== "user") throw new Error("User-event provenance is invalid.");
  const sessionId = nonEmpty(provenance["sessionId"], "user session ID");
  const eventId = nonEmpty(provenance["eventId"], "user event ID");
  if (!Number.isSafeInteger(provenance["eventLineNumber"]) || (provenance["eventLineNumber"] as number) < 1) throw new Error("User event line is invalid.");
  for (const key of ["eventContentSha256", "eventLineSha256", "payloadJcsSha256", "payloadRawSha256"] as const) validateDigest(provenance[key], `user provenance ${key}`);
  validateTranscript(recordValue(provenance["transcript"], "user transcript"));
  return { key: `user-event:${sessionId}:${eventId}`, timestamp: validateCanonicalUtcTimestamp(provenance["eventTimestamp"], "user event timestamp") };
}

export function validateAuthorityProvenance(
  value: unknown,
  kind: "implementer" | "task" | "user",
): ProvenanceIdentity {
  return validateAuthorityProvenanceShape(value, kind);
}

interface AuthorityHostContext {
  readonly sessionFile: string;
  readonly taskStoreRoot: string;
  readonly planFile?: string;
}

interface HostSessionLine {
  readonly event: JsonRecord;
  readonly lineNumber: number;
  readonly lineSha256: string;
  readonly prefixBytesSha256: string;
}
type FileIdentitySnapshot = {
  readonly bytes: Uint8Array;
  readonly dev: number;
  readonly ino: number;
  readonly uid: number;
  readonly mode: number;
  readonly size: number;
  readonly realpath: string;
};

async function hostSessionLines(
  path: string,
  expectedSessionId: string,
): Promise<{ readonly lines: readonly HostSessionLine[]; readonly snapshot: FileIdentitySnapshot }> {
  const snapshot = await readBoundedRegularSnapshot(path, 64 * 1024 * 1024);
  const uid = (process as unknown as { getuid?: () => number }).getuid?.();
  if (
    uid === undefined
    || snapshot.uid !== uid
    || (snapshot.mode & 0o077) !== 0
  ) throw new Error("Authority host session is not a private native transcript.");
  const text = decoder.decode(snapshot.bytes);
  if (!text.endsWith("\n")) throw new Error("Authority host session is not LF terminated.");
  const rawLines = text.slice(0, -1).split("\n");
  const lines: HostSessionLine[] = [];
  let prefix = "";
  for (const [index, raw] of rawLines.entries()) {
    if (new TextEncoder().encode(raw).byteLength > 16 * 1024 * 1024) {
      throw new Error("Authority host session line is oversized.");
    }
    rejectDuplicateJsonKeys(raw);
    const event = recordValue(JSON.parse(raw), "authority host event");
    prefix += `${raw}\n`;
    lines.push({
      event,
      lineNumber: index + 1,
      lineSha256: sha256Bytes(new TextEncoder().encode(raw)),
      prefixBytesSha256: sha256Bytes(new TextEncoder().encode(prefix)),
    });
  }
  const header = lines[0]?.event;
  if (
    header?.["type"] !== "session"
    || header["id"] !== expectedSessionId
    || header["cwd"] !== repositoryRoot
  ) throw new Error("Authority host session header is invalid.");
  return { lines, snapshot };
}

function boundSessionLine(
  lines: readonly HostSessionLine[],
  lineNumber: unknown,
  lineSha256: unknown,
  prefixBytesSha256: unknown,
): HostSessionLine {
  if (!Number.isSafeInteger(lineNumber) || (lineNumber as number) < 1) {
    throw new Error("Authority event line number is invalid.");
  }
  const line = lines[(lineNumber as number) - 1];
  if (
    line === undefined
    || line.lineSha256 !== lineSha256
    || line.prefixBytesSha256 !== prefixBytesSha256
  ) throw new Error("Authority event does not match the live host transcript.");
  return line;
}

export async function authenticateImplementerProvenance(
  value: unknown,
  context: AuthorityHostContext,
  expectedPlanSha256?: string,
): Promise<ProvenanceIdentity> {
  const identity = validateAuthorityProvenanceShape(value, "implementer");
  const provenance = recordValue(value, "implementer provenance");
  const currentPlanText = new TextDecoder("utf-8", { fatal: true }).decode(
    await readBoundedRegularFile(context.planFile ?? join(repositoryRoot, ".omo/plans/boulder-html-guide.md"), maxJsonBytes),
  );
  const currentPlanSha256 = sha256Bytes(new TextEncoder().encode(
    currentPlanText.replace(/^- \[x\] ((?:[1-9]|10)\. )/gmu, "- [ ] $1"),
  ));
  if (expectedPlanSha256 !== undefined && expectedPlanSha256 !== currentPlanSha256) throw new Error("Scope authorization is not bound to the current plan.");
  const sessionId = nonEmpty(provenance["sessionId"], "implementer session");
  const { lines } = await hostSessionLines(context.sessionFile, sessionId);
  const eventId = nonEmpty(provenance["captureEventId"], "implementer event");
  const candidates = lines.filter((line) => line.event["id"] === eventId);
  if (candidates.length !== 1) throw new Error("Implementer host event cardinality is invalid.");
  const event = candidates[0]!.event;
  const message = recordValue(event["message"], "implementer host message");
  if (
    event["type"] !== "message"
    || event["timestamp"] !== provenance["captureTimestamp"]
    || message["role"] !== "assistant"
    || message["model"] !== provenance["model"]
    || provenance["planSha256"] !== currentPlanSha256
    || provenance["hostEventContentSha256"] !== sha256Canonical(message["content"])
  ) throw new Error("Implementer provenance differs from its live host event.");
  const projection = { ...provenance };
  delete projection["hostRecordSha256"];
  if (provenance["hostRecordSha256"] !== sha256Canonical(projection)) {
    throw new Error("Implementer host-record digest is invalid.");
  }
  return identity;
}

export async function authenticateTaskProvenance(
  value: unknown,
  context: AuthorityHostContext,
  expectedResultSha256: string,
  expectedReviewerIdentity: string,
): Promise<ProvenanceIdentity> {
  const identity = validateAuthorityProvenanceShape(value, "task");
  const provenance = recordValue(value, "task provenance");
  const taskId = nonEmpty(provenance["taskId"], "task ID");
  if (!/^st_[0-9a-f]+$/u.test(taskId)) throw new Error("Task ID is not canonical.");
  const taskPath = join(context.taskStoreRoot, "tasks", `${taskId}.json`);
  const taskSnapshot = await readBoundedRegularSnapshot(taskPath, maxJsonBytes);
  const taskBytes = taskSnapshot.bytes;
  const uid = (process as unknown as { getuid?: () => number }).getuid?.();
  if (
    uid === undefined
    || taskSnapshot.uid !== uid
    || (taskSnapshot.mode & 0o077) !== 0
  ) throw new Error("Task host record is not private.");
  const taskBinding = recordValue(provenance["taskRecord"], "task record");
  if (
    taskBinding["device"] !== taskSnapshot.dev
    || taskBinding["inode"] !== taskSnapshot.ino
    || taskBinding["uid"] !== taskSnapshot.uid
    || taskBinding["size"] !== taskSnapshot.size
    || taskBinding["mode"] !== (taskSnapshot.mode & 0o7777).toString(8).padStart(4, "0")
    || taskBinding["pathSha256"] !== sha256Bytes(new TextEncoder().encode(taskSnapshot.realpath))
    || taskBinding["sha256"] !== sha256Bytes(taskBytes)
    || provenance["hostRecordSha256"] !== sha256Bytes(taskBytes)
  ) throw new Error("Task provenance does not match the live task record.");
  const task = recordValue(JSON.parse(decoder.decode(taskBytes)), "live task record");
  const finalResponse = nonEmpty(task["final_response"], "task final response");
  const resultDigests = [
    sha256Bytes(new TextEncoder().encode(finalResponse)),
    sha256Bytes(new TextEncoder().encode(`${finalResponse}\n`)),
  ];
  if (
    task["task_id"] !== taskId
    || task["parent_session_id"] !== provenance["parentSessionId"]
    || task["status"] !== "completed"
    || task["model"] !== provenance["model"]
    || provenance["resultSha256"] !== expectedResultSha256
    || provenance["reviewerIdentity"] !== expectedReviewerIdentity
    || !resultDigests.includes(expectedResultSha256)
  ) throw new Error("Task provenance differs from the completed host task.");
  const { lines } = await hostSessionLines(
    context.sessionFile,
    nonEmpty(provenance["parentSessionId"], "task parent session"),
  );
  const completion = recordValue(provenance["completionEvent"], "completion event");
  const line = boundSessionLine(
    lines,
    completion["lineNumber"],
    completion["lineSha256"],
    completion["prefixBytesSha256"],
  );
  const event = line.event;
  const details = event["details"];
  if (!Array.isArray(details) || details.length !== 1) {
    throw new Error("Task completion host event details are invalid.");
  }
  const wrapper = recordValue(details[0], "task completion wrapper");
  const completionDetails = wrapper["details"];
  if (
    event["type"] !== "custom_message"
    || event["customType"] !== "omo-senpi:wake"
    || event["id"] !== provenance["completionEventId"]
    || event["timestamp"] !== provenance["completionTimestamp"]
    || wrapper["customType"] !== "senpi-task.completion"
    || !Array.isArray(completionDetails)
    || completionDetails.length !== 1
  ) throw new Error("Task completion host event is invalid.");
  const detail = recordValue(completionDetails[0], "task completion detail");
  if (
    detail["task_id"] !== taskId
    || detail["status"] !== "completed"
    || detail["model"] !== provenance["model"]
    || detail["final_response"] !== finalResponse
  ) throw new Error("Task completion detail differs from the live task record.");
  const currentTaskSnapshot = await readBoundedRegularSnapshot(taskPath, maxJsonBytes);
  assertSameSnapshot(taskSnapshot, currentTaskSnapshot, "Task host record");
  return identity;
}

export async function authenticateUserProvenance(
  value: unknown,
  context: AuthorityHostContext,
  payload: FileValue,
  payloadPath: string,
): Promise<ProvenanceIdentity> {
  const identity = validateAuthorityProvenanceShape(value, "user");
  const provenance = recordValue(value, "user provenance");
  const { lines, snapshot: sessionState } = await hostSessionLines(
    context.sessionFile,
    nonEmpty(provenance["sessionId"], "user session"),
  );
  const transcript = recordValue(provenance["transcript"], "user transcript");
  if (
    transcript["device"] !== sessionState.dev
    || transcript["inode"] !== sessionState.ino
    || transcript["uid"] !== sessionState.uid
    || transcript["mode"] !== (sessionState.mode & 0o7777).toString(8).padStart(4, "0")
    || transcript["realpathSha256"] !== sha256Bytes(new TextEncoder().encode(sessionState.realpath))
  ) throw new Error("User transcript metadata differs from the live host file.");
  const line = boundSessionLine(
    lines,
    provenance["eventLineNumber"],
    provenance["eventLineSha256"],
    transcript["prefixBytesSha256"],
  );
  const event = line.event;
  const message = recordValue(event["message"], "user host message");
  const content = message["content"];
  if (
    event["type"] !== "message"
    || event["id"] !== provenance["eventId"]
    || event["timestamp"] !== provenance["eventTimestamp"]
    || message["role"] !== "user"
    || !Array.isArray(content)
    || content.length !== 1
  ) throw new Error("User provenance differs from the live host event.");
  const textPart = recordValue(content[0], "user text part");
  const text = nonEmpty(textPart["text"], "user event text");
  const messageBytes = encoder.encode(text);
  if (messageBytes.length !== payload.bytes.length || messageBytes.some((byte, index) => byte !== payload.bytes[index])) {
    throw new Error("User message bytes differ from the approval payload.");
  }
  if (
    textPart["type"] !== "text"
    || provenance["payloadPath"] !== payloadPath
    || provenance["payloadRawSha256"] !== payload.sha256
    || provenance["eventContentSha256"] !== sha256Bytes(new TextEncoder().encode(text))
    || provenance["payloadJcsSha256"] !== sha256Canonical(payload.value)
  ) throw new Error("User provenance is not bound to the exact live payload.");
  const currentSessionState = await readBoundedRegularSnapshot(context.sessionFile, 64 * 1024 * 1024);
  assertSameSnapshot(sessionState, currentSessionState, "User transcript");
  return identity;
}

export function validateCurrentGitIdentity(outputs: { readonly objectFormat: string; readonly headCommit: string; readonly commitType: string; readonly headTree: string; readonly treeType: string }, expected: { readonly headCommit: string; readonly headTree: string }): GitIdentity {
  const objectFormat = oneLine(outputs.objectFormat, "Git object format");
  if (objectFormat !== "sha1" && objectFormat !== "sha256") throw new Error("Git object format is unsupported.");
  const length = objectFormat === "sha1" ? 40 : 64;
  const headCommit = oneLine(outputs.headCommit, "HEAD commit");
  const headTree = oneLine(outputs.headTree, "HEAD tree");
  if (headCommit.length !== length || headTree.length !== length || !gitOidPattern.test(headCommit) || !gitOidPattern.test(headTree) || oneLine(outputs.commitType, "commit type") !== "commit" || oneLine(outputs.treeType, "tree type") !== "tree") throw new Error("Current Git identity is malformed.");
  if (headCommit !== expected.headCommit || headTree !== expected.headTree) throw new Error("Current Git identity changed after tracked freeze.");
  return { objectFormat, headCommit, headTree };
}

export function validateExitReceiptShape(value: unknown): JsonRecord {
  const receipt = recordValue(value, "exit receipt");
  exactKeys(receipt, ["baselineTransition", "decision", "durableProvenanceDigests", "exactByteReviews", "implementerProvenance", "invalidation", "maintainerApproval", "priorExitState", "protectedPendingTransition", "reviewedInputs", "reviewedInputsManifest", "schemaVersion", "scope", "scopeAuthorization", "status", "verification"], "exit receipt");
  if (receipt["schemaVersion"] !== "boulder.k0r.exit-receipt.v2" || receipt["status"] !== "approved" || receipt["scope"] !== approvedScope) throw new Error("Exit receipt identity is invalid.");
  const decision = recordValue(receipt["decision"], "exit decision");
  exactKeys(decision, ["k0rExit", "k2Authorized", "k3Authorized", "k4Authorized", "repositoryCommitAuthorized"], "exit decision");
  if (decision["k0rExit"] !== true || decision["k2Authorized"] !== false || decision["k3Authorized"] !== false || decision["k4Authorized"] !== false || decision["repositoryCommitAuthorized"] !== false) throw new Error("Exit receipt expands authority.");
  reviewedInputs(receipt["reviewedInputs"], "exit reviewed inputs");
  return receipt;
}

async function issueExit(values: Readonly<Record<WriteOption, string>>): Promise<JsonRecord> {
  const privateRoot = await inferPrivateRoot(values["--pending-transition"]);
  const context = await loadIssuanceContext(values, privateRoot);
  const receipt = buildExitReceipt(context);
  const output = resolve(repositoryRoot, exitReceiptPath);
  await atomicCreateCanonical(output, repositoryRoot, receipt, 0o644);
  try {
    await verifyExit(output, privateRoot, values["--implementer-provenance"], values["--reviewed-inputs-manifest"]);
  } catch (error) {
    await unlink(output).catch(() => undefined);
    throw error;
  }
  return receipt;
}

type IssuanceContext = {
  readonly pending: FileValue; readonly priorExit: FileValue; readonly baseline: FileValue; readonly isolated: FileValue; readonly evidence: FileValue; readonly pendingChecks: FileValue;
  readonly scopePayload: FileValue; readonly scopeProvenance: FileValue; readonly implementer: FileValue; readonly manifest: FileValue;
  readonly architect: FileValue; readonly architectProvenance: FileValue; readonly critic: FileValue; readonly criticProvenance: FileValue;
  readonly maintainerRequest: FileValue; readonly maintainer: FileValue; readonly maintainerProvenance: FileValue; readonly architectAttestation: FileValue; readonly architectAttestationProvenance: FileValue; readonly criticAttestation: FileValue; readonly criticAttestationProvenance: FileValue;
  readonly reviewedInputs: readonly ReviewedInput[];
};

async function loadIssuanceContext(values: Readonly<Record<WriteOption, string>>, privateRoot: string, expectedCurrentExit?: FileValue): Promise<IssuanceContext> {
  const sessionFile = process.env["PI_SESSION_FILE"];
  if (!sessionFile) throw new Error("PI_SESSION_FILE is required for live authority verification.");
  const hostContext: AuthorityHostContext = {
    sessionFile,
    taskStoreRoot: join(repositoryRoot, ".omo/senpi-task"),
  };
  const paths = Object.values(values);
  paths.forEach((path) => assertInputContained(path, privateRoot));
  for (const option of writeOptions) if (resolve(values[option]) !== resolve(privateRoot, canonicalWriteRolePaths[option])) throw new Error(`${option} path is not canonical.`);
  await verifyPending(values["--pending-transition"], privateRoot);
  const [pending, scopePayload, scopeProvenance, implementer, architect, architectProvenance, critic, criticProvenance, manifest, maintainerRequest, maintainer, maintainerProvenance, architectAttestation, architectAttestationProvenance, criticAttestation, criticAttestationProvenance] = await Promise.all([
    readJsonFile(values["--pending-transition"]), readJsonFile(values["--scope-authorization"]), readJsonFile(values["--scope-provenance"]), readJsonFile(values["--implementer-provenance"]),
    readJsonFile(values["--architect-review"]), readJsonFile(values["--architect-provenance"]), readJsonFile(values["--critic-review"]), readJsonFile(values["--critic-provenance"]), readJsonFile(values["--reviewed-inputs-manifest"]),
    readJsonFile(values["--maintainer-request"]), readJsonFile(values["--maintainer-approval"]), readJsonFile(values["--maintainer-provenance"]), readJsonFile(values["--architect-attestation"]), readJsonFile(values["--architect-attestation-provenance"]), readJsonFile(values["--critic-attestation"]), readJsonFile(values["--critic-attestation-provenance"])
  ]);
  validatePendingTransition(pending.value);
  const reviewed = validateReviewedInputsManifest(manifest.value);
  assertExactReviewedPathSet(reviewed, privateRoot);
  await verifyReviewedInputBytes(reviewed, privateRoot);
  const priorExit = await readJsonFile(join(privateRoot, "protected/prior-exit-state.json"));
  const baseline = await readJsonFile(resolve(repositoryRoot, "evidence/k0r/baseline-transition.json"));
  const isolated = await readJsonFile(resolve(repositoryRoot, "evidence/k0r/isolated-run-receipt.json"));
  const evidence = await readJsonFile(resolve(repositoryRoot, "evidence/k0r/evidence-manifest.json"));
  const pendingChecks = await readJsonFile(join(privateRoot, "receipts/k0r-pending-checks.json"));
  await verifyPriorExitSources(priorExit.value, privateRoot, expectedCurrentExit);
  validatePathDigestStatus(recordValue(pending.value["baselineTransition"], "pending baseline binding"), "captured_pending_exact_byte_review", "pending baseline binding");
  if (recordValue(pending.value["baselineTransition"], "pending baseline binding")["sha256"] !== baseline.sha256) throw new Error("Pending transition baseline digest is stale.");
  if (recordValue(pending.value["prior"], "pending prior binding")["exitStateSha256"] !== priorExit.sha256) throw new Error("Pending transition prior-exit digest is stale.");
  validateScopeAuthorization(scopePayload, scopeProvenance, pending);
  const implementerIdentity = await authenticateImplementerProvenance(
    implementer.value,
    hostContext,
    stringValue(scopePayload.value["planSha256"], "scope plan digest"),
  );
  const architectReview = validateExactByteReview(architect.value, "architect", reviewed, implementer.sha256, priorExit.sha256, baseline.sha256);
  const criticReview = validateExactByteReview(critic.value, "critic", reviewed, implementer.sha256, priorExit.sha256, baseline.sha256);
  const architectIdentity = await authenticateTaskProvenance(
    architectProvenance.value,
    hostContext,
    architect.sha256,
    nonEmpty(architectReview["reviewerIdentity"], "architect reviewer identity"),
  );
  const criticIdentity = await authenticateTaskProvenance(
    criticProvenance.value,
    hostContext,
    critic.sha256,
    nonEmpty(criticReview["reviewerIdentity"], "critic reviewer identity"),
  );
  validateMaintainerApproval(maintainer.value, maintainerRequest.value, { reviewedInputs: reviewed, architectReviewSha256: architect.sha256, criticReviewSha256: critic.sha256, adrSha256: await digestFile(resolve(repositoryRoot, "evidence/k0r/superseding-adr.md")), evidenceManifestSha256: evidence.sha256, baselineTransitionSha256: baseline.sha256 });
  const maintainerIdentity = await authenticateUserProvenance(
    maintainerProvenance.value,
    hostContext,
    maintainer,
    "reviews/k0r-maintainer.json",
  );
  if (maintainerIdentity.timestamp <= architectIdentity.timestamp || maintainerIdentity.timestamp <= criticIdentity.timestamp) throw new Error("Maintainer approval predates an exact-byte review.");
  const architectAttestationValue = validateAttestation(architectAttestation.value, "architect-attestation", architect, architectProvenance, maintainer, maintainerProvenance);
  const criticAttestationValue = validateAttestation(criticAttestation.value, "critic-attestation", critic, criticProvenance, maintainer, maintainerProvenance);
  const architectAttestationIdentity = await authenticateTaskProvenance(
    architectAttestationProvenance.value,
    hostContext,
    architectAttestation.sha256,
    nonEmpty(architectAttestationValue["reviewerIdentity"], "architect attestation reviewer identity"),
  );
  const criticAttestationIdentity = await authenticateTaskProvenance(
    criticAttestationProvenance.value,
    hostContext,
    criticAttestation.sha256,
    nonEmpty(criticAttestationValue["reviewerIdentity"], "critic attestation reviewer identity"),
  );
  if (architectAttestationIdentity.timestamp <= maintainerIdentity.timestamp || criticAttestationIdentity.timestamp <= maintainerIdentity.timestamp) throw new Error("An approval attestation predates maintainer approval.");
  const authorityKeys = [implementerIdentity.key, architectIdentity.key, criticIdentity.key, maintainerIdentity.key, architectAttestationIdentity.key, criticAttestationIdentity.key];
  if (new Set(authorityKeys).size !== authorityKeys.length) throw new Error("Exit authorities are not role-separated.");
  await verifyTrackedFreezeAndGit(privateRoot, pending.value, scopePayload.value);
  validatePendingEvidence(pending, isolated, evidence.value, pendingChecks.value);
  return { pending, priorExit, baseline, isolated, evidence, pendingChecks, scopePayload, scopeProvenance, implementer, manifest, architect, architectProvenance, critic, criticProvenance, maintainerRequest, maintainer, maintainerProvenance, architectAttestation, architectAttestationProvenance, criticAttestation, criticAttestationProvenance, reviewedInputs: reviewed };
}

function buildExitReceipt(context: IssuanceContext): JsonRecord {
  const ref = (file: FileValue): { path: string; sha256: string } => ({ path: storedPath(file.path), sha256: file.sha256 });
  return {
    schemaVersion: "boulder.k0r.exit-receipt.v2", status: "approved", scope: approvedScope,
    priorExitState: { ...ref(context.priorExit), state: "absent_not_issued" },
    baselineTransition: { ...ref(context.baseline), status: context.baseline.value["status"] },
    protectedPendingTransition: { ...ref(context.pending), status: "pending_exit" },
    implementerProvenance: ref(context.implementer),
    scopeAuthorization: {
      payloadPath: storedPath(context.scopePayload.path), payloadRawSha256: context.scopePayload.sha256,
      payloadJcsSha256: sha256Canonical(context.scopePayload.value), provenancePath: storedPath(context.scopeProvenance.path), provenanceSha256: context.scopeProvenance.sha256
    },
    reviewedInputs: context.reviewedInputs, reviewedInputsManifest: ref(context.manifest),
    exactByteReviews: {
      architect: { ...ref(context.architect), provenancePath: storedPath(context.architectProvenance.path), provenanceSha256: context.architectProvenance.sha256 },
      critic: { ...ref(context.critic), provenancePath: storedPath(context.criticProvenance.path), provenanceSha256: context.criticProvenance.sha256 }
    },
    maintainerApproval: {
      requestPath: storedPath(context.maintainerRequest.path), requestSha256: context.maintainerRequest.sha256,
      requestPayloadJcsSha256: context.maintainerRequest.value["requestPayloadJcsSha256"], requestReceiptSha256: context.maintainerRequest.value["receiptSha256"],
      payloadPath: storedPath(context.maintainer.path), payloadRawSha256: context.maintainer.sha256, payloadJcsSha256: sha256Canonical(context.maintainer.value), provenancePath: storedPath(context.maintainerProvenance.path), provenanceSha256: context.maintainerProvenance.sha256,
      architectAttestationPath: storedPath(context.architectAttestation.path), architectAttestationSha256: context.architectAttestation.sha256, architectAttestationProvenancePath: storedPath(context.architectAttestationProvenance.path), architectAttestationProvenanceSha256: context.architectAttestationProvenance.sha256,
      criticAttestationPath: storedPath(context.criticAttestation.path), criticAttestationSha256: context.criticAttestation.sha256, criticAttestationProvenancePath: storedPath(context.criticAttestationProvenance.path), criticAttestationProvenanceSha256: context.criticAttestationProvenance.sha256
    },
    durableProvenanceDigests: {
      scopeAuthorizationSha256: context.scopePayload.sha256, scopeProvenanceSha256: context.scopeProvenance.sha256,
      architectReviewSha256: context.architect.sha256, architectProvenanceSha256: context.architectProvenance.sha256,
      criticReviewSha256: context.critic.sha256, criticProvenanceSha256: context.criticProvenance.sha256,
      maintainerRequestSha256: context.maintainerRequest.sha256, maintainerApprovalSha256: context.maintainer.sha256, maintainerProvenanceSha256: context.maintainerProvenance.sha256,
      architectAttestationSha256: context.architectAttestation.sha256, architectAttestationProvenanceSha256: context.architectAttestationProvenance.sha256,
      criticAttestationSha256: context.criticAttestation.sha256, criticAttestationProvenanceSha256: context.criticAttestationProvenance.sha256
    },
    verification: {
      isolatedRunPath: storedPath(context.isolated.path), isolatedRunSha256: context.isolated.sha256, isolatedRunStatus: context.isolated.value["status"],
      evidenceManifestPath: storedPath(context.evidence.path), evidenceManifestSha256: context.evidence.sha256, evidenceManifestStatus: context.evidence.value["status"],
      pendingChecksReceiptPath: storedPath(context.pendingChecks.path), pendingChecksReceiptSha256: context.pendingChecks.sha256, unresolvedFindings: 0
    },
    decision: { k0rExit: true, k2Authorized: false, k3Authorized: false, k4Authorized: false, repositoryCommitAuthorized: false },
    invalidation: { conditions: [...invalidationConditions] }
  };
}

async function verifyExit(receiptPath: string, privateRoot: string, implementerPath: string, manifestPath: string): Promise<JsonRecord> {
  assertInputContained(receiptPath, privateRoot);
  const receiptFile = await readJsonFile(receiptPath);
  const receipt = validateExitReceiptShape(receiptFile.value);
  const values = deriveWriteValues(receipt, privateRoot, implementerPath, manifestPath);
  const context = await loadIssuanceContext(values, privateRoot, receiptFile);
  const expected = buildExitReceipt(context);
  if (!equalCanonical(receipt, expected)) throw new Error("Exit receipt does not match independently rederived issuance bindings.");
  await verifyReviewedInputBytes(context.reviewedInputs, privateRoot);
  const currentReceipt = await readJsonFile(receiptPath);
  if (currentReceipt.sha256 !== receiptFile.sha256 || !equalCanonical(currentReceipt.value, receipt)) throw new Error("Exit receipt changed during verification.");
  return currentReceipt.value;
}

async function verifyCanonicalExitForTransition(receiptPath: string, privateRoot: string): Promise<FileValue> {
  if (resolve(receiptPath) !== resolve(repositoryRoot, exitReceiptPath)) throw new Error("Transition exit receipt is not the canonical K0R exit path.");
  const receipt = await readJsonFile(receiptPath);
  const value = validateExitReceiptShape(receipt.value);
  const provenance = recordValue(value["implementerProvenance"], "receipt implementer provenance");
  const reviewed = recordValue(value["reviewedInputsManifest"], "receipt reviewed inputs manifest");
  const verified = await verifyExit(
    receiptPath,
    privateRoot,
    resolveStoredPath(stringValue(provenance["path"], "implementer provenance path"), privateRoot),
    resolveStoredPath(stringValue(reviewed["path"], "reviewed inputs manifest path"), privateRoot),
  );
  const current = await readJsonFile(receiptPath);
  if (!equalCanonical(current.value, verified)) throw new Error("Canonical exit receipt changed after verification.");
  return current;
}

function deriveWriteValues(receipt: JsonRecord, privateRoot: string, implementerPath: string, manifestPath: string): Record<WriteOption, string> {
  const scope = recordValue(receipt["scopeAuthorization"], "receipt scope authorization");
  const reviews = recordValue(receipt["exactByteReviews"], "receipt exact reviews");
  const architect = recordValue(reviews["architect"], "receipt architect review");
  const critic = recordValue(reviews["critic"], "receipt critic review");
  const maintainer = recordValue(receipt["maintainerApproval"], "receipt maintainer approval");
  const pending = recordValue(receipt["protectedPendingTransition"], "receipt pending transition");
  const path = (value: unknown, label: string): string => resolveStoredPath(stringValue(value, label), privateRoot);
  return {
    "--scope-authorization": path(scope["payloadPath"], "scope payload path"), "--scope-provenance": path(scope["provenancePath"], "scope provenance path"), "--implementer-provenance": implementerPath,
    "--architect-review": path(architect["path"], "architect path"), "--architect-provenance": path(architect["provenancePath"], "architect provenance path"),
    "--critic-review": path(critic["path"], "critic path"), "--critic-provenance": path(critic["provenancePath"], "critic provenance path"), "--reviewed-inputs-manifest": manifestPath,
    "--maintainer-request": path(maintainer["requestPath"], "maintainer request path"),
    "--maintainer-approval": path(maintainer["payloadPath"], "maintainer path"), "--maintainer-provenance": path(maintainer["provenancePath"], "maintainer provenance path"),
    "--architect-attestation": path(maintainer["architectAttestationPath"], "architect attestation path"), "--architect-attestation-provenance": path(maintainer["architectAttestationProvenancePath"], "architect attestation provenance path"),
    "--critic-attestation": path(maintainer["criticAttestationPath"], "critic attestation path"), "--critic-attestation-provenance": path(maintainer["criticAttestationProvenancePath"], "critic attestation provenance path"),
    "--pending-transition": path(pending["path"], "pending transition path")
  };
}

async function verifyPending(path: string, privateRoot: string): Promise<JsonRecord> {
  assertInputContained(path, privateRoot);
  if (resolve(path) !== resolve(privateRoot, "protected/k0r-transition.pending.json")) throw new Error("Pending transition path is not canonical.");
  const pending = await readJsonFile(path);
  validatePendingTransition(pending.value);
  const [scopePayload, scopeProvenance, snapshot, preScan, materialization, reconciliation, typescript, priorExit, priorBaseline] = await Promise.all([
    readJsonFile(join(privateRoot, "authorizations/k0r-a.json")),
    readJsonFile(join(privateRoot, "authorizations/k0r-a.provenance.json")),
    readJsonFile(join(privateRoot, "receipts/k0r-binding-snapshot.json")),
    readJsonFile(join(privateRoot, "receipts/k0r-binding-scan.pre.json")),
    readJsonFile(join(privateRoot, "receipts/k0r-materialization.json")),
    readJsonFile(join(privateRoot, "receipts/k0r-binding-scan.json")),
    readJsonFile(join(privateRoot, "receipts/typescript-binding.json")),
    readJsonFile(join(privateRoot, "protected/prior-exit-state.json")),
    readJsonFile(join(privateRoot, "protected/prior-k0r.inventory.json")),
  ]);
  const scopeBinding = recordValue(pending.value["scopeAuthorization"], "pending scope authorization");
  if (scopeBinding["payloadRawSha256"] !== scopePayload.sha256 || scopeBinding["payloadJcsSha256"] !== sha256Canonical(scopePayload.value) || scopeBinding["provenanceSha256"] !== scopeProvenance.sha256) throw new Error("Pending scope authorization ancestry is stale.");
  validateK0rTask1ScopeProvenance(scopePayload.value, scopeProvenance.value, scopePayload.sha256);
  const verifySelfDigest = (file: FileValue, label: string): void => {
    const receiptSha256 = validateDigest(file.value["receiptSha256"], `${label} self digest`);
    const projection: JsonRecord = { ...file.value };
    delete projection["receiptSha256"];
    if (receiptSha256 !== sha256Canonical(projection)) throw new Error(`${label} self digest is invalid.`);
  };
  [snapshot, preScan, materialization, reconciliation].forEach((file, index) => verifySelfDigest(file, ["Owner snapshot", "Pre-scan", "Materialization", "Reconciliation"][index] ?? "Receipt"));
  const snapshotBinding = recordValue(pending.value["bindingOwnerSnapshot"], "pending owner snapshot");
  const legacySnapshotMerkleSha256 = String(snapshot.value["entriesSha256"] ?? "");
  const snapshotMerkle = snapshot.value["merkle"] === undefined
    ? { rootSha256: legacySnapshotMerkleSha256 }
    : recordValue(snapshot.value["merkle"], "owner snapshot merkle");
  if (snapshotBinding["path"] !== "receipts/k0r-binding-snapshot.json" || snapshotBinding["sha256"] !== snapshot.sha256 || snapshotBinding["pathSetSha256"] !== snapshot.value["pathSetSha256"] || snapshotBinding["merkleSha256"] !== snapshotMerkle["rootSha256"]) throw new Error("Pending owner snapshot ancestry is stale.");
  const preBinding = recordValue(pending.value["bindingPreScan"], "pending pre-scan");
  if (preBinding["path"] !== "receipts/k0r-binding-scan.pre.json" || preBinding["sha256"] !== preScan.sha256 || preBinding["ownerSnapshotSha256"] !== snapshot.sha256 || preBinding["bindingsSha256"] !== preScan.value["bindingsSha256"] || preScan.value["ownerSnapshotSha256"] !== snapshot.sha256) throw new Error("Pending pre-scan ancestry is stale.");
  const materializationBinding = recordValue(pending.value["evidenceMaterialization"], "pending materialization");
  const materializationSnapshot = recordValue(materialization.value["ownerSnapshot"], "materialization owner snapshot");
  const materializationPre = recordValue(materialization.value["preEditScan"], "materialization pre-scan");
  const materializationFreeze = recordValue(materialization.value["trackedFreeze"], "materialization tracked freeze");
  if (materializationBinding["path"] !== "receipts/k0r-materialization.json" || materializationBinding["sha256"] !== materialization.sha256 || materializationBinding["outputPathSetSha256"] !== materialization.value["outputPathSetSha256"] || materializationBinding["outputMerkleSha256"] !== materialization.value["outputMerkleSha256"] || materializationSnapshot["sha256"] !== snapshot.sha256 || materializationPre["sha256"] !== preScan.sha256 || materializationFreeze["path"] !== "protected/tracked-freeze.json" || materializationFreeze["sha256"] !== pending.value["trackedFreezeSha256"]) throw new Error("Pending materialization ancestry is stale.");
  const reconciliationBinding = recordValue(pending.value["bindingReconciliation"], "pending reconciliation");
  if (reconciliationBinding["path"] !== "receipts/k0r-binding-scan.json" || reconciliationBinding["sha256"] !== reconciliation.sha256 || reconciliationBinding["preEditScanSha256"] !== preScan.sha256 || reconciliationBinding["materializationSha256"] !== materialization.sha256) throw new Error("Pending reconciliation ancestry is stale.");
  for (const key of ["bindingsSha256", "bindingSchemaInventorySha256", "sourceSchemaInventorySha256"] as const) if (reconciliationBinding[key] !== reconciliation.value[key]) throw new Error(`Pending reconciliation ${key} is stale.`);
  const typeBinding = recordValue(pending.value["typescriptBinding"], "pending TypeScript binding");
  if (typescript.value["source"] === undefined && typescript.value["equivalentSource"] === undefined && typescript.value["artifact"] === undefined) {
    const artifactSha256 = String(typescript.value["artifactSha256"] ?? "");
    const sourceTreeSha256 = String(typescript.value["sourceTreeSha256"] ?? "");
    if (
      typeBinding["path"] !== "receipts/typescript-binding.json" ||
      typeBinding["sha256"] !== typescript.sha256 ||
      !digestPattern.test(artifactSha256) ||
      !digestPattern.test(sourceTreeSha256) ||
      !digestPattern.test(String(typeBinding["sourcePathSha256"])) ||
      !digestPattern.test(String(typeBinding["packageJsonSha256"])) ||
      typeBinding["sourceTreeSha256"] !== sourceTreeSha256 ||
      typeBinding["equivalentSourceTreeSha256"] !== sourceTreeSha256 ||
      typeBinding["artifactSha256"] !== artifactSha256 ||
      typeBinding["externalReadOnly"] !== true ||
      typescript.value["status"] !== "verified" ||
      typescript.value["externalReadOnly"] !== true
    ) throw new Error("Pending legacy TypeScript ancestry is stale.");
  } else {
    const typeSource = recordValue(typescript.value["source"], "TypeScript source");
    const equivalentSource = recordValue(typescript.value["equivalentSource"], "equivalent TypeScript source");
    const artifact = recordValue(typescript.value["artifact"], "TypeScript artifact");
    if (typeBinding["path"] !== "receipts/typescript-binding.json" || typeBinding["sha256"] !== typescript.sha256 || typeBinding["sourceTreeSha256"] !== typeSource["sourceTreeSha256"] || typeBinding["sourcePathSha256"] !== typeSource["realpathSha256"] || typeBinding["equivalentSourceTreeSha256"] !== equivalentSource["equivalentSourceTreeSha256"] || typeBinding["packageJsonSha256"] !== typescript.value["packageJsonSha256"] || typeBinding["artifactSha256"] !== artifact["sha256"] || typeBinding["externalReadOnly"] !== true || typescript.value["status"] !== "verified" || typescript.value["externalReadOnly"] !== true) throw new Error("Pending TypeScript ancestry is stale.");
  }
  const prior = recordValue(pending.value["prior"], "pending prior authority");
  if (prior["baselineSha256"] !== priorBaseline.sha256 || prior["exitStateSha256"] !== priorExit.sha256 || prior["snapshotInventorySha256"] !== scopePayload.value["priorEvidenceInventorySha256"] || prior["snapshotInventorySha256"] !== priorBaseline.value["entriesSha256"] || prior["approvalProvenanceSha256"] !== await digestFile(join(repositoryRoot, "evidence/k0r/approval-provenance.json"))) throw new Error("Pending prior authority is stale.");
  const baselineBinding = recordValue(pending.value["baselineTransition"], "pending baseline transition");
  if (baselineBinding["path"] !== "evidence/k0r/baseline-transition.json" || baselineBinding["sha256"] !== await digestFile(join(repositoryRoot, "evidence/k0r/baseline-transition.json")) || baselineBinding["status"] !== "captured_pending_exact_byte_review") throw new Error("Pending baseline transition is stale.");
  for (const mutation of recordArray(pending.value["ownerMutations"], "pending owner mutations")) if (mutation["afterSha256"] !== await digestFile(join(repositoryRoot, stringValue(mutation["path"], "owner mutation path")))) throw new Error("Pending owner mutation is stale.");
  await verifyTrackedFreezeAndGit(privateRoot, pending.value, scopePayload.value);
  const exitState = await lstat(resolve(repositoryRoot, exitReceiptPath)).catch((error: unknown) => isEnoent(error) ? undefined : Promise.reject(error));
  if (exitState !== undefined) throw new Error("Pending-only verification refuses a present exit receipt.");
  const current = await readJsonFile(path);
  if (current.sha256 !== pending.sha256 || !equalCanonical(current.value, pending.value)) throw new Error("Pending transition changed during ancestry verification.");
  return { schemaVersion: "boulder.k0r.pending-exit-report.v1", status: "pending_exit", transitionSha256: pending.sha256, authoritySynthesized: false };
}

async function finalizeTransition(command: Extract<K0rIssueExitCommand, { readonly mode: "finalize-transition" }>): Promise<JsonRecord> {
  const privateRoot = await inferPrivateRoot(command.pendingTransition);
  for (const path of [command.pendingTransition, command.replacementBaseline, command.output]) assertPrivatePath(path, privateRoot);
  if (resolve(command.pendingTransition) !== resolve(privateRoot, "protected/k0r-transition.pending.json") || resolve(command.output) !== resolve(privateRoot, "protected/k0r-transition.final.json")) throw new Error("Final transition role path is not canonical.");
  const pending = await readJsonFile(command.pendingTransition);
  const exit = await verifyCanonicalExitForTransition(command.exitReceipt, privateRoot);
  const replacement = await readJsonFile(command.replacementBaseline);
  validatePendingTransition(pending.value);
  const exitPending = recordValue(exit.value["protectedPendingTransition"], "exit pending transition");
  if (resolveStoredPath(stringValue(exitPending["path"], "exit pending path"), privateRoot) !== resolve(command.pendingTransition) || exitPending["sha256"] !== pending.sha256 || exitPending["status"] !== "pending_exit") throw new Error("Verified exit receipt does not bind the supplied pending transition.");
  const evidenceInventory = replacement.value["entries"];
  if (!Array.isArray(evidenceInventory)) throw new Error("Replacement protected baseline has no evidence inventory.");
  const output: JsonRecord = {
    schemaVersion: "boulder.k0r.protected-transition.final.v1", status: "verified_pending_final_gates",
    pendingTransition: { path: storedPath(pending.path), sha256: pending.sha256, status: "pending_exit" },
    replacementExit: { path: storedPath(exit.path), sha256: exit.sha256, status: "approved" },
    replacementEvidenceInventorySha256: sha256Canonical(evidenceInventory),
    replacementProtectedBaseline: { path: storedPath(replacement.path), sha256: replacement.sha256 },
    generator: { argv: Bun.argv.slice(0), cwd: repositoryRoot, stdoutSha256: sha256Bytes(new Uint8Array()), stderrSha256: sha256Bytes(new Uint8Array()) }
  };
  await atomicCreateCanonical(command.output, privateRoot, output, 0o400);
  await verifyFinalTransition(command.output);
  return output;
}

async function verifyFinalTransition(path: string): Promise<JsonRecord> {
  const privateRoot = await inferPrivateRoot(path);
  assertPrivatePath(path, privateRoot);
  if (resolve(path) !== resolve(privateRoot, "protected/k0r-transition.final.json")) throw new Error("Final transition path is not canonical.");
  const final = await readJsonFile(path);
  const value = final.value;
  exactKeys(value, ["generator", "pendingTransition", "replacementEvidenceInventorySha256", "replacementExit", "replacementProtectedBaseline", "schemaVersion", "status"], "final transition");
  if (value["schemaVersion"] !== "boulder.k0r.protected-transition.final.v1" || value["status"] !== "verified_pending_final_gates") throw new Error("Final transition identity is invalid.");
  const pendingBinding = recordValue(value["pendingTransition"], "final pending binding");
  const exitBinding = recordValue(value["replacementExit"], "final exit binding");
  const baselineBinding = recordValue(value["replacementProtectedBaseline"], "final baseline binding");
  validatePathDigestStatus(pendingBinding, "pending_exit", "final pending binding");
  validatePathDigestStatus(exitBinding, "approved", "final exit binding");
  exactKeys(baselineBinding, ["path", "sha256"], "final baseline binding");
  const pending = await readJsonFile(resolveStoredPath(stringValue(pendingBinding["path"], "pending path"), privateRoot));
  const exitPath = resolveStoredPath(stringValue(exitBinding["path"], "exit path"), privateRoot);
  const exit = await verifyCanonicalExitForTransition(exitPath, privateRoot);
  const baseline = await readJsonFile(resolveStoredPath(stringValue(baselineBinding["path"], "baseline path"), privateRoot));
  if (pending.sha256 !== pendingBinding["sha256"] || exit.sha256 !== exitBinding["sha256"] || baseline.sha256 !== baselineBinding["sha256"]) throw new Error("Final transition references stale bytes.");
  validatePendingTransition(pending.value);
  const exitPending = recordValue(exit.value["protectedPendingTransition"], "exit pending transition");
  if (exitPending["path"] !== pendingBinding["path"] || exitPending["sha256"] !== pendingBinding["sha256"] || exitPending["status"] !== "pending_exit") throw new Error("Final transition exit receipt does not bind its pending transition.");
  if (validateDigest(value["replacementEvidenceInventorySha256"], "replacement evidence inventory digest") !== sha256Canonical(baseline.value["entries"])) throw new Error("Final transition evidence inventory digest is stale.");
  validateGenerator(recordValue(value["generator"], "final transition generator"));
  return value;
}

export {
  issueExit as issueK0rExit,
  verifyExit as verifyK0rExit,
  verifyPending as verifyK0rPending,
  finalizeTransition as finalizeK0rTransition,
  verifyFinalTransition as verifyK0rTransition
};

export function validateK0rTask1ScopeProvenance(payload: JsonRecord, provenance: JsonRecord, payloadRawSha256: string): ProvenanceIdentity {
  const identity = k0rCanonical.validateK0rRequestBoundApprovalProvenance(provenance, {
    requestPayload: payload,
    requestPayloadRawSha256: payloadRawSha256,
    requestPayloadJcsSha256: sha256Canonical(payload),
  });
  return { ...identity, key: `request-bound:${identity.sessionId}:${identity.requestEventId}:${identity.responseEventId}`, timestamp: identity.responseTimestamp };
}

function validateScopeAuthorization(payload: FileValue, provenance: FileValue, pending: FileValue): void {
  const value = payload.value;
  exactKeys(value, ["authorizedScope", "evidenceOutputPaths", "planSha256", "priorEvidenceInventorySha256", "priorExitStateSha256", "prohibitedAuthorities", "replacementHeadCommit", "replacementHeadTree", "schemaVersion", "trackedOverlayPaths"], "scope authorization");
  assertExactK0rEvidenceOutputPaths(stringArray(value["evidenceOutputPaths"], "scope evidence outputs"));
  if (value["schemaVersion"] !== "boulder.k0r.scope-authorization.v1" || value["authorizedScope"] !== "full_preexisting_k0r_drift_plus_guide_package_delta" || !equalStrings(stringArray(value["prohibitedAuthorities"], "scope prohibitions"), prohibitedAuthorities) || !equalStrings(stringArray(value["trackedOverlayPaths"], "scope overlay"), trackedOverlayPaths)) throw new Error("Scope authorization expands or changes authority.");
  if (decoder.decode(payload.bytes) !== `${canonicalize(value)}\n`) throw new Error("Scope authorization must be exact JCS+LF generated bytes.");
  for (const key of ["planSha256", "priorEvidenceInventorySha256", "priorExitStateSha256"] as const) validateDigest(value[key], `scope ${key}`);
  nonEmpty(value["replacementHeadCommit"], "scope HEAD commit");
  nonEmpty(value["replacementHeadTree"], "scope HEAD tree");
  const pendingScope = recordValue(pending.value["scopeAuthorization"], "pending scope binding");
  const identity = validateK0rTask1ScopeProvenance(value, provenance.value, payload.sha256);
  if (identity.key === "") throw new Error("Scope authorization provenance is unauthenticated.");
  if (pendingScope["payloadRawSha256"] !== payload.sha256 || pendingScope["payloadJcsSha256"] !== sha256Canonical(value) || pendingScope["provenanceSha256"] !== provenance.sha256) throw new Error("Pending transition scope binding is stale.");
}

function validateAttestation(value: unknown, role: "architect-attestation" | "critic-attestation", review: FileValue, reviewProvenance: FileValue, maintainer: FileValue, maintainerProvenance: FileValue): JsonRecord {
  const attestation = recordValue(value, `${role} payload`);
  exactKeys(attestation, ["maintainerPayloadSha256", "maintainerProvenanceSha256", "originalReviewPath", "originalReviewProvenanceSha256", "originalReviewSha256", "reviewerIdentity", "role", "schemaVersion", "verdict"], `${role} payload`);
  if (attestation["schemaVersion"] !== "boulder.k0r.approval-attestation.v1" || attestation["role"] !== role || attestation["verdict"] !== "confirmed" || attestation["originalReviewPath"] !== storedPath(review.path) || attestation["originalReviewSha256"] !== review.sha256 || attestation["originalReviewProvenanceSha256"] !== reviewProvenance.sha256 || attestation["maintainerPayloadSha256"] !== maintainer.sha256 || attestation["maintainerProvenanceSha256"] !== maintainerProvenance.sha256) throw new Error(`${role} is stale or does not confirm the exact approval bindings.`);
  nonEmpty(attestation["reviewerIdentity"], `${role} reviewer identity`);
  return attestation;
}

async function verifyTrackedFreezeAndGit(privateRoot: string, pending: JsonRecord, scope: JsonRecord): Promise<void> {
  const freeze = await readJsonFile(join(privateRoot, "protected/tracked-freeze.json"));
  if (freeze.sha256 !== pending["trackedFreezeSha256"]) throw new Error("Tracked-freeze digest changed.");
  exactKeys(freeze.value, ["entries", "headCommit", "headTree", "overlayMerkleRoot", "overlayPaths", "receiptSha256", "schemaVersion"], "tracked freeze");
  if (freeze.value["schemaVersion"] !== "boulder.k0r.tracked-freeze.v1" || !equalStrings(stringArray(freeze.value["overlayPaths"], "frozen overlay paths"), trackedOverlayPaths) || freeze.value["headCommit"] !== scope["replacementHeadCommit"] || freeze.value["headTree"] !== scope["replacementHeadTree"]) throw new Error("Tracked freeze is not bound to scope authorization and exact overlays.");
  const withoutReceipt: JsonRecord = { ...freeze.value };
  delete withoutReceipt["receiptSha256"];
  if (freeze.value["receiptSha256"] !== sha256Canonical(withoutReceipt)) throw new Error("Tracked-freeze receipt digest is invalid.");
  const entries = recordArray(freeze.value["entries"], "tracked freeze entries");
  if (entries.length !== trackedOverlayPaths.length) throw new Error("Tracked freeze entry set is incomplete.");
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? {};
    exactKeys(entry, ["mode", "path", "sha256", "size"], "tracked freeze entry");
    const path = trackedOverlayPaths[index];
    const live = await readBoundedRegularSnapshot(resolve(repositoryRoot, path ?? ""), maxJsonBytes);
    if (entry["path"] !== path || entry["mode"] !== "100644" || (live.mode & 0o777) !== 0o644 || entry["size"] !== live.size || entry["sha256"] !== sha256Bytes(live.bytes)) throw new Error("A tracked frozen file changed.");
  }
  const git = await readCurrentGitIdentity();
  validateCurrentGitIdentity(git, { headCommit: stringValue(freeze.value["headCommit"], "frozen HEAD"), headTree: stringValue(freeze.value["headTree"], "frozen tree") });
}

async function readCurrentGitIdentity(): Promise<{ readonly objectFormat: string; readonly headCommit: string; readonly commitType: string; readonly headTree: string; readonly treeType: string }> {
  const objectFormat = await runGit(["git", "rev-parse", "--show-object-format"]);
  const headCommit = await runGit(["git", "rev-parse", "--verify", "HEAD^{commit}"]);
  const commit = oneLine(headCommit, "HEAD commit");
  const commitType = await runGit(["git", "cat-file", "-t", commit]);
  const headTree = await runGit(["git", "rev-parse", "--verify", `${commit}^{tree}`]);
  const treeType = await runGit(["git", "cat-file", "-t", oneLine(headTree, "HEAD tree")]);
  return { objectFormat, headCommit, commitType, headTree, treeType };
}

async function runGit(argv: readonly string[]): Promise<string> {
  const result = recordValue(await k0rCanonical.runBoundedK0rProcess({ argv, cwd: repositoryRoot, environment: { GIT_NO_REPLACE_OBJECTS: "1", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: "/usr/bin:/bin" }, deadlineMs: 30_000, stdoutCapBytes: 4096, stderrCapBytes: 4096 }), "bounded Git result");
  if (result["exitCode"] !== 0 || result["timedOut"] === true || result["stdoutOverflow"] === true || result["stderrOverflow"] === true || result["orphanProcess"] === true) throw new Error("Bounded Git identity command failed.");
  const stdout = result["stdout"];
  if (typeof stdout === "string") return stdout;
  if (stdout instanceof Uint8Array) return decoder.decode(stdout);
  throw new Error("Bounded Git identity command returned invalid stdout.");
}

function validatePendingEvidence(pending: FileValue, isolated: FileValue, evidence: JsonRecord, checks: JsonRecord): void {
  if (isolated.value["schemaVersion"] !== "boulder.k0r.isolated-run-receipt.v1" || isolated.value["status"] !== "pass_pending_exact_byte_review") throw new Error("Isolated evidence is not in the reviewed pending state.");
  if (evidence["schemaVersion"] !== "boulder.k0r.evidence-manifest.v2" || evidence["status"] !== "evidence_collected_pending_review") throw new Error("Evidence manifest is not in the reviewed pending state.");
  exactKeys(checks, ["isolatedRunReceipt", "pendingTransition", "receiptSha256", "schemaVersion", "status"], "pending checks");
  if (checks["schemaVersion"] !== "boulder.k0r.pending-checks.v1" || checks["status"] !== "pass_pending_exact_byte_review") throw new Error("Pending checks did not pass the exact-byte-review state.");
  const isolatedBinding = recordValue(checks["isolatedRunReceipt"], "pending checks isolated binding");
  const pendingBinding = recordValue(checks["pendingTransition"], "pending checks transition binding");
  validateReceiptBinding(isolatedBinding, [], exitReceiptPath.replace("k0r-exit-receipt.json", "isolated-run-receipt.json"));
  validateReceiptBinding(pendingBinding, [], "protected/k0r-transition.pending.json");
  if (isolatedBinding["sha256"] !== isolated.sha256 || pendingBinding["sha256"] !== pending.sha256) throw new Error("Pending checks byte bindings are stale.");
  const projection: JsonRecord = { ...checks };
  delete projection["receiptSha256"];
  if (checks["receiptSha256"] !== sha256Canonical(projection)) throw new Error("Pending checks self digest is invalid.");
}

export function validatePriorExit(value: JsonRecord): void {
  exactKeys(value, ["exitReceiptPath", "manifestBindings", "manifestBindingsSha256", "receiptSha256", "schemaVersion", "snapshotEntry", "state"], "prior exit state");
  if (value["schemaVersion"] !== "boulder.k0r.prior-exit-state.v1" || value["state"] !== "absent_not_issued" || value["exitReceiptPath"] !== exitReceiptPath || value["snapshotEntry"] !== null) throw new Error("Prior exit state is not exact absence authority.");
  const bindings = recordArray(value["manifestBindings"], "prior exit bindings");
  if (bindings.length !== 5 || value["manifestBindingsSha256"] !== sha256Canonical(bindings)) throw new Error("Prior not-issued bindings are incomplete.");
  const expected = [
    ["evidence/k0r/acceptance-manifest.json", "/evidenceBinding/exitReceipt", "not_issued"],
    ["evidence/k0r/acceptance-manifest.json", "/requiredApprovals/3/status", "not_issued"],
    ["evidence/k0r/evidence-manifest.json", "/reviews/exitReceipt/status", "not_issued"],
    ["evidence/k0r/isolation-manifest.json", "/evidenceBinding/exitReceipt", "not_issued"],
    ["evidence/k0r/isolation-manifest.json", "/reviews/exitReceipt/status", "not_issued"],
  ] as const;
  const sourceDigests = new Map<string, string>();
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["fileSha256", "path", "pointer", "value"], "prior exit binding");
    const [path, pointer, expectedValue] = expected[index]!;
    const fileSha256 = validateDigest(binding["fileSha256"], "prior exit source digest");
    if (
      binding["path"] !== path
      || binding["pointer"] !== pointer
      || binding["value"] !== expectedValue
    ) throw new Error("Prior exit binding does not match the exact not-issued contract.");
    const previous = sourceDigests.get(path);
    if (previous !== undefined && previous !== fileSha256) {
      throw new Error("Prior exit bindings disagree on their source digest.");
    }
    sourceDigests.set(path, fileSha256);
  }
  const withoutReceipt: JsonRecord = { ...value };
  delete withoutReceipt["receiptSha256"];
  if (value["receiptSha256"] !== sha256Canonical(withoutReceipt)) throw new Error("Prior exit-state semantic digest is invalid.");
}

async function verifyPriorExitSources(value: JsonRecord, privateRoot: string, expectedCurrentExit?: FileValue): Promise<void> {
  validatePriorExit(value);
  try {
    const currentPath = resolve(repositoryRoot, exitReceiptPath);
    await lstat(currentPath);
    if (expectedCurrentExit === undefined || expectedCurrentExit.path !== currentPath || (await readJsonFile(currentPath)).sha256 !== expectedCurrentExit.sha256) throw new Error("Prior exit receipt is unexpectedly present.");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const documents = new Map<string, JsonRecord>();
  for (const binding of recordArray(value["manifestBindings"], "prior exit bindings")) {
    const path = stringValue(binding["path"], "prior exit binding path");
    let document = documents.get(path);
    if (document === undefined) {
      const bytes = await readBoundedRegularFile(
        join(privateRoot, "protected/prior-k0r", path.split("/").at(-1) ?? ""),
        maxJsonBytes,
      );
      if (sha256Bytes(bytes) !== binding["fileSha256"]) {
        throw new Error(`Prior exit source digest changed: ${path}.`);
      }
      const text = decoder.decode(bytes);
      rejectDuplicateJsonKeys(text);
      document = recordValue(JSON.parse(text), `prior exit source ${path}`);
      documents.set(path, document);
    }
    let current: unknown = document;
    for (const token of stringValue(binding["pointer"], "prior exit pointer").slice(1).split("/")) {
      if (current === null || typeof current !== "object") {
        throw new Error(`Prior exit binding pointer is missing: ${path}.`);
      }
      const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
      current = Array.isArray(current)
        ? current[Number.parseInt(key, 10)]
        : (current as JsonRecord)[key];
    }
    if (current !== binding["value"]) {
      throw new Error(`Prior exit binding value changed: ${path}.`);
    }
  }
}

function assertExactReviewedPathSet(inputs: readonly ReviewedInput[], privateRoot: string): void {
  const expected = [...trackedOverlayPaths, "evidence/k0r/approval-provenance.json", ...reconciledEvidencePaths,
    "evidence/k0r/isolated-run-receipt.json", "evidence/k0r/evidence-manifest.json",
    join(privateRoot, "protected/prior-exit-state.json"), join(privateRoot, "authorizations/k0r-a.json"), join(privateRoot, "authorizations/k0r-a.provenance.json"),
    join(privateRoot, "protected/baseline.initial.json"), join(privateRoot, "protected/k0r-transition.pending.json"), join(privateRoot, "receipts/package-final.json"), join(privateRoot, "receipts/k0r-pending-checks.json"),
    join(privateRoot, "qa/browser-report.json"), join(privateRoot, "qa/mobile-390x844.png"), join(privateRoot, "qa/desktop-1440x1000.png")].sort(compareUtf8);
  if (!equalStrings(inputs.map((entry) => entry.path), expected)) throw new Error("Reviewed-input manifest does not contain the exact Task 9 input set.");
}

async function verifyReviewedInputBytes(inputs: readonly ReviewedInput[], privateRoot: string): Promise<void> {
  for (const input of inputs) {
    const path = resolveReviewedPath(input.path, privateRoot);
    const snapshot = await readBoundedRegularSnapshot(path, maxJsonBytes);
    if (sha256Bytes(snapshot.bytes) !== input.sha256) throw new Error(`Reviewed input changed: ${input.path}.`);
  }
}

function reviewedInputs(value: unknown, label: string): ReviewedInput[] {
  return recordArray(value, label).map((entry) => {
    exactKeys(entry, ["path", "sha256"], label);
    return { path: stringValue(entry["path"], `${label} path`), sha256: validateDigest(entry["sha256"], `${label} digest`) };
  });
}

function assertSortedUniqueInputs(inputs: readonly ReviewedInput[], label: string): void {
  if (inputs.some((entry, index) => index > 0 && compareUtf8(inputs[index - 1]?.path ?? "", entry.path) >= 0)) throw new Error(`${label} must be UTF-8 sorted and duplicate-free.`);
}

function validateTypedBinding(value: JsonRecord): void {
  exactKeys(value, ["artifactSha256", "equivalentSourceTreeSha256", "externalReadOnly", "packageJsonSha256", "path", "sha256", "sourcePathSha256", "sourceTreeSha256"], "TypeScript binding");
  if (value["path"] !== "receipts/typescript-binding.json" || value["externalReadOnly"] !== true) throw new Error("TypeScript binding is not external read-only.");
  for (const key of Object.keys(value).filter((key) => key.endsWith("Sha256") || key === "sha256")) validateDigest(value[key], `TypeScript ${key}`);
}

function validateReceiptBinding(value: JsonRecord, extraDigestKeys: readonly string[], expectedPath: string): void {
  exactKeys(value, ["path", "sha256", ...extraDigestKeys], expectedPath);
  if (value["path"] !== expectedPath) throw new Error(`${expectedPath} binding path is invalid.`);
  for (const key of ["sha256", ...extraDigestKeys]) validateDigest(value[key], `${expectedPath} ${key}`);
}

function validatePathDigestStatus(value: JsonRecord, status: string, label: string): void {
  exactKeys(value, ["path", "sha256", "status"], label);
  nonEmpty(value["path"], `${label} path`);
  validateDigest(value["sha256"], `${label} digest`);
  if (value["status"] !== status) throw new Error(`${label} status is invalid.`);
}

function validateGenerator(value: JsonRecord): void {
  exactKeys(value, ["argv", "cwd", "stderrSha256", "stdoutSha256"], "generator");
  const argv = stringArray(value["argv"], "generator argv");
  if (argv.length === 0 || argv.some((part) => part === "")) throw new Error("Generator argv is invalid.");
  nonEmpty(value["cwd"], "generator cwd");
  validateDigest(value["stdoutSha256"], "generator stdout digest");
  validateDigest(value["stderrSha256"], "generator stderr digest");
}

function validateTaskRecord(value: JsonRecord): void {
  exactKeys(value, ["device", "inode", "mode", "pathSha256", "sha256", "size", "uid"], "task record");
  validateDigest(value["pathSha256"], "task-record path digest");
  validateDigest(value["sha256"], "task-record digest");
  for (const key of ["device", "inode", "size", "uid"] as const) if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0) throw new Error(`Task-record ${key} is invalid.`);
  nonEmpty(value["mode"], "task-record mode");
}

function validateCompletionEvent(value: JsonRecord): void {
  exactKeys(value, ["lineNumber", "lineSha256", "prefixBytesSha256"], "completion event");
  if (!Number.isSafeInteger(value["lineNumber"]) || (value["lineNumber"] as number) < 1) throw new Error("Completion-event line number is invalid.");
  validateDigest(value["lineSha256"], "completion-event line digest");
  validateDigest(value["prefixBytesSha256"], "completion-event prefix digest");
}

function validateTranscript(value: JsonRecord): void {
  exactKeys(value, ["device", "inode", "mode", "prefixBytesSha256", "realpathSha256", "uid"], "user transcript");
  for (const key of ["prefixBytesSha256", "realpathSha256"] as const) validateDigest(value[key], `transcript ${key}`);
  for (const key of ["device", "inode", "uid"] as const) if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0) throw new Error(`Transcript ${key} is invalid.`);
  nonEmpty(value["mode"], "transcript mode");
}

async function readJsonFile(path: string): Promise<FileValue> {
  const bytes = await readBoundedRegularFile(path, maxJsonBytes);
  const text = decoder.decode(bytes);
  rejectDuplicateJsonKeys(text);
  const parsed: unknown = JSON.parse(text);
  return { path: resolve(path), bytes, sha256: sha256Bytes(bytes), value: recordValue(parsed, path) };
}

async function digestFile(path: string): Promise<string> {
  return sha256Bytes(await readBoundedRegularFile(path, maxJsonBytes));
}

async function readBoundedRegularFile(path: string, cap: number): Promise<Uint8Array> {
  return (await readBoundedRegularSnapshot(path, cap)).bytes;
}

async function readBoundedRegularSnapshot(path: string, cap: number): Promise<FileIdentitySnapshot> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > cap) throw new Error(`Input is not a bounded single-link regular file: ${path}.`);
  const handle = await open(path, fsConstants.O_RDONLY | noFollowFlag);
  try {
    const current = await handle.stat() as Awaited<ReturnType<typeof handle.stat>> & { readonly uid: number };
    if (!current.isFile() || current.nlink !== 1 || current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size || current.size > cap) throw new Error(`Input identity changed while opening: ${path}.`);
    const bytes = new Uint8Array(current.size);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (result.bytesRead === 0) throw new Error(`Input ended early: ${path}.`);
      offset += result.bytesRead;
    }
    const probe = new Uint8Array(1);
    if ((await handle.read(probe, 0, 1, offset)).bytesRead !== 0) throw new Error(`Input exceeded its verified size: ${path}.`);
    const after = await handle.stat() as Awaited<ReturnType<typeof handle.stat>> & { readonly uid: number };
    const live = await lstat(path) as Awaited<ReturnType<typeof lstat>> & { readonly uid: number };
    const physical = await realpath(path);
    if (after.dev !== current.dev || after.ino !== current.ino || after.size !== current.size || after.nlink !== 1 || after.mode !== current.mode || after.uid !== current.uid || live.dev !== current.dev || live.ino !== current.ino || live.size !== current.size || live.mode !== current.mode || live.uid !== current.uid || physical !== resolve(path)) throw new Error(`Input changed while reading: ${path}.`);
    return {
      bytes,
      dev: current.dev,
      ino: current.ino,
      uid: current.uid,
      mode: current.mode,
      size: current.size,
      realpath: physical,
    };
  } finally { await handle.close(); }
}

function assertSameSnapshot(before: FileIdentitySnapshot, after: FileIdentitySnapshot, label: string): void {
  if (before.dev !== after.dev || before.ino !== after.ino || before.uid !== after.uid || before.mode !== after.mode || before.size !== after.size || before.realpath !== after.realpath || sha256Bytes(before.bytes) !== sha256Bytes(after.bytes)) throw new Error(`${label} changed during authentication.`);
}

async function atomicCreateCanonical(path: string, allowedRoot: string, value: unknown, mode: number): Promise<void> {
  const root = await realpath(allowedRoot);
  const destination = resolve(path);
  assertContained(root, destination, "output");
  const parent = await realpath(dirname(destination));
  assertContained(root, parent, "output parent");
  const existing = await lstat(destination).catch((error: unknown) => isEnoent(error) ? undefined : Promise.reject(error));
  if (existing !== undefined) throw new Error(`Output already exists: ${destination}.`);
  const temporary = join(parent, `.${destination.split("/").pop() ?? "k0r"}.${randomUUID()}.tmp`);
  const handle = await open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollowFlag, mode);
  try {
    await handle.writeFile(`${canonicalize(value)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    await rename(temporary, destination);
    const parentHandle = await open(parent, fsConstants.O_RDONLY | directoryFlagValue | noFollowFlag);
    try { await parentHandle.sync(); } finally { await parentHandle.close(); }
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export function rejectDuplicateJsonKeys(text: string): void {
  let index = 0;
  const whitespace = (): void => { while (index < text.length && /[\t\n\r ]/.test(text[index] ?? "")) index += 1; };
  const stringToken = (): string => {
    const start = index;
    if (text[index++] !== '"') throw new Error("JSON string is malformed.");
    while (index < text.length) {
      const char = text[index++];
      if (char === '"') return JSON.parse(text.slice(start, index)) as string;
      if (char === "\\") {
        const escaped = text[index++];
        if (escaped === "u") index += 4;
      }
    }
    throw new Error("JSON string is unterminated.");
  };
  const value = (): void => {
    whitespace();
    const char = text[index];
    if (char === "{") {
      index += 1; whitespace(); const keys = new Set<string>();
      if (text[index] === "}") { index += 1; return; }
      while (true) {
        whitespace(); const key = stringToken();
        if (keys.has(key)) throw new Error(`JSON object contains duplicate key: ${key}.`);
        keys.add(key); whitespace(); if (text[index++] !== ":") throw new Error("JSON object is malformed.");
        value(); whitespace(); const separator = text[index++];
        if (separator === "}") return;
        if (separator !== ",") throw new Error("JSON object is malformed.");
      }
    }
    if (char === "[") {
      index += 1; whitespace(); if (text[index] === "]") { index += 1; return; }
      while (true) { value(); whitespace(); const separator = text[index++]; if (separator === "]") return; if (separator !== ",") throw new Error("JSON array is malformed."); }
    }
    if (char === '"') { stringToken(); return; }
    const match = text.slice(index).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (match === null) throw new Error("JSON value is malformed.");
    index += match[0].length;
  };
  value(); whitespace();
  if (index !== text.length) throw new Error("JSON has trailing non-whitespace bytes.");
}

function canonicalize(value: unknown): string {
  type Canonicalizer = (input: unknown) => string;
  const candidate = Reflect.get(k0rCanonical, "canonicalizeK0rJson");
  if (typeof candidate !== "function") throw new Error("The promoted tracked canonicalizer is unavailable.");
  return (candidate as Canonicalizer)(value);
}

function sha256Canonical(value: unknown): string { return sha256Bytes(encoder.encode(canonicalize(value))); }
function sha256Bytes(bytes: Uint8Array): string { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function equalCanonical(left: unknown, right: unknown): boolean { return canonicalize(left) === canonicalize(right); }
function equalStrings(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function compareUtf8(left: string, right: string): number {
  const leftBytes = encoder.encode(left.normalize("NFC"));
  const rightBytes = encoder.encode(right.normalize("NFC"));
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftBytes[index] ?? 0) - (rightBytes[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}
function oneLine(value: string, label: string): string { if (!value.endsWith("\n") || value.endsWith("\n\n")) throw new Error(`${label} must have exactly one terminal LF.`); const line = value.slice(0, -1); if (line === "" || /\s/.test(line)) throw new Error(`${label} contains invalid whitespace.`); return line; }
function validateDigest(value: unknown, label: string): string { const digest = stringValue(value, label); if (!digestPattern.test(digest)) throw new Error(`${label} is not a SHA-256 digest.`); return digest; }
function nonEmpty(value: unknown, label: string): string { const text = stringValue(value, label); if (text === "") throw new Error(`${label} is empty.`); return text; }
function stringValue(value: unknown, label: string): string { if (typeof value !== "string") throw new Error(`${label} must be a string.`); return value; }
function stringArray(value: unknown, label: string): string[] { if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`${label} must be a string array.`); return value; }
function recordValue(value: unknown, label: string): JsonRecord { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`); return value as JsonRecord; }
function recordArray(value: unknown, label: string): JsonRecord[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array.`); return value.map((item, index) => recordValue(item, `${label}[${index}]`)); }
function exactKeys(value: JsonRecord, expected: readonly string[], label: string): void { const keys = Object.keys(value).sort(); const required = [...expected].sort(); if (!equalStrings(keys, required)) throw new Error(`${label} has unknown or missing keys.`); }
function isEnoent(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"; }

function resolveReviewedPath(path: string, privateRoot: string): string {
  if (isAbsolute(path)) { assertPrivatePath(path, privateRoot); return resolve(path); }
  assertRepositoryPath(path);
  return resolve(repositoryRoot, path);
}

function assertInputContained(path: string, privateRoot: string): void {
  const absolute = resolve(path);
  if (absolute === resolve(repositoryRoot, exitReceiptPath)) return;
  if (absolute === repositoryRoot || !relative(repositoryRoot, absolute).startsWith("..")) return;
  assertPrivatePath(absolute, privateRoot);
}
function assertPrivatePath(path: string, privateRoot: string): void { assertContained(resolve(privateRoot), resolve(path), "private path"); }
function assertRepositoryPath(path: string): void { if (isAbsolute(path) || path === "" || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..") || path.normalize("NFC") !== path) throw new Error("Repository path is not normalized and relative."); }
function assertContained(root: string, path: string, label: string): void { const relation = relative(root, path); if (relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))) return; throw new Error(`${label} escapes its allowed root.`); }
async function inferPrivateRoot(path: string): Promise<string> {
  const absolute = await realpath(resolve(path));
  const protectedDirectory = dirname(absolute);
  if (protectedDirectory.split("/").pop() !== "protected") throw new Error("A transition path must be directly below the private protected directory.");
  const root = dirname(protectedDirectory);
  const state = await lstat(root);
  if (!state.isDirectory() || state.isSymbolicLink()) throw new Error("Private root is unsafe.");
  return root;
}
function storedPath(path: string): string { const absolute = resolve(path); const repoRelation = relative(repositoryRoot, absolute); if (repoRelation !== "" && !repoRelation.startsWith("..") && !isAbsolute(repoRelation)) return repoRelation.replaceAll("\\", "/"); const protectedIndex = absolute.lastIndexOf("/protected/"); const reviewsIndex = absolute.lastIndexOf("/reviews/"); const identitiesIndex = absolute.lastIndexOf("/identities/"); const receiptsIndex = absolute.lastIndexOf("/receipts/"); const authorizationsIndex = absolute.lastIndexOf("/authorizations/"); const index = Math.max(protectedIndex, reviewsIndex, identitiesIndex, receiptsIndex, authorizationsIndex); if (index < 0) throw new Error("Cannot store a path outside repository or private artifact roots."); return absolute.slice(index + 1); }
function resolveStoredPath(path: string, privateRoot: string): string { assertRepositoryPath(path); return path.startsWith("evidence/") || path.startsWith("test/") || path.startsWith("docs/") || path.startsWith("fixtures/") ? resolve(repositoryRoot, path) : resolve(privateRoot, path); }

if (Bun.argv[1] !== undefined && resolve(Bun.argv[1]) === resolve(join(import.meta.dir, "k0r-issue-exit.ts"))) {
  try {
    const command = parseK0rIssueExitArgv(Bun.argv.slice(2));
    let result: JsonRecord;
    if (command.mode === "write") result = await issueExit(command.values);
    else if (command.mode === "verify") result = await verifyExit(command.receipt, await realpath(command.privateRoot), command.implementerProvenance, command.reviewedInputsManifest);
    else if (command.mode === "verify-pending") result = await verifyPending(command.pendingTransition, await realpath(command.privateRoot));
    else if (command.mode === "finalize-transition") result = await finalizeTransition(command);
    else result = await verifyFinalTransition(command.transition);
    console.log(canonicalize({ schemaVersion: result["schemaVersion"], status: result["status"] ?? "verified" }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
