import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { isViewEntry, type InputObservation, type SessionSnapshot } from "../src/trace/contracts";
import { normalizeSession } from "../src/trace/normalize";
import { acquireSession } from "../src/trace/openclaw-adapter";
import { projectSnapshot } from "../src/trace/projection";

const context = { source_instance_id: "fixture-source", agent_id: "fixture-agent" };
function snapshot(inventory: readonly InputObservation[]): SessionSnapshot {
  return { ...context, session_id: "session", snapshot_id: "snapshot", snapshot_digest: "digest",
    supersedes_snapshot_id: null, selection_scope: "full_session", input_inventory: inventory,
    disposition_counts: {
      normalized: inventory.filter((o) => o.disposition === "normalized").length,
      ignored: inventory.filter((o) => o.disposition === "ignored").length,
      quarantined: inventory.filter((o) => o.disposition === "quarantined").length
    }, coverage: { kind: "full_session", input_count: inventory.length } };
}
function observation(order: number, facts: Record<string, unknown>): InputObservation {
  return { source_row_key: JSON.stringify(["session", order]), source_revision: `revision-${order}`,
    logical_event_id: JSON.stringify([context.source_instance_id, context.agent_id, "session", `id-${order}`]),
    disposition: "normalized", reason: null, quality_flags: [], normalized_facts: { source_order: order, ...facts } };
}
async function fixture(name: string, session: string): Promise<SessionSnapshot> {
  const acquired = await acquireSession(join(import.meta.dir, "../fixtures/trace/openclaw/30afbaf8-claim", name), session);
  const normalized = await normalizeSession(acquired, context);
  return { ...snapshot(normalized.input_inventory), session_id: session };
}

describe("pure trace snapshot projection", () => {
  test("case-01 groups the assistant turn, matches tools, and does not invent model execution or causality", async () => {
    const input = await fixture("case-01-plain.sqlite", "sess-plain-001");
    const before = JSON.stringify(input);
    const view = projectSnapshot(input);
    expect(view.entries.every(isViewEntry)).toBe(true);
    expect(view.entries.map((entry) => entry.source_order)).toEqual([1, 2, 3, 4, 5]);
    const [setting, user, call, result, assistant] = view.entries;
    expect(setting.kind).toBe("message");
    expect(setting.attributes.model_operation).toBe(false);
    expect(assistant.display_parent_id).toBe(user.span_id);
    expect(assistant.execution_parent_span_id).toBe(undefined);
    expect(call.display_parent_id).toBeNull();
    expect(call.execution_parent_span_id).toBe(undefined);
    expect(result.display_parent_id).toBe(call.span_id);
    expect(result.execution_parent_span_id).toBe(call.span_id);
    expect(result.links).toEqual([{ relationship: "tool_result", target_span_id: call.span_id }]);
    expect(call.duration_ms).toBe(60_000);
    expect(call.timing_basis).toBe("transcript_interval");
    expect(call.status).toBe("ok");
    expect(assistant.status).toBe("unknown");
    expect(view.hierarchy.find((entry) => entry.span_id === user.span_id)?.children[0].span_id).toBe(assistant.span_id);
    expect(view.usage.coverage).toBe("observed_snapshot");
    expect(view.usage.entries[0]).toEqual({ span_id: assistant.span_id, usage: { promptTokens: 120, completionTokens: 40, cacheReadTokens: 12 },
      basis: "source_reported", scope: "unknown", evidence_id: assistant.usage_evidence_id, additive: false });
    expect(assistant.quality_flags).toContain("usage_scope_unknown");
    expect(JSON.stringify(input)).toBe(before);
    expect(projectSnapshot(input)).toEqual(view);
    expect(projectSnapshot({ ...input, input_inventory: [...input.input_inventory].reverse() })).toEqual(view);
  });

  test("case-05 pairs nonadjacent results to their exact request, retaining error completion", async () => {
    const view = projectSnapshot(await fixture("case-05-tool-pair.sqlite", "sess-tools-001"));
    expect(view.hierarchy).toHaveLength(2);
    expect(view.hierarchy[0].children[0].source_order).toBe(4);
    expect(view.hierarchy[1].children[0].source_order).toBe(3);
    expect(view.hierarchy[0].status).toBe("error");
    expect(view.hierarchy[1].status).toBe("ok");
    expect(view.hierarchy.map((entry) => entry.duration_ms)).toEqual([180_000, 60_000]);
    expect(view.unresolved).toEqual([]);
  });

  test("case-06 quarantine includes orphan tool result; no fallback parents or private payloads", async () => {
    const view = projectSnapshot(await fixture("case-06-malformed.sqlite", "sess-malformed-001"));
    expect(view.entries).toHaveLength(1);
    expect(view.unresolved.map((entry) => entry.source_order)).toEqual([2, 3, 4, 5]);
    expect(view.unresolved[1].reason).toBe("dangling_tool_result");
    expect(view.unresolved[1].entry).toBe(undefined);
    expect(view.hierarchy[0].children).toEqual([]);
    expect(JSON.stringify(view)).not.toContain("orphaned result");
    expect(view.usage.entries).toEqual([]);
  });

  test("missing timing stays unavailable with no zero duration or ingestion timestamps", async () => {
    const view = projectSnapshot(await fixture("case-04-missing-timing.sqlite", "sess-notiming-001"));
    for (const entry of view.entries) {
      expect(entry.timing_basis).toBe("unavailable");
      expect(entry.start_time).toBe(undefined);
      expect(entry.end_time).toBe(undefined);
      expect(entry.duration_ms).toBe(undefined);
    }
  });

  test("explicit ancestry and measured facts remain separate from presentation-only grouping", () => {
    const input = snapshot([
      observation(1, { event_type: "message", role: "user" }),
      observation(2, { event_type: "message", role: "assistant" }),
      observation(3, { event_type: "tool_call", request_event_id: "id-2", tool_call_id: "call", tool: "shell",
        timing_basis: "measured", start_time: "2026-01-01T00:00:00Z", end_time: "2026-01-01T00:00:01Z", duration_ms: 1000 }),
      observation(4, { event_type: "message", role: "assistant", parent_id: "id-2" }),
      observation(5, { event_type: "message", role: "assistant", parent_id: "absent" })
    ]);
    const view = projectSnapshot(input);
    expect(view.entries[1].execution_parent_span_id).toBe(undefined);
    expect(view.entries[2].execution_parent_span_id).toBe(view.entries[1].span_id);
    expect(view.entries[2].timing_basis).toBe("measured");
    expect(view.entries[2].duration_ms).toBe(1000);
    expect(view.entries[3].links[0].relationship).toBe("transcript_lineage");
    expect(view.entries[4].display_parent_id).toBeNull();
    expect(view.unresolved[0].entry?.span_id).toBe(view.entries[4].span_id);
    expect(view.hierarchy[0].children[0].children).toHaveLength(2);
  });

  test("an unresolved normalized result never borrows a call ID from a different request", () => {
    const call = observation(1, { event_type: "tool_call", request_event_id: "request-a", tool_call_id: "reused", tool: "shell" });
    const result = observation(2, { event_type: "tool_result", request_event_id: "request-b", tool_call_id: "reused",
      request_event_ref: { source_row_key: call.source_row_key, source_revision: call.source_revision }, status: "ok" });
    const view = projectSnapshot(snapshot([call, result]));
    expect(view.unresolved).toHaveLength(1);
    expect(view.entries[1].display_parent_id).toBeNull();
    expect(view.entries[1].execution_parent_span_id).toBe(undefined);
    expect(view.hierarchy[0].status).toBe("unknown");
    expect(view.hierarchy[0].children).toEqual([]);
  });

  test("untrusted strings remain plain data and usage scope is preserved without inferred sums", () => {
    const text = "</script><img src=x onerror=alert(1)>";
    const input = snapshot([observation(1, { event_type: "tool_call", tool: text, request_event_id: "missing" }),
      observation(2, { event_type: "message", role: "assistant", usage: { rawBucket: 3 }, usage_basis: "source_reported",
        usage_scope: "session", usage_evidence_id: "usage-2" })]);
    const view = projectSnapshot(input);
    expect(view.entries[0].name).toBe(text);
    expect(view.usage.entries[0].scope).toBe("session");
    expect(view.usage.entries[0].evidence_id).toBe("usage-2");
    expect(view.usage.entries[0].additive).toBe(false);
  });
});
