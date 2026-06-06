import { at, writeText } from "./fs";
import { inspectionToMarkdown, inspectRepo } from "./inspect";
import { loadManifest } from "./manifest";
import { codexNotes, exportMarkdown } from "./templates/export";

export async function exportHarness(root: string, force = false): Promise<string[]> {
  const inspection = await inspectRepo(root);
  const manifest = await loadManifest(root);
  const writes = [
    [`docs/BOULDER_EXPORT.md`, await writeText(at(root, "docs", "BOULDER_EXPORT.md"), exportMarkdown(inspectionToMarkdown(inspection), manifest.workflows, manifest.workflowStack), force)] as const,
    [`docs/CODEX_WORKFLOW_NOTES.md`, await writeText(at(root, "docs", "CODEX_WORKFLOW_NOTES.md"), codexNotes(manifest.workflows, manifest.workflowStack), force)] as const
  ];
  return writes.map(([file, status]) => `${status}: ${file}`);
}
