import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { buildK0rBaseline, buildK0rStaticBaseline, k0rApprovedSourceOverlayPaths, type K0rBaseline } from "./k0r-baseline-generator.js";
import { isolatedSourceBundlePaths } from "./k0r-run-evidence.js";

const root = join(import.meta.dir, "..");
const evidencePaths = [
  "evidence/k0r/acceptance-manifest.json",
  "evidence/k0r/isolation-manifest.json",
  "evidence/k0r/v1-public-contract-inventory.json",
  "evidence/k0r/independent-clean-source-reproduction.json"
] as const;

test("direct execution cannot mutate K0R evidence", async () => {
  const before = await evidenceSnapshot();
  const result = await execute("bun", ["test/k0r-baseline-generator.ts", "--write"]);
  const after = await evidenceSnapshot();

  expect(result).toEqual({ stdout: "", stderr: "" });
  expect(after).toEqual(before);
});

test("buildK0rBaseline binds static K0R inputs to the current HEAD", async () => {
  const baseline = await buildK0rBaseline(root);
  const staticBaseline = await buildK0rStaticBaseline(root);
  expect(staticBaseline).toEqual({
    acceptance: baseline.acceptance,
    isolation: baseline.isolation,
    inventory: baseline.inventory,
  });
  const consumed = consumeBaseline(baseline);
  expect(consumed.map(([path]) => path)).toEqual(evidencePaths);
  expect(consumed.map(([, value]) => value)).toEqual([
    baseline.acceptance,
    baseline.isolation,
    baseline.inventory,
    baseline.oracle
  ]);

  const requiredCommands = recordArray(baseline.acceptance["requiredCommands"]);
  expect(requiredCommands.some((command) => command["id"] === "baseline-generator")).toBe(false);
  const isolationInventories = recordValue(baseline.isolation["inventories"]);
  const initial = recordArray(isolationInventories["initialPriorK0K1Inventory"]);
  expect(isolationInventories["mode"]).toBe("head-bound");
  expect(initial.length).toBeGreaterThan(0);
  expect(initial.every((entry) => /^sha256:[0-9a-f]{64}$/.test(stringValue(entry["sha256"])))).toBe(true);
  expect(baseline.oracle["status"]).toBe("pass");
  expect(Array.isArray(recordValue(baseline.inventory["schemaVersionDiscovery"])["contracts"])).toBe(true);

  const sourceRefs = recordArray(baseline.inventory["sourceRefs"]);
  const profileSource = sourceRefs.find((entry) => entry["path"] === "src/workflow-profile-builtins.ts");
  expect(profileSource?.["sha256"]).toBe(sha256(await readFile(join(root, "src/workflow-profile-builtins.ts"))));

  const commands = recordValue(baseline.isolation["commands"]);
  expect(recordArrayOfArrays(commands["argvAllowlist"]).some((argv) => JSON.stringify(argv) === JSON.stringify(["bun", "test/k0r-baseline-generator.ts", "--write"]))).toBe(false);
  const allowedK0RPaths = recordValue(baseline.isolation["pathPolicy"])["allowedK0RPaths"];
  if (!Array.isArray(allowedK0RPaths)) throw new Error("expected allowed K0R path array");
  expect(allowedK0RPaths).toContain("docs/boulder-guide.ko.html");
  expect(allowedK0RPaths).toEqual(k0rApprovedSourceOverlayPaths);
  const headPaths = new Set((await execute("git", ["ls-tree", "-r", "--name-only", "HEAD"])).stdout.trim().split("\n"));
  expect(isolatedSourceBundlePaths.filter((path) => !headPaths.has(path)).every((path) => allowedK0RPaths.includes(path))).toBe(true);
});

function consumeBaseline(baseline: K0rBaseline): readonly (readonly [typeof evidencePaths[number], Record<string, unknown>])[] {
  return [
    [evidencePaths[0], baseline.acceptance],
    [evidencePaths[1], baseline.isolation],
    [evidencePaths[2], baseline.inventory],
    [evidencePaths[3], baseline.oracle]
  ];
}

async function evidenceSnapshot(): Promise<readonly { readonly path: string; readonly bytes: string; readonly inode: number }[]> {
  return Promise.all(evidencePaths.map(async (path) => {
    const absolute = join(root, path);
    const [bytes, stat] = await Promise.all([readFile(absolute), lstat(absolute)]);
    return { path, bytes: sha256(bytes), inode: stat.ino };
  }));
}

async function execute(command: string, args: readonly string[]): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolveResult, reject) => {
    execFile(command, args, { cwd: root }, (error, stdout, stderr) => {
      if (error !== null) reject(new Error(`Direct execution failed: ${stderr || error.message}`));
      else resolveResult({ stdout, stderr });
    });
  });
}

function recordValue(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("expected record");
  return value as Record<string, unknown>;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("expected record array");
  return value.map(recordValue);
}

function recordArrayOfArrays(value: unknown): string[][] {
  if (!Array.isArray(value) || !value.every((item) => Array.isArray(item) && item.every((part) => typeof part === "string"))) throw new Error("expected argv-array list");
  return value as string[][];
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("expected string");
  return value;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
