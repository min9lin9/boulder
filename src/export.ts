import { at, writeText } from "./fs";
import { inspectionToMarkdown, inspectRepo } from "./inspect";
import { loadManifest } from "./manifest";

export async function exportHarness(root: string, force = false): Promise<string[]> {
  const inspection = await inspectRepo(root);
  const manifest = await loadManifest(root);
  const writes = [
    [`docs/BOULDER_EXPORT.md`, await writeText(at(root, "docs", "BOULDER_EXPORT.md"), exportMarkdown(inspectionToMarkdown(inspection), manifest.workflows), force)] as const,
    [`docs/CODEX_WORKFLOW_NOTES.md`, await writeText(at(root, "docs", "CODEX_WORKFLOW_NOTES.md"), codexNotes(manifest.workflows), force)] as const
  ];
  return writes.map(([file, status]) => `${status}: ${file}`);
}

function exportMarkdown(repoBrief: string, workflows: string[]): string {
  return [
    "# Boulder Export",
    "",
    "This export packages repository context for Codex-ready OSS maintenance.",
    "",
    repoBrief,
    "",
    "## Workflow Map",
    "",
    ...workflows.map((item) => `- ${item}`),
    "",
    "## Evidence Rule",
    "",
    "Before claiming completion, attach command evidence, verification status, and unresolved risks.",
    ""
  ].join("\n");
}

function codexNotes(workflows: string[]): string {
  return [
    "# Codex Workflow Notes",
    "",
    "Use these notes when asking Codex to work on this repository.",
    "",
    "## Default Contract",
    "",
    "- Read `BOULDER.md` before write-capable work.",
    "- Ask for approval before external provider, network-heavy, or high-risk execution.",
    "- Prefer configured verification commands.",
    "- Report unresolved risks explicitly.",
    "",
    "## Suggested Subagent Roles",
    "",
    "- code-mapper",
    "- reviewer",
    "- security-auditor",
    "- documentation-engineer",
    "",
    "## Enabled Workflows",
    "",
    ...workflows.map((item) => `- ${item}`),
    ""
  ].join("\n");
}
