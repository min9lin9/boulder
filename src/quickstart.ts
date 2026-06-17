import { join } from "node:path";
import { exists } from "./fs";
import { resolveWorkflowProfile } from "./workflow-profiles";

export type QuickstartStep = {
  readonly id: string;
  readonly command: string;
  readonly purpose: string;
};

export type QuickstartCheck = {
  readonly id: string;
  readonly status: "pass" | "fail";
  readonly evidence: string;
};

export type QuickstartReport = {
  readonly status: "ready" | "needs-init";
  readonly checks: readonly QuickstartCheck[];
  readonly steps: readonly QuickstartStep[];
  readonly nextDocs: readonly string[];
};

const QUICKSTART_STEPS = [
  {
    id: "inspect",
    command: "boulder inspect --cwd . --json",
    purpose: "Read the repository shape before planning."
  },
  {
    id: "profile-list",
    command: "boulder profile list --cwd .",
    purpose: "See the available workflow profiles before routing work."
  },
  {
    id: "profile-resolve",
    command: "boulder profile resolve --cwd .",
    purpose: "Confirm the active plan/execute adapters and external-call policy."
  },
  {
    id: "profile-use",
    command: "boulder profile use programming-default --cwd .",
    purpose: "Select the default programming profile, or swap it for research-default or ops-default."
  },
  {
    id: "pipeline",
    command: "boulder pipeline --cwd . --friction medium",
    purpose: "Choose the default classification -> plan -> verify path."
  },
  {
    id: "service-readiness",
    command: "boulder service-readiness --cwd . --json",
    purpose: "See whether repeatable service evidence is already present."
  },
  {
    id: "export",
    command: "boulder export --cwd . --force",
    purpose: "Write shareable Codex workflow notes and handoff artifacts."
  }
] as const satisfies readonly QuickstartStep[];

export async function evaluateQuickstart(root: string): Promise<QuickstartReport> {
  const resolution = await resolveWorkflowProfile(root, {});
  const checks = [
    await fileCheck(root, "manifest", "boulder.yaml"),
    await fileCheck(root, "operator-contract", "BOULDER.md"),
    await fileCheck(root, "repo-brief", "docs/REPO_BRIEF.md"),
    profileCheck(resolution.profile.id, resolution.profile.source),
    executorCheck("executor-planning", "plan", resolution.profile.lanes.plan.adapter, resolution.profile.lanes.plan.mode),
    executorCheck("executor-execution", "execute", resolution.profile.lanes.execute.adapter, resolution.profile.lanes.execute.mode)
  ];
  return {
    status: checks.every((item) => item.status === "pass") ? "ready" : "needs-init",
    checks,
    steps: QUICKSTART_STEPS,
    nextDocs: [
      "docs/CONTRIBUTOR_START_HERE.md",
      "docs/ONBOARDING.md",
      "docs/COMMUNITY.md"
    ]
  };
}

export function quickstartToMarkdown(report: QuickstartReport): string {
  return [
    "# Boulder Quickstart",
    "",
    `Status: ${report.status}`,
    "",
    "This is the first-run guided flow for a maintainer opening Boulder in a repository.",
    "",
    "## Checks",
    "",
    ...report.checks.map((check) => `- ${check.id}: ${check.status} - ${check.evidence}`),
    "",
    "## Next Commands",
    "",
    ...report.steps.map((step) => `- \`${step.command}\` - ${step.purpose}`),
    "",
    "## Next Docs",
    "",
    ...report.nextDocs.map((path) => `- ${path}`),
    ""
  ].join("\n");
}

function profileCheck(profileId: string, source: string): QuickstartCheck {
  return {
    id: "active-profile",
    status: "pass",
    evidence: `${profileId} (${source})`
  };
}

function executorCheck(id: string, label: string, actual: string, mode: string): QuickstartCheck {
  return {
    id,
    status: "pass",
    evidence: `${label}=${actual} (${mode}; availability checked by doctor)`
  };
}

async function fileCheck(root: string, id: string, relativePath: string): Promise<QuickstartCheck> {
  return {
    id,
    status: await exists(join(root, relativePath)) ? "pass" : "fail",
    evidence: relativePath
  };
}
