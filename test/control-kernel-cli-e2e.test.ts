import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

const repositoryRoot = join(import.meta.dir, "..");
const fixturePath = join(repositoryRoot, "fixtures/control-kernel/gp-screening-shadow-v0.json");

describe("control kernel CLI", () => {
  test("requires an immutable audit record before evaluation and sealing", async () => {
    const root = await tempRepo("boulder-control-kernel-");
    try {
      const fixture = parseFixture(await readFile(fixturePath, "utf8"));
      await writeInputs(root, fixture, fixture.runs.pass);

      const unaudited = await runBoulder(controlArgs("evaluate", root));
      expect(unaudited.exitCode).toBe(1);
      expect(readString(parseJson(unaudited.stdout), "status")).toBe("blocked");
      expect(readStringArray(parseJson(unaudited.stdout), "issues")).toContain("audit:recorded-run-missing-or-mismatch");

      const recorded = await runBoulder(["control", "record", "--cwd", root, "--event", "inputs/event.json", "--json"]);
      expect(recorded.exitCode).toBe(0);
      expect(readString(parseJson(recorded.stdout), "status")).toBe("recorded");
      expect(readString(parseJson(recorded.stdout), "path")).toBe(".boulder/control-kernel/runs/synthetic-pass-run.json");

      const repeated = await runBoulder(["control", "record", "--cwd", root, "--event", "inputs/event.json", "--json"]);
      expect(repeated.exitCode).toBe(0);
      expect(readString(parseJson(repeated.stdout), "status")).toBe("already-recorded");

      const evaluated = await runBoulder(controlArgs("evaluate", root));
      expect(evaluated.exitCode).toBe(0);
      expect(readString(parseJson(evaluated.stdout), "status")).toBe("eligible");

      const sealed = await runBoulder(controlArgs("seal", root));
      expect(sealed.exitCode).toBe(0);
      expect(readString(parseJson(sealed.stdout), "status")).toBe("sealed");

      const repeatedSeal = await runBoulder(controlArgs("seal", root));
      expect(repeatedSeal.exitCode).toBe(0);
      expect(readString(parseJson(repeatedSeal.stdout), "status")).toBe("already-sealed");

      const verified = await runBoulder(verifyArgs(root));
      expect(verified.exitCode).toBe(0);
      expect(readString(parseJson(verified.stdout), "status")).toBe("valid");

      const metrics = fixture.runs.pass["metrics"];
      if (!isRecord(metrics)) throw new Error("Fixture metrics are invalid.");
      await write(root, "inputs/event.json", JSON.stringify({ ...fixture.runs.pass, metrics: { ...metrics, "risk-recall": 0.81 } }, null, 2));
      const invalidated = await runBoulder(verifyArgs(root));
      expect(invalidated.exitCode).toBe(1);
      expect(readString(parseJson(invalidated.stdout), "status")).toBe("invalid");
      expect(readStringArray(parseJson(invalidated.stdout), "issues")).toContain("decision-seal:run-hash-mismatch");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("records blocked runs for audit but refuses to seal them", async () => {
    const root = await tempRepo("boulder-control-kernel-blocked-");
    try {
      const fixture = parseFixture(await readFile(fixturePath, "utf8"));
      await writeInputs(root, fixture, fixture.runs.hardFailure);

      const recorded = await runBoulder(["control", "record", "--cwd", root, "--event", "inputs/event.json", "--json"]);
      expect(recorded.exitCode).toBe(0);
      expect(readString(parseJson(recorded.stdout), "status")).toBe("recorded");

      const evaluated = await runBoulder(controlArgs("evaluate", root));
      expect(evaluated.exitCode).toBe(1);
      expect(readString(parseJson(evaluated.stdout), "status")).toBe("blocked");

      const sealed = await runBoulder(controlArgs("seal", root));
      expect(sealed.exitCode).toBe(1);
      expect(sealed.stderr).toContain("decision-seal:evaluation-blocked");
    } finally {
      await removeTempRepo(root);
    }
  });
});

async function writeInputs(root: string, fixture: Fixture, run: Record<string, unknown>): Promise<void> {
  await write(root, "inputs/event.json", JSON.stringify(run, null, 2));
  await write(root, "inputs/manifest.json", JSON.stringify(fixture.evidenceManifest, null, 2));
  await write(root, "inputs/policy.json", JSON.stringify(fixture.policy, null, 2));
}

function controlArgs(action: "evaluate" | "seal", root: string): readonly string[] {
  return [
    "control", action, "--cwd", root,
    "--event", "inputs/event.json",
    "--manifest", "inputs/manifest.json",
    "--policy", "inputs/policy.json",
    "--json"
  ];
}

function verifyArgs(root: string): readonly string[] {
  return [
    "control", "verify-seal", "--cwd", root,
    "--seal", ".boulder/control-kernel/seals/synthetic-pass-run.json",
    "--event", "inputs/event.json",
    "--manifest", "inputs/manifest.json",
    "--policy", "inputs/policy.json",
    "--json"
  ];
}

type Fixture = {
  readonly policy: Record<string, unknown>;
  readonly evidenceManifest: Record<string, unknown>;
  readonly runs: {
    readonly pass: Record<string, unknown>;
    readonly hardFailure: Record<string, unknown>;
  };
};

function parseFixture(source: string): Fixture {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value)
    || !isRecord(value["policy"])
    || !isRecord(value["evidenceManifest"])
    || !isRecord(value["runs"])
    || !isRecord(value["runs"]["pass"])
    || !isRecord(value["runs"]["hardFailure"])) {
    throw new Error("Invalid control-kernel fixture.");
  }
  return {
    policy: value["policy"],
    evidenceManifest: value["evidenceManifest"],
    runs: { pass: value["runs"]["pass"], hardFailure: value["runs"]["hardFailure"] }
  };
}

function parseJson(source: string): Record<string, unknown> {
  const value: unknown = JSON.parse(source);
  if (isRecord(value)) return value;
  throw new Error("Expected JSON object.");
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value === "string") return value;
  throw new Error(`Expected string field ${key}.`);
}

function readStringArray(record: Record<string, unknown>, key: string): readonly string[] {
  const value = record[key];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  throw new Error(`Expected string array field ${key}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
