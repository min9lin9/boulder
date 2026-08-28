import { globMatches } from "./path-glob.js";
import { canonicalizePlanningValue, planningDigest } from "./planning-canonical.js";

export type PlannerScopeAttributionStatus = "passed" | "failed";

export type PlannerScopeAttributionViolationReason =
  | "outside-allowed-paths"
  | "forbidden-path"
  | "protected-path"
  | "external-workspace";
export const externalWorkspaceViolationPath = "$workspace";

export interface PlannerScopeAttributionSignatureEnvelope {
  readonly algorithm: "Ed25519";
  readonly keyId: string;
  readonly signature: string;
}

export interface PlannerScopeAttributionViolation {
  readonly path: string;
  readonly reason: PlannerScopeAttributionViolationReason;
  readonly evidenceDigest: string;
}

export interface PlannerScopeAttributionReceipt {
  readonly schemaVersion: "boulder.planner-scope-attribution-receipt.v1";
  readonly runId: string;
  readonly preflightReceiptDigest: string;
  readonly planningPacketDigest: string;
  readonly executionPacketDigest: string;
  readonly authorizedWorkspaceIdentityDigest: string;
  readonly observedWorkspaceIdentityDigest: string;
  readonly baselineRevision: string;
  readonly patchDigest: string;
  readonly changedPaths: readonly string[];
  readonly status: PlannerScopeAttributionStatus;
  readonly violations: readonly PlannerScopeAttributionViolation[];
  readonly occurredAt: string;
  readonly signature: PlannerScopeAttributionSignatureEnvelope;
}

export interface PlannerScopeAttributionPlanningPacket {
  readonly runId: string;
  readonly packetDigest: string;
  readonly scope: {
    readonly protectedPaths: readonly string[];
  };
}

export interface PlannerScopeAttributionExecutionPacket {
  readonly allowedMutationPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
}

export interface PlannerScopeAttributionContext {
  readonly runId: string;
  readonly planningPacket: PlannerScopeAttributionPlanningPacket;
  readonly executionPacket: PlannerScopeAttributionExecutionPacket;
  readonly preflightReceiptDigest: string;
  readonly workspaceIdentityDigest: string;
  readonly authorizedWorkspaceIdentityDigest?: string;
  readonly observedWorkspaceIdentityDigest?: string;
  readonly baselineRevision: string;
  readonly patchDigest: string;
}

export type PlannerScopeAttributionIssueCode =
  | "plan.scope_attribution.schema_invalid"
  | "plan.scope_attribution.signature_invalid"
  | "plan.scope_attribution.digest_mismatch"
  | "plan.scope_attribution.workspace_mismatch"
  | "plan.scope_attribution.path_invalid"
  | "plan.scope_attribution.scope_violation"
  | "plan.scope_attribution.status_mismatch";

export interface PlannerScopeAttributionIssue {
  readonly code: PlannerScopeAttributionIssueCode;
  readonly path: string;
  readonly message: string;
}

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const schemaVersion = "boulder.planner-scope-attribution-receipt.v1";
const violationReasons = new Set<string>([
  "outside-allowed-paths",
  "forbidden-path",
  "protected-path",
  "external-workspace"
]);

export function derivePlannerScopeStatus(receipt: PlannerScopeAttributionReceipt): PlannerScopeAttributionStatus {
  try {
    return receipt.violations.length === 0 && validDigest(receipt.patchDigest) ? "passed" : "failed";
  } catch {
    return "failed";
  }
}

export function canonicalPlannerScopeAttributionUnsignedPayload(receipt: PlannerScopeAttributionReceipt): string {
  const { signature: _signature, ...payload } = receipt;
  return canonicalizePlanningValue(payload);
}

export function validatePlannerScopeAttributionReceipt(
  value: unknown,
  context: PlannerScopeAttributionContext
): readonly PlannerScopeAttributionIssue[] {
  try {
    const issues: PlannerScopeAttributionIssue[] = [];
    if (!isRecord(value)) return [issue("plan.scope_attribution.schema_invalid", "$", "Scope attribution receipt must be an object.")];

    const receipt = value;
    if (!hasReceiptKeys(receipt)) {
      issues.push(issue("plan.scope_attribution.schema_invalid", "$", "Scope attribution receipt contains unsupported or missing fields."));
    }
    if (receipt.schemaVersion !== schemaVersion) issues.push(issue("plan.scope_attribution.schema_invalid", "$.schemaVersion", "Unsupported scope attribution receipt schema."));
    if (!validRunId(receipt.runId)) issues.push(issue("plan.scope_attribution.schema_invalid", "$.runId", "Run id must be a safe non-empty slug."));
    if (!validIsoTime(receipt.occurredAt)) issues.push(issue("plan.scope_attribution.schema_invalid", "$.occurredAt", "Occurred time must be UTC ISO-8601."));
    if (!signatureShape(receipt.signature)) issues.push(issue("plan.scope_attribution.signature_invalid", "$.signature", "Signature must be a structural Ed25519 envelope with canonical byte length."));

    validateBindings(receipt, context, issues);
    validateChangedPaths(receipt, context, issues);
    validateViolations(receipt, context, issues);
    validateStatus(receipt, issues);
    return issues;
  } catch {
    return [issue("plan.scope_attribution.schema_invalid", "$", "Scope attribution receipt must contain only readable JSON data.")];
  }
}

function validateBindings(
  receipt: Record<string, unknown>,
  context: PlannerScopeAttributionContext,
  issues: PlannerScopeAttributionIssue[]
): void {
  const planningPacketDigest = context.planningPacket.packetDigest;
  const expectedExecutionPacketDigest = planningDigest(context.executionPacket);
  if (!validDigest(receipt.planningPacketDigest)
    || receipt.planningPacketDigest !== planningPacketDigest
    || planningPacketDigest !== planningDigest(context.planningPacket)) {
    issues.push(issue("plan.scope_attribution.digest_mismatch", "$.planningPacketDigest", "Planning packet digest must bind the validated planning packet."));
  }
  if (!validDigest(receipt.executionPacketDigest) || receipt.executionPacketDigest !== expectedExecutionPacketDigest) {
    issues.push(issue("plan.scope_attribution.digest_mismatch", "$.executionPacketDigest", "Execution packet digest must bind the execution packet."));
  }
  if (!validDigest(receipt.preflightReceiptDigest) || receipt.preflightReceiptDigest !== context.preflightReceiptDigest) {
    issues.push(issue("plan.scope_attribution.digest_mismatch", "$.preflightReceiptDigest", "Preflight receipt digest must match the execution context."));
  }
  if (!validDigest(receipt.patchDigest) || receipt.patchDigest !== context.patchDigest) {
    issues.push(issue("plan.scope_attribution.digest_mismatch", "$.patchDigest", "Patch digest must be a non-empty byte-verified digest for the observed patch."));
  }
  if (!validRunId(context.runId) || receipt.runId !== context.runId || context.planningPacket.runId !== context.runId) {
    issues.push(issue("plan.scope_attribution.workspace_mismatch", "$.runId", "Run id must bind the active planning context."));
  }
  const receiptWorkspace = receiptWorkspaceBindings(receipt);
  const contextWorkspace = contextWorkspaceBindings(context);
  if (!receiptWorkspace || !contextWorkspace) {
    issues.push(issue("plan.scope_attribution.workspace_mismatch", "$.workspaceIdentityDigest", "Workspace identity digests must bind authorized and observed workspaces."));
  } else {
    if (!validDigest(receiptWorkspace.authorized) || receiptWorkspace.authorized !== contextWorkspace.authorized) {
      issues.push(issue("plan.scope_attribution.workspace_mismatch", "$.authorizedWorkspaceIdentityDigest", "Authorized workspace identity digest must match the preflight workspace."));
    }
    if (!validDigest(receiptWorkspace.observed) || receiptWorkspace.observed !== contextWorkspace.observed) {
      issues.push(issue("plan.scope_attribution.workspace_mismatch", "$.observedWorkspaceIdentityDigest", "Observed workspace identity digest must match the execution workspace."));
    }
  }
  if (!nonEmptyText(receipt.baselineRevision) || receipt.baselineRevision !== context.baselineRevision) {
    issues.push(issue("plan.scope_attribution.workspace_mismatch", "$.baselineRevision", "Baseline revision must match the preflight workspace."));
  }
}

function validateChangedPaths(
  receipt: Record<string, unknown>,
  context: PlannerScopeAttributionContext,
  issues: PlannerScopeAttributionIssue[]
): void {
  if (!Array.isArray(receipt.changedPaths)) {
    issues.push(issue("plan.scope_attribution.path_invalid", "$.changedPaths", "Changed paths must be a sorted unique array."));
    return;
  }
  const allowed = context.executionPacket.allowedMutationPaths;
  const forbidden = context.executionPacket.forbiddenPaths;
  const protectedPaths = context.planningPacket.scope.protectedPaths;
  if (!validGlobList(allowed, true) || !validGlobList(forbidden) || !validGlobList(protectedPaths)) {
    issues.push(issue("plan.scope_attribution.schema_invalid", "context", "Execution scope patterns must be safe relative POSIX globs."));
    return;
  }
  for (const [index, path] of receipt.changedPaths.entries()) {
    const location = `$.changedPaths[${index}]`;
    if (!safeRelativePosixPath(path) || path === externalWorkspaceViolationPath) {
      issues.push(issue("plan.scope_attribution.path_invalid", location, "Changed path must be a safe workspace-relative POSIX path and not the workspace-level sentinel."));
      continue;
    }
    if (index > 0 && receipt.changedPaths[index - 1]! >= path) {
      issues.push(issue("plan.scope_attribution.path_invalid", location, "Changed paths must be sorted and unique."));
    }
  }
}

function validateViolations(
  receipt: Record<string, unknown>,
  context: PlannerScopeAttributionContext,
  issues: PlannerScopeAttributionIssue[]
): void {
  if (!Array.isArray(receipt.violations)) {
    issues.push(issue("plan.scope_attribution.schema_invalid", "$.violations", "Violations must be an array."));
    return;
  }
  const changedPaths = Array.isArray(receipt.changedPaths)
    ? receipt.changedPaths.filter((path) => safeRelativePosixPath(path) && path !== externalWorkspaceViolationPath)
    : [];
  const expected = expectedViolationKeys(changedPaths, context);
  const workspaceMismatch = hasExternalWorkspaceMismatch(context);
  const observed = new Set<string>();
  let externalWorkspaceViolations = 0;
  for (const [index, value] of receipt.violations.entries()) {
    const location = `$.violations[${index}]`;
    if (!violationShape(value)) {
      issues.push(issue("plan.scope_attribution.schema_invalid", location, "Violation requires a permitted reason, evidence digest, and either a changed path or the canonical external-workspace sentinel."));
      continue;
    }
    const key = violationKey(value.path, value.reason);
    if (observed.has(key)) issues.push(issue("plan.scope_attribution.schema_invalid", location, "Violations must not duplicate a path and reason."));
    observed.add(key);
    if (!externalWorkspaceViolation(value) && !changedPaths.includes(value.path)) {
      issues.push(issue("plan.scope_attribution.scope_violation", location, "Violation must be backed by an observed changed path unless it is the canonical external-workspace violation."));
    }
    if (value.reason === "external-workspace") {
      externalWorkspaceViolations += 1;
      if (!workspaceMismatch) {
        issues.push(issue("plan.scope_attribution.scope_violation", location, "External workspace violation requires a workspace identity mismatch."));
      }
    } else if (!expected.has(key)) {
      issues.push(issue("plan.scope_attribution.scope_violation", location, "Violation reason does not match the observed execution scope."));
    }
  }
  for (const key of expected) {
    if (!observed.has(key)) {
      issues.push(issue("plan.scope_attribution.scope_violation", "$.violations", "Every out-of-scope, forbidden, or protected mutation requires evidence-backed violation attribution."));
    }
  }
  if (workspaceMismatch && externalWorkspaceViolations !== 1) {
    issues.push(issue("plan.scope_attribution.scope_violation", "$.violations", "An observed external workspace requires exactly one evidence-backed external-workspace violation."));
  }
  if (receipt.violations.length > 0 && !receipt.violations.some(violationShape)) {
    issues.push(issue("plan.scope_attribution.schema_invalid", "$.violations", "Failed receipts require at least one evidence-backed violation."));
  }
}

function validateStatus(receipt: Record<string, unknown>, issues: PlannerScopeAttributionIssue[]): void {
  if (receipt.status !== "passed" && receipt.status !== "failed") {
    issues.push(issue("plan.scope_attribution.status_mismatch", "$.status", "Scope attribution status must be passed or failed."));
    return;
  }
  const derived = Array.isArray(receipt.violations)
    && receipt.violations.every(violationShape)
    && receipt.violations.length === 0
    && validDigest(receipt.patchDigest)
    ? "passed"
    : "failed";
  if (receipt.status !== derived) issues.push(issue("plan.scope_attribution.status_mismatch", "$.status", "Status must be derived from violations and the byte-verified patch digest."));
  if (receipt.status === "failed" && (!Array.isArray(receipt.violations) || receipt.violations.length === 0 || !receipt.violations.every(violationShape))) {
    issues.push(issue("plan.scope_attribution.status_mismatch", "$.violations", "Failed status requires at least one evidence-backed violation."));
  }
}

function expectedViolationKeys(paths: readonly string[], context: PlannerScopeAttributionContext): ReadonlySet<string> {
  const expected = new Set<string>();
  for (const path of paths) {
    if (!context.executionPacket.allowedMutationPaths.some((pattern) => globMatches(pattern, path))) expected.add(violationKey(path, "outside-allowed-paths"));
    if (context.executionPacket.forbiddenPaths.some((pattern) => globMatches(pattern, path))) expected.add(violationKey(path, "forbidden-path"));
    if (context.planningPacket.scope.protectedPaths.some((pattern) => globMatches(pattern, path))) expected.add(violationKey(path, "protected-path"));
  }
  return expected;
}

function violationShape(value: unknown): value is PlannerScopeAttributionViolation {
  return isRecord(value)
    && hasExactKeys(value, ["path", "reason", "evidenceDigest"])
    && validViolationReason(value.reason)
    && validDigest(value.evidenceDigest)
    && (value.reason === "external-workspace"
      ? value.path === externalWorkspaceViolationPath
      : safeRelativePosixPath(value.path) && value.path !== externalWorkspaceViolationPath);
}
function externalWorkspaceViolation(value: PlannerScopeAttributionViolation): boolean {
  return value.reason === "external-workspace" && value.path === externalWorkspaceViolationPath;
}
function validViolationReason(value: unknown): value is PlannerScopeAttributionViolationReason {
  return typeof value === "string" && violationReasons.has(value);
}

function signatureShape(value: unknown): value is PlannerScopeAttributionSignatureEnvelope {
  return isRecord(value)
    && hasExactKeys(value, ["algorithm", "keyId", "signature"])
    && value.algorithm === "Ed25519"
    && nonEmptyText(value.keyId)
    && typeof value.signature === "string"
    && /^[A-Za-z0-9_-]{85}[AEIMQUYcgkosw048]$/.test(value.signature);
}

function safeRelativePosixPath(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && !value.startsWith("/")
    && !value.startsWith("\\")
    && !/^[A-Za-z]:/.test(value)
    && !value.includes("\\")
    && value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function validGlobList(value: unknown, requireValue = false): value is readonly string[] {
  return Array.isArray(value) && (!requireValue || value.length > 0) && value.every((pattern) => typeof pattern === "string"
    && safeRelativePosixPath(pattern)
    && pattern.split("/").every((part) => /^[A-Za-z0-9._@+*?\-]+$/.test(part)));
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && digestPattern.test(value);
}

function validRunId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
}

function validIsoTime(value: unknown): value is string {
  return typeof value === "string" && value.endsWith("Z") && !Number.isNaN(Date.parse(value));
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasReceiptKeys(value: Record<string, unknown>): boolean {
  return hasExactKeys(value, [
    "schemaVersion",
    "runId",
    "preflightReceiptDigest",
    "planningPacketDigest",
    "executionPacketDigest",
    "authorizedWorkspaceIdentityDigest",
    "observedWorkspaceIdentityDigest",
    "baselineRevision",
    "patchDigest",
    "changedPaths",
    "status",
    "violations",
    "occurredAt",
    "signature"
  ]) || hasExactKeys(value, [
    "schemaVersion",
    "runId",
    "preflightReceiptDigest",
    "planningPacketDigest",
    "executionPacketDigest",
    "workspaceIdentityDigest",
    "baselineRevision",
    "patchDigest",
    "changedPaths",
    "status",
    "violations",
    "occurredAt",
    "signature"
  ]);
}

function receiptWorkspaceBindings(value: Record<string, unknown>): { readonly authorized: unknown; readonly observed: unknown } | undefined {
  if (typeof value.authorizedWorkspaceIdentityDigest === "string" || typeof value.observedWorkspaceIdentityDigest === "string") {
    return {
      authorized: value.authorizedWorkspaceIdentityDigest,
      observed: value.observedWorkspaceIdentityDigest
    };
  }
  if (typeof value.workspaceIdentityDigest === "string") {
    return { authorized: value.workspaceIdentityDigest, observed: value.workspaceIdentityDigest };
  }
  return undefined;
}

function contextWorkspaceBindings(context: PlannerScopeAttributionContext): { readonly authorized: string; readonly observed: string } | undefined {
  const authorized = context.authorizedWorkspaceIdentityDigest ?? context.workspaceIdentityDigest;
  const observed = context.observedWorkspaceIdentityDigest ?? authorized;
  if (!validDigest(authorized) || !validDigest(observed) || context.authorizedWorkspaceIdentityDigest !== undefined && context.authorizedWorkspaceIdentityDigest !== context.workspaceIdentityDigest) return undefined;
  return { authorized, observed };
}

function hasExternalWorkspaceMismatch(context: PlannerScopeAttributionContext): boolean {
  const bindings = contextWorkspaceBindings(context);
  return bindings !== undefined && bindings.authorized !== bindings.observed;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function violationKey(path: string, reason: PlannerScopeAttributionViolationReason): string {
  return `${path}\u0000${reason}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(code: PlannerScopeAttributionIssueCode, path: string, message: string): PlannerScopeAttributionIssue {
  return { code, path, message };
}
