import { mkdir, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

describe("boulder retro CLI e2e", () => {
  test("reports weekly dry-run candidates from two routines", async () => {
    const root = await tempRepo();
    try {
      await writeRoutine(root, "daily-issue-review", "daily issue review", 3);
      await writeRoutine(root, "release-checklist", "release checklist", 1);

      const result = await runBoulder(["retro", "weekly", "--dry-run", "--json", "--cwd", root]);
      const payload = parseRetro(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(payload.status).toBe("ready");
      expect(payload.period).toBe("weekly");
      expect(payload.routineCount).toBe(2);
      expect(payload.warnings).toEqual([]);
      expect(payload.improvementCandidates.map((item) => item.routineId)).toEqual(["daily-issue-review", "release-checklist"]);
      expect(payload.skillProposalCandidates.map((item) => item.routineId)).toEqual(["daily-issue-review"]);
      expect(payload.improvementCandidates[0]).toEqual({
        routineId: "daily-issue-review",
        title: "daily issue review",
        seenCount: 3,
        lastSeenAt: "2026-07-01T00:00:00.000Z",
        reason: "Repeated routine is ready for weekly improvement review."
      });
      expect(await exists(join(root, ".boulder/retrospectives"))).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("reports empty when no routine artifacts exist", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["retro", "weekly", "--dry-run", "--json", "--cwd", root]);
      const payload = parseRetro(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.status).toBe("empty");
      expect(payload.period).toBe("weekly");
      expect(payload.routineCount).toBe(0);
      expect(payload.improvementCandidates).toEqual([]);
      expect(payload.skillProposalCandidates).toEqual([]);
      expect(payload.warnings).toEqual([]);
      expect(await exists(join(root, ".boulder/retrospectives"))).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("lists malformed routine files as warnings and keeps valid candidates", async () => {
    const root = await tempRepo();
    try {
      await writeRoutine(root, "daily-issue-review", "daily issue review", 2);
      await write(root, ".boulder/routines/broken.json", "{");

      const result = await runBoulder(["retro", "weekly", "--dry-run", "--json", "--cwd", root]);
      const payload = parseRetro(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.status).toBe("ready");
      expect(payload.routineCount).toBe(1);
      expect(payload.improvementCandidates.map((item) => item.routineId)).toEqual(["daily-issue-review"]);
      expect(payload.warnings).toEqual([".boulder/routines/broken.json: malformed routine artifact"]);
      expect(await exists(join(root, ".boulder/retrospectives"))).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("blocks traversal-like routine fixture names without reading outside routines", async () => {
    const root = await tempRepo();
    try {
      await writeRoutine(root, "outside", "outside should not count", 99, ".boulder/outside.json");
      await writeRoutine(root, "escape", "escape should not count", 99, ".boulder/routines/..escape.json");

      const result = await runBoulder(["retro", "weekly", "--dry-run", "--json", "--cwd", root]);
      const payload = parseRetro(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.status).toBe("blocked");
      expect(payload.routineCount).toBe(0);
      expect(payload.improvementCandidates).toEqual([]);
      expect(payload.skillProposalCandidates).toEqual([]);
      expect(payload.warnings).toEqual([".boulder/routines/..escape.json: unsafe routine artifact path"]);
      expect(await exists(join(root, ".boulder/retrospectives"))).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("blocks symlink escape routine fixtures without reading target content", async () => {
    const root = await tempRepo();
    const external = await tempRepo();
    try {
      await writeRoutine(external, "escaped", "escaped should not count", 99, "escaped.json");
      await mkdir(join(root, ".boulder/routines"), { recursive: true });
      await symlink(join(external, "escaped.json"), join(root, ".boulder/routines/escaped.json"));

      const result = await runBoulder(["retro", "weekly", "--dry-run", "--json", "--cwd", root]);
      const payload = parseRetro(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.status).toBe("blocked");
      expect(payload.routineCount).toBe(0);
      expect(payload.improvementCandidates).toEqual([]);
      expect(payload.skillProposalCandidates).toEqual([]);
      expect(payload.warnings).toEqual([".boulder/routines/escaped.json: unsafe routine artifact path"]);
      expect(await exists(join(root, ".boulder/retrospectives"))).toBe(false);
    } finally {
      await removeTempRepo(root);
      await removeTempRepo(external);
    }
  });

  test("requires dry-run and never creates a retrospective write path", async () => {
    const root = await tempRepo();
    try {
      await writeRoutine(root, "daily-issue-review", "daily issue review", 2);

      const missingMode = await runBoulder(["retro", "weekly", "--json", "--cwd", root]);
      const dryRun = await runBoulder(["retro", "weekly", "--dry-run", "--json", "--cwd", root]);

      expect(missingMode.exitCode).toBe(1);
      expect(missingMode.stdout).toBe("");
      expect(missingMode.stderr.trim()).toBe("ERROR retro.mode_required: Use --dry-run.");
      expect(dryRun.exitCode).toBe(0);
      expect(await exists(join(root, ".boulder/retrospectives"))).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("renders attached evidence refs and a resolved trace binding without changing candidates", async () => {
    const root = await tempRepo();
    try {
      const bindingId = await writeTraceBinding(root);
      await writeRoutine(root, "daily-issue-review", "daily issue review", 3, `.boulder/routines/daily-issue-review.json`, {
        evidenceRefs: [
          { kind: "manual", path: ".boulder/runs/review.json" },
          { kind: "trace", path: `.boulder/evidence/traces/${bindingId}.json` }
        ],
        // Legacy snake_case twin: merged into the same attached-evidence view.
        evidence_refs: [".boulder/evidence/manual/qa-checks.json"]
      });

      const jsonResult = await runBoulder(["retro", "weekly", "--dry-run", "--json", "--cwd", root]);
      const payload = parseRetro(jsonResult.stdout);
      const textResult = await runBoulder(["retro", "weekly", "--dry-run", "--cwd", root]);

      expect(jsonResult.exitCode).toBe(0);
      expect(payload.attachedEvidence).toEqual([
        { routineId: "daily-issue-review", kind: "manual", path: ".boulder/runs/review.json" },
        { routineId: "daily-issue-review", kind: "trace", path: `.boulder/evidence/traces/${bindingId}.json`, descriptorId: bindingId },
        { routineId: "daily-issue-review", kind: "manual", path: ".boulder/evidence/manual/qa-checks.json", descriptorId: "qa-checks" }
      ]);
      expect(payload.traceBindings).toEqual([{
        routineId: "daily-issue-review",
        bindingId,
        snapshotId: "fixture-snapshot",
        commandRunId: "11111111-2222-3333-4444-555555555555"
      }]);
      expect(textResult.exitCode).toBe(0);
      expect(textResult.stdout).toContain("Attached evidence");
      expect(textResult.stdout).toContain(`- evidence: daily-issue-review kind=manual path=.boulder/runs/review.json`);
      expect(textResult.stdout).toContain(`- evidence: daily-issue-review kind=trace path=.boulder/evidence/traces/${bindingId}.json id=${bindingId}`);
      expect(textResult.stdout).toContain(`- evidence: daily-issue-review kind=manual path=.boulder/evidence/manual/qa-checks.json id=qa-checks`);
      expect(textResult.stdout).toContain(`- trace-binding: daily-issue-review binding=${bindingId} snapshot=fixture-snapshot run=11111111-2222-3333-4444-555555555555`);
      expect(payload.improvementCandidates.map((item) => item.routineId)).toEqual(["daily-issue-review"]);
      expect(payload.warnings).toEqual([]);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("marks a referenced binding without resolvable backing as unavailable", async () => {
    const root = await tempRepo();
    try {
      const bindingId = "a".repeat(64);
      await writeRoutine(root, "daily-issue-review", "daily issue review", 2, `.boulder/routines/daily-issue-review.json`, {
        evidenceRefs: [{ kind: "trace", path: `.boulder/evidence/traces/${bindingId}.json` }]
      });

      const result = await runBoulder(["retro", "weekly", "--dry-run", "--cwd", root]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(`- trace-binding: daily-issue-review binding=${bindingId} (backing unavailable)`);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("empty and blocked reports omit the attached evidence section cleanly", async () => {
    const root = await tempRepo();
    const blocked = await tempRepo();
    try {
      await writeRoutine(blocked, "escape", "escape should not count", 99, ".boulder/routines/..escape.json");
      for (const [dir, status] of [[root, "empty"], [blocked, "blocked"]] as const) {
        const text = await runBoulder(["retro", "weekly", "--dry-run", "--cwd", dir]);
        const json = await runBoulder(["retro", "weekly", "--dry-run", "--json", "--cwd", dir]);
        expect(text.exitCode).toBe(0);
        expect(text.stdout).not.toContain("Attached evidence");
        expect(text.stdout).not.toContain("evidence");
        expect(text.stdout).toContain(`- status: ${status}`);
        expect(parseRetro(json.stdout).attachedEvidence).toEqual([]);
        expect(parseRetro(json.stdout).traceBindings).toEqual([]);
      }
    } finally {
      await removeTempRepo(root);
      await removeTempRepo(blocked);
    }
  });
});

type RetroCandidate = {
  readonly routineId: string;
  readonly title: string;
  readonly seenCount: number;
  readonly lastSeenAt: string;
  readonly reason: string;
};

type RetroReport = {
  readonly status: "ready" | "empty" | "blocked";
  readonly period: "weekly";
  readonly routineCount: number;
  readonly improvementCandidates: readonly RetroCandidate[];
  readonly skillProposalCandidates: readonly RetroCandidate[];
  readonly attachedEvidence: readonly Record<string, unknown>[];
  readonly traceBindings: readonly Record<string, unknown>[];
  readonly warnings: readonly string[];
};

async function writeRoutine(root: string, id: string, title: string, seenCount: number, path = `.boulder/routines/${id}.json`, evidence: { evidenceRefs?: readonly Record<string, unknown>[]; evidence_refs?: readonly string[] } = {}): Promise<void> {
  await write(root, path, `${JSON.stringify({
    schemaVersion: 1,
    id,
    title,
    task: title,
    normalizedTask: title,
    profileId: "programming-default",
    createdAt: "2026-06-01T00:00:00.000Z",
    seenCount,
    lastSeenAt: "2026-07-01T00:00:00.000Z",
    evidenceRefs: evidence.evidenceRefs ?? [],
    ...(evidence.evidence_refs === undefined ? {} : { evidence_refs: evidence.evidence_refs })
  }, null, 2)}\n`);
}

// Spec-shaped binding file: content-addressed id like linkTrace would persist,
// without requiring a committed journal fixture.
async function writeTraceBinding(root: string): Promise<string> {
  const { sourceRevisionForDecodedEvent } = await import("../src/trace/contracts");
  const content = {
    schemaVersion: "boulder.trace.binding.v1",
    journal_id: "fixture-journal",
    snapshot_id: "fixture-snapshot",
    snapshot_digest: "b".repeat(64),
    selected_events: [{
      source_row_key: "session-1:1",
      logical_event_id: "event-1",
      source_revision: "c".repeat(64)
    }],
    boulder_command_run_id: "11111111-2222-3333-4444-555555555555",
    binding_basis: "operator_explicit"
  };
  const bindingId = await sourceRevisionForDecodedEvent(content);
  await write(root, `.boulder/trace-state/bindings/${bindingId}.json`, `${JSON.stringify({
    ...content,
    binding_id: bindingId,
    createdAt: "2026-09-25T00:00:00.000Z"
  }, null, 2)}\n`);
  return bindingId;
}

function parseRetro(text: string): RetroReport {
  const parsed = JSON.parse(text);
  if (!isRecord(parsed)
    || !isRetroStatus(parsed["status"])
    || parsed["period"] !== "weekly"
    || typeof parsed["routineCount"] !== "number"
    || !Array.isArray(parsed["improvementCandidates"])
    || !parsed["improvementCandidates"].every(isRetroCandidate)
    || !Array.isArray(parsed["skillProposalCandidates"])
    || !parsed["skillProposalCandidates"].every(isRetroCandidate)
    || !Array.isArray(parsed["warnings"])
    || !parsed["warnings"].every((item) => typeof item === "string")
    || !Array.isArray(parsed["attachedEvidence"])
    || !Array.isArray(parsed["traceBindings"])) {
    throw new Error("invalid retro report");
  }
  return {
    status: parsed["status"],
    period: parsed["period"],
    routineCount: parsed["routineCount"],
    improvementCandidates: parsed["improvementCandidates"],
    skillProposalCandidates: parsed["skillProposalCandidates"],
    attachedEvidence: parsed["attachedEvidence"],
    traceBindings: parsed["traceBindings"],
    warnings: parsed["warnings"]
  };
}

function isRetroCandidate(value: unknown): value is RetroCandidate {
  return isRecord(value)
    && typeof value["routineId"] === "string"
    && typeof value["title"] === "string"
    && typeof value["seenCount"] === "number"
    && typeof value["lastSeenAt"] === "string"
    && typeof value["reason"] === "string";
}

function isRetroStatus(value: unknown): value is RetroReport["status"] {
  return value === "ready" || value === "empty" || value === "blocked";
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
