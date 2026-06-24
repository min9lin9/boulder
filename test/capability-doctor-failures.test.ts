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

describe("capability doctor failure reporting", () => {
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
