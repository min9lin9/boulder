import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "..");

describe("source cleanliness", () => {
  test("command modules use shared pretty JSON rendering", async () => {
    const commandFiles = [
      "src/profile-command.ts",
      "src/handoff-command.ts",
      "src/cli.ts"
    ];

    for (const file of commandFiles) {
      const source = await readFile(join(root, file), "utf8");

      expect(source.includes("JSON.stringify")).toBe(false);
    }
  });

  test("bootstrap designer skill is packaged with profile guidance", async () => {
    const skill = await readFile(join(root, "skills/boulder-bootstrap-designer/SKILL.md"), "utf8");
    const metadata = await readFile(join(root, "skills/boulder-bootstrap-designer/agents/openai.yaml"), "utf8");
    const packageJson = await readFile(join(root, "package.json"), "utf8");

    for (const profile of ["programming-heavy", "research-corpus", "release-safe", "issue-triage", "docs-reviewer"]) {
      expect(skill).toContain(profile);
    }

    expect(skill).toContain("profile use");
    expect(skill).toContain("capability import");
    expect(skill).toContain("doctor");
    expect(skill).toContain("docs-reviewer -> research-default");
    expect(metadata).toContain("display_name:");
    expect(metadata).toContain("default_prompt:");
    expect(packageJson).toContain("\"skills/boulder-bootstrap-designer\"");
  });
});
