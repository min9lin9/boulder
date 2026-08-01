import { canonicalizePlanningValue, sha256Digest } from "./planning-canonical.js";
import type { PlanningValidationIssue } from "./critic-review.js";

export type ApprovalPurpose = "plan" | "execution";
export type ChallengeStatus = "pending" | "consumed" | "invalidated";

export type PlanApprovalBindings = {
  readonly packetDigest: string;
  readonly structuralReviewDigest: string;
  readonly semanticReviewDigest: string;
  readonly sourceDigest: string;
};

export type ExecutionApprovalBindings = {
  readonly planningPacketDigest: string;
  readonly planApprovalDigest: string;
  readonly executionPacketDigest: string;
  readonly sourceDigest: string;
};

export type PlanApprovalChallenge = {
  readonly schemaVersion: "boulder.plan-approval-challenge.v1";
  readonly runId: string;
  readonly purpose: "plan";
  readonly createdAt: string;
  readonly challengeId: string;
  readonly challengeDigest: string;
  readonly status: ChallengeStatus;
  readonly nonce: string;
  readonly codeHash: string;
  readonly keyVersion: string;
  readonly issuedBy: string;
  readonly challengeMac?: string;
  readonly bindings: PlanApprovalBindings;
};

export type ExecutionApprovalChallenge = {
  readonly schemaVersion: "boulder.execution-approval-challenge.v1";
  readonly runId: string;
  readonly purpose: "execution";
  readonly createdAt: string;
  readonly challengeId: string;
  readonly challengeDigest: string;
  readonly status: ChallengeStatus;
  readonly nonce: string;
  readonly codeHash: string;
  readonly keyVersion: string;
  readonly issuedBy: string;
  readonly challengeMac?: string;
  readonly bindings: ExecutionApprovalBindings;
};

export type PendingApprovalChallenge = PlanApprovalChallenge | ExecutionApprovalChallenge;

export type PlanApprovalReceipt = {
  readonly schemaVersion: "boulder.plan-approval.v1";
  readonly runId: string;
  readonly purpose: "plan";
  readonly challengeDigest: string;
  readonly nonce: string;
  readonly codeHash: string;
  readonly keyVersion: string;
  readonly bindings: PlanApprovalBindings;
  readonly approvedAt: string;
  readonly approvalScope: "plan-only";
  readonly signaturePurpose: "boulder.plan.approval.v1";
  readonly signature: string;
};

export type ExecutionApprovalReceipt = {
  readonly schemaVersion: "boulder.execution-approval.v1";
  readonly runId: string;
  readonly purpose: "execution";
  readonly challengeDigest: string;
  readonly nonce: string;
  readonly codeHash: string;
  readonly keyVersion: string;
  readonly bindings: ExecutionApprovalBindings;
  readonly approvedAt: string;
  readonly approvalScope: "execution-only";
  readonly signaturePurpose: "boulder.execution.approval.v1";
  readonly signature: string;
};

export type ApprovalChallengeHistory = {
  readonly schemaVersion: "boulder.approval-challenge-history.v1";
  readonly previousChallenge: PendingApprovalChallenge;
  readonly previousStatus: "pending";
  readonly status: "consumed" | "invalidated";
  readonly transitionedAt: string;
  readonly invalidationReason?: "binding-changed" | "key-rotated" | "explicit" | "replaced";
  readonly immutable: true;
};

export type ChallengeBinding = {
  readonly runId: string;
  readonly purpose: ApprovalPurpose;
  readonly keyVersion: string;
  readonly bindings: PlanApprovalBindings | ExecutionApprovalBindings;
};

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const HEX = /^[a-f0-9]{64}$/;
export const PLAN_CHALLENGE_HMAC_DOMAIN = "boulder.plan.challenge.v1";
export const PLAN_APPROVAL_HMAC_DOMAIN = "boulder.plan.approval.v1";
export const EXECUTION_CHALLENGE_HMAC_DOMAIN = "boulder.execution.challenge.v1";
export const EXECUTION_APPROVAL_HMAC_DOMAIN = "boulder.execution.approval.v1";

export type ApprovalHmacDomain =
  | typeof PLAN_CHALLENGE_HMAC_DOMAIN
  | typeof PLAN_APPROVAL_HMAC_DOMAIN
  | typeof EXECUTION_CHALLENGE_HMAC_DOMAIN
  | typeof EXECUTION_APPROVAL_HMAC_DOMAIN;

export function canonicalCodeHash(purpose: ApprovalPurpose, runId: string, nonce: string, code: unknown): string {
  if ((purpose !== "plan" && purpose !== "execution") || !safeId(runId) || !safeId(nonce)) {
    throw new TypeError("Invalid approval code binding.");
  }
  return sha256Digest(canonicalizePlanningValue({ domain: approvalCodeHashDomain(purpose), runId, nonce, code }));
}

export function canonicalChallengeSigningPayload(challenge: unknown): string {
  const value = signingRecord(challenge, "challenge");
  const { challengeMac: _challengeMac, ...signedChallenge } = value;
  return canonicalSigningPayload(challengeHmacDomain(value.purpose), signedChallenge);
}

export function canonicalApprovalSigningPayload(receipt: unknown): string {
  const value = signingRecord(receipt, "approval");
  const { signature: _signature, ...signedReceipt } = value;
  return canonicalSigningPayload(approvalHmacDomain(value.purpose), signedReceipt);
}

export function validatePendingApprovalChallenge(value: unknown): readonly PlanningValidationIssue[] {
  if (!isRecord(value)) return [issue("plan.approval.challenge_invalid", "$", "Approval challenge must be an object.")];
  const purpose = value.purpose;
  if (purpose !== "plan" && purpose !== "execution") {
    return [issue("plan.approval.challenge_invalid", "purpose", "Challenge purpose must be plan or execution.")];
  }
  const expectedSchema = purpose === "plan" ? "boulder.plan-approval-challenge.v1" : "boulder.execution-approval-challenge.v1";
  const issues = validateChallengeEnvelope(value, expectedSchema);
  if (!isRecord(value.bindings) || !validBindings(purpose, value.bindings)) {
    issues.push(issue("plan.approval.challenge_invalid", "bindings", "Challenge authority bindings are invalid."));
  }
  if ("expiresAt" in value || "expiresIn" in value) {
    issues.push(issue("plan.approval.challenge_invalid", "expiresAt", "Preview-v1 challenges do not expire by wall clock."));
  }
  if (issues.length === 0 && value.challengeDigest !== canonicalChallengeDigest(value)) {
    issues.push(issue("plan.approval.challenge_invalid", "challengeDigest", "Challenge digest does not match canonical content."));
  }
  return issues;
}

export function validatePlanApprovalReceipt(value: unknown): readonly PlanningValidationIssue[] {
  return validateReceipt(value, "plan");
}

export function validateExecutionApprovalReceipt(value: unknown): readonly PlanningValidationIssue[] {
  return validateReceipt(value, "execution");
}

export function validateApprovalChallengeHistory(value: unknown): readonly PlanningValidationIssue[] {
  if (!isRecord(value)) return [issue("plan.approval.challenge_history_invalid", "$", "Challenge history must be an object.")];
  const issues: PlanningValidationIssue[] = [];
  check(value.schemaVersion === "boulder.approval-challenge-history.v1", issues, "schemaVersion");
  check(isRecord(value.previousChallenge), issues, "previousChallenge");
  if (isRecord(value.previousChallenge)) {
    for (const challengeIssue of validatePendingApprovalChallenge(value.previousChallenge)) {
      issues.push({ ...challengeIssue, id: "plan.approval.challenge_history_invalid", path: `previousChallenge.${challengeIssue.path}` });
    }
    check(value.previousChallenge.status === "pending", issues, "previousChallenge.status");
  }
  check(value.previousStatus === "pending", issues, "previousStatus");
  check(value.status === "consumed" || value.status === "invalidated", issues, "status");
  check(utc(value.transitionedAt), issues, "transitionedAt");
  if (value.status === "invalidated") {
    check(value.invalidationReason === "binding-changed" || value.invalidationReason === "key-rotated" || value.invalidationReason === "explicit" || value.invalidationReason === "replaced", issues, "invalidationReason");
  } else {
    check(value.invalidationReason === undefined, issues, "invalidationReason");
  }
  check(value.immutable === true, issues, "immutable");
  return issues;
}

export function challengeConsumptionIssues(challenge: PendingApprovalChallenge, binding: ChallengeBinding): readonly PlanningValidationIssue[] {
  const issues: PlanningValidationIssue[] = [];
  if (challenge.status === "consumed") issues.push(issue("plan.approval.challenge_consumed", "status", "Challenge has already been consumed."));
  else if (challenge.status !== "pending") issues.push(issue("plan.approval.challenge_stale", "status", "Challenge is no longer current."));
  if (challenge.runId !== binding.runId || challenge.purpose !== binding.purpose || challenge.keyVersion !== binding.keyVersion) {
    issues.push(issue("plan.approval.challenge_stale", "binding", "Challenge does not match the current authority binding."));
  }
  if (!sameBindings(challenge.bindings, binding.bindings)) {
    issues.push(issue("plan.approval.challenge_stale", "bindings", "Challenge bindings are stale."));
  }
  return issues;
}

export function receiptMatchesChallenge(
  receipt: PlanApprovalReceipt | ExecutionApprovalReceipt,
  challenge: PendingApprovalChallenge
): boolean {
  return receipt.runId === challenge.runId
    && receipt.purpose === challenge.purpose
    && receipt.challengeDigest === challenge.challengeDigest
    && receipt.nonce === challenge.nonce
    && receipt.codeHash === challenge.codeHash
    && receipt.keyVersion === challenge.keyVersion
    && sameBindings(receipt.bindings, challenge.bindings);
}
export function finalReceiptChallengeIssues(
  receipt: PlanApprovalReceipt | ExecutionApprovalReceipt,
  currentChallenge: PendingApprovalChallenge
): readonly PlanningValidationIssue[] {
  const issues: PlanningValidationIssue[] = [];
  if (currentChallenge.status !== "consumed") {
    issues.push(issue("plan.approval.challenge_not_consumed", "challenge.status", "Final approval receipt requires a consumed current challenge."));
  }
  if (!receiptMatchesChallenge(receipt, currentChallenge)) {
    issues.push(issue("plan.approval.receipt_challenge_mismatch", "receipt", "Final approval receipt does not match the current challenge."));
  }
  return issues;
}


function validateChallengeEnvelope(value: Record<string, unknown>, expectedSchema: string): PlanningValidationIssue[] {
  const issues: PlanningValidationIssue[] = [];
  check(value.schemaVersion === expectedSchema, issues, "schemaVersion");
  check(safeId(value.runId), issues, "runId");
  check(utc(value.createdAt), issues, "createdAt");
  check(safeId(value.challengeId), issues, "challengeId");
  check(digest(value.challengeDigest), issues, "challengeDigest");
  check(value.status === "pending" || value.status === "consumed" || value.status === "invalidated", issues, "status");
  check(safeId(value.nonce), issues, "nonce");
  check(digest(value.codeHash), issues, "codeHash");
  check(safeId(value.keyVersion), issues, "keyVersion");
  check(nonEmpty(value.issuedBy), issues, "issuedBy");
  check(value.challengeMac === undefined || (typeof value.challengeMac === "string" && HEX.test(value.challengeMac)), issues, "challengeMac");
  return issues;
}

function validateReceipt(value: unknown, purpose: ApprovalPurpose): readonly PlanningValidationIssue[] {
  if (!isRecord(value)) return [issue("plan.packet.invalid", "$", "Approval receipt must be an object.")];
  const issues: PlanningValidationIssue[] = [];
  const execution = purpose === "execution";
  check(value.schemaVersion === (execution ? "boulder.execution-approval.v1" : "boulder.plan-approval.v1"), issues, "schemaVersion");
  check(value.purpose === purpose, issues, "purpose");
  check(safeId(value.runId), issues, "runId");
  check(digest(value.challengeDigest), issues, "challengeDigest");
  check(safeId(value.nonce), issues, "nonce");
  check(digest(value.codeHash), issues, "codeHash");
  check(safeId(value.keyVersion), issues, "keyVersion");
  check(isRecord(value.bindings) && validBindings(purpose, value.bindings), issues, "bindings");
  check(utc(value.approvedAt), issues, "approvedAt");
  check(value.approvalScope === (execution ? "execution-only" : "plan-only"), issues, "approvalScope");
  check(value.signaturePurpose === (execution ? "boulder.execution.approval.v1" : "boulder.plan.approval.v1"), issues, "signaturePurpose");
  check(typeof value.signature === "string" && HEX.test(value.signature), issues, "signature");
  return issues;
}

function validBindings(purpose: ApprovalPurpose, value: Record<string, unknown>): boolean {
  const keys = purpose === "plan"
    ? ["packetDigest", "structuralReviewDigest", "semanticReviewDigest", "sourceDigest"]
    : ["planningPacketDigest", "planApprovalDigest", "executionPacketDigest", "sourceDigest"];
  return Object.keys(value).length === keys.length && keys.every((key) => digest(value[key]));
}

function sameBindings(left: PlanApprovalBindings | ExecutionApprovalBindings, right: PlanApprovalBindings | ExecutionApprovalBindings): boolean {
  const leftEntries = Object.entries(left).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  const rightEntries = Object.entries(right).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([key, value], index) => key === rightEntries[index]?.[0] && value === rightEntries[index]?.[1]);
}

function check(condition: boolean, issues: PlanningValidationIssue[], path: string): void {
  if (!condition) issues.push(issue("plan.approval.challenge_invalid", path, `Invalid ${path}.`));
}

function issue(id: string, path: string, message: string): PlanningValidationIssue {
  return { id, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

function utc(value: unknown): value is string {
  return typeof value === "string" && /Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function canonicalChallengeDigest(challenge: Record<string, unknown>): string {
  const { challengeDigest: _challengeDigest, challengeMac: _challengeMac, status: _status, ...digestInput } = challenge;
  return sha256Digest(canonicalizePlanningValue({ ...digestInput, status: "pending" }));
}

export function createApprovalChallengeDigest(challenge: Omit<PendingApprovalChallenge, "challengeDigest">): string {
  return canonicalChallengeDigest(challenge as unknown as Record<string, unknown>);
}
function canonicalSigningPayload(domain: ApprovalHmacDomain, value: Record<string, unknown>): string {
  return canonicalizePlanningValue({ domain, payload: value });
}

function signingRecord(value: unknown, kind: "challenge" | "approval"): Record<string, unknown> & { readonly purpose: ApprovalPurpose } {
  if (!isRecord(value) || (value.purpose !== "plan" && value.purpose !== "execution") || !isRecord(value.bindings) || !validBindings(value.purpose, value.bindings)) {
    throw new TypeError(`Invalid ${kind} signing bindings.`);
  }
  if (kind === "approval" && typeof value.signaturePurpose !== "string") {
    throw new TypeError("Invalid approval signing payload.");
  }
  return value as Record<string, unknown> & { readonly purpose: ApprovalPurpose };
}

function challengeHmacDomain(purpose: ApprovalPurpose): ApprovalHmacDomain {
  return purpose === "plan" ? PLAN_CHALLENGE_HMAC_DOMAIN : EXECUTION_CHALLENGE_HMAC_DOMAIN;
}

function approvalHmacDomain(purpose: ApprovalPurpose): ApprovalHmacDomain {
  return purpose === "plan" ? PLAN_APPROVAL_HMAC_DOMAIN : EXECUTION_APPROVAL_HMAC_DOMAIN;
}
function approvalCodeHashDomain(purpose: ApprovalPurpose): string {
  return purpose === "plan" ? "boulder.plan.approval-code.v1" : "boulder.execution.approval-code.v1";
}
