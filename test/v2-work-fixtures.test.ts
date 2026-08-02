import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  isV2Digest,
  type V2Digest,
  type V2JsonValue
} from "../src/v2/contracts.js";
import {
  V2_WORK_EVENT_KINDS,
  type V2WorkEventData,
  type V2WorkEventKind
} from "../src/v2/work-events.js";
import { replayWorkJournal as replayV2WorkJournal } from "./helpers/v2-work.js";
import {
  buildWorkJournal,
  type JournalEntry
} from "./helpers/v2-work.js";

type Vector = {
  readonly id: string;
  readonly workId: string;
  readonly initialRevisionDigest: V2Digest;
  readonly entries: readonly JournalEntry[];
  readonly expectedStatus?: string;
  readonly expectedReasonCode?: string;
};

const fixtureRoot = join(import.meta.dir, "../fixtures/v2-work");

describe("REF-E-WORK-01 fixture vectors", () => {
  test("replays all three valid strategy scenarios", async () => {
    // Given the checked-in valid corpus
    const vectors = await loadVectors("valid-ref-e-work-01.json");

    // When each scenario is converted to canonical JSONL and replayed
    const results = await Promise.all(vectors.map(async (vector) => ({
      vector,
      replay: await replayV2WorkJournal(await buildWorkJournal(
        vector.workId,
        vector.initialRevisionDigest,
        vector.entries
      ))
    })));

    // Then every named strategy scenario reaches its expected state
    expect(vectors.map((item) => item.id)).toEqual([
      "local-complete",
      "external-approved-complete",
      "failure-retry-revision-rollback"
    ]);
    for (const { vector, replay } of results) {
      expect(replay.ok).toBe(true);
      if (!replay.ok) throw new Error(replay.reasonCode);
      expect(replay.value.status).toBe(vector.expectedStatus);
    }
  });

  test("rejects every checked-in invalid authority and recovery vector", async () => {
    // Given the checked-in invalid corpus
    const vectors = await loadVectors("invalid-ref-e-work-01.json");

    // When each invalid scenario is replayed
    const results = await Promise.all(vectors.map(async (vector) => ({
      vector,
      replay: await replayV2WorkJournal(await buildWorkJournal(
        vector.workId,
        vector.initialRevisionDigest,
        vector.entries
      ))
    })));

    // Then each vector fails for its stable reason
    expect(vectors.map((item) => item.id)).toEqual([
      "external-effect-without-approval",
      "new-revision-before-rollback",
      "rollback-external-effect"
    ]);
    for (const { vector, replay } of results) {
      expect(replay.ok).toBe(false);
      if (replay.ok) throw new Error("invalid vector unexpectedly replayed");
      expect(replay.reasonCode).toBe(vector.expectedReasonCode);
    }
  });
});

async function loadVectors(name: string): Promise<readonly Vector[]> {
  const parsed: unknown = JSON.parse(await readFile(join(fixtureRoot, name), "utf8"));
  const root = record(parsed);
  if (root.schemaVersion !== "boulder.v2.work-vectors.v1" || !Array.isArray(root.vectors)) {
    throw new Error(`invalid Work vector corpus: ${name}`);
  }
  return root.vectors.map(parseVector);
}

function parseVector(value: unknown): Vector {
  const item = record(value);
  if (
    typeof item.id !== "string"
    || typeof item.workId !== "string"
    || !isV2Digest(item.initialRevisionDigest)
    || !Array.isArray(item.entries)
  ) throw new Error("invalid Work vector");
  return {
    id: item.id,
    workId: item.workId,
    initialRevisionDigest: item.initialRevisionDigest,
    entries: item.entries.map(parseEntry),
    expectedStatus: optionalString(item.expectedStatus),
    expectedReasonCode: optionalString(item.expectedReasonCode)
  };
}

function parseEntry(value: unknown): JournalEntry {
  const item = record(value);
  const kind = eventKind(item.kind);
  const data = jsonRecord(item.data);
  const workRevisionDigest = item.workRevisionDigest;
  if (!(workRevisionDigest === undefined || isV2Digest(workRevisionDigest))) {
    throw new Error("invalid Work vector revision digest");
  }
  return workRevisionDigest === undefined
    ? { kind, data }
    : { kind, data, workRevisionDigest };
}

function eventKind(value: unknown): V2WorkEventKind {
  for (const kind of V2_WORK_EVENT_KINDS) {
    if (kind === value) return kind;
  }
  throw new Error("invalid Work vector event kind");
}

function jsonRecord(value: unknown): V2WorkEventData {
  const input = record(value);
  const output: Record<string, V2JsonValue> = {};
  for (const [key, item] of Object.entries(input)) {
    if (!isJsonValue(item)) throw new Error("invalid Work vector event data");
    output[key] = item;
  }
  return output;
}

function isJsonValue(value: unknown): value is V2JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === "object"
    && value !== null
    && Object.values(value).every(isJsonValue);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid Work vector object");
  }
  return Object.fromEntries(Object.entries(value));
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || typeof value === "string") return value;
  throw new Error("invalid Work vector expectation");
}
