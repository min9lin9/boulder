import { exec } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type CliResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export async function tempRepo(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "boulder-cli-e2e-"));
}

export async function removeTempRepo(root: string): Promise<void> {
  await rm(root, { force: true, recursive: true });
}

export async function write(root: string, path: string, content: string): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

export async function writeCustomExecutorManifest(root: string): Promise<void> {
  await write(root, "boulder.yaml", [
    "name: fixture",
    "description: custom executor profile",
    "maintainers:",
    "  - min9lin9",
    "workflowStack:",
    "  - name: superpowers",
    "    role: workflow-spine",
    "    required: true",
    "    description: workflow spine",
    "  - name: gstack",
    "    role: review-gate",
    "    required: true",
    "    description: review gates",
    "  - name: compound",
    "    role: learning-layer",
    "    required: true",
    "    description: learning layer",
    "workflows:",
    "  - issue-triage",
    "protectedPaths:",
    "  - .env*",
    "verification:",
    "  - name: smoke",
    "    command: bun test",
    "    required: true",
    "providers:",
    "  default: codex",
    "  externalAllowed: false",
    "  approvalRequired: true",
    "executors:",
    "  planning:",
    "    preferred: custom-planner",
    "    mode: detect-and-suggest",
    "  execution:",
    "    preferred: custom-executor",
    "    mode: detect-and-suggest",
    "  fallback:",
    "    planning: codex",
    "    execution: manual",
    "export:",
    "  markdown: true",
    "  codexNotes: true",
    ""
  ].join("\n"));
}

export async function runBoulder(args: readonly string[]): Promise<CliResult> {
  const root = join(import.meta.dir, "..", "..");
  return await runCommand(`bun bin/boulder.ts ${args.map(shellQuote).join(" ")}`, root);
}

export async function runCommand(command: string, cwd: string): Promise<CliResult> {
  return await new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error && !stdout && !stderr) {
        reject(error);
        return;
      }
      resolve({ exitCode: exitCodeFrom(error), stdout, stderr });
    });
  });
}

function exitCodeFrom(error: Error | null): number {
  if (!error) return 0;
  if ("code" in error && typeof error.code === "number") return error.code;
  return 1;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
