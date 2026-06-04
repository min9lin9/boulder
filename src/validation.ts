import type { BoulderManifest } from "./types";

export type ManifestIssue = {
  path: string;
  severity: "error" | "warning";
  message: string;
};

export function validateManifest(manifest: BoulderManifest): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  requireText(issues, "name", manifest.name, "Manifest name is required.");
  requireText(issues, "description", manifest.description, "Manifest description is required.");
  requireList(issues, "maintainers", manifest.maintainers, "At least one maintainer is required.");
  requireList(issues, "workflows", manifest.workflows, "At least one workflow is required.");
  requireList(issues, "protectedPaths", manifest.protectedPaths, "At least one protected path is recommended.");
  if (!manifest.verification.length) {
    issues.push({ path: "verification", severity: "error", message: "At least one verification command is required." });
  }
  manifest.verification.forEach((item, index) => {
    requireText(issues, `verification[${index}].name`, item.name, "Verification command name is required.");
    requireText(issues, `verification[${index}].command`, item.command, "Verification command string is required.");
    if (!item.required) {
      issues.push({
        path: `verification[${index}].required`,
        severity: "warning",
        message: "Optional verification commands should be justified in generated reports."
      });
    }
  });
  if (manifest.providers.externalAllowed && !manifest.providers.approvalRequired) {
    issues.push({
      path: "providers.approvalRequired",
      severity: "error",
      message: "External providers require approval gating."
    });
  }
  return issues;
}

export function formatManifestIssues(issues: ManifestIssue[]): string {
  if (!issues.length) return "Manifest validation passed.";
  return issues.map((issue) => `${issue.severity.toUpperCase()} ${issue.path}: ${issue.message}`).join("\n");
}

export function hasManifestErrors(issues: ManifestIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

function requireText(issues: ManifestIssue[], path: string, value: string, message: string): void {
  if (!value.trim()) {
    issues.push({ path, severity: "error", message });
  }
}

function requireList(issues: ManifestIssue[], path: string, value: string[], message: string): void {
  if (!value.length || value.some((item) => !item.trim())) {
    issues.push({ path, severity: "error", message });
  }
}
