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
        { id: "bun", version: "1.3.5" }
      ]
    }));

    const report = await evaluateCapabilityDoctor(root);

    expect(report.status).toBe("warn");
    expect(report.capabilities.some((item) => item.id === "omo:ulw-plan" && item.lane === "plan")).toBe(true);
    expect(report.capabilities.some((item) => item.id === "omo:ulw-loop" && item.lane === "execute")).toBe(true);
    expect(report.capabilities.some((item) => item.id === "lennys-podcast-mcp" && item.officialDocsFirst)).toBe(true);
    expect(report.issues.some((item) => item.id === "gajae-code-bun-runtime" && item.severity === "warn")).toBe(true);
  });

  test("fails closed when capability inventory is missing", async () => {
    const root = await tempRepo();

    const report = await evaluateCapabilityDoctor(root);

    expect(report.status).toBe("fail");
    expect(report.issues.some((item) => item.id === "capability-inventory-missing")).toBe(true);
  });

  test("fails closed when capability inventory entries are malformed", async () => {
    const root = await tempRepo();
    await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
      skills: [{}],
      mcpServers: [null],
      plugins: [],
      runtimes: []
    }));

    const report = await evaluateCapabilityDoctor(root);

    expect(report.status).toBe("fail");
    expect(report.capabilities).toHaveLength(0);
    expect(report.issues.some((item) => item.id === "capability-inventory-invalid")).toBe(true);
  });
});
