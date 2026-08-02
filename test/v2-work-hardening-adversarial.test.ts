import { describe, expect, test } from "bun:test";
import { digestV2 } from "../src/v2/canonical.js";
import { createV2DurableWorkAttempt, createV2DurableWorkRevision, createV2DurableWorkTerminalReceipt } from "../src/v2/work-durable.js";
import { V2_DURABLE_WORK_REVISION_SCHEMA_VERSION } from "../src/v2/work-durable-contracts.js";
import {
  appendV2WorkEvent,
  createV2WorkEvent,
  parseV2WorkJournal
} from "../src/v2/work-events.js";
import { reconcileV2Work, replayV2WorkJournal } from "../src/v2/work-replay.js";
import {
  buildWorkJournal,
  digest,
  replayWorkJournal,
  timestamp,
  trustedReplayOptions,
  type JournalEntry
} from "./helpers/v2-work.js";

describe("v2 Work fresh hardening findings", () => {
  test("durable constructors reject extra keys, invalid discriminants, forged prior records, and oversized values", async () => {
    expect((await createV2DurableWorkAttempt({ workId: "work-hardening", attemptId: "attempt-1", attempt: 1, workRevisionDigest: digest("a"), runnerKind: "remote", sessionId: "session-1", extra: true } as never)).ok).toBe(false);
    expect((await createV2DurableWorkTerminalReceipt({ workId: "work-hardening", workRevisionDigest: digest("a"), attemptId: "attempt-1", runtimeWorkId: "runtime-1", terminalAt: timestamp(1), status: "unknown" } as never)).ok).toBe(false);
    const revision = await createV2DurableWorkRevision({ workId: "work-hardening", procedureDigest: digest("b"), resolvedContract: {} });
    if (!revision.ok) throw new Error(revision.reasonCode);
    expect((await createV2DurableWorkRevision({ workId: "work-hardening", procedureDigest: digest("c"), resolvedContract: { changed: true }, priorRevision: { ...revision.value, workRevisionDigest: digest("f") }, critique: { critiqueDigest: digest("d"), failedTerminalReceiptDigest: digest("e") } })).ok).toBe(false);
    const wide = Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`k${index}`, true]));
    expect((await createV2DurableWorkRevision({ workId: "work-hardening", procedureDigest: digest("b"), resolvedContract: wide })).ok).toBe(false);
    expect((await createV2DurableWorkTerminalReceipt({ workId: "work-hardening", workRevisionDigest: digest("a"), attemptId: "attempt-1", runtimeWorkId: "runtime-1", terminalAt: timestamp(1), status: "completed", resultDigest: digest("b"), evidenceDigests: Array(257).fill(digest("c")) })).ok).toBe(false);
    expect((await createV2DurableWorkTerminalReceipt({
      workId: "work-hardening",
      workRevisionDigest: digest("a"),
      attemptId: "attempt-1",
      runtimeWorkId: "runtime-1",
      terminalAt: timestamp(1),
      status: "failed",
      failure: { code: "x".repeat(65_537), retryable: true }
    })).ok).toBe(false);
  });

  test("event JSON enforces durable collection and string bounds before hashing", async () => {
    for (const resolvedContract of [
      Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`k${index}`, true])),
      { oversized: "x".repeat(65_537) }
    ]) {
      const procedureDigest = digest("e");
      const semanticDigest = await digestV2("boulder.v2.work-semantic.v1", {
        procedureDigest,
        resolvedContract
      });
      const data = {
        revision: 1,
        previousWorkRevisionDigest: null,
        procedureDigest,
        resolvedContract,
        basis: { kind: "initial" },
        semanticDigest
      } as const;
      const workRevisionDigest = await digestV2(
        V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
        {
          schemaVersion: V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
          workId: "work-event-bound",
          ...data
        }
      );
      expect((await createV2WorkEvent({
        eventId: "event-bound",
        sequence: 1,
        occurredAt: timestamp(1),
        workId: "work-event-bound",
        workRevisionDigest,
        previousEventDigest: null,
        kind: "revision-created",
        data
      })).ok).toBe(false);
    }
  });

  test("replay requires a trusted root and authenticated approval", async () => {
    const journal = await buildWorkJournal("work-hardening", digest("a"), [
      { kind: "revision-created", data: { revision: 1, previousWorkRevisionDigest: null } },
      { kind: "attempt-started", data: { attemptId: "attempt-1", attempt: 1, runnerKind: "process", sessionId: "session-1" } },
      { kind: "approval-requested", data: { gateId: "gate-1", actionId: "action-1", effectId: "effect-1" } },
      { kind: "approval-recorded", data: { gateId: "gate-1", effectId: "effect-1", decision: "approved" } }
    ]);
    const options = trustedReplayOptions(journal);
    expect((await replayV2WorkJournal(journal)).ok).toBe(false);
    expect((await replayV2WorkJournal(journal, {
      anchor: options.anchor,
      verifyEvent: () => true
    })).ok).toBe(false);
    expect((await replayV2WorkJournal(journal, options)).ok).toBe(true);
    expect((await replayV2WorkJournal(journal, {
      ...options,
      anchor: { ...options.anchor, rootRevisionDigest: digest("f") }
    })).ok).toBe(false);
  });

  test("replay is deeply frozen and reconcile validates/binds observations and actions", async () => {
    const journal = await buildWorkJournal("work-hardening", digest("a"), [
      { kind: "revision-created", data: { revision: 1, previousWorkRevisionDigest: null } },
      { kind: "attempt-started", data: { attemptId: "attempt-1", attempt: 1, runnerKind: "process", sessionId: "session-1" } }
    ]);
    const replay = await replayV2WorkJournal(journal, trustedReplayOptions(journal));
    if (!replay.ok) throw new Error(replay.reasonCode);
    expect(Object.isFrozen(replay.value.attempts[0])).toBe(true);
    let message = "";
    try {
      reconcileV2Work(replay.value, [{ kind: "runner", runnerKind: "remote" }] as never);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe("v2.work.reconcile_observation_invalid");
    expect(reconcileV2Work(replay.value, [{
      kind: "runner",
      runnerKind: "process",
      sessionId: "session-1",
      status: "missing"
    }])).toEqual([{
      kind: "record-runner-missing",
      workId: "work-hardening",
      attemptId: "attempt-1",
      attempt: 1,
      workRevisionDigest: replay.value.currentRevisionDigest,
      runnerKind: "process",
      sessionId: "session-1",
      failureCode: "runner.missing",
      retryable: true
    }]);
  });

  test("append enforces resulting event limits and physical journals reject duplicates", async () => {
    const entries: readonly JournalEntry[] = [
      { kind: "revision-created", data: { revision: 1, previousWorkRevisionDigest: null } },
      ...Array.from({ length: 999 }, (): JournalEntry => ({
        kind: "attempt-accepted",
        data: { attemptId: "attempt-1", acceptedAt: timestamp(2) }
      }))
    ];
    const journal = await buildWorkJournal("work-limit", digest("a"), entries);
    const parsed = await parseV2WorkJournal(journal);
    if (!parsed.ok) throw new Error(parsed.reasonCode);
    const next = await createV2WorkEvent({
      eventId: "event-1001",
      sequence: 1001,
      occurredAt: timestamp(3),
      workId: "work-limit",
      workRevisionDigest: digest("a"),
      previousEventDigest: parsed.value.at(-1)?.eventDigest ?? null,
      kind: "attempt-accepted",
      data: { attemptId: "attempt-1", acceptedAt: timestamp(3) }
    });
    if (!next.ok) throw new Error(next.reasonCode);
    expect(await appendV2WorkEvent(journal, next.value)).toEqual({
      ok: false,
      reasonCode: "v2.work.journal_limit_exceeded"
    });
    const one = await buildWorkJournal("work-duplicate-line", digest("a"), [entries[0]]);
    expect((await parseV2WorkJournal(`${one}${one}`)).ok).toBe(false);
  });

  test("same-revision retry cannot bypass an unresolved external outcome", async () => {
    const journal = await buildWorkJournal("work-external-retry", digest("a"), [
      { kind: "revision-created", data: { revision: 1, previousWorkRevisionDigest: null } },
      { kind: "attempt-started", data: { attemptId: "attempt-1", attempt: 1, runnerKind: "process", sessionId: "session-1" } },
      { kind: "approval-requested", data: { gateId: "gate-1", actionId: "action-1", effectId: "effect-1" } },
      { kind: "approval-recorded", data: { gateId: "gate-1", effectId: "effect-1", decision: "approved" } },
      { kind: "effect-claimed", data: { gateId: "gate-1", effectId: "effect-1", operationKey: digest("c"), boundary: "external", role: "primary", targetEffectReceiptDigest: null } },
      { kind: "attempt-terminal", data: { attemptId: "attempt-1", status: "failed", terminalReceiptDigest: digest("d") } },
      { kind: "attempt-started", data: { attemptId: "attempt-2", attempt: 2, runnerKind: "process", sessionId: "session-2" } }
    ]);
    expect(await replayWorkJournal(journal)).toEqual({
      ok: false,
      reasonCode: "v2.work.recovery_required"
    });
  });

  test("effect identities are unique and no recovery transition follows completion", async () => {
    const duplicateClaim = await buildWorkJournal("work-effect-identity", digest("a"), [
      { kind: "revision-created", data: { revision: 1, previousWorkRevisionDigest: null } },
      { kind: "attempt-started", data: { attemptId: "attempt-1", attempt: 1, runnerKind: "process", sessionId: "session-1" } },
      { kind: "effect-claimed", data: { gateId: null, effectId: "effect-1", operationKey: digest("b"), boundary: "local", role: "primary", checkpointDigest: digest("c"), targetEffectReceiptDigest: null } },
      { kind: "effect-claimed", data: { gateId: null, effectId: "effect-1", operationKey: digest("d"), boundary: "local", role: "primary", checkpointDigest: digest("e"), targetEffectReceiptDigest: null } }
    ]);
    expect((await replayWorkJournal(duplicateClaim)).ok).toBe(false);

    const postCompletion = await buildWorkJournal("work-post-completion", digest("a"), [
      { kind: "revision-created", data: { revision: 1, previousWorkRevisionDigest: null } },
      { kind: "attempt-started", data: { attemptId: "attempt-1", attempt: 1, runnerKind: "process", sessionId: "session-1" } },
      { kind: "effect-claimed", data: { gateId: null, effectId: "effect-1", operationKey: digest("b"), boundary: "local", role: "primary", checkpointDigest: digest("c"), targetEffectReceiptDigest: null } },
      { kind: "effect-receipt-recorded", data: { effectId: "effect-1", operationKey: digest("b"), boundary: "local", outcome: "committed", receiptDigest: digest("d") } },
      { kind: "rollback-recorded", data: { targetEffectReceiptDigest: digest("d"), checkpointDigest: digest("c"), receiptDigest: digest("e"), outcome: "rolled-back" } },
      { kind: "attempt-terminal", data: { attemptId: "attempt-1", status: "completed", terminalReceiptDigest: digest("e") } },
      { kind: "completion-recorded", data: { terminalReceiptDigest: digest("e"), completionDigest: digest("f"), sinkId: "sink-1" } },
      { kind: "rollback-recorded", data: { targetEffectReceiptDigest: digest("d"), checkpointDigest: digest("c"), receiptDigest: digest("f"), outcome: "rolled-back" } }
    ]);
    expect((await replayWorkJournal(postCompletion)).ok).toBe(false);
  });
});
