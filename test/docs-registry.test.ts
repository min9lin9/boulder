import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "..");
const registryPath = join(root, "fixtures/docs/doc-registry.v0.json");
const packageInventoryPath = join(root, "fixtures/package-inventory/packaged-files.v0.json");
const packageJsonPath = join(root, "package.json");
const allowedKinds = ["canonical", "translation", "generated", "local-only"] as const;
const directions = ["ltr", "rtl"] as const;
const packagingModes = ["packaged", "excluded"] as const;

type Direction = typeof directions[number];
type DocKind = typeof allowedKinds[number];
type PackagingMode = typeof packagingModes[number];

type DocRegistryEntry = {
  readonly path: string;
  readonly kind: DocKind;
  readonly locale: string;
  readonly dir?: Direction;
  readonly source?: string;
  readonly version?: string;
  readonly generatedBy: string | null;
  readonly packaging: PackagingMode;
  readonly translatable: boolean;
};

describe("documentation registry", () => {
  test("covers packaged docs and local-only exclusions", async () => {
    const registry = parseRegistry(await readFile(registryPath, "utf8"));
    const packagedDocs = await readPackagedDocs();
    const localOnlyExclusions = await readLocalOnlyExclusions();
    const registeredPackagedDocs = registry.filter((entry) => entry.packaging === "packaged").map((entry) => entry.path).sort();
    const registeredLocalOnly = registry.filter((entry) => entry.kind === "local-only").map((entry) => entry.path).sort();

    expect(registeredPackagedDocs).toEqual(packagedDocs);
    expect(registeredLocalOnly).toEqual(localOnlyExclusions);
    expect(registryErrors(registry)).toEqual([]);
  });

  test("rejects translated docs without dir metadata", async () => {
    const registry = parseRegistry(await readFile(registryPath, "utf8"));
    const translation = registry.find((entry) => entry.kind === "translation");

    if (translation === undefined) throw new Error("Fixture must include at least one translated doc.");
    expect(registryErrors(registry)).not.toContain("dir");
    expect(registryErrors([withoutDir(translation)])).toContain("dir");
  });

  test("rejects packaged local-only docs", () => {
    const entry: DocRegistryEntry = {
      path: "docs/*SESSION_SUMMARY*.md",
      kind: "local-only",
      locale: "und",
      dir: "ltr",
      source: "package.json#files",
      version: "0.1.16",
      generatedBy: null,
      packaging: "packaged",
      translatable: false
    };

    expect(registryErrors([entry])).toContain("packaging");
  });
});

function registryErrors(entries: readonly DocRegistryEntry[]): readonly string[] {
  return entries.flatMap((entry) => {
    const errors: string[] = [];

    if (!entry.path) errors.push("path");
    if (!isDocKind(entry.kind)) errors.push("kind");
    if (!entry.locale) errors.push("locale");
    if (entry.dir !== undefined && !isDirection(entry.dir)) errors.push("dir");
    if (!isPackagingMode(entry.packaging)) errors.push("packaging");
    if (typeof entry.translatable !== "boolean") errors.push("translatable");
    if (entry.kind !== "generated" && entry.generatedBy !== null) errors.push("generatedBy");

    if (entry.kind === "translation") {
      if (entry.dir === undefined) errors.push("dir");
      if (!entry.source) errors.push("source");
      if (!entry.version) errors.push("version");
    }

    if (entry.kind === "generated") {
      if (!entry.source) errors.push("source");
      if (!entry.generatedBy) errors.push("generatedBy");
    }

    if (entry.kind === "local-only" && entry.packaging !== "excluded") errors.push("packaging");

    return errors;
  });
}

function withoutDir(entry: DocRegistryEntry): DocRegistryEntry {
  return {
    path: entry.path,
    kind: entry.kind,
    locale: entry.locale,
    source: entry.source,
    version: entry.version,
    generatedBy: entry.generatedBy,
    packaging: entry.packaging,
    translatable: entry.translatable
  };
}

async function readPackagedDocs(): Promise<readonly string[]> {
  const inventory = parsePackageInventory(await readFile(packageInventoryPath, "utf8"));
  return inventory.classes
    .filter((entry) => entry.class === "public-doc" || entry.class === "case-study-evidence")
    .flatMap((entry) => entry.files)
    .filter((path) => path.startsWith("docs/"))
    .sort();
}

async function readLocalOnlyExclusions(): Promise<readonly string[]> {
  const packageJson = parsePackageJson(await readFile(packageJsonPath, "utf8"));
  return packageJson.files.filter((path) => path.startsWith("!")).map((path) => path.slice(1)).sort();
}

function parseRegistry(source: string): readonly DocRegistryEntry[] {
  const payload: unknown = JSON.parse(source);
  if (!Array.isArray(payload)) throw new Error("Documentation registry must be an array.");
  return payload.map(parseRegistryEntry);
}

function parseRegistryEntry(value: unknown): DocRegistryEntry {
  if (!isRecord(value)) throw new Error("Documentation registry entry must be an object.");
  if (typeof value["path"] !== "string") throw new Error("Documentation registry entry path must be a string.");
  if (!isDocKind(value["kind"])) throw new Error(`Documentation registry kind is not allowed: ${String(value["kind"])}`);
  if (typeof value["locale"] !== "string") throw new Error(`Documentation registry locale must be a string: ${value["path"]}`);
  if (value["dir"] !== undefined && !isDirection(value["dir"])) {
    throw new Error(`Documentation registry dir must be ltr or rtl: ${value["path"]}`);
  }
  if (value["source"] !== undefined && typeof value["source"] !== "string") {
    throw new Error(`Documentation registry source must be a string: ${value["path"]}`);
  }
  if (value["version"] !== undefined && typeof value["version"] !== "string") {
    throw new Error(`Documentation registry version must be a string: ${value["path"]}`);
  }
  if (value["generatedBy"] !== null && typeof value["generatedBy"] !== "string") {
    throw new Error(`Documentation registry generatedBy must be a string or null: ${value["path"]}`);
  }
  if (!isPackagingMode(value["packaging"])) {
    throw new Error(`Documentation registry packaging is not allowed: ${String(value["packaging"])}`);
  }
  if (typeof value["translatable"] !== "boolean") {
    throw new Error(`Documentation registry translatable must be a boolean: ${value["path"]}`);
  }

  return {
    path: value["path"],
    kind: value["kind"],
    locale: value["locale"],
    dir: value["dir"],
    source: value["source"],
    version: value["version"],
    generatedBy: value["generatedBy"],
    packaging: value["packaging"],
    translatable: value["translatable"]
  };
}

function parsePackageInventory(source: string): {
  readonly classes: readonly { readonly class: string; readonly files: readonly string[] }[];
} {
  const payload: unknown = JSON.parse(source);
  if (!isRecord(payload) || !Array.isArray(payload["classes"])) {
    throw new Error("Package inventory fixture must include classes.");
  }

  return {
    classes: payload["classes"].map((entry) => {
      if (!isRecord(entry) || typeof entry["class"] !== "string" || !isStringArray(entry["files"])) {
        throw new Error("Package inventory class entry is invalid.");
      }
      return { class: entry["class"], files: entry["files"] };
    })
  };
}

function parsePackageJson(source: string): { readonly files: readonly string[] } {
  const payload: unknown = JSON.parse(source);
  if (!isRecord(payload) || !isStringArray(payload["files"])) {
    throw new Error("package.json must include files.");
  }

  return { files: payload["files"] };
}

function isDocKind(value: unknown): value is DocKind {
  return allowedKinds.some((kind) => kind === value);
}

function isDirection(value: unknown): value is Direction {
  return directions.some((direction) => direction === value);
}

function isPackagingMode(value: unknown): value is PackagingMode {
  return packagingModes.some((mode) => mode === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
