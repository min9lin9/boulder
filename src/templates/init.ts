export function boulderMarkdown(name: string): string {
  return [
    "# BOULDER.md",
    "",
    `Repository: ${name}`,
    "",
    "## Operator Contract",
    "",
    "- Define context before action.",
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

export function maintainerWorkflows(): string {
  return [
    "# Maintainer Workflows",
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
