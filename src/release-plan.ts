import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./fs";
import { buildPipelinePlan, validatePipelinePlan } from "./pipeline";

export type ReleaseCheck = {
  readonly id: string;
  readonly status: "pass" | "fail";
  readonly evidence: string;
};

export type ReleasePlan = {
  readonly version: string;
  readonly status: "ready" | "blocked";
  readonly checks: readonly ReleaseCheck[];
  readonly manualSteps: readonly string[];
};

export async function evaluateReleasePlan(root: string): Promise<ReleasePlan> {
  const version = await packageVersion(root);
  const checks = [
    await fileCheck(root, "package-json", "package.json"),
    await fileCheck(root, "readme", "README.md"),
    await fileCheck(root, "changelog", "CHANGELOG.md"),
    await fileCheck(root, "ci-workflow", ".github/workflows/ci.yml"),
    await fileCheck(root, "root-harness", "boulder.yaml"),
    await fileCheck(root, "operator-workflow-stack-doc", "docs/OPERATOR_WORKFLOW_STACK.md"),
    await workflowStackEvidenceCheck(root),
    await pipelinePlanningEvidenceCheck(root),
    await fileCheck(root, "application-evidence", "docs/APPLICATION_EVIDENCE.md"),
    await fileCheck(root, "scorecard-evidence", "docs/HARNESS_QUALITY_SCORECARD.md"),
    await fileCheck(root, "benchmark-evidence", "docs/BENCHMARK_FIXTURE_REPORT.md"),
    await versionCheck(root, version),
    await packageScriptCheck(root)
  ];
  return {
    version,
    status: checks.every((item) => item.status === "pass") ? "ready" : "blocked",
    checks,
    manualSteps: [
      "Run bun run ci.",
      `Create and push tag v${version}.`,
      "Create the GitHub release with verification notes.",
      "Publishing remains manual; npm publish is not automated by Boulder."
    ]
  };
}

async function pipelinePlanningEvidenceCheck(root: string): Promise<ReleaseCheck> {
  const docExists = await exists(join(root, "docs", "PIPELINE_PLANNING_SURFACE.md"));
  const issues = validatePipelinePlan(buildPipelinePlan("medium"));
  return {
    id: "pipeline-planning-evidence",
    status: docExists && issues.length === 0 ? "pass" : "fail",
    evidence: docExists && issues.length === 0
      ? "docs/PIPELINE_PLANNING_SURFACE.md exists and medium pipeline plan validates"
      : `pipeline planning evidence missing or invalid: ${[docExists ? "" : "docs/PIPELINE_PLANNING_SURFACE.md", ...issues.map((item) => item.id)].filter(Boolean).join(", ")}`
  };
}

export function releasePlanToMarkdown(plan: ReleasePlan): string {
  return [
    "# Release Plan",
    "",
    `Version: ${plan.version}`,
    `Status: ${plan.status}`,
    "",
    "## Checks",
    "",
    ...plan.checks.map((check) => `- ${check.id}: ${check.status} - ${check.evidence}`),
    "",
    "## Manual Steps",
    "",
    ...plan.manualSteps.map((step) => `- ${step}`),
    "",
    "## Scope Boundary",
    "",
    "Publishing remains manual. npm publish is not automated by this release plan.",
    ""
  ].join("\n");
}

async function packageVersion(root: string): Promise<string> {
  const parsed: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (isRecord(parsed) && typeof parsed.version === "string" && parsed.version.trim()) {
    return parsed.version;
  }
  return "0.0.0";
}

async function packageScriptCheck(root: string): Promise<ReleaseCheck> {
  const parsed: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const scripts = isRecord(parsed) ? parsed.scripts : null;
  if (isRecord(scripts)) {
    const required = ["ci", "smoke", "build", "pack:dry-run"] as const;
    const missing = required.filter((item) => typeof scripts[item] !== "string");
    return {
      id: "package-scripts",
      status: missing.length ? "fail" : "pass",
      evidence: missing.length ? `missing scripts: ${missing.join(", ")}` : "ci, smoke, build, and package dry-run scripts are configured"
    };
  }
  return {
    id: "package-scripts",
    status: "fail",
    evidence: "package scripts are missing"
  };
}

async function workflowStackEvidenceCheck(root: string): Promise<ReleaseCheck> {
  const manifest = await safeRead(join(root, "boulder.yaml"));
  const docs = await safeRead(join(root, "docs", "OPERATOR_WORKFLOW_STACK.md"));
  const required = ["superpowers", "gstack", "compound"];
  const missing = required.filter((item) => !manifest.toLowerCase().includes(item) || !docs.toLowerCase().includes(item));
  return {
    id: "operator-workflow-stack-evidence",
    status: missing.length ? "fail" : "pass",
    evidence: missing.length ? `missing ${missing.join(", ")} in boulder.yaml or docs/OPERATOR_WORKFLOW_STACK.md` : "Superpowers, GStack, and Compound appear in manifest and operator workflow stack docs"
  };
}

async function versionCheck(root: string, version: string): Promise<ReleaseCheck> {
  const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
  const readme = await readFile(join(root, "README.md"), "utf8");
  const missing = [
    changelog.includes(`## ${version}`) ? "" : "CHANGELOG.md",
    readme.includes(`v${version}`) ? "" : "README.md"
  ].filter((item) => item);
  return {
    id: "version-evidence",
    status: missing.length ? "fail" : "pass",
    evidence: missing.length ? `version marker missing from ${missing.join(", ")}` : `v${version} appears in release-facing docs`
  };
}

async function safeRead(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function fileCheck(root: string, id: string, relativePath: string): Promise<ReleaseCheck> {
  return {
    id,
    status: await exists(join(root, relativePath)) ? "pass" : "fail",
    evidence: relativePath
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
