import type { WorkflowStackComponent } from "../types";

export function boulderMarkdown(name: string): string {
  return [
    "# BOULDER.md",
    "",
    `Repository: ${name}`,
    "",
    "## Operator Contract",
    "",
    "- Define context before action.",
    "- Use Superpowers as the workflow spine.",
    "- Use GStack as the review gate layer before risky implementation or release decisions.",
    "- Use Compound to capture durable workflow learnings after meaningful cycles.",
    "- Require approval before risky or write-capable execution.",
    "- Record command evidence before claims.",
    "- Run verification before completion.",
    "- Report unresolved risks instead of hiding them.",
    "",
    "## Maintainer Workflows",
    "",
    "- issue-triage",
    "- pr-review-prep",
    "- release-planning",
    "- dependency-review",
    "- verification-gate",
    "",
    "## Evidence Ledger",
    "",
    "Record generated briefs, verification reports, export notes, and unresolved risk reports under `docs/` or a project-specific output directory.",
    ""
  ].join("\n");
}

export function operatorWorkflowStack(stack: readonly WorkflowStackComponent[]): string {
  return [
    "# Operator Workflow Stack",
    "",
    "Boulder defaults to the har-maker operator stack. These are not runtime dependencies; they are the workflow contract Codex should preserve while working on the repository.",
    "",
    "## Components",
    "",
    ...stack.flatMap((item) => [
      `### ${item.name}`,
      "",
      `Role: ${item.role}`,
      `Required: ${item.required ? "yes" : "no"}`,
      "",
      item.description,
      ""
    ]),
    "## Operating Loop",
    "",
    "1. Superpowers drives brainstorming, planning, implementation, debugging, review, and verification.",
    "2. GStack inserts CSO, QA, executive, or office-hours review gates when risk or ambiguity rises.",
    "3. Compound records reusable decisions, repeated failure modes, and workflow improvements after the cycle.",
    "4. Boulder keeps the public OSS surface bounded to repo context, approval gates, local verification, and evidence.",
    "",
    "## Boundary",
    "",
    "This stack should not imply autonomous durable writes. Human approval and local verification remain required before high-risk changes, releases, or external-provider usage.",
    ""
  ].join("\n");
}

export function maintainerWorkflows(): string {
  return [
    "# Maintainer Workflows",
    "",
    "## Default Operator Stack",
    "",
    "- Superpowers is the workflow spine for brainstorming, planning, implementation, review, and verification.",
    "- GStack is the review gate layer for CSO, QA, executive, or office-hours checks before risky decisions.",
    "- Compound is the learning layer for reusable decisions, repeated failure modes, and durable workflow improvements.",
    "",
    "## Issue Triage",
    "",
    "1. Classify user impact and affected surface.",
    "2. Identify required context files.",
    "3. Propose a bounded next action.",
    "4. Record unresolved questions.",
    "",
    "## PR Review Prep",
    "",
    "1. Summarize changed behavior.",
    "2. Check protected paths and maintainer boundaries.",
    "3. Run configured verification commands.",
    "4. Report evidence and risks before approval.",
    "",
    "## Release Planning",
    "",
    "1. Confirm release scope.",
    "2. Verify docs, tests, and changelog.",
    "3. Produce release note draft.",
    "4. Record manual smoke evidence.",
    ""
  ].join("\n");
}

export function verificationGates(): string {
  return [
    "# Verification Gates",
    "",
    "A Boulder workflow is not complete until it records:",
    "",
    "- commands run",
    "- pass/fail/manual status",
    "- output summary",
    "- skipped checks and reason",
    "- unresolved risks",
    "",
    "Use `boulder verify --dry-run` to preview commands without executing them.",
    ""
  ].join("\n");
}

export function providerPolicy(): string {
  return [
    "# Provider Policy",
    "",
    "Default provider surface: Codex.",
    "",
    "External providers are optional and must be approval-gated.",
    "",
    "Rules:",
    "",
    "- Do not send secrets, private user data, or protected files to external providers.",
    "- Treat external provider output as advisory until verified locally.",
    "- Record provider usage in evidence notes when it affects a maintainer decision.",
    "- Prefer local verification commands over model summaries.",
    ""
  ].join("\n");
}
