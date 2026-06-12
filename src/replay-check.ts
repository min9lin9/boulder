import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./fs";

export type ReplayCheckStatus = "ready" | "blocked";

export type ReplayProjectStatus = "pass" | "fail";

export type ReplayProjectReport = {
  readonly project: string;
  readonly status: ReplayProjectStatus;
  readonly replayPath: string;
  readonly officialDocsPath: string;
  readonly issues: readonly string[];
};

export type ReplayCheckReport = {
  readonly status: ReplayCheckStatus;
  readonly projects: readonly ReplayProjectReport[];
  readonly policy: readonly string[];
};

type ReplayManifest = {
  readonly project: string;
  readonly repoUrl: string;
  readonly ref: string;
  readonly officialDocsPath: string;
  readonly commands: readonly string[];
  readonly expectedArtifacts: readonly string[];
  readonly evidencePaths: readonly string[];
  readonly limitations: readonly string[];
};

type OfficialDocs = {
  readonly project: string;
  readonly repoUrl: string;
  readonly docsUrls: readonly string[];
  readonly versionOrRef: string;
  readonly setupCommands: readonly string[];
  readonly testCommands: readonly string[];
  readonly contributionPolicy: string;
  readonly securityPolicy: string;
  readonly constraints: readonly string[];
  readonly retrievedAt: string;
};

export async function evaluateReplayCheck(root: string): Promise<ReplayCheckReport> {
  const replayRoot = join(root, "fixtures", "replay");
  if (!await exists(replayRoot)) {
    return {
      status: "blocked",
      projects: [],
      policy: replayPolicy()
    };
  }
  const projects = await readdir(replayRoot);
  const reports = [];
  for (const project of projects) {
    reports.push(await evaluateReplayProject(root, project));
  }
  return {
    status: reports.every((item) => item.status === "pass") ? "ready" : "blocked",
    projects: reports,
    policy: replayPolicy()
  };
}

export function replayCheckToMarkdown(report: ReplayCheckReport): string {
  return [
    "# Replay Check",
    "",
    `Status: ${report.status}`,
    "",
    "Policy: official-docs-first public OSS replay. Boulder checks fixtures only; it does not clone, install, publish, or mutate target repositories.",
    "",
    "## Projects",
    "",
    ...report.projects.flatMap((project) => [
      `- ${project.project}: ${project.status} - ${project.replayPath}`,
      ...project.issues.map((issue) => `  - issue: ${issue}`)
    ]),
    "",
    "## Policy",
    "",
    ...report.policy.map((item) => `- ${item}`),
    ""
  ].join("\n");
}

async function evaluateReplayProject(root: string, project: string): Promise<ReplayProjectReport> {
  const replayPath = `fixtures/replay/${project}/replay.json`;
  const parsedReplay = parseJsonObject(await safeRead(join(root, replayPath)));
  const replay = isReplayManifest(parsedReplay) ? parsedReplay : null;
  const officialDocsPath = replay?.officialDocsPath ?? `fixtures/replay/${project}/official-docs.json`;
  const parsedDocs = parseJsonObject(await safeRead(join(root, officialDocsPath)));
  const issues = [
    ...replay ? [] : [`invalid ${replayPath}`],
    ...isOfficialDocs(parsedDocs) ? [] : [`invalid ${officialDocsPath}`],
    ...replay ? await replayManifestIssues(root, replay) : []
  ];
  return {
    project: replay?.project ?? project,
    status: issues.length ? "fail" : "pass",
    replayPath,
    officialDocsPath,
    issues
  };
}

async function replayManifestIssues(root: string, replay: ReplayManifest): Promise<readonly string[]> {
  const issues = [];
  if (!replay.officialDocsPath.includes(`fixtures/replay/${replay.project}/official-docs.json`)) {
    issues.push("officialDocsPath must point at the project official-docs fixture");
  }
  if (replay.commands.length === 0) issues.push("commands must not be empty");
  if (!replay.commands.every((item) => item.includes("boulder") || item.includes("boulder-oss-cli"))) {
    issues.push("commands must use Boulder surfaces");
  }
  if (replay.expectedArtifacts.length === 0) issues.push("expectedArtifacts must not be empty");
  if (!replay.evidencePaths.every((item) => item.startsWith("docs/CASE_STUDIES/evidence/external-replay/"))) {
    issues.push("evidencePaths must stay under docs/CASE_STUDIES/evidence/external-replay/");
  }
  if (replay.limitations.length === 0) issues.push("limitations must not be empty");
  for (const path of replay.evidencePaths) {
    if (!await exists(join(root, path))) {
      issues.push(`missing evidence transcript: ${path}`);
    }
  }
  return issues;
}

function isReplayManifest(value: unknown): value is ReplayManifest {
  if (!isObject(value)) return false;
  return typeof value["project"] === "string"
    && typeof value["repoUrl"] === "string"
    && typeof value["ref"] === "string"
    && typeof value["officialDocsPath"] === "string"
    && isStringArray(value["commands"])
    && isStringArray(value["expectedArtifacts"])
    && isStringArray(value["evidencePaths"])
    && isStringArray(value["limitations"]);
}

function isOfficialDocs(value: unknown): value is OfficialDocs {
  if (!isObject(value)) return false;
  return typeof value["project"] === "string"
    && typeof value["repoUrl"] === "string"
    && isStringArray(value["docsUrls"])
    && typeof value["versionOrRef"] === "string"
    && isStringArray(value["setupCommands"])
    && isStringArray(value["testCommands"])
    && typeof value["contributionPolicy"] === "string"
    && typeof value["securityPolicy"] === "string"
    && isStringArray(value["constraints"])
    && typeof value["retrievedAt"] === "string";
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

function replayPolicy(): readonly string[] {
  return [
    "Read target official docs before command recommendations.",
    "Use public repositories and share-safe evidence only.",
    "Do not install agents, launch providers, publish packages, or mutate upstream repositories during fixture checks."
  ];
}

async function safeRead(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}
