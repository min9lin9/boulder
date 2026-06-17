import { at, readText } from "./fs";
import { defaultExecutors } from "./executors";
import { loadManifest } from "./manifest";
import { assertSafeProfileName, loadProjectProfile, listProjectProfiles, readCurrentProfileText, writeCurrentProfile, writeProjectProfile } from "./profile-store";
import { BUILT_IN_WORKFLOW_PROFILE_IDS, builtInProfile, profileWithExternalExecutors } from "./workflow-profile-builtins";
import type {
  ExecutorProfiles,
  ProfileDriftWarning,
  ResolvedWorkflowProfile
} from "./types";

export type ProfileResolutionOptions = {
  readonly profile?: string;
  readonly task?: string;
};

export type ProfileResolution = {
  readonly profile: ResolvedWorkflowProfile;
};

export class ProfileNotFoundError extends Error {
  readonly profileId: string;

  constructor(profileId: string) {
    super(`Profile "${profileId}" was not found.`);
    this.name = "ProfileNotFoundError";
    this.profileId = profileId;
  }
}

export async function resolveWorkflowProfile(root: string, options: ProfileResolutionOptions): Promise<ProfileResolution> {
  const suggestion = taskClassFor(options.task ?? "");
  const explicit = options.profile ? await profileById(root, options.profile, "cli", options.task ?? null, suggestion, []) : null;
  if (options.profile && !explicit) {
    throw new ProfileNotFoundError(options.profile);
  }
  if (explicit) return { profile: explicit };

  const currentProfile = await readCurrentProfile(root);
  if (currentProfile) {
    const drift = [
      ...await manifestDiffWarnings(root),
      ...suggestionWarnings(currentProfile, suggestion, options.task)
    ];
    const current = await profileById(root, currentProfile, "project-current", options.task ?? null, suggestion, drift);
    if (current) return { profile: current };
    const legacy = await legacyProfile(root, options.task ?? null, suggestion, [
      {
        id: "profile.drift.current-missing",
        severity: "warn",
        message: `.boulder/current-profile points to missing profile "${currentProfile}".`
      }
    ]);
    if (legacy) return { profile: legacy };
    return {
      profile: builtInProfile(
        "programming-default",
        "built-in",
        options.task ?? null,
        suggestion,
        [
          {
            id: "profile.drift.current-missing",
            severity: "warn",
            message: `.boulder/current-profile points to missing profile "${currentProfile}".`
          },
          ...suggestionWarnings("programming-default", suggestion, options.task)
        ]
      ) ?? missingBuiltInProfile()
    };
  }

  const legacy = await legacyProfile(root, options.task ?? null, suggestion);
  if (legacy) return { profile: legacy };
  return {
    profile: builtInProfile(
      "programming-default",
      "built-in",
      options.task ?? null,
      suggestion,
      suggestionWarnings("programming-default", suggestion, options.task)
    ) ?? missingBuiltInProfile()
  };
}

export async function useWorkflowProfile(root: string, profileId: string): Promise<ResolvedWorkflowProfile> {
  assertSafeProfileName(profileId);
  const profile = await profileById(root, profileId, "project-current", null, null, []);
  if (!profile) {
    throw new ProfileNotFoundError(profileId);
  }
  await writeCurrentProfile(root, profileId);
  return profile;
}

export async function listWorkflowProfiles(root: string): Promise<readonly ResolvedWorkflowProfile[]> {
  const builtIns = BUILT_IN_WORKFLOW_PROFILE_IDS.map((profileId) => builtInProfile(profileId, "built-in", null, null, []))
    .filter(isResolvedProfile);
  return [...builtIns, ...await listProjectProfiles(root)];
}

export async function saveWorkflowProfile(root: string, name: string, profileId: string | null): Promise<string> {
  const source = profileId
    ? await profileById(root, profileId, "project-current", null, null, [])
    : (await resolveWorkflowProfile(root, {})).profile;
  const profile: ResolvedWorkflowProfile | null = source ? savedProfileFrom(source, name) : null;
  if (!profile) {
    throw new ProfileNotFoundError(profileId ?? name);
  }
  return await writeProjectProfile(root, name, profile);
}

function savedProfileFrom(source: ResolvedWorkflowProfile, name: string): ResolvedWorkflowProfile {
  return {
    ...source,
    id: name,
    source: "project-current",
    drift: [],
    suggestion: { profileId: null, applied: false, task: null }
  };
}

async function profileById(
  root: string,
  profileId: string,
  source: "cli" | "project-current" | "built-in",
  task: string | null,
  suggestion: string | null,
  drift: readonly ProfileDriftWarning[]
): Promise<ResolvedWorkflowProfile | null> {
  return builtInProfile(profileId, source, task, suggestion, drift)
    ?? await loadProjectProfile(root, profileId, source, task, suggestion, drift);
}

export function executorsFromResolvedProfile(profile: ResolvedWorkflowProfile): ExecutorProfiles {
  return {
    planning: {
      preferred: profile.lanes.plan.adapter,
      mode: profile.lanes.plan.mode
    },
    execution: {
      preferred: profile.lanes.execute.adapter,
      mode: profile.lanes.execute.mode
    },
    fallback: {
      planning: profile.fallback.plan,
      execution: profile.fallback.execute
    }
  };
}

export function taskClassFor(task: string): string | null {
  const normalized = task.trim().toLowerCase();
  if (normalized === "research") return "research-default";
  if (normalized === "ops" || normalized === "operations") return "ops-default";
  if (normalized === "programming" || normalized === "code" || normalized === "coding") return "programming-default";
  return null;
}

export function formatProfileResolve(profile: ResolvedWorkflowProfile): string {
  return [
    "Boulder resolved workflow profile",
    `- active-profile: ${profile.id}`,
    `- suggested-profile: ${profile.suggestion.profileId ?? "none"}`,
    `- suggestion-applied: ${profile.suggestion.applied ? "true" : "false"}`,
    `- source: ${profile.source}`,
    ...profile.drift.map((item) => `- ${item.severity}: ${item.id} - ${item.message}`)
  ].join("\n");
}

async function readCurrentProfile(root: string): Promise<string | null> {
  const text = await readCurrentProfileText(root);
  const value = text?.trim() ?? "";
  return value ? value : null;
}

async function legacyProfile(
  root: string,
  task: string | null,
  suggestion: string | null,
  extraDrift: readonly ProfileDriftWarning[] = []
): Promise<ResolvedWorkflowProfile | null> {
  const manifestText = await readText(at(root, "boulder.yaml"));
  if (!manifestText) return null;
  const manifest = await loadManifest(root);
  if (executorsEqual(manifest.executors, defaultExecutors())) return null;
  return profileFromExecutors("legacy-boulder-yaml", "legacy-manifest", manifest.executors, [
    ...extraDrift,
    {
      id: "profile.drift.legacy-executors",
      severity: "info",
      message: "Legacy boulder.yaml executors generated the active workflow profile."
    },
    ...suggestionWarnings("legacy-boulder-yaml", suggestion, task)
  ], task, suggestion);
}

async function manifestDiffWarnings(root: string): Promise<readonly ProfileDriftWarning[]> {
  const manifestText = await readText(at(root, "boulder.yaml"));
  if (!manifestText) return [];
  const manifest = await loadManifest(root);
  if (executorsEqual(manifest.executors, defaultExecutors())) return [];
  return [
    {
      id: "profile.drift.manifest-differs",
      severity: "info",
      message: "Active workflow profile differs from legacy boulder.yaml executors."
    }
  ];
}

function profileFromExecutors(
  id: string,
  source: "legacy-manifest",
  executors: ExecutorProfiles,
  drift: readonly ProfileDriftWarning[],
  task: string | null,
  suggestion: string | null
): ResolvedWorkflowProfile {
  return profileWithExternalExecutors({
    id,
    source,
    purpose: "programming",
    planAdapter: executors.planning.preferred,
    planModel: null,
    planMode: executors.planning.mode,
    executeAdapter: executors.execution.preferred,
    executeModel: null,
    executeMode: executors.execution.mode,
    fallbackPlan: executors.fallback.planning,
    fallbackExecute: executors.fallback.execution,
    drift,
    task,
    suggestion
  });
}

function suggestionWarnings(activeProfile: string, suggestion: string | null, task: string | null | undefined): readonly ProfileDriftWarning[] {
  if (!suggestion || suggestion === activeProfile) return [];
  return [
    {
      id: "profile.suggestion.not-applied",
      severity: "info",
      message: `Task "${task ?? "unknown"}" suggests ${suggestion}, but active profile remains ${activeProfile}.`
    }
  ];
}

function executorsEqual(left: ExecutorProfiles, right: ExecutorProfiles): boolean {
  return left.planning.preferred === right.planning.preferred
    && left.planning.mode === right.planning.mode
    && left.execution.preferred === right.execution.preferred
    && left.execution.mode === right.execution.mode
    && left.fallback.planning === right.fallback.planning
    && left.fallback.execution === right.fallback.execution;
}

function missingBuiltInProfile(): never {
  throw new ProfileNotFoundError("programming-default");
}

function isResolvedProfile(value: ResolvedWorkflowProfile | null): value is ResolvedWorkflowProfile { return value !== null; }
