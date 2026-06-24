export const SCHEMA_VERSION = "boulder.capability.import.v1";

export type SourceKind = "github" | "clawhub";
export type SourceCandidateKind = "skill" | "adapter";
export type WriteStatus = "created" | "unchanged";
export type CandidateCommand = { readonly argv: readonly string[]; readonly preview: string; readonly purpose: string; readonly requiresApproval: boolean };
export type ParsedCapabilitySource = {
  readonly source: string;
  readonly sourceUrl: string | null;
  readonly sourceKind: SourceKind;
  readonly registryId: string;
  readonly defaultCapabilityId: string;
  readonly defaultKind: SourceCandidateKind;
};
export type SourceCandidateManifest = {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly registryId: string;
  readonly capabilityId: string;
  readonly source: string;
  readonly sourceUrl: string | null;
  readonly sourceKind: SourceKind;
  readonly kind: SourceCandidateKind;
  readonly status: "configured-unverified";
  readonly trustStatus: "unreviewed";
  readonly license: "unknown";
  readonly candidateCommands: readonly CandidateCommand[];
  readonly createdAt: string;
};
export type SourceCandidateIssue = { readonly id: "capability.source_manifest_invalid"; readonly severity: "warn"; readonly message: string };
export type SourceCandidateLoadResult = { readonly candidates: readonly SourceCandidateManifest[]; readonly issues: readonly SourceCandidateIssue[] };
export type BuildSourceCandidateOptions = { readonly kind?: SourceCandidateKind; readonly capabilityId?: string };
export type SourceCandidateWriteResult = { readonly status: WriteStatus; readonly path: string };

export function isSourceCandidateManifest(value: unknown): value is SourceCandidateManifest {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item["schemaVersion"] === SCHEMA_VERSION
    && typeof item["registryId"] === "string"
    && isRegistryId(item["registryId"])
    && typeof item["capabilityId"] === "string"
    && isCapabilityId(item["capabilityId"])
    && typeof item["source"] === "string"
    && (typeof item["sourceUrl"] === "string" || item["sourceUrl"] === null)
    && (item["sourceKind"] === "github" || item["sourceKind"] === "clawhub")
    && (item["kind"] === "skill" || item["kind"] === "adapter")
    && item["status"] === "configured-unverified"
    && item["trustStatus"] === "unreviewed"
    && item["license"] === "unknown"
    && Array.isArray(item["candidateCommands"])
    && item["candidateCommands"].every(isCandidateCommand)
    && typeof item["createdAt"] === "string";
}

export function isRegistryId(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value);
}

export function isCapabilityId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,80}$/.test(value);
}

function isCandidateCommand(value: unknown): value is CandidateCommand {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return Array.isArray(item["argv"])
    && item["argv"].every((part) => typeof part === "string")
    && typeof item["preview"] === "string"
    && typeof item["purpose"] === "string"
    && typeof item["requiresApproval"] === "boolean";
}
