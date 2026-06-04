export function exportMarkdown(repoBrief: string, workflows: string[]): string {
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

export function codexNotes(workflows: string[]): string {
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
