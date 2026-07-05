import {
  buildSourceCandidateManifest,
  CapabilitySourceError,
  parseCapabilitySource,
  sourceCandidateManifestPath,
  writeSourceCandidateManifest,
  type SourceCandidateManifest
} from "./capability-source";
import { prettyJson } from "./cli-format";

type CapabilityImportResult = {
  readonly manifest: SourceCandidateManifest;
  readonly path: string;
  readonly writes: readonly string[];
};

type ImportOptions = {
  readonly cwd: string;
  readonly json: boolean;
};

export async function runCapabilityCommand(args: readonly string[], options: ImportOptions): Promise<void> {
  if (!args.includes("import")) {
    fail("capability.command_unknown", "Usage: boulder capability import --from <source> --dry-run|--write");
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

function fail(code: string, message: string): void {
  console.error(`ERROR ${code}: ${message}`);
  process.exitCode = 1;
}
