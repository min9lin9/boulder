import { describe, expect, test } from "bun:test";
import {
  canonicalizeDecodedEvent,
  isBatchEnvelope,
  isBinding,
  isInputObservation,
  isSessionSnapshot,
  isViewEntry,
  sourceRevisionForDecodedEvent,
  TraceCanonicalizationError,
  type BatchEnvelope,
  type Binding,
  type InputObservation,
  type SessionSnapshot,
  type ViewEntry
} from "../src/trace/contracts";

function catchSync(fn: () => unknown): unknown {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

function validObservation(): InputObservation {
  return {
    source_row_key: "session-1:1",
    logical_event_id: "openclaw:agent-1:session-1:evt-1",
    source_revision: "a".repeat(64),
    disposition: "normalized",
    reason: null,
    quality_flags: [],
    normalized_facts: { role: "user" }
  };
}

function validSnapshot(): SessionSnapshot {
  return {
    source_instance_id: "11111111-1111-4111-8111-111111111111",
    agent_id: "agent-1",
    session_id: "session-1",
    snapshot_id: "snapshot-1",
    supersedes_snapshot_id: null,
    selection_scope: "session",
    input_inventory: [validObservation()],
    snapshot_digest: "b".repeat(64),
    disposition_counts: { normalized: 1, ignored: 0, quarantined: 0 },
    coverage: { kind: "full_session", input_count: 1 }
  };
}

function validBatchEnvelope(): BatchEnvelope {
  return {
    schema_version: "boulder.trace.batch.v1",
    journal_id: "journal-1",
    batch_id: "batch-1",
    batch_seq: 1,
    previous_segment_hash: null,
    adapter_id: "openclaw-local",
    interpretation_version: "openclaw-transcript.v1",
    content_policy_version: "trace-content.v1"
  };
}

function validViewEntry(): ViewEntry {
  return {
    kind: "message",
    name: "user message",
    trace_id: "trace-session-1",
    trace_id_basis: "synthetic_session",
    span_id: "span-1",
    source_event_refs: [{ source_row_key: "session-1:1", logical_event_id: "evt-1", source_revision: "a".repeat(64) }],
    source_order: 0,
    display_parent_id: null,
    links: [],
    timing_basis: "unavailable",
    status: "unknown",
    completion_basis: "unknown",
    attributes: {},
    quality_flags: []
  };
}

function validBinding(): Binding {
  return {
    journal_id: "journal-1",
    snapshot_id: "snapshot-1",
    snapshot_digest: "b".repeat(64),
    selected_events: [{ logical_event_id: "evt-1", source_revision: "a".repeat(64) }],
    boulder_command_run_id: "run-1",
    binding_basis: "operator_explicit"
  };
}

describe("canonical decoded-event hashing", () => {
  test("same decoded event yields the same source_revision across stored encodings", async () => {
    // One row stored as plain event_json text, the same event stored as event_zstd
    // whose decoded JSON text orders keys differently. Decoding either payload
    // must produce the same revision (plan v2 A2: compression is not identity).
    const storedEventJson = '{"type":"message","role":"assistant","usage":{"input_tokens":10,"output_tokens":4}}';
    const decodedFromZstd = '{"usage":{"output_tokens":4,"input_tokens":10},"role":"assistant","type":"message"}';

    const fromPlain: unknown = JSON.parse(storedEventJson);
    const fromCompressed: unknown = JSON.parse(decodedFromZstd);

    expect(canonicalizeDecodedEvent(fromPlain)).toBe(canonicalizeDecodedEvent(fromCompressed));
    const revisionPlain = await sourceRevisionForDecodedEvent(fromPlain);
    const revisionCompressed = await sourceRevisionForDecodedEvent(fromCompressed);
    expect(revisionPlain).toBe(revisionCompressed);
    expect(revisionPlain).toMatch(/^[0-9a-f]{64}$/);
  });

  test("canonicalization sorts keys at every object depth", () => {
    expect(canonicalizeDecodedEvent({ b: 1, a: { d: [3, { f: 2, e: 1 }], c: true } }))
      .toBe('{"a":{"c":true,"d":[3,{"e":1,"f":2}]},"b":1}');
  });

  test("canonicalization is deterministic across repeated calls", async () => {
    const decoded: unknown = JSON.parse('{"z":[1,2,{"k":"v"}],"a":null}');
    const first = await sourceRevisionForDecodedEvent(decoded);
    const second = await sourceRevisionForDecodedEvent(decoded);
    expect(first).toBe(second);
  });

  test("canonicalization rejects non-finite usage values", async () => {
    for (const nonFinite of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const decoded = { type: "message", usage: { input_tokens: nonFinite } };
      const caught = catchSync(() => canonicalizeDecodedEvent(decoded));
      expect(caught instanceof TraceCanonicalizationError).toBe(true);
      expect((caught as Error).message).toContain("non-finite number");
      await expect(sourceRevisionForDecodedEvent(decoded)).rejects.toThrow("non-finite number");
    }
  });

  test("canonicalization rejects non-JSON values", () => {
    expect(catchSync(() => canonicalizeDecodedEvent(undefined)) instanceof TraceCanonicalizationError).toBe(true);
    expect(catchSync(() => canonicalizeDecodedEvent(Symbol("x"))) instanceof TraceCanonicalizationError).toBe(true);
    // Object keys with undefined/function/symbol values are dropped, matching
    // JSON.stringify semantics for the same decoded event.
    expect(canonicalizeDecodedEvent({ hook: () => 1, keep: 1, skip: undefined })).toBe('{"keep":1}');
  });
});

describe("contract type guards", () => {
  test("isBatchEnvelope accepts a valid envelope and rejects malformed ones", () => {
    expect(isBatchEnvelope(validBatchEnvelope())).toBe(true);
    expect(isBatchEnvelope({ ...validBatchEnvelope(), schema_version: "boulder.trace.batch.v2" })).toBe(false);
    expect(isBatchEnvelope({ ...validBatchEnvelope(), previous_segment_hash: undefined })).toBe(false);
    expect(isBatchEnvelope({ ...validBatchEnvelope(), batch_seq: "1" })).toBe(false);
    expect(isBatchEnvelope(null)).toBe(false);
    expect(isBatchEnvelope([])).toBe(false);
  });

  test("isInputObservation enforces disposition consistency", () => {
    expect(isInputObservation(validObservation())).toBe(true);

    const ignored: InputObservation = {
      source_row_key: "session-1:2",
      source_revision: "c".repeat(64),
      disposition: "ignored",
      reason: "known structural record without event identity",
      quality_flags: [],
      normalized_facts: null
    };
    expect(isInputObservation(ignored)).toBe(true);

    // A normalized observation must carry facts and no reason.
    expect(isInputObservation({ ...validObservation(), reason: "why" })).toBe(false);
    expect(isInputObservation({ ...validObservation(), normalized_facts: null })).toBe(false);
    // Ignored/quarantined observations must carry a reason and no facts.
    expect(isInputObservation({ ...ignored, reason: null })).toBe(false);
    expect(isInputObservation({ ...ignored, normalized_facts: { role: "user" } })).toBe(false);
    expect(isInputObservation({ ...validObservation(), disposition: "deleted" })).toBe(false);
    expect(isInputObservation({ ...validObservation(), logical_event_id: 7 })).toBe(false);
  });

  test("isSessionSnapshot accepts a valid snapshot and rejects malformed ones", () => {
    expect(isSessionSnapshot(validSnapshot())).toBe(true);
    expect(isSessionSnapshot({ ...validSnapshot(), input_inventory: [{ bad: true }] })).toBe(false);
    expect(isSessionSnapshot({ ...validSnapshot(), coverage: { kind: "partial", input_count: 1 } })).toBe(false);
    expect(isSessionSnapshot({ ...validSnapshot(), supersedes_snapshot_id: undefined })).toBe(false);
    expect(isSessionSnapshot("snapshot")).toBe(false);
  });

  test("isViewEntry accepts entries with and without usage", () => {
    expect(isViewEntry(validViewEntry())).toBe(true);

    const withUsage: ViewEntry = {
      ...validViewEntry(),
      kind: "model",
      usage: { "gen_ai.usage.input_tokens": 10, "gen_ai.usage.output_tokens": 4 },
      usage_basis: "normalized_mapping",
      usage_scope: "model_call",
      usage_evidence_id: "session-1:3"
    };
    expect(isViewEntry(withUsage)).toBe(true);
  });

  test("isViewEntry rejects incomplete or non-finite usage blocks", () => {
    const usage = { "gen_ai.usage.input_tokens": 10 };
    // usage without its basis/scope/evidence fields is not honest usage.
    expect(isViewEntry({ ...validViewEntry(), usage })).toBe(false);
    expect(isViewEntry({
      ...validViewEntry(),
      usage,
      usage_basis: "normalized_mapping",
      usage_scope: "model_call"
    })).toBe(false);
    // basis/scope/evidence without usage is malformed.
    expect(isViewEntry({ ...validViewEntry(), usage_basis: "normalized_mapping" })).toBe(false);
    // Non-finite usage values are rejected.
    expect(isViewEntry({
      ...validViewEntry(),
      usage: { "gen_ai.usage.input_tokens": Number.NaN },
      usage_basis: "normalized_mapping",
      usage_scope: "model_call",
      usage_evidence_id: "session-1:3"
    })).toBe(false);
  });

  test("isViewEntry rejects unknown kinds and fabricated-basis markers", () => {
    expect(isViewEntry({ ...validViewEntry(), kind: "execution" })).toBe(false);
    expect(isViewEntry({ ...validViewEntry(), trace_id_basis: "otel_trace" })).toBe(false);
    expect(isViewEntry({ ...validViewEntry(), timing_basis: "ingestion_time" })).toBe(false);
    expect(isViewEntry({ ...validViewEntry(), display_parent_id: undefined })).toBe(false);
    expect(isViewEntry({ ...validViewEntry(), links: [{ relationship: "parent", target_span_id: "x" }] })).toBe(false);
  });

  test("isBinding accepts a valid binding and rejects malformed ones", () => {
    expect(isBinding(validBinding())).toBe(true);
    expect(isBinding({
      ...validBinding(),
      validated_artifact_refs: [{ kind: "handoff-packet", path: ".boulder/handoffs/a.md", digest: "d".repeat(64) }]
    })).toBe(true);
    expect(isBinding({ ...validBinding(), binding_basis: "inferred" })).toBe(false);
    expect(isBinding({ ...validBinding(), selected_events: [{ logical_event_id: "e" }] })).toBe(false);
    expect(isBinding({ ...validBinding(), validated_artifact_refs: [{ kind: "x", path: "p" }] })).toBe(false);
    expect(isBinding(42)).toBe(false);
  });
});
