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
  readonly totalPackedFiles?: number;
  readonly classes: readonly InventoryClass[];
};

describe("package inventory contract", () => {
  test("classifies every packed file exactly once", async () => {
    const inventory = parseInventory(await readFile(fixturePath, "utf8"));
    const result = await runCommand("bun pm pack --dry-run --ignore-scripts", root);
    const output = `${result.stdout}\n${result.stderr}`;
    const packed = parsePackDryRun(output);
    const summary = assertClassified(packed, inventory);

    expect(result.exitCode).toBe(0);
    expect(packed.files.filter((path) => path === "docs/boulder-guide.ko.html")).toHaveLength(1);
    expect(summary.totalUniqueFiles).toBe(268);
    expect(summary.totalPackedFiles).toBe(269);
    expect(summary.counts).toEqual({
      runtime: 119,
      "public-doc": 67,
      "case-study-evidence": 21,
      fixture: 50,
      skill: 8,
      config: 1,
      license: 1,
      metadata: 1
    });
  });

  test("rejects unclassified packed files", () => {
    const inventory: Inventory = {
      schemaVersion: "packaged-files.v0",
      totalUniqueFiles: 1,
      totalPackedFiles: 2,
      classes: [{ className: "runtime", count: 1, files: ["src/known.ts"] }]
    };
    let message = "";

    try {
      assertClassified({ files: ["src/known.ts", "tmp/stray.txt"], reportedTotal: 2 }, inventory);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe("Packed files missing from fixture: tmp/stray.txt");
  });

  test("reports fixture and pack drift separately", () => {
    const inventory: Inventory = {
      schemaVersion: "packaged-files.v0",
      totalUniqueFiles: 2,
      totalPackedFiles: 2,
      classes: [{ className: "runtime", count: 2, files: ["src/known.ts", "src/future.ts"] }]
    };
    let message = "";

    try {
      assertClassified({ files: ["src/known.ts", "tmp/stray.txt"], reportedTotal: 2 }, inventory);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe("Packed files missing from fixture: tmp/stray.txt\nFixture files missing from pack: src/future.ts");
  });
});

function parsePackDryRun(output: string): { readonly files: readonly string[]; readonly reportedTotal: number } {
  const paths = new Set<string>();
  let reportedTotal = 0;

  for (const line of output.split("\n")) {
    const match = /^packed\s+\S+\s+(.+)$/.exec(line);
    if (match?.[1]) paths.add(match[1]);
    const total = /^Total files:\s*(\d+)$/.exec(line);
    if (total?.[1]) reportedTotal = Number(total[1]);
  }

  return { files: Array.from(paths).sort(), reportedTotal };
}

function assertClassified(pack: { readonly files: readonly string[]; readonly reportedTotal: number }, inventory: Inventory): {
  readonly counts: Record<PackageClass, number>;
  readonly totalUniqueFiles: number;
  readonly totalPackedFiles: number;
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

  const packed = new Set(pack.files);
  const unclassified = pack.files.filter((file) => !classified.has(file));
  const stale = Array.from(classified.keys()).filter((file) => !packed.has(file)).sort();
  const drift = [
    unclassified.length > 0 ? `Packed files missing from fixture: ${unclassified.join(", ")}` : "",
    stale.length > 0 ? `Fixture files missing from pack: ${stale.join(", ")}` : ""
  ].filter((message) => message.length > 0);
  if (drift.length > 0) throw new Error(drift.join("\n"));

  if (pack.files.length !== inventory.totalUniqueFiles) {
    throw new Error(`Total unique file mismatch: expected ${inventory.totalUniqueFiles}, found ${pack.files.length}`);
  }
  if (inventory.totalPackedFiles !== undefined && pack.reportedTotal !== inventory.totalPackedFiles) {
    throw new Error(`Total packed file mismatch: expected ${inventory.totalPackedFiles}, found ${pack.reportedTotal}`);
  }

  return { counts, totalUniqueFiles: pack.files.length, totalPackedFiles: pack.reportedTotal };
}

function parseInventory(source: string): Inventory {
  const payload: unknown = JSON.parse(source);
  if (!isRecord(payload)) throw new Error("Inventory fixture must be a JSON object.");
  if (payload["schemaVersion"] !== "packaged-files.v0") throw new Error("Inventory fixture schemaVersion mismatch.");
  if (typeof payload["totalUniqueFiles"] !== "number") throw new Error("Inventory fixture totalUniqueFiles must be a number.");
  if (payload["totalPackedFiles"] !== undefined && typeof payload["totalPackedFiles"] !== "number") throw new Error("Inventory fixture totalPackedFiles must be a number.");
  if (!Array.isArray(payload["classes"])) throw new Error("Inventory fixture classes must be an array.");

  return {
    schemaVersion: "packaged-files.v0",
    totalUniqueFiles: payload["totalUniqueFiles"],
    totalPackedFiles: payload["totalPackedFiles"],
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
