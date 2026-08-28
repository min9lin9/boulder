import {
  canonicalizeV2WorkEvent,
  createV2WorkEvent,
  V2_WORK_EVENT_SCHEMA_VERSION,
  type V2WorkEvent,
  type V2WorkEventData,
  type V2WorkEventInput,
  type V2WorkEventKind
} from "../../src/v2/work-events.js";
import { digestV2 } from "../../src/v2/canonical.js";
import {
  V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION,
  V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
  V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION
} from "../../src/v2/work-durable.js";
import {
  replayV2WorkJournal,
  type V2WorkApprovalAuthentication,
  type V2WorkReplayOptions
} from "../../src/v2/work-replay.js";
import type { V2Digest, V2JsonValue } from "../../src/v2/contracts.js";

export const digest = (char: "a" | "b" | "c" | "d" | "e" | "f"): V2Digest =>
  `sha256:${char.repeat(64)}`;

export const timestamp = (second: number): string =>
  new Date(Date.UTC(2026, 7, 1, 0, 0, second)).toISOString();

export type JournalEntry = {
  readonly kind: V2WorkEventKind;
  readonly data: V2WorkEventData;
  readonly workRevisionDigest?: V2Digest;
  readonly raw?: boolean;
};

export async function buildWorkJournal(
  workId: string,
  initialRevisionDigest: V2Digest,
  entries: readonly JournalEntry[]
): Promise<string> {
  let previousEventDigest: V2Digest | null = null;
  let currentAttemptId: string | null = null;
  let lastCritiqueDigest: V2Digest | null = null;
  let lastFailedTerminalReceiptDigest: V2Digest | null = null;
  let lastTerminalReceiptDigest: V2Digest | null = null;
  const approvalRequests = new Map<string, {
    readonly actionId: string;
    readonly attemptId: string;
  }>();
  const revisionAliases = new Map<V2Digest, V2Digest>();
  const lines: string[] = [];
  for (const [index, entry] of entries.entries()) {
    const requestedRevisionDigest = entry.workRevisionDigest ?? initialRevisionDigest;
    let workRevisionDigest = revisionAliases.get(requestedRevisionDigest)
      ?? requestedRevisionDigest;
    const occurredAt = timestamp(index + 1);
    let data: V2WorkEventData;
    if (entry.raw) {
      data = entry.data;
    } else if (entry.kind === "revision-created") {
      const previous = entry.data.previousWorkRevisionDigest;
      const previousDigest = typeof previous === "string"
        ? revisionAliases.get(previous as V2Digest) ?? previous as V2Digest
        : null;
      const record = await canonicalRevisionEventRecord(
        workId,
        Number(entry.data.revision),
        previousDigest,
        lastCritiqueDigest,
        lastFailedTerminalReceiptDigest
      );
      workRevisionDigest = record.workRevisionDigest;
      revisionAliases.set(requestedRevisionDigest, workRevisionDigest);
      data = record.data;
    } else {
      data = await canonicalEntryData({
          workId,
          workRevisionDigest,
          occurredAt,
          entry,
          currentAttemptId,
          lastCritiqueDigest,
          lastFailedTerminalReceiptDigest,
          lastTerminalReceiptDigest,
          approvalRequests
        });
    }
    const eventInput: V2WorkEventInput = {
      eventId: `event-${index + 1}`,
      sequence: index + 1,
      occurredAt,
      workId,
      workRevisionDigest,
      previousEventDigest,
      kind: entry.kind,
      data
    };
    const event = await createV2WorkEvent(eventInput);
    const eventValue: V2WorkEvent = event.ok
      ? event.value
      : await uncheckedEvent(eventInput);
    lines.push(canonicalizeV2WorkEvent(eventValue));
    previousEventDigest = eventValue.eventDigest;
    if (entry.kind === "attempt-started") currentAttemptId = stringValue(data.attemptId);
    if (entry.kind === "attempt-terminal") {
      lastTerminalReceiptDigest = digestValue(data.terminalReceiptDigest);
      if (data.status === "failed") {
        lastFailedTerminalReceiptDigest = lastTerminalReceiptDigest;
      }
    }
    if (entry.kind === "critique-recorded") {
      lastCritiqueDigest = digestValue(data.critiqueDigest);
    }
    if (entry.kind === "approval-requested") {
      approvalRequests.set(
        `${stringValue(data.gateId)}\n${stringValue(data.effectId)}`,
        {
          actionId: stringValue(data.actionId),
          attemptId: stringValue(data.attemptId)
        }
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export function trustedReplayOptions(
  journal: string,
  verifyApproval: (
    approval: V2WorkApprovalAuthentication
  ) => boolean | Promise<boolean> = () => true
): V2WorkReplayOptions {
  const firstLine = journal.split("\n", 1)[0];
  const first: unknown = JSON.parse(firstLine);
  if (!isRecord(first)
    || typeof first.workId !== "string"
    || typeof first.workRevisionDigest !== "string"
    || !first.workRevisionDigest.startsWith("sha256:")) {
    throw new Error("trusted Work journal root missing");
  }
  return {
    anchor: {
      workId: first.workId,
      rootRevisionDigest: first.workRevisionDigest as V2Digest
    },
    verifyEvent: () => true,
    verifyApproval
  };
}

export async function replayWorkJournal(
  journal: string,
  verifyApproval?: (
    approval: V2WorkApprovalAuthentication
  ) => boolean | Promise<boolean>
) {
  return replayV2WorkJournal(journal, trustedReplayOptions(journal, verifyApproval));
}

type CanonicalEntryContext = {
  readonly workId: string;
  readonly workRevisionDigest: V2Digest;
  readonly occurredAt: string;
  readonly entry: JournalEntry;
  readonly currentAttemptId: string | null;
  readonly lastCritiqueDigest: V2Digest | null;
  readonly lastFailedTerminalReceiptDigest: V2Digest | null;
  readonly lastTerminalReceiptDigest: V2Digest | null;
  readonly approvalRequests: ReadonlyMap<string, {
    readonly actionId: string;
    readonly attemptId: string;
  }>;
};

async function canonicalEntryData(
  context: CanonicalEntryContext
): Promise<V2WorkEventData> {
  const { entry } = context;
  if (entry.kind === "approval-requested") {
    return Object.freeze({
      ...entry.data,
      attemptId: requiredAttemptId(context.currentAttemptId)
    });
  }
  if (entry.kind === "approval-recorded") {
    const gateId = stringValue(entry.data.gateId);
    const effectId = stringValue(entry.data.effectId);
    const request = context.approvalRequests.get(`${gateId}\n${effectId}`);
    if (!request) return entry.data;
    const authorityReceiptDigest = await digestV2("boulder.v2.work-approval.v1", {
      workId: context.workId,
      workRevisionDigest: context.workRevisionDigest,
      attemptId: request.attemptId,
      gateId,
      actionId: request.actionId,
      effectId,
      decision: stringValue(entry.data.decision)
    });
    return Object.freeze({
      ...entry.data,
      actionId: request.actionId,
      attemptId: request.attemptId,
      authorityReceiptDigest
    });
  }
  if (entry.kind === "effect-claimed") {
    const gateId = entry.data.gateId;
    const effectId = stringValue(entry.data.effectId);
    const request = typeof gateId === "string"
      ? context.approvalRequests.get(`${gateId}\n${effectId}`)
      : undefined;
    return Object.freeze({
      ...entry.data,
      actionId: request?.actionId
        ?? (typeof entry.data.actionId === "string"
          ? entry.data.actionId
          : typeof gateId === "string"
            ? "action-unbound"
            : null)
    });
  }
  if (entry.kind === "effect-receipt-recorded") {
    return Object.freeze({
      ...entry.data,
      attemptId: requiredAttemptId(context.currentAttemptId)
    });
  }
  if (entry.kind === "attempt-terminal") {
    return canonicalTerminalData(context);
  }
  if (entry.kind === "completion-recorded") {
    const terminalReceiptDigest = context.lastTerminalReceiptDigest
      ?? digestValue(entry.data.terminalReceiptDigest);
    const sinkId = stringValue(entry.data.sinkId);
    const completionDigest = await digestV2(
      V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION,
      {
        schemaVersion: V2_DURABLE_WORK_COMPLETION_SCHEMA_VERSION,
        workId: context.workId,
        terminalReceiptDigest,
        sinkId
      }
    );
    return Object.freeze({ ...entry.data, terminalReceiptDigest, completionDigest });
  }
  return entry.data;
}

export async function canonicalRevisionEventRecord(
  workId: string,
  revision: number,
  previousWorkRevisionDigest: V2Digest | null,
  critiqueDigest: V2Digest | null = null,
  failedTerminalReceiptDigest: V2Digest | null = null
): Promise<{
  readonly data: V2WorkEventData;
  readonly workRevisionDigest: V2Digest;
}> {
  const procedureDigest = revision === 1 ? digest("e") : digest("f");
  const resolvedContract: V2JsonValue = Object.freeze({
    contractDigest: revision === 1 ? digest("f") : digest("e"),
    revision
  });
  let basis: V2JsonValue;
  if (revision === 1) {
    basis = Object.freeze({ kind: "initial" });
  } else {
    if (!critiqueDigest || !failedTerminalReceiptDigest) {
      throw new Error("material revision requires critique and failed terminal");
    }
    basis = Object.freeze({
      kind: "critique",
      critiqueDigest,
      failedTerminalReceiptDigest
    });
  }
  const semanticDigest = await digestV2("boulder.v2.work-semantic.v1", {
    procedureDigest,
    resolvedContract
  });
  const data: V2WorkEventData = Object.freeze({
    revision,
    previousWorkRevisionDigest,
    procedureDigest,
    resolvedContract,
    basis,
    semanticDigest,
  });
  const workRevisionDigest = await digestV2(
    V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
    {
      schemaVersion: V2_DURABLE_WORK_REVISION_SCHEMA_VERSION,
      workId,
      revision,
      previousWorkRevisionDigest,
      procedureDigest,
      resolvedContract,
      basis,
      semanticDigest
    }
  );
  return { data, workRevisionDigest };
}

async function canonicalTerminalData(
  context: CanonicalEntryContext
): Promise<V2WorkEventData> {
  const attemptId = stringValue(context.entry.data.attemptId);
  const runtimeWorkId = `runtime-${attemptId}`;
  const base = {
    schemaVersion: V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION,
    workId: context.workId,
    workRevisionDigest: context.workRevisionDigest,
    attemptId,
    runtimeWorkId,
    terminalAt: context.occurredAt
  };
  let projection: V2JsonValue;
  let data: V2WorkEventData;
  if (context.entry.data.status === "completed") {
    const resultDigest = digest("b");
    const evidenceDigests = Object.freeze([]) as readonly V2Digest[];
    projection = { ...base, status: "completed", resultDigest, evidenceDigests };
    data = Object.freeze({
      ...context.entry.data,
      runtimeWorkId,
      terminalAt: context.occurredAt,
      resultDigest,
      evidenceDigests
    });
  } else if (context.entry.data.status === "failed") {
    const failureCode = "executor.failed";
    const retryable = true;
    projection = {
      ...base,
      status: "failed",
      failure: { code: failureCode, retryable }
    };
    data = Object.freeze({
      ...context.entry.data,
      runtimeWorkId,
      terminalAt: context.occurredAt,
      failureCode,
      retryable
    });
  } else {
    const reasonCode = "executor.cancelled";
    projection = { ...base, status: "cancelled", reasonCode };
    data = Object.freeze({
      ...context.entry.data,
      runtimeWorkId,
      terminalAt: context.occurredAt,
      reasonCode
    });
  }
  const terminalReceiptDigest = await digestV2(
    V2_DURABLE_WORK_TERMINAL_SCHEMA_VERSION,
    projection
  );
  return Object.freeze({ ...data, terminalReceiptDigest });
}

function requiredAttemptId(value: string | null): string {
  if (!value) throw new Error("Work journal approval requires a running attempt");
  return value;
}

function stringValue(value: V2JsonValue | undefined): string {
  if (typeof value !== "string") throw new Error("Work journal string missing");
  return value;
}

function digestValue(value: V2JsonValue | undefined): V2Digest {
  const valueString = stringValue(value);
  if (!valueString.startsWith("sha256:")) throw new Error("Work journal digest missing");
  return valueString as V2Digest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function uncheckedEvent(
  input: Omit<V2WorkEvent, "schemaVersion" | "eventDigest">
): Promise<V2WorkEvent> {
  const valueWithoutDigest = {
    schemaVersion: V2_WORK_EVENT_SCHEMA_VERSION,
    ...input
  };
  const eventDigest = await digestV2(V2_WORK_EVENT_SCHEMA_VERSION, valueWithoutDigest);
  return Object.freeze({ ...valueWithoutDigest, eventDigest });
}
