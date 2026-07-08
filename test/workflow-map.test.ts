import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { validateWorkflowMap, type WorkflowMap } from "../src/workflow-map";
import { runBoulder } from "./helpers/cli";

const root = join(import.meta.dir, "..");
const fixturePath = join(root, "fixtures/workflow-map/primary-workflow.v0.json");

describe("primary workflow map", () => {
  test("renders the primary workflow map json fixture", async () => {
    const result = await runBoulder(["workflow", "map", "--json"]);
    const fixture = parseWorkflowMap(await readFile(fixturePath, "utf8"));
    const payload = parseWorkflowMap(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(validateWorkflowMap(payload)).toEqual([]);
    expect(payload).toEqual(fixture);
  });

  test("rejects primary workflow without release-check", async () => {
    const fixture = parseWorkflowMap(await readFile(fixturePath, "utf8"));
    const invalid: WorkflowMap = {
      ...fixture,
      steps: fixture.steps.filter((step) => step.id !== "release-check")
    };

    expect(validateWorkflowMap(invalid)).toContain("missing-step:release-check");
  });

  test("keeps secondary loops below the main help route", async () => {
    const help = await runBoulder(["--help"]);
    const readme = await readFile(join(root, "README.md"), "utf8");

    expect(help.exitCode).toBe(0);
    expect(ordered(help.stdout, ["Main route:", "boulder init", "boulder profile resolve", "boulder capability import", "boulder handoff packet", "boulder release-check", "Secondary loops:"])).toBe(true);
    expect(help.stdout.indexOf("boulder routine capture")).toBeGreaterThan(help.stdout.indexOf("Secondary loops:"));
    expect(ordered(readme, ["## First Run", "init", "profile resolve", "capability import", "handoff packet", "release-check", "## Local Codex Skill"])).toBe(true);
  });
});

function parseWorkflowMap(source: string): WorkflowMap {
  const value: unknown = JSON.parse(source);
  if (!isWorkflowMap(value)) throw new Error("Invalid workflow map fixture.");
  return value;
}

function isWorkflowMap(value: unknown): value is WorkflowMap {
  if (!isRecord(value)) return false;
  return value["schemaVersion"] === "boulder.workflow-map.v1"
    && value["id"] === "primary-workflow"
    && isStringArray(value["route"])
    && Array.isArray(value["steps"])
    && value["steps"].every(isWorkflowStep)
    && Array.isArray(value["secondaryCommands"])
    && value["secondaryCommands"].every(isWorkflowStep);
}

function isWorkflowStep(value: unknown): value is WorkflowMap["steps"][number] {
  if (!isRecord(value)) return false;
  return typeof value["id"] === "string"
    && typeof value["lane"] === "string"
    && typeof value["command"] === "string"
    && typeof value["purpose"] === "string"
    && typeof value["required"] === "boolean"
    && isStringArray(value["dependsOn"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function ordered(text: string, needles: readonly string[]): boolean {
  let offset = -1;
  for (const needle of needles) {
    const next = text.indexOf(needle, offset + 1);
    if (next === -1) return false;
    offset = next;
  }
  return true;
}
