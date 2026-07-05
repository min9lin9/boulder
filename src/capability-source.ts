import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  isCapabilityId,
  isRegistryId,
  isSourceCandidateManifest,
  SCHEMA_VERSION,
  type BuildSourceCandidateOptions,
  type ParsedCapabilitySource,
  type SourceCandidateIssue,
  type SourceCandidateLoadResult,
  type SourceCandidateManifest,
  type SourceCandidateWriteResult
} from "./capability-source-schema";

const KNOWN_ADAPTERS: Record<string, string> = {
  "https://github.com/yeachan-heo/gajae-code": "gajae-code",
  "https://github.com/code-yeongyu/lazycodex": "lazycodex"
} as const;

const KNOWN_AGENT_CATALOGS: Record<string, string> = {
  "https://github.com/msitarzewski/agency-agents": "agency-agents"
} as const;
export type { SourceCandidateManifest } from "./capability-source-schema";

export class CapabilitySourceError extends Error {
  readonly name = "CapabilitySourceError";

  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
  }
}

export function parseCapabilitySource(input: string): ParsedCapabilitySource {
  if (input !== input.trim() || /[\s\x00-\x1f]/.test(input)) {
    throw sourceError("Source must not contain whitespace or control characters.");
  }
  if (input.startsWith("clawhub:")) return parseClawHubSource(input);
  if (/^github\.com\//i.test(input)) return parseGitHubSource(`https://${input}`);
  if (/^https:\/\//i.test(input)) return parseGitHubSource(input);
  throw sourceError("Use https://github.com/<owner>/<repo>, github.com/<owner>/<repo>, or clawhub:<slug>.");
}

export function buildSourceCandidateManifest(
  parsed: ParsedCapabilitySource,
  options: BuildSourceCandidateOptions = {},
  now = new Date()
): SourceCandidateManifest {
  const kind = options.kind ?? parsed.defaultKind;
  const capabilityId = options.capabilityId ?? parsed.defaultCapabilityId;
  if (kind === "adapter" && parsed.defaultKind !== "adapter" && !options.capabilityId) {
    throw new CapabilitySourceError("capability.adapter_id_required", "Unknown adapter sources require --id.");
  }
  if (!isCapabilityId(capabilityId)) {
    throw new CapabilitySourceError("capability.id_invalid", "Capability id must be lowercase letters, numbers, dots, underscores, or hyphens.");
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    registryId: parsed.registryId,
    capabilityId,
    source: parsed.source,
    sourceUrl: parsed.sourceUrl,
    sourceKind: parsed.sourceKind,
    kind,
    status: "configured-unverified",
    trustStatus: "unreviewed",
    license: "unknown",
    candidateCommands: [],
    createdAt: now.toISOString()
  };
}

export async function writeSourceCandidateManifest(root: string, manifest: SourceCandidateManifest): Promise<SourceCandidateWriteResult> {
  await ensureManifestPathSafe(root);
  const path = sourceCandidateManifestPath(root, manifest.registryId);
  try {
    await ensureExistingManifestFileSafe(path);
    const existing = parseSourceCandidateManifest(await readFile(path, "utf8"));
    if (sameManifestIgnoringCreatedAt(existing, manifest)) return { status: "unchanged", path };
    throw new CapabilitySourceError("capability.manifest_exists", `Source manifest already exists: ${path}`);
  } catch (error) {
    if (error instanceof CapabilitySourceError) throw error;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { status: "created", path };
}

export async function loadSourceCandidateManifests(root: string): Promise<SourceCandidateLoadResult> {
  const importsDir = sourceCandidateImportsDir(root);
  try {
    await ensureManifestPathSafe(root);
  } catch (error) {
    if (error instanceof CapabilitySourceError) {
      return {
        candidates: [],
        issues: [{
          id: "capability.source_manifest_invalid",
          severity: "warn",
          message: ".boulder/capabilities/imports is unsafe and was ignored."
        }]
      };
    }
    throw error;
  }
  let files: readonly string[] = [];
  try {
    files = await readdir(importsDir);
  } catch {
    return { candidates: [], issues: [] };
  }
  const candidates: SourceCandidateManifest[] = [];
  const issues: SourceCandidateIssue[] = [];
  for (const file of files.filter((item) => item.endsWith(".json")).sort()) {
    try {
      const path = join(importsDir, file);
      await ensureExistingManifestFileSafe(path);
      candidates.push(parseSourceCandidateManifest(await readFile(path, "utf8")));
    } catch {
      issues.push({
        id: "capability.source_manifest_invalid",
        severity: "warn",
        message: `${join(".boulder", "capabilities", "imports", safeIssueFileName(file))} is malformed and was ignored.`
      });
    }
  }
  return { candidates, issues };
}

export function sourceCandidateManifestPath(root: string, registryId: string): string {
  if (!isRegistryId(registryId)) {
    throw new CapabilitySourceError("capability.registry_id_invalid", "Registry id must be path-safe.");
  }
  const base = sourceCandidateImportsDir(root);
  const target = resolve(base, `${registryId}.json`);
  if (!target.startsWith(`${base}/`)) {
    throw new CapabilitySourceError("capability.manifest_path_unsafe", "Source manifest path must stay under .boulder/capabilities/imports.");
  }
  return target;
}

function parseGitHubSource(input: string): ParsedCapabilitySource {
  if (input.includes("%")) throw sourceError("Percent-encoded GitHub sources are not accepted.");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw sourceError("GitHub source URL is malformed.");
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw sourceError("GitHub source host must be github.com over https.");
  }
  if (url.username || url.password || url.port || url.search || url.hash || url.pathname.endsWith("/")) {
    throw sourceError("GitHub source must not include credentials, ports, query, fragment, or trailing slash.");
  }
  const parts = url.pathname.split("/").filter((part) => part.length > 0);
  if (parts.length !== 2) throw sourceError("GitHub source must be exactly /<owner>/<repo>.");
  const [owner, repo] = parts;
  if (!owner || !repo || !isGitHubName(owner) || !isGitHubName(repo) || repo.endsWith(".git")) {
    throw sourceError("GitHub owner and repo names are invalid.");
  }
  const source = `https://github.com/${owner}/${repo}`;
  const key = source.toLowerCase();
  const defaultCapabilityId = KNOWN_ADAPTERS[key] ?? KNOWN_AGENT_CATALOGS[key] ?? repo.toLowerCase();
  return {
    source,
    sourceUrl: source,
    sourceKind: "github",
    registryId: `github__${owner.toLowerCase()}__${repo.toLowerCase()}`,
    defaultCapabilityId,
    defaultKind: KNOWN_ADAPTERS[key] ? "adapter" : KNOWN_AGENT_CATALOGS[key] ? "agent-catalog" : "skill"
  };
}

function parseClawHubSource(input: string): ParsedCapabilitySource {
  const slug = input.slice("clawhub:".length);
  if (!isGitHubName(slug)) throw sourceError("ClawHub source must be clawhub:<slug> with a path-safe slug.");
  return {
    source: input,
    sourceUrl: null,
    sourceKind: "clawhub",
    registryId: `clawhub__${slug.toLowerCase()}`,
    defaultCapabilityId: slug.toLowerCase(),
    defaultKind: "skill"
  };
}

function parseSourceCandidateManifest(text: string): SourceCandidateManifest {
  const value: unknown = JSON.parse(text);
  if (!isSourceCandidateManifest(value)) {
    throw new CapabilitySourceError("capability.source_manifest_invalid", "Source manifest is malformed.");
  }
  const parsed = parseCapabilitySource(value.source);
  const sourceMatches = value.source === parsed.source
    && value.sourceUrl === parsed.sourceUrl
    && value.sourceKind === parsed.sourceKind
    && value.registryId === parsed.registryId
    && value.candidateCommands.length === 0;
  const capabilityMatches = value.capabilityId === parsed.defaultCapabilityId
    && (value.kind === parsed.defaultKind || (parsed.defaultKind === "skill" && value.kind === "adapter"));
  if (
    !sourceMatches
    || !capabilityMatches
  ) {
    throw new CapabilitySourceError("capability.source_manifest_invalid", "Source manifest must match the canonical source parser output.");
  }
  return value;
}

async function ensureExistingManifestFileSafe(path: string): Promise<void> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink() || stats.nlink > 1) {
    throw new CapabilitySourceError("capability.manifest_path_unsafe", "Source manifest file must not be a symlink or hardlink.");
  }
}

async function ensureManifestPathSafe(root: string): Promise<void> {
  for (const path of [resolve(root, ".boulder"), resolve(root, ".boulder", "capabilities"), sourceCandidateImportsDir(root)]) {
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) throw new CapabilitySourceError("capability.manifest_path_unsafe", "Source manifest path must not cross symlinks.");
    } catch (error) {
      if (error instanceof CapabilitySourceError) throw error;
    }
  }
}

function sourceCandidateImportsDir(root: string): string {
  return resolve(root, ".boulder", "capabilities", "imports");
}

function sameManifestIgnoringCreatedAt(left: SourceCandidateManifest, right: SourceCandidateManifest): boolean {
  return JSON.stringify({ ...left, createdAt: "" }) === JSON.stringify({ ...right, createdAt: "" });
}

function isGitHubName(value: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/.test(value) && value !== "." && value !== "..";
}

function safeIssueFileName(value: string): string {
  return /^[A-Za-z0-9._-]+\.json$/.test(value) ? value : "<unsafe-json-file>";
}

function sourceError(message: string): CapabilitySourceError {
  return new CapabilitySourceError("capability.source_invalid", message);
}
