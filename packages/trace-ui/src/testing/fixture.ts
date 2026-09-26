import type { Binding, BindingsResponse, SessionResponse, SessionsResponse, ViewEntry, ViewNode } from "../api";

export const hostileText = '<img src=x onerror="window.__traceInjected=true"> & <script>alert(1)</script>';
export const revision = { sequence: 7, digest: "a".repeat(64) };
export const nextRevision = { sequence: 8, digest: "b".repeat(64) };

function entry(span_id: string, patch: Partial<ViewEntry> = {}): ViewNode {
  return {
    span_id, kind: "message", name: span_id, trace_id: "session:fixture", trace_id_basis: "synthetic_session",
    display_parent_id: null, timing_basis: "unavailable", source_order: 0,
    source_event_refs: [{ source_row_key: span_id, source_revision: "c".repeat(64) }],
    links: [], status: "unknown", completion_basis: "unavailable", attributes: {}, quality_flags: [], children: [],
    ...patch,
  };
}
const call = entry("call", { kind: "model", display_parent_id: "turn", execution_parent_span_id: "exec-parent",
  name: hostileText, attributes: { model: hostileText }, duration_ms: 125, timing_basis: "transcript_interval" });
const tool = entry("tool", { kind: "tool", display_parent_id: "turn", execution_parent_span_id: "call", duration_ms: 0, timing_basis: "measured" });
const turn = { ...entry("turn"), children: [call, tool] };
const external = entry("exec-parent");
const unmatched = entry("unmatched", { kind: "tool", display_parent_id: "turn", name: hostileText });
export const detail: SessionResponse = {
  session_id: "fixture-session", snapshot_id: "snapshot-7", snapshot_digest: "d".repeat(64), head_revision: revision,
  source_instance_id: "source", agent_id: "agent", coverage: { kind: "full_session", input_count: 6 },
  disposition_counts: { normalized: 5, ignored: 0, quarantined: 1 },
  entries: [turn, call, tool, external, unmatched], hierarchy: [turn, external],
  unresolved: [
    { source_order: 4, source_event_refs: unmatched.source_event_refs, quality_flags: [], reason: "unresolved_tool_result", entry: unmatched },
    { source_order: 5, source_event_refs: [{ source_row_key: "quarantine", source_revision: "e".repeat(64) }], quality_flags: ["decode_error"], reason: "decode_parse" },
  ],
  usage: { coverage: "observed_snapshot", entries: [
    { span_id: "call", scope: "unknown", basis: "source_reported", usage: { promptTokens: 21, completionTokens: 8, cacheReadTokens: 0 }, evidence_id: "usage-1", additive: false },
    { span_id: "tool", scope: "turn", basis: "normalized_mapping", usage: { input_tokens: 4 }, evidence_id: "usage-2", additive: false },
  ] },
};
export const catalog: SessionsResponse = {
  head_revision: revision, bindings_revision: "f".repeat(64),
  sessions: [{ id: detail.snapshot_id, session_id: detail.session_id, snapshot_id: detail.snapshot_id,
    snapshot_digest: detail.snapshot_digest, source_instance_id: detail.source_instance_id, agent_id: detail.agent_id,
    coverage: detail.coverage, disposition_counts: detail.disposition_counts }],
};
const binding: Binding = {
  schemaVersion: "boulder.trace.binding.v1", binding_id: "binding-7", journal_id: "journal", snapshot_id: detail.snapshot_id,
  snapshot_digest: detail.snapshot_digest, selected_events: call.source_event_refs, boulder_command_run_id: "command-7",
  binding_basis: "operator_explicit", createdAt: "2026-09-25T12:00:00Z",
};
export const bindings: BindingsResponse = { head_revision: revision, bindings_revision: catalog.bindings_revision, bindings: [
  binding, { ...binding, binding_id: "unrelated-binding", snapshot_id: "another-snapshot", boulder_command_run_id: "another-command" },
] };
