import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runBoundedK0rProcess } from "./k0r-canonical.js";
import { runK0rIndependentOracle, type K0rOracleOptions } from "./k0r-independent-oracle.js";
import { isolatedOracleArgv, isolatedRunCommandArgv, resolveK0rRepositoryCheckArgv } from "./k0r-run-evidence.js";

const repositoryRoot = resolve(import.meta.dir, "..");
export const k0rBaselineGeneratorPath = "test/k0r-baseline-generator.ts";
export const k0rImplementationPaths = [
  "evidence/k0r/approval-provenance.json",
  "evidence/k0r/superseding-adr.md",
  "evidence/k0r/acceptance-manifest.json",
  "evidence/k0r/evidence-manifest.json",
  "evidence/k0r/independent-clean-source-reproduction.json",
  "evidence/k0r/isolation-manifest.json",
  "evidence/k0r/isolated-run-receipt.json",
  "evidence/k0r/v1-public-contract-inventory.json",
  "test/k0r-capture-evidence.ts",
  k0rBaselineGeneratorPath,
  "test/k0r-baseline-generator.test.ts",
  "test/k0r-canonical.ts",
  "test/k0r-globals.d.ts",
  "test/k0r-evidence-contract.test.ts",
  "test/k0r-independent-oracle.test.ts",
  "test/k0r-independent-oracle.ts",
  "test/k0r-issue-exit.ts",
  "test/k0r-reconcile-evidence.ts",
  "test/k0r-run-evidence.ts"
] as const;
export const k0rApprovedSourceOverlayPaths = [
  "docs/boulder-guide.ko.html",
  "test/boulder-guide-contract.test.ts",
  "test/helpers/boulder-guide.ts",
  ...k0rImplementationPaths
] as const;

const acceptanceManifestPath = "evidence/k0r/acceptance-manifest.json";
const isolationManifestPath = "evidence/k0r/isolation-manifest.json";
const inventoryManifestPath = "evidence/k0r/v1-public-contract-inventory.json";
const unapprovedDirtyOwnerPaths = new Set([
  "src/common-executor-evidence.ts",
  "src/planner-pre-execution-safety.ts",
  "src/planner-scope-attribution.ts",
  "src/planner-score-workflow.ts",
  "src/planner-study-remediation.ts"
]);
const headOwnedDirtyOwnerPaths = new Set(["src/planner-benchmark.ts"]);
const schemaVersionPattern = /["']((?:boulder(?:\.[A-Za-z0-9_-]+)+\.v\d+)|(?:packaged-files\.v\d+))["']/g;
const unapprovedContractClassifications = new Set(["unapproved-dirty-excluded"]);

type RecordValue = Record<string, unknown>;
export type K0rBaseline = {
  readonly acceptance: RecordValue;
  readonly isolation: RecordValue;
  readonly inventory: RecordValue;
  readonly oracle: RecordValue;
};

export async function buildK0rStaticBaseline(root = repositoryRoot): Promise<Omit<K0rBaseline, "oracle">> {
  const [acceptance, isolation, inventory] = await Promise.all([
    readJson(root, acceptanceManifestPath),
    readJson(root, isolationManifestPath),
    readJson(root, inventoryManifestPath)
  ]);
  const refreshedAcceptance = await refreshAcceptance(root, acceptance);
  const refreshedIsolation = await refreshIsolation(root, isolation);
  const refreshedInventory = await refreshInventory(root, inventory);
  return { acceptance: refreshedAcceptance, isolation: refreshedIsolation, inventory: refreshedInventory };
}

export async function buildK0rBaseline(
  root = repositoryRoot,
  oracleOptions: Omit<K0rOracleOptions, "root"> = {},
): Promise<K0rBaseline> {
  const [baseline, oracle] = await Promise.all([
    buildK0rStaticBaseline(root),
    runK0rIndependentOracle({ ...oracleOptions, root }),
  ]);
  return { ...baseline, oracle: toRecord(oracle, "independent oracle") };
}

async function refreshAcceptance(root: string, acceptance: RecordValue): Promise<RecordValue> {
  const result = cloneRecord(acceptance);
  const requiredArtifacts = recordArray(result["requiredArtifacts"], "required artifacts");
  if (!requiredArtifacts.some((artifact) => artifact["path"] === k0rBaselineGeneratorPath)) {
    requiredArtifacts.push({
      id: "baseline-generator",
      path: k0rBaselineGeneratorPath,
      schema: "Deterministic current-HEAD K0R static baseline generator source"
    });
  }
  if (!requiredArtifacts.some((artifact) => artifact["path"] === "test/k0r-baseline-generator.test.ts")) {
    requiredArtifacts.push({
      id: "baseline-generator-contract-test",
      path: "test/k0r-baseline-generator.test.ts",
      schema: "Bun contract test for current-HEAD K0R static baseline regeneration"
    });
  }
  result["requiredArtifacts"] = requiredArtifacts;
  const repositoryChecks = await resolveK0rRepositoryCheckArgv(root);
  const captureArgv = [
    "bun", "test/k0r-capture-evidence.ts",
    "--pending-transition", "${QA_ROOT}/protected/k0r-transition.pending.json",
    "--acceptance-manifest", "evidence/k0r/acceptance-manifest.json",
    "--baseline-transition", "evidence/k0r/baseline-transition.json",
    "--independent-reproduction", "evidence/k0r/independent-clean-source-reproduction.json",
    "--isolation-manifest", "evidence/k0r/isolation-manifest.json",
    "--superseding-adr", "evidence/k0r/superseding-adr.md",
    "--public-contract-inventory", "evidence/k0r/v1-public-contract-inventory.json",
    "--isolated-run-receipt", "evidence/k0r/isolated-run-receipt.json",
    "--approval-receipt", "evidence/k0r/approval-provenance.json",
    "--focused-gate-receipt", "${QA_ROOT}/receipts/k0r-focused-gate.post-isolated-run.json",
  ];
  result["requiredCommands"] = recordArray(result["requiredCommands"], "required commands")
    .filter((command) => !["baseline-generator", "isolated-run", "isolated-run-evidence", "evidence-generator"].includes(stringValue(command["id"], "required command id")))
    .concat([
      { id: "isolated-run", command: isolatedRunCommandArgv.join(" "), argv: [...isolatedRunCommandArgv], repositoryChecks: repositoryChecks.map((argv, index) => ({ id: ["pending-transition-verification", "independent-oracle-test", "non-k0r-tests", "typecheck", "package-dry-run"][index], argv: [...argv] })), expected: "pass_pending_exact_byte_review" },
      { id: "evidence-generator", command: captureArgv.join(" "), argv: captureArgv, expected: "evidence_collected_pending_review" },
    ]);
  return result;
}

async function refreshIsolation(root: string, isolation: RecordValue): Promise<RecordValue> {
  const result = cloneRecord(isolation);
  const inventories = recordValue(result["inventories"], "isolation inventories");
  const initial = recordArray(inventories["initialPriorK0K1Inventory"], "initial prior K0/K1 inventory");
  inventories["mode"] = "head-bound";
  inventories["initialPriorK0K1Inventory"] = await Promise.all(initial.map(async (entry) => ({
    ...entry,
    sha256: `sha256:${createHash("sha256").update(new TextEncoder().encode(await readHeadFile(root, stringValue(entry["path"], "initial inventory path")))).digest("hex")}`
  })));

  const pathPolicy = recordValue(result["pathPolicy"], "isolation path policy");
  pathPolicy["allowedK0RPaths"] = [...k0rApprovedSourceOverlayPaths];
  const commands = recordValue(result["commands"], "isolation commands");
  const repositoryChecks = await resolveK0rRepositoryCheckArgv(root);
  const generated = [[...isolatedRunCommandArgv], ...repositoryChecks.map((argv) => [...argv])];
  const generatedFamilies = new Set(generated.map((argv) => `${argv[0] ?? ""}\0${argv[1] ?? ""}`));
  commands["argvAllowlist"] = [
    ...recordArrayOfArrays(commands["argvAllowlist"], "isolation argv allowlist")
      .filter((argv) => JSON.stringify(argv) !== JSON.stringify(["bun", k0rBaselineGeneratorPath, "--write"])
        && (!generatedFamilies.has(`${argv[0] ?? ""}\0${argv[1] ?? ""}`)
          || JSON.stringify(argv) === JSON.stringify(isolatedOracleArgv))
        && !(argv[0] === "bunx" && argv.includes("tsc"))
        && JSON.stringify(argv) !== JSON.stringify(["bun", "run", "ci"])),
    ...generated,
  ];
  return result;
}

async function refreshInventory(root: string, inventory: RecordValue): Promise<RecordValue> {
  const result = cloneRecord(inventory);
  const sourceRefs = recordArray(result["sourceRefs"], "source references");
  result["sourceRefs"] = await Promise.all(sourceRefs.map(async (sourceRef) => ({
    ...sourceRef,
    sha256: await sha256File(root, stringValue(sourceRef["path"], "source reference path"))
  })));

  const discovery = recordValue(result["schemaVersionDiscovery"], "schema-version discovery");
  const scope = recordValue(discovery["scope"], "schema discovery scope");
  const packaged = await readJson(root, stringValue(scope["packageInventoryPath"], "package inventory path"));
  const shippedFiles = packageInventoryFiles(packaged);
  const sourcePaths = shippedFiles.filter((path) => path.startsWith("src/") && path.endsWith(".ts"));
  const fixturePaths = shippedFiles.filter((path) => path.startsWith("fixtures/") && path.endsWith(".json"));
  const actual = new Map<string, readonly string[]>();
  await Promise.all(sourcePaths.map(async (path) => {
    const source = headOwnedDirtyOwnerPaths.has(path) ? await readHeadFile(root, path) : await readFile(join(root, path), "utf8");
    actual.set(path, schemaVersionLiterals(source));
  }));
  await Promise.all(fixturePaths.map(async (path) => {
    const fixture = JSON.parse(await readFile(join(root, path), "utf8")) as unknown;
    actual.set(path, jsonSchemaVersions(fixture));
  }));

  const exclusions = recordValue(discovery["exclusions"], "schema exclusions");
  const existingContracts = recordArray(discovery["contracts"], "schema contracts");
  const refreshedContracts: RecordValue[] = [];
  const existingPaths = new Set<string>();
  for (const contract of existingContracts) {
    const path = stringValue(contract["path"], "schema contract path");
    const classification = stringValue(contract["classification"], "schema contract classification");
    existingPaths.add(path);
    if (unapprovedContractClassifications.has(classification) || unapprovedDirtyOwnerPaths.has(path)) {
      refreshedContracts.push(cloneRecord(contract));
      continue;
    }
    const versions = actual.get(path);
    if (versions === undefined || versions.length === 0) continue;
    const selectedVersions = isV2Path(path, exclusions)
      ? versions
      : classification === "v2-excluded"
        ? versions.filter((version) => isV2Version(version, exclusions))
        : versions.filter((version) => !isV2Version(version, exclusions));
    if (selectedVersions.length > 0) refreshedContracts.push({ ...contract, schemaVersions: [...selectedVersions] });
  }
  for (const path of [...actual.keys()].sort()) {
    const versions = actual.get(path);
    if (versions === undefined || versions.length === 0) continue;
    const covered = new Set(refreshedContracts.filter((contract) => contract["path"] === path).flatMap((contract) => stringArray(contract["schemaVersions"], "schema contract versions")));
    const missing = versions.filter((version) => !covered.has(version));
    if (missing.length === 0 && existingPaths.has(path)) continue;
    if (missing.length > 0) {
      const v2Missing = isV2Path(path, exclusions) ? missing : missing.filter((version) => isV2Version(version, exclusions));
      const v1Missing = isV2Path(path, exclusions) ? [] : missing.filter((version) => !isV2Version(version, exclusions));
      if (v1Missing.length > 0) refreshedContracts.push(makeContract(path, v1Missing, exclusions));
      if (v2Missing.length > 0) refreshedContracts.push(makeContract(path, v2Missing, exclusions));
    }
  }
  discovery["contracts"] = refreshedContracts;
  return result;
}

function classifyContract(path: string, versions: readonly string[], exclusions: RecordValue): string {
  const v2 = isV2Path(path, exclusions) || versions.some((version) => isV2Version(version, exclusions));
  return v2 ? "v2-excluded" : path.startsWith("fixtures/") ? "fixture-only" : "persisted/internal";
}

function makeContract(path: string, versions: readonly string[], exclusions: RecordValue): RecordValue {
  const classification = classifyContract(path, versions, exclusions);
  return {
    path,
    classification,
    ownership: classification === "v2-excluded"
      ? path.startsWith("fixtures/") ? "v2 fixture contract owner (excluded from K0R v1 baseline)" : "v2 contract owner (excluded from K0R v1 baseline)"
      : path.startsWith("fixtures/") ? "shipped deterministic fixture contract" : "Boulder persisted/internal contract owner",
    schemaVersions: [...versions]
  };
}

function isV2Path(path: string, exclusions: RecordValue): boolean {
  const v2PathPrefixes = stringArray(exclusions["v2PathPrefixes"], "v2 path prefixes");
  const v2Paths = stringArray(exclusions["v2Paths"], "v2 paths");
  return v2Paths.includes(path) || v2PathPrefixes.some((prefix) => path.startsWith(prefix));
}

function isV2Version(version: string, exclusions: RecordValue): boolean {
  const v2SchemaPrefixes = stringArray(exclusions["v2SchemaPrefixes"], "v2 schema prefixes");
  const v2SchemaSuffixes = stringArray(exclusions["v2SchemaSuffixes"], "v2 schema suffixes");
  return v2SchemaPrefixes.some((prefix) => version.startsWith(prefix)) || v2SchemaSuffixes.some((suffix) => version.endsWith(suffix));
}

function packageInventoryFiles(inventory: RecordValue): string[] {
  return normalizeSet(recordArray(inventory["classes"], "package inventory classes").flatMap((entry) => stringArray(entry["files"], "package inventory files")));
}

function schemaVersionLiterals(source: string): string[] {
  schemaVersionPattern.lastIndex = 0;
  return normalizeSet([...source.matchAll(schemaVersionPattern)].map((match) => match[1] ?? "").filter(Boolean));
}

function jsonSchemaVersions(value: unknown): string[] {
  if (Array.isArray(value)) return normalizeSet(value.flatMap(jsonSchemaVersions));
  if (typeof value !== "object" || value === null) return [];
  return normalizeSet(Object.entries(value as RecordValue).flatMap(([key, item]) => [
    ...(key === "schemaVersion" && typeof item === "string" ? [item] : []),
    ...jsonSchemaVersions(item)
  ]));
}

function normalizeSet(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

async function readJson(root: string, path: string): Promise<RecordValue> {
  return toRecord(JSON.parse(await readFile(join(root, path), "utf8")) as unknown, path);
}

async function readHeadFile(root: string, path: string): Promise<string> {
  const result = await runBoundedK0rProcess({
    argv: ["git", "show", `HEAD:${path}`],
    cwd: root,
    environment: { PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C", TZ: "UTC", NO_COLOR: "1" },
    deadlineMs: 30_000,
    stdoutCapBytes: 8 * 1024 * 1024,
    stderrCapBytes: 64 * 1024
  });
  if (result.timedOut || result.stdoutOverflow || result.stderrOverflow || result.orphanProcess || result.exitCode !== 0) {
    throw new Error(`Unable to read HEAD source ${path}: ${result.stderr}`);
  }
  return result.stdout;
}

async function sha256File(root: string, path: string): Promise<string> {
  return `sha256:${createHash("sha256").update(await readFile(join(root, path))).digest("hex")}`;
}

function cloneRecord(value: RecordValue): RecordValue {
  return JSON.parse(JSON.stringify(value)) as RecordValue;
}

function toRecord(value: unknown, label: string): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as RecordValue;
}

function recordValue(value: unknown, label: string): RecordValue {
  return toRecord(value, label);
}

function recordArray(value: unknown, label: string): RecordValue[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((item, index) => recordValue(item, `${label}[${index}]`));
}

function recordArrayOfArrays(value: unknown, label: string): string[][] {
  if (!Array.isArray(value) || !value.every((item) => Array.isArray(item) && item.every((part) => typeof part === "string"))) throw new Error(`${label} must be an argv-array list.`);
  return value as string[][];
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`${label} must be a string array.`);
  return value as string[];
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

