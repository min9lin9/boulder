import { describe, expect, test } from "bun:test";
import { isV2Digest } from "../src/v2/contracts.js";
import {
  buildWorkJournal,
  digest,
  replayWorkJournal as replayV2WorkJournal
} from "./helpers/v2-work.js";

describe("REF-E-WORK-01 three-scenario harness", () => {
  test("completes local-only Work without approval or effect records", async () => {
    // Given the local no-approval scenario
    const journal = await buildWorkJournal("work-local", digest("a"), [
      {
        kind: "revision-created",
        data: { revision: 1, previousWorkRevisionDigest: null }
      },
      {
        kind: "attempt-started",
        data: {
          attemptId: "attempt-1",
          attempt: 1,
          runnerKind: "in-process",
          sessionId: "session-local"
        }
      },
      {
        kind: "attempt-terminal",
        data: {
          attemptId: "attempt-1",
          status: "completed",
          terminalReceiptDigest: digest("b")
        }
      },
      {
        kind: "completion-recorded",
        data: {
          terminalReceiptDigest: digest("b"),
          completionDigest: digest("c"),
          sinkId: "sink-local"
        }
      }
    ]);

    // When replayed from durable JSONL
    const replay = await replayV2WorkJournal(journal);

    // Then completion is terminal and no authority/effect was invented
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error(replay.reasonCode);
    expect(replay.value.status).toBe("completed");
    expect(replay.value.approvals).toHaveLength(0);
    expect(replay.value.effects).toHaveLength(0);
    expect(isV2Digest(replay.value.completion?.completionDigest)).toBe(true);
    expect(replay.value.completion?.terminalReceiptDigest)
      .toBe(replay.value.attempts[0]?.terminalReceiptDigest);
  });

  test("requires durable approval, claim, effect receipt, terminal, then completion", async () => {
    // Given the external-effect scenario in required order
    const journal = await buildWorkJournal("work-external", digest("a"), [
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
          sessionId: "session-external"
        }
      },
      {
        kind: "approval-requested",
        data: { gateId: "gate-1", actionId: "action-transient", effectId: "effect-1" }
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
      },
      {
        kind: "effect-receipt-recorded",
        data: {
          effectId: "effect-1",
          operationKey: digest("b"),
          boundary: "external",
          outcome: "committed",
          receiptDigest: digest("c")
        }
      },
      {
        kind: "attempt-terminal",
        data: {
          attemptId: "attempt-1",
          status: "completed",
          terminalReceiptDigest: digest("d")
        }
      },
      {
        kind: "completion-recorded",
        data: {
          terminalReceiptDigest: digest("d"),
          completionDigest: digest("e"),
          sinkId: "sink-external"
        }
      }
    ]);

    // When replayed
    const replay = await replayV2WorkJournal(journal);

    // Then the durable gate, not transient action, binds the committed effect
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error(replay.reasonCode);
    expect(replay.value.status).toBe("completed");
    expect(replay.value.approvals[0].gateId).toBe("gate-1");
    expect(replay.value.effects[0].receiptDigest).toBe(digest("c"));
  });

  test("fails, retries one revision, critiques, recovers, and executes a new revision", async () => {
    // Given the complete revision/retry/rollback scenario
    const journal = await buildWorkJournal("work-revision", digest("a"), [
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
        kind: "attempt-terminal",
        data: {
          attemptId: "attempt-1",
          status: "failed",
          terminalReceiptDigest: digest("b")
        }
      },
      {
        kind: "attempt-started",
        data: {
          attemptId: "attempt-2",
          attempt: 2,
          runnerKind: "process",
          sessionId: "session-2"
        }
      },
      {
        kind: "effect-claimed",
        data: {
          gateId: null,
          effectId: "local-effect",
          operationKey: digest("c"),
          boundary: "local",
          role: "primary",
          checkpointDigest: digest("d"),
          targetEffectReceiptDigest: null
        }
      },
      {
        kind: "effect-receipt-recorded",
        data: {
          effectId: "local-effect",
          operationKey: digest("c"),
          boundary: "local",
          outcome: "committed",
          receiptDigest: digest("e")
        }
      },
      {
        kind: "attempt-terminal",
        data: {
          attemptId: "attempt-2",
          status: "failed",
          terminalReceiptDigest: digest("f")
        }
      },
      {
        kind: "critique-recorded",
        data: { critiqueDigest: digest("b"), requiresMaterialChange: true }
      },
      {
        kind: "revision-created",
        workRevisionDigest: digest("c"),
        data: { revision: 2, previousWorkRevisionDigest: digest("a") }
      },
      {
        kind: "rollback-recorded",
        data: {
          targetEffectReceiptDigest: digest("e"),
          checkpointDigest: digest("d"),
          receiptDigest: digest("a"),
          outcome: "rolled-back"
        }
      },
      {
        kind: "attempt-started",
        workRevisionDigest: digest("c"),
        data: {
          attemptId: "attempt-3",
          attempt: 1,
          runnerKind: "process",
          sessionId: "session-3"
        }
      },
      {
        kind: "attempt-terminal",
        workRevisionDigest: digest("c"),
        data: {
          attemptId: "attempt-3",
          status: "completed",
          terminalReceiptDigest: digest("d")
        }
      },
      {
        kind: "completion-recorded",
        workRevisionDigest: digest("c"),
        data: {
          terminalReceiptDigest: digest("d"),
          completionDigest: digest("e"),
          sinkId: "sink-revision"
        }
      }
    ]);

    // When replayed
    const replay = await replayV2WorkJournal(journal);

    // Then retry preserved r1 and recovery preceded r2 execution
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error(replay.reasonCode);
    const retryRevisionDigests = replay.value.attempts
      .slice(0, 2)
      .map((item) => item.workRevisionDigest);
    expect(retryRevisionDigests).toHaveLength(2);
    expect(retryRevisionDigests[0] === retryRevisionDigests[1]).toBe(true);
    expect(retryRevisionDigests[0] === replay.value.currentRevisionDigest).toBe(false);
    expect(replay.value.currentRevision).toBe(2);
    expect(isV2Digest(replay.value.currentRevisionDigest)).toBe(true);
    expect(replay.value.recoveries[0].outcome).toBe("rolled-back");
    expect(replay.value.status).toBe("completed");
  });
});
