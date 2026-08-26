import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PLAN_LOCK_STALE_TTL_MS,
  PlanStoreLockError,
  PlanStoreSchemaError,
  acquirePlanLock,
  applyPlanStoreSchemaMigrations,
  ensureSupportedSchemaVersion,
  releasePlanLock
} from "../src/plan-store";

async function tempWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "plan-store-safety-"));
}

describe("plan store operational safety", () => {
  test("fresh foreign locks still fail closed", async () => {
    const root = await tempWorkspace();
    try {
      await acquirePlanLock(root, "run-lock-fresh", { owner: "writer-a", revision: 1 });
      let rejected: unknown;
      try {
        await acquirePlanLock(root, "run-lock-fresh", { owner: "writer-b", revision: 2 });
      } catch (error) {
        rejected = error;
      }
      const lockError = rejected as PlanStoreLockError;
      expect(lockError.name).toBe("PlanStoreLockError");
      expect(lockError.message).toContain("locked");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("stale locks older than the TTL are recovered instead of blocking forever", async () => {
    const root = await tempWorkspace();
    try {
      const runId = "run-lock-stale";
      await acquirePlanLock(root, runId, { owner: "writer-a", revision: 1 });
      const lockPath = join(root, ".boulder", "plans", runId, "lock");
      const past = new Date(Date.now() - (DEFAULT_PLAN_LOCK_STALE_TTL_MS + 60_000));
      await utimes(lockPath, past, past);
      await acquirePlanLock(root, runId, { owner: "writer-b", revision: 2 }, { staleTtlMs: DEFAULT_PLAN_LOCK_STALE_TTL_MS });
      await releasePlanLock(root, runId, { owner: "writer-b", revision: 2 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("unknown future schemaVersions are rejected with a typed id", () => {
    let supported: unknown;
    try {
      ensureSupportedSchemaVersion("boulder.planner-local-event.v1");
    } catch (error) {
      supported = error;
    }
    expect(supported === undefined).toBe(true);
    let caught: unknown;
    try {
      ensureSupportedSchemaVersion("boulder.planner-local-event.v9");
    } catch (error) {
      caught = error;
    }
    const schemaError = caught as PlanStoreSchemaError;
    expect(schemaError.name).toBe("PlanStoreSchemaError");
    expect(schemaError.id).toBe("plan.schema.unsupported");
  });

  test("migration registry passes through current records and refuses unknown ones", () => {
    const current = { schemaVersion: "boulder.planner-local-event.v1", kind: "planner.error", status: "failed", revision: 1, occurredAt: "2026-08-26T00:00:00.000Z" };
    expect(applyPlanStoreSchemaMigrations(current)).toEqual(current);
    let caught: unknown;
    try {
      applyPlanStoreSchemaMigrations({ ...current, schemaVersion: "boulder.planner-local-event.v9" });
    } catch (error) {
      caught = error;
    }
    expect((caught as PlanStoreSchemaError).id).toBe("plan.schema.unsupported");
  });
});
