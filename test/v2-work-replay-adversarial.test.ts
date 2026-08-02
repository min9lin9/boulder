import { describe, expect, test } from "bun:test";
import { reconcileV2Work } from "../src/v2/work-replay.js";
import {
  buildWorkJournal,
  digest,
  replayWorkJournal as replayV2WorkJournal,
  type JournalEntry
} from "./helpers/v2-work.js";

const revision1 = digest("a");
const revision2 = digest("b");
const operation1 = digest("c");
const receipt1 = digest("d");
const receipt2 = digest("e");
const terminal1 = digest("f");

const revisionCreated: JournalEntry = {
  kind: "revision-created",
  data: { revision: 1, previousWorkRevisionDigest: null }
};

const attempt1: JournalEntry = {
  kind: "attempt-started",
  data: {
    attemptId: "attempt-1",
    attempt: 1,
    runnerKind: "process",
    sessionId: "session-1"
  }
};

const failedAttempt1: JournalEntry = {
  kind: "attempt-terminal",
  data: {
    attemptId: "attempt-1",
    status: "failed",
    terminalReceiptDigest: terminal1
  }
};

const critique: JournalEntry = {
  kind: "critique-recorded",
  data: { critiqueDigest: receipt1, requiresMaterialChange: true }
};

const revision2Created: JournalEntry = {
  kind: "revision-created",
  workRevisionDigest: revision2,
  data: { revision: 2, previousWorkRevisionDigest: revision1 }
};

const attempt2: JournalEntry = {
  kind: "attempt-started",
  data: {
    attemptId: "attempt-2",
    attempt: 2,
    runnerKind: "process",
    sessionId: "session-2"
  }
};

async function replay(entries: readonly JournalEntry[], workId = "work-adversarial") {
  return replayV2WorkJournal(await buildWorkJournal(workId, revision1, entries));
}

async function expectReplayRejected(entries: readonly JournalEntry[]): Promise<void> {
  const result = await replay(entries);
  expect(result.ok).toBe(false);
}

async function pendingExternalState() {
  const result = await replay([
    revisionCreated,
    attempt1,
    {
      kind: "approval-requested",
      data: { gateId: "gate-1", actionId: "action-1", effectId: "effect-1" }
    },
    {
      kind: "approval-recorded",
      data: { gateId: "gate-1", effectId: "effect-1", decision: "approved" }
    },
    {
      kind: "effect-claimed",
      data: {
        gateId: "gate-1",
        effectId: "effect-1",
        operationKey: operation1,
        boundary: "external",
        role: "primary",
        targetEffectReceiptDigest: null
      }
    }
  ], "work-pending-external");
  if (!result.ok) throw new Error(result.reasonCode);
  return result.value;
}

describe("v2 Work replay adversarial acceptance contracts", () => {
  test("replay requires revision-created as the first transition", async () => {
    await expectReplayRejected([attempt1]);
  });

  test("retry requires the exact prior failed terminal to authenticate retryable=true", async () => {
    await expectReplayRejected([
      revisionCreated,
      attempt1,
      { ...failedAttempt1, raw: true },
      attempt2
    ]);
  });

  test("retry cannot create a parallel running attempt", async () => {
    await expectReplayRejected([
      revisionCreated,
      attempt1,
      attempt2
    ]);
  });

  test("material revision binds changed semantics and critique to the exact failed terminal", async () => {
    await expectReplayRejected([
      revisionCreated,
      attempt1,
      failedAttempt1,
      critique,
      { ...revision2Created, raw: true }
    ]);
  });

  test("approval requires a matching durable request and action", async () => {
    await expectReplayRejected([
      revisionCreated,
      attempt1,
      {
        kind: "approval-recorded",
        data: { gateId: "gate-1", effectId: "effect-1", decision: "approved" }
      },
      {
        kind: "effect-claimed",
        data: {
          gateId: "gate-1",
          effectId: "effect-1",
          operationKey: operation1,
          boundary: "external",
          role: "primary",
          targetEffectReceiptDigest: null
        }
      }
    ]);
  });

  test("approval cannot be carried across revision and attempt bindings", async () => {
    await expectReplayRejected([
      revisionCreated,
      attempt1,
      {
        kind: "approval-requested",
        data: { gateId: "gate-1", actionId: "action-1", effectId: "effect-1" }
      },
      failedAttempt1,
      critique,
      revision2Created,
      { ...attempt2, workRevisionDigest: revision2, data: { ...attempt2.data, attempt: 1 } },
      {
        kind: "approval-recorded",
        workRevisionDigest: revision2,
        data: { gateId: "gate-1", effectId: "effect-1", decision: "approved" }
      },
      {
        kind: "effect-claimed",
        workRevisionDigest: revision2,
        data: {
          gateId: "gate-1",
          effectId: "effect-1",
          operationKey: operation1,
          boundary: "external",
          role: "primary",
          targetEffectReceiptDigest: null
        }
      }
    ]);
  });

  test("a later denial revokes an earlier approval", async () => {
    await expectReplayRejected([
      revisionCreated,
      attempt1,
      {
        kind: "approval-requested",
        data: { gateId: "gate-1", actionId: "action-1", effectId: "effect-1" }
      },
      {
        kind: "approval-recorded",
        data: { gateId: "gate-1", effectId: "effect-1", decision: "approved" }
      },
      {
        kind: "approval-recorded",
        data: { gateId: "gate-1", effectId: "effect-1", decision: "denied" }
      },
      {
        kind: "effect-claimed",
        data: {
          gateId: "gate-1",
          effectId: "effect-1",
          operationKey: operation1,
          boundary: "external",
          role: "primary",
          targetEffectReceiptDigest: null
        }
      }
    ]);
  });

  test("effect receipt must match the claimed boundary", async () => {
    await expectReplayRejected([
      revisionCreated,
      attempt1,
      {
        kind: "effect-claimed",
        data: {
          gateId: null,
          effectId: "effect-1",
          operationKey: operation1,
          boundary: "local",
          role: "primary",
          checkpointDigest: receipt2,
          targetEffectReceiptDigest: null
        }
      },
      {
        kind: "effect-receipt-recorded",
        data: {
          effectId: "effect-1",
          operationKey: operation1,
          boundary: "external",
          outcome: "committed",
          receiptDigest: receipt1
        }
      }
    ]);
  });

  test("effect receipt is write-once and cannot be overwritten", async () => {
    await expectReplayRejected([
      revisionCreated,
      attempt1,
      {
        kind: "effect-claimed",
        data: {
          gateId: null,
          effectId: "effect-1",
          operationKey: operation1,
          boundary: "local",
          role: "primary",
          checkpointDigest: terminal1,
          targetEffectReceiptDigest: null
        }
      },
      {
        kind: "effect-receipt-recorded",
        data: {
          effectId: "effect-1",
          operationKey: operation1,
          boundary: "local",
          outcome: "committed",
          receiptDigest: receipt1
        }
      },
      {
        kind: "effect-receipt-recorded",
        data: {
          effectId: "effect-1",
          operationKey: operation1,
          boundary: "local",
          outcome: "not-committed",
          receiptDigest: receipt2
        }
      }
    ]);
  });

  test("compensation must itself be an approved external effect", async () => {
    await expectReplayRejected([
      revisionCreated,
      attempt1,
      {
        kind: "approval-requested",
        data: { gateId: "gate-1", actionId: "action-1", effectId: "primary" }
      },
      {
        kind: "approval-recorded",
        data: { gateId: "gate-1", effectId: "primary", decision: "approved" }
      },
      {
        kind: "effect-claimed",
        data: {
          gateId: "gate-1",
          effectId: "primary",
          operationKey: operation1,
          boundary: "external",
          role: "primary",
          targetEffectReceiptDigest: null
        }
      },
      {
        kind: "effect-receipt-recorded",
        data: {
          effectId: "primary",
          operationKey: operation1,
          boundary: "external",
          outcome: "committed",
          receiptDigest: receipt1
        }
      },
      {
        kind: "effect-claimed",
        data: {
          gateId: null,
          effectId: "compensation",
          operationKey: receipt2,
          boundary: "local",
          role: "compensation",
          checkpointDigest: terminal1,
          targetEffectReceiptDigest: receipt1
        }
      }
    ]);
  });

  test("committed compensation resolves recovery without recursively requiring recovery", async () => {
    const result = await replay([
      revisionCreated,
      attempt1,
      {
        kind: "approval-requested",
        data: { gateId: "gate-primary", actionId: "action-primary", effectId: "primary" }
      },
      {
        kind: "approval-recorded",
        data: { gateId: "gate-primary", effectId: "primary", decision: "approved" }
      },
      {
        kind: "effect-claimed",
        data: {
          gateId: "gate-primary",
          effectId: "primary",
          operationKey: operation1,
          boundary: "external",
          role: "primary",
          targetEffectReceiptDigest: null
        }
      },
      {
        kind: "effect-receipt-recorded",
        data: {
          effectId: "primary",
          operationKey: operation1,
          boundary: "external",
          outcome: "committed",
          receiptDigest: receipt1
        }
      },
      {
        kind: "approval-requested",
        data: { gateId: "gate-comp", actionId: "action-comp", effectId: "compensation" }
      },
      {
        kind: "approval-recorded",
        data: { gateId: "gate-comp", effectId: "compensation", decision: "approved" }
      },
      {
        kind: "effect-claimed",
        data: {
          gateId: "gate-comp",
          effectId: "compensation",
          operationKey: receipt2,
          boundary: "external",
          role: "compensation",
          targetEffectReceiptDigest: receipt1
        }
      },
      {
        kind: "effect-receipt-recorded",
        data: {
          effectId: "compensation",
          operationKey: receipt2,
          boundary: "external",
          outcome: "committed",
          receiptDigest: terminal1
        }
      },
      failedAttempt1,
      critique,
      revision2Created,
      { ...attempt2, workRevisionDigest: revision2, data: { ...attempt2.data, attempt: 1 } }
    ], "work-compensation-barrier");

    expect(result.ok).toBe(true);
  });

  test("terminal binds the current revision and attempt", async () => {
    await expectReplayRejected([
      revisionCreated,
      attempt1,
      failedAttempt1,
      critique,
      revision2Created,
      { ...attempt2, workRevisionDigest: revision2, data: { ...attempt2.data, attempt: 1 } },
      {
        kind: "attempt-terminal",
        workRevisionDigest: revision1,
        data: {
          attemptId: "attempt-2",
          status: "completed",
          terminalReceiptDigest: receipt1
        }
      }
    ]);
  });

  test("terminal requires a canonical receipt rather than a caller-selected digest", async () => {
    await expectReplayRejected([
      revisionCreated,
      attempt1,
      {
        kind: "attempt-terminal",
        raw: true,
        data: {
          attemptId: "attempt-1",
          status: "completed",
          terminalReceiptDigest: terminal1
        }
      }
    ]);
  });

  test("completion digest must be canonical for its terminal and sink", async () => {
    await expectReplayRejected([
      revisionCreated,
      attempt1,
      {
        kind: "attempt-terminal",
        data: {
          attemptId: "attempt-1",
          status: "completed",
          terminalReceiptDigest: terminal1
        }
      },
      {
        kind: "completion-recorded",
        raw: true,
        data: {
          terminalReceiptDigest: terminal1,
          completionDigest: receipt1,
          sinkId: "sink-1"
        }
      }
    ]);
  });

  test("exactly one completion exists and a second distinct completion cannot reuse its digest", async () => {
    await expectReplayRejected([
      revisionCreated,
      attempt1,
      {
        kind: "attempt-terminal",
        data: {
          attemptId: "attempt-1",
          status: "completed",
          terminalReceiptDigest: terminal1
        }
      },
      {
        kind: "completion-recorded",
        data: {
          terminalReceiptDigest: terminal1,
          completionDigest: receipt1,
          sinkId: "sink-1"
        }
      },
      {
        kind: "completion-recorded",
        data: {
          terminalReceiptDigest: terminal1,
          completionDigest: receipt1,
          sinkId: "sink-2"
        }
      }
    ]);
  });
});

describe("v2 Work reconcile adversarial acceptance contracts", () => {
  test("unresolved external effect blocks a missing-runner retry", async () => {
    const state = await pendingExternalState();

    const actions = reconcileV2Work(state, [{
      kind: "runner",
      runnerKind: "process",
      sessionId: "session-1",
      status: "missing"
    }]);

    expect(actions).toEqual([{ kind: "wait", operationKey: operation1 }]);
  });

  test("reconcile accepts exactly one observation", async () => {
    const state = await pendingExternalState();

    let thrown: unknown;
    try {
      reconcileV2Work(state, [
        {
          kind: "runner",
          runnerKind: "process",
          sessionId: "session-1",
          status: "running"
        },
        {
          kind: "effect",
          operationKey: operation1,
          status: "unknown"
        }
      ]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown instanceof Error).toBe(true);
  });

  test("reconcile returns one effect decision fully bound to effect identity and receipt", async () => {
    const state = await pendingExternalState();

    const actions = reconcileV2Work(state, [{
      kind: "effect",
      operationKey: operation1,
      status: "committed",
      receiptDigest: receipt1
    }]);

    expect(actions).toEqual([{
      kind: "record-effect-receipt",
      workId: state.workId,
      effectId: "effect-1",
      attemptId: "attempt-1",
      workRevisionDigest: state.currentRevisionDigest,
      operationKey: operation1,
      boundary: "external",
      actionId: "action-1",
      outcome: "committed",
      receiptDigest: receipt1
    }]);
  });
});
