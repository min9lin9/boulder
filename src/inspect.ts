import { at, exists, readText } from "./fs";
import type { RepoInspection, VerificationCommand } from "./types";

export async function inspectRepo(root: string): Promise<RepoInspection> {
  const packageJson = await readJson(at(root, "package.json"));
  const pyproject = await readText(at(root, "pyproject.toml"));
  const readme = await exists(at(root, "README.md")) || await exists(at(root, "readme.md"));
  const tests = await existingDirs(root, ["test", "tests", "__tests__", "spec"]);
  const docs = await existingDirs(root, ["docs", "doc", "documentation"]);
  const ci = await existingPaths(root, [".github/workflows", ".gitlab-ci.yml", "bun.lock", "package-lock.json", "uv.lock"]);
  const name = stringField(packageJson, "name") ?? tomlScalar(pyproject, "name") ?? root.split(/[\\/]/).filter(Boolean).at(-1) ?? "repository";
  const likelyVerification = inferVerification(packageJson, pyproject, tests);
  const protectedPaths = inferProtectedPaths(root);
  return {
    root,
    name,
    detected: {
      readme,
      packageJson: Boolean(packageJson),
      pyproject: Boolean(pyproject),
      tests,
      docs,
      ci
    },
    likelyVerification,
    protectedPaths,
    recommendedWorkflows: [
      "issue-triage",
      "pr-review-prep",
      "release-planning",
      "verification-gate",
      "dependency-review"
    ],
    risks: inferRisks({ readme, packageJson: Boolean(packageJson), pyproject: Boolean(pyproject), tests, docs, ci, likelyVerification })
  };
}

export function inspectionToMarkdown(inspection: RepoInspection): string {
  const detected = inspection.detected;
  return [
    `# Boulder Repo Brief: ${inspection.name}`,
    "",
    "## Detected Surface",
    "",
    `- README: ${detected.readme ? "yes" : "no"}`,
    `- package.json: ${detected.packageJson ? "yes" : "no"}`,
    `- pyproject.toml: ${detected.pyproject ? "yes" : "no"}`,
    `- tests: ${detected.tests.length ? detected.tests.join(", ") : "none detected"}`,
    `- docs: ${detected.docs.length ? detected.docs.join(", ") : "none detected"}`,
    `- CI/config signals: ${detected.ci.length ? detected.ci.join(", ") : "none detected"}`,
    "",
    "## Likely Verification Commands",
    "",
    ...inspection.likelyVerification.map((item) => `- ${item.name}: \`${item.command}\`${item.required ? " (required)" : ""}`),
    "",
    "## Recommended Maintainer Workflows",
    "",
    ...inspection.recommendedWorkflows.map((item) => `- ${item}`),
    "",
    "## Protected Paths",
    "",
    ...inspection.protectedPaths.map((item) => `- ${item}`),
    "",
    "## Unresolved Risks",
    "",
    ...(inspection.risks.length ? inspection.risks.map((item) => `- ${item}`) : ["- none detected by shallow inspection"]),
    ""
  ].join("\n");
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  const text = await readText(path);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function existingDirs(root: string, names: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const name of names) {
    if (await exists(at(root, name))) {
      found.push(name);
    }
  }
  return found;
}

async function existingPaths(root: string, names: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const name of names) {
    if (await exists(at(root, name))) {
      found.push(name);
    }
  }
  return found;
}

function inferVerification(packageJson: Record<string, unknown> | null, pyproject: string | null, tests: string[]): VerificationCommand[] {
  const commands: VerificationCommand[] = [];
  const scripts = packageJson?.scripts;
  if (scripts && typeof scripts === "object") {
    for (const name of ["test", "typecheck", "lint", "build"]) {
      if (name in scripts) {
        commands.push({ name, command: `bun run ${name}`, required: name === "test" });
      }
    }
  }
  if (pyproject) {
    if (tests.length) commands.push({ name: "pytest", command: "pytest -q", required: true });
    commands.push({ name: "python-package-check", command: "python -m pip check", required: false });
  }
  if (!commands.length) {
    commands.push({ name: "manual-smoke", command: "echo 'No automated verification configured yet.'", required: false });
  }
  return commands;
}

function inferProtectedPaths(root: string): string[] {
  void root;
  return [
    ".env*",
    "secrets/**",
    "vendor/**",
    "node_modules/**",
    "dist/**",
    "coverage/**"
  ];
}

function inferRisks(input: {
  readme: boolean;
  packageJson: boolean;
  pyproject: boolean;
  tests: string[];
  docs: string[];
  ci: string[];
  likelyVerification: VerificationCommand[];
}): string[] {
  const risks: string[] = [];
  if (!input.readme) risks.push("No README detected; Codex context may be thin.");
  if (!input.packageJson && !input.pyproject) risks.push("No package metadata detected; repo type is unclear.");
  if (!input.tests.length) risks.push("No test directory detected; verification may rely on manual smoke.");
  if (!input.docs.length) risks.push("No docs directory detected; maintainer workflow docs may need to be generated.");
  if (!input.ci.length) risks.push("No CI/config signals detected; release verification may be local-only.");
  if (!input.likelyVerification.some((item) => item.required)) risks.push("No required verification command inferred.");
  return risks;
}

function tomlScalar(text: string | null, key: string): string | null {
  if (!text) return null;
  return text.match(new RegExp(`^${key}\\s*=\\s*["']([^"']+)["']`, "m"))?.[1] ?? null;
}

function stringField(value: Record<string, unknown> | null, key: string): string | null {
  const field = value?.[key];
  return typeof field === "string" ? field : null;
}
