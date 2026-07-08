import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { runCommand } from "./helpers/cli";

const root = join(import.meta.dir, "..");
const fixturePath = join(root, "fixtures/package-inventory/packaged-files.v0.json");
const approvedClasses = [
  "runtime",
  "public-doc",
  "case-study-evidence",
  "fixture",
  "skill",
  "config",
  "license",
  "metadata"
] as const;

type PackageClass = typeof approvedClasses[number];

type InventoryClass = {
  readonly className: PackageClass;
  readonly count: number;
  readonly files: readonly string[];
};

type Inventory = {
  readonly schemaVersion: "packaged-files.v0";
  readonly totalUniqueFiles: number;
  readonly classes: readonly InventoryClass[];
};

describe("package inventory contract", () => {
  test("classifies every packed file exactly once", async () => {
    const inventory = parseInventory(await readFile(fixturePath, "utf8"));
    const result = await runCommand("bun pm pack --dry-run --ignore-scripts", root);
    const output = `${result.stdout}\n${result.stderr}`;
    const summary = assertClassified(parsePackedFiles(output), inventory);

    expect(result.exitCode).toBe(0);
    expect(summary.totalUniqueFiles).toBe(173);
    expect(summary.counts).toEqual({
      runtime: 58,
      "public-doc": 64,
      "case-study-evidence": 19,
      fixture: 23,
      skill: 6,
      config: 1,
      license: 1,
      metadata: 1
    });
  });

  test("rejects unclassified packed files", () => {
    const inventory: Inventory = {
      schemaVersion: "packaged-files.v0",
      totalUniqueFiles: 1,
      classes: [{ className: "runtime", count: 1, files: ["src/known.ts"] }]
    };
    let message = "";

    try {
      assertClassified(["src/known.ts", "tmp/stray.txt"], inventory);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe("Unclassified packed files: tmp/stray.txt");
  });
});

function parsePackedFiles(output: string): readonly string[] {
  const paths = new Set<string>();

  for (const line of output.split("\n")) {
    const match = /^packed\s+\S+\s+(.+)$/.exec(line);
    if (match?.[1]) paths.add(match[1]);
  }

  return Array.from(paths).sort();
}

function assertClassified(paths: readonly string[], inventory: Inventory): {
  readonly counts: Record<PackageClass, number>;
  readonly totalUniqueFiles: number;
} {
  const classified = new Map<string, PackageClass>();
  const counts = emptyCounts();

  for (const item of inventory.classes) {
    if (item.files.length !== item.count) {
      throw new Error(`Class count mismatch for ${item.className}: expected ${item.count}, found ${item.files.length}`);
    }

    counts[item.className] = item.files.length;
    for (const file of item.files) {
      const duplicate = classified.get(file);
      if (duplicate) throw new Error(`Fixture classifies file more than once: ${file}`);
      classified.set(file, item.className);
    }
  }

  const unclassified = paths.filter((file) => !classified.has(file));
  if (unclassified.length > 0) throw new Error(`Unclassified packed files: ${unclassified.join(", ")}`);

  const packed = new Set(paths);
  const stale = Array.from(classified.keys()).filter((file) => !packed.has(file)).sort();
  if (stale.length > 0) throw new Error(`Fixture lists files not in package: ${stale.join(", ")}`);
  if (paths.length !== inventory.totalUniqueFiles) {
    throw new Error(`Total unique file mismatch: expected ${inventory.totalUniqueFiles}, found ${paths.length}`);
  }

  return { counts, totalUniqueFiles: paths.length };
}

function parseInventory(source: string): Inventory {
  const payload: unknown = JSON.parse(source);
  if (!isRecord(payload)) throw new Error("Inventory fixture must be a JSON object.");
  if (payload["schemaVersion"] !== "packaged-files.v0") throw new Error("Inventory fixture schemaVersion mismatch.");
  if (typeof payload["totalUniqueFiles"] !== "number") throw new Error("Inventory fixture totalUniqueFiles must be a number.");
  if (!Array.isArray(payload["classes"])) throw new Error("Inventory fixture classes must be an array.");

  return {
    schemaVersion: "packaged-files.v0",
    totalUniqueFiles: payload["totalUniqueFiles"],
    classes: payload["classes"].map(parseInventoryClass)
  };
}

function parseInventoryClass(value: unknown): InventoryClass {
  if (!isRecord(value)) throw new Error("Inventory class entry must be an object.");
  if (!isPackageClass(value["class"])) throw new Error(`Inventory class is not approved: ${String(value["class"])}`);
  if (typeof value["count"] !== "number") throw new Error(`Inventory class ${value["class"]} count must be a number.`);
  if (!isStringArray(value["files"])) throw new Error(`Inventory class ${value["class"]} files must be strings.`);

  return { className: value["class"], count: value["count"], files: value["files"] };
}

function emptyCounts(): Record<PackageClass, number> {
  return {
    runtime: 0,
    "public-doc": 0,
    "case-study-evidence": 0,
    fixture: 0,
    skill: 0,
    config: 0,
    license: 0,
    metadata: 0
  };
}

function isPackageClass(value: unknown): value is PackageClass {
  for (const className of approvedClasses) {
    if (value === className) return true;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
