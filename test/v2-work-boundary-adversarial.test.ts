import { describe, expect, test } from "bun:test";
import type { V2DurableWorkCompletion } from "../src/v2/work-durable.js";
import {
  createV2DurableWorkCompletion,
  createV2DurableWorkRevision,
  createV2DurableWorkTerminalReceipt
} from "../src/v2/work-durable.js";
import {
  appendV2WorkEvent,
  canonicalizeV2WorkEvent,
  createV2WorkEvent,
  parseV2WorkJournal,
  type V2WorkEvent
} from "../src/v2/work-events.js";
import {
  canonicalRevisionEventRecord,
  digest,
  timestamp
} from "./helpers/v2-work.js";

const journalLimitReason = "v2.work.journal_limit_exceeded";

async function completedTerminal(workId = "work-boundary") {
  const terminal = await createV2DurableWorkTerminalReceipt({
    workId,
    workRevisionDigest: digest("a"),
    attemptId: "attempt-boundary",
    runtimeWorkId: "runtime-boundary",
    status: "completed",
    resultDigest: digest("b"),
    evidenceDigests: [digest("c")],
    terminalAt: timestamp(1)
  });
  expect(terminal.ok).toBe(true);
  if (!terminal.ok) throw new Error(terminal.reasonCode);
  return terminal.value;
}

describe("v2 Work durable and event boundary adversarial regressions", () => {
  test("rejects malformed failed-terminal fields before hashing", async () => {
    const malformedFailures = [
      { code: "", retryable: true },
      { code: 42, retryable: true },
      { code: "executor.failed", retryable: "yes" },
      { code: "executor.failed", retryable: true, unexpected: "field" }
    ];

    for (const failure of malformedFailures) {
      const result = await createV2DurableWorkTerminalReceipt({
        workId: "work-failed-fields",
        workRevisionDigest: digest("a"),
        attemptId: "attempt-failed-fields",
        runtimeWorkId: "runtime-failed-fields",
        status: "failed",
        failure,
        terminalAt: timestamp(1)
      } as never);
      expect(result.ok).toBe(false);
    }
  });

  test("deep-freezes a revision resolvedContract after hashing", async () => {
    const revision = await createV2DurableWorkRevision({
      workId: "work-frozen-revision",
      procedureDigest: digest("a"),
      resolvedContract: {
        objective: { text: "immutable" },
        requirements: [{ id: "requirement-one" }]
      }
    });
    expect(revision.ok).toBe(true);
    if (!revision.ok) throw new Error(revision.reasonCode);
    const contract = revision.value.resolvedContract as {
      readonly objective: { readonly text: string };
      readonly requirements: readonly [{ readonly id: string }];
    };

    expect([
      Object.isFrozen(contract),
      Object.isFrozen(contract.objective),
      Object.isFrozen(contract.requirements),
      Object.isFrozen(contract.requirements[0])
    ]).toEqual([true, true, true, true]);
  });

  test("deep-freezes completed-terminal evidence after hashing", async () => {
    const terminal = await completedTerminal("work-frozen-evidence");
    if (terminal.status !== "completed") throw new Error("completed terminal required");

    expect(Object.isFrozen(terminal.evidenceDigests)).toBe(true);
  });

  test("deep-freezes failed-terminal failure details after hashing", async () => {
    const terminal = await createV2DurableWorkTerminalReceipt({
      workId: "work-frozen-failure",
      workRevisionDigest: digest("a"),
      attemptId: "attempt-frozen-failure",
      runtimeWorkId: "runtime-frozen-failure",
      status: "failed",
      failure: { code: "executor.failed", retryable: true },
      terminalAt: timestamp(1)
    });
    expect(terminal.ok).toBe(true);
    if (!terminal.ok) throw new Error(terminal.reasonCode);
    if (terminal.value.status !== "failed") throw new Error("failed terminal required");

    expect(Object.isFrozen(terminal.value.failure)).toBe(true);
  });

  test("freezes event data after hashing", async () => {
    const revisionRecord = await canonicalRevisionEventRecord(
      "work-frozen-event",
      1,
      null
    );
    const event = await createV2WorkEvent({
      eventId: "event-frozen-data",
      sequence: 1,
      occurredAt: timestamp(1),
      workId: "work-frozen-event",
      workRevisionDigest: revisionRecord.workRevisionDigest,
      previousEventDigest: null,
      kind: "revision-created",
      data: revisionRecord.data
    });
    expect(event.ok).toBe(true);
    if (!event.ok) throw new Error(event.reasonCode);

    expect(Object.isFrozen(event.value.data)).toBe(true);
  });

  test("validates a duplicate event's full body before declaring replay", async () => {
    const revisionRecord = await canonicalRevisionEventRecord(
      "work-duplicate-body",
      1,
      null
    );
    const event = await createV2WorkEvent({
      eventId: "event-duplicate-body",
      sequence: 1,
      occurredAt: timestamp(1),
      workId: "work-duplicate-body",
      workRevisionDigest: revisionRecord.workRevisionDigest,
      previousEventDigest: null,
      kind: "revision-created",
      data: revisionRecord.data
    });
    expect(event.ok).toBe(true);
    if (!event.ok) throw new Error(event.reasonCode);
    const journal = `${canonicalizeV2WorkEvent(event.value)}\n`;
    const digestReusedForAlteredBody = {
      ...event.value,
      occurredAt: timestamp(2)
    } as V2WorkEvent;

    expect(await appendV2WorkEvent(journal, digestReusedForAlteredBody)).toEqual({
      ok: false,
      reasonCode: "v2.work.event_digest_invalid"
    });
  });

  for (const field of ["workId", "terminalReceiptDigest", "sinkId"] as const) {
    test(`rejects prior completion with conflicting ${field} despite a reused digest`, async () => {
      const terminal = await completedTerminal(`work-completion-${field.toLowerCase()}`);
      const first = await createV2DurableWorkCompletion({
        terminalReceipt: terminal,
        sinkId: "sink-boundary"
      });
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error(first.reasonCode);
      const conflictingValue = field === "workId"
        ? "other-work"
        : field === "terminalReceiptDigest"
          ? digest("d")
          : "other-sink";
      const forgedPrior = {
        ...first.value,
        [field]: conflictingValue,
        completionDigest: first.value.completionDigest
      } as V2DurableWorkCompletion;

      expect(await createV2DurableWorkCompletion({
        terminalReceipt: terminal,
        sinkId: "sink-boundary",
        priorCompletion: forgedPrior
      })).toEqual({
        ok: false,
        reasonCode: "v2.work.receipt_binding_mismatch"
      });
    });
  }

  test("rejects journal bytes beyond the deterministic 1 MiB input limit", async () => {
    const oversizedJournal = `${" ".repeat(1024 * 1024)}\n`;

    expect(await parseV2WorkJournal(oversizedJournal)).toEqual({
      ok: false,
      reasonCode: journalLimitReason
    });
  });

  test("rejects more than 1000 physical journal records deterministically", async () => {
    const revisionRecord = await canonicalRevisionEventRecord(
      "work-record-limit",
      1,
      null
    );
    const event = await createV2WorkEvent({
      eventId: "event-record-limit",
      sequence: 1,
      occurredAt: timestamp(1),
      workId: "work-record-limit",
      workRevisionDigest: revisionRecord.workRevisionDigest,
      previousEventDigest: null,
      kind: "revision-created",
      data: revisionRecord.data
    });
    expect(event.ok).toBe(true);
    if (!event.ok) throw new Error(event.reasonCode);
    const line = `${canonicalizeV2WorkEvent(event.value)}\n`;

    expect(await parseV2WorkJournal(line.repeat(1001))).toEqual({
      ok: false,
      reasonCode: journalLimitReason
    });
  });
});
