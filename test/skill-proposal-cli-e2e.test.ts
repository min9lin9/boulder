import { mkdir, readFile, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

describe("boulder skill proposal CLI e2e", () => {
  test("prints a review-only proposal without writing on dry-run", async () => {
    const root = await tempRepo();
    try {
      await writeRoutine(root, "daily-issue-review", "daily issue review", 3);

      const result = await runBoulder(["skill", "propose", "--from-routine", "daily-issue-review", "--dry-run", "--cwd", root]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Boulder skill proposal dry-run");
      expect(result.stdout).toContain("- path: .boulder/skill-proposals/daily-issue-review.md");
      expect(result.stdout).toContain("# Skill Proposal: daily issue review");
      expect(result.stdout).toContain("- routine-id: daily-issue-review");
      expect(result.stdout).not.toMatch(/\b(install|update|apply|archive|delete)\b/i);
      expect(result.stdout).not.toMatch(/sk-[A-Za-z0-9_-]+|BEGIN [A-Z ]*PRIVATE KEY|password=/i);
      expect(await exists(join(root, ".boulder/skill-proposals/daily-issue-review.md"))).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("writes a proposal under .boulder only", async () => {
    const root = await tempRepo();
    try {
      await writeRoutine(root, "daily-issue-review", "daily issue review", 2);

      const result = await runBoulder(["skill", "propose", "--from-routine", "daily-issue-review", "--write", "--json", "--cwd", root]);
      const payload = JSON.parse(result.stdout);
      const stored = await readFile(join(root, ".boulder/skill-proposals/daily-issue-review.md"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(payload.status).toBe("written");
      expect(payload.path).toBe(".boulder/skill-proposals/daily-issue-review.md");
      expect(stored).toBe(payload.markdown);
      expect(stored).toContain("## Review Checklist");
      expect(await exists(join(root, ".boulder/routines/daily-issue-review.json"))).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("reports a stable missing routine error", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["skill", "propose", "--from-routine", "missing-routine", "--dry-run", "--cwd", root]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("ERROR skill_proposal.routine_missing: Routine artifact not found.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects invalid routine ids and mode conflicts without writing", async () => {
    const root = await tempRepo();
    try {
      await writeRoutine(root, "daily-issue-review", "daily issue review", 2);

      const traversal = await runBoulder(["skill", "propose", "--from-routine", "../daily-issue-review", "--dry-run", "--cwd", root]);
      const absolute = await runBoulder(["skill", "propose", "--from-routine", "/tmp/daily-issue-review", "--dry-run", "--cwd", root]);
      const control = await runBoulder(["skill", "propose", "--from-routine", "daily\\0issue", "--dry-run", "--cwd", root]);
      const missingMode = await runBoulder(["skill", "propose", "--from-routine", "daily-issue-review", "--cwd", root]);
      const conflict = await runBoulder(["skill", "propose", "--from-routine", "daily-issue-review", "--dry-run", "--write", "--cwd", root]);

      expect(traversal.stderr.trim()).toBe("ERROR skill_proposal.invalid_routine: Routine id must be a slug.");
      expect(absolute.stderr.trim()).toBe("ERROR skill_proposal.invalid_routine: Routine id must be a slug.");
      expect(control.stderr.trim()).toBe("ERROR skill_proposal.invalid_routine: Routine id must be a slug.");
      expect(missingMode.stderr.trim()).toBe("ERROR skill_proposal.mode_required: Use exactly one of --dry-run or --write.");
      expect(conflict.stderr.trim()).toBe("ERROR skill_proposal.mode_conflict: Use exactly one of --dry-run or --write.");
      expect(traversal.exitCode).toBe(1);
      expect(absolute.exitCode).toBe(1);
      expect(control.exitCode).toBe(1);
      expect(missingMode.exitCode).toBe(1);
      expect(conflict.exitCode).toBe(1);
      expect(await exists(join(root, ".boulder/skill-proposals/daily-issue-review.md"))).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("does not write through a symlinked proposal directory", async () => {
    const root = await tempRepo();
    const external = await tempRepo();
    try {
      await writeRoutine(root, "daily-issue-review", "daily issue review", 2);
      await mkdir(join(root, ".boulder"), { recursive: true });
      await symlink(external, join(root, ".boulder/skill-proposals"));

      const result = await runBoulder(["skill", "propose", "--from-routine", "daily-issue-review", "--write", "--cwd", root]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("ERROR skill_proposal.path_invalid: Skill proposal path must stay under .boulder/skill-proposals.");
      expect(await exists(join(external, "daily-issue-review.md"))).toBe(false);
    } finally {
      await removeTempRepo(root);
      await removeTempRepo(external);
    }
  });
});

async function writeRoutine(root: string, id: string, title: string, seenCount: number): Promise<void> {
  await write(root, `.boulder/routines/${id}.json`, `${JSON.stringify({
    schemaVersion: 1,
    id,
    title,
    task: title,
    normalizedTask: title,
    profileId: "programming-default",
    createdAt: "2026-06-01T00:00:00.000Z",
    seenCount,
    lastSeenAt: "2026-07-01T00:00:00.000Z",
    evidenceRefs: []
  }, null, 2)}\n`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && Reflect.get(error, "code") === "ENOENT") return false;
    throw error;
  }
}
