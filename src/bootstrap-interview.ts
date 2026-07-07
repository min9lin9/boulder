import {
  type CapabilityScore,
  type ProfileScore,
  normalizeTaskText,
  scoreCapabilities,
  scoreProfiles
} from "./task-scoring";

export type BootstrapInterviewReport = {
  readonly task: string | null;
  readonly recommendedProfile: string;
  readonly baseProfile: string;
  readonly profileRelationship: string;
  readonly basis: readonly string[];
  readonly questions: readonly string[];
  readonly selectedSubagents: readonly string[];
  readonly capabilityPlan: CapabilityPlan;
  readonly unsupportedCapabilityNotes: readonly UnsupportedCapabilityNote[];
  readonly profileScores: readonly ProfileScore[];
  readonly capabilityScores: readonly CapabilityScore[];
  readonly recommendationRationale: readonly string[];
  readonly commands: readonly string[];
  readonly guardrails: readonly string[];
};

export type CapabilityPlan = {
  readonly skills: readonly string[];
  readonly mcpServers: readonly string[];
  readonly rag: readonly string[];
  readonly db: readonly string[];
};

export type UnsupportedCapabilityNote = {
  readonly dimension: "rag" | "db";
  readonly candidates: readonly string[];
  readonly note: string;
};

type BootstrapProfile = {
  readonly id: string;
  readonly base: string;
  readonly subagents: readonly string[];
  readonly capabilityPlan: CapabilityPlan;
};

const PROFILES: readonly BootstrapProfile[] = [
  {
    id: "programming-heavy",
    base: "programming-default",
    subagents: ["Codebase Onboarding Engineer", "Software Architect", "Code Reviewer", "Minimal Change Engineer"],
    capabilityPlan: {
      skills: ["omo:ulw-plan", "omo:programming", "omo:lsp", "omo:review-work"],
      mcpServers: ["codegraph", "lsp"],
      rag: ["repo docs", "official library docs"],
      db: ["field evidence ledger"]
    }
  },
  {
    id: "research-corpus",
    base: "research-default",
    subagents: ["Research Analyst", "Evidence Collector", "Technical Writer"],
    capabilityPlan: {
      skills: ["omo:ulw-research", "doc"],
      mcpServers: ["context-mode", "web search"],
      rag: ["official docs", "private corpus", "source snapshots"],
      db: ["citation ledger"]
    }
  },
  {
    id: "release-safe",
    base: "ops-default",
    subagents: ["SRE", "Git Workflow Master", "Code Reviewer", "Technical Writer"],
    capabilityPlan: {
      skills: ["omo:ulw-plan", "omo:review-work", "boulder"],
      mcpServers: ["github"],
      rag: ["release evidence docs", "changelog", "CI logs"],
      db: ["field evidence ledger"]
    }
  },
  {
    id: "issue-triage",
    base: "ops-default",
    subagents: ["Senior Project Manager", "Reality Checker", "Technical Writer"],
    capabilityPlan: {
      skills: ["omo:ulw-plan", "github:github"],
      mcpServers: ["github"],
      rag: ["issue history", "contribution docs"],
      db: ["issue decision ledger"]
    }
  },
  {
    id: "docs-reviewer",
    base: "research-default",
    subagents: ["Technical Writer", "Codebase Onboarding Engineer", "Evidence Collector"],
    capabilityPlan: {
      skills: ["doc", "humanize-korean", "omo:review-work"],
      mcpServers: ["context-mode"],
      rag: ["README", "docs", "examples"],
      db: ["docs review ledger"]
    }
  }
];

export function buildBootstrapInterview(task: string | null): BootstrapInterviewReport {
  const cleanTask = normalizeTaskText(task);
  const profileScores = scoreProfiles(cleanTask);
  const profile = profileById(profileScores[0].profileId);
  const capabilityScores = scoreCapabilities(cleanTask, profile);
  return {
    task: cleanTask,
    recommendedProfile: profile.id,
    baseProfile: profile.base,
    profileRelationship: `${profile.id} is a task-category profile built on ${profile.base}. Use the recommended profile for repeated work; use the base profile when you want the broader default lane policy.`,
    basis: [
      "hierarchical-task-analysis",
      "cognitive-task-analysis",
      "react-tool-use",
      "retrieval-augmented-generation",
      "balanced-team-roles"
    ],
    questions: [
      "What repeated work should this repository optimize for?",
      "What evidence proves the work is complete?",
      "Which tools are allowed to run automatically, and which require approval?",
      "Which subagents should be available only for this project?",
      "Which skills, MCP servers, RAG sources, or DB ledgers must be configured?"
    ],
    selectedSubagents: profile.subagents,
    capabilityPlan: profile.capabilityPlan,
    unsupportedCapabilityNotes: unsupportedCapabilityNotes(profile.capabilityPlan),
    profileScores,
    capabilityScores,
    recommendationRationale: recommendationRationale(profileScores, capabilityScores),
    commands: [
      `boulder profile use ${profile.id} --cwd .`,
      "boulder capability import --from https://github.com/Yeachan-Heo/gajae-code --dry-run --cwd .",
      "boulder capability import --from https://github.com/code-yeongyu/lazycodex --dry-run --cwd .",
      "boulder capability import --from https://github.com/msitarzewski/agency-agents --dry-run --cwd .",
      "boulder quickstart --cwd .",
      "boulder doctor --cwd ."
    ],
    guardrails: [
      "This interview does not install subagents.",
      "Import agency-agents as a catalog first, then recommend only the selected profile subset until a separate install flow is approved.",
      "Live GJC, LazyCodex, and external model calls remain approval-gated."
    ]
  };
}

export function bootstrapInterviewToMarkdown(report: BootstrapInterviewReport): string {
  return [
    "# Boulder Bootstrap Interview",
    "",
    `Task: ${report.task ?? "not provided"}`,
    `Recommended profile: ${report.recommendedProfile}`,
    `Base profile: ${report.baseProfile}`,
    `Basis: ${report.basis.join(", ")}`,
    "",
    "## Questions",
    "",
    ...report.questions.map((item) => `- ${item}`),
    "",
    "## Selected Subagents",
    "",
    ...report.selectedSubagents.map((item) => `- ${item}`),
    "",
    "## Capability Plan",
    "",
    `- skills: ${report.capabilityPlan.skills.join(", ")}`,
    `- mcpServers: ${report.capabilityPlan.mcpServers.join(", ")}`,
    `- rag: ${report.capabilityPlan.rag.join(", ")}`,
    `- db: ${report.capabilityPlan.db.join(", ")}`,
    "",
    "## Profile Relationship",
    "",
    report.profileRelationship,
    "",
    "## Unsupported Capability Notes",
    "",
    ...report.unsupportedCapabilityNotes.map((item) => `- ${item.dimension}: ${item.candidates.join(", ")} - ${item.note}`),
    "",
    "## Scores",
    "",
    "### Profiles",
    "",
    ...report.profileScores.map((item) => `- ${item.profileId}: ${item.score} (signals: ${formatSignals(item.matchedSignals)})`),
    "",
    "### Capabilities",
    "",
    ...report.capabilityScores.map((item) => `- ${item.dimension}: ${item.score} (signals: ${formatSignals(item.matchedSignals)})`),
    "",
    "## Rationale",
    "",
    ...report.recommendationRationale.map((item) => `- ${item}`),
    "",
    "## Commands",
    "",
    ...report.commands.map((item) => `- \`${item}\``),
    "",
    "## Guardrails",
    "",
    ...report.guardrails.map((item) => `- ${item}`),
    ""
  ].join("\n");
}

function unsupportedCapabilityNotes(plan: CapabilityPlan): readonly UnsupportedCapabilityNote[] {
  const notes: UnsupportedCapabilityNote[] = [];
  if (plan.rag.length) {
    notes.push({
      dimension: "rag",
      candidates: plan.rag,
      note: "Candidate only; Boulder can record and report this grounding need, but it does not index corpora or fetch sources from this report."
    });
  }
  if (plan.db.length) {
    notes.push({
      dimension: "db",
      candidates: plan.db,
      note: "Candidate only; Boulder can name the ledger need, but it does not provision DBs or durable stores from this report."
    });
  }
  return notes;
}

function recommendationRationale(
  profileScores: readonly ProfileScore[],
  capabilityScores: readonly CapabilityScore[]
): readonly string[] {
  const selected = profileScores[0];
  const runnerUp = profileScores[1];
  const topCapability = capabilityScores[0];
  return [
    `Selected ${selected.profileId} because task signals matched: ${formatSignals(selected.matchedSignals)}.`,
    `Runner-up ${runnerUp.profileId} scored ${runnerUp.score}; it matched: ${formatSignals(runnerUp.matchedSignals)}.`,
    `Capability emphasis: ${topCapability.dimension} scored ${topCapability.score} from ${formatSignals(topCapability.matchedSignals)}.`,
    "Next action: review the Commands section; each setup command is separate and approval-gated.",
    "Capability recommendations are candidate only; doctor verifies local availability before use.",
    "No install, config write, corpus indexing, database creation, or external model call is performed by this report."
  ];
}

function formatSignals(signals: readonly string[]): string {
  return signals.length ? signals.join(", ") : "none";
}

function profileById(id: string): BootstrapProfile {
  const profile = PROFILES.find((item) => item.id === id);
  if (!profile) throw new Error(`Missing bootstrap profile: ${id}`);
  return profile;
}
