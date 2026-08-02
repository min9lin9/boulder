import {
  canonicalizeV2WorkEvent,
  buildV2WorkEvent,
  parseV2WorkEventValue
} from "./work-event-validation.js";
import type {
  V2WorkEvent,
  V2WorkEventInput,
  V2WorkEventReason,
  V2WorkEventResult
} from "./work-event-contracts.js";
import {
  V2_WORK_JOURNAL_MAX_BYTES,
  V2_WORK_JOURNAL_MAX_EVENTS
} from "./work-event-contracts.js";

export * from "./work-event-contracts.js";
export { canonicalizeV2WorkEvent } from "./work-event-validation.js";

export async function createV2WorkEvent(
  input: V2WorkEventInput
): Promise<V2WorkEventResult<V2WorkEvent>> {
  return buildV2WorkEvent(input);
}

export async function parseV2WorkJournal(
  journal: string
): Promise<V2WorkEventResult<readonly V2WorkEvent[]>> {
  if (journal.length === 0) return success(Object.freeze([]));
  if (new TextEncoder().encode(journal).byteLength > V2_WORK_JOURNAL_MAX_BYTES) {
    return failure("v2.work.journal_limit_exceeded");
  }
  if (!journal.endsWith("\n")) return failure("v2.work.log_tail_incomplete");
  const lines = journal.slice(0, -1).split("\n");
  if (lines.length > V2_WORK_JOURNAL_MAX_EVENTS) {
    return failure("v2.work.journal_limit_exceeded");
  }
  if (lines.some((line) => line.length === 0)) return failure("v2.work.event_invalid");
  const events: V2WorkEvent[] = [];
  const ids = new Map<string, { readonly digest: string; readonly line: string }>();
  for (const line of lines) {
    const parsed = parseJson(line);
    if (!parsed.ok) return parsed;
    const event = await parseV2WorkEventValue(parsed.value);
    if (!event.ok) return event;
    if (canonicalizeV2WorkEvent(event.value) !== line) {
      return failure("v2.work.event_canonical_invalid");
    }
    const prior = ids.get(event.value.eventId);
    if (prior) {
      return failure("v2.work.idempotency_conflict");
    }
    if (event.value.sequence !== events.length + 1) {
      return failure("v2.work.event_sequence_invalid");
    }
    if (event.value.previousEventDigest !== (events.at(-1)?.eventDigest ?? null)) {
      return failure("v2.work.event_link_invalid");
    }
    ids.set(event.value.eventId, { digest: event.value.eventDigest, line });
    events.push(event.value);
  }
  return success(Object.freeze(events));
}

export async function appendV2WorkEvent(
  journal: string,
  event: V2WorkEvent
): Promise<
  | { readonly ok: true; readonly value: string; readonly replayed: boolean }
  | { readonly ok: false; readonly reasonCode: V2WorkEventReason }
> {
  const parsed = await parseV2WorkJournal(journal);
  if (!parsed.ok) return parsed;
  const checked = await parseV2WorkEventValue(event);
  if (!checked.ok) return checked;
  const canonical = canonicalizeV2WorkEvent(checked.value);
  const existing = parsed.value.find((item) => item.eventId === event.eventId);
  if (existing) {
    if (canonicalizeV2WorkEvent(existing) === canonical) {
      return { ok: true, value: journal, replayed: true };
    }
    return failure("v2.work.idempotency_conflict");
  }
  if (event.sequence !== parsed.value.length + 1) {
    return failure("v2.work.event_sequence_invalid");
  }
  if (event.previousEventDigest !== (parsed.value.at(-1)?.eventDigest ?? null)) {
    return failure("v2.work.event_link_invalid");
  }
  if (parsed.value.length >= V2_WORK_JOURNAL_MAX_EVENTS) {
    return failure("v2.work.journal_limit_exceeded");
  }
  if (new TextEncoder().encode(`${journal}${canonical}\n`).byteLength
    > V2_WORK_JOURNAL_MAX_BYTES) {
    return failure("v2.work.journal_limit_exceeded");
  }
  return {
    ok: true,
    value: `${journal}${canonical}\n`,
    replayed: false
  };
}

function parseJson(line: string): V2WorkEventResult<unknown> {
  try {
    const value: unknown = JSON.parse(line);
    return success(value);
  } catch {
    return failure("v2.work.event_invalid");
  }
}

function success<T>(value: T): V2WorkEventResult<T> {
  return { ok: true, value };
}

function failure(reasonCode: V2WorkEventReason): {
  readonly ok: false;
  readonly reasonCode: V2WorkEventReason;
} {
  return { ok: false, reasonCode };
}
