import { parseV2WorkJournal } from "./work-events.js";
import {
  applyV2WorkEvent,
  type MutableV2WorkReplayState
} from "./work-reducer.js";
import type {
  V2WorkApprovalAuthentication,
  V2WorkObservation,
  V2WorkReconcileAction,
  V2WorkReplayOptions,
  V2WorkReplayReason,
  V2WorkReplayState
} from "./work-replay-contracts.js";

export * from "./work-replay-contracts.js";

type ReplayResult =
  | { readonly ok: true; readonly value: V2WorkReplayState }
  | { readonly ok: false; readonly reasonCode: V2WorkReplayReason | string };

export async function replayV2WorkJournal(
  journal: string,
  options?: V2WorkReplayOptions
): Promise<ReplayResult> {
  if (!validReplayOptions(options)) return failure("v2.work.anchor_required");
  const parsed = await parseV2WorkJournal(journal);
  if (!parsed.ok) return parsed;
  if (parsed.value.length === 0) return failure("v2.work.event_invalid");
  const first = parsed.value[0];
  if (
    first.workId !== options.anchor.workId
    || first.workRevisionDigest !== options.anchor.rootRevisionDigest
  ) return failure("v2.work.anchor_mismatch");
  const state: MutableV2WorkReplayState = {
    workId: first.workId,
    status: "active",
    currentRevision: 0,
    currentRevisionDigest: first.workRevisionDigest,
    currentSemanticDigest: first.workRevisionDigest,
    attempts: [],
    approvalRequests: [],
    approvals: [],
    effects: [],
    recoveries: [],
    completion: null,
    pendingCritique: null,
    sequence: 0,
    headEventDigest: first.eventDigest
  };
  for (const event of parsed.value) {
    if (!await options.verifyEvent(event)) {
      return failure("v2.work.anchor_mismatch");
    }
    if (event.kind === "approval-recorded") {
      if (!options.verifyApproval) {
        return failure("v2.work.approval_authentication_required");
      }
      const approval: V2WorkApprovalAuthentication = {
        gateId: String(event.data.gateId),
        actionId: String(event.data.actionId),
        effectId: String(event.data.effectId),
        workRevisionDigest: event.workRevisionDigest,
        attemptId: String(event.data.attemptId),
        decision: event.data.decision === "approved" ? "approved" : "denied",
        authorityReceiptDigest: String(event.data.authorityReceiptDigest) as `sha256:${string}`
      };
      if (!await options.verifyApproval(approval)) {
        return failure("v2.work.approval_authentication_required");
      }
    }
    const reason = applyV2WorkEvent(state, event);
    if (reason) return failure(reason);
    state.sequence = event.sequence;
    state.headEventDigest = event.eventDigest;
  }
  return {
    ok: true,
    value: deepFreeze({
      workId: state.workId,
      status: state.status,
      currentRevision: state.currentRevision,
      currentRevisionDigest: state.currentRevisionDigest,
      currentSemanticDigest: state.currentSemanticDigest,
      attempts: state.attempts.map((item) => ({ ...item })),
      approvalRequests: state.approvalRequests.map((item) => ({ ...item })),
      approvals: state.approvals.map((item) => ({ ...item })),
      effects: state.effects.map((item) => ({ ...item })),
      recoveries: state.recoveries.map((item) => ({ ...item })),
      completion: state.completion ? { ...state.completion } : null,
      sequence: state.sequence,
      headEventDigest: state.headEventDigest
    })
  };
}

export function reconcileV2Work(
  state: V2WorkReplayState,
  observations: readonly V2WorkObservation[]
): readonly V2WorkReconcileAction[] {
  if (observations.length !== 1) {
    throw new Error("v2.work.reconcile_observation_count_invalid");
  }
  const observation = observations[0];
  if (!validObservation(observation)) {
    throw new Error("v2.work.reconcile_observation_invalid");
  }
  if (observation.kind === "runner") {
    const attempt = [...state.attempts].reverse().find((item) => item.status === "running");
    if (
      !attempt
      || attempt.runnerKind !== observation.runnerKind
      || attempt.sessionId !== observation.sessionId
    ) return Object.freeze([{ kind: "noop" }]);
    if (observation.status === "running") {
      return Object.freeze([{
        kind: "reattach",
        workId: state.workId,
        attemptId: attempt.attemptId,
        attempt: attempt.attempt,
        workRevisionDigest: attempt.workRevisionDigest,
        sessionId: attempt.sessionId
      }]);
    }
    if (observation.status === "missing") {
      if (state.effects.some((item) =>
        item.boundary === "external" && item.receiptDigest === undefined
      )) {
        const pending = state.effects.find((item) =>
          item.boundary === "external" && item.receiptDigest === undefined
        );
        return Object.freeze([{
          kind: "wait",
          operationKey: pending?.operationKey ?? attempt.workRevisionDigest
        }]);
      }
      return Object.freeze([{
        kind: "record-runner-missing",
        workId: state.workId,
        attemptId: attempt.attemptId,
        attempt: attempt.attempt,
        workRevisionDigest: attempt.workRevisionDigest,
        runnerKind: attempt.runnerKind,
        sessionId: attempt.sessionId,
        failureCode: "runner.missing",
        retryable: true
      }]);
    }
    if (observation.status !== "terminal") return Object.freeze([{ kind: "noop" }]);
    return Object.freeze([{
      kind: "record-terminal",
      workId: state.workId,
      attemptId: attempt.attemptId,
      attempt: attempt.attempt,
      workRevisionDigest: attempt.workRevisionDigest,
      terminalReceiptDigest: observation.terminalReceiptDigest
    }]);
  }
  const effect = state.effects.find((item) =>
    item.operationKey === observation.operationKey && item.receiptDigest === undefined
  );
  if (!effect) return Object.freeze([{ kind: "noop" }]);
  if (observation.status === "unknown" || observation.status === "unavailable") {
    return Object.freeze([{ kind: "wait", operationKey: observation.operationKey }]);
  }
  if (observation.status === "absent") {
    return Object.freeze([{
      kind: "dispatch-effect",
      workId: state.workId,
      effectId: effect.effectId,
      attemptId: effect.attemptId,
      workRevisionDigest: effect.workRevisionDigest,
      boundary: effect.boundary,
      actionId: effect.actionId,
      operationKey: observation.operationKey
    }]);
  }
  if (observation.status !== "committed") {
    return Object.freeze([{ kind: "wait", operationKey: observation.operationKey }]);
  }
  return Object.freeze([{
    kind: "record-effect-receipt",
    workId: state.workId,
    effectId: effect.effectId,
    attemptId: effect.attemptId,
    workRevisionDigest: effect.workRevisionDigest,
    boundary: effect.boundary,
    actionId: effect.actionId,
    outcome: "committed",
    operationKey: observation.operationKey,
    receiptDigest: observation.receiptDigest
  }]);
}

function validObservation(value: unknown): value is V2WorkObservation {
  if (!isRecord(value)) return false;
  if (value.kind === "runner") {
    const keys = value.status === "terminal"
      ? ["kind", "runnerKind", "sessionId", "status", "terminalReceiptDigest"]
      : ["kind", "runnerKind", "sessionId", "status"];
    return exactKeys(value, keys)
      && (value.runnerKind === "in-process" || value.runnerKind === "process")
      && typeof value.sessionId === "string" && value.sessionId.length > 0
      && (value.status === "running" || value.status === "missing"
        || (value.status === "terminal" && isDigest(value.terminalReceiptDigest)));
  }
  if (value.kind !== "effect") return false;
  const keys = value.status === "committed"
    ? ["kind", "operationKey", "status", "receiptDigest"]
    : ["kind", "operationKey", "status"];
  return exactKeys(value, keys)
    && isDigest(value.operationKey)
    && (value.status === "absent" || value.status === "unknown"
      || value.status === "unavailable"
      || (value.status === "committed" && isDigest(value.receiptDigest)));
}

function validReplayOptions(value: unknown): value is V2WorkReplayOptions {
  if (!isRecord(value)
    || !exactKeys(value, ["anchor", "verifyEvent"])
      && !exactKeys(value, ["anchor", "verifyEvent", "verifyApproval"])
    || !isRecord(value.anchor)
    || !exactKeys(value.anchor, ["workId", "rootRevisionDigest"])
    || typeof value.anchor.workId !== "string" || value.anchor.workId.length === 0
    || !isDigest(value.anchor.rootRevisionDigest)
    || typeof value.verifyEvent !== "function") return false;
  return value.verifyApproval === undefined || typeof value.verifyApproval === "function";
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isDigest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function failure(reasonCode: V2WorkReplayReason): {
  readonly ok: false;
  readonly reasonCode: V2WorkReplayReason;
} {
  return { ok: false, reasonCode };
}
