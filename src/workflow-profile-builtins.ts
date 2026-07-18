import type {
  ExternalPolicy,
  LaneRoute,
  LaneMode,
  ProfileDriftWarning,
  ProfileSource,
  ResolvedWorkflowProfile,
  WorkflowPurpose
} from "./types";

const SURFACE = ["intake", "plan", "execute", "verify", "record"] as const;
export const BUILT_IN_WORKFLOW_PROFILE_IDS = [
  "programming-default",
  "boulder-native-preview",
  "research-default",
  "ops-default",
  "programming-heavy",
  "research-corpus",
  "release-safe",
  "issue-triage",
  "docs-reviewer"
] as const;

const EXTERNAL_POLICY: ExternalPolicy = {
  default: "blocked",
  requireExplicitApproval: true,
  rawWorkspaceContent: "forbidden",
  sanitizedPacket: "allowed-after-approval"
};

export function builtInProfile(
  profileId: string,
  source: ProfileSource,
  task: string | null,
  suggestion: string | null,
  drift: readonly ProfileDriftWarning[]
): ResolvedWorkflowProfile | null {
  if (profileId === "programming-default") return programmingDefault(source, drift, task, suggestion);
  if (profileId === "boulder-native-preview") return boulderNativePreview(source, drift, task, suggestion);
  if (profileId === "research-default") return researchDefault(source, drift, task, suggestion);
  if (profileId === "ops-default") return opsDefault(source, drift, task, suggestion);
  if (profileId === "programming-heavy") return programmingProfile("programming-heavy", source, drift, task, suggestion);
  if (profileId === "research-corpus") return localProfile("research-corpus", "research", source, drift, task, suggestion);
  if (profileId === "release-safe") return localProfile("release-safe", "ops", source, drift, task, suggestion);
  if (profileId === "issue-triage") return localProfile("issue-triage", "ops", source, drift, task, suggestion);
  if (profileId === "docs-reviewer") return localProfile("docs-reviewer", "research", source, drift, task, suggestion);
  return null;
}

export function profileWithExternalExecutors(
  params: {
    readonly id: string;
    readonly source: ProfileSource;
    readonly purpose: WorkflowPurpose;
    readonly planAdapter: string;
    readonly planModel: string | null;
    readonly planMode?: LaneMode;
    readonly executeAdapter: string;
    readonly executeModel: string | null;
    readonly executeMode?: LaneMode;
    readonly fallbackPlan: string;
    readonly fallbackExecute: string;
    readonly drift: readonly ProfileDriftWarning[];
    readonly task: string | null;
    readonly suggestion: string | null;
  }
): ResolvedWorkflowProfile {
  return {
    schemaVersion: "boulder.profile.resolved.v1",
    source: params.source,
    id: params.id,
    purpose: params.purpose,
    surface: SURFACE,
    lanes: {
      intake: localLane("boulder", ["repo-context"]),
      plan: externalLane(params.planAdapter, params.planModel, params.planMode ?? "detect-and-suggest", ["planning-packet"]),
      critic: localLane("codex", ["critic-notes"]),
      handoff: localLane("boulder", ["execution-packet"]),
      execute: externalLane(params.executeAdapter, params.executeModel, params.executeMode ?? "detect-and-suggest", ["execution-result"]),
      verify: localLane("boulder", ["verification-report"]),
      compound: localLane("boulder", ["compound-ledger"]),
      record: localLane("boulder", ["decision-log"])
    },
    externalPolicy: EXTERNAL_POLICY,
    fallback: {
      plan: params.fallbackPlan,
      execute: params.fallbackExecute,
      critic: "codex",
      compound: "boulder"
    },
    drift: params.drift,
    suggestion: {
      profileId: params.suggestion,
      applied: params.suggestion === params.id,
      task: params.task
    }
  };
}

function programmingDefault(
  source: ProfileSource,
  drift: readonly ProfileDriftWarning[],
  task: string | null,
  suggestion: string | null
): ResolvedWorkflowProfile {
  return programmingProfile("programming-default", source, drift, task, suggestion);
}
function boulderNativePreview(
  source: ProfileSource,
  drift: readonly ProfileDriftWarning[],
  task: string | null,
  suggestion: string | null
): ResolvedWorkflowProfile {
  return profileWithExternalExecutors({
    id: "boulder-native-preview",
    source,
    purpose: "programming",
    planAdapter: "boulder-native",
    planModel: null,
    planMode: "local-only",
    executeAdapter: "lazycodex",
    executeModel: "gpt-5.5-medium",
    fallbackPlan: "codex",
    fallbackExecute: "codex",
    drift,
    task,
    suggestion
  });
}

function programmingProfile(
  id: string,
  source: ProfileSource,
  drift: readonly ProfileDriftWarning[],
  task: string | null,
  suggestion: string | null
): ResolvedWorkflowProfile {
  return profileWithExternalExecutors({
    id,
    source,
    purpose: "programming",
    planAdapter: "gajae-code",
    planModel: "kimi-k2.7",
    executeAdapter: "lazycodex",
    executeModel: "gpt-5.5-medium",
    fallbackPlan: "codex",
    fallbackExecute: "codex",
    drift,
    task,
    suggestion
  });
}

function researchDefault(
  source: ProfileSource,
  drift: readonly ProfileDriftWarning[],
  task: string | null,
  suggestion: string | null
): ResolvedWorkflowProfile {
  return localProfile("research-default", "research", source, drift, task, suggestion);
}

function opsDefault(
  source: ProfileSource,
  drift: readonly ProfileDriftWarning[],
  task: string | null,
  suggestion: string | null
): ResolvedWorkflowProfile {
  return localProfile("ops-default", "ops", source, drift, task, suggestion);
}

function localProfile(
  id: string,
  purpose: WorkflowPurpose,
  source: ProfileSource,
  drift: readonly ProfileDriftWarning[],
  task: string | null,
  suggestion: string | null
): ResolvedWorkflowProfile {
  return {
    schemaVersion: "boulder.profile.resolved.v1",
    source,
    id,
    purpose,
    surface: SURFACE,
    lanes: {
      intake: localLane("boulder", ["context-summary"]),
      plan: localLane("codex", ["plan-summary"]),
      critic: localLane("codex", ["critic-notes"]),
      handoff: localLane("boulder", ["handoff-packet"]),
      execute: localLane("codex", ["work-result"]),
      verify: localLane("boulder", ["verification-report"]),
      compound: localLane("boulder", ["compound-ledger"]),
      record: localLane("boulder", ["decision-log"])
    },
    externalPolicy: EXTERNAL_POLICY,
    fallback: { plan: "codex", execute: "codex", critic: "codex", compound: "boulder" },
    drift,
    suggestion: { profileId: suggestion, applied: suggestion === id, task }
  };
}

function localLane(adapter: string, evidenceRequired: readonly string[]): LaneRoute {
  return {
    owner: adapter === "boulder" ? "boulder" : "codex",
    adapter,
    modelPreference: null,
    mode: "local-only",
    evidenceRequired
  };
}

function externalLane(adapter: string, modelPreference: string | null, mode: LaneMode, evidenceRequired: readonly string[]): LaneRoute {
  return {
    owner: "external-adapter",
    adapter,
    modelPreference,
    mode,
    evidenceRequired
  };
}
