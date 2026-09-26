import { at, protectedWritePathIsSafe, readText, safeReplaceText, UnsafeGeneratedWritePathError } from "../fs";

export const SOURCE_CONFIG_SCHEMA_VERSION = "boulder.trace.source-config.v1";
export const DEFAULT_ADAPTER_ID = "openclaw-local";

// Identity: source_instance_id is a persisted uuid generated at registration
// (or operator-provided), intentionally NOT derived from db_path. Moving the
// same sqlite file to a new path keeps identity only if the operator edits
// db_path in the config (or re-registers) - the file path is a mutable
// pointer, the uuid is the identity. No auto-discovery is performed; remote
// deployments follow the documented pattern
// /home/<account>/.openclaw-<profile>/agents/<agent>/agent/openclaw-agent.sqlite
// and operators copy/mount the file locally and register its absolute path.
export type SourceConfig = {
  readonly schemaVersion: typeof SOURCE_CONFIG_SCHEMA_VERSION;
  readonly source_instance_id: string;
  readonly adapter_id: string;
  readonly db_path: string;
  readonly registered_at: string;
  readonly last_admission_fingerprint?: string;
};

export type RegisterSourceInput = {
  readonly db_path: string;
  readonly adapter_id?: string;
};

export type RegisterSourceOptions = {
  readonly source_instance_id?: string;
  readonly dryRun?: boolean;
};

export class SourceConfigNotFoundError extends Error {
  constructor(root: string) {
    super(`No trace source registered at ${sourceConfigPath(root)}. Register one before running trace collection.`);
    this.name = "SourceConfigNotFoundError";
  }
}

export function sourceConfigPath(root: string): string {
  return at(root, ".boulder", "trace-state", "source-config.json");
}

export function isSourceConfig(value: unknown): value is SourceConfig {
  if (!isRecord(value)) return false;
  if (value["schemaVersion"] !== SOURCE_CONFIG_SCHEMA_VERSION) return false;
  if (!isNonEmptyString(value["source_instance_id"])) return false;
  if (!isNonEmptyString(value["adapter_id"])) return false;
  if (!isNonEmptyString(value["db_path"])) return false;
  if (!isNonEmptyString(value["registered_at"])) return false;
  if (value["last_admission_fingerprint"] !== undefined
    && !isNonEmptyString(value["last_admission_fingerprint"])) return false;
  return true;
}

// Missing file, unreadable file, malformed JSON, or shape mismatch all return
// null (documented choice): callers use requireSourceConfig for the erroring
// variant with a clear message.
export async function loadSourceConfig(root: string): Promise<SourceConfig | null> {
  const text = await readText(sourceConfigPath(root));
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return isSourceConfig(parsed) ? parsed : null;
}

export async function requireSourceConfig(root: string): Promise<SourceConfig> {
  const config = await loadSourceConfig(root);
  if (!config) throw new SourceConfigNotFoundError(root);
  return config;
}

export async function registerSource(
  root: string,
  input: RegisterSourceInput,
  opts: RegisterSourceOptions = {}
): Promise<SourceConfig> {
  if (!isNonEmptyString(input.db_path)) {
    throw new Error("db_path must be a non-empty string.");
  }
  const config: SourceConfig = {
    schemaVersion: SOURCE_CONFIG_SCHEMA_VERSION,
    source_instance_id: opts.source_instance_id ?? crypto.randomUUID(),
    adapter_id: input.adapter_id ?? DEFAULT_ADAPTER_ID,
    db_path: input.db_path,
    registered_at: new Date().toISOString()
  };
  if (opts.dryRun) return config;
  const directory = at(root, ".boulder", "trace-state");
  const path = sourceConfigPath(root);
  if (!await protectedWritePathIsSafe(root, directory, path)) {
    throw new UnsafeGeneratedWritePathError(
      "Trace source config path must stay inside .boulder/trace-state without symlink or hardlink targets."
    );
  }
  await safeReplaceText(path, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
