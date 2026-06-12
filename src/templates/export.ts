import type { WorkflowStackComponent } from "../types";

export function exportMarkdown(repoBrief: string, workflows: string[], stack: readonly WorkflowStackComponent[], pipeline: string): string {
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
    "## Operator Workflow Stack",
    "",
    ...stack.map((item) => `- ${item.name}: ${item.role}${item.required ? " (required)" : ""}`),
    "",
    "## Operator Pipeline",
    "",
    pipeline,
    "",
    "## Evidence Rule",
    "",
    "Before claiming completion, attach command evidence, verification status, and unresolved risks.",
    ""
  ].join("\n");
}

export function codexNotes(workflows: string[], stack: readonly WorkflowStackComponent[]): string {
  return [
    "# Codex Workflow Notes",
    "",
    "Use these notes when asking Codex to work on this repository.",
    "",
    "## Default Contract",
    "",
    "- Read `BOULDER.md` before write-capable work.",
    "- Preserve the operator workflow stack: Superpowers spine, GStack gates, Compound learning layer.",
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
    "",
    "## Operator Workflow Stack",
    "",
    ...stack.map((item) => `- ${item.name}: ${item.role}${item.required ? " (required)" : ""}`),
    ""
  ].join("\n");
}
