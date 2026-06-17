import type { BoulderManifest, ExecutorMode } from "./types";
import { missingWorkflowStackComponents, REQUIRED_WORKFLOW_STACK, workflowStackRolesMatch } from "./workflow-stack";

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
  validateWorkflowStack(issues, manifest);
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
  validateExecutors(issues, manifest);
  return issues;
}

function validateExecutors(issues: ManifestIssue[], manifest: BoulderManifest): void {
  requireText(issues, "executors.planning.preferred", manifest.executors.planning.preferred, "Planning executor is required.");
  requireText(issues, "executors.execution.preferred", manifest.executors.execution.preferred, "Execution executor is required.");
  requireText(issues, "executors.fallback.planning", manifest.executors.fallback.planning, "Planning fallback executor is required.");
  requireText(issues, "executors.fallback.execution", manifest.executors.fallback.execution, "Execution fallback executor is required.");
  validateExecutorMode(issues, "executors.planning.mode", manifest.executors.planning.mode);
  validateExecutorMode(issues, "executors.execution.mode", manifest.executors.execution.mode);
}

function validateExecutorMode(issues: ManifestIssue[], path: string, mode: ExecutorMode): void {
  if (mode === "detect-and-suggest") return;
  if (mode === "local-only") return;
  if (mode === "packet-only") return;
  if (mode === "approval-gated-send") return;
  issues.push({
    path,
    severity: "error",
    message: "Executor mode must be one of detect-and-suggest, local-only, packet-only, or approval-gated-send."
  });
}

function validateWorkflowStack(issues: ManifestIssue[], manifest: BoulderManifest): void {
  if (!manifest.workflowStack.length) {
    issues.push({
      path: "workflowStack",
      severity: "error",
      message: "Superpowers, GStack, and Compound must be configured as the default operator workflow stack."
    });
    return;
  }

  manifest.workflowStack.forEach((item, index) => {
    requireText(issues, `workflowStack[${index}].name`, item.name, "Workflow stack component name is required.");
    requireText(issues, `workflowStack[${index}].role`, item.role, "Workflow stack component role is required.");
    requireText(issues, `workflowStack[${index}].description`, item.description, "Workflow stack component description is required.");
  });

  const missing = missingWorkflowStackComponents(manifest.workflowStack);
  if (missing.length) {
    issues.push({
      path: "workflowStack",
      severity: "error",
      message: `Missing required operator workflow component(s): ${missing.join(", ")}.`
    });
  }

  if (!workflowStackRolesMatch(manifest.workflowStack)) {
    issues.push({
      path: "workflowStack",
      severity: "warning",
      message: `Expected har-maker roles: ${REQUIRED_WORKFLOW_STACK.map((item) => `${item.name}=${item.role}`).join(", ")}.`
    });
  }
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
