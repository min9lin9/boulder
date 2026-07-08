import { describe, expect, test } from "bun:test";
import { readinessEntriesForReport } from "../src/readiness-registry";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

describe("runs CLI", () => {
  test("records lists shows and prunes run events as JSON", async () => {
    const root = await tempRepo();

    try {
      await write(root, "package.json", JSON.stringify({ name: "fixture", version: "1.2.3" }, null, 2));

      const recorded = await runBoulder(["release-check", "--cwd", root, "--json", "--record-run"]);
      expect(recorded.exitCode).toBe(1);
      expect(recorded.stderr).toBe("");

      const report = parseJson(recorded.stdout);
      expect(report.status).toBe("blocked");

      const list = await runBoulder(["runs", "list", "--cwd", root, "--json"]);
      expect(list.exitCode).toBe(0);
      expect(list.stderr).toBe("");
      const listPayload = parseJson(list.stdout);
      const runs = readArray(listPayload, "runs");
      expect(runs).toHaveLength(1);
      expect(readString(readRecord(runs[0]), "eventName")).toBe("release-check");

      const show = await runBoulder(["runs", "show", "--latest", "--cwd", root, "--json"]);
      expect(show.exitCode).toBe(0);
      expect(show.stderr).toBe("");
      const event = parseJson(show.stdout);
      expect(readString(event, "eventName")).toBe("release-check");
      expect(readString(event, "status")).toBe("blocked");
      expect(readArray(event, "checkIds")).toContain("install-smoke-version");
      expect(readArray(event, "recoveryHintIds")).toContain("release.install_smoke_version");
      expect(readStringArray(event, "recoveryHintIds").sort()).toEqual(expectedFailedRecoveryHints(report).sort());

      const pruned = await runBoulder(["runs", "prune", "--older-than", "30d", "--keep", "200", "--cwd", root, "--json"]);
      expect(pruned.exitCode).toBe(0);
      expect(pruned.stderr).toBe("");
      expect(readNumber(parseJson(pruned.stdout), "pruned")).toBe(0);
    } finally {
      await removeTempRepo(root);
    }
  });
});

function parseJson(source: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(source);
  if (isRecord(parsed)) return parsed;
  throw new Error("expected JSON object");
}

function expectedFailedRecoveryHints(report: Record<string, unknown>): string[] {
  const failed = new Set(readArray(report, "checks")
    .map(readRecord)
    .filter((check) => readString(check, "status") === "fail")
    .map((check) => readString(check, "id")));
  return readinessEntriesForReport("release-check")
    .filter((entry) => failed.has(entry.id))
    .map((entry) => entry.recoveryHintId);
}

function readRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  throw new Error("expected JSON object");
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value === "string") return value;
  throw new Error(`expected string field ${key}`);
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value === "number") return value;
  throw new Error(`expected number field ${key}`);
}

function readArray(record: Record<string, unknown>, key: string): readonly unknown[] {
  const value = record[key];
  if (Array.isArray(value)) return value;
  throw new Error(`expected array field ${key}`);
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  return readArray(record, key).map((item) => {
    if (typeof item === "string") return item;
    throw new Error(`expected string array field ${key}`);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
