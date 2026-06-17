export type VerificationCommand = {
  name: string;
  command: string;
  required?: boolean;
};

export type WorkflowStackComponent = {
  name: string;
  role: string;
  required: boolean;
  description: string;
};

export type ExecutorMode = "detect-and-suggest" | "local-only" | "packet-only" | "approval-gated-send";

export type ExecutorProfile = {
  readonly preferred: string;
  readonly mode: ExecutorMode;
};

export type ExecutorFallback = {
  readonly planning: string;
  readonly execution: string;
};

export type ExecutorAdapterCommand = {
  readonly command: string;
  readonly purpose: string;
  readonly requiresApproval: boolean;
};

export type ExecutorProfiles = {
  readonly planning: ExecutorProfile;
  readonly execution: ExecutorProfile;
  readonly fallback: ExecutorFallback;
};

export type ProfileSource = "cli" | "project-current" | "legacy-manifest" | "built-in";

export type WorkflowPurpose = "programming" | "research" | "ops" | "review" | "release";

export type WorkflowSurface = "intake" | "plan" | "execute" | "verify" | "record";

export type LaneMode = "local-only" | "detect-and-suggest" | "packet-only" | "approval-gated-send";

export type LaneRoute = {
  readonly owner: "boulder" | "codex" | "external-adapter";
  readonly adapter: string;
  readonly modelPreference: string | null;
  readonly mode: LaneMode;
  readonly evidenceRequired: readonly string[];
};

export type ExternalPolicy = {
  readonly default: "blocked";
  readonly requireExplicitApproval: true;
  readonly rawWorkspaceContent: "forbidden";
  readonly sanitizedPacket: "allowed-after-approval";
};

export type ProfileDriftWarning = {
  readonly id:
    | "profile.drift.legacy-executors"
    | "profile.drift.current-missing"
    | "profile.drift.manifest-differs"
    | "profile.suggestion.not-applied";
  readonly severity: "info" | "warn";
  readonly message: string;
};

export type ProfileSuggestion = {
  readonly profileId: string | null;
  readonly applied: boolean;
  readonly task: string | null;
};

export type ResolvedWorkflowProfile = {
  readonly schemaVersion: "boulder.profile.resolved.v1";
  readonly source: ProfileSource;
  readonly id: string;
  readonly purpose: WorkflowPurpose;
  readonly surface: readonly WorkflowSurface[];
  readonly lanes: {
    readonly intake: LaneRoute;
    readonly plan: LaneRoute;
    readonly critic: LaneRoute;
    readonly handoff: LaneRoute;
    readonly execute: LaneRoute;
    readonly verify: LaneRoute;
    readonly compound: LaneRoute;
    readonly record: LaneRoute;
  };
  readonly externalPolicy: ExternalPolicy;
  readonly fallback: {
    readonly plan: string;
    readonly execute: string;
    readonly critic: string;
    readonly compound: string;
  };
  readonly drift: readonly ProfileDriftWarning[];
  readonly suggestion: ProfileSuggestion;
};

export type BoulderManifest = {
  name: string;
  description: string;
  maintainers: string[];
  workflowStack: WorkflowStackComponent[];
  workflows: string[];
  protectedPaths: string[];
  verification: VerificationCommand[];
  providers: {
    default: string;
    externalAllowed: boolean;
    approvalRequired: boolean;
  };
  executors: ExecutorProfiles;
  export: {
    markdown: boolean;
    codexNotes: boolean;
  };
};

export type RepoInspection = {
  root: string;
  name: string;
  detected: {
    readme: boolean;
    packageJson: boolean;
    pyproject: boolean;
    tests: string[];
    docs: string[];
    ci: string[];
  };
  likelyVerification: VerificationCommand[];
  protectedPaths: string[];
  recommendedWorkflows: string[];
  risks: string[];
};

export type VerifyResult = {
  name: string;
  command: string;
  required: boolean;
  status: "planned" | "passed" | "failed" | "skipped";
  output?: string;
};
