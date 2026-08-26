import { planningDigest, type PlanningValidationIssue, type PlanningValidationResult } from "./planning-canonical.js";

export type CommonExecutorPhase = "preflight-passed" | "started" | "terminated" | "verified" | "finalized";
export type CommonExecutorTerminationKind = "exit" | "signal" | "timeout" | "cancelled" | "approval-cycle";

export interface CommonExecutorTermination {
  readonly kind: CommonExecutorTerminationKind;
  readonly exitCode?: number;
  readonly signal?: string;
  readonly timeoutAt?: string;
  readonly cancelledAt?: string;
  readonly approvalCycleDigest?: string;
  readonly stdoutDigest: string;
  readonly stderrDigest: string;
}

export interface CommonExecutorVerification {
  readonly test: {
    readonly outcome: "passed" | "failed";
    readonly digest: string;
  };
  readonly typecheck: {
    readonly outcome: "passed" | "failed";
    readonly digest: string;
  };
  readonly artifactDigests: readonly string[];
}

export interface CommonExecutorSignatureEnvelope {
  readonly algorithm: "Ed25519";
  readonly keyId: string;
  readonly signature: string;
}

export interface CommonExecutorEvent {
  readonly schemaVersion: "boulder.common-executor-event.v1";
  readonly runId: string;
  readonly sequence: number;
  readonly phase: CommonExecutorPhase;
  readonly timestamp: string;
  readonly previousEventDigest: string | null;
  readonly command: string;
  readonly cwd: string;
  readonly budgetSeconds: number;
  readonly preflightDigest?: string;
  readonly termination?: CommonExecutorTermination;
  readonly verification?: CommonExecutorVerification;
  readonly eventDigest: string;
}

export interface CommonExecutorEventInput {
  readonly schemaVersion?: "boulder.common-executor-event.v1";
  readonly runId: string;
  readonly sequence?: number;
  readonly phase: CommonExecutorPhase;
  readonly timestamp: string;
  readonly previousEventDigest?: string | null;
  readonly command: string;
  readonly cwd: string;
  readonly budgetSeconds: number;
  readonly preflightDigest?: string;
  readonly termination?: CommonExecutorTermination;
  readonly verification?: CommonExecutorVerification;
  readonly eventDigest?: string;
}

export interface CommonExecutorLifecycle {
  readonly schemaVersion: "boulder.common-executor-lifecycle.v1";
  readonly runId: string;
  readonly command: string;
  readonly cwd: string;
  readonly budgetSeconds: number;
  readonly events: readonly CommonExecutorEvent[];
  readonly headEventDigest: string;
  readonly lifecycleDigest: string;
}

export interface CommonExecutorLifecycleInput {
  readonly schemaVersion?: "boulder.common-executor-lifecycle.v1";
  readonly runId: string;
  readonly command: string;
  readonly cwd: string;
  readonly budgetSeconds: number;
  readonly events?: readonly CommonExecutorEvent[];
  readonly headEventDigest?: string;
  readonly lifecycleDigest?: string;
}

export interface CommonExecutorFinalReceipt {
  readonly schemaVersion: "boulder.common-executor-final-receipt.v2";
  readonly runId: string;
  readonly command: string;
  readonly cwd: string;
  readonly budgetSeconds: number;
  readonly lifecycleDigest: string;
  readonly headEventDigest: string;
  readonly finalizedAt: string;
  readonly termination: CommonExecutorTermination;
  readonly verification: CommonExecutorVerification;
  readonly receiptDigest: string;
  readonly signature: CommonExecutorSignatureEnvelope;
}
export type CommonExecutorFinalReceiptSigningPayload = Omit<CommonExecutorFinalReceipt, "signature">;

export function commonExecutorFinalReceiptSigningPayload(
  value: CommonExecutorFinalReceipt
): CommonExecutorFinalReceiptSigningPayload {
  const { signature: _signature, ...payload } = value;
  return payload;
}
const phases: readonly CommonExecutorPhase[] = ["preflight-passed", "started", "terminated", "verified", "finalized"];
const digest = /^sha256:[a-f0-9]{64}$/;

export function transitionCommonExecutorLifecycle(
  lifecycle: CommonExecutorLifecycleInput,
  input: CommonExecutorEventInput
): PlanningValidationResult<CommonExecutorLifecycle> {
  const issues: PlanningValidationIssue[] = [];
  const currentEvents = lifecycle.events ?? [];
  const base = lifecycleBase(lifecycle, issues);
  if (!base) return invalid(issues);
  if (!Array.isArray(currentEvents)) return invalid([issue("$.events", "events must be an array.")]);
  if (lifecycle.schemaVersion !== undefined && lifecycle.schemaVersion !== "boulder.common-executor-lifecycle.v1") issues.push(issue("$.schemaVersion", "Lifecycle schemaVersion is invalid."));
  if (currentEvents.length === 0 && (lifecycle.headEventDigest !== undefined || lifecycle.lifecycleDigest !== undefined)) issues.push(issue("$", "Empty lifecycle cannot claim a head or digest."));
  if (currentEvents.length > 0) {
    const headEventDigest = currentEvents[currentEvents.length - 1]!.eventDigest;
    if (lifecycle.headEventDigest !== undefined && lifecycle.headEventDigest !== headEventDigest) issues.push(issue("$.headEventDigest", "headEventDigest must match the final event."));
    if (lifecycle.lifecycleDigest !== undefined) {
      const prior = {
        schemaVersion: "boulder.common-executor-lifecycle.v1" as const,
        ...base,
        events: currentEvents,
        headEventDigest,
        lifecycleDigest: lifecycle.lifecycleDigest
      };
      if (lifecycle.lifecycleDigest !== canonicalLifecycleDigest(prior)) issues.push(issue("$.lifecycleDigest", "lifecycleDigest does not match canonical content."));
    }
  }
  for (let index = 0; index < currentEvents.length; index += 1) validateEvent(currentEvents[index], base, currentEvents, index, issues);
  if (issues.length > 0) return invalid(issues);

  const expectedIndex = currentEvents.length;
  const event: CommonExecutorEvent = {
    schemaVersion: input.schemaVersion ?? "boulder.common-executor-event.v1",
    runId: input.runId,
    sequence: input.sequence ?? expectedIndex,
    phase: input.phase,
    timestamp: input.timestamp,
    previousEventDigest: input.previousEventDigest ?? (expectedIndex === 0 ? null : currentEvents[expectedIndex - 1]!.eventDigest),
    command: input.command,
    cwd: input.cwd,
    budgetSeconds: input.budgetSeconds,
    ...(input.preflightDigest === undefined ? {} : { preflightDigest: input.preflightDigest }),
    ...(input.termination === undefined ? {} : { termination: input.termination }),
    ...(input.verification === undefined ? {} : { verification: input.verification }),
    eventDigest: input.eventDigest ?? ""
  };
  const computedEventDigest = canonicalEventDigest(event);
  const normalizedEvent = { ...event, eventDigest: input.eventDigest ?? computedEventDigest };
  validateEvent(normalizedEvent, base, [...currentEvents, normalizedEvent], expectedIndex, issues);
  if (issues.length > 0) return invalid(issues);

  const events = [...currentEvents, normalizedEvent];
  const partial: CommonExecutorLifecycle = {
    schemaVersion: "boulder.common-executor-lifecycle.v1",
    ...base,
    events,
    headEventDigest: normalizedEvent.eventDigest,
    lifecycleDigest: ""
  };
  const value = { ...partial, lifecycleDigest: canonicalLifecycleDigest(partial) };
  return { valid: true, value, issues: [] };
}

export function validateCommonExecutorLifecycle(value: unknown): PlanningValidationResult<CommonExecutorLifecycle> {
  try {
    return validateCommonExecutorLifecycleUnchecked(value);
  } catch {
    return invalid([issue("$", "Lifecycle validation could not process the supplied value.")]);
  }
}

function validateCommonExecutorLifecycleUnchecked(value: unknown): PlanningValidationResult<CommonExecutorLifecycle> {
  const issues: PlanningValidationIssue[] = [];
  if (!isRecord(value)) return invalid([issue("$", "Lifecycle must be an object.")]);
  rejectUnknown(value, lifecycleKeys, "$", issues);
  if (value.schemaVersion !== "boulder.common-executor-lifecycle.v1") issues.push(issue("$.schemaVersion", "Lifecycle schemaVersion is invalid."));
  const base = lifecycleBase(value, issues);
  if (!base || !Array.isArray(value.events)) {
    if (!Array.isArray(value.events)) issues.push(issue("$.events", "events must be an array."));
    return invalid(issues);
  }
  if (value.events.length !== phases.length) issues.push(issue("$.events", "Lifecycle must contain every phase exactly once."));
  for (let index = 0; index < value.events.length; index += 1) validateEvent(value.events[index], base, value.events, index, issues);
  const events = value.events.map(readEvent);
  if (events.some((event) => event === undefined)) return invalid([...issues, issue("$.events", "Events must be structurally valid.")]);
  const normalizedEvents = events.filter((event): event is CommonExecutorEvent => event !== undefined);
  const head = normalizedEvents[normalizedEvents.length - 1]?.eventDigest;
  const headEventDigest = value.headEventDigest;
  const lifecycleDigest = value.lifecycleDigest;
  if (!digestValue(headEventDigest) || headEventDigest !== head) issues.push(issue("$.headEventDigest", "headEventDigest must match the final event."));
  if (!digestValue(lifecycleDigest) || lifecycleDigest !== canonicalLifecycleDigest(value)) issues.push(issue("$.lifecycleDigest", "lifecycleDigest does not match canonical content."));
  if (issues.length > 0 || !digestValue(headEventDigest) || !digestValue(lifecycleDigest)) return invalid(issues);
  return {
    valid: true,
    value: {
      schemaVersion: "boulder.common-executor-lifecycle.v1",
      runId: base.runId,
      command: base.command,
      cwd: base.cwd,
      budgetSeconds: base.budgetSeconds,
      events: normalizedEvents,
      headEventDigest,
      lifecycleDigest
    },
    issues
  };
}

export function validateCommonExecutorFinalReceipt(
  value: unknown,
  lifecycle: unknown
): PlanningValidationResult<CommonExecutorFinalReceipt> {
  try {
    return validateCommonExecutorFinalReceiptUnchecked(value, lifecycle);
  } catch {
    return invalid([issue("$", "Final receipt validation could not process the supplied value.")]);
  }
}

function validateCommonExecutorFinalReceiptUnchecked(
  value: unknown,
  lifecycle: unknown
): PlanningValidationResult<CommonExecutorFinalReceipt> {
  const issues: PlanningValidationIssue[] = [];
  const lifecycleValidation = validateCommonExecutorLifecycle(lifecycle);
  if (!lifecycleValidation.valid || !lifecycleValidation.value) {
    issues.push(issue("$.lifecycle", "Final receipt requires a valid finalized lifecycle."));
    return invalid(issues);
  }
  const current = lifecycleValidation.value;
  if (!isRecord(value)) return invalid([issue("$", "Final receipt must be an object.")]);
  rejectUnknown(value, finalReceiptKeys, "$", issues);
  if (value.schemaVersion !== "boulder.common-executor-final-receipt.v2") issues.push(issue("$.schemaVersion", "Final receipt schemaVersion is invalid."));
  if (value.runId !== current.runId) issues.push(issue("$.runId", "runId must match lifecycle."));
  if (value.command !== current.command || value.cwd !== current.cwd || value.budgetSeconds !== current.budgetSeconds) issues.push(issue("$.bindings", "command, cwd, and budgetSeconds must match lifecycle."));
  if (value.lifecycleDigest !== current.lifecycleDigest || value.headEventDigest !== current.headEventDigest) issues.push(issue("$.headEventDigest", "Receipt must bind the lifecycle head and digest."));
  const finalized = current.events[phases.length - 1]!;
  const terminated = current.events[2]!;
  const verified = current.events[3]!;
  if (value.finalizedAt !== finalized.timestamp) issues.push(issue("$.finalizedAt", "finalizedAt must match the finalized event."));
  validateTermination(value.termination, "$.termination", issues);
  validateVerification(value.verification, "$.verification", issues);
  if (!sameCanonical(value.termination, terminated.termination)) issues.push(issue("$.termination", "Termination facts must match lifecycle and cannot be inferred."));
  if (!sameCanonical(value.verification, verified.verification)) issues.push(issue("$.verification", "Verification facts must match lifecycle and cannot be inferred."));
  if (!isSignature(value.signature)) issues.push(issue("$.signature", "Signature envelope must be structurally valid."));
  if (!digestValue(value.receiptDigest) || value.receiptDigest !== canonicalFinalReceiptDigest(value)) issues.push(issue("$.receiptDigest", "receiptDigest does not match canonical content."));
  if (issues.length > 0) return invalid(issues);
  const receipt = readFinalReceipt(value);
  if (!receipt) return invalid([issue("$", "Final receipt must be structurally valid.")]);
  return { valid: true, value: receipt, issues };
}

function lifecycleBase(value: unknown, issues: PlanningValidationIssue[]): Pick<CommonExecutorLifecycle, "runId" | "command" | "cwd" | "budgetSeconds"> | undefined {
  if (!isRecord(value)) {
    issues.push(issue("$", "Lifecycle must be an object."));
    return undefined;
  }
  const runId = value.runId;
  const command = value.command;
  const cwd = value.cwd;
  const budgetSeconds = value.budgetSeconds;
  if (!nonEmpty(runId)) issues.push(issue("$.runId", "runId is required."));
  if (!nonEmpty(command)) issues.push(issue("$.command", "command is required."));
  if (!nonEmpty(cwd)) issues.push(issue("$.cwd", "cwd is required."));
  if (!nonNegativeFinite(budgetSeconds)) issues.push(issue("$.budgetSeconds", "budgetSeconds must be a finite non-negative number."));
  if (issues.length > 0 || !nonEmpty(runId) || !nonEmpty(command) || !nonEmpty(cwd) || !nonNegativeFinite(budgetSeconds)) return undefined;
  return { runId, command, cwd, budgetSeconds };
}

function validateEvent(value: unknown, lifecycle: Pick<CommonExecutorLifecycle, "runId" | "command" | "cwd" | "budgetSeconds">, events: readonly unknown[], index: number, issues: PlanningValidationIssue[]): void {
  const path = `$.events[${index}]`;
  if (!isRecord(value)) {
    issues.push(issue(path, "Event must be an object."));
    return;
  }
  rejectUnknown(value, eventKeys, path, issues);
  if (value.schemaVersion !== "boulder.common-executor-event.v1") issues.push(issue(`${path}.schemaVersion`, "Event schemaVersion is invalid."));
  if (value.runId !== lifecycle.runId || value.command !== lifecycle.command || value.cwd !== lifecycle.cwd || value.budgetSeconds !== lifecycle.budgetSeconds) issues.push(issue(`${path}.bindings`, "Event bindings must match lifecycle."));
  if (value.sequence !== index) issues.push(issue(`${path}.sequence`, "Event sequence must be contiguous and zero-based."));
  if (value.phase !== phases[index]) issues.push(issue(`${path}.phase`, "Event phase is skipped or reordered."));
  if (!utc(value.timestamp)) issues.push(issue(`${path}.timestamp`, "timestamp must be UTC ISO-8601."));
  if (index === 0) {
    if (value.previousEventDigest !== null) issues.push(issue(`${path}.previousEventDigest`, "First event must not have a predecessor."));
  } else {
    const previous = events[index - 1];
    if (!isRecord(previous) || value.previousEventDigest !== previous.eventDigest) issues.push(issue(`${path}.previousEventDigest`, "previousEventDigest must match the preceding event."));
    if (isRecord(previous) && utc(value.timestamp) && utc(previous.timestamp) && Date.parse(value.timestamp) <= Date.parse(previous.timestamp)) issues.push(issue(`${path}.timestamp`, "Event timestamps must increase monotonically."));
  }
  if (!digestValue(value.eventDigest) || value.eventDigest !== canonicalEventDigest(value)) issues.push(issue(`${path}.eventDigest`, "eventDigest does not match canonical content."));
  if (value.phase === "preflight-passed") {
    if (!digestValue(value.preflightDigest) || value.termination !== undefined || value.verification !== undefined) issues.push(issue(path, "Preflight event requires only preflightDigest."));
  } else if (value.phase === "terminated") {
    if (value.preflightDigest !== undefined || value.verification !== undefined) issues.push(issue(path, "Terminated event cannot contain other phase facts."));
    validateTermination(value.termination, `${path}.termination`, issues);
  } else if (value.phase === "verified") {
    if (value.preflightDigest !== undefined || value.termination !== undefined) issues.push(issue(path, "Verified event cannot contain other phase facts."));
    validateVerification(value.verification, `${path}.verification`, issues);
  } else if (value.preflightDigest !== undefined || value.termination !== undefined || value.verification !== undefined) {
    issues.push(issue(path, "This event cannot contain phase facts."));
  }
}


function validateTermination(value: unknown, path: string, issues: PlanningValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push(issue(path, "Termination evidence is required."));
    return;
  }
  rejectUnknown(value, terminationKeys, path, issues);
  if (!["exit", "signal", "timeout", "cancelled", "approval-cycle"].includes(value.kind as string)) issues.push(issue(`${path}.kind`, "Termination kind is invalid."));
  if (!digestValue(value.stdoutDigest) || !digestValue(value.stderrDigest)) issues.push(issue(path, "stdoutDigest and stderrDigest are required."));
  const facts = [value.exitCode, value.signal, value.timeoutAt, value.cancelledAt, value.approvalCycleDigest];
  const present = facts.filter((fact) => fact !== undefined).length;
  if (present !== 1) issues.push(issue(path, "Termination must record exactly one non-null terminal fact."));
  if (value.kind === "exit" && (!Number.isInteger(value.exitCode) || value.signal !== undefined || value.timeoutAt !== undefined || value.cancelledAt !== undefined || value.approvalCycleDigest !== undefined)) issues.push(issue(path, "Exit termination requires only an integer exitCode."));
  if (value.kind === "signal" && (!nonEmpty(value.signal) || value.exitCode !== undefined || value.timeoutAt !== undefined || value.cancelledAt !== undefined || value.approvalCycleDigest !== undefined)) issues.push(issue(path, "Signal termination requires only a signal."));
  if (value.kind === "timeout" && (!utc(value.timeoutAt) || value.exitCode !== undefined || value.signal !== undefined || value.cancelledAt !== undefined || value.approvalCycleDigest !== undefined)) issues.push(issue(path, "Timeout termination requires only timeoutAt."));
  if (value.kind === "cancelled" && (!utc(value.cancelledAt) || value.exitCode !== undefined || value.signal !== undefined || value.timeoutAt !== undefined || value.approvalCycleDigest !== undefined)) issues.push(issue(path, "Cancelled termination requires only cancelledAt."));
  if (value.kind === "approval-cycle" && (!digestValue(value.approvalCycleDigest) || value.exitCode !== undefined || value.signal !== undefined || value.timeoutAt !== undefined || value.cancelledAt !== undefined)) issues.push(issue(path, "Approval-cycle termination requires only approvalCycleDigest."));
}

function validateVerification(value: unknown, path: string, issues: PlanningValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push(issue(path, "Verification facts are required."));
    return;
  }
  rejectUnknown(value, verificationKeys, path, issues);
  validateOutcome(value.test, `${path}.test`, issues);
  validateOutcome(value.typecheck, `${path}.typecheck`, issues);
  if (!Array.isArray(value.artifactDigests) || value.artifactDigests.length === 0 || value.artifactDigests.some((entry) => !digestValue(entry))) issues.push(issue(`${path}.artifactDigests`, "artifactDigests must be a non-empty digest array."));
}

function validateOutcome(value: unknown, path: string, issues: PlanningValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push(issue(path, "Verification outcome is required."));
    return;
  }
  rejectUnknown(value, outcomeKeys, path, issues);
  if ((value.outcome !== "passed" && value.outcome !== "failed") || !digestValue(value.digest)) issues.push(issue(path, "Outcome must contain status and digest."));
}
function readEvent(value: unknown): CommonExecutorEvent | undefined {
  if (!isRecord(value)
    || value.schemaVersion !== "boulder.common-executor-event.v1"
    || !nonEmpty(value.runId)
    || !integer(value.sequence)
    || !isPhase(value.phase)
    || !utc(value.timestamp)
    || (value.previousEventDigest !== null && !digestValue(value.previousEventDigest))
    || !nonEmpty(value.command)
    || !nonEmpty(value.cwd)
    || !nonNegativeFinite(value.budgetSeconds)
    || !digestValue(value.eventDigest)) return undefined;
  const preflightDigest = value.preflightDigest;
  const termination = value.termination === undefined ? undefined : readTermination(value.termination);
  const verification = value.verification === undefined ? undefined : readVerification(value.verification);
  if ((preflightDigest !== undefined && !digestValue(preflightDigest))
    || (value.termination !== undefined && !termination)
    || (value.verification !== undefined && !verification)) return undefined;
  return {
    schemaVersion: "boulder.common-executor-event.v1",
    runId: value.runId,
    sequence: value.sequence,
    phase: value.phase,
    timestamp: value.timestamp,
    previousEventDigest: value.previousEventDigest,
    command: value.command,
    cwd: value.cwd,
    budgetSeconds: value.budgetSeconds,
    ...(preflightDigest === undefined ? {} : { preflightDigest }),
    ...(termination === undefined ? {} : { termination }),
    ...(verification === undefined ? {} : { verification }),
    eventDigest: value.eventDigest
  };
}

function readTermination(value: unknown): CommonExecutorTermination | undefined {
  if (!isRecord(value) || !digestValue(value.stdoutDigest) || !digestValue(value.stderrDigest)) return undefined;
  if (value.kind === "exit" && integer(value.exitCode)
    && value.signal === undefined && value.timeoutAt === undefined && value.cancelledAt === undefined && value.approvalCycleDigest === undefined) {
    return { kind: "exit", exitCode: value.exitCode, stdoutDigest: value.stdoutDigest, stderrDigest: value.stderrDigest };
  }
  if (value.kind === "signal" && nonEmpty(value.signal)
    && value.exitCode === undefined && value.timeoutAt === undefined && value.cancelledAt === undefined && value.approvalCycleDigest === undefined) {
    return { kind: "signal", signal: value.signal, stdoutDigest: value.stdoutDigest, stderrDigest: value.stderrDigest };
  }
  if (value.kind === "timeout" && utc(value.timeoutAt)
    && value.exitCode === undefined && value.signal === undefined && value.cancelledAt === undefined && value.approvalCycleDigest === undefined) {
    return { kind: "timeout", timeoutAt: value.timeoutAt, stdoutDigest: value.stdoutDigest, stderrDigest: value.stderrDigest };
  }
  if (value.kind === "cancelled" && utc(value.cancelledAt)
    && value.exitCode === undefined && value.signal === undefined && value.timeoutAt === undefined && value.approvalCycleDigest === undefined) {
    return { kind: "cancelled", cancelledAt: value.cancelledAt, stdoutDigest: value.stdoutDigest, stderrDigest: value.stderrDigest };
  }
  if (value.kind === "approval-cycle" && digestValue(value.approvalCycleDigest)
    && value.exitCode === undefined && value.signal === undefined && value.timeoutAt === undefined && value.cancelledAt === undefined) {
    return { kind: "approval-cycle", approvalCycleDigest: value.approvalCycleDigest, stdoutDigest: value.stdoutDigest, stderrDigest: value.stderrDigest };
  }
  return undefined;
}

function readVerification(value: unknown): CommonExecutorVerification | undefined {
  if (!isRecord(value) || !Array.isArray(value.artifactDigests) || value.artifactDigests.length === 0 || value.artifactDigests.some((entry) => !digestValue(entry))) return undefined;
  const test = readOutcome(value.test);
  const typecheck = readOutcome(value.typecheck);
  if (!test || !typecheck) return undefined;
  return { test, typecheck, artifactDigests: value.artifactDigests };
}

function readOutcome(value: unknown): CommonExecutorVerification["test"] | undefined {
  if (!isRecord(value) || (value.outcome !== "passed" && value.outcome !== "failed") || !digestValue(value.digest)) return undefined;
  return { outcome: value.outcome, digest: value.digest };
}

function readFinalReceipt(value: unknown): CommonExecutorFinalReceipt | undefined {
  if (!isRecord(value)
    || value.schemaVersion !== "boulder.common-executor-final-receipt.v2"
    || !nonEmpty(value.runId)
    || !nonEmpty(value.command)
    || !nonEmpty(value.cwd)
    || !nonNegativeFinite(value.budgetSeconds)
    || !digestValue(value.lifecycleDigest)
    || !digestValue(value.headEventDigest)
    || !utc(value.finalizedAt)
    || !digestValue(value.receiptDigest)
    || !isSignature(value.signature)) return undefined;
  const termination = readTermination(value.termination);
  const verification = readVerification(value.verification);
  if (!termination || !verification) return undefined;
  return {
    schemaVersion: "boulder.common-executor-final-receipt.v2",
    runId: value.runId,
    command: value.command,
    cwd: value.cwd,
    budgetSeconds: value.budgetSeconds,
    lifecycleDigest: value.lifecycleDigest,
    headEventDigest: value.headEventDigest,
    finalizedAt: value.finalizedAt,
    termination,
    verification,
    receiptDigest: value.receiptDigest,
    signature: value.signature
  };
}

function isPhase(value: unknown): value is CommonExecutorPhase {
  return value === "preflight-passed" || value === "started" || value === "terminated" || value === "verified" || value === "finalized";
}

function canonicalEventDigest(value: object): string {
  return canonicalDigestWithout(value, "eventDigest");
}

function canonicalLifecycleDigest(value: object): string {
  return canonicalDigestWithout(value, "lifecycleDigest");
}

function canonicalFinalReceiptDigest(value: object): string {
  return canonicalDigestWithout(value, "receiptDigest", "signature");
}

function canonicalDigestWithout(value: object, ...omittedKeys: readonly string[]): string {
  const unsigned: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!omittedKeys.includes(key)) unsigned[key] = entry;
  }
  return planningDigest(unsigned);
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return planningDigest(left) === planningDigest(right);
}

function isSignature(value: unknown): value is CommonExecutorSignatureEnvelope {
  return isRecord(value) && Object.keys(value).length === 3 && value.algorithm === "Ed25519" && nonEmpty(value.keyId) && nonEmpty(value.signature);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function digestValue(value: unknown): value is string {
  return typeof value === "string" && digest.test(value);
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function nonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function utc(value: unknown): value is string {
  return typeof value === "string" && value.endsWith("Z") && !Number.isNaN(Date.parse(value));
}

function rejectUnknown(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: PlanningValidationIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(issue(`${path}.${key}`, "Unknown field is not allowed."));
  }
}

function issue(path: string, message: string): PlanningValidationIssue {
  return { id: "common-executor.evidence.invalid", path, message };
}

function invalid(issues: readonly PlanningValidationIssue[]): PlanningValidationResult<never> {
  return { valid: false, issues };
}

const lifecycleKeys = ["schemaVersion", "runId", "command", "cwd", "budgetSeconds", "events", "headEventDigest", "lifecycleDigest"];
const eventKeys = ["schemaVersion", "runId", "sequence", "phase", "timestamp", "previousEventDigest", "command", "cwd", "budgetSeconds", "preflightDigest", "termination", "verification", "eventDigest"];
const terminationKeys = ["kind", "exitCode", "signal", "timeoutAt", "cancelledAt", "approvalCycleDigest", "stdoutDigest", "stderrDigest"];
const verificationKeys = ["test", "typecheck", "artifactDigests"];
const outcomeKeys = ["outcome", "digest"];
const finalReceiptKeys = ["schemaVersion", "runId", "command", "cwd", "budgetSeconds", "lifecycleDigest", "headEventDigest", "finalizedAt", "termination", "verification", "receiptDigest", "signature"];
