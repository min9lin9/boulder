import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { removeTempRepo, runBoulder, tempRepo } from "./helpers/cli";

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
