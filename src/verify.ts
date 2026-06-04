import { exec } from "node:child_process";
import { loadManifest } from "./manifest";
import type { VerifyResult } from "./types";
import { formatManifestIssues, hasManifestErrors, validateManifest } from "./validation";

export async function verifyHarness(root: string, dryRun: boolean): Promise<VerifyResult[]> {
  const manifest = await loadManifest(root);
  const issues = validateManifest(manifest);
  if (hasManifestErrors(issues)) {
    throw new Error(formatManifestIssues(issues));
  }
  const results: VerifyResult[] = [];
  for (const item of manifest.verification) {
    if (dryRun) {
      results.push({
        name: item.name,
        command: item.command,
        required: Boolean(item.required),
        status: "planned"
      });
      continue;
    }
    try {
      const result = await execCommand(item.command, root);
      results.push({
        name: item.name,
        command: item.command,
        required: Boolean(item.required),
        status: "passed",
        output: summarize(`${result.stdout}\n${result.stderr}`)
      });
    } catch (error) {
      const output = error instanceof Error ? error.message : String(error);
      results.push({
        name: item.name,
        command: item.command,
        required: Boolean(item.required),
        status: "failed",
        output: summarize(output)
      });
    }
  }
  return results;
}

export function verifyResultsToMarkdown(results: VerifyResult[]): string {
  return [
    "# Boulder Verification Report",
    "",
    ...results.flatMap((item) => [
      `## ${item.name}`,
      "",
      `- command: \`${item.command}\``,
      `- required: ${item.required ? "yes" : "no"}`,
      `- status: ${item.status}`,
      item.output ? `- output: ${item.output}` : "- output: not captured",
      ""
    ]),
    "## Unresolved Risks",
    "",
    ...riskLines(results),
    ""
  ].join("\n");
}

function riskLines(results: VerifyResult[]): string[] {
  const failed = results.filter((item) => item.status === "failed");
  if (!failed.length) return ["- none from configured verification commands"];
  return failed.map((item) => `- ${item.name} failed; inspect command output before claiming completion.`);
}

function summarize(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500) || "no output";
}

function execCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}\n${stdout}\n${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
