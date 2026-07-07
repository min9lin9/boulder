import { mkdir, readFile, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

describe("boulder routine CLI e2e", () => {
  test("preserves unknown-command help behavior", async () => {
    const result = await runBoulder(["not-a-command"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command: not-a-command");
    expect(result.stdout).toContain("Usage:");
  });

  test("prints deterministic capture plan without writing on dry-run", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["routine", "capture", "--task", "daily issue review", "--dry-run", "--json", "--cwd", root]);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(payload.status).toBe("dry-run");
      expect(payload.path).toBe(".boulder/routines/daily-issue-review.json");
      expect(payload.routine.schemaVersion).toBe(1);
      expect(Object.keys(payload.routine)).toEqual([
        "schemaVersion",
        "id",
        "title",
        "task",
        "normalizedTask",
        "profileId",
        "createdAt",
        "seenCount",
        "lastSeenAt",
        "evidenceRefs"
      ]);
      expect(payload.routine.id).toBe("daily-issue-review");
      expect(payload.routine.title).toBe("daily issue review");
      expect(payload.routine.task).toBe("daily issue review");
      expect(payload.routine.normalizedTask).toBe("daily issue review");
      expect(payload.routine.profileId).toBe("programming-default");
      expect(payload.routine.seenCount).toBe(1);
      expect(payload.routine.evidenceRefs).toEqual([]);
      expect(await exists(join(root, ".boulder/routines/daily-issue-review.json"))).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("writes and updates the same normalized routine", async () => {
    const root = await tempRepo();
    try {
      const first = await runBoulder(["routine", "capture", "--task", "Daily   Issue Review", "--write", "--json", "--cwd", root]);
      const second = await runBoulder(["routine", "capture", "--task", "daily issue review", "--write", "--json", "--cwd", root]);
      const payload = JSON.parse(second.stdout);
      const stored = JSON.parse(await readFile(join(root, ".boulder/routines/daily-issue-review.json"), "utf8"));

      expect(first.exitCode).toBe(0);
      expect(second.exitCode).toBe(0);
      expect(payload.status).toBe("written");
      expect(stored).toEqual(payload.routine);
      expect(Object.keys(stored)).toEqual([
        "schemaVersion",
        "id",
        "title",
        "task",
        "normalizedTask",
        "profileId",
        "createdAt",
        "seenCount",
        "lastSeenAt",
        "evidenceRefs"
      ]);
      expect(stored.seenCount).toBe(2);
      expect(stored.createdAt).toBe(firstJson(first.stdout).routine.createdAt);
      expect(stored.lastSeenAt >= stored.createdAt).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects capture when dry-run and write are both present", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["routine", "capture", "--task", "flag conflict", "--dry-run", "--write", "--json", "--cwd", root]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("ERROR routine.mode_conflict: Use exactly one of --dry-run or --write.");
      expect(await exists(join(root, ".boulder/routines/flag-conflict.json"))).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects routine commands that are not exactly capture", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["routine", "noop", "capture", "--task", "wrong route", "--dry-run", "--json", "--cwd", root]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown command: routine");
      expect(result.stdout).toContain("Usage:");
      expect(await exists(join(root, ".boulder/routines/wrong-route.json"))).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("canonicalizes stale stored routine metadata on repeat capture", async () => {
    const root = await tempRepo();
    try {
      await write(root, ".boulder/routines/stale-state.json", JSON.stringify({
        schemaVersion: 1,
        id: "different-task",
        title: "different task",
        task: "different task",
        normalizedTask: "different task",
        profileId: "other-profile",
        createdAt: "2020-01-01T00:00:00.000Z",
        seenCount: 7,
        lastSeenAt: "2020-01-01T00:00:00.000Z",
        evidenceRefs: [{ kind: "file", path: "/etc/passwd" }]
      }));

      const result = await runBoulder(["routine", "capture", "--task", "stale state", "--write", "--json", "--cwd", root]);
      const payload = JSON.parse(result.stdout);
      const stored = JSON.parse(await readFile(join(root, ".boulder/routines/stale-state.json"), "utf8"));

      expect(result.exitCode).toBe(0);
      expect(stored).toEqual(payload.routine);
      expect(payload.routine.id).toBe("stale-state");
      expect(payload.routine.title).toBe("stale state");
      expect(payload.routine.task).toBe("stale state");
      expect(payload.routine.normalizedTask).toBe("stale state");
      expect(payload.routine.profileId).toBe("programming-default");
      expect(payload.routine.seenCount).toBe(8);
      expect(payload.routine.evidenceRefs).toEqual([]);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("replaces non slug stored routine id on repeat capture", async () => {
    const root = await tempRepo();
    try {
      await write(root, ".boulder/routines/stale-state.json", JSON.stringify({
        schemaVersion: 1,
        id: "../evil",
        title: "stale state",
        task: "stale state",
        normalizedTask: "stale state",
        profileId: "programming-default",
        createdAt: "2020-01-01T00:00:00.000Z",
        seenCount: 1,
        lastSeenAt: "2020-01-01T00:00:00.000Z",
        evidenceRefs: []
      }));

      const result = await runBoulder(["routine", "capture", "--task", "stale state", "--write", "--json", "--cwd", root]);
      const payload = JSON.parse(result.stdout);
      const stored = JSON.parse(await readFile(join(root, ".boulder/routines/stale-state.json"), "utf8"));

      expect(result.exitCode).toBe(0);
      expect(payload.routine.id).toBe("stale-state");
      expect(stored.id).toBe("stale-state");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("normalizes shell metacharacters into a slug-only id", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["routine", "capture", "--task", "daily issue review; echo nope", "--dry-run", "--json", "--cwd", root]);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.routine.id).toBe("daily-issue-review-echo-nope");
      expect(payload.routine.id).not.toMatch(/[;/\\]/);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects empty and path-like routine tasks", async () => {
    const root = await tempRepo();
    try {
      const empty = await runBoulder(["routine", "capture", "--task", "  ", "--dry-run", "--json", "--cwd", root]);
      const traversal = await runBoulder(["routine", "capture", "--task", "../escape", "--dry-run", "--json", "--cwd", root]);
      const absolute = await runBoulder(["routine", "capture", "--task", "/tmp/escape", "--dry-run", "--json", "--cwd", root]);
      const control = await runBoulder(["routine", "capture", "--task", "daily\\0review", "--dry-run", "--json", "--cwd", root]);

      expect(empty.exitCode).toBe(1);
      expect(empty.stdout).toBe("");
      expect(empty.stderr.trim()).toBe("ERROR routine.invalid_task: Routine task must be non-empty safe text.");
      expect(traversal.exitCode).toBe(1);
      expect(traversal.stderr.trim()).toBe("ERROR routine.invalid_task: Routine task must be non-empty safe text.");
      expect(absolute.exitCode).toBe(1);
      expect(absolute.stderr.trim()).toBe("ERROR routine.invalid_task: Routine task must be non-empty safe text.");
      expect(control.exitCode).toBe(1);
      expect(control.stderr.trim()).toBe("ERROR routine.invalid_task: Routine task must be non-empty safe text.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("does not write through a symlinked routines directory", async () => {
    const root = await tempRepo();
    const external = await tempRepo();
    try {
      await mkdir(join(root, ".boulder"), { recursive: true });
      await symlink(external, join(root, ".boulder/routines"));

      const result = await runBoulder(["routine", "capture", "--task", "daily issue review", "--write", "--json", "--cwd", root]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("ERROR routine.path_invalid: Routine path must stay under .boulder/routines.");
      expect(await exists(join(external, "daily-issue-review.json"))).toBe(false);
    } finally {
      await removeTempRepo(root);
      await removeTempRepo(external);
    }
  });
});

function firstJson(text: string): { readonly routine: { readonly createdAt: string } } {
  const parsed = JSON.parse(text);
  if (!isRecord(parsed) || !isRecord(parsed["routine"]) || typeof parsed["routine"]["createdAt"] !== "string") {
    throw new Error("invalid routine capture response");
  }
  return { routine: { createdAt: parsed["routine"]["createdAt"] } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
