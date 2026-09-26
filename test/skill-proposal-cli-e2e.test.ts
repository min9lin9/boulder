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

  test("accepts trace-kind evidence refs end to end", async () => {
    const root = await tempRepo();
    try {
      const bindingId = "a".repeat(64);
      await writeRoutine(root, "daily-issue-review", "daily issue review", 3, [
        { kind: "manual", path: ".boulder/runs/review.json" },
        { kind: "trace", path: `.boulder/evidence/traces/${bindingId}.json`, note: "linked session evidence" }
      ]);

      const result = await runBoulder(["skill", "propose", "--from-routine", "daily-issue-review", "--dry-run", "--cwd", root]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(`- evidence: kind=manual path=.boulder/runs/review.json`);
      expect(result.stdout).toContain(`- evidence: kind=trace path=.boulder/evidence/traces/${bindingId}.json`);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("renders an attached traces-kind descriptor ref end to end", async () => {
    const root = await tempRepo();
    try {
      // Attach stores the descriptor kind verbatim; the conventional trace
      // descriptor directory is .boulder/evidence/traces/ (plural).
      await writeRoutine(root, "daily-issue-review", "daily issue review", 3, [
        { kind: "traces", path: `.boulder/evidence/traces/${"b".repeat(64)}.json` }
      ]);

      const result = await runBoulder(["skill", "propose", "--from-routine", "daily-issue-review", "--dry-run", "--cwd", root]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`- evidence: kind=traces path=.boulder/evidence/traces/${"b".repeat(64)}.json`);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("does not redact routine text or paths that merely contain an sk- substring", async () => {
    const root = await tempRepo();
    try {
      // Regression: the old /sk-[a-z0-9_-]+/i pattern matched the sk- substring
      // inside 'task-sk-foo' and 'task-sk-report.json', redacting clean text.
      await writeRoutine(root, "task-sk-foo", "task-sk-foo review", 3, [
        { kind: "manual", path: ".boulder/runs/task-sk-report.json" }
      ]);
      await writeRoutine(root, "real-key", "leaked sk-abc123def prefix", 1);

      const clean = await runBoulder(["skill", "propose", "--from-routine", "task-sk-foo", "--dry-run", "--cwd", root]);
      expect(clean.exitCode).toBe(0);
      expect(clean.stderr).toBe("");
      expect(clean.stdout).toContain("# Skill Proposal: task-sk-foo review");
      expect(clean.stdout).toContain("- routine-title: task-sk-foo review");
      expect(clean.stdout).toContain("- evidence: kind=manual path=.boulder/runs/task-sk-report.json");

      const leaky = await runBoulder(["skill", "propose", "--from-routine", "real-key", "--dry-run", "--cwd", root]);
      expect(leaky.exitCode).toBe(0);
      expect(leaky.stdout).toContain("# Skill Proposal: [redacted]");
      expect(leaky.stdout).not.toContain("sk-abc123def");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("still filters unsupported or malformed evidence kinds", async () => {
    const root = await tempRepo();
    try {
      await writeRoutine(root, "daily-issue-review", "daily issue review", 3, [
        { kind: "tracer", path: "evidence/tracer.json" },
        { kind: "trace;rm", path: "evidence/trace.json" },
        { kind: "TRACE", path: "evidence/trace.json" },
        { kind: "tracing", path: "evidence/tracing.json" },
        { kind: "trace", path: "../outside.json" }
      ]);

      const result = await runBoulder(["skill", "propose", "--from-routine", "daily-issue-review", "--dry-run", "--cwd", root]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("- evidence: none");
      expect(result.stdout).not.toContain("kind=tracer");
      expect(result.stdout).not.toContain("kind=TRACE");
      expect(result.stdout).not.toContain("kind=tracing");
      expect(result.stdout).not.toContain("outside.json");
    } finally {
      await removeTempRepo(root);
    }
  });
});

async function writeRoutine(root: string, id: string, title: string, seenCount: number, evidenceRefs: readonly Record<string, unknown>[] = []): Promise<void> {
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
    evidenceRefs
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
