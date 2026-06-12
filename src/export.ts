import { at, writeText } from "./fs";
import { inspectionToMarkdown, inspectRepo } from "./inspect";
import { loadManifest } from "./manifest";
import { buildPipelinePlan, formatPipelinePlan } from "./pipeline";
import { codexNotes, exportMarkdown } from "./templates/export";

export async function exportHarness(root: string, force = false): Promise<string[]> {
  const inspection = await inspectRepo(root);
  const manifest = await loadManifest(root);
  const pipeline = formatPipelinePlan(buildPipelinePlan("medium"));
  const writes = [
    [`docs/BOULDER_EXPORT.md`, await writeText(at(root, "docs", "BOULDER_EXPORT.md"), exportMarkdown(inspectionToMarkdown(inspection), manifest.workflows, manifest.workflowStack, pipeline), force)] as const,
    [`docs/CODEX_WORKFLOW_NOTES.md`, await writeText(at(root, "docs", "CODEX_WORKFLOW_NOTES.md"), codexNotes(manifest.workflows, manifest.workflowStack), force)] as const
  ];
  return writes.map(([file, status]) => `${status}: ${file}`);
}
