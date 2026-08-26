import { describe, expect, test } from "bun:test";
import { canonicalizeV2 } from "../src/v2/canonical.js";
import {
  appendV2WorkEvent,
  canonicalizeV2WorkEvent,
  createV2WorkEvent,
  parseV2WorkJournal
} from "../src/v2/work-events.js";
import {
  buildWorkJournal,
  canonicalRevisionEventRecord,
  digest,
  timestamp
} from "./helpers/v2-work.js";

describe("v2 Work canonical event journal", () => {
  test("parses strict chained canonical LF-terminated JSONL", async () => {
    // Given a deterministic two-event journal
    const journal = await buildWorkJournal("work-events", digest("a"), [
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
          sessionId: "session-1"
        }
      }
    ]);

    // When the persisted journal is parsed
    const parsed = await parseV2WorkJournal(journal);

    // Then sequence, link, and canonical bytes are retained
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.reasonCode);
    expect(parsed.value).toHaveLength(2);
    expect(parsed.value[0].previousEventDigest).toBeNull();
    expect(parsed.value[1].previousEventDigest).toBe(parsed.value[0].eventDigest);
    expect(journal).toBe(`${parsed.value.map(canonicalizeV2WorkEvent).join("\n")}\n`);
  });

  test("fails closed on noncanonical, malformed, partial, blank, unknown, and tampered records", async () => {
    // Given one valid canonical event
    const journal = await buildWorkJournal("work-invalid", digest("a"), [
      {
        kind: "revision-created",
        data: { revision: 1, previousWorkRevisionDigest: null }
      }
    ]);
    const value = JSON.parse(journal.trim()) as Record<string, unknown>;

    // When each persisted boundary is mutated
    const mutations = [
      journal.trim(),
      `${journal}\n`,
      `${journal}{"schemaVersion":`,
      journal.replace("{", "{ "),
      `${canonicalizeV2({ ...value, unexpected: true })}\n`,
      `${canonicalizeV2({
        ...value,
        data: { revision: 2, previousWorkRevisionDigest: null }
      })}\n`
    ];

    // Then every mutation is rejected
    for (const mutation of mutations) {
      expect((await parseV2WorkJournal(mutation)).ok).toBe(false);
    }
  });

  test("deduplicates exact appends and rejects same-id conflicts", async () => {
    // Given one persisted event
    const revisionRecord = await canonicalRevisionEventRecord("work-append", 1, null);
    const first = await createV2WorkEvent({
      eventId: "event-fixed",
      sequence: 1,
      occurredAt: timestamp(1),
      workId: "work-append",
      workRevisionDigest: revisionRecord.workRevisionDigest,
      previousEventDigest: null,
      kind: "revision-created",
      data: revisionRecord.data
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.reasonCode);
    const journal = `${canonicalizeV2WorkEvent(first.value)}\n`;

    // When the same physical append is repeated
    const duplicate = await appendV2WorkEvent(journal, first.value);

    // Then bytes are unchanged and a conflicting body is rejected
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) throw new Error(duplicate.reasonCode);
    expect(duplicate.replayed).toBe(true);
    expect(duplicate.value).toBe(journal);
    const conflict = await createV2WorkEvent({
      eventId: "event-fixed",
      sequence: 1,
      occurredAt: timestamp(2),
      workId: "work-append",
      workRevisionDigest: revisionRecord.workRevisionDigest,
      previousEventDigest: null,
      kind: "revision-created",
      data: revisionRecord.data
    });
    expect(conflict.ok).toBe(true);
    if (!conflict.ok) throw new Error(conflict.reasonCode);
    expect((await appendV2WorkEvent(journal, conflict.value)).ok).toBe(false);
  });

  test("rejects broken sequence and previous-event links", async () => {
    // Given a valid first event
    const revisionRecord = await canonicalRevisionEventRecord("work-link", 1, null);
    const first = await createV2WorkEvent({
      eventId: "event-1",
      sequence: 1,
      occurredAt: timestamp(1),
      workId: "work-link",
      workRevisionDigest: revisionRecord.workRevisionDigest,
      previousEventDigest: null,
      kind: "revision-created",
      data: revisionRecord.data
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.reasonCode);

    // When a canonical second event skips sequence and names the wrong head
    const broken = await createV2WorkEvent({
      eventId: "event-2",
      sequence: 3,
      occurredAt: timestamp(2),
      workId: "work-link",
      workRevisionDigest: revisionRecord.workRevisionDigest,
      previousEventDigest: digest("f"),
      kind: "attempt-started",
      data: {
        attemptId: "attempt-1",
        attempt: 1,
        runnerKind: "process",
        sessionId: "session-1"
      }
    });
    expect(broken.ok).toBe(true);
    if (!broken.ok) throw new Error(broken.reasonCode);
    const journal = `${canonicalizeV2WorkEvent(first.value)}\n${canonicalizeV2WorkEvent(broken.value)}\n`;

    // Then replay-bound parsing rejects the chain
    expect((await parseV2WorkJournal(journal)).ok).toBe(false);
  });
});
