import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./fs";

export type ReplayRunProject = {
  readonly project: string;
  readonly repoUrl: string;
  readonly dryRunOnly: boolean;
  readonly officialDocsPath: string;
  readonly commands: readonly string[];
  readonly expectedArtifacts: readonly string[];
  readonly evidencePaths: readonly string[];
};

export type ReplayRunPlan = {
  readonly status: "ready" | "blocked";
  readonly projects: readonly ReplayRunProject[];
  readonly issues: readonly string[];
};

type ReplayManifest = {
  readonly project: string;
  readonly repoUrl: string;
  readonly officialDocsPath: string;
  readonly commands: readonly string[];
  readonly expectedArtifacts: readonly string[];
  readonly evidencePaths: readonly string[];
};

export async function buildReplayRunPlan(root: string, dryRunOnly = true): Promise<ReplayRunPlan> {
  if (!dryRunOnly) {
    return { status: "blocked", projects: [], issues: ["replay-run only supports --dry-run"] };
  }
  const replayRoot = join(root, "fixtures", "replay");
  if (!await exists(replayRoot)) {
    return { status: "blocked", projects: [], issues: ["missing fixtures/replay"] };
  }
  const projects = [];
  const issues = [];
  for (const project of (await readdir(replayRoot)).sort()) {
    const replayPath = join(replayRoot, project, "replay.json");
    const parsed = parseJsonObject(await safeRead(replayPath));
    if (!isReplayManifest(parsed)) {
      issues.push(`invalid fixtures/replay/${project}/replay.json`);
      continue;
    }
    projects.push({
      project: parsed.project,
      repoUrl: parsed.repoUrl,
      dryRunOnly: true,
      officialDocsPath: parsed.officialDocsPath,
      commands: parsed.commands,
      expectedArtifacts: parsed.expectedArtifacts,
      evidencePaths: parsed.evidencePaths
    });
  }
  return {
    status: issues.length ? "blocked" : "ready",
    projects,
    issues
  };
}

export function replayRunPlanToMarkdown(plan: ReplayRunPlan): string {
  return [
    "# Replay Run",
    "",
    `Status: ${plan.status}`,
    "",
    "This is a dry-run runbook. It does not execute commands, clone repositories, install packages, or mutate targets.",
    "",
    "## Projects",
    "",
    ...plan.projects.flatMap((project) => [
      `- ${project.project}: ${project.repoUrl}`,
      `  - official docs: ${project.officialDocsPath}`,
      ...project.commands.map((command) => `  - command: \`${command}\``),
      ...project.expectedArtifacts.map((artifact) => `  - expected artifact: ${artifact}`),
      ...project.evidencePaths.map((path) => `  - evidence: ${path}`)
    ]),
    "",
    "## Issues",
    "",
    ...plan.issues.map((issue) => `- ${issue}`),
    ""
  ].join("\n");
}

function isReplayManifest(value: unknown): value is ReplayManifest {
  if (!isObject(value)) return false;
  return typeof value["project"] === "string"
    && typeof value["repoUrl"] === "string"
    && typeof value["officialDocsPath"] === "string"
    && isStringArray(value["commands"])
    && isStringArray(value["expectedArtifacts"])
    && isStringArray(value["evidencePaths"]);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string");
}

function parseJsonObject(content: string): unknown {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function safeRead(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}
