import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { evaluateCapabilityDoctor } from "../src/capability-doctor";

async function tempRepo(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "boulder-capability-doctor-"));
}

async function write(root: string, path: string, content: string): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

describe("capability doctor", () => {
  test("routes installed skills and MCP tools to workflow lanes", async () => {
    const root = await tempRepo();
    await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
      skills: [
        { id: "omo:ulw-plan", path: "/Users/burt/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/skills/ulw-plan/SKILL.md", status: "installed" },
        { id: "omo:ulw-loop", path: "/Users/burt/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/skills/ulw-loop/SKILL.md", status: "installed" }
      ],
      mcpServers: [
        { id: "lennys-podcast-mcp", status: "available", officialDocsUrl: "https://github.com/example/lennys-podcast-mcp#readme" }
      ],
      plugins: [
        { id: "superpowers", status: "installed" }
      ],
      runtimes: [
        { id: "bun", version: "1.3.14" }
      ]
    }));

    const report = await evaluateCapabilityDoctor(root);

    expect(report.status).toBe("warn");
    expect(report.activeProfile?.id).toBe("programming-default");
    expect(report.capabilities.some((item) => item.id === "omo:ulw-plan" && item.lane === "plan")).toBe(true);
    expect(report.capabilities.some((item) => item.id === "omo:ulw-loop" && item.lane === "execute")).toBe(true);
    expect(report.capabilities.some((item) => item.kind === "adapter" && item.id === "gajae-code" && item.status === "configured-unverified")).toBe(true);
    expect(report.capabilities.some((item) => item.kind === "adapter" && item.id === "lazycodex" && item.status === "configured-unverified")).toBe(true);
    expect(report.capabilities.some((item) => item.id === "lennys-podcast-mcp" && item.officialDocsFirst)).toBe(true);
    expect(report.issues.some((item) => item.id === "gajae-code-bun-runtime")).toBe(false);
    expect(report.issues.some((item) => item.id === "gajae-code-adapter-unverified")).toBe(true);
    expect(report.issues.some((item) => item.id === "lazycodex-adapter-unverified")).toBe(true);
  });

  test("passes when configured adapters are present in inventory", async () => {
    const root = await tempRepo();
    await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
      skills: [
        { id: "gajae-code", status: "installed" },
        { id: "lazycodex", status: "installed" }
      ],
      mcpServers: [],
      plugins: [],
      runtimes: [{ id: "bun", version: "1.3.14" }]
    }));

    const report = await evaluateCapabilityDoctor(root);

    expect(report.status).toBe("pass");
    expect(report.capabilities.some((item) => item.kind === "adapter" && item.id === "gajae-code" && item.status === "available")).toBe(true);
    expect(report.capabilities.some((item) => item.kind === "adapter" && item.id === "lazycodex" && item.status === "available")).toBe(true);
  });

  test("passes when Bun supports live GJC execution", async () => {
    const root = await tempRepo();
    await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
      skills: [
        { id: "omo:ulw-plan", status: "installed" },
        { id: "gajae-code", status: "installed" },
        { id: "lazycodex", status: "installed" }
      ],
      mcpServers: [],
      plugins: [],
      runtimes: [{ id: "bun", version: "1.3.14" }]
    }));

    const report = await evaluateCapabilityDoctor(root, { codexHome: join(root, ".codex") });

    expect(report.status).toBe("pass");
    expect(report.issues.some((item) => item.id === "gajae-code-bun-runtime")).toBe(false);
  });

  test("uses the active resolved profile instead of legacy manifest executors", async () => {
    const root = await tempRepo();
    await write(root, ".boulder/current-profile", "research-default\n");
    await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
      skills: [{ id: "codex", status: "available" }],
      mcpServers: [],
      plugins: [],
      runtimes: [{ id: "bun", version: "1.3.14" }]
    }));

    const report = await evaluateCapabilityDoctor(root);

    expect(report.activeProfile?.id).toBe("research-default");
    expect(report.activeProfile?.source).toBe("project-current");
    expect(report.capabilities.some((item) => item.kind === "adapter" && item.id === "gajae-code")).toBe(false);
    expect(report.capabilities.some((item) => item.kind === "adapter" && item.id === "lazycodex")).toBe(false);
    expect(report.issues.some((item) => item.id === "gajae-code-adapter-unverified")).toBe(false);
    expect(report.issues.some((item) => item.id === "lazycodex-adapter-unverified")).toBe(false);
  });

  test("does not report GJC runtime warnings for local-only active profiles", async () => {
    const root = await tempRepo();
    await write(root, ".boulder/current-profile", "research-default\n");
    await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
      skills: [{ id: "codex", status: "available" }],
      mcpServers: [],
      plugins: [],
      runtimes: [{ id: "bun", version: "1.3.5" }]
    }));

    const report = await evaluateCapabilityDoctor(root);

    expect(report.activeProfile?.id).toBe("research-default");
    expect(report.issues.some((item) => item.id === "gajae-code-bun-runtime")).toBe(false);
  });

  test("does not treat adjacent Codex plugins as the canonical codex adapter", async () => {
    const root = await tempRepo();
    await write(root, ".boulder/current-profile", "research-default\n");
    await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
      skills: [],
      mcpServers: [],
      plugins: [{ id: "codex-security", status: "installed" }],
      runtimes: [{ id: "bun", version: "1.3.14" }]
    }));

    const report = await evaluateCapabilityDoctor(root);

    expect(report.status).toBe("warn");
    expect(report.activeProfile?.id).toBe("research-default");
    expect(report.capabilities.some((item) => item.kind === "adapter" && item.id === "codex" && item.status === "available")).toBe(false);
    expect(report.capabilities.some((item) => item.kind === "adapter" && item.id === "codex" && item.status === "configured-unverified")).toBe(true);
  });

  test("reports profile drift alongside active profile", async () => {
    const root = await tempRepo();
    await write(root, ".boulder/current-profile", "research-default\n");
    await write(root, "boulder.yaml", [
      "name: fixture",
      "description: custom executor profile",
      "maintainers:",
      "  - min9lin9",
      "workflowStack: []",
      "workflows: []",
      "protectedPaths: []",
      "verification: []",
      "providers:",
      "  default: codex",
      "  externalAllowed: false",
      "  approvalRequired: true",
      "executors:",
      "  planning:",
      "    preferred: custom-planner",
      "    mode: detect-and-suggest",
      "  execution:",
      "    preferred: custom-executor",
      "    mode: detect-and-suggest",
      "  fallback:",
      "    planning: codex",
      "    execution: manual",
      "export:",
      "  markdown: true",
      "  codexNotes: true",
      ""
    ].join("\n"));
    await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
      skills: [{ id: "codex", status: "available" }],
      mcpServers: [],
      plugins: [],
      runtimes: [{ id: "bun", version: "1.3.14" }]
    }));

    const report = await evaluateCapabilityDoctor(root);

    expect(report.status).toBe("warn");
    expect(report.activeProfile?.id).toBe("research-default");
    expect(report.activeProfile?.drift.some((item) => item.id === "profile.drift.manifest-differs")).toBe(true);
    expect(report.issues.some((item) => item.id === "profile.drift.manifest-differs")).toBe(true);
  });


  test("discovers local Codex skills and MCP inventory when fixture is missing", async () => {
    const root = await tempRepo();
    await write(root, ".codex/skills/boulder/SKILL.md", "---\nname: boulder\n---\n");
    await write(root, ".codex/skills/gajae-code/SKILL.md", "---\nname: gajae-code\n---\n");
    await write(root, ".codex/skills/lazycodex/SKILL.md", "---\nname: lazycodex\n---\n");
    await write(root, ".codex/plugins/cache/sisyphuslabs/omo/0.1.0/skills/programming/SKILL.md", "---\nname: programming\n---\n");
    await write(root, ".codex/mcp.json", JSON.stringify({
      mcpServers: {
        "lennys-podcast-mcp": {
          command: "lennys-podcast-mcp"
        }
      }
    }));

    const report = await evaluateCapabilityDoctor(root, { codexHome: join(root, ".codex") });

    expect(report.status).toBe("pass");
    expect(report.capabilities.some((item) => item.kind === "skill" && item.id === "boulder")).toBe(true);
    expect(report.capabilities.some((item) => item.kind === "skill" && item.id === "omo:programming")).toBe(true);
    expect(report.capabilities.some((item) => item.kind === "mcp" && item.id === "lennys-podcast-mcp" && item.officialDocsFirst)).toBe(true);
    expect(report.capabilities.some((item) => item.kind === "runtime" && item.id === "bun" && item.status === "1.3.14")).toBe(true);
  });

  test("fails closed when capability inventory is missing", async () => {
    const root = await tempRepo();

    const report = await evaluateCapabilityDoctor(root, { codexHome: join(root, "missing-codex") });

    expect(report.status).toBe("fail");
    expect(report.activeProfile?.id).toBe("programming-default");
    expect(report.issues.some((item) => item.id === "capability-inventory-missing")).toBe(true);
  });

  test("fails closed when capability inventory entries are malformed", async () => {
    const root = await tempRepo();
    await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
      skills: [{}],
      mcpServers: [null],
      plugins: [],
      runtimes: [{ id: "bun", version: 123 }]
    }));

    const report = await evaluateCapabilityDoctor(root);

    expect(report.status).toBe("fail");
    expect(report.capabilities).toHaveLength(0);
    expect(report.issues.some((item) => item.id === "capability-inventory-invalid")).toBe(true);
  });

  test("fails closed when capability inventory JSON or top-level shape is malformed", async () => {
    for (const content of ["{not json", JSON.stringify({ skills: {} }), ""]) {
      const root = await tempRepo();
      await write(root, "fixtures/capabilities/codex-installed.json", content);

      const report = await evaluateCapabilityDoctor(root);

      expect(report.status).toBe("fail");
      expect(report.issues[0]?.id).toBe("capability-inventory-invalid");
    }
  });

  test("warns with direct Bun upgrade guidance before live GJC execution", async () => {
    const root = await tempRepo();
    await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
      skills: [{ id: "gajae-code", status: "installed" }, { id: "lazycodex", status: "installed" }],
      mcpServers: [],
      plugins: [],
      runtimes: [{ id: "bun", version: "1.3.5" }]
    }));

    const report = await evaluateCapabilityDoctor(root);
    const issue = report.issues.find((item) => item.id === "gajae-code-bun-runtime");

    expect(report.status).toBe("warn");
    expect(issue?.id).toBe("gajae-code-bun-runtime");
  });
});
