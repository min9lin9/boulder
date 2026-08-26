import { describe, expect, test } from "bun:test";
import {
  V2_WORK_ATTEMPT_SCHEMA_VERSION,
  V2_WORK_REVISION_SCHEMA_VERSION,
  V2_WORK_TERMINAL_SCHEMA_VERSION,
  createV2WorkAttempt,
  createV2WorkRevision
} from "../src/v2/work.js";
import {
  V2_DURABLE_WORK_ATTEMPT_SCHEMA_VERSION,
  V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION,
  V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
  createV2DurableWorkAttempt,
  createV2DurableWorkCompletion,
  createV2DurableWorkRevision,
  createV2DurableWorkTerminalReceipt,
  retryV2DurableWorkAttempt
} from "../src/v2/work-durable.js";
import { digest, timestamp } from "./helpers/v2-work.js";

describe("v2 durable Work identity", () => {
  test("keeps exact-field v1 projections frozen while adding versioned durable records", async () => {
    // Given the landed exact-field v1 candidate
    const revision = await createV2WorkRevision({
      workId: "work-v1",
      revision: 1,
      procedureDigest: digest("a"),
      resolvedContract: { objective: "unchanged" }
    });
    expect(revision.ok).toBe(true);
    if (!revision.ok) throw new Error(revision.reasonCode);
    const attempt = createV2WorkAttempt({
      attemptId: "attempt-v1",
      attempt: 1,
      workRevisionDigest: revision.value.workRevisionDigest
    });
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) throw new Error(attempt.reasonCode);

    // When the additive durable revision is created
    const durable = await createV2DurableWorkRevision({
      workId: "work-v2",
      procedureDigest: digest("a"),
      resolvedContract: { objective: "durable" }
    });

    // Then v1 names and exact shapes remain unchanged
    expect(V2_WORK_REVISION_SCHEMA_VERSION).toBe("boulder.v2.work-revision.v1");
    expect(V2_WORK_ATTEMPT_SCHEMA_VERSION).toBe("boulder.v2.work-attempt.v1");
    expect(V2_WORK_TERMINAL_SCHEMA_VERSION).toBe("boulder.v2.work-terminal.v1");
    expect(Object.keys(revision.value).sort()).toEqual([
      "procedureDigest", "resolvedContract", "revision", "schemaVersion",
      "workId", "workRevisionDigest"
    ]);
    expect(Object.keys(attempt.value).sort()).toEqual([
      "attempt", "attemptId", "schemaVersion", "workRevisionDigest"
    ]);
    expect(durable.ok).toBe(true);
    if (!durable.ok) throw new Error(durable.reasonCode);
    expect(durable.value.schemaVersion).toBe(V2_DURABLE_WORK_REVISION_SCHEMA_VERSION);
  });

  test("retries only a retryable failed terminal on the same immutable revision", async () => {
    // Given one durable revision, attempt, and exact retryable failure
    const revision = await createV2DurableWorkRevision({
      workId: "work-retry",
      procedureDigest: digest("a"),
      resolvedContract: { objective: "retry" }
    });
    expect(revision.ok).toBe(true);
    if (!revision.ok) throw new Error(revision.reasonCode);
    const attempt = await createV2DurableWorkAttempt({
      workId: revision.value.workId,
      attemptId: "attempt-1",
      attempt: 1,
      workRevisionDigest: revision.value.workRevisionDigest,
      runnerKind: "process",
      sessionId: "session-1"
    });
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) throw new Error(attempt.reasonCode);
    const failed = await createV2DurableWorkTerminalReceipt({
      workId: revision.value.workId,
      workRevisionDigest: revision.value.workRevisionDigest,
      attemptId: attempt.value.attemptId,
      runtimeWorkId: "runtime-1",
      status: "failed",
      failure: { code: "executor.failed", retryable: true },
      terminalAt: timestamp(1)
    });
    expect(failed.ok).toBe(true);
    if (!failed.ok) throw new Error(failed.reasonCode);

    // When retry is requested with a deterministic next identity
    const retry = await retryV2DurableWorkAttempt({
      priorAttempt: attempt.value,
      failedReceipt: failed.value,
      nextAttemptId: "attempt-2",
      runnerKind: "process",
      sessionId: "session-2"
    });

    // Then attempt increments and revision identity is preserved
    expect(retry.ok).toBe(true);
    if (!retry.ok) throw new Error(retry.reasonCode);
    expect(retry.value.schemaVersion).toBe(V2_DURABLE_WORK_ATTEMPT_SCHEMA_VERSION);
    expect(retry.value.attempt).toBe(2);
    expect(retry.value.workRevisionDigest).toBe(attempt.value.workRevisionDigest);
    expect(retry.value.submissionKey).not.toBe(attempt.value.submissionKey);
    const completed = await createV2DurableWorkTerminalReceipt({
      workId: revision.value.workId,
      workRevisionDigest: revision.value.workRevisionDigest,
      attemptId: attempt.value.attemptId,
      runtimeWorkId: "runtime-1",
      status: "completed",
      resultDigest: digest("b"),
      evidenceDigests: [],
      terminalAt: timestamp(2)
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) throw new Error(completed.reasonCode);
    expect((await retryV2DurableWorkAttempt({
      priorAttempt: attempt.value,
      failedReceipt: completed.value,
      nextAttemptId: "attempt-2",
      runnerKind: "process",
      sessionId: "session-2"
    })).ok).toBe(false);
  });

  test("creates a linked revision only for material critique changes", async () => {
    // Given an initial durable revision
    const initial = await createV2DurableWorkRevision({
      workId: "work-revision",
      procedureDigest: digest("a"),
      resolvedContract: { objective: "first" }
    });
    expect(initial.ok).toBe(true);
    if (!initial.ok) throw new Error(initial.reasonCode);

    // When critique requests changed material
    const changed = await createV2DurableWorkRevision({
      workId: initial.value.workId,
      procedureDigest: digest("a"),
      resolvedContract: { objective: "second" },
      priorRevision: initial.value,
      critique: {
        critiqueDigest: digest("c"),
        failedTerminalReceiptDigest: digest("d")
      }
    });

    // Then the next revision links its parent and semantic change
    expect(changed.ok).toBe(true);
    if (!changed.ok) throw new Error(changed.reasonCode);
    expect(changed.value.revision).toBe(2);
    expect(changed.value.previousWorkRevisionDigest).toBe(initial.value.workRevisionDigest);
    expect(changed.value.semanticDigest).not.toBe(initial.value.semanticDigest);
    expect((await createV2DurableWorkRevision({
      workId: initial.value.workId,
      procedureDigest: digest("a"),
      resolvedContract: { objective: "first" },
      priorRevision: initial.value,
      critique: {
        critiqueDigest: digest("c"),
        failedTerminalReceiptDigest: digest("d")
      }
    })).ok).toBe(false);
    expect((await createV2DurableWorkRevision({
      workId: "other-work",
      procedureDigest: digest("a"),
      resolvedContract: { objective: "second" },
      priorRevision: initial.value,
      critique: {
        critiqueDigest: digest("c"),
        failedTerminalReceiptDigest: digest("d")
      }
    })).ok).toBe(false);
  });

  test("creates one durable logical completion from an exact completed terminal", async () => {
    // Given one exact completed terminal receipt
    const terminal = await createV2DurableWorkTerminalReceipt({
      workId: "work-complete",
      workRevisionDigest: digest("a"),
      attemptId: "attempt-complete",
      runtimeWorkId: "runtime-complete",
      status: "completed",
      resultDigest: digest("b"),
      evidenceDigests: [digest("c")],
      terminalAt: timestamp(3)
    });
    expect(terminal.ok).toBe(true);
    if (!terminal.ok) throw new Error(terminal.reasonCode);

    // When completion is delivered and physically repeated
    const first = await createV2DurableWorkCompletion({
      terminalReceipt: terminal.value,
      sinkId: "sink-one"
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.reasonCode);
    const duplicate = await createV2DurableWorkCompletion({
      terminalReceipt: terminal.value,
      sinkId: "sink-one",
      priorCompletion: first.value
    });

    // Then both deliveries converge on one logical receipt
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) throw new Error(duplicate.reasonCode);
    expect(duplicate.replayed).toBe(true);
    expect(duplicate.value).toEqual(first.value);
    expect(first.value.schemaVersion).toBe(V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION);
    const failed = await createV2DurableWorkTerminalReceipt({
      workId: "work-complete",
      workRevisionDigest: digest("a"),
      attemptId: "attempt-complete",
      runtimeWorkId: "runtime-complete",
      status: "failed",
      failure: { code: "failed", retryable: false },
      terminalAt: timestamp(4)
    });
    expect(failed.ok).toBe(true);
    if (!failed.ok) throw new Error(failed.reasonCode);
    expect((await createV2DurableWorkCompletion({
      terminalReceipt: failed.value,
      sinkId: "sink-one"
    })).ok).toBe(false);
    expect((await createV2DurableWorkCompletion({
      terminalReceipt: terminal.value,
      sinkId: "other-sink",
      priorCompletion: first.value
    })).ok).toBe(false);
  });
});
