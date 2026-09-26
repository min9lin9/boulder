import {
  sourceRevisionForDecodedEvent,
  TraceCanonicalizationError,
  type DispositionCounts,
  type InputObservation,
  type SnapshotCoverage
} from "./contracts";
import {
  OPENCLAW_INTERPRETATION_VERSION,
  type AcquiredRow,
  type OpenClawAcquisition
} from "./openclaw-adapter";
import { DEFAULT_ADAPTER_ID } from "./source-config";

/**
 * Semantic profile for 30afbaf8-claim's SYNTHETIC Boulder-side payloads, not
 * evidence of an installed OpenClaw format. Changes require a new interpretation
 * version. This is a full-inventory, stateless transform, never an event cache.
 *
 * Identity: optional `id` is the native transcript event ID. Messages and model
 * settings without it remain transcript facts, with no fabricated logical or
 * execution ID. Tool records require `requestId` (originating request event);
 * optional `tool_call_id` identifies a call WITHIN that request. Absent it, the
 * fixture format supports one call per request. Results must reference exactly
 * one earlier, valid call. Neither adjacency nor tool_call_id alone is a key.
 *
 * Compatibility rules (v1):
 * - optional-metadata: unknown keys are allowed ONLY inside an optional object
 *   `metadata`; its contents are non-semantic and omitted, never used as facts.
 * - usage-buckets: all numeric, finite, nonnegative buckets inside assistant
 *   message `usage` are preserved verbatim, including unfamiliar bucket names.
 *   The fixture README explicitly disclaims their accounting semantics. NO
 *   bucket currently has a proven gen_ai.usage.* conversion, including
 *   promptTokens/completionTokens/cacheReadTokens. Scope is unknown and usage
 *   is non-additive; cache buckets are never added to promptTokens.
 * - session-header: the exact synthetic structural record
 *   {type:"session_header", version:1, sessionId:<selected session>} is ignored.
 *   No other event type, header version, or extra header field is allowlisted.
 *
 * Only UTC ISO timestamps with explicit seconds (optional milliseconds) are
 * admitted. Numeric seconds/milliseconds are NOT guessed. Model `action:set`
 * is a setting observation, not evidence of an executed model call. Bodies,
 * tool args/results and metadata are validated structurally but never emitted.
 */
export const OPENCLAW_NORMALIZATION_RULES = {
  optional_metadata: "openclaw-local.optional-metadata.v1",
  usage_buckets: "openclaw-local.usage-buckets.v1",
  session_header: "openclaw-local.session-header.v1"
} as const;

export type NormalizationContext = {
  readonly source_instance_id: string;
  readonly agent_id: string;
};

export type NormalizedSession = {
  readonly interpretation_version: string;
  readonly input_inventory: readonly InputObservation[];
  readonly disposition_counts: DispositionCounts;
  readonly coverage: SnapshotCoverage;
};

type Facts = Record<string, unknown>;
type Candidate = { row: AcquiredRow; observation: InputObservation };
type Index = Map<string, number[]>;

export async function normalizeSession(
  acquisition: OpenClawAcquisition,
  context: NormalizationContext
): Promise<NormalizedSession> {
  if (!acquisition.admission.admitted || acquisition.adapterId !== DEFAULT_ADAPTER_ID
    || acquisition.interpretationVersion !== OPENCLAW_INTERPRETATION_VERSION) {
    throw new Error("Normalization requires an admitted source and the supported interpretation version.");
  }
  if (!nonempty(context.source_instance_id) || !nonempty(context.agent_id)) {
    throw new Error("Normalization requires registered source and agent identities.");
  }

  const candidates: Candidate[] = [];
  const locators: Index = new Map();
  const nativeIds: Index = new Map();
  const calls: Index = new Map();
  const results: Index = new Map();
  for (const [index, row] of acquisition.rows.entries()) {
    const key = JSON.stringify([row.locator.session_id, row.locator.seq]);
    addIndex(locators, key, index);
    const event = isRecord(row.decodedJson) ? row.decodedJson : null;
    if (event && nonempty(event.id)) addIndex(nativeIds, event.id, index);
    const toolKey = event && toolRequestKey(event);
    if (toolKey && event?.type === "tool_call") addIndex(calls, toolKey, index);
    if (toolKey && event?.type === "tool_result") addIndex(results, toolKey, index);
    const revision = await revisionForRow(row);
    const observation: InputObservation = {
      source_row_key: key,
      ...(event && nonempty(event.id) ? {
        logical_event_id: JSON.stringify([
          context.source_instance_id, context.agent_id, row.locator.session_id, event.id
        ])
      } : {}),
      source_revision: revision.hash,
      disposition: "quarantined",
      reason: "invalid_event",
      quality_flags: revision.flags,
      normalized_facts: null
    };
    candidates.push({ row, observation });
  }

  // Validate every candidate before resolving links, so a result can never
  // borrow success from an invalid or duplicate request elsewhere in the input.
  for (const candidate of candidates) {
    const { row, observation } = candidate;
    if (row.decodeStatus.kind === "error") {
      quarantine(candidate, `decode_${row.decodeStatus.stage}`);
      continue;
    }
    if (row.locator.session_id !== acquisition.session.sessionId
      || !Number.isSafeInteger(row.locator.seq) || row.locator.seq < 0) {
      quarantine(candidate, "invalid_locator");
      continue;
    }
    const event = row.decodedJson;
    if (!isRecord(event)) {
      quarantine(candidate, "invalid_event_object");
      continue;
    }
    if (locators.get(observation.source_row_key)!.length !== 1) {
      quarantine(candidate, "duplicate_source_locator");
      continue;
    }
    if (nonempty(event.id) && nativeIds.get(event.id)!.length !== 1) {
      quarantine(candidate, "duplicate_native_id");
      continue;
    }
    if (event.type === "session_header") {
      if (event.version === 1 && event.sessionId === row.locator.session_id
        && Object.keys(event).every((key) => ["type", "version", "sessionId"].includes(key))) {
        candidate.observation = {
          ...observation, disposition: "ignored",
          reason: OPENCLAW_NORMALIZATION_RULES.session_header
        };
      } else quarantine(candidate, "invalid_session_header");
      continue;
    }

    const facts: Facts = { event_type: event.type, source_order: row.locator.seq };
    const flags = [...observation.quality_flags];
    const problem = validateEvent(event, facts, flags);
    if (problem) {
      quarantine(candidate, problem);
      continue;
    }
    if (!nonempty(event.id)) flags.push("native_event_id_unavailable");
    const toolKey = toolRequestKey(event);
    if (event.type === "tool_call" && calls.get(toolKey!)!.length !== 1) {
      quarantine(candidate, "duplicate_tool_request");
      continue;
    }
    if (event.type === "tool_result" && results.get(toolKey!)!.length !== 1) {
      quarantine(candidate, "duplicate_tool_result");
      continue;
    }
    if (facts.usage) {
      facts.usage_evidence_id = JSON.stringify([
        context.source_instance_id, context.agent_id, observation.source_row_key, observation.source_revision
      ]);
    }
    candidate.observation = {
      ...observation, disposition: "normalized", reason: null,
      quality_flags: flags, normalized_facts: facts
    };
  }

  for (const candidate of candidates) {
    const { observation, row } = candidate;
    if (observation.disposition !== "normalized" || observation.normalized_facts?.event_type !== "tool_result") continue;
    const matches = calls.get(toolRequestKey(row.decodedJson as Facts)!);
    if (!matches || matches.length !== 1) {
      quarantine(candidate, matches ? "ambiguous_tool_request" : "dangling_tool_result");
      continue;
    }
    const request = candidates[matches[0]]!;
    if (request.observation.disposition !== "normalized") {
      quarantine(candidate, "invalid_tool_request");
      continue;
    }
    if (request.row.locator.seq >= row.locator.seq) {
      quarantine(candidate, "tool_result_precedes_request");
      continue;
    }
    const start = request.observation.normalized_facts!.timestamp;
    const end = observation.normalized_facts.timestamp;
    if (typeof start === "string" && typeof end === "string" && Date.parse(end) < Date.parse(start)) {
      quarantine(candidate, "tool_result_timestamp_precedes_request");
      continue;
    }
    candidate.observation = {
      ...observation,
      normalized_facts: {
        ...observation.normalized_facts,
        request_event_ref: {
          source_row_key: request.observation.source_row_key,
          ...(request.observation.logical_event_id ? { logical_event_id: request.observation.logical_event_id } : {}),
          source_revision: request.observation.source_revision
        }
      }
    };
  }

  const inventory = candidates.map(({ observation }) => observation);
  return {
    interpretation_version: acquisition.interpretationVersion,
    input_inventory: inventory,
    disposition_counts: reconcileManifest(acquisition.session.rowCount, inventory),
    coverage: { kind: "full_session", input_count: acquisition.session.rowCount }
  };
}

/** Count observations without deduplication; mismatched acquisition is not a complete manifest. */
export function reconcileManifest(inputCount: number, inventory: readonly InputObservation[]): DispositionCounts {
  const counts = { normalized: 0, ignored: 0, quarantined: 0 };
  for (const observation of inventory) counts[observation.disposition] += 1;
  if (!Number.isSafeInteger(inputCount) || inputCount < 0
    || inputCount !== counts.normalized + counts.ignored + counts.quarantined) {
    throw new Error("Disposition manifest does not reconcile with the acquired input count.");
  }
  return counts;
}

function validateEvent(event: Facts, facts: Facts, flags: string[]): string | null {
  const fields: Record<string, readonly string[]> = {
    message: ["role", "content", "usage"],
    model: ["action", "model"],
    tool_call: ["requestId", "tool_call_id", "tool", "args"],
    tool_result: ["requestId", "tool_call_id", "ok", "output"]
  };
  if (typeof event.type !== "string" || !Object.hasOwn(fields, event.type)) return "unknown_event_type";
  const allowed = ["type", "id", "ts", "metadata", ...fields[event.type]];
  if (Object.keys(event).some((key) => !allowed.includes(key))) return "unknown_optional_field";
  if (Object.hasOwn(event, "id") && !nonempty(event.id)) return "invalid_native_id";
  if (Object.hasOwn(event, "metadata")) {
    if (!isRecord(event.metadata)) return "invalid_optional_metadata";
    flags.push(OPENCLAW_NORMALIZATION_RULES.optional_metadata);
  }
  if (Object.hasOwn(event, "ts")) {
    if (!validTimestamp(event.ts)) return "invalid_timestamp_units_or_value";
    facts.timestamp = event.ts;
  } else flags.push("timing_unavailable");

  if (event.type === "message") {
    if (event.role !== "user" && event.role !== "assistant" && event.role !== "system") return "unknown_message_role";
    if (typeof event.content !== "string") return "invalid_message_content";
    facts.kind = "message";
    facts.role = event.role;
    if (Object.hasOwn(event, "usage")) {
      if (event.role !== "assistant" || !isRecord(event.usage)) return "invalid_usage_structure";
      if (Object.values(event.usage).some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
        return "invalid_usage_value";
      }
      facts.usage = Object.fromEntries(Object.entries(event.usage));
      facts.usage_basis = "source_reported";
      facts.usage_scope = "unknown";
      facts.usage_additive = false;
      flags.push(OPENCLAW_NORMALIZATION_RULES.usage_buckets, "usage_scope_unknown", "usage_non_additive");
    }
  } else if (event.type === "model") {
    if (event.action !== "set" || !nonempty(event.model)) return "invalid_model_setting";
    facts.kind = "model";
    facts.action = "set";
    facts.model = event.model;
    facts.model_operation = false;
  } else {
    if (!toolRequestKey(event)) return "invalid_tool_request_identity";
    facts.kind = "tool";
    facts.request_event_id = event.requestId;
    if (Object.hasOwn(event, "tool_call_id")) facts.tool_call_id = event.tool_call_id;
    if (event.type === "tool_call") {
      if (!nonempty(event.tool) || !isRecord(event.args)) return "invalid_tool_call_structure";
      facts.tool = event.tool;
      // A request alone is not success or evidence of completion.
      facts.status = "unknown";
    } else {
      if (typeof event.ok !== "boolean" || typeof event.output !== "string") return "invalid_tool_result_structure";
      facts.status = event.ok ? "ok" : "error";
    }
  }
  return null;
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const millis = Date.parse(value);
  // Roundtrip rejects invalid calendar dates that Date.parse silently rolls over.
  return Number.isFinite(millis) && new Date(millis).toISOString() === value.replace(/(?<!\.\d{3})Z$/, ".000Z");
}

function toolRequestKey(event: Facts): string | null {
  if (!nonempty(event.requestId)) return null;
  if (Object.hasOwn(event, "tool_call_id") && !nonempty(event.tool_call_id)) return null;
  return JSON.stringify([event.requestId, event.tool_call_id ?? null]);
}

function addIndex(index: Index, key: string, rowIndex: number): void {
  const existing = index.get(key);
  if (existing) existing.push(rowIndex);
  else index.set(key, [rowIndex]);
}

function quarantine(candidate: Candidate, code: string): void {
  // Codes are fixed internal diagnostics, never exception messages or payload
  // keys/values. Keeping the cap here also bounds diagnostics after rule changes.
  candidate.observation = {
    ...candidate.observation, disposition: "quarantined", reason: code.slice(0, 160), normalized_facts: null
  };
}

async function revisionForRow(row: AcquiredRow): Promise<{ hash: string; flags: string[] }> {
  if (row.decodeStatus.kind === "ok" || row.decodedJson !== null) {
    try {
      return { hash: await sourceRevisionForDecodedEvent(row.decodedJson), flags: [] };
    } catch (error) {
      if (!(error instanceof TraceCanonicalizationError)) throw error;
      // JSON.parse can yield Infinity for an overflowing numeric literal. Hash
      // the exact decoded text instead; semantic validation quarantines it.
    }
  }
  if (row.decodedText !== null) {
    return {
      hash: await sourceRevisionForDecodedEvent({ revision_basis: "decoded_text", text: row.decodedText }),
      flags: ["source_revision_decoded_text"]
    };
  }
  // The acquisition contract does not expose raw compressed/invalid bytes.
  // This is explicitly an INCOMPLETE evidence fingerprint, not a payload hash:
  // distinct corrupt byte streams of equal size may collide. Never imply that
  // an unavailable payload was decoded, or that this fingerprint proves equality.
  return {
    hash: await sourceRevisionForDecodedEvent({
      revision_basis: "acquisition_evidence_only", encoding: row.encoding,
      encoded_bytes: row.encodedBytes, declared_utf8_bytes: row.declaredUtf8Bytes,
      decode_stage: row.decodeStatus.kind === "error" ? row.decodeStatus.stage : null
    }),
    flags: ["source_revision_incomplete"]
  };
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Facts {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
