export type FrictionLevel = "low" | "medium" | "high";

export type PipelineStageId =
  | "classification"
  | "deep-interview"
  | "pm-debate"
  | "synthesizer"
  | "cso-qa";

export type SideEffectCategory =
  | "none"
  | "repo-read"
  | "repo-write"
  | "provider-call"
  | "credential-access"
  | "package-install"
  | "external-launch";

export type ExecutorRoute = {
  lane: "plan" | "execute";
  preferred: string;
  mode: "detect-and-suggest";
  fallback: string;
};

export type PipelineStage = {
  id: PipelineStageId;
  label: string;
  required: boolean;
  depth: "light" | "standard" | "deep";
  outputs: string[];
  evidence: string[];
  approvalRequired: boolean;
  allowedSideEffects: SideEffectCategory[];
};

export type PipelinePlan = {
  friction: FrictionLevel;
  stages: PipelineStage[];
  failClosed: boolean;
  forbiddenSideEffects: SideEffectCategory[];
  approvalGates: string[];
  evidenceRequired: string[];
  executors: readonly ExecutorRoute[];
};

export type PipelineIssue = {
  id: "pipeline.stage.missing" | "pipeline.sideEffect.forbidden" | "pipeline.evidence.missing";
  message: string;
  stageId?: PipelineStageId;
};

export const FRICTION_LEVELS: readonly FrictionLevel[] = ["low", "medium", "high"];

const FORBIDDEN_SIDE_EFFECTS: readonly SideEffectCategory[] = [
  "credential-access",
  "package-install",
  "external-launch",
  "provider-call"
];

export function isFrictionLevel(value: string): value is FrictionLevel {
  return FRICTION_LEVELS.includes(value as FrictionLevel);
}

export function invalidFrictionMessage(value: string): string {
  return `ERROR pipeline.friction.invalid: Unsupported friction level "${value}". Expected one of: ${FRICTION_LEVELS.join(", ")}.`;
}

export function buildPipelinePlan(friction: FrictionLevel): PipelinePlan {
  if (friction === "low") {
    return plan(friction, [
      stage("classification", "Classification", "light", ["task-class", "friction-level"], ["repo-context"], false, ["none", "repo-read"]),
      stage("synthesizer", "Synthesizer", "light", ["decision", "next-action"], ["plan-summary"], false, ["none"])
    ]);
  }

  if (friction === "medium") {
    return plan(friction, [
      stage("classification", "Classification", "standard", ["task-class", "friction-level", "risk-flags"], ["repo-context", "manifest-context"], false, ["none", "repo-read"]),
      stage("deep-interview", "Deep Interview", "standard", ["ambiguities", "assumptions", "required-decisions"], ["operator-intent", "open-questions"], false, ["none"]),
      stage("pm-debate", "PM Debate", "standard", ["tradeoffs", "recommended-path", "rejected-options"], ["debate-notes"], true, ["none"]),
      stage("synthesizer", "Synthesizer", "standard", ["decision", "acceptance-gates", "next-action"], ["synthesis-summary"], false, ["none"])
    ]);
  }

  return plan(friction, [
    stage("classification", "Classification", "deep", ["task-class", "friction-level", "risk-flags", "approval-scope"], ["repo-context", "manifest-context", "risk-context"], false, ["none", "repo-read"]),
    stage("deep-interview", "Deep Interview", "deep", ["ambiguities", "assumptions", "required-decisions", "blocked-unknowns"], ["operator-intent", "open-questions", "decision-log"], false, ["none"]),
    stage("pm-debate", "PM Debate", "standard", ["tradeoffs", "recommended-path", "rejected-options", "milestone-scope"], ["debate-notes", "scope-boundary"], true, ["none"]),
    stage("synthesizer", "Synthesizer", "deep", ["decision", "acceptance-gates", "next-action", "handoff-contract"], ["synthesis-summary", "implementation-contract"], false, ["none"]),
    stage("cso-qa", "CSO/QA", "standard", ["risk-review", "qa-gates", "approval-result"], ["security-review", "qa-checklist"], true, ["none"])
  ]);
}

export function validatePipelinePlan(plan: PipelinePlan): PipelineIssue[] {
  const issues: PipelineIssue[] = [];
  for (const stageId of requiredStageIds(plan.friction)) {
    if (!plan.stages.some((stageItem) => stageItem.id === stageId)) {
      issues.push({ id: "pipeline.stage.missing", stageId, message: `Required pipeline stage is missing: ${stageId}.` });
    }
  }

  for (const stageItem of plan.stages) {
    if (!stageItem.evidence.length) {
      issues.push({ id: "pipeline.evidence.missing", stageId: stageItem.id, message: `Pipeline stage has no evidence outputs: ${stageItem.id}.` });
    }
    const forbidden = stageItem.allowedSideEffects.filter((item) => FORBIDDEN_SIDE_EFFECTS.includes(item));
    if (forbidden.length) {
      issues.push({
        id: "pipeline.sideEffect.forbidden",
        stageId: stageItem.id,
        message: `Pipeline stage ${stageItem.id} includes forbidden side effect(s): ${forbidden.join(", ")}.`
      });
    }
  }

  return issues;
}

export function formatPipelinePlan(plan: PipelinePlan): string {
  return [
    "Boulder pipeline plan",
    `- friction: ${plan.friction}`,
    ...plan.stages.map((stageItem) => `- stage: ${stageItem.id} (${stageMarkers(stageItem).join(", ")})`),
    ...plan.executors.map((route) => `- executor: ${route.lane}=${route.preferred} (${route.mode}, fallback: ${route.fallback})`),
    `- fail-closed: ${plan.failClosed}`
  ].join("\n");
}

function plan(friction: FrictionLevel, stages: PipelineStage[]): PipelinePlan {
  return {
    friction,
    stages,
    failClosed: true,
    forbiddenSideEffects: [...FORBIDDEN_SIDE_EFFECTS],
    approvalGates: stages.filter((stageItem) => stageItem.approvalRequired).map((stageItem) => stageItem.id),
    evidenceRequired: unique(stages.flatMap((stageItem) => stageItem.evidence)),
    executors: defaultExecutorRoutes()
  };
}

function defaultExecutorRoutes(): readonly ExecutorRoute[] {
  return [
    {
      lane: "plan",
      preferred: "gajae-code",
      mode: "detect-and-suggest",
      fallback: "codex"
    },
    {
      lane: "execute",
      preferred: "lazycodex",
      mode: "detect-and-suggest",
      fallback: "codex"
    }
  ];
}

function stage(
  id: PipelineStageId,
  label: string,
  depth: PipelineStage["depth"],
  outputs: string[],
  evidence: string[],
  approvalRequired: boolean,
  allowedSideEffects: SideEffectCategory[]
): PipelineStage {
  return {
    id,
    label,
    required: true,
    depth,
    outputs,
    evidence,
    approvalRequired,
    allowedSideEffects
  };
}

function requiredStageIds(friction: FrictionLevel): readonly PipelineStageId[] {
  if (friction === "low") return ["classification", "synthesizer"];
  if (friction === "medium") return ["classification", "deep-interview", "pm-debate", "synthesizer"];
  return ["classification", "deep-interview", "pm-debate", "synthesizer", "cso-qa"];
}

function stageMarkers(stageItem: PipelineStage): string[] {
  const markers = [stageItem.required ? "required" : "optional", stageItem.depth];
  if (stageItem.approvalRequired) {
    markers.push("approval required");
  }
  return markers;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}
