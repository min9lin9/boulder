import type { V2Digest, V2Id, V2JsonValue } from "./contracts.js";

export const V2_WORK_EVENT_SCHEMA_VERSION = "boulder.v2.work-event.v1" as const;
export const V2_WORK_JOURNAL_MAX_BYTES = 1024 * 1024;
export const V2_WORK_JOURNAL_MAX_EVENTS = 1000;
export const V2_WORK_EVENT_MAX_JSON_DEPTH = 32;

export const V2_WORK_EVENT_KINDS = [
  "revision-created",
  "attempt-started",
  "attempt-accepted",
  "approval-requested",
  "approval-recorded",
  "effect-claimed",
  "effect-receipt-recorded",
  "attempt-terminal",
  "critique-recorded",
  "rollback-recorded",
  "completion-recorded"
] as const;

export type V2WorkEventKind = (typeof V2_WORK_EVENT_KINDS)[number];
export type V2WorkEventData = Readonly<Record<string, V2JsonValue>>;

export interface V2WorkEventInput {
  readonly eventId: V2Id;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly workId: V2Id;
  readonly workRevisionDigest: V2Digest;
  readonly previousEventDigest: V2Digest | null;
  readonly kind: V2WorkEventKind;
  readonly data: V2WorkEventData;
}

export interface V2WorkEvent extends V2WorkEventInput {
  readonly schemaVersion: typeof V2_WORK_EVENT_SCHEMA_VERSION;
  readonly eventDigest: V2Digest;
}

export type V2WorkEventReason =
  | "v2.work.event_invalid"
  | "v2.work.event_kind_invalid"
  | "v2.work.event_sequence_invalid"
  | "v2.work.event_link_invalid"
  | "v2.work.event_digest_invalid"
  | "v2.work.event_canonical_invalid"
  | "v2.work.log_tail_incomplete"
  | "v2.work.journal_limit_exceeded"
  | "v2.work.idempotency_conflict";

export type V2WorkEventResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reasonCode: V2WorkEventReason };
