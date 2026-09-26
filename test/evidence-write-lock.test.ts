import { describe, expect, test } from "bun:test";
import { link, lstat, mkdir, readFile, readdir, symlink, unlink, writeFile } from "node:fs/promises";
import { acquire, unlockStale, WriterBusyError, WriterLockError, type WriterOwner } from "../src/evidence-write-lock";
import { at } from "../src/fs";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

async function errorCode(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    if (!(error instanceof WriterLockError)) throw error;
    return error.code;
  }
  throw new Error("Expected writer lock operation to fail");
}

async function ownerOnDisk(path: string): Promise<WriterOwner> {
  return JSON.parse(await readFile(at(path, "owner.json"), "utf8"));
}

describe("shared evidence writer lock", () => {
  test("publishes private metadata; release is idempotent and allows reacquisition", async () => {
    const root = await tempRepo();
    try {
      const lock = await acquire(root, { command: "trace collect" });
      expect(lock.path).toBe(at(root, ".boulder", "trace-state", "writer.lock"));
      expect(lock.held).toBe(true);
      expect(lock.owner.nonce).toMatch(/^[a-f0-9]{32}$/);
      expect(lock.owner.pid).toBeGreaterThan(0);
      expect(lock.owner.host.length).toBeGreaterThan(0);
      expect(lock.owner.command).toBe("trace collect");
      expect(Number.isFinite(Date.parse(lock.owner.acquiredAt))).toBe(true);
      expect(await ownerOnDisk(lock.path)).toEqual(lock.owner);
      expect(Reflect.get(await lstat(lock.path), "mode") & 0o777).toBe(0o700);
      expect(Reflect.get(await lstat(at(lock.path, "owner.json")), "mode") & 0o777).toBe(0o600);
      await Promise.all([lock.release(), lock.release()]);
      expect(lock.held).toBe(false);
      const next = await acquire(root, { command: "trace link" });
      expect(next.owner.nonce).not.toBe(lock.owner.nonce);
      await lock.release();
      expect(await ownerOnDisk(next.path)).toEqual(next.owner);
      await next.release();
      expect(next.held).toBe(false);
      expect(await readdir(at(root, ".boulder", "trace-state"))).toEqual([]);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("a failed second acquire is writer_busy and never cleans up the existing owner", async () => {
    const root = await tempRepo();
    try {
      const lock = await acquire(root, { command: "first" });
      let caught: unknown;
      try {
        await acquire(root, { command: "second" });
      } catch (error) {
        caught = error;
      }
      expect(caught instanceof WriterBusyError).toBe(true);
      expect((caught as WriterBusyError).code).toBe("trace.writer_busy");
      expect(lock.held).toBe(true);
      expect(await ownerOnDisk(lock.path)).toEqual(lock.owner);
      await lock.release();
    } finally {
      await removeTempRepo(root);
    }
  });

  test("two concurrent acquires yield exactly one owner without waiting", async () => {
    const root = await tempRepo();
    try {
      const results = await Promise.allSettled([
        acquire(root, { command: "racer-a" }),
        acquire(root, { command: "racer-b" })
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      for (const result of results) {
        if (result.status === "rejected") {
          expect(result.reason instanceof WriterBusyError).toBe(true);
          expect(result.reason.code).toBe("trace.writer_busy");
        } else {
          expect(await ownerOnDisk(result.value.path)).toEqual(result.value.owner);
          await result.value.release();
        }
      }
    } finally {
      await removeTempRepo(root);
    }
  });

  test("old timestamps never authorize stealing", async () => {
    const root = await tempRepo();
    try {
      const lock = await acquire(root, { command: "old-writer" });
      const oldOwner = { ...lock.owner, acquiredAt: "1970-01-01T00:00:00.000Z" };
      await writeFile(at(lock.path, "owner.json"), JSON.stringify(oldOwner), "utf8");
      expect(await errorCode(acquire(root, { command: "new-writer" }))).toBe("trace.writer_busy");
      expect(await ownerOnDisk(lock.path)).toEqual(oldOwner);
      await lock.release();
    } finally {
      await removeTempRepo(root);
    }
  });

  test("release refuses a tampered nonce and retains its held state", async () => {
    const root = await tempRepo();
    try {
      const lock = await acquire(root, { command: "owner" });
      const changed = { ...lock.owner, nonce: lock.owner.nonce === "a".repeat(32) ? "b".repeat(32) : "a".repeat(32) };
      await writeFile(at(lock.path, "owner.json"), JSON.stringify(changed), "utf8");
      expect(await errorCode(lock.release())).toBe("trace.writer_nonce_mismatch");
      expect(lock.held).toBe(true);
      expect(await ownerOnDisk(lock.path)).toEqual(changed);
      await writeFile(at(lock.path, "owner.json"), JSON.stringify(lock.owner), "utf8");
      await lock.release();
      expect(lock.held).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("an old handle cannot remove a new owner after operator unlock", async () => {
    const root = await tempRepo();
    try {
      const old = await acquire(root, { command: "old" });
      expect(await unlockStale(root, { confirm: true, expectNonce: old.owner.nonce })).toEqual(old.owner);
      const current = await acquire(root, { command: "current" });
      expect(await errorCode(old.release())).toBe("trace.writer_nonce_mismatch");
      expect(await ownerOnDisk(current.path)).toEqual(current.owner);
      await current.release();
    } finally {
      await removeTempRepo(root);
    }
  });

  test("a crash between mkdir and owner publication remains busy until explicit unlock", async () => {
    const root = await tempRepo();
    try {
      const path = at(root, ".boulder", "trace-state", "writer.lock");
      await mkdir(path, { recursive: true, mode: 0o700 });
      expect(await errorCode(acquire(root, { command: "contender" }))).toBe("trace.writer_busy");
      expect(await readdir(path)).toEqual([]);
      expect(await errorCode(unlockStale(root, { confirm: false }))).toBe("trace.unlock_confirmation_required");
      expect(await errorCode(unlockStale(root, { confirm: true, expectNonce: "a".repeat(32) }))).toBe("trace.writer_nonce_mismatch");
      expect(await unlockStale(root, { confirm: true })).toBeNull();
      const next = await acquire(root, { command: "recovered" });
      await next.release();
    } finally {
      await removeTempRepo(root);
    }
  });

  test("release cannot remove a lock whose owner metadata disappeared", async () => {
    const root = await tempRepo();
    try {
      const lock = await acquire(root, { command: "interrupted" });
      await unlink(at(lock.path, "owner.json"));
      expect(await errorCode(lock.release())).toBe("trace.writer_nonce_mismatch");
      expect(lock.held).toBe(true);
      expect(await readdir(lock.path)).toEqual([]);
      await unlockStale(root, { confirm: true });
    } finally {
      await removeTempRepo(root);
    }
  });

  test("unlock requires confirmation and an optional matching nonce, and reports the owner first", async () => {
    const root = await tempRepo();
    try {
      const lock = await acquire(root, { command: "inspect-me" });
      let reported: WriterOwner | null = null;
      expect(await errorCode(unlockStale(root, {
        confirm: false,
        onOwner(owner) { reported = owner; }
      }))).toBe("trace.unlock_confirmation_required");
      expect(reported).toEqual(lock.owner);
      expect(await ownerOnDisk(lock.path)).toEqual(lock.owner);
      expect(await errorCode(unlockStale(root, { confirm: true, expectNonce: "wrong" }))).toBe("trace.writer_nonce_mismatch");
      await expect(unlockStale(root, {
        confirm: true,
        onOwner() { throw new Error("output-failed"); }
      })).rejects.toThrow("output-failed");
      expect(await ownerOnDisk(lock.path)).toEqual(lock.owner);
      expect(await unlockStale(root, { confirm: true, expectNonce: lock.owner.nonce })).toEqual(lock.owner);
      expect(await readdir(at(root, ".boulder", "trace-state"))).toEqual([]);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("no-lock inspection writes nothing and confirmed unlock does not claim success", async () => {
    const root = await tempRepo();
    try {
      expect(await errorCode(unlockStale(root, { confirm: false }))).toBe("trace.unlock_confirmation_required");
      expect(await errorCode(unlockStale(root, { confirm: true }))).toBe("trace.writer_lock_missing");
      expect(await readdir(root)).toEqual([]);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("malformed interrupted metadata is never treated as an absent lock", async () => {
    const root = await tempRepo();
    try {
      await write(root, ".boulder/trace-state/writer.lock/owner.json", "{\"nonce\":");
      expect(await errorCode(acquire(root, { command: "contender" }))).toBe("trace.writer_busy");
      expect(await errorCode(unlockStale(root, { confirm: true }))).toBe("trace.writer_owner_invalid");
      expect(await readFile(at(root, ".boulder", "trace-state", "writer.lock", "owner.json"), "utf8")).toBe("{\"nonce\":");
    } finally {
      await removeTempRepo(root);
    }
  });

  for (const relative of [".boulder", ".boulder/trace-state", ".boulder/trace-state/writer.lock"]) {
    test(`rejects a symlink at ${relative} without touching its target`, async () => {
      const root = await tempRepo();
      const outside = await tempRepo();
      try {
        const parts = relative.split("/");
        await mkdir(at(root, ...parts.slice(0, -1)), { recursive: true });
        await symlink(outside, at(root, relative));
        expect(await errorCode(acquire(root, { command: "unsafe" }))).toBe("trace.writer_path_unsafe");
        expect(await errorCode(unlockStale(root, { confirm: true }))).toBe("trace.writer_path_unsafe");
        expect(await readdir(outside)).toEqual([]);
      } finally {
        await removeTempRepo(root);
        await removeTempRepo(outside);
      }
    });
  }

  for (const kind of ["symlink", "hardlink"]) {
    test(`release and unlock reject ${kind} owner metadata`, async () => {
      const root = await tempRepo();
      const outside = await tempRepo();
      try {
        const lock = await acquire(root, { command: "owner" });
        const target = at(outside, "owner.json");
        await writeFile(target, JSON.stringify(lock.owner), "utf8");
        await unlink(at(lock.path, "owner.json"));
        if (kind === "symlink") await symlink(target, at(lock.path, "owner.json"));
        else await link(target, at(lock.path, "owner.json"));
        expect(await errorCode(lock.release())).toBe("trace.writer_path_unsafe");
        expect(await errorCode(unlockStale(root, { confirm: true }))).toBe("trace.writer_path_unsafe");
        expect(await readFile(target, "utf8")).toBe(JSON.stringify(lock.owner));
      } finally {
        await removeTempRepo(root);
        await removeTempRepo(outside);
      }
    });
  }
});

describe("trace unlock CLI", () => {
  test("prints owner on refusal, rejects the wrong nonce, and removes only with confirmation", async () => {
    const root = await tempRepo();
    try {
      const lock = await acquire(root, { command: "cli-owner" });
      const base = ["trace", "unlock", "--cwd", root, "--json"];
      const refused = await runBoulder(base);
      expect(refused.exitCode).toBe(1);
      expect(JSON.parse(refused.stdout).owner).toEqual(lock.owner);
      expect(refused.stderr).toContain("ERROR trace.unlock_confirmation_required:");
      expect(await ownerOnDisk(lock.path)).toEqual(lock.owner);
      const wrongNonce = lock.owner.nonce === "a".repeat(32) ? "b".repeat(32) : "a".repeat(32);
      const mismatch = await runBoulder([...base, "--confirm", "--nonce", wrongNonce]);
      expect(mismatch.exitCode).toBe(1);
      expect(JSON.parse(mismatch.stdout).owner).toEqual(lock.owner);
      expect(mismatch.stderr).toContain("ERROR trace.writer_nonce_mismatch:");
      expect(await ownerOnDisk(lock.path)).toEqual(lock.owner);
      const removed = await runBoulder([...base, "--confirm", "--nonce", lock.owner.nonce]);
      expect(removed.exitCode).toBe(0);
      expect(removed.stderr).toBe("");
      expect(JSON.parse(removed.stdout).owner).toEqual(lock.owner);
      expect(await readdir(at(root, ".boulder", "trace-state"))).toEqual([]);
      const missing = await runBoulder([...base, "--confirm"]);
      expect(missing.exitCode).toBe(1);
      expect(JSON.parse(missing.stdout).owner).toBeNull();
      expect(missing.stderr).toContain("ERROR trace.writer_lock_missing:");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("dry-run and malformed nonce flags never remove a lock", async () => {
    const root = await tempRepo();
    try {
      const lock = await acquire(root, { command: "cli-flags" });
      for (const flags of [["--nonce"], ["--nonce", "invalid"], ["--dry-run"]]) {
        const result = await runBoulder(["trace", "unlock", "--cwd", root, "--confirm", ...flags]);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(flags[0] === "--nonce" ? "ERROR trace.unlock_nonce_invalid:" : "ERROR trace.unlock_dry_run:");
        expect(await ownerOnDisk(lock.path)).toEqual(lock.owner);
      }
      await lock.release();
    } finally {
      await removeTempRepo(root);
    }
  });

  test("recovers a lock with missing owner metadata through the real CLI", async () => {
    const root = await tempRepo();
    try {
      await mkdir(at(root, ".boulder", "trace-state", "writer.lock"), { recursive: true });
      const result = await runBoulder(["trace", "unlock", "--cwd", root, "--confirm", "--json"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout).owner).toBeNull();
      expect(await readdir(at(root, ".boulder", "trace-state"))).toEqual([]);
    } finally {
      await removeTempRepo(root);
    }
  });
});
