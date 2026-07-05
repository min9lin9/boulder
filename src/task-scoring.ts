export type BootstrapProfileId =
  | "programming-heavy"
  | "research-corpus"
  | "release-safe"
  | "issue-triage"
  | "docs-reviewer";

export type CapabilityDimension = "subagents" | "skills" | "mcpServers" | "rag" | "db";

export type ProfileScore = {
  readonly profileId: BootstrapProfileId;
  readonly score: number;
  readonly matchedSignals: readonly string[];
};

export type CapabilityScore = {
  readonly dimension: CapabilityDimension;
  readonly score: number;
  readonly matchedSignals: readonly string[];
};

type SignalRule = {
  readonly profileId: BootstrapProfileId;
  readonly signal: string;
  readonly weight: number;
  readonly tokens: readonly string[];
};

const PROFILE_ORDER: readonly BootstrapProfileId[] = [
  "programming-heavy",
  "research-corpus",
  "release-safe",
  "issue-triage",
  "docs-reviewer"
];

const CAPABILITY_ORDER: readonly CapabilityDimension[] = ["db", "mcpServers", "rag", "skills", "subagents"];

const PROFILE_SIGNALS: readonly SignalRule[] = [
  { profileId: "programming-heavy", signal: "programming", weight: 35, tokens: ["programming", "coding", "code"] },
  { profileId: "programming-heavy", signal: "feature", weight: 35, tokens: ["feature"] },
  { profileId: "programming-heavy", signal: "tests", weight: 30, tokens: ["test", "tests", "testing"] },
  { profileId: "programming-heavy", signal: "build", weight: 25, tokens: ["build", "implement"] },
  { profileId: "research-corpus", signal: "research", weight: 40, tokens: ["research"] },
  { profileId: "research-corpus", signal: "official docs", weight: 35, tokens: ["official docs", "official documentation"] },
  { profileId: "research-corpus", signal: "corpus", weight: 35, tokens: ["corpus", "private corpus"] },
  { profileId: "research-corpus", signal: "citation", weight: 30, tokens: ["citation", "citations", "source", "sources"] },
  { profileId: "release-safe", signal: "release", weight: 35, tokens: ["release"] },
  { profileId: "release-safe", signal: "publish", weight: 35, tokens: ["publish", "publishing"] },
  { profileId: "release-safe", signal: "npm", weight: 30, tokens: ["npm", "package"] },
  { profileId: "release-safe", signal: "ci", weight: 25, tokens: ["ci"] },
  { profileId: "release-safe", signal: "rollback", weight: 25, tokens: ["rollback"] },
  { profileId: "release-safe", signal: "tag", weight: 20, tokens: ["tag", "tags"] },
  { profileId: "issue-triage", signal: "issue", weight: 35, tokens: ["issue", "issues"] },
  { profileId: "issue-triage", signal: "triage", weight: 35, tokens: ["triage"] },
  { profileId: "issue-triage", signal: "support", weight: 30, tokens: ["support", "bug report", "label"] },
  { profileId: "docs-reviewer", signal: "docs", weight: 35, tokens: ["docs", "documentation"] },
  { profileId: "docs-reviewer", signal: "README", weight: 35, tokens: ["readme"] },
  { profileId: "docs-reviewer", signal: "onboarding", weight: 30, tokens: ["onboarding", "quickstart"] },
  { profileId: "docs-reviewer", signal: "release notes", weight: 45, tokens: ["release notes", "changelog"] }
];

const CAPABILITY_SIGNALS: Record<CapabilityDimension, readonly string[]> = {
  subagents: ["subagent", "subagents", "agent", "review", "sre", "writer", "planner"],
  skills: ["skill", "skills", "programming", "test", "tests", "testing", "feature", "build", "release", "docs", "research", "review"],
  mcpServers: ["mcp", "github", "lsp", "codegraph", "context", "server"],
  rag: ["rag", "official docs", "corpus", "citation", "source", "sources", "readme", "docs", "changelog", "ci logs"],
  db: ["db", "database", "ledger", "evidence", "citations", "decision log", "history"]
};

export function normalizeTaskText(task: string | null): string | null {
  const normalized = (task ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return normalized || null;
}

export function scoreProfiles(task: string | null): readonly ProfileScore[] {
  const normalized = normalizeForMatching(task);
  const scores = rawProfileScores(normalized);
  const hasMatch = scores.some((score) => score.score > 0);
  const fallback = hasMatch ? scores : scores.map((score) => (
    score.profileId === "programming-heavy"
      ? { ...score, score: 25, matchedSignals: ["default-programming-workflow"] }
      : score
  ));
  return [...fallback].sort(compareProfileScore);
}

export function profileIdForTask(task: string | null): BootstrapProfileId | null {
  const clean = normalizeTaskText(task);
  if (!clean) return null;
  if (clean === "ops" || clean === "operations") return null;
  const topScore = [...rawProfileScores(normalizeForMatching(clean))].sort(compareProfileScore)[0];
  return topScore.score > 0 ? topScore.profileId : null;
}

export function scoreCapabilities(task: string | null, selected: {
  readonly subagents: readonly string[];
  readonly capabilityPlan: {
    readonly skills: readonly string[];
    readonly mcpServers: readonly string[];
    readonly rag: readonly string[];
    readonly db: readonly string[];
  };
}): readonly CapabilityScore[] {
  const normalized = normalizeForMatching(task);
  const values: readonly CapabilityScore[] = CAPABILITY_ORDER.map((dimension) => {
    const planned = plannedCapabilityCount(dimension, selected);
    const matchedSignals = CAPABILITY_SIGNALS[dimension].filter((token) => hasToken(normalized, token));
    const score = clampScore((planned > 0 ? 25 : 0) + Math.min(75, matchedSignals.length * 25));
    return {
      dimension,
      score,
      matchedSignals: score > 0 && matchedSignals.length === 0 ? ["profile-capability-present"] : matchedSignals
    };
  });
  return [...values].sort(compareCapabilityScore);
}

function profileScore(profileId: BootstrapProfileId, normalized: string): ProfileScore {
  const matches = PROFILE_SIGNALS
    .filter((rule) => rule.profileId === profileId && rule.tokens.some((token) => hasToken(normalized, token)));
  return {
    profileId,
    score: clampScore(matches.reduce((total, rule) => total + rule.weight, 0)),
    matchedSignals: matches.map((rule) => rule.signal)
  };
}

function rawProfileScores(normalized: string): readonly ProfileScore[] {
  return PROFILE_ORDER.map((profileId) => profileScore(profileId, normalized));
}

function plannedCapabilityCount(dimension: CapabilityDimension, selected: Parameters<typeof scoreCapabilities>[1]): number {
  if (dimension === "subagents") return selected.subagents.length;
  return selected.capabilityPlan[dimension].length;
}

function compareProfileScore(left: ProfileScore, right: ProfileScore): number {
  return right.score - left.score || PROFILE_ORDER.indexOf(left.profileId) - PROFILE_ORDER.indexOf(right.profileId);
}

function compareCapabilityScore(left: CapabilityScore, right: CapabilityScore): number {
  return right.score - left.score || CAPABILITY_ORDER.indexOf(left.dimension) - CAPABILITY_ORDER.indexOf(right.dimension);
}

function normalizeForMatching(task: string | null): string {
  return ` ${(normalizeTaskText(task) ?? "").toLowerCase().replace(/[^a-z0-9+#.-]+/g, " ")} `;
}

function hasToken(normalized: string, token: string): boolean {
  const normalizedToken = token.toLowerCase().replace(/[^a-z0-9+#.-]+/g, " ").trim();
  return normalizedToken.length > 0 && normalized.includes(` ${normalizedToken} `);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
