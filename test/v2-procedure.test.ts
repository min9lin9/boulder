import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { compileV2Procedure } from "../src/v2/procedure.js";

const fixtures = join(import.meta.dir, "../fixtures/v2-procedure");

describe("v2 static Procedure candidate", () => {
  test("deterministically compiles the bounded REF-E-SOP-01 graph", async () => {
    const value: unknown = JSON.parse(await readFile(join(fixtures, "valid-ref-e-sop-01.json"), "utf8"));
    const first = await compileV2Procedure(value);
    const second = await compileV2Procedure(value);

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    if (!first.ok) throw new Error("valid Procedure must compile");
    expect(first.value.nodes.map((node) => node.id)).toEqual(["agent-task", "bounded-loop", "human-task", "validate"]);
    expect(first.value.procedureDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("rejects every strict invalid REF-E-SOP-01 vector", async () => {
    const vectors: unknown = JSON.parse(await readFile(join(fixtures, "invalid-ref-e-sop-01.json"), "utf8"));
    if (!Array.isArray(vectors)) throw new Error("invalid vector fixture must be an array");

    for (const vector of vectors) {
      if (typeof vector !== "object" || vector === null) throw new Error("invalid vector must be an object");
      const record = vector as { readonly expectedIssue?: unknown; readonly procedure?: unknown };
      const result = await compileV2Procedure(record.procedure);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("invalid Procedure must fail");
      expect(result.issues.some((issue) => issue.id === record.expectedIssue)).toBe(true);
    }
  });

  test("keeps REF-E-SOP-02 static and bounded without claiming execution", async () => {
    const fixture = JSON.parse(await readFile(join(fixtures, "static-ref-e-sop-02-human-loop.json"), "utf8")) as {
      readonly executionPerformed?: unknown;
      readonly claims?: unknown;
      readonly procedure?: unknown;
    };
    const result = await compileV2Procedure(fixture.procedure);

    expect(fixture.executionPerformed).toBe(false);
    expect(fixture.claims).toEqual([
      "static-topology",
      "stable-human-occurrence-id",
      "bounded-loop",
      "declared-edge-policy-authority"
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("static Human loop must compile");
    expect(result.value.nodes.some((node) => node.id === "human-task" && node.kind === "human-task")).toBe(true);
  });

  test("rejects an unbounded cycle hidden beside a bounded cycle", async () => {
    const result = await compileV2Procedure({
      schemaVersion: "boulder.v2.procedure.v1",
      procedureId: "mixed-cycles",
      revision: 1,
      entryNodeId: "a",
      nodes: [
        { id: "a", kind: "agent-task" },
        { id: "b", kind: "deterministic-task" },
        { id: "c", kind: "human-task" },
        { id: "bounded", kind: "bounded-loop", maxIterations: 2 }
      ],
      edges: [
        { id: "a-bounded", from: "a", to: "bounded" },
        { id: "bounded-c", from: "bounded", to: "c" },
        { id: "a-b", from: "a", to: "b" },
        { id: "b-c", from: "b", to: "c" },
        { id: "c-a", from: "c", to: "a" }
      ]
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unbounded cycle must fail");
    expect(result.issues.some((issue) => issue.id === "v2.procedure.cycle_implicit")).toBe(true);
  });

  test("rejects discarded loop fields and caps deterministic issues", async () => {
    const nonLoopBound = await compileV2Procedure({
      schemaVersion: "boulder.v2.procedure.v1",
      procedureId: "discarded-bound",
      revision: 1,
      entryNodeId: "start",
      nodes: [{ id: "start", kind: "agent-task", maxIterations: 2 }],
      edges: []
    });
    expect(nonLoopBound.ok).toBe(false);
    if (nonLoopBound.ok) throw new Error("discarded fields must fail");
    expect(nonLoopBound.issues.some((issue) => issue.id === "v2.procedure.loop_bound_unexpected")).toBe(true);

    const unknownFields = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`extra${index}`, index]));
    const capped = await compileV2Procedure({
      schemaVersion: "boulder.v2.procedure.v1",
      procedureId: "issue-cap",
      revision: 1,
      entryNodeId: "start",
      nodes: [{ id: "start", kind: "agent-task" }],
      edges: [],
      ...unknownFields
    });
    expect(capped.ok).toBe(false);
    if (capped.ok) throw new Error("unknown fields must fail");
    expect(capped.issues).toHaveLength(100);
  });
});
