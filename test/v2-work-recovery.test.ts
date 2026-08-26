import { describe, expect, test } from "bun:test";
import { reconcileV2Work } from "../src/v2/work-replay.js";
import {
  buildWorkJournal,
  digest,
  replayWorkJournal as replayV2WorkJournal
} from "./helpers/v2-work.js";

describe("v2 Work recovery and reconcile", () => {
  test("blocks a newer revision until local rollback is durable", async () => {
    // Given a newer revision with an unresolved local checkpoint recovery
    const journal = await buildWorkJournal("work-barrier", digest("a"), [
      {
        kind: "revision-created",
        data: { revision: 1, previousWorkRevisionDigest: null }
      },
      {
        kind: "attempt-started",
        data: {
          attemptId: "attempt-1",
          attempt: 1,
          runnerKind: "process",
          sessionId: "session-1"
        }
      },
      {
        kind: "effect-claimed",
        data: {
          gateId: null,
          effectId: "effect-local",
          operationKey: digest("b"),
          boundary: "local",
          role: "primary",
          checkpointDigest: digest("c"),
          targetEffectReceiptDigest: null
        }
      },
      {
        kind: "effect-receipt-recorded",
        data: {
          effectId: "effect-local",
          operationKey: digest("b"),
          boundary: "local",
          outcome: "committed",
          receiptDigest: digest("d")
        }
      },
      {
        kind: "attempt-terminal",
        data: {
          attemptId: "attempt-1",
          status: "failed",
          terminalReceiptDigest: digest("e")
        }
      },
      {
        kind: "critique-recorded",
        data: { critiqueDigest: digest("f"), requiresMaterialChange: true }
      },
      {
        kind: "revision-created",
        workRevisionDigest: digest("c"),
        data: { revision: 2, previousWorkRevisionDigest: digest("a") }
      },
      {
        kind: "attempt-started",
        workRevisionDigest: digest("c"),
        data: {
          attemptId: "attempt-2",
          attempt: 1,
          runnerKind: "process",
          sessionId: "session-2"
        }
      }
    ]);

    // When replay reaches the premature revision-2 attempt
    const replay = await replayV2WorkJournal(journal);

    // Then the recovery barrier rejects execution
    expect(replay.ok).toBe(false);
    if (replay.ok) throw new Error("recovery barrier must reject");
    expect(replay.reasonCode).toBe("v2.work.recovery_required");
  });

  test("models compensation as a separately approved forward external effect", async () => {
    // Given an external commit followed by an approved compensation effect
    const journal = await buildWorkJournal("work-compensate", digest("a"), [
      {
        kind: "revision-created",
        data: { revision: 1, previousWorkRevisionDigest: null }
      },
      {
        kind: "attempt-started",
        data: {
          attemptId: "attempt-1",
          attempt: 1,
          runnerKind: "process",
          sessionId: "session-1"
        }
      },
      {
        kind: "approval-requested",
        data: { gateId: "gate-primary", actionId: "action-1", effectId: "primary" }
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
          operationKey: digest("b"),
          boundary: "external",
          role: "primary",
          targetEffectReceiptDigest: null
        }
      },
      {
        kind: "effect-receipt-recorded",
        data: {
          effectId: "primary",
          operationKey: digest("b"),
          boundary: "external",
          outcome: "committed",
          receiptDigest: digest("c")
        }
      },
      {
        kind: "approval-requested",
        data: { gateId: "gate-comp", actionId: "action-2", effectId: "compensation" }
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
          operationKey: digest("d"),
          boundary: "external",
          role: "compensation",
          targetEffectReceiptDigest: digest("c")
        }
      },
      {
        kind: "effect-receipt-recorded",
        data: {
          effectId: "compensation",
          operationKey: digest("d"),
          boundary: "external",
          outcome: "committed",
          receiptDigest: digest("e")
        }
      }
    ]);

    // When replayed
    const replay = await replayV2WorkJournal(journal);

    // Then the original remains committed and the forward receipt targets it
    if (!replay.ok) throw new Error(replay.reasonCode);
    expect(replay.value.effects[0].outcome).toBe("committed");
    expect(replay.value.effects[1].role).toBe("compensation");
    expect(replay.value.effects[1].targetEffectReceiptDigest).toBe(digest("c"));
  });

  test("waits on an unknown external outcome and never proposes blind dispatch", async () => {
    // Given a durable external claim with no receipt
    const journal = await buildWorkJournal("work-unknown", digest("a"), [
      {
        kind: "revision-created",
        data: { revision: 1, previousWorkRevisionDigest: null }
      },
      {
        kind: "attempt-started",
        data: {
          attemptId: "attempt-1",
          attempt: 1,
          runnerKind: "process",
          sessionId: "session-process"
        }
      },
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
          operationKey: digest("b"),
          boundary: "external",
          role: "primary",
          targetEffectReceiptDigest: null
        }
      }
    ]);
    const replay = await replayV2WorkJournal(journal);
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error(replay.reasonCode);

    // When the adapter reports an indeterminate outcome
    const actions = reconcileV2Work(replay.value, [{
      kind: "effect",
      operationKey: digest("b"),
      status: "unknown"
    }]);

    // Then reconcile waits and emits no dispatch
    expect(actions).toEqual([{ kind: "wait", operationKey: digest("b") }]);
    expect(actions.some((action) => action.kind === "dispatch-effect")).toBe(false);
  });

  test("reconciles in-process and process crash cuts by durable identity", async () => {
    // Given one active runner state
    const journal = await buildWorkJournal("work-runner", digest("a"), [
      {
        kind: "revision-created",
        data: { revision: 1, previousWorkRevisionDigest: null }
      },
      {
        kind: "attempt-started",
        data: {
          attemptId: "attempt-1",
          attempt: 1,
          runnerKind: "process",
          sessionId: "session-durable"
        }
      }
    ]);
    const replay = await replayV2WorkJournal(journal);
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error(replay.reasonCode);

    // When exact runner observations are injected
    const running = reconcileV2Work(replay.value, [{
      kind: "runner",
      runnerKind: "process",
      sessionId: "session-durable",
      status: "running"
    }]);
    const missing = reconcileV2Work(replay.value, [{
      kind: "runner",
      runnerKind: "process",
      sessionId: "session-durable",
      status: "missing"
    }]);
    const terminal = reconcileV2Work(replay.value, [{
      kind: "runner",
      runnerKind: "process",
      sessionId: "session-durable",
      status: "terminal",
      terminalReceiptDigest: digest("c")
    }]);
    const wrongSession = reconcileV2Work(replay.value, [{
      kind: "runner",
      runnerKind: "process",
      sessionId: "other-session",
      status: "running"
    }]);

    // Then reattach, missing-terminal recording, terminal recording, and no-op remain distinct
    expect(running[0]?.kind).toBe("reattach");
    expect(missing[0]?.kind).toBe("record-runner-missing");
    expect(terminal[0]?.kind).toBe("record-terminal");
    expect(wrongSession[0]?.kind).toBe("noop");
  });
});
