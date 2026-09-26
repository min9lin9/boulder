// Versioned contracts for the boulder trace subsystem (plan v2 sections A1-A4).
// Types + pure functions only: no runtime dependencies, no I/O, and no helpers
// that invent execution identities, parents, or timing.

export type BatchEnvelope = {
  readonly schema_version: "boulder.trace.batch.v1";
  readonly journal_id: string;
  readonly batch_id: string;
  readonly batch_seq: number;
  readonly previous_segment_hash: string | null;
  readonly adapter_id: string;
  readonly interpretation_version: string;
  readonly content_policy_version: string;
};

export type ObservationDisposition = "normalized" | "ignored" | "quarantined";

export type InputObservation = {
  readonly source_row_key: string;
  readonly logical_event_id?: string;
  readonly source_revision: string;
  readonly disposition: ObservationDisposition;
  readonly reason: string | null;
  readonly quality_flags: readonly string[];
  readonly normalized_facts: Record<string, unknown> | null;
};

export type DispositionCounts = {
  readonly normalized: number;
  readonly ignored: number;
  readonly quarantined: number;
};

export type SnapshotCoverage = {
  readonly kind: "full_session";
  readonly input_count: number;
};

export type SessionSnapshot = {
  readonly source_instance_id: string;
  readonly agent_id: string;
  readonly session_id: string;
  readonly snapshot_id: string;
  readonly supersedes_snapshot_id: string | null;
  readonly selection_scope: string;
  readonly input_inventory: readonly InputObservation[];
  readonly snapshot_digest: string;
  readonly disposition_counts: DispositionCounts;
  readonly coverage: SnapshotCoverage;
};

export type SourceEventRef = {
  readonly source_row_key: string;
  readonly logical_event_id?: string;
  readonly source_revision: string;
};

export type ViewEntryKind = "message" | "tool" | "model" | "delegate";

export type ViewTimingBasis = "measured" | "transcript_interval" | "unavailable";

export type ViewStatus = "ok" | "error" | "unknown";

export type ViewLinkRelationship = "transcript_lineage" | "tool_result" | "continuation" | "delegation";

export type ViewLink = {
  readonly relationship: ViewLinkRelationship;
  readonly target_span_id: string;
};

export type UsageBasis = "source_reported" | "normalized_mapping";

export type UsageScope = "model_call" | "turn" | "session" | "unknown";

export type ViewEntry = {
  readonly kind: ViewEntryKind;
  readonly name: string;
  readonly trace_id: string;
  readonly trace_id_basis: "synthetic_session";
  readonly span_id: string;
  readonly source_event_refs: readonly SourceEventRef[];
  readonly source_order: number;
  readonly display_parent_id: string | null;
  readonly execution_parent_span_id?: string;
  readonly links: readonly ViewLink[];
  readonly start_time?: string;
  readonly end_time?: string;
  readonly duration_ms?: number;
  readonly timing_basis: ViewTimingBasis;
  readonly status: ViewStatus;
  readonly completion_basis: string;
  readonly usage?: Record<string, number>;
  readonly usage_basis?: UsageBasis;
  readonly usage_scope?: UsageScope;
  readonly usage_evidence_id?: string;
  readonly attributes: Record<string, unknown>;
  readonly quality_flags: readonly string[];
};

export type SelectedEventIdentity = {
  readonly logical_event_id: string;
  readonly source_revision: string;
};

export type ValidatedArtifactRef = {
  readonly kind: string;
  readonly path: string;
  readonly digest: string;
};

export type Binding = {
  readonly journal_id: string;
  readonly snapshot_id: string;
  readonly snapshot_digest: string;
  readonly selected_events: readonly SelectedEventIdentity[];
  readonly boulder_command_run_id: string;
  readonly binding_basis: "operator_explicit";
  readonly validated_artifact_refs?: readonly ValidatedArtifactRef[];
};

export class TraceCanonicalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TraceCanonicalizationError";
  }
}

// Deterministic canonical serialization of a decoded event: stable key order at
// every object depth. The same decoded event canonicalizes identically no matter
// how the stored payload was encoded (event_json or event_zstd) or how its keys
// were ordered. Non-finite numbers (NaN, Infinity) and non-JSON values are
// rejected because they have no honest canonical form.
export function canonicalizeDecodedEvent(decoded: unknown): string {
  return canonicalizeValue(decoded);
}

// source_revision per plan v2 A2: hash of the deterministically canonicalized
// decoded event. Changing compression alone never creates a new revision.
export async function sourceRevisionForDecodedEvent(decoded: unknown): Promise<string> {
  return sha256Hex(canonicalizeDecodedEvent(decoded));
}

export const SNAPSHOT_RECORD_VERSION = "boulder.trace.session-snapshot.v1";

/**
 * Digest preimage is the canonical snapshot content (everything except its
 * observation identity, supersession pointer and digest). Thus A -> B -> A has
 * equal content digests for both As but distinct snapshot identities.
 */
export async function snapshotDigest(snapshot: Omit<SessionSnapshot,
  "snapshot_id" | "supersedes_snapshot_id" | "snapshot_digest">): Promise<string> {
  return sourceRevisionForDecodedEvent({
    source_instance_id: snapshot.source_instance_id, agent_id: snapshot.agent_id,
    session_id: snapshot.session_id, selection_scope: snapshot.selection_scope,
    input_inventory: snapshot.input_inventory, disposition_counts: snapshot.disposition_counts,
    coverage: snapshot.coverage
  });
}

function canonicalizeValue(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TraceCanonicalizationError("Decoded event contains a non-finite number (NaN or Infinity).");
      }
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map(canonicalizeValue).join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => {
          const item = record[key];
          return item !== undefined && typeof item !== "function" && typeof item !== "symbol";
        })
        .sort();
      const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalizeValue(record[key])}`);
      return `{${entries.join(",")}}`;
    }
    default:
      throw new TraceCanonicalizationError(`Decoded event contains a non-JSON value of type "${typeof value}".`);
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isBatchEnvelope(value: unknown): value is BatchEnvelope {
  if (!isRecord(value)) return false;
  return value["schema_version"] === "boulder.trace.batch.v1"
    && typeof value["journal_id"] === "string"
    && typeof value["batch_id"] === "string"
    && typeof value["batch_seq"] === "number"
    && (value["previous_segment_hash"] === null || typeof value["previous_segment_hash"] === "string")
    && typeof value["adapter_id"] === "string"
    && typeof value["interpretation_version"] === "string"
    && typeof value["content_policy_version"] === "string";
}

export function isInputObservation(value: unknown): value is InputObservation {
  if (!isRecord(value)) return false;
  if (typeof value["source_row_key"] !== "string"
    || (value["logical_event_id"] !== undefined && typeof value["logical_event_id"] !== "string")
    || typeof value["source_revision"] !== "string"
    || !isObservationDisposition(value["disposition"])
    || !isStringArray(value["quality_flags"])) {
    return false;
  }
  if (value["disposition"] === "normalized") {
    return value["reason"] === null && isRecord(value["normalized_facts"]);
  }
  return typeof value["reason"] === "string" && value["normalized_facts"] === null;
}

export function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  if (!isRecord(value)) return false;
  return typeof value["source_instance_id"] === "string"
    && typeof value["agent_id"] === "string"
    && typeof value["session_id"] === "string"
    && typeof value["snapshot_id"] === "string"
    && (value["supersedes_snapshot_id"] === null || typeof value["supersedes_snapshot_id"] === "string")
    && typeof value["selection_scope"] === "string"
    && Array.isArray(value["input_inventory"])
    && value["input_inventory"].every(isInputObservation)
    && typeof value["snapshot_digest"] === "string"
    && isDispositionCounts(value["disposition_counts"])
    && isSnapshotCoverage(value["coverage"]);
}

export function isViewEntry(value: unknown): value is ViewEntry {
  if (!isRecord(value)) return false;
  if (!isViewEntryKind(value["kind"])
    || typeof value["name"] !== "string"
    || typeof value["trace_id"] !== "string"
    || value["trace_id_basis"] !== "synthetic_session"
    || typeof value["span_id"] !== "string"
    || !Array.isArray(value["source_event_refs"])
    || !value["source_event_refs"].every(isSourceEventRef)
    || typeof value["source_order"] !== "number"
    || (value["display_parent_id"] !== null && typeof value["display_parent_id"] !== "string")
    || (value["execution_parent_span_id"] !== undefined && typeof value["execution_parent_span_id"] !== "string")
    || !Array.isArray(value["links"])
    || !value["links"].every(isViewLink)
    || (value["start_time"] !== undefined && typeof value["start_time"] !== "string")
    || (value["end_time"] !== undefined && typeof value["end_time"] !== "string")
    || (value["duration_ms"] !== undefined && !isFiniteNumber(value["duration_ms"]))
    || !isViewTimingBasis(value["timing_basis"])
    || !isViewStatus(value["status"])
    || typeof value["completion_basis"] !== "string"
    || !isRecord(value["attributes"])
    || !isStringArray(value["quality_flags"])) {
    return false;
  }
  return usageFieldsAreConsistent(value);
}

export function isBinding(value: unknown): value is Binding {
  if (!isRecord(value)) return false;
  return typeof value["journal_id"] === "string"
    && typeof value["snapshot_id"] === "string"
    && typeof value["snapshot_digest"] === "string"
    && Array.isArray(value["selected_events"])
    && value["selected_events"].every(isSelectedEventIdentity)
    && typeof value["boulder_command_run_id"] === "string"
    && value["binding_basis"] === "operator_explicit"
    && (value["validated_artifact_refs"] === undefined
      || (Array.isArray(value["validated_artifact_refs"]) && value["validated_artifact_refs"].every(isValidatedArtifactRef)));
}

function usageFieldsAreConsistent(value: Record<string, unknown>): boolean {
  const usage = value["usage"];
  if (usage === undefined) {
    return value["usage_basis"] === undefined
      && value["usage_scope"] === undefined
      && value["usage_evidence_id"] === undefined;
  }
  if (!isRecord(usage)) return false;
  if (!Object.values(usage).every(isFiniteNumber)) return false;
  return isUsageBasis(value["usage_basis"])
    && isUsageScope(value["usage_scope"])
    && typeof value["usage_evidence_id"] === "string";
}

function isObservationDisposition(value: unknown): value is ObservationDisposition {
  return value === "normalized" || value === "ignored" || value === "quarantined";
}

function isDispositionCounts(value: unknown): value is DispositionCounts {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value["normalized"])
    && isFiniteNumber(value["ignored"])
    && isFiniteNumber(value["quarantined"]);
}

function isSnapshotCoverage(value: unknown): value is SnapshotCoverage {
  if (!isRecord(value)) return false;
  return value["kind"] === "full_session" && isFiniteNumber(value["input_count"]);
}

function isSourceEventRef(value: unknown): value is SourceEventRef {
  if (!isRecord(value)) return false;
  return typeof value["source_row_key"] === "string"
    && (value["logical_event_id"] === undefined || typeof value["logical_event_id"] === "string")
    && typeof value["source_revision"] === "string";
}

function isViewEntryKind(value: unknown): value is ViewEntryKind {
  return value === "message" || value === "tool" || value === "model" || value === "delegate";
}

function isViewTimingBasis(value: unknown): value is ViewTimingBasis {
  return value === "measured" || value === "transcript_interval" || value === "unavailable";
}

function isViewStatus(value: unknown): value is ViewStatus {
  return value === "ok" || value === "error" || value === "unknown";
}

function isViewLink(value: unknown): value is ViewLink {
  if (!isRecord(value)) return false;
  const relationship = value["relationship"];
  return (relationship === "transcript_lineage"
      || relationship === "tool_result"
      || relationship === "continuation"
      || relationship === "delegation")
    && typeof value["target_span_id"] === "string";
}

function isUsageBasis(value: unknown): value is UsageBasis {
  return value === "source_reported" || value === "normalized_mapping";
}

function isUsageScope(value: unknown): value is UsageScope {
  return value === "model_call" || value === "turn" || value === "session" || value === "unknown";
}

function isSelectedEventIdentity(value: unknown): value is SelectedEventIdentity {
  if (!isRecord(value)) return false;
  return typeof value["logical_event_id"] === "string" && typeof value["source_revision"] === "string";
}

function isValidatedArtifactRef(value: unknown): value is ValidatedArtifactRef {
  if (!isRecord(value)) return false;
  return typeof value["kind"] === "string"
    && typeof value["path"] === "string"
    && typeof value["digest"] === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
