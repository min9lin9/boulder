import {
  type ApprovalChallengeHistory,
  type ApprovalPurpose,
  type ExecutionApprovalReceipt,
  type PendingApprovalChallenge,
  type PlanApprovalReceipt,
  receiptMatchesChallenge,
  validateApprovalChallengeHistory,
  validateExecutionApprovalReceipt,
  validatePendingApprovalChallenge,
  validatePlanApprovalReceipt
} from "./plan-receipts.js";
import { planningDigest } from "./planning-canonical.js";

export const MAX_PLAN_SEMANTIC_REVISIONS = 3;

export type PlanRunStatus =
  | "created"
  | "analyzed"
  | "awaiting-input"
  | "ready-to-draft"
  | "drafted"
  | "reviewing"
  | "revising"
  | "awaiting-plan-approval"
  | "approved"
  | "awaiting-execution-approval"
  | "execution-approved"
  | "execution-packet-ready"
  | "handed-off"
  | "stopped";

export type PlanAuthorityState = {
  readonly packetDigest?: string;
  readonly structuralReviewDigest?: string;
  readonly semanticReviewDigest?: string;
  readonly planApprovalDigest?: string;
  readonly executionPacketDigest?: string;
  readonly executionApprovalDigest?: string;
  readonly planApprovalReceipt?: PlanApprovalReceipt;
  readonly executionApprovalReceipt?: ExecutionApprovalReceipt;
};

export type PlanRunState = {
  readonly schemaVersion: "boulder.plan-run-state.v1";
  readonly runId: string;
  readonly status: PlanRunStatus;
  readonly stateRevision: number;
  readonly semanticRevision: number;
  readonly sourceDigest: string;
  readonly authority: PlanAuthorityState;
  readonly currentChallenges: Partial<Record<ApprovalPurpose, PendingApprovalChallenge>>;
  readonly challengeHistory: readonly ApprovalChallengeHistory[];
  readonly lastTransitionDigest?: string;
  readonly lastTransitionInputDigest?: string;
  readonly sourceDrift: boolean;
};

export type PlanStateTransition = {
  readonly expectedRevision: number;
  readonly status: PlanRunStatus;
  readonly digest: string;
  readonly sourceDigest?: string;
  readonly authority?: PlanAuthorityState;
  readonly semanticRevision?: number;
  readonly approvalReceipt?: PlanApprovalReceipt | ExecutionApprovalReceipt;
};

export class PlanStateError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PlanStateError";
    this.code = code;
  }
}

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const transitions: Readonly<Record<PlanRunStatus, readonly PlanRunStatus[]>> = {
  created: ["analyzed", "stopped"],
  analyzed: ["awaiting-input", "ready-to-draft", "stopped"],
  "awaiting-input": ["analyzed", "ready-to-draft", "stopped"],
  "ready-to-draft": ["drafted", "stopped"],
  drafted: ["reviewing", "stopped"],
  reviewing: ["reviewing", "revising", "awaiting-plan-approval", "stopped"],
  revising: ["drafted", "stopped"],
  "awaiting-plan-approval": ["approved", "revising", "stopped"],
  approved: ["awaiting-execution-approval", "stopped"],
  "awaiting-execution-approval": ["execution-approved", "stopped"],
  "execution-approved": ["execution-packet-ready", "stopped"],
  "execution-packet-ready": ["handed-off", "stopped"],
  "handed-off": ["stopped"],
  stopped: []
};

export function createPlanRunState(input: {
  readonly runId: string;
  readonly sourceDigest: string;
}): PlanRunState {
  if (!RUN_ID.test(input.runId) || !isDigest(input.sourceDigest)) {
    throw new PlanStateError("plan.state.invalid", "Plan run identity is invalid.");
  }
  return {
    schemaVersion: "boulder.plan-run-state.v1",
    runId: input.runId,
    status: "created",
    stateRevision: 0,
    semanticRevision: 0,
    sourceDigest: input.sourceDigest,
    authority: {},
    currentChallenges: {},
    challengeHistory: [],
    sourceDrift: false
  };
}

export function validatePlanRunState(value: unknown): readonly PlanStateError[] {
  if (!isRecord(value)) return [invalid("Plan state must be an object.")];
  const errors: PlanStateError[] = [];
  if (value.schemaVersion !== "boulder.plan-run-state.v1") errors.push(invalid("Unknown plan state schema."));
  if (typeof value.runId !== "string" || !RUN_ID.test(value.runId)) errors.push(invalid("Plan run ID is invalid."));
  if (typeof value.status !== "string" || !(value.status in transitions)) errors.push(invalid("Plan run status is invalid."));
  if (!integerAtLeast(value.stateRevision, 0) || !integerAtLeast(value.semanticRevision, 0)) errors.push(invalid("Plan revisions are invalid."));
  if (!isDigest(value.sourceDigest) || typeof value.sourceDrift !== "boolean") errors.push(invalid("Plan source state is invalid."));
  if (!validAuthority(value.authority)) errors.push(invalid("Plan authority is invalid."));
  if (!isRecord(value.currentChallenges)) errors.push(invalid("Current approval challenges are invalid."));
  else for (const [purpose, challenge] of Object.entries(value.currentChallenges)) {
    if ((purpose !== "plan" && purpose !== "execution") || validatePendingApprovalChallenge(challenge).length > 0 || ((challenge as PendingApprovalChallenge).status !== "pending" && (challenge as PendingApprovalChallenge).status !== "consumed")) errors.push(invalid("Current approval challenge is invalid."));
  }
  if (!Array.isArray(value.challengeHistory) || value.challengeHistory.some((item) => validateApprovalChallengeHistory(item).length > 0)) errors.push(invalid("Approval challenge history is invalid."));
  if (value.lastTransitionDigest !== undefined && !isDigest(value.lastTransitionDigest)) errors.push(invalid("Transition digest is invalid."));
  if (value.lastTransitionInputDigest !== undefined && !isDigest(value.lastTransitionInputDigest)) errors.push(invalid("Transition input digest is invalid."));
  return errors;
}

export function transitionPlanState(state: PlanRunState, transition: PlanStateTransition): PlanRunState {
  assertValid(state);
  if (!isDigest(transition.digest)) throw invalid("Transition digest is invalid.");
  const transitionInputDigest = planningDigest(transition);
  if (transition.expectedRevision !== state.stateRevision) {
    if (transition.digest === state.lastTransitionDigest
      && transitionInputDigest === state.lastTransitionInputDigest
      && transition.expectedRevision === state.stateRevision - 1) return state;
    throw new PlanStateError("plan.state.revision_conflict", "Expected state revision does not match current state.");
  }
  const authority = transition.status === "revising" ? {} : (transition.authority ?? state.authority);
  if (state.sourceDrift && (transition.status !== "reviewing" || !hasReviewAuthority(authority))) {
    throw new PlanStateError("plan.repo_drift", "Source drift requires a reviewed refresh before continuing.");
  }
  if (!transitions[state.status].includes(transition.status)) throw new PlanStateError("plan.state.transition_invalid", "Plan state transition is not allowed.");
  const semanticRevision = transition.semanticRevision ?? state.semanticRevision;
  if (!integerAtLeast(semanticRevision, state.semanticRevision) || semanticRevision > MAX_PLAN_SEMANTIC_REVISIONS) {
    throw new PlanStateError("plan.review.iteration_limit", "Plan semantic revision exceeds the maximum of three.");
  }
  if (transition.status === "revising" && semanticRevision !== state.semanticRevision + 1) {
    throw new PlanStateError("plan.state.transition_invalid", "Revising requires exactly one semantic revision.");
  }
  if (transition.status === "awaiting-plan-approval" && !hasReviewAuthority(authority)) throw new PlanStateError("plan.review.stale", "Current passing reviews are required.");
  if (transition.status === "approved") requireApproval(state, transition, "plan", authority);
  if (transition.status === "awaiting-execution-approval" && !isDigest(authority.executionPacketDigest)) throw new PlanStateError("plan.approval.stale", "Current execution packet is required.");
  if (transition.status === "execution-approved") requireApproval(state, transition, "execution", authority);
  if (transition.status === "execution-packet-ready" || transition.status === "handed-off") {
    if (planningDigest(authority) !== planningDigest(state.authority)) {
      throw new PlanStateError("plan.approval.stale", "Execution authority cannot change after approval.");
    }
    requireCurrentApproval(state, "plan");
    requireCurrentApproval(state, "execution");
  }
  const base = transition.status === "revising"
    ? invalidateCurrentChallenges(state, "binding-changed", transition.digest)
    : state;
  return {
    ...base,
    status: transition.status,
    stateRevision: state.stateRevision + 1,
    semanticRevision,
    sourceDigest: transition.sourceDigest ?? state.sourceDigest,
    authority,
    lastTransitionDigest: transition.digest,
    lastTransitionInputDigest: transitionInputDigest,
    sourceDrift: state.sourceDrift ? false : state.sourceDrift
  };
}

export function invalidatePlanStateForSourceDrift(state: PlanRunState, input: { readonly expectedRevision: number; readonly sourceDigest: string; readonly digest: string }): PlanRunState {
  assertValid(state);
  if (input.expectedRevision !== state.stateRevision) throw new PlanStateError("plan.state.revision_conflict", "Expected state revision does not match current state.");
  if (!isDigest(input.sourceDigest) || !isDigest(input.digest)) throw invalid("Source drift input is invalid.");
  if (input.sourceDigest === state.sourceDigest) return state;
  if (state.status === "stopped") throw new PlanStateError("plan.state.transition_invalid", "Stopped plans cannot be changed.");
  const invalidated = invalidateCurrentChallenges(state, "binding-changed", input.digest);
  return { ...invalidated, status: "reviewing", stateRevision: state.stateRevision + 1, sourceDigest: input.sourceDigest, sourceDrift: true, authority: {}, lastTransitionDigest: input.digest };
}

export function issueApprovalChallenge(state: PlanRunState, input: { readonly expectedRevision: number; readonly challenge: PendingApprovalChallenge; readonly digest: string }): PlanRunState {
  assertValid(state);
  if (input.expectedRevision !== state.stateRevision) throw new PlanStateError("plan.state.revision_conflict", "Expected state revision does not match current state.");
  if (!isDigest(input.digest) || validatePendingApprovalChallenge(input.challenge).length > 0 || input.challenge.status !== "pending" || input.challenge.runId !== state.runId) throw new PlanStateError("plan.approval.challenge_invalid", "Approval challenge is invalid.");
  requireChallengeLifecycle(state, input.challenge.purpose);
  if (!matchesStateBindings(input.challenge, state)) throw new PlanStateError("plan.approval.challenge_stale", "Approval challenge does not match current authority.");
  if (state.challengeHistory.some((entry) => entry.status === "invalidated" && entry.previousChallenge.challengeDigest === input.challenge.challengeDigest)) {
    throw new PlanStateError("plan.approval.challenge_stale", "Approval challenge is not current.");
  }
  const existing = state.currentChallenges[input.challenge.purpose];
  if (existing?.challengeDigest === input.challenge.challengeDigest) return state;
  const base = existing ? invalidateCurrentChallenges(state, "replaced", input.digest, input.challenge.purpose) : state;
  return { ...base, stateRevision: state.stateRevision + 1, currentChallenges: { ...base.currentChallenges, [input.challenge.purpose]: input.challenge }, lastTransitionDigest: input.digest };
}

export function consumeApprovalChallenge(state: PlanRunState, input: { readonly expectedRevision: number; readonly purpose: ApprovalPurpose; readonly challengeDigest: string; readonly digest: string }): PlanRunState {
  assertValid(state);
  if (input.expectedRevision !== state.stateRevision) throw new PlanStateError("plan.state.revision_conflict", "Expected state revision does not match current state.");
  if (!isDigest(input.digest) || !isDigest(input.challengeDigest)) throw new PlanStateError("plan.approval.challenge_invalid", "Approval challenge is invalid.");
  requireChallengeLifecycle(state, input.purpose);
  const current = state.currentChallenges[input.purpose];
  if (!current) throw new PlanStateError("plan.approval.challenge_missing", "No current approval challenge exists.");
  if (current.challengeDigest !== input.challengeDigest || !matchesStateBindings(current, state)) throw new PlanStateError("plan.approval.challenge_stale", "Approval challenge is not current.");
  if (current.status === "consumed") throw new PlanStateError("plan.approval.challenge_consumed", "Approval challenge has already been consumed.");
  if (current.status !== "pending") throw new PlanStateError("plan.approval.challenge_stale", "Approval challenge is not current.");
  const consumed = { ...current, status: "consumed" as const };
  return { ...state, stateRevision: state.stateRevision + 1, currentChallenges: { ...state.currentChallenges, [input.purpose]: consumed }, lastTransitionDigest: input.digest };
}

function requireApproval(state: PlanRunState, transition: PlanStateTransition, purpose: ApprovalPurpose, authority: PlanAuthorityState): void {
  const challenge = state.currentChallenges[purpose];
  const receipt = transition.approvalReceipt;
  const receiptIssues = purpose === "plan" ? validatePlanApprovalReceipt(receipt) : validateExecutionApprovalReceipt(receipt);
  if (!challenge || challenge.status !== "consumed" || !receipt || receiptIssues.length > 0 || !receiptMatchesChallenge(receipt, challenge)) {
    throw new PlanStateError("plan.approval.stale", "A matching consumed approval challenge and receipt are required.");
  }
  if (!matchesStateBindings(challenge, state) || !matchesStateBindings(receipt, state) || !sameApprovalAuthority(authority, state.authority, purpose)) {
    throw new PlanStateError("plan.approval.stale", "Approval authority bindings are stale.");
  }
  const receiptDigest = planningDigest(receipt);
  if (purpose === "plan") {
    if (authority.planApprovalDigest !== receiptDigest || authority.planApprovalReceipt === undefined || planningDigest(authority.planApprovalReceipt) !== receiptDigest) {
      throw new PlanStateError("plan.approval.stale", "Final plan receipt metadata is required.");
    }
  } else if (authority.executionApprovalDigest !== receiptDigest || authority.executionApprovalReceipt === undefined || planningDigest(authority.executionApprovalReceipt) !== receiptDigest) {
    throw new PlanStateError("plan.approval.stale", "Final execution receipt metadata is required.");
  }
}

function requireCurrentApproval(state: PlanRunState, purpose: ApprovalPurpose): void {
  const challenge = state.currentChallenges[purpose];
  const receipt = purpose === "plan" ? state.authority.planApprovalReceipt : state.authority.executionApprovalReceipt;
  const receiptIssues = purpose === "plan" ? validatePlanApprovalReceipt(receipt) : validateExecutionApprovalReceipt(receipt);
  const receiptDigest = receipt ? planningDigest(receipt) : undefined;
  const authorityDigest = purpose === "plan" ? state.authority.planApprovalDigest : state.authority.executionApprovalDigest;
  if (!challenge || challenge.status !== "consumed" || !receipt || receiptIssues.length > 0
    || !receiptMatchesChallenge(receipt, challenge) || !matchesStateBindings(challenge, state)
    || !matchesStateBindings(receipt, state) || authorityDigest !== receiptDigest) {
    throw new PlanStateError("plan.approval.stale", "Current approval authority is stale.");
  }
}

function sameApprovalAuthority(next: PlanAuthorityState, current: PlanAuthorityState, purpose: ApprovalPurpose): boolean {
  const keys = purpose === "plan"
    ? ["packetDigest", "structuralReviewDigest", "semanticReviewDigest"] as const
    : ["packetDigest", "structuralReviewDigest", "semanticReviewDigest", "planApprovalDigest", "executionPacketDigest", "planApprovalReceipt"] as const;
  return keys.every((key) => planningDigest(next[key]) === planningDigest(current[key]));
}

function requireChallengeLifecycle(state: PlanRunState, purpose: ApprovalPurpose): void {
  const requiredStatus = purpose === "plan" ? "awaiting-plan-approval" : "awaiting-execution-approval";
  if (state.status !== requiredStatus) {
    throw new PlanStateError("plan.state.transition_invalid", "Approval challenges are not valid in the current lifecycle state.");
  }
}

function matchesStateBindings(value: PendingApprovalChallenge | PlanApprovalReceipt | ExecutionApprovalReceipt, state: PlanRunState): boolean {
  if (value.runId !== state.runId || value.bindings.sourceDigest !== state.sourceDigest) return false;
  if (value.purpose === "plan") {
    return value.bindings.packetDigest === state.authority.packetDigest
      && value.bindings.structuralReviewDigest === state.authority.structuralReviewDigest
      && value.bindings.semanticReviewDigest === state.authority.semanticReviewDigest;
  }
  return value.bindings.planningPacketDigest === state.authority.packetDigest
    && value.bindings.planApprovalDigest === state.authority.planApprovalDigest
    && value.bindings.executionPacketDigest === state.authority.executionPacketDigest;
}

function validAuthority(value: unknown): value is PlanAuthorityState {
  if (!isRecord(value)) return false;
  const digests = ["packetDigest", "structuralReviewDigest", "semanticReviewDigest", "planApprovalDigest", "executionPacketDigest", "executionApprovalDigest"];
  if (!digests.every((key) => value[key] === undefined || isDigest(value[key]))) return false;
  return (value.planApprovalReceipt === undefined || validatePlanApprovalReceipt(value.planApprovalReceipt).length === 0)
    && (value.executionApprovalReceipt === undefined || validateExecutionApprovalReceipt(value.executionApprovalReceipt).length === 0);
}
function invalidateCurrentChallenges(state: PlanRunState, reason: ApprovalChallengeHistory["invalidationReason"], digest: string, onlyPurpose?: ApprovalPurpose): PlanRunState {
  const currentChallenges = { ...state.currentChallenges };
  const history = [...state.challengeHistory];
  for (const purpose of ["plan", "execution"] as const) {
    if (onlyPurpose && purpose !== onlyPurpose) continue;
    const challenge = currentChallenges[purpose];
    if (!challenge) continue;
    history.push({ schemaVersion: "boulder.approval-challenge-history.v1", previousChallenge: { ...challenge, status: "pending" }, previousStatus: "pending", status: "invalidated", transitionedAt: "1970-01-01T00:00:00.000Z", invalidationReason: reason, immutable: true });
    delete currentChallenges[purpose];
  }
  return { ...state, currentChallenges, challengeHistory: history, lastTransitionDigest: digest };
}

function hasReviewAuthority(authority: PlanAuthorityState): boolean {
  return isDigest(authority.packetDigest) && isDigest(authority.structuralReviewDigest) && isDigest(authority.semanticReviewDigest);
}
function assertValid(state: PlanRunState): void { const errors = validatePlanRunState(state); if (errors.length > 0) throw errors[0]; }
function invalid(message: string): PlanStateError { return new PlanStateError("plan.state.invalid", message); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isDigest(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }
function integerAtLeast(value: unknown, minimum: number): value is number { return typeof value === "number" && Number.isInteger(value) && value >= minimum; }
