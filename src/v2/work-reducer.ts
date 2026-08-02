import type { V2Digest, V2JsonValue } from "./contracts.js";
import {
  digestData,
  digestOrNullData,
  nullableStringData,
  numberData,
  optionalDigestData,
  requiredDigest,
  runnerData,
  stringData,
  terminalStatusData
} from "./work-event-data.js";
import type { V2WorkEvent } from "./work-events.js";
import type {
  V2WorkReplayApproval,
  V2WorkReplayApprovalRequest,
  V2WorkReplayAttempt,
  V2WorkReplayCompletion,
  V2WorkReplayEffect,
  V2WorkReplayReason,
  V2WorkReplayRecovery
} from "./work-replay-contracts.js";

export type MutableV2WorkReplayState = {
  workId: string;
  status: "active" | "accepted" | "completed";
  currentRevision: number;
  currentRevisionDigest: V2Digest;
  currentSemanticDigest: V2Digest;
  attempts: V2WorkReplayAttempt[];
  approvalRequests: V2WorkReplayApprovalRequest[];
  approvals: V2WorkReplayApproval[];
  effects: V2WorkReplayEffect[];
  recoveries: V2WorkReplayRecovery[];
  completion: V2WorkReplayCompletion | null;
  pendingCritique: {
    critiqueDigest: V2Digest;
    failedTerminalReceiptDigest: V2Digest;
  } | null;
  sequence: number;
  headEventDigest: V2Digest;
};

export function applyV2WorkEvent(
  state: MutableV2WorkReplayState,
  event: V2WorkEvent
): V2WorkReplayReason | null {
  if (event.workId !== state.workId) return "v2.work.receipt_binding_mismatch";
  if (state.status === "completed") return "v2.work.terminal_conflict";
  if ((event.kind as string) === "attempt-accepted") return applyAccepted(state, event);
  switch (event.kind) {
    case "revision-created":
      return applyRevision(state, event);
    case "attempt-started":
      return applyAttempt(state, event);
    case "approval-requested":
      return applyApprovalRequest(state, event);
    case "approval-recorded":
      return applyApproval(state, event);
    case "effect-claimed":
      return applyEffectClaim(state, event);
    case "effect-receipt-recorded":
      return applyEffectReceipt(state, event);
    case "attempt-terminal":
      return applyTerminal(state, event);
    case "critique-recorded":
      return applyCritique(state, event);
    case "rollback-recorded":
      return applyRollback(state, event);
    case "completion-recorded":
      return applyCompletion(state, event);
  }
  return "v2.work.event_invalid";
}

function applyRevision(
  state: MutableV2WorkReplayState,
  event: V2WorkEvent
): V2WorkReplayReason | null {
  const revision = numberData(event.data.revision);
  const previous = digestOrNullData(event.data.previousWorkRevisionDigest);
  const semanticDigest = digestData(event.data.semanticDigest);
  if (state.currentRevision === 0) {
    if (revision !== 1 || previous !== null) return "v2.work.revision_invalid";
  } else {
    const basisValue = event.data.basis;
    if (typeof basisValue !== "object" || basisValue === null || Array.isArray(basisValue)) {
      return "v2.work.critique_binding_mismatch";
    }
    const basis = basisValue as Readonly<Record<string, V2JsonValue>>;
    if (basis.kind !== "critique") return "v2.work.critique_binding_mismatch";
    if (!state.pendingCritique || revision !== state.currentRevision + 1) {
      return "v2.work.revision_invalid";
    }
    if (previous !== state.currentRevisionDigest) return "v2.work.revision_parent_mismatch";
    if (event.workRevisionDigest === state.currentRevisionDigest) {
      return "v2.work.revision_invalid";
    }
    if (
      semanticDigest === state.currentSemanticDigest
      || basis.critiqueDigest !== state.pendingCritique.critiqueDigest
      || basis.failedTerminalReceiptDigest
        !== state.pendingCritique.failedTerminalReceiptDigest
    ) return "v2.work.critique_binding_mismatch";
  }
  state.currentRevision = revision;
  state.currentRevisionDigest = event.workRevisionDigest;
  state.currentSemanticDigest = semanticDigest;
  state.pendingCritique = null;
  return null;
}

function applyAttempt(
  state: MutableV2WorkReplayState,
  event: V2WorkEvent
): V2WorkReplayReason | null {
  if (state.status === "completed") return "v2.work.terminal_conflict";
  if (state.currentRevision === 0) return "v2.work.revision_invalid";
  if (event.workRevisionDigest !== state.currentRevisionDigest) {
    return "v2.work.retry_revision_mismatch";
  }
  const attempts = state.attempts.filter((item) =>
    item.workRevisionDigest === event.workRevisionDigest
  );
  const attempt = numberData(event.data.attempt);
  if (attempt !== attempts.length + 1) return "v2.work.attempt_number_invalid";
  if (state.attempts.some((item) => item.status === "running")) {
    return "v2.work.terminal_conflict";
  }
  if (attempts.length > 0 && unresolvedRecovery(state)) {
    return "v2.work.recovery_required";
  }
  if (attempts.length > 0 && attempts.at(-1)?.status !== "failed") {
    return "v2.work.retry_revision_mismatch";
  }
  if (attempts.length > 0 && attempts.at(-1)?.failureRetryable !== true) {
    return "v2.work.retry_revision_mismatch";
  }
  if (attempts.length === 0 && state.attempts.length > 0 && unresolvedRecovery(state)) {
    return "v2.work.recovery_required";
  }
  state.attempts.push({
    attemptId: stringData(event.data.attemptId),
    attempt,
    workRevisionDigest: event.workRevisionDigest,
    runnerKind: runnerData(event.data.runnerKind),
    sessionId: stringData(event.data.sessionId),
    status: "running"
  });
  return null;
}

function applyAccepted(
  state: MutableV2WorkReplayState,
  event: V2WorkEvent
): V2WorkReplayReason | null {
  const attempt = currentRunningAttempt(state);
  if (
    !attempt || stringData(event.data.attemptId) !== attempt.attemptId
    || event.workRevisionDigest !== state.currentRevisionDigest
  ) return "v2.work.receipt_binding_mismatch";
  const index = state.attempts.findIndex((item) => item.attemptId === attempt.attemptId);
  state.attempts[index] = {
    ...attempt,
    acceptedAt: stringData(event.data.acceptedAt)
  };
  state.status = "accepted";
  return null;
}

function applyApprovalRequest(
  state: MutableV2WorkReplayState,
  event: V2WorkEvent
): V2WorkReplayReason | null {
  const attempt = currentRunningAttempt(state);
  if (
    !attempt
    || event.workRevisionDigest !== state.currentRevisionDigest
    || event.data.attemptId !== attempt.attemptId
  ) {
    return "v2.work.approval_binding_mismatch";
  }
  state.approvalRequests.push({
    gateId: stringData(event.data.gateId),
    actionId: stringData(event.data.actionId),
    effectId: stringData(event.data.effectId),
    workRevisionDigest: state.currentRevisionDigest,
    attemptId: attempt.attemptId
  });
  return null;
}

function applyApproval(
  state: MutableV2WorkReplayState,
  event: V2WorkEvent
): V2WorkReplayReason | null {
  const gateId = stringData(event.data.gateId);
  const effectId = stringData(event.data.effectId);
  const attempt = currentRunningAttempt(state);
  const request = [...state.approvalRequests].reverse().find((item) =>
    item.gateId === gateId && item.effectId === effectId
    && item.workRevisionDigest === event.workRevisionDigest
    && item.attemptId === event.data.attemptId
    && item.actionId === event.data.actionId
  );
  if (
    !request
    || event.workRevisionDigest !== state.currentRevisionDigest
    || event.data.attemptId !== attempt?.attemptId
  ) {
    return "v2.work.approval_binding_mismatch";
  }
  state.approvals.push({
    ...request,
    decision: event.data.decision === "approved" ? "approved" : "denied",
    authorityReceiptDigest: digestData(event.data.authorityReceiptDigest)
  });
  return null;
}

function applyEffectClaim(
  state: MutableV2WorkReplayState,
  event: V2WorkEvent
): V2WorkReplayReason | null {
  const boundary = event.data.boundary === "local" ? "local" : "external";
  const role = event.data.role === "compensation" ? "compensation" : "primary";
  const gateId = nullableStringData(event.data.gateId);
  const actionId = nullableStringData(event.data.actionId);
  const effectId = stringData(event.data.effectId);
  const target = digestOrNullData(event.data.targetEffectReceiptDigest);
  const attempt = currentRunningAttempt(state);
  if (!attempt || event.workRevisionDigest !== state.currentRevisionDigest) {
    return "v2.work.receipt_binding_mismatch";
  }
  if (state.effects.some((item) =>
    item.effectId === effectId || item.operationKey === event.data.operationKey
  )) return "v2.work.idempotency_conflict";
  const decision = [...state.approvals].reverse().find((item) =>
    item.gateId === gateId && item.effectId === effectId
    && item.actionId === actionId
    && item.workRevisionDigest === state.currentRevisionDigest
    && item.attemptId === attempt.attemptId
  );
  if (boundary === "external" && decision?.decision !== "approved") {
    return "v2.work.approval_required";
  }
  if (boundary === "local" && event.data.checkpointDigest === undefined) {
    return "v2.work.recovery_kind_mismatch";
  }
  if (role === "compensation" && boundary !== "external") {
    return "v2.work.recovery_kind_mismatch";
  }
  if (role === "compensation" && !state.effects.some((item) =>
    item.receiptDigest === target && item.boundary === "external" && item.outcome === "committed"
  )) return "v2.work.recovery_kind_mismatch";
  state.effects.push({
    effectId,
    operationKey: digestData(event.data.operationKey),
    boundary,
    role,
    gateId,
    actionId,
    targetEffectReceiptDigest: target,
    workRevisionDigest: state.currentRevisionDigest,
    attemptId: attempt.attemptId,
    checkpointDigest: optionalDigestData(event.data.checkpointDigest)
  });
  return null;
}

function applyEffectReceipt(
  state: MutableV2WorkReplayState,
  event: V2WorkEvent
): V2WorkReplayReason | null {
  const effectId = stringData(event.data.effectId);
  const operationKey = digestData(event.data.operationKey);
  const attemptId = stringData(event.data.attemptId);
  const index = state.effects.findIndex((item) =>
    item.effectId === effectId && item.operationKey === operationKey
    && item.attemptId === attemptId
    && item.workRevisionDigest === event.workRevisionDigest
  );
  if (index < 0) return "v2.work.effect_claim_required";
  if (
    state.effects[index].boundary !== event.data.boundary
    || state.effects[index].receiptDigest !== undefined
  ) return "v2.work.receipt_binding_mismatch";
  const attempt = currentRunningAttempt(state);
  if (!attempt || attempt.attemptId !== attemptId
    || event.workRevisionDigest !== state.currentRevisionDigest) {
    return "v2.work.receipt_binding_mismatch";
  }
  if (state.effects[index].boundary === "external") {
    const latestDecision = [...state.approvals].reverse().find((item) =>
      item.gateId === state.effects[index].gateId
      && item.actionId === state.effects[index].actionId
      && item.effectId === effectId
      && item.attemptId === attemptId
      && item.workRevisionDigest === event.workRevisionDigest
    );
    if (latestDecision?.decision !== "approved") return "v2.work.approval_required";
  }
  const updated: V2WorkReplayEffect = {
    ...state.effects[index],
    outcome: event.data.outcome === "committed" ? "committed" : "not-committed",
    receiptDigest: digestData(event.data.receiptDigest)
  };
  state.effects[index] = updated;
  if (updated.role === "compensation" && updated.outcome === "committed") {
    state.recoveries.push({
      kind: "compensation",
      targetEffectReceiptDigest: requiredDigest(updated.targetEffectReceiptDigest),
      outcome: "committed",
      receiptDigest: requiredDigest(updated.receiptDigest)
    });
  }
  return null;
}

function applyTerminal(
  state: MutableV2WorkReplayState,
  event: V2WorkEvent
): V2WorkReplayReason | null {
  const attemptId = stringData(event.data.attemptId);
  const index = state.attempts.findIndex((item) => item.attemptId === attemptId);
  if (index < 0) return "v2.work.receipt_binding_mismatch";
  if (
    event.workRevisionDigest !== state.currentRevisionDigest
    || state.attempts[index].workRevisionDigest !== state.currentRevisionDigest
    || state.attempts.at(-1)?.attemptId !== attemptId
  ) return "v2.work.receipt_binding_mismatch";
  if (state.attempts[index].status !== "running") return "v2.work.terminal_conflict";
  const terminalReceiptDigest = digestData(event.data.terminalReceiptDigest);
  if (state.attempts.some((item) => item.terminalReceiptDigest === terminalReceiptDigest)) {
    return "v2.work.receipt_binding_mismatch";
  }
  if (
    event.data.status === "completed"
    && state.effects.some((item) => item.attemptId === attemptId && item.outcome === undefined)
  ) return "v2.work.effect_receipt_required";
  state.attempts[index] = {
    ...state.attempts[index],
    status: terminalStatusData(event.data.status),
    failureRetryable: event.data.status === "failed"
      ? event.data.retryable === true
      : undefined,
    terminalReceiptDigest
  };
  state.status = "active";
  return null;
}

function applyCritique(
  state: MutableV2WorkReplayState,
  event: V2WorkEvent
): V2WorkReplayReason | null {
  const last = state.attempts.at(-1);
  if (
    !last || last.status !== "failed" || !last.terminalReceiptDigest
    || last.workRevisionDigest !== state.currentRevisionDigest
    || event.workRevisionDigest !== state.currentRevisionDigest
  ) return "v2.work.critique_binding_mismatch";
  state.pendingCritique = {
    critiqueDigest: digestData(event.data.critiqueDigest),
    failedTerminalReceiptDigest: last.terminalReceiptDigest
  };
  return null;
}

function applyRollback(
  state: MutableV2WorkReplayState,
  event: V2WorkEvent
): V2WorkReplayReason | null {
  const target = digestData(event.data.targetEffectReceiptDigest);
  const effect = state.effects.find((item) => item.receiptDigest === target);
  if (
    !effect || effect.boundary !== "local" || effect.outcome !== "committed"
    || effect.checkpointDigest !== event.data.checkpointDigest
  ) return "v2.work.recovery_kind_mismatch";
  state.recoveries.push({
    kind: "rollback",
    targetEffectReceiptDigest: target,
    outcome: event.data.outcome === "rolled-back" ? "rolled-back" : "failed",
    receiptDigest: digestData(event.data.receiptDigest)
  });
  return null;
}

function applyCompletion(
  state: MutableV2WorkReplayState,
  event: V2WorkEvent
): V2WorkReplayReason | null {
  const terminal = digestData(event.data.terminalReceiptDigest);
  const attempt = state.attempts.at(-1);
  if (
    !attempt || attempt.status !== "completed" || attempt.terminalReceiptDigest !== terminal
    || attempt.workRevisionDigest !== state.currentRevisionDigest
    || event.workRevisionDigest !== state.currentRevisionDigest
  ) return "v2.work.effect_receipt_required";
  if (state.completion) return "v2.work.idempotency_conflict";
  state.completion = {
    terminalReceiptDigest: terminal,
    completionDigest: digestData(event.data.completionDigest),
    sinkId: stringData(event.data.sinkId)
  };
  state.status = "completed";
  return null;
}

export function hasUnresolvedRecovery(state: MutableV2WorkReplayState): boolean {
  return state.effects.some((effect) => {
    if (effect.role === "compensation") return false;
    if (effect.outcome === undefined) return true;
    if (effect.outcome !== "committed" || !effect.receiptDigest) return false;
    return !state.recoveries.some((item) =>
      item.targetEffectReceiptDigest === effect.receiptDigest
      && (item.outcome === "rolled-back" || item.outcome === "committed")
    );
  });
}

function unresolvedRecovery(state: MutableV2WorkReplayState): boolean {
  return hasUnresolvedRecovery(state);
}

function currentRunningAttempt(
  state: MutableV2WorkReplayState
): V2WorkReplayAttempt | undefined {
  const attempt = state.attempts.at(-1);
  return attempt?.status === "running" ? attempt : undefined;
}
