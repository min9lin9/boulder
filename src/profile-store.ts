import { lstat, readdir } from "node:fs/promises";
import { at, readText, writeText } from "./fs";
import { BUILT_IN_WORKFLOW_PROFILE_IDS } from "./workflow-profile-builtins";
import type { LaneRoute, ProfileDriftWarning, ProfileSource, ResolvedWorkflowProfile } from "./types";

const REQUIRED_LANES = ["intake", "plan", "critic", "handoff", "execute", "verify", "compound", "record"] as const;
const LANE_OWNERS = ["boulder", "codex", "external-adapter"] as const;
const LANE_MODES = ["local-only", "detect-and-suggest", "packet-only", "approval-gated-send"] as const;
const PURPOSES = ["programming", "research", "ops", "review", "release"] as const;
const SURFACES = ["intake", "plan", "execute", "verify", "record"] as const;

export class InvalidProfileNameError extends Error {
  constructor(message = "Profile name must contain only letters, numbers, dots, underscores, or hyphens.") {
    super(message);
    this.name = "InvalidProfileNameError";
  }
}

export class InvalidProfileStatePathError extends Error {
  constructor(message = "Profile state path must stay inside .boulder without symlink or hardlink targets.") {
    super(message);
    this.name = "InvalidProfileStatePathError";
  }
}

export async function listProjectProfiles(root: string): Promise<readonly ResolvedWorkflowProfile[]> {
  let files: readonly string[] = [];
  try {
    files = await readdir(at(root, ".boulder", "profiles"));
  } catch {
    return [];
  }
  const profiles = await Promise.all(files
    .filter((file) => file.endsWith(".json"))
    .map((file) => loadProjectProfile(root, file.slice(0, -5), "project-current", null, null, [])));
  return profiles.filter(isResolvedProfile);
}

export async function loadProjectProfile(
  root: string,
  profileId: string,
  source: ProfileSource,
  task: string | null,
  suggestion: string | null,
  drift: readonly ProfileDriftWarning[]
): Promise<ResolvedWorkflowProfile | null> {
  if (!isSafeProfileName(profileId)) return null;
  const path = at(root, ".boulder", "profiles", `${profileId}.json`);
  if (!await profilePathIsSafe(root, path)) return null;
  const text = await readText(path);
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isProjectProfile(parsed)) return null;
  return {
    ...parsed,
    source,
    id: profileId,
    drift,
    suggestion: { profileId: suggestion, applied: suggestion === profileId, task }
  };
}

export async function writeProjectProfile(root: string, name: string, profile: ResolvedWorkflowProfile): Promise<string> {
  assertSafeProfileName(name);
  if (isReservedProfileName(name)) {
    throw new InvalidProfileNameError("Built-in profile names are reserved.");
  }
  const path = at(root, ".boulder", "profiles", `${name}.json`);
  if (!await profilePathIsSafe(root, path)) {
    throw new InvalidProfileStatePathError();
  }
  await writeText(path, `${JSON.stringify(profile, null, 2)}\n`, true);
  return path;
}

export async function writeCurrentProfile(root: string, profileId: string): Promise<void> {
  const path = at(root, ".boulder", "current-profile");
  if (!await currentProfilePathIsSafe(root, path)) {
    throw new InvalidProfileStatePathError();
  }
  await writeText(path, `${profileId}\n`, true);
}

export function assertSafeProfileName(name: string): void {
  if (!isSafeProfileName(name)) {
    throw new InvalidProfileNameError();
  }
}

export async function readCurrentProfileText(root: string): Promise<string | null> {
  const path = at(root, ".boulder", "current-profile");
  if (!await currentProfilePathIsSafe(root, path)) return null;
  return await readText(path);
}

function isSafeProfileName(name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name);
}

function isReservedProfileName(name: string): boolean {
  return BUILT_IN_WORKFLOW_PROFILE_IDS.some((profileId) => profileId === name);
}

async function profilePathIsSafe(root: string, path: string): Promise<boolean> {
  return !await pathIsProtectedLink(at(root, ".boulder"))
    && !await pathIsProtectedLink(at(root, ".boulder", "profiles"))
    && !await pathIsProtectedLink(path);
}

async function currentProfilePathIsSafe(root: string, path: string): Promise<boolean> {
  return !await pathIsProtectedLink(at(root, ".boulder"))
    && !await pathIsProtectedLink(path);
}

async function pathIsProtectedLink(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    const isFile = Reflect.get(info, "isFile");
    const nlink = Reflect.get(info, "nlink");
    return info.isSymbolicLink()
      || (typeof isFile === "function" && isFile.call(info) === true && typeof nlink === "number" && nlink > 1);
  } catch {
    return false;
  }
}

function isResolvedProfile(value: ResolvedWorkflowProfile | null): value is ResolvedWorkflowProfile {
  return value !== null;
}

function isProjectProfile(value: unknown): value is ResolvedWorkflowProfile {
  if (!isRecord(value)) return false;
  return value["schemaVersion"] === "boulder.profile.resolved.v1"
    && typeof value["id"] === "string"
    && isOneOf(value["purpose"], PURPOSES)
    && isStringLiteralArray(value["surface"], SURFACES)
    && hasRequiredLanes(value["lanes"])
    && hasExternalPolicy(value["externalPolicy"])
    && hasFallback(value["fallback"])
    && isRecord(value["suggestion"])
    && Array.isArray(value["drift"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasRequiredLanes(value: unknown): value is ResolvedWorkflowProfile["lanes"] {
  if (!isRecord(value)) return false;
  return REQUIRED_LANES.every((lane) => isLaneRoute(value[lane]));
}

function isLaneRoute(value: unknown): value is LaneRoute {
  if (!isRecord(value)) return false;
  return isOneOf(value["owner"], LANE_OWNERS)
    && typeof value["adapter"] === "string"
    && isSafeAdapterName(value["adapter"])
    && (typeof value["modelPreference"] === "string" || value["modelPreference"] === null)
    && isOneOf(value["mode"], LANE_MODES)
    && isStringArray(value["evidenceRequired"]);
}

function hasExternalPolicy(value: unknown): value is ResolvedWorkflowProfile["externalPolicy"] {
  if (!isRecord(value)) return false;
  return value["default"] === "blocked"
    && value["requireExplicitApproval"] === true
    && value["rawWorkspaceContent"] === "forbidden"
    && value["sanitizedPacket"] === "allowed-after-approval";
}

function hasFallback(value: unknown): value is ResolvedWorkflowProfile["fallback"] {
  if (!isRecord(value)) return false;
  return typeof value["plan"] === "string"
    && isSafeAdapterName(value["plan"])
    && typeof value["execute"] === "string"
    && isSafeAdapterName(value["execute"])
    && typeof value["critic"] === "string"
    && isSafeAdapterName(value["critic"])
    && typeof value["compound"] === "string"
    && isSafeAdapterName(value["compound"]);
}

function isSafeAdapterName(name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStringLiteralArray<T extends string>(value: unknown, allowed: readonly T[]): value is readonly T[] {
  return Array.isArray(value) && value.every((item) => isOneOf(item, allowed));
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.some((item) => item === value);
}
