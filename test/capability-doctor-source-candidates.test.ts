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

function sourceManifest(): Record<string, unknown> {
  return {
    schemaVersion: "boulder.capability.import.v1",
    registryId: "github__yeachan-heo__gajae-code",
    capabilityId: "gajae-code",
    source: "https://github.com/Yeachan-Heo/gajae-code",
    sourceUrl: "https://github.com/Yeachan-Heo/gajae-code",
    sourceKind: "github",
    kind: "adapter",
    status: "configured-unverified",
    trustStatus: "unreviewed",
    license: "unknown",
    candidateCommands: [],
    createdAt: "2026-06-24T00:00:00.000Z"
  };
}

describe("capability doctor source candidates", () => {
  test("keeps source candidates visible when capability inventory is missing", async () => {
    const root = await tempRepo();
    await write(root, ".boulder/capabilities/imports/github__yeachan-heo__gajae-code.json", JSON.stringify(sourceManifest()));

    const report = await evaluateCapabilityDoctor(root, { codexHome: join(root, "missing-codex") });

    expect(report.status).toBe("fail");
    expect(report.activeProfile?.id).toBe("programming-default");
    expect(report.issues.some((item) => item.id === "capability-inventory-missing")).toBe(true);
    expect(report.sourceCandidates.map((item) => item.capabilityId)).toEqual(["gajae-code"]);
  });

  test("reports source candidates separately from installed capabilities", async () => {
    const root = await tempRepo();
    await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
      skills: [{ id: "omo:ulw-plan", status: "installed" }],
      mcpServers: [],
      plugins: [],
      runtimes: [{ id: "bun", version: "1.3.14" }]
    }));
    await write(root, ".boulder/capabilities/imports/github__yeachan-heo__gajae-code.json", JSON.stringify(sourceManifest()));
    await write(root, ".boulder/capabilities/imports/bad.json", "{not json");

    const report = await evaluateCapabilityDoctor(root);

    expect(report.status).toBe("warn");
    expect(report.sourceCandidates).toEqual([sourceManifest()]);
    expect(report.capabilities.some((item) => item.kind === "adapter" && item.id === "gajae-code" && item.status === "available")).toBe(false);
    expect(report.issues.some((item) => item.id === "capability.source_manifest_invalid")).toBe(true);
  });
});
