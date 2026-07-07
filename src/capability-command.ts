import {
  buildSourceCandidateManifest,
  CapabilitySourceError,
  loadSourceCandidateManifests,
  parseCapabilitySource,
  sourceCandidateManifestPath,
  writeSourceCandidateManifest,
  type SourceCandidateManifest
} from "./capability-source";
import { loadCapabilityInventory, type CapabilityInventory, type InventoryItem } from "./capability-inventory";
import { prettyJson } from "./cli-format";
import { executorsFromResolvedProfile, resolveWorkflowProfile } from "./workflow-profiles";

type CapabilityImportResult = {
  readonly manifest: SourceCandidateManifest;
  readonly path: string;
  readonly writes: readonly string[];
};

type ImportOptions = {
  readonly cwd: string;
  readonly json: boolean;
};

type CapabilityLifecycleStatus = "ready" | "warn" | "empty";
type CapabilityFreshness = "fresh" | "stale" | "unknown";
type CapabilityStatusSource = {
  readonly id: string;
  readonly canonicalSource: string;
  readonly manifestPath: string;
  readonly candidateStatus: SourceCandidateManifest["status"];
  readonly trustStatus: SourceCandidateManifest["trustStatus"];
  readonly installed: boolean;
  readonly linkedProfiles: readonly string[];
  readonly freshness: CapabilityFreshness;
  readonly createdAt: string;
  readonly issues: readonly string[];
};
type CapabilityStatusReport = {
  readonly status: CapabilityLifecycleStatus;
  readonly activeProfile: string;
  readonly sources: readonly CapabilityStatusSource[];
  readonly summary: {
    readonly total: number;
    readonly installed: number;
    readonly stale: number;
    readonly issues: number;
  };
  readonly issues: readonly string[];
};

export async function runCapabilityCommand(args: readonly string[], options: ImportOptions): Promise<void> {
  if (args.includes("status")) {
    const result = await capabilityStatus(options.cwd);
    if (options.json) {
      console.log(prettyJson(result));
      return;
    }
    console.log(formatCapabilityStatusResult(result));
    return;
  }
  if (!args.includes("import")) {
    fail("capability.command_unknown", "Usage: boulder capability import --from <source> --dry-run|--write OR boulder capability status [--json]");
    return;
  }
  try {
    const result = await importCapabilitySource(args, options.cwd);
    if (options.json) {
      console.log(prettyJson(result));
      return;
    }
    console.log(formatCapabilityImportResult(result));
  } catch (error) {
    if (error instanceof CapabilitySourceError) {
      fail(error.code, error.message.replace(`${error.code}: `, ""));
      return;
    }
    throw error;
  }
}

async function capabilityStatus(cwd: string): Promise<CapabilityStatusReport> {
  const [profileResolution, sourceCandidates, inventoryResult] = await Promise.all([
    resolveWorkflowProfile(cwd, {}),
    loadSourceCandidateManifests(cwd),
    loadCapabilityInventory(cwd)
  ]);
  const inventory = inventoryResult.kind === "loaded" ? inventoryResult.inventory : null;
  const inventoryIssue = inventoryResult.kind === "missing"
    ? ["capability inventory missing; installed status is unknown"]
    : inventoryResult.kind === "invalid"
      ? ["capability inventory invalid; installed status is unknown"]
      : [];
  const activeProfile = profileResolution.profile;
  const executors = executorsFromResolvedProfile(activeProfile);
  const sources = sourceCandidates.candidates.map((manifest) => {
    const freshness = freshnessFor(manifest.createdAt);
    const issues = [
      ...(freshness === "stale" ? ["source candidate has not been refreshed within 90 days"] : []),
      ...(inventory ? [] : inventoryIssue)
    ];
    return {
      id: manifest.registryId,
      canonicalSource: manifest.source,
      manifestPath: sourceCandidateManifestPath(cwd, manifest.registryId),
      candidateStatus: manifest.status,
      trustStatus: manifest.trustStatus,
      installed: inventory ? isCapabilityInstalled(manifest.capabilityId, inventory) : false,
      linkedProfiles: linkedProfiles(manifest.capabilityId, activeProfile.id, executors),
      freshness,
      createdAt: manifest.createdAt,
      issues
    };
  });
  const issues = [
    ...sourceCandidates.issues.map((item) => item.message),
    ...inventoryIssue
  ];
  const issueCount = issues.length + sources.reduce((total, source) => total + source.issues.length, 0);
  return {
    status: sources.length === 0 ? "empty" : issueCount > 0 ? "warn" : "ready",
    activeProfile: activeProfile.id,
    sources,
    summary: {
      total: sources.length,
      installed: sources.filter((item) => item.installed).length,
      stale: sources.filter((item) => item.freshness === "stale").length,
      issues: issueCount
    },
    issues
  };
}

async function importCapabilitySource(args: readonly string[], cwd: string): Promise<CapabilityImportResult> {
  const from = optionValue(args, "--from");
  if (!from) throw new CapabilitySourceError("capability.source_required", "Missing --from.");
  const dryRun = args.includes("--dry-run");
  const write = args.includes("--write");
  if (dryRun && write) throw new CapabilitySourceError("capability.mode_conflict", "Choose exactly one of --dry-run or --write.");
  if (!dryRun && !write) throw new CapabilitySourceError("capability.mode_required", "Choose exactly one of --dry-run or --write.");
  const kind = parseKind(optionValue(args, "--kind"));
  const capabilityId = optionValue(args, "--id") ?? undefined;
  const manifest = buildSourceCandidateManifest(parseCapabilitySource(from), { kind, capabilityId });
  const path = sourceCandidateManifestPath(cwd, manifest.registryId);
  if (dryRun) return { manifest, path, writes: [] };
  const result = await writeSourceCandidateManifest(cwd, manifest);
  return { manifest, path, writes: result.status === "created" ? [result.path] : [] };
}

function parseKind(value: string | null): "skill" | "adapter" | "agent-catalog" | undefined {
  if (!value) return undefined;
  if (value === "skill" || value === "adapter" || value === "agent-catalog") return value;
  throw new CapabilitySourceError("capability.kind_invalid", "Kind must be skill, adapter, or agent-catalog.");
}

function optionValue(args: readonly string[], flag: string): string | null {
  const index = args.findIndex((arg) => arg === flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : null;
}

function formatCapabilityImportResult(result: CapabilityImportResult): string {
  return [
    "Boulder capability import",
    `- source: ${result.manifest.source}`,
    `- capability: ${result.manifest.capabilityId} (${result.manifest.kind})`,
    `- status: ${result.manifest.status}`,
    `- manifest: ${result.path}`,
    `- writes: ${result.writes.length ? result.writes.join(", ") : "none"}`
  ].join("\n");
}

function formatCapabilityStatusResult(result: CapabilityStatusReport): string {
  return [
    "Boulder capability status",
    `- status: ${result.status}`,
    `- active profile: ${result.activeProfile}`,
    `- sources: ${result.summary.total}`,
    `- installed: ${result.summary.installed}`,
    `- stale: ${result.summary.stale}`,
    ...result.sources.map((source) => `- ${source.id}: ${source.candidateStatus}, installed=${source.installed}, freshness=${source.freshness}`)
  ].join("\n");
}

function isCapabilityInstalled(capabilityId: string, inventory: CapabilityInventory): boolean {
  const normalized = capabilityId.toLowerCase();
  const items: readonly InventoryItem[] = [
    ...inventory.skills,
    ...inventory.mcpServers,
    ...inventory.plugins,
    ...inventory.runtimes
  ];
  return items.some((item) => {
    const id = item.id.toLowerCase();
    return id === normalized || id.endsWith(`:${normalized}`);
  });
}

function linkedProfiles(capabilityId: string, activeProfileId: string, executors: ReturnType<typeof executorsFromResolvedProfile>): readonly string[] {
  if (capabilityId === executors.planning.preferred || capabilityId === executors.execution.preferred) {
    return [activeProfileId];
  }
  return [];
}

function freshnessFor(createdAt: string): CapabilityFreshness {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return "unknown";
  const ageDays = (Date.now() - created) / 86_400_000;
  if (ageDays < 0) return "unknown";
  return ageDays > 90 ? "stale" : "fresh";
}

function fail(code: string, message: string): void {
  console.error(`ERROR ${code}: ${message}`);
  process.exitCode = 1;
}
