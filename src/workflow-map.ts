export type WorkflowLane = "first-run" | "profile" | "capability" | "handoff" | "readiness";

export type WorkflowMapStep = {
  readonly id: string;
  readonly lane: WorkflowLane;
  readonly command: string;
  readonly purpose: string;
  readonly required: boolean;
  readonly dependsOn: readonly string[];
};

export type WorkflowMap = {
  readonly schemaVersion: "boulder.workflow-map.v1";
  readonly id: "primary-workflow";
  readonly route: readonly WorkflowLane[];
  readonly steps: readonly WorkflowMapStep[];
  readonly secondaryCommands: readonly WorkflowMapStep[];
};

const PRIMARY_ROUTE = ["first-run", "profile", "capability", "handoff", "readiness"] as const satisfies readonly WorkflowLane[];
const REQUIRED_STEP_IDS = ["init", "quickstart", "profile-resolve", "capability-import", "handoff-packet", "release-check"] as const;

export const PRIMARY_WORKFLOW_MAP = {
  schemaVersion: "boulder.workflow-map.v1",
  id: "primary-workflow",
  route: PRIMARY_ROUTE,
  steps: [
    {
      id: "init",
      lane: "first-run",
      command: "boulder init --cwd .",
      purpose: "Create the local Boulder harness files.",
      required: true,
      dependsOn: []
    },
    {
      id: "quickstart",
      lane: "first-run",
      command: "boulder quickstart --cwd .",
      purpose: "Read the current checks and next commands.",
      required: true,
      dependsOn: ["init"]
    },
    {
      id: "inspect",
      lane: "first-run",
      command: "boulder inspect --cwd . --json",
      purpose: "Capture repository shape before planning.",
      required: false,
      dependsOn: ["quickstart"]
    },
    {
      id: "profile-resolve",
      lane: "profile",
      command: "boulder profile resolve --cwd . --json",
      purpose: "Confirm the active profile and executor policy.",
      required: true,
      dependsOn: ["quickstart"]
    },
    {
      id: "profile-use",
      lane: "profile",
      command: "boulder profile use programming-default --cwd .",
      purpose: "Change the active profile only when the resolved default is not right for the work.",
      required: false,
      dependsOn: ["profile-resolve"]
    },
    {
      id: "capability-import",
      lane: "capability",
      command: "boulder capability import --from https://github.com/Yeachan-Heo/gajae-code --dry-run",
      purpose: "Preview capability source candidates before recording them.",
      required: true,
      dependsOn: ["profile-resolve"]
    },
    {
      id: "doctor",
      lane: "capability",
      command: "boulder doctor --cwd . --json",
      purpose: "Report configured, candidate, and locally available capabilities without installing tools.",
      required: false,
      dependsOn: ["capability-import"]
    },
    {
      id: "handoff-packet",
      lane: "handoff",
      command: "boulder handoff packet --adapter gajae-code --include <path> --json",
      purpose: "Build a sanitized handoff packet.",
      required: true,
      dependsOn: ["doctor"]
    },
    {
      id: "handoff-review",
      lane: "handoff",
      command: "boulder handoff review --adapter gajae-code",
      purpose: "Review the packet before any external send.",
      required: false,
      dependsOn: ["handoff-packet"]
    },
    {
      id: "release-check",
      lane: "readiness",
      command: "boulder release-check --cwd . --json",
      purpose: "Check release evidence before publishing.",
      required: true,
      dependsOn: ["handoff-review"]
    },
    {
      id: "product-readiness",
      lane: "readiness",
      command: "boulder product-readiness --cwd . --json",
      purpose: "Check public product evidence.",
      required: false,
      dependsOn: ["release-check"]
    },
    {
      id: "service-readiness",
      lane: "readiness",
      command: "boulder service-readiness --cwd . --json",
      purpose: "Check repeatable service evidence.",
      required: false,
      dependsOn: ["product-readiness"]
    }
  ],
  secondaryCommands: [
    {
      id: "routine-capture",
      lane: "first-run",
      command: "boulder routine capture --task \"<text>\" --dry-run",
      purpose: "Capture recurring work after the main route is understood.",
      required: false,
      dependsOn: []
    },
    {
      id: "retro-weekly",
      lane: "first-run",
      command: "boulder retro weekly --dry-run",
      purpose: "Review recurring-work patterns.",
      required: false,
      dependsOn: ["routine-capture"]
    },
    {
      id: "skill-propose",
      lane: "first-run",
      command: "boulder skill propose --from-routine <routine-id> --dry-run",
      purpose: "Draft a local skill proposal for manual review.",
      required: false,
      dependsOn: ["retro-weekly"]
    }
  ]
} as const satisfies WorkflowMap;

export function buildPrimaryWorkflowMap(): WorkflowMap {
  return PRIMARY_WORKFLOW_MAP;
}

export function validateWorkflowMap(map: WorkflowMap): readonly string[] {
  const errors: string[] = [];
  const stepIds = new Set(map.steps.map((step) => step.id));

  if (map.schemaVersion !== "boulder.workflow-map.v1") errors.push("schemaVersion");
  if (map.id !== "primary-workflow") errors.push("id");
  if (map.route.join(">") !== PRIMARY_ROUTE.join(">")) errors.push("route");

  for (const id of REQUIRED_STEP_IDS) {
    if (!stepIds.has(id)) errors.push(`missing-step:${id}`);
  }

  for (const step of map.steps) {
    for (const dependency of step.dependsOn) {
      if (!stepIds.has(dependency)) errors.push(`missing-dependency:${step.id}:${dependency}`);
    }
  }

  return errors;
}
