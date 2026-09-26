import type { InputObservation, SessionSnapshot, SourceEventRef, UsageBasis, UsageScope, ViewEntry } from "./contracts";

export type ViewNode = ViewEntry & { readonly children: readonly ViewNode[] };
export type UnresolvedEntry = {
  readonly source_event_refs: readonly SourceEventRef[];
  readonly source_order: number;
  readonly reason: string;
  readonly quality_flags: readonly string[];
  readonly entry?: ViewEntry;
};
export type SessionProjection = {
  readonly session_id: string;
  readonly snapshot_id: string;
  readonly snapshot_digest: string;
  readonly source_instance_id: string;
  readonly agent_id: string;
  readonly coverage: SessionSnapshot["coverage"];
  readonly disposition_counts: SessionSnapshot["disposition_counts"];
  readonly entries: readonly ViewEntry[];
  readonly hierarchy: readonly ViewNode[];
  readonly unresolved: readonly UnresolvedEntry[];
  readonly usage: {
    readonly coverage: "observed_snapshot";
    readonly entries: readonly {
      readonly span_id: string;
      readonly usage: Record<string, number>;
      readonly basis: UsageBasis;
      readonly scope: UsageScope;
      readonly evidence_id: string;
      readonly additive: false;
    }[];
  };
};

type Item = { observation: InputObservation; facts: Record<string, unknown>; entry: ViewEntry };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const ref = (o: InputObservation): SourceEventRef => ({
  source_row_key: o.source_row_key, source_revision: o.source_revision,
  ...(o.logical_event_id === undefined ? {} : { logical_event_id: o.logical_event_id })
});
const refKey = (r: SourceEventRef) => JSON.stringify([r.source_row_key, r.source_revision]);

/** Pure, metadata-only projection. Presentation turns are NOT execution spans.
 * Native timing must explicitly say measured; transcript points/intervals never
 * become measured latency. No accounting conversion is proven by the admitted
 * adapter, so raw usage stays non-additive, even when its scope is known.
 */
export function projectSnapshot(snapshot: SessionSnapshot): SessionProjection {
  const traceId = `session:${JSON.stringify([snapshot.source_instance_id, snapshot.agent_id, snapshot.session_id])}`;
  const ordered = snapshot.input_inventory.map((observation, index) => ({ observation, order: sourceOrder(observation, index) }))
    .sort((a, b) => a.order - b.order || compare(refKey(a.observation), refKey(b.observation)));
  const unresolved: UnresolvedEntry[] = [];
  const items: Item[] = [];
  for (const { observation, order } of ordered) {
    if (observation.disposition === "ignored") continue;
    if (observation.disposition === "quarantined") {
      unresolved.push({ source_event_refs: [ref(observation)], source_order: order,
        reason: observation.reason!, quality_flags: observation.quality_flags });
      continue;
    }
    const facts = observation.normalized_facts!;
    const eventType = facts.event_type;
    // A model-setting record is a transcript observation, NOT a model call.
    const kind = eventType === "tool_call" || eventType === "tool_result" ? "tool"
      : facts.kind === "model" && facts.model_operation === true ? "model"
      : facts.kind === "delegate" && facts.delegation_operation === true ? "delegate" : "message";
    const entry: ViewEntry = {
      kind, name: String(facts.tool ?? facts.model ?? facts.role ?? eventType ?? "observation"),
      trace_id: traceId, trace_id_basis: "synthetic_session",
      span_id: `event:${JSON.stringify([traceId, observation.source_row_key, observation.source_revision])}`,
      source_event_refs: [ref(observation)], source_order: order, display_parent_id: null, links: [],
      ...timing(facts), status: facts.status === "ok" || facts.status === "error" ? facts.status : "unknown",
      completion_basis: eventType === "tool_result" ? "tool_result" : "unavailable",
      ...(facts.usage ? {
        usage: { ...facts.usage as Record<string, number> }, usage_basis: facts.usage_basis as UsageBasis,
        usage_scope: facts.usage_scope as UsageScope, usage_evidence_id: facts.usage_evidence_id as string
      } : {}),
      attributes: { ...facts }, quality_flags: [...observation.quality_flags]
    };
    items.push({ observation, facts, entry });
  }
  // Matching is exact and revision scoped. Never resolve ambiguous identities.
  const unique = (matches: Item[]) => matches.length === 1 ? matches[0] : undefined;
  const byRef = (value: unknown) => {
    if (!value || typeof value !== "object") return undefined;
    const r = value as SourceEventRef;
    return unique(items.filter((item) => refKey(item.observation) === refKey(r)
      && (r.logical_event_id === undefined || item.observation.logical_event_id === r.logical_event_id)));
  };
  const byId = (value: unknown) => typeof value === "string" ? unique(items.filter(({ observation }) =>
    observation.logical_event_id === value || observation.logical_event_id === JSON.stringify([
      snapshot.source_instance_id, snapshot.agent_id, snapshot.session_id, value
    ]))) : undefined;
  const detached = new Set<string>();
  let turn: Item | undefined;
  for (const item of items) {
    const { facts } = item;
    let parent: Item | undefined;
    let relationship: "tool_result" | "transcript_lineage" = "transcript_lineage";
    let unresolvedReason: string | undefined;
    if (facts.event_type === "tool_result") {
      parent = byRef(facts.request_event_ref);
      relationship = "tool_result";
      if (!parent || parent.facts.event_type !== "tool_call"
        || parent.facts.request_event_id !== facts.request_event_id
        || parent.facts.tool_call_id !== facts.tool_call_id) {
        parent = undefined;
        unresolvedReason = "unresolved_tool_result";
      }
    } else if (facts.parent_event_ref !== undefined || facts.parent_id !== undefined) {
      parent = facts.parent_event_ref !== undefined ? byRef(facts.parent_event_ref) : byId(facts.parent_id);
      if (!parent) unresolvedReason = "unresolved_parent";
    } else if (facts.event_type === "tool_call") {
      // request_event_id can be a correlation key with no native message ID.
      // In that case retain a standalone tool group, not an invented parent.
      parent = byId(facts.request_event_id);
    }
    if (parent && (parent.entry.source_order >= item.entry.source_order || detached.has(parent.entry.span_id))) {
      parent = undefined;
      unresolvedReason = "unresolved_parent_order";
    }
    if (parent) {
      item.entry = { ...item.entry, display_parent_id: parent.entry.span_id,
        execution_parent_span_id: parent.entry.span_id,
        links: [{ relationship, target_span_id: parent.entry.span_id }] };
    } else if (!unresolvedReason && facts.event_type === "message" && facts.role === "assistant" && turn) {
      item.entry = { ...item.entry, display_parent_id: turn.entry.span_id };
    }
    if (unresolvedReason) {
      detached.add(item.entry.span_id);
      unresolved.push({ source_event_refs: item.entry.source_event_refs, source_order: item.entry.source_order,
        reason: unresolvedReason, quality_flags: item.entry.quality_flags, entry: item.entry });
    }
    if (facts.event_type === "message" && facts.role === "user") turn = unresolvedReason ? undefined : item;
  }
  // Tool group completion and interval come from exactly one matched result.
  for (const call of items.filter((item) => item.facts.event_type === "tool_call")) {
    const result = unique(items.filter((item) => item.facts.event_type === "tool_result"
      && item.entry.execution_parent_span_id === call.entry.span_id));
    if (!result) continue;
    const start = call.entry.start_time;
    const end = result.entry.start_time;
    const interval = start !== undefined && end !== undefined ? Date.parse(end) - Date.parse(start) : NaN;
    call.entry = { ...call.entry, status: result.entry.status, completion_basis: "tool_result",
      ...(call.entry.timing_basis !== "measured" && Number.isFinite(interval) && interval >= 0
        ? { end_time: end, duration_ms: interval, timing_basis: "transcript_interval" as const } : {}) };
  }
  const entries = items.map((item) => item.entry);
  const children = new Map<string | null, ViewEntry[]>();
  for (const entry of entries) {
    if (detached.has(entry.span_id)) continue;
    const siblings = children.get(entry.display_parent_id) ?? [];
    siblings.push(entry);
    children.set(entry.display_parent_id, siblings);
  }
  const tree = (parent: string | null): ViewNode[] => (children.get(parent) ?? [])
    .map((entry) => ({ ...entry, children: tree(entry.span_id) }));
  return {
    session_id: snapshot.session_id, snapshot_id: snapshot.snapshot_id, snapshot_digest: snapshot.snapshot_digest,
    source_instance_id: snapshot.source_instance_id, agent_id: snapshot.agent_id,
    coverage: snapshot.coverage, disposition_counts: snapshot.disposition_counts, entries, hierarchy: tree(null),
    unresolved: unresolved.sort((a, b) => a.source_order - b.source_order
      || compare(refKey(a.source_event_refs[0]), refKey(b.source_event_refs[0]))),
    usage: { coverage: "observed_snapshot", entries: entries.filter((entry) => entry.usage !== undefined).map((entry) => ({
      span_id: entry.span_id, usage: entry.usage!, basis: entry.usage_basis!, scope: entry.usage_scope!,
      evidence_id: entry.usage_evidence_id!, additive: false
    })) }
  };
}

function sourceOrder(observation: InputObservation, fallback: number): number {
  if (typeof observation.normalized_facts?.source_order === "number") return observation.normalized_facts.source_order;
  // Quarantine drops facts, but the admitted adapter retains [session, seq].
  try {
    const locator: unknown = JSON.parse(observation.source_row_key);
    if (Array.isArray(locator) && typeof locator[1] === "number") return locator[1];
  } catch { /* Other adapters may use opaque locators; their inventory is ordered. */ }
  return fallback;
}

function timing(facts: Record<string, unknown>): Pick<ViewEntry, "timing_basis" | "start_time" | "end_time" | "duration_ms"> {
  if (facts.timing_basis === "measured") {
    return { timing_basis: "measured",
      ...(typeof facts.start_time === "string" ? { start_time: facts.start_time } : {}),
      ...(typeof facts.end_time === "string" ? { end_time: facts.end_time } : {}),
      ...(typeof facts.duration_ms === "number" ? { duration_ms: facts.duration_ms } : {}) };
  }
  return typeof facts.timestamp === "string"
    ? { start_time: facts.timestamp, timing_basis: "transcript_interval" }
    : { timing_basis: "unavailable" };
}
