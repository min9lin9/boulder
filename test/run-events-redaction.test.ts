import { mkdir, readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { listRunEvents, recordRunEvent } from "../src/run-events";
import { removeTempRepo, tempRepo, write } from "./helpers/cli";

describe("run event redaction", () => {
  test("redacts secrets protected paths and raw file bodies", async () => {
    const root = await tempRepo();
    const protectedPath = join(root, ".env.local");
    const rawBody = "RAW_WORKSPACE_BODY\nsecond line\n";

    try {
      await write(root, "package.json", JSON.stringify({ name: "fixture", version: "9.9.9" }, null, 2));
      await write(root, "boulder.yaml", "protectedPaths:\n  - .env*\n");
      await write(root, ".env.local", rawBody);

      const result = await recordRunEvent(root, {
        eventName: "release-check",
        command: `release-check --token npm_secret ghp_secret sk-secret sk-proj-secret --auth "Bearer secret" --include ${protectedPath}`,
        startedAt: "2026-07-08T00:00:00.000Z",
        completedAt: "2026-07-08T00:00:01.000Z",
        severity: "error",
        status: "blocked",
        checkIds: ["install-smoke-version"],
        recoveryHintIds: ["release.install_smoke_version"],
        artifactPaths: [protectedPath, rawBody, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt"]
      });

      const stored = await readFile(result.path, "utf8");
      expect(stored).not.toContain("npm_secret");
      expect(stored).not.toContain("ghp_secret");
      expect(stored).not.toContain("sk-secret");
      expect(stored).not.toContain("sk-proj-secret");
      expect(stored).not.toContain("Bearer secret");
      expect(stored).not.toContain(protectedPath);
      expect(stored).not.toContain(rawBody.trim());
      expect(stored).not.toContain(root);
      expect(stored).toContain("\"cwdHash\"");

      const events = await listRunEvents(root);
      expect(events).toHaveLength(1);
      expect(events[0]?.packageVersion).toBe("9.9.9");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("fails closed when runs directory is a symlink", async () => {
    const root = await tempRepo();
    const outside = await tempRepo();

    try {
      await write(root, "package.json", JSON.stringify({ name: "fixture", version: "9.9.9" }, null, 2));
      await mkdir(join(root, ".boulder"), { recursive: true });
      await symlink(outside, join(root, ".boulder", "runs"));

      await expect(recordRunEvent(root, {
        eventName: "release-check",
        command: "release-check",
        startedAt: "2026-07-08T00:00:00.000Z",
        completedAt: "2026-07-08T00:00:01.000Z",
        severity: "error",
        status: "blocked",
        checkIds: [],
        recoveryHintIds: [],
        artifactPaths: []
      })).rejects.toThrow("Run event path changed");
      expect(await listRunEvents(root)).toEqual([]);
    } finally {
      await removeTempRepo(root);
      await removeTempRepo(outside);
    }
  });
});
