import { at, writeText } from "./fs";
import { inspectionToMarkdown, inspectRepo } from "./inspect";
import { manifestFromInspection, writeManifest } from "./manifest";
import { scorecardToMarkdown, scoreManifest } from "./scorecard";
import { boulderMarkdown, maintainerWorkflows, providerPolicy, verificationGates } from "./templates/init";

export async function initHarness(root: string, force = false): Promise<string[]> {
  const inspection = await inspectRepo(root);
  const manifest = manifestFromInspection(inspection);
  const scorecard = scorecardToMarkdown(scoreManifest(manifest));
  const writes = [
    [`boulder.yaml`, await writeManifest(root, manifest, force)] as const,
    [`BOULDER.md`, await writeText(at(root, "BOULDER.md"), boulderMarkdown(inspection.name), force)] as const,
    [`docs/MAINTAINER_WORKFLOWS.md`, await writeText(at(root, "docs", "MAINTAINER_WORKFLOWS.md"), maintainerWorkflows(), force)] as const,
    [`docs/VERIFICATION_GATES.md`, await writeText(at(root, "docs", "VERIFICATION_GATES.md"), verificationGates(), force)] as const,
    [`docs/PROVIDER_POLICY.md`, await writeText(at(root, "docs", "PROVIDER_POLICY.md"), providerPolicy(), force)] as const,
    [`docs/HARNESS_QUALITY_SCORECARD.md`, await writeText(at(root, "docs", "HARNESS_QUALITY_SCORECARD.md"), scorecard, force)] as const,
    [`docs/REPO_BRIEF.md`, await writeText(at(root, "docs", "REPO_BRIEF.md"), inspectionToMarkdown(inspection), force)] as const
  ];
  return writes.map(([file, status]) => `${status}: ${file}`);
}
