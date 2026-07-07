import { exec } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect } from "bun:test";

export type CliResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export async function tempRepo(prefix = "boulder-cli-e2e-"): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix));
}

export async function removeTempRepo(root: string): Promise<void> {
  await rm(root, { force: true, recursive: true });
}

export async function write(root: string, path: string, content: string): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

export async function writeCustomExecutorManifest(root: string, planningMode = "local-only", executionMode = "approval-gated-send"): Promise<void> {
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
    `    mode: ${planningMode}`,
  "  execution:",
  "    preferred: custom-executor",
    `    mode: ${executionMode}`,
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

export async function sha256Hex(text: string): Promise<string> {
  return hexFromBuffer(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hexFromBuffer(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function hexFromBuffer(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

export function expectReviewRequired(result: CliResult): void {
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim()).toBe("ERROR handoff.review_required: Review the sanitized handoff packet before send.");
}

export function approvalCodeFromReview(output: string): string {
  const line = output.split("\n").find((item) => item.startsWith("- approval-code: "));
  return line?.replace("- approval-code: ", "").trim() ?? "";
}

export function expectPacketPathInvalid(result: CliResult): void {
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim()).toBe("ERROR handoff.packet_path_invalid: Handoff packet path must stay under .boulder/handoffs.");
}

export function validHandoffPacket(adapter: string): unknown {
  return {
    schemaVersion: "boulder.handoff.v1",
    destination: { adapter, external: true },
    dataPolicy: {
      classification: "internal",
      rawWorkspaceContentIncluded: false,
      approvalRequired: true,
      redaction: { status: "applied", method: "summary-only" }
    },
    task: { objective: "summary only", acceptanceCriteria: ["No side effects."] },
    contextSummary: { repoName: "fixture", detectedFiles: [], relevantFacts: [] },
    excludedContent: ["raw workspace file bodies"]
  };
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
