import { at, writeText } from "./fs";
import { inspectionToMarkdown, inspectRepo } from "./inspect";
import { loadManifest } from "./manifest";
import { buildPipelinePlan, formatPipelinePlan } from "./pipeline";
import { codexNotes, exportMarkdown } from "./templates/export";
import { executorsFromResolvedProfile, resolveWorkflowProfile } from "./workflow-profiles";

export async function exportHarness(root: string, force = false): Promise<string[]> {
  const inspection = await inspectRepo(root);
  const manifest = await loadManifest(root);
  const resolution = await resolveWorkflowProfile(root, {});
  const pipeline = formatPipelinePlan(buildPipelinePlan("medium", executorsFromResolvedProfile(resolution.profile), resolution.profile));
  const writes = [
    [`docs/BOULDER_EXPORT.md`, await writeText(at(root, "docs", "BOULDER_EXPORT.md"), exportMarkdown(inspectionToMarkdown(inspection), manifest.workflows, manifest.workflowStack, pipeline, resolution.profile.id), force)] as const,
    [`docs/CODEX_WORKFLOW_NOTES.md`, await writeText(at(root, "docs", "CODEX_WORKFLOW_NOTES.md"), codexNotes(manifest.workflows, manifest.workflowStack), force)] as const
  ];
  return writes.map(([file, status]) => `${status}: ${file}`);
}
