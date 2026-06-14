import { at, readText, writeText } from "./fs";
import { defaultExecutors, executorsFromText } from "./executors";
import type { BoulderManifest, RepoInspection, VerificationCommand, WorkflowStackComponent } from "./types";
import { defaultWorkflowStack } from "./workflow-stack";

export const MANIFEST_FILE = "boulder.yaml";

export function defaultManifest(name = "oss-repository"): BoulderManifest {
  return {
    name,
    description: "Codex-ready OSS maintainer harness.",
    maintainers: ["min9lin9"],
    workflowStack: defaultWorkflowStack(),
    workflows: [
      "issue-triage",
      "pr-review-prep",
      "release-planning",
      "dependency-review"
    ],
    protectedPaths: [
      ".env*",
      "secrets/**",
      "vendor/**",
      "node_modules/**",
      "dist/**"
    ],
    verification: [
      { name: "test", command: "bun test", required: false },
      { name: "typecheck", command: "bunx tsc --noEmit", required: false }
    ],
    providers: {
      default: "codex",
      externalAllowed: false,
      approvalRequired: true
    },
    executors: defaultExecutors(),
    export: {
      markdown: true,
      codexNotes: true
    }
  };
}

export function manifestToYaml(manifest: BoulderManifest): string {
  return [
    `name: ${manifest.name}`,
    `description: ${manifest.description}`,
    "maintainers:",
    ...manifest.maintainers.map((item) => `  - ${item}`),
    "workflowStack:",
    ...manifest.workflowStack.flatMap((item) => [
      `  - name: ${item.name}`,
      `    role: ${item.role}`,
      `    required: ${item.required ? "true" : "false"}`,
      `    description: ${item.description}`
    ]),
    "workflows:",
    ...manifest.workflows.map((item) => `  - ${item}`),
    "protectedPaths:",
    ...manifest.protectedPaths.map((item) => `  - ${item}`),
    "verification:",
    ...manifest.verification.flatMap((item) => [
      `  - name: ${item.name}`,
      `    command: ${item.command}`,
      `    required: ${item.required ? "true" : "false"}`
    ]),
    "providers:",
    `  default: ${manifest.providers.default}`,
    `  externalAllowed: ${manifest.providers.externalAllowed ? "true" : "false"}`,
    `  approvalRequired: ${manifest.providers.approvalRequired ? "true" : "false"}`,
    "executors:",
    "  planning:",
    `    preferred: ${manifest.executors.planning.preferred}`,
    `    mode: ${manifest.executors.planning.mode}`,
    "  execution:",
    `    preferred: ${manifest.executors.execution.preferred}`,
    `    mode: ${manifest.executors.execution.mode}`,
    "  fallback:",
    `    planning: ${manifest.executors.fallback.planning}`,
    `    execution: ${manifest.executors.fallback.execution}`,
    "export:",
    `  markdown: ${manifest.export.markdown ? "true" : "false"}`,
    `  codexNotes: ${manifest.export.codexNotes ? "true" : "false"}`,
    ""
  ].join("\n");
}

export async function writeDefaultManifest(root: string, force = false): Promise<"created" | "skipped"> {
  const name = root.split(/[\\/]/).filter(Boolean).at(-1) ?? "oss-repository";
  return await writeText(at(root, MANIFEST_FILE), manifestToYaml(defaultManifest(name)), force);
}

export async function writeManifest(root: string, manifest: BoulderManifest, force = false): Promise<"created" | "skipped"> {
  return await writeText(at(root, MANIFEST_FILE), manifestToYaml(manifest), force);
}

export function manifestFromInspection(inspection: RepoInspection): BoulderManifest {
  const manifest = defaultManifest(inspection.name);
  return {
    ...manifest,
    description: `Codex-ready OSS maintainer harness for ${inspection.name}.`,
    workflows: inspection.recommendedWorkflows,
    protectedPaths: inspection.protectedPaths,
    verification: inspection.likelyVerification
  };
}

export async function loadManifest(root: string): Promise<BoulderManifest> {
  const text = await readText(at(root, MANIFEST_FILE));
  if (!text) {
    return defaultManifest(root.split(/[\\/]/).filter(Boolean).at(-1));
  }
  const defaults = defaultManifest();
  return {
    ...defaults,
    name: scalar(text, "name") ?? defaults.name,
    description: scalar(text, "description") ?? defaults.description,
    maintainers: list(text, "maintainers") ?? defaults.maintainers,
    workflowStack: workflowStackList(text) ?? [],
    workflows: list(text, "workflows") ?? defaults.workflows,
    protectedPaths: list(text, "protectedPaths") ?? defaults.protectedPaths,
    verification: verificationList(text) ?? defaults.verification,
    providers: {
      default: nestedScalar(text, "providers", "default") ?? "codex",
      externalAllowed: bool(nestedScalar(text, "providers", "externalAllowed")) ?? false,
      approvalRequired: bool(nestedScalar(text, "providers", "approvalRequired")) ?? true
    },
    executors: executorsFromText(text, defaults.executors),
    export: {
      markdown: bool(nestedScalar(text, "export", "markdown")) ?? true,
      codexNotes: bool(nestedScalar(text, "export", "codexNotes")) ?? true
    }
  };
}

function scalar(text: string, key: string): string | null {
  const match = text.match(new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function nestedScalar(text: string, section: string, key: string): string | null {
  const lines = sectionLines(text, section);
  const match = lines.join("\n").match(new RegExp(`^\\s{2}${escapeRegExp(key)}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function list(text: string, key: string): string[] | null {
  const lines = sectionLines(text, key);
  const values = lines
    .map((line) => line.match(/^\s{2}-\s+(.+)$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
  return values.length ? values : null;
}

function workflowStackList(text: string): WorkflowStackComponent[] | null {
  const lines = sectionLines(text, "workflowStack");
  const items: WorkflowStackComponent[] = [];
  let current: Partial<WorkflowStackComponent> | null = null;

  for (const line of lines) {
    const name = line.match(/^\s{2}-\s+name:\s*(.+)$/)?.[1]?.trim();
    if (name) {
      pushWorkflowStackItem(items, current);
      current = { name, required: true };
      continue;
    }
    if (!current) continue;
    const role = line.match(/^\s{4}role:\s*(.+)$/)?.[1]?.trim();
    const required = line.match(/^\s{4}required:\s*(.+)$/)?.[1]?.trim();
    const description = line.match(/^\s{4}description:\s*(.+)$/)?.[1]?.trim();
    if (role) current.role = role;
    if (required) current.required = bool(required) ?? false;
    if (description) current.description = description;
  }

  pushWorkflowStackItem(items, current);
  return items.length ? items : null;
}

function pushWorkflowStackItem(items: WorkflowStackComponent[], current: Partial<WorkflowStackComponent> | null): void {
  if (current?.name && current.role) {
    items.push({
      name: current.name,
      role: current.role,
      required: current.required ?? true,
      description: current.description ?? ""
    });
  }
}

function verificationList(text: string): VerificationCommand[] | null {
  const lines = sectionLines(text, "verification");
  const items: VerificationCommand[] = [];
  let current: Partial<VerificationCommand> | null = null;
  for (const line of lines) {
    const name = line.match(/^\s{2}-\s+name:\s*(.+)$/)?.[1]?.trim();
    if (name) {
      if (current?.name && current.command) {
        items.push({ name: current.name, command: current.command, required: current.required });
      }
      current = { name };
      continue;
    }
    const command = line.match(/^\s{4}command:\s*(.+)$/)?.[1]?.trim();
    if (command && current) current.command = command;
    const required = line.match(/^\s{4}required:\s*(.+)$/)?.[1]?.trim();
    if (required && current) current.required = bool(required) ?? false;
  }
  if (current?.name && current.command) {
    items.push({ name: current.name, command: current.command, required: current.required });
  }
  return items.length ? items : null;
}

function sectionLines(text: string, section: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === `${section}:`);
  if (start === -1) return [];
  const result: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && line.includes(":")) break;
    result.push(line);
  }
  return result;
}

function bool(value: string | null | undefined): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
