import { readdir, readFile, stat } from "node:fs/promises";
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
  test("native planner skill is packaged and preserves local approval boundaries", async () => {
    const skill = await readFile(join(root, "skills/boulder-native-planner/SKILL.md"), "utf8");
    const metadata = await readFile(join(root, "skills/boulder-native-planner/agents/openai.yaml"), "utf8");
    const packageJson = await readFile(join(root, "package.json"), "utf8");

    expect(skill).toContain("boulder-native-preview");
    expect(skill).toContain("boulder plan analyze --task");
    expect(skill).toContain("boulder plan validate --input");
    expect(skill).toContain("boulder plan show --run-id");
    expect(skill).not.toContain("boulder plan review");
    expect(skill).not.toContain("boulder plan approve");
    expect(skill).toContain("separate explicit approval");
    expect(skill).not.toContain("bunx");
    expect(metadata).toContain("allow_implicit_invocation: false");
    expect(packageJson).toContain("\"skills/boulder-native-planner\"");
  });
  test("preview documentation preserves default routing and Handoff v1 contracts", async () => {
    const [readme, architecture, doctor, profiles, handoffPacket, handoffShape] = await Promise.all([
      readFile(join(root, "README.md"), "utf8"),
      readFile(join(root, "docs/WORKFLOW_ARCHITECTURE.md"), "utf8"),
      readFile(join(root, "docs/CAPABILITY_DOCTOR.md"), "utf8"),
      readFile(join(root, "src/workflow-profile-builtins.ts"), "utf8"),
      readFile(join(root, "src/handoff-packet.ts"), "utf8"),
      readFile(join(root, "src/handoff-packet-shape.ts"), "utf8")
    ]);

    expect(readme).toContain("The default active profile is `programming-default`: planning uses `gajae-code` and execution uses `lazycodex`, both in `detect-and-suggest` mode.");
    expect(profiles).toContain('if (profileId === "programming-default") return programmingDefault(source, drift, task, suggestion);');
    expect(profiles).toContain('planAdapter: "gajae-code"');
    expect(profiles).toContain('executeAdapter: "lazycodex"');
    expect(handoffPacket).toContain('readonly schemaVersion: "boulder.handoff.v1";');
    expect(handoffPacket).toContain('schemaVersion: "boulder.handoff.v1"');
    expect(handoffShape).toContain('schemaVersion !== "boulder.handoff.v1"');

    for (const source of [readme, architecture, doctor]) {
      expect(source).toContain("boulder-native-preview");
      expect(source).toMatch(/read-only|inspect local/i);
      expect(source).toMatch(/separate explicit|separate explicit maintainer/i);
      expect(source).toMatch(/local(?:-only)? (?:to|in|and remains in) `?\.boulder\//i);
      expect(source).toMatch(/follow-up RFC.*not (?:a )?(?:shipped|implemented)/i);
      expect(source).not.toMatch(/auto-?install|automatically install|automatic provider|provider integration/i);
    }
  });


  test("packaged skills and release docs do not contain local-only paths", async () => {
    const files = [
      ...(await filesUnder("skills/boulder")),
      ...(await filesUnder("skills/boulder-bootstrap-designer")),
      ...(await filesUnder("skills/boulder-native-planner")),
      ...(await filesUnder("docs")),
      ...(await filesUnder("fixtures")),
      "README.md",
      "CHANGELOG.md",
      "CONTRIBUTING.md",
      "ROADMAP.md",
      "SECURITY.md",
      "boulder.yaml",
      "LICENSE",
    ];

    for (const file of files) {
      const source = await readFile(join(root, file), "utf8");

      expect(source).not.toContain("/Users/");
      expect(source).not.toContain("/home/");
      expect(source).not.toMatch(/(^|\s)\/private\//);
      expect(source).not.toContain("Documents/Codex");
      expect(source).not.toMatch(/sk-proj-[A-Za-z0-9_-]{20,}/);
      expect(source).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
      expect(source).not.toMatch(/ghp_[A-Za-z0-9]{20,}/);
      expect(source).not.toMatch(/npm_[A-Za-z0-9]{20,}/);
      expect(source).not.toMatch(/Bearer [A-Za-z0-9._-]{20,}/);
    }
  });

  test("package surface includes the public boulder skill and excludes local planning notes", async () => {
    const packageJson = await readFile(join(root, "package.json"), "utf8");

    expect(packageJson).toContain("\"skills/boulder\"");
    expect(packageJson).toContain("\"skills/boulder-bootstrap-designer\"");
    expect(packageJson).toContain("\"!docs/*SESSION_SUMMARY*.md\"");
    expect(packageJson).toContain("\"!docs/NEXT_*GAP*PLAN*.md\"");
  });

});

async function filesUnder(relativePath: string): Promise<string[]> {
  const absolute = join(root, relativePath);
  const entries = await readdir(absolute);
  const files: string[] = [];

  for (const entry of entries) {
    const child = join(relativePath, entry);
    const childStat = await stat(join(root, child));
    if (childStat.isDirectory()) {
      files.push(...await filesUnder(child));
    } else if (childStat.isFile()) {
      files.push(child);
    }
  }

  return files;
}
