import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { isInputObservation, sourceRevisionForDecodedEvent } from "../src/trace/contracts";
import { acquireSession, type AcquiredRow, type OpenClawAcquisition } from "../src/trace/openclaw-adapter";
import { normalizeSession, reconcileManifest, OPENCLAW_NORMALIZATION_RULES } from "../src/trace/normalize";

const FIXTURES = join(import.meta.dir, "..", "fixtures", "trace", "openclaw", "30afbaf8-claim");
const CONTEXT = { source_instance_id: "source-fixture", agent_id: "agent-fixture" };

// The real adapter reads shipped databases through bun:sqlite in readonly mode,
// including real zstd decoding. No test writes or regenerates the fixtures.
const fixture = (name: string, session: string) => acquireSession(join(FIXTURES, name), session);
const happy = () => fixture("case-01-plain.sqlite", "sess-plain-001");

function withEvents(base: OpenClawAcquisition, events: readonly unknown[]): OpenClawAcquisition {
  const rows: AcquiredRow[] = events.map((event, index) => {
    const text = JSON.stringify(event);
    const bytes = new TextEncoder().encode(text).byteLength;
    return {
      locator: { session_id: base.session.sessionId, seq: index + 1 },
      encoding: "plain", declaredUtf8Bytes: bytes, encodedBytes: bytes, decodedBytes: bytes,
      decodedText: text, decodedJson: event, decodeStatus: { kind: "ok" }
    };
  });
  return { ...base, session: { ...base.session, rowCount: rows.length }, rows };
}

function withRows(base: OpenClawAcquisition, rows: readonly AcquiredRow[]): OpenClawAcquisition {
  return { ...base, session: { ...base.session, rowCount: rows.length }, rows };
}

const message = { type: "message", role: "assistant", content: "PRIVATE_BODY" };
const call = { type: "tool_call", requestId: "request-a", tool: "shell", args: { command: "PRIVATE_ARGS" } };
const result = { type: "tool_result", requestId: "request-a", ok: true, output: "PRIVATE_OUTPUT" };

async function interpret(base: OpenClawAcquisition, events: readonly unknown[]) {
  return normalizeSession(withEvents(base, events), CONTEXT);
}

describe("OpenClaw transcript normalization", () => {
  test("case-01: five accounted semantic rows, metadata only, no invented execution", async () => {
    const acquired = await happy();
    const normalized = await normalizeSession(acquired, CONTEXT);
    expect(normalized.disposition_counts).toEqual({ normalized: 5, ignored: 0, quarantined: 0 });
    expect(normalized.coverage).toEqual({ kind: "full_session", input_count: 5 });
    expect(normalized.interpretation_version).toBe(acquired.interpretationVersion);
    expect(normalized.input_inventory.map((row) => row.normalized_facts?.event_type))
      .toEqual(["model", "message", "tool_call", "tool_result", "message"]);
    for (const [index, observation] of normalized.input_inventory.entries()) {
      expect(isInputObservation(observation)).toBe(true);
      expect(observation.source_row_key).toBe(JSON.stringify([acquired.session.sessionId, index + 1]));
      expect(observation.source_revision).toBe(await sourceRevisionForDecodedEvent(acquired.rows[index].decodedJson));
      expect(observation.logical_event_id).toBe(undefined);
      expect(observation.normalized_facts?.source_order).toBe(index + 1);
      expect(observation.normalized_facts?.timestamp).toBe((acquired.rows[index].decodedJson as { ts: string }).ts);
      for (const field of ["execution_id", "execution_parent_span_id", "duration_ms", "start_time", "end_time", "content", "args", "output"]) {
        expect(observation.normalized_facts?.[field]).toBe(undefined);
      }
    }
    expect(normalized.input_inventory[0].normalized_facts?.model_operation).toBe(false);
    expect(normalized.input_inventory[2].normalized_facts?.status).toBe("unknown");
    expect(normalized.input_inventory[3].normalized_facts?.request_event_ref).toEqual({
      source_row_key: normalized.input_inventory[2].source_row_key,
      source_revision: normalized.input_inventory[2].source_revision
    });
  });

  test("remaining valid fixtures normalize all rows, including actual zstd and missing timing", async () => {
    for (const [name, session, count] of [
      ["case-02-zstd.sqlite", "sess-zstd-001", 4],
      ["case-03-inplace-update.sqlite", "sess-update-001", 3],
      ["case-04-missing-timing.sqlite", "sess-notiming-001", 4],
      ["case-05-tool-pair.sqlite", "sess-tools-001", 4]
    ] as const) {
      const normalized = await normalizeSession(await fixture(name, session), CONTEXT);
      expect(normalized.disposition_counts).toEqual({ normalized: count, ignored: 0, quarantined: 0 });
      expect(normalized.input_inventory.every(isInputObservation)).toBe(true);
      if (session === "sess-notiming-001") {
        for (const row of normalized.input_inventory) {
          expect(row.quality_flags).toContain("timing_unavailable");
          expect(row.normalized_facts?.timestamp).toBe(undefined);
          expect(row.normalized_facts?.duration_ms).toBe(undefined);
        }
      }
      if (session === "sess-tools-001") {
        expect(normalized.input_inventory[2].normalized_facts?.request_event_ref).toEqual({
          source_row_key: normalized.input_inventory[1].source_row_key,
          source_revision: normalized.input_inventory[1].source_revision
        });
        expect(normalized.input_inventory[3].normalized_facts?.status).toBe("error");
      }
    }
  });

  test("case-06: negative usage, dangling result, unknown role and corrupt JSON are quarantined, never dropped", async () => {
    const acquired = await fixture("case-06-malformed.sqlite", "sess-malformed-001");
    const normalized = await normalizeSession(acquired, CONTEXT);
    expect(normalized.input_inventory).toHaveLength(acquired.rows.length);
    expect(normalized.disposition_counts).toEqual({ normalized: 1, ignored: 0, quarantined: 4 });
    expect(normalized.input_inventory.map((row) => row.reason))
      .toEqual([null, "invalid_usage_value", "dangling_tool_result", "unknown_message_role", "decode_parse"]);
    for (const row of normalized.input_inventory.slice(1)) {
      expect(row.disposition).toBe("quarantined");
      expect(isInputObservation(row)).toBe(true);
      expect(row.normalized_facts).toBeNull();
      expect(row.source_revision).toMatch(/^[a-f0-9]{64}$/);
      expect(row.reason!.length <= 160).toBe(true);
      expect(row.reason).not.toContain("orphaned result");
      expect(row.reason).not.toContain("{not valid json");
    }
    expect(normalized.input_inventory[4].quality_flags).toContain("source_revision_decoded_text");
  });

  test("allowlisted headers are ignored; unknown types and versions are not", async () => {
    const base = await happy();
    const normalized = await interpret(base, [
      { type: "session_header", version: 1, sessionId: base.session.sessionId },
      { type: "session_header", version: 2, sessionId: base.session.sessionId },
      { type: "session_header", version: 1, sessionId: "other-session" },
      { type: "session_header", version: 1, sessionId: base.session.sessionId, usage: { promptTokens: 99 } },
      { type: "heartbeat" }
    ]);
    expect(normalized.disposition_counts).toEqual({ normalized: 0, ignored: 1, quarantined: 4 });
    expect(normalized.input_inventory[0].reason).toBe(OPENCLAW_NORMALIZATION_RULES.session_header);
    expect(normalized.input_inventory[0].normalized_facts).toBeNull();
    expect(normalized.input_inventory.every(isInputObservation)).toBe(true);
    expect(reconcileManifest(5, normalized.input_inventory)).toEqual(normalized.disposition_counts);
    await expect(Promise.resolve().then(() => reconcileManifest(4, normalized.input_inventory)))
      .rejects.toThrow("does not reconcile");
    expect(reconcileManifest(0, [])).toEqual({ normalized: 0, ignored: 0, quarantined: 0 });
  });

  test("same tool_call_id in different request events cannot cross-contaminate", async () => {
    const normalized = await interpret(await happy(), [
      { ...call, id: "call-a", requestId: "request-a", tool_call_id: "reused" },
      { ...call, id: "call-b", requestId: "request-b", tool_call_id: "reused" },
      { ...result, id: "result-b", requestId: "request-b", tool_call_id: "reused" },
      { ...result, id: "result-a", requestId: "request-a", tool_call_id: "reused" }
    ]);
    expect(normalized.disposition_counts).toEqual({ normalized: 4, ignored: 0, quarantined: 0 });
    for (const [resultIndex, callIndex] of [[2, 1], [3, 0]]) {
      const request = normalized.input_inventory[callIndex];
      expect(normalized.input_inventory[resultIndex].normalized_facts?.request_event_ref).toEqual({
        source_row_key: request.source_row_key, source_revision: request.source_revision,
        logical_event_id: request.logical_event_id
      });
    }
    expect(normalized.input_inventory[0].logical_event_id).not.toBe(normalized.input_inventory[1].logical_event_id);
  });

  test("multiple calls in one request match by their scoped call identifiers", async () => {
    const normalized = await interpret(await happy(), [
      { ...call, tool_call_id: "a" }, { ...call, tool_call_id: "b" },
      { ...result, tool_call_id: "b" }, { ...result, tool_call_id: "a" },
      { ...result, requestId: "other-request", tool_call_id: "a" }
    ]);
    expect(normalized.disposition_counts).toEqual({ normalized: 4, ignored: 0, quarantined: 1 });
    expect(normalized.input_inventory[4].reason).toBe("dangling_tool_result");
    expect((normalized.input_inventory[2].normalized_facts?.request_event_ref as { source_row_key: string }).source_row_key)
      .toBe(normalized.input_inventory[1].source_row_key);
  });

  test("duplicate native identities quarantine every duplicate and their dependent results", async () => {
    const normalized = await interpret(await happy(), [
      { ...call, id: "duplicate" }, { ...message, id: "duplicate" }, result
    ]);
    expect(normalized.input_inventory.map((row) => row.reason))
      .toEqual(["duplicate_native_id", "duplicate_native_id", "invalid_tool_request"]);
    expect(normalized.disposition_counts.quarantined).toBe(3);
  });

  test("duplicate call identities are ambiguous, not last-write-wins; duplicate results are also quarantined", async () => {
    const base = await happy();
    const duplicateCalls = await interpret(base, [call, { ...call, tool: "other" }, result]);
    expect(duplicateCalls.input_inventory.map((row) => row.reason))
      .toEqual(["duplicate_tool_request", "duplicate_tool_request", "ambiguous_tool_request"]);
    const duplicateResults = await interpret(base, [call, result, result]);
    expect(duplicateResults.input_inventory.map((row) => row.reason))
      .toEqual([null, "duplicate_tool_result", "duplicate_tool_result"]);
  });

  test("results cannot pair with an invalid, future, or time-reversed request", async () => {
    const base = await happy();
    const invalid = await interpret(base, [{ ...call, args: [] }, result]);
    expect(invalid.input_inventory.map((row) => row.reason)).toEqual(["invalid_tool_call_structure", "invalid_tool_request"]);
    const future = await interpret(base, [result, call]);
    expect(future.input_inventory[0].reason).toBe("tool_result_precedes_request");
    const reversed = await interpret(base, [
      { ...call, ts: "2026-01-05T12:01:00.000Z" }, { ...result, ts: "2026-01-05T12:00:00.000Z" }
    ]);
    expect(reversed.input_inventory[1].reason).toBe("tool_result_timestamp_precedes_request");
  });

  test("strict semantic validation rejects malformed payloads without throwing or leaking them", async () => {
    const events = [
      null, [], "PRIVATE_BODY", { type: "__proto__" },
      { ...message, role: "pluto" }, { ...message, content: {} }, { ...message, id: "" },
      { type: "model", action: "execute", model: "model-a" },
      { type: "model", action: "set", model: "" },
      { ...call, requestId: "" }, { ...call, tool_call_id: 1 }, { ...call, args: [] },
      { ...result, ok: "true" }, { ...result, output: {} },
      { ...message, usage: [] }, { ...message, usage: { promptTokens: "100" } },
      { ...message, role: "user", usage: { promptTokens: 100 } },
      { ...message, metadata: [] }
    ];
    const normalized = await interpret(await happy(), events);
    expect(normalized.disposition_counts).toEqual({ normalized: 0, ignored: 0, quarantined: events.length });
    for (const row of normalized.input_inventory) {
      expect(isInputObservation(row)).toBe(true);
      expect(row.reason!.length <= 160).toBe(true);
      expect(JSON.stringify(row)).not.toContain("PRIVATE_BODY");
      expect(JSON.stringify(row)).not.toContain("PRIVATE_ARGS");
      expect(JSON.stringify(row)).not.toContain("PRIVATE_OUTPUT");
    }
  });

  test("unknown optional fields require the explicit metadata compatibility rule", async () => {
    const normalized = await interpret(await happy(), [
      { ...message, metadata: { futureKey: "PRIVATE_METADATA", usage: { promptTokens: -1 } } },
      { ...message, futureKey: "PRIVATE_UNKNOWN_KEY" },
      { ...message, duration_ms: 50 }
    ]);
    expect(normalized.disposition_counts).toEqual({ normalized: 1, ignored: 0, quarantined: 2 });
    expect(normalized.input_inventory[0].quality_flags).toContain(OPENCLAW_NORMALIZATION_RULES.optional_metadata);
    expect(normalized.input_inventory[0].normalized_facts?.metadata).toBe(undefined);
    expect(normalized.input_inventory[0].normalized_facts?.usage).toBe(undefined);
    expect(normalized.input_inventory[1].reason).toBe("unknown_optional_field");
    expect(JSON.stringify(normalized)).not.toContain("PRIVATE_");
  });

  test("usage buckets retain source names, unknown scope and non-additive status, without unproven GenAI mappings", async () => {
    const base = await happy();
    const usage = { promptTokens: 120, completionTokens: 40, cacheReadTokens: 12, futureBucket: 7 };
    const normalized = await interpret(base, [{ ...message, usage }]);
    const row = normalized.input_inventory[0];
    expect(row.normalized_facts?.usage).toEqual(usage);
    expect(row.normalized_facts?.usage_basis).toBe("source_reported");
    expect(row.normalized_facts?.usage_scope).toBe("unknown");
    expect(row.normalized_facts?.usage_additive).toBe(false);
    expect(row.quality_flags).toContain("usage_non_additive");
    expect(JSON.stringify(normalized)).not.toContain("gen_ai.usage.");
    const negative = await interpret(base, [{ ...message, usage: { futureBucket: -1 } }]);
    expect(negative.input_inventory[0].reason).toBe("invalid_usage_value");
  });

  test("overflowing numeric JSON is quarantined with a text revision rather than throwing in canonicalization", async () => {
    const base = withEvents(await happy(), [message]);
    const text = '{"type":"message","role":"assistant","content":"PRIVATE_BODY","usage":{"promptTokens":1e999}}';
    const bytes = new TextEncoder().encode(text).byteLength;
    const normalized = await normalizeSession(withRows(base, [{
      ...base.rows[0], decodedJson: JSON.parse(text), decodedText: text,
      declaredUtf8Bytes: bytes, encodedBytes: bytes, decodedBytes: bytes
    }]), CONTEXT);
    expect(normalized.input_inventory[0].reason).toBe("invalid_usage_value");
    expect(normalized.input_inventory[0].quality_flags).toContain("source_revision_decoded_text");
    expect(normalized.input_inventory[0].source_revision).toMatch(/^[a-f0-9]{64}$/);
  });

  test("timestamps validate units and calendar values; optional absence creates no timing", async () => {
    const base = await happy();
    const normalized = await interpret(base, [
      ...[1767614400, 1767614400000, null, "2026-02-30T12:00:00Z", "2026-01-05", "2026-01-05T12:00:00+00:00"]
        .map((ts) => ({ ...message, ts })),
      { ...message, ts: "2026-01-05T12:00:00Z" }, { ...message, ts: "2026-01-05T12:00:00.123Z" }, message
    ]);
    expect(normalized.disposition_counts).toEqual({ normalized: 3, ignored: 0, quarantined: 6 });
    for (const row of normalized.input_inventory.slice(0, 6)) expect(row.reason).toBe("invalid_timestamp_units_or_value");
    expect(normalized.input_inventory[8].quality_flags).toContain("timing_unavailable");
    expect(normalized.input_inventory[8].normalized_facts?.timestamp).toBe(undefined);
  });

  test("all decoder failures preserve locators, bounded safe diagnostics and honest revision fidelity", async () => {
    const base = await happy();
    const rows: AcquiredRow[] = ["encoding", "decompress", "length_mismatch", "parse"].map((stage, index) => ({
      ...base.rows[0], locator: { ...base.rows[0].locator, seq: index + 1 },
      encoding: "invalid", decodedJson: null, decodedText: null, decodedBytes: null,
      decodeStatus: { kind: "error", stage: stage as "encoding" | "decompress" | "length_mismatch" | "parse", reason: "PRIVATE_EXCEPTION".repeat(100) }
    }));
    const normalized = await normalizeSession(withRows(base, rows), CONTEXT);
    expect(normalized.disposition_counts.quarantined).toBe(rows.length);
    for (const [index, row] of normalized.input_inventory.entries()) {
      expect(row.source_row_key).toBe(JSON.stringify([base.session.sessionId, index + 1]));
      expect(row.source_revision).toMatch(/^[a-f0-9]{64}$/);
      expect(row.quality_flags).toContain("source_revision_incomplete");
      expect(row.reason!.length <= 160).toBe(true);
      expect(JSON.stringify(row)).not.toContain("PRIVATE_EXCEPTION");
    }
  });

  test("native identities are namespaced, not derived from path or revision", async () => {
    const base = withEvents(await happy(), [{ ...message, id: "native-1" }]);
    const first = await normalizeSession(base, CONTEXT);
    expect(first.input_inventory[0].logical_event_id).toBe(JSON.stringify([
      CONTEXT.source_instance_id, CONTEXT.agent_id, base.session.sessionId, "native-1"
    ]));
    const other = await normalizeSession(base, { ...CONTEXT, source_instance_id: "other-source" });
    expect(first.input_inventory[0].logical_event_id).not.toBe(other.input_inventory[0].logical_event_id);
    expect(first.input_inventory[0].source_revision).toBe(other.input_inventory[0].source_revision);
  });

  test("duplicate physical locators and wrong-session rows cannot pass as valid inventory", async () => {
    const base = await happy();
    const duplicate = await normalizeSession(withRows(base, [base.rows[0], base.rows[0]]), CONTEXT);
    expect(duplicate.input_inventory.map((row) => row.reason)).toEqual(["duplicate_source_locator", "duplicate_source_locator"]);
    const foreign = await normalizeSession(withRows(base, [{
      ...base.rows[0], locator: { session_id: "other-session", seq: 1 }
    }]), CONTEXT);
    expect(foreign.input_inventory[0].reason).toBe("invalid_locator");
  });

  test("deterministic repeat does not mutate input; compression and key order do not alter event revision", async () => {
    const base = await happy();
    const before = JSON.stringify(base);
    expect(await normalizeSession(base, CONTEXT)).toEqual(await normalizeSession(base, CONTEXT));
    expect(JSON.stringify(base)).toBe(before);
    const plain = withEvents(base, [{ ...message, id: "stable" }]);
    const reordered = { id: "stable", content: "PRIVATE_BODY", role: "assistant", type: "message" };
    const zstd = withRows(plain, [{ ...plain.rows[0], encoding: "zstd", encodedBytes: 42, decodedJson: reordered }]);
    expect(await normalizeSession(plain, CONTEXT)).toEqual(await normalizeSession(zstd, CONTEXT));
  });

  test("a newer quarantined revision replaces valid facts at the same logical event; A-B-A is stateless", async () => {
    const base = await happy();
    const a = { ...message, id: "updated-event", usage: { promptTokens: 120 } };
    const b = { ...a, usage: { promptTokens: -120 } };
    const first = await interpret(base, [a]);
    const second = await interpret(base, [b]);
    expect(first.input_inventory[0].disposition).toBe("normalized");
    expect(second.input_inventory).toHaveLength(1);
    expect(second.input_inventory[0].disposition).toBe("quarantined");
    expect(second.input_inventory[0].normalized_facts).toBeNull();
    expect(second.input_inventory[0].logical_event_id).toBe(first.input_inventory[0].logical_event_id);
    expect(second.input_inventory[0].source_row_key).toBe(first.input_inventory[0].source_row_key);
    expect(second.input_inventory[0].source_revision).not.toBe(first.input_inventory[0].source_revision);
    expect(await interpret(base, [a])).toEqual(first);
  });

  test("unsupported interpretation and inconsistent manifests fail closed, not with healthy empty output", async () => {
    const base = await happy();
    await expect(normalizeSession({ ...base, interpretationVersion: "future.v2" }, CONTEXT))
      .rejects.toThrow("supported interpretation version");
    await expect(normalizeSession({ ...base, admission: { ...base.admission, admitted: false } }, CONTEXT))
      .rejects.toThrow("admitted source");
    await expect(normalizeSession({ ...base, session: { ...base.session, rowCount: 4 } }, CONTEXT))
      .rejects.toThrow("does not reconcile");
  });
});
