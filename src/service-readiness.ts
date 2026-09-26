import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./fs";
import { validateHandoffFile } from "./handoff-validation";
import { evaluateProductReadiness } from "./product-readiness";
import { orderReadinessChecks } from "./readiness-registry";
import { fieldEvidenceCheck } from "./service-field-evidence";
import { evaluateReplayCheck } from "./replay-check";
import { evaluateServiceGates } from "./service-gates";

export type ServiceReadinessStatus = "ready" | "pilot-ready" | "blocked";

export type ServiceReadinessCheck = {
  readonly id: string;
  readonly status: "pass" | "fail";
  readonly evidence: string;
};

export type ServiceReadiness = {
  readonly status: ServiceReadinessStatus;
  readonly checks: readonly ServiceReadinessCheck[];
  readonly nextSteps: readonly string[];
};

type ContentRequirement = {
  readonly path: string;
  readonly contains: readonly string[];
  readonly excludes?: readonly string[];
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

export async function evaluateServiceReadiness(root: string): Promise<ServiceReadiness> {
  const serviceChecks = [
    await contentCheck(root, "service-loop", {
      path: "docs/SERVICE_LOOP.md",
      contains: ["install", "init", "inspect", "pipeline", "handoff", "verify", "export", "readiness", "replay", "support", "not hosted", "provider launch"]
    }),
    await contentCheck(root, "onboarding", {
      path: "docs/ONBOARDING.md",
      contains: ["--help", "init", "inspect", "pipeline", "export", "product-readiness", "Published Package Path", "Local Checkout Path", "quickstart", "onboard", "doctor", "service-readiness", "configured-unverified", "does not mutate"],
      excludes: ["pre-publish", "post-publish"]
    }),
    await officialDocsCoverageCheck(root),
    await replayManifestCheck(root),
    await handoffFixturesCheck(root),
    await evaluateServiceGates(root),
    await fieldEvidenceCheck(root),
    await contentCheck(root, "operating-metrics", {
      path: "docs/OPERATING_METRICS.md",
      contains: ["Activation", "Onboarding", "Replay", "Handoff", "official-docs-coverage", "Readiness pass rate", "Support intake", "numerator", "denominator", "source"]
    }),
    await supportRoutesCheck(root)
  ];
  const productReadiness = await evaluateProductReadiness(root);
  const productCheck: ServiceReadinessCheck = {
    id: "product-readiness",
    status: productReadiness.status === "ready" ? "pass" : "fail",
    evidence: productReadiness.status === "ready"
      ? "product-readiness ready"
      : `product-readiness ${productReadiness.status}`
  };
  const checks = [...serviceChecks, productCheck];
  const serviceReady = serviceChecks.every((item) => item.status === "pass");
  const status = serviceReady
    ? productReadiness.status === "ready" ? "ready" : "pilot-ready"
    : "blocked";
  return {
    status,
    checks: orderReadinessChecks("service-readiness", checks),
    nextSteps: nextStepsFor(status)
  };
}

export function serviceReadinessToMarkdown(readiness: ServiceReadiness): string {
  return [
    "# Service Readiness",
    "",
    `Status: ${readiness.status}`,
    "",
    "## Checks",
    "",
    ...readiness.checks.map((check) => `- ${check.id}: ${check.status} - ${check.evidence}`),
    "",
    "## Next Steps",
    "",
    ...readiness.nextSteps.map((step) => `- ${step}`),
    ""
  ].join("\n");
}

async function contentCheck(root: string, id: string, requirement: ContentRequirement): Promise<ServiceReadinessCheck> {
  const content = await safeRead(join(root, requirement.path));
  const missing = requirement.contains.filter((item) => !content.includes(item));
  const forbidden = requirement.excludes?.filter((item) => content.includes(item)) ?? [];
  return {
    id,
    status: content && missing.length === 0 && forbidden.length === 0 ? "pass" : "fail",
    evidence: content
      ? contentCheckEvidence(requirement.path, missing, forbidden)
      : `missing ${requirement.path}`
  };
}

function contentCheckEvidence(path: string, missing: readonly string[], forbidden: readonly string[]): string {
  if (missing.length) return `${path} missing terms: ${missing.join(", ")}`;
  if (forbidden.length) return `${path} forbidden terms: ${forbidden.join(", ")}`;
  return path;
}

async function officialDocsCoverageCheck(root: string): Promise<ServiceReadinessCheck> {
  const docs = await loadOfficialDocs(root);
  const invalid = docs.filter((item) => !isCompleteOfficialDocs(item.value));
  if (docs.length === 0) {
    return { id: "official-docs-coverage", status: "fail", evidence: "missing fixtures/replay/*/official-docs.json" };
  }
  return {
    id: "official-docs-coverage",
    status: invalid.length ? "fail" : "pass",
    evidence: invalid.length
      ? `invalid official docs: ${invalid.map((item) => item.path).join(", ")}`
      : docs.map((item) => item.path).join(", ")
  };
}

async function replayManifestCheck(root: string): Promise<ServiceReadinessCheck> {
  const replay = await evaluateReplayCheck(root);
  if (replay.projects.length === 0) {
    return { id: "external-replay", status: "fail", evidence: "missing fixtures/replay/*/replay.json" };
  }
  const failures = replay.projects.filter((item) => item.status === "fail");
  return {
    id: "external-replay",
    status: replay.status === "ready" ? "pass" : "fail",
    evidence: failures.length
      ? failures.map((item) => `${item.project}: ${item.issues.join(", ")}`).join("; ")
      : replay.projects.map((item) => item.replayPath).join(", ")
  };
}

async function handoffFixturesCheck(root: string): Promise<ServiceReadinessCheck> {
  const paths = ["fixtures/handoffs/low.json", "fixtures/handoffs/medium.json", "fixtures/handoffs/high.json"];
  const failures = [];
  for (const path of paths) {
    if (!await exists(join(root, path))) {
      failures.push(`missing ${path}`);
      continue;
    }
    const result = await validateHandoffFile(join(root, path));
    if (result.status === "fail") {
      failures.push(`${path}: ${result.issues.map((item) => item.path).join(", ")}`);
    }
  }
  return {
    id: "handoff-validation",
    status: failures.length ? "fail" : "pass",
    evidence: failures.length ? failures.join("; ") : paths.join(", ")
  };
}

async function supportRoutesCheck(root: string): Promise<ServiceReadinessCheck> {
  const paths = [
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml",
    ".github/ISSUE_TEMPLATE/ai_contribution.yml",
    ".github/ISSUE_TEMPLATE/documentation.yml",
    "docs/TRUST_SUPPORT_SECURITY.md"
  ];
  const missing = [];
  for (const path of paths) {
    if (!await exists(join(root, path))) missing.push(path);
  }
  return {
    id: "support-routes",
    status: missing.length ? "fail" : "pass",
    evidence: missing.length ? `missing ${missing.join(", ")}` : paths.join(", ")
  };
}

async function loadOfficialDocs(root: string): Promise<readonly { readonly path: string; readonly value: unknown }[]> {
  const paths = await findReplayFiles(root, "official-docs.json");
  const docs = [];
  for (const path of paths) {
    docs.push({ path, value: parseJsonObject(await safeRead(join(root, path))) });
  }
  return docs;
}

async function findReplayFiles(root: string, fileName: string): Promise<readonly string[]> {
  const replayRoot = join(root, "fixtures", "replay");
  if (!await exists(replayRoot)) return [];
  const projects = (await readdir(replayRoot)).sort();
  const paths = [];
  for (const project of projects) {
    const path = `fixtures/replay/${project}/${fileName}`;
    if (await exists(join(root, path))) {
      paths.push(path);
    }
  }
  return paths;
}

function isCompleteOfficialDocs(value: unknown): value is OfficialDocs {
  if (!isObject(value)) return false;
  return typeof value["project"] === "string"
    && typeof value["repoUrl"] === "string"
    && Array.isArray(value["docsUrls"])
    && value["docsUrls"].length > 0
    && typeof value["versionOrRef"] === "string"
    && Array.isArray(value["setupCommands"])
    && value["setupCommands"].length > 0
    && Array.isArray(value["testCommands"])
    && value["testCommands"].length > 0
    && typeof value["contributionPolicy"] === "string"
    && typeof value["securityPolicy"] === "string"
    && Array.isArray(value["constraints"])
    && typeof value["retrievedAt"] === "string";
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

function nextStepsFor(status: ServiceReadinessStatus): readonly string[] {
  if (status === "ready") {
    return ["Service workflow is ready; continue separating adoption claims from local evidence."];
  }
  if (status === "pilot-ready") {
    return ["Service pilot is ready; product-readiness must pass before claiming public service-ready."];
  }
  return ["Fill failed service evidence paths before claiming service pilot readiness."];
}

async function safeRead(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}
