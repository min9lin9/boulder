import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

describe("boulder capability import", () => {
  test("previews a known adapter source without writing", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder([
        "capability",
        "import",
        "--cwd",
        root,
        "--from",
        "https://github.com/Yeachan-Heo/gajae-code",
        "--dry-run",
        "--json"
      ]);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.writes).toEqual([]);
      expect(payload.manifest.registryId).toBe("github__yeachan-heo__gajae-code");
      expect(payload.manifest.capabilityId).toBe("gajae-code");
      expect(payload.manifest.kind).toBe("adapter");
      expect(payload.manifest.sourceUrl).toBe("https://github.com/Yeachan-Heo/gajae-code");
      expect(payload.path).toBe(join(root, ".boulder", "capabilities", "imports", "github__yeachan-heo__gajae-code.json"));
      await expect(readFile(join(root, ".boulder", "capabilities", "imports", "github__yeachan-heo__gajae-code.json"), "utf8")).rejects.toThrow("ENOENT");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("previews the agency-agents subagent catalog without writing", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder([
        "capability",
        "import",
        "--cwd",
        root,
        "--from",
        "https://github.com/msitarzewski/agency-agents",
        "--dry-run",
        "--json"
      ]);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.writes).toEqual([]);
      expect(payload.manifest.registryId).toBe("github__msitarzewski__agency-agents");
      expect(payload.manifest.capabilityId).toBe("agency-agents");
      expect(payload.manifest.kind).toBe("agent-catalog");
      await expect(readFile(join(root, ".boulder", "capabilities", "imports", "github__msitarzewski__agency-agents.json"), "utf8")).rejects.toThrow("ENOENT");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("writes source manifests for known and explicit adapter sources", async () => {
    const root = await tempRepo();
    try {
      const lazycodex = await runBoulder([
        "capability",
        "import",
        "--cwd",
        root,
        "--from",
        "https://github.com/code-yeongyu/lazycodex",
        "--write",
        "--json"
      ]);
      const custom = await runBoulder([
        "capability",
        "import",
        "--cwd",
        root,
        "--from",
        "https://github.com/example/custom-agent",
        "--kind",
        "adapter",
        "--id",
        "custom-agent",
        "--write",
        "--json"
      ]);

      expect(lazycodex.exitCode).toBe(0);
      expect(custom.exitCode).toBe(0);
      expect(await readFile(join(root, ".boulder", "capabilities", "imports", "github__code-yeongyu__lazycodex.json"), "utf8")).toContain('"capabilityId": "lazycodex"');
      expect(await readFile(join(root, ".boulder", "capabilities", "imports", "github__example__custom-agent.json"), "utf8")).toContain('"capabilityId": "custom-agent"');
    } finally {
      await removeTempRepo(root);
    }
  });

  test("reports read-only capability lifecycle status", async () => {
    const root = await tempRepo();
    try {
      await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
        skills: [{ id: "gajae-code", status: "installed" }],
        mcpServers: [],
        plugins: [],
        runtimes: [{ id: "bun", version: "1.3.14" }]
      }));
      await write(root, ".boulder/capabilities/imports/github__yeachan-heo__gajae-code.json", JSON.stringify({
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
        createdAt: new Date().toISOString()
      }));
      await write(root, ".boulder/capabilities/imports/github__msitarzewski__agency-agents.json", JSON.stringify({
        schemaVersion: "boulder.capability.import.v1",
        registryId: "github__msitarzewski__agency-agents",
        capabilityId: "agency-agents",
        source: "https://github.com/msitarzewski/agency-agents",
        sourceUrl: "https://github.com/msitarzewski/agency-agents",
        sourceKind: "github",
        kind: "agent-catalog",
        status: "configured-unverified",
        trustStatus: "unreviewed",
        license: "unknown",
        candidateCommands: [],
        createdAt: "2025-01-01T00:00:00.000Z"
      }));

      const result = await runBoulder(["capability", "status", "--cwd", root, "--json"]);
      const payload = JSON.parse(result.stdout);
      const gajae = payload.sources.find((item: { id: string }) => item.id === "github__yeachan-heo__gajae-code");
      const agents = payload.sources.find((item: { id: string }) => item.id === "github__msitarzewski__agency-agents");

      expect(result.exitCode).toBe(0);
      expect(payload.status).toBe("warn");
      expect(payload.activeProfile).toBe("programming-default");
      expect(payload.summary.total).toBe(2);
      expect(payload.summary.installed).toBe(1);
      expect(payload.summary.stale).toBe(1);
      expect(gajae.installed).toBe(true);
      expect(gajae.linkedProfiles).toEqual(["programming-default"]);
      expect(gajae.freshness).toBe("fresh");
      expect(agents.installed).toBe(false);
      expect(agents.freshness).toBe("stale");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("does not treat substring inventory matches as installed capabilities", async () => {
    const root = await tempRepo();
    try {
      await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
        skills: [{ id: "argo", status: "installed" }],
        mcpServers: [],
        plugins: [],
        runtimes: [{ id: "bun", version: "1.3.14" }]
      }));
      await write(root, ".boulder/capabilities/imports/github__example__go.json", JSON.stringify({
        schemaVersion: "boulder.capability.import.v1",
        registryId: "github__example__go",
        capabilityId: "go",
        source: "https://github.com/example/go",
        sourceUrl: "https://github.com/example/go",
        sourceKind: "github",
        kind: "skill",
        status: "configured-unverified",
        trustStatus: "unreviewed",
        license: "unknown",
        candidateCommands: [],
        createdAt: new Date().toISOString()
      }));

      const result = await runBoulder(["capability", "status", "--cwd", root, "--json"]);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.summary.installed).toBe(0);
      expect(payload.sources[0].installed).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("fails closed for invalid import modes and sources", async () => {
    const root = await tempRepo();
    try {
      const noMode = await runBoulder(["capability", "import", "--cwd", root, "--from", "https://github.com/Yeachan-Heo/gajae-code"]);
      const missingFromValue = await runBoulder(["capability", "import", "--cwd", root, "--from", "--dry-run"]);
      const conflict = await runBoulder(["capability", "import", "--cwd", root, "--from", "https://github.com/Yeachan-Heo/gajae-code", "--dry-run", "--write"]);
      const missingId = await runBoulder(["capability", "import", "--cwd", root, "--from", "https://github.com/example/custom-agent", "--kind", "adapter", "--dry-run"]);
      const invalid = await runBoulder(["capability", "import", "--cwd", root, "--from", "git@github.com:Yeachan-Heo/gajae-code.git", "--dry-run", "--json"]);

      expect(noMode.exitCode).toBe(1);
      expect(noMode.stdout).toBe("");
      expect(noMode.stderr.trim()).toBe("ERROR capability.mode_required: Choose exactly one of --dry-run or --write.");
      expect(missingFromValue.exitCode).toBe(1);
      expect(missingFromValue.stderr.trim()).toBe("ERROR capability.source_required: Missing --from.");
      expect(conflict.exitCode).toBe(1);
      expect(conflict.stderr.trim()).toBe("ERROR capability.mode_conflict: Choose exactly one of --dry-run or --write.");
      expect(missingId.exitCode).toBe(1);
      expect(missingId.stderr.trim()).toBe("ERROR capability.adapter_id_required: Unknown adapter sources require --id.");
      expect(invalid.exitCode).toBe(1);
      expect(invalid.stdout).toBe("");
      expect(invalid.stderr).toContain("ERROR capability.source_invalid:");
    } finally {
      await removeTempRepo(root);
    }
  });
});
