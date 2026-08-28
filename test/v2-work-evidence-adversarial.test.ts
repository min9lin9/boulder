import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { parseV2WorkJournal } from "../src/v2/work-events.js";
import { reconcileV2Work } from "../src/v2/work-replay.js";
import { replayWorkJournal as replayV2WorkJournal } from "./helpers/v2-work.js";

const FIXTURE_PATH = join(
  import.meta.dir,
  "../fixtures/v2-work/adversarial-evidence-ref-e-work-01.json"
);
const EVENT_DOMAIN = "boulder.v2.work-event.v1";

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
type FrozenJournal = {
  readonly id: string;
  readonly events: readonly Readonly<Record<string, Json>>[];
  readonly canonicalJournal: string;
  readonly eventDigests: readonly string[];
};
type CrashPrefix = FrozenJournal & {
  readonly runnerKind: "in-process" | "process";
  readonly crashAfterSequence: number;
  readonly observationStatus: "missing";
  readonly expectedRecoveryAction: "record-runner-missing";
};
type EvidenceCorpus = {
  readonly schemaVersion: "boulder.v2.work-adversarial-vectors.v1";
  readonly oracle: { readonly producer: string };
  readonly acceptance: FrozenJournal & { readonly expectedState: "accepted" };
  readonly crashPrefixes: readonly CrashPrefix[];
};

describe("REF-E-WORK-01 adversarial evidence", () => {
  test("pins acceptance and crash-prefix event bytes and digests from an independent oracle", async () => {
    const corpus = await loadCorpus();
    const vectors = [corpus.acceptance, ...corpus.crashPrefixes];

    expect(corpus.oracle.producer).toContain("no Boulder production import");
    expect(corpus.acceptance.expectedState).toBe("accepted");
    expect(events(corpus.acceptance.canonicalJournal).some((event) => event["kind"] === "attempt-accepted")).toBe(true);
    expect(new Set(corpus.crashPrefixes.map((vector) => vector.runnerKind))).toEqual(
      new Set(["in-process", "process"])
    );

    for (const vector of vectors) {
      const parsedEvents = events(vector.canonicalJournal);
      expect(parsedEvents).toEqual(independentOracleEvents(vector));
      expect(vector.canonicalJournal.endsWith("\n")).toBe(true);
      expect(parsedEvents.map((event) => event["eventDigest"])).toEqual(vector.eventDigests);
      for (const [index, event] of parsedEvents.entries()) {
        expect(independentCanonicalize(event)).toBe(vector.canonicalJournal.split("\n")[index]);
        expect(event["eventDigest"]).toBe(independentEventDigest(event));
        expect(event["previousEventDigest"]).toBe(
          index === 0 ? null : parsedEvents[index - 1]["eventDigest"]
        );
      }
    }
  });

  test("replays the checked-in acceptance event into a durable nonterminal accepted state", async () => {
    const { acceptance } = await loadCorpus();

    const replay = await replayV2WorkJournal(acceptance.canonicalJournal);

    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error(replay.reasonCode);
    expect((replay.value as { readonly status: string }).status).toBe(acceptance.expectedState);
    expect(replay.value.completion).toBeNull();
  });

  test("recovers checked-in in-process and process crash prefixes through the real replay surface", async () => {
    const { crashPrefixes } = await loadCorpus();

    for (const vector of crashPrefixes) {
      const parsed = await parseV2WorkJournal(vector.canonicalJournal);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error(`${vector.id}: ${parsed.reasonCode}`);
      expect(parsed.value).toHaveLength(vector.crashAfterSequence);

      const replay = await replayV2WorkJournal(vector.canonicalJournal);
      expect(replay.ok).toBe(true);
      if (!replay.ok) throw new Error(`${vector.id}: ${replay.reasonCode}`);
      const attempt = replay.value.attempts.at(-1);
      if (!attempt) throw new Error(`${vector.id}: missing active attempt`);
      expect(attempt.runnerKind).toBe(vector.runnerKind);
      expect(reconcileV2Work(replay.value, [{
        kind: "runner",
        runnerKind: vector.runnerKind,
        sessionId: attempt.sessionId,
        status: vector.observationStatus
      }])).toEqual([{
        kind: vector.expectedRecoveryAction,
        workId: replay.value.workId,
        attemptId: attempt.attemptId,
        attempt: attempt.attempt,
        workRevisionDigest: attempt.workRevisionDigest,
        runnerKind: attempt.runnerKind,
        sessionId: attempt.sessionId,
        failureCode: "runner.missing",
        retryable: true
      }]);
    }
  });
});

async function loadCorpus(): Promise<EvidenceCorpus> {
  const value: unknown = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
  if (!isRecord(value)
    || value["schemaVersion"] !== "boulder.v2.work-adversarial-vectors.v1"
    || !isRecord(value["oracle"])
    || typeof value["oracle"]["producer"] !== "string"
    || !isFrozenJournal(value["acceptance"])
    || value["acceptance"]["expectedState"] !== "accepted"
    || !Array.isArray(value["crashPrefixes"])
    || !value["crashPrefixes"].every(isCrashPrefix)) {
    throw new Error("invalid adversarial Work evidence corpus");
  }
  const corpus = value as unknown as Omit<EvidenceCorpus, "acceptance" | "crashPrefixes"> & {
    readonly acceptance: Omit<EvidenceCorpus["acceptance"], "canonicalJournal">;
    readonly crashPrefixes: readonly Omit<CrashPrefix, "canonicalJournal">[];
  };
  return {
    ...corpus,
    acceptance: materializeJournal(corpus.acceptance),
    crashPrefixes: corpus.crashPrefixes.map(materializeJournal)
  };
}

function isFrozenJournal(value: unknown): value is Record<string, unknown> & FrozenJournal {
  return isRecord(value)
    && typeof value["id"] === "string"
    && Array.isArray(value["events"])
    && value["events"].every(isRecord)
    && Array.isArray(value["eventDigests"])
    && value["eventDigests"].every((digest) => typeof digest === "string");
}

function materializeJournal<T extends { readonly events: readonly Readonly<Record<string, Json>>[] }>(
  value: T
): T & { readonly canonicalJournal: string } {
  return {
    ...value,
    canonicalJournal: `${value.events.map(independentCanonicalize).join("\n")}\n`
  };
}

function isCrashPrefix(value: unknown): value is Record<string, unknown> & CrashPrefix {
  return isFrozenJournal(value)
    && (value["runnerKind"] === "in-process" || value["runnerKind"] === "process")
    && Number.isSafeInteger(value["crashAfterSequence"])
    && value["observationStatus"] === "missing"
    && value["expectedRecoveryAction"] === "record-runner-missing";
}

function events(journal: string): readonly Record<string, Json>[] {
  const lines = journal.endsWith("\n") ? journal.slice(0, -1).split("\n") : [];
  return lines.map((line) => {
    const value: unknown = JSON.parse(line);
    if (!isRecord(value)) throw new Error("frozen journal event must be an object");
    return value as Record<string, Json>;
  });
}

function independentEventDigest(event: Readonly<Record<string, Json>>): string {
  const projection = Object.fromEntries(
    Object.entries(event).filter(([key]) => key !== "eventDigest")
  ) as Record<string, Json>;
  return `sha256:${createHash("sha256")
    .update(`${EVENT_DOMAIN}\n${independentCanonicalize(projection)}`, "utf8")
    .digest("hex")}`;
}

function independentOracleEvents(
  vector: EvidenceCorpus["acceptance"] | CrashPrefix
): readonly Record<string, Json>[] {
  const runnerKind = "runnerKind" in vector ? vector.runnerKind : "in-process";
  const workId = vector.id === "acceptance-is-durable-nonterminal-state"
    ? "work-accepted"
    : runnerKind === "in-process"
      ? "work-in-process-crash"
      : "work-process-crash";
  const procedureDigest = `sha256:${"e".repeat(64)}`;
  const resolvedContract = {
    contractDigest: `sha256:${"f".repeat(64)}`,
    revision: 1
  };
  const basis = { kind: "initial" };
  const semanticDigest = independentDigest("boulder.v2.work-semantic.v1", {
    procedureDigest,
    resolvedContract
  });
  const revisionData = {
    revision: 1,
    previousWorkRevisionDigest: null,
    procedureDigest,
    resolvedContract,
    basis,
    semanticDigest
  };
  const workRevisionDigest = independentDigest("boulder.v2.work-revision.v2", {
    schemaVersion: "boulder.v2.work-revision.v2",
    workId,
    ...revisionData
  });
  const specifications: readonly {
    readonly kind: string;
    readonly data: Readonly<Record<string, Json>>;
  }[] = [
    { kind: "revision-created", data: revisionData },
    {
      kind: "attempt-started",
      data: {
        attemptId: "attempt-1",
        attempt: 1,
        runnerKind,
        sessionId: `session-${runnerKind}`
      }
    },
    ...(vector.id === "acceptance-is-durable-nonterminal-state"
      ? [{
          kind: "attempt-accepted",
          data: {
            attemptId: "attempt-1",
            acceptedAt: "2026-08-01T00:00:03.000Z"
          }
        }]
      : [])
  ];
  let previousEventDigest: string | null = null;
  return specifications.map((specification, index) => {
    const eventWithoutDigest = {
      schemaVersion: EVENT_DOMAIN,
      eventId: `event-${index + 1}`,
      sequence: index + 1,
      occurredAt: `2026-08-01T00:00:0${index + 1}.000Z`,
      workId,
      workRevisionDigest,
      previousEventDigest,
      kind: specification.kind,
      data: specification.data
    };
    const eventDigest = independentDigest(EVENT_DOMAIN, eventWithoutDigest);
    previousEventDigest = eventDigest;
    return { ...eventWithoutDigest, eventDigest };
  });
}

function independentDigest(domain: string, value: Json): string {
  return `sha256:${createHash("sha256")
    .update(`${domain}\n${independentCanonicalize(value)}`, "utf8")
    .digest("hex")}`;
}

function independentCanonicalize(value: Json): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(independentCanonicalize).join(",")}]`;
  if (!isJsonObject(value)) throw new Error("canonical JSON object required");
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${independentCanonicalize(value[key])}`
  ).join(",")}}`;
}

function isJsonObject(value: Json): value is { readonly [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
