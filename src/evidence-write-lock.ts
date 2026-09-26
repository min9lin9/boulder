/**
 * Shared evidence writer lock: mkdir is the atomic, cross-process primitive.
 * EEXIST always means busy, including a directory with no owner.json. There is
 * no waiting or stealing: age, a PID, or a host name never proves an owner dead.
 * Release requires this handle's acquisition and its original nonce on disk.
 * Callers must await release() in finally on normal completion/cancellation;
 * there are no exit hooks. A crash or interrupted metadata write leaves a lock
 * for an operator, never automatic cleanup. unlockStale requires confirmation;
 * stop all writers before break-glass recovery (it can remove a live lock).
 * Repository path screening rejects links, but is not an OS sandbox against
 * concurrent hostile directory replacement.
 */
import { constants } from "node:fs";
import { lstat, mkdir, open, rmdir, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { at, isMissingPath, noFollowFlag, pathIsProtectedLink, protectedWritePathIsSafe } from "./fs";

// Add only the Node API surface this module needs to the repo's minimal shims.
declare module "node:fs/promises" {
  export function mkdir(path: string, options: { recursive?: boolean; mode?: number }): Promise<void>;
  export function rmdir(path: string): Promise<void>;
}
declare module "node:os" {
  export function hostname(): string;
}

export type WriterOwner = {
  readonly nonce: string;
  readonly pid: number;
  readonly host: string;
  readonly command: string;
  readonly acquiredAt: string;
};

export type WriterLock = {
  readonly path: string;
  readonly owner: WriterOwner;
  readonly held: boolean;
  release(): Promise<void>;
};

export class WriterLockError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "WriterLockError";
  }
}

export class WriterBusyError extends WriterLockError {
  constructor(path: string) {
    super("trace.writer_busy", `Evidence writer lock is held at ${path}. Stop the writer before using trace unlock --confirm.`);
    this.name = "WriterBusyError";
  }
}

export async function acquire(root: string, options: { command: string }): Promise<WriterLock> {
  root = resolve(root);
  const path = lockPath(root);
  if (!await protectedWritePathIsSafe(root, at(root, ".boulder", "trace-state"), path)) {
    throw unsafePath();
  }
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (error instanceof Error && Reflect.get(error, "code") === "EEXIST") throw new WriterBusyError(path);
    throw error;
  }

  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const owner: WriterOwner = Object.freeze({
    nonce,
    pid: (process as typeof process & { readonly pid: number }).pid,
    host: hostname(),
    command: options.command,
    acquiredAt: new Date().toISOString()
  });
  // Never clean up on failed acquisition/metadata publication: without a
  // verified owner we cannot prove that a directory still belongs to us.
  await assertSafePaths(root);
  const file = await open(at(path, "owner.json"), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(), 0o600);
  try {
    await file.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
  } finally {
    await file.close();
  }

  let held = true;
  let releasing: Promise<void> | null = null;
  return {
    path,
    owner,
    get held() { return held; },
    async release() {
      if (!held) return;
      if (!releasing) {
        releasing = (async () => {
          const recorded = await readOwner(root);
          if (recorded?.nonce !== nonce) throw nonceMismatch();
          await unlink(at(path, "owner.json"));
          await rmdir(path);
          held = false;
        })().finally(() => { releasing = null; });
      }
      await releasing;
    }
  };
}

export async function unlockStale(root: string, options: {
  confirm: boolean;
  expectNonce?: string;
  /** Called before refusal/removal so CLI output identifies the inspected owner. */
  onOwner?: (owner: WriterOwner | null) => void;
}): Promise<WriterOwner | null> {
  root = resolve(root);
  const owner = await readOwner(root);
  options.onOwner?.(owner);
  if (!options.confirm) {
    throw new WriterLockError("trace.unlock_confirmation_required", "No lock removed. Stop all writers, then use trace unlock --confirm [--nonce <n>].");
  }
  if (options.expectNonce !== undefined && owner?.nonce !== options.expectNonce) throw nonceMismatch();

  // Printing must not allow a changed owner to be removed on the old evidence.
  const current = await readOwner(root);
  if (current?.nonce !== owner?.nonce) throw nonceMismatch();
  if (owner !== null) await unlink(at(lockPath(root), "owner.json"));
  try {
    // Non-recursive removal: never erase unexpected contents of a lock directory.
    await rmdir(lockPath(root));
  } catch (error) {
    if (isMissingPath(error)) throw new WriterLockError("trace.writer_lock_missing", "No writer lock exists; nothing was removed.");
    throw error;
  }
  return owner;
}

function lockPath(root: string): string {
  return at(root, ".boulder", "trace-state", "writer.lock");
}

async function assertSafePaths(root: string): Promise<void> {
  for (const path of [at(root, ".boulder"), at(root, ".boulder", "trace-state"), lockPath(root), at(lockPath(root), "owner.json")]) {
    if (await pathIsProtectedLink(path)) throw unsafePath();
  }
}

async function readOwner(root: string): Promise<WriterOwner | null> {
  await assertSafePaths(root);
  const path = at(lockPath(root), "owner.json");
  let file: Awaited<ReturnType<typeof open>>;
  try {
    if (!(await lstat(path)).isFile()) throw unsafePath();
    file = await open(path, constants.O_RDONLY | noFollowFlag());
  } catch (error) {
    if (isMissingPath(error)) return null;
    throw error;
  }
  try {
    const info = await file.stat();
    if (!info.isFile() || info.nlink !== 1) throw unsafePath();
    let value: unknown;
    try {
      value = JSON.parse(await file.readFile("utf8"));
    } catch (error) {
      if (error instanceof SyntaxError) throw invalidOwner();
      throw error;
    }
    if (!isWriterOwner(value)) throw invalidOwner();
    return value;
  } finally {
    await file.close();
  }
}

function isWriterOwner(value: unknown): value is WriterOwner {
  if (typeof value !== "object" || value === null) return false;
  const owner = value as Record<string, unknown>;
  return typeof owner.nonce === "string" && /^[a-f0-9]{32}$/.test(owner.nonce)
    && typeof owner.pid === "number" && Number.isSafeInteger(owner.pid) && owner.pid > 0
    && typeof owner.host === "string" && typeof owner.command === "string"
    && typeof owner.acquiredAt === "string" && Number.isFinite(Date.parse(owner.acquiredAt));
}

function unsafePath(): WriterLockError {
  return new WriterLockError("trace.writer_path_unsafe", "Writer lock paths must not be symlinks, hardlinks, or non-regular owner files.");
}

function nonceMismatch(): WriterLockError {
  return new WriterLockError("trace.writer_nonce_mismatch", "Recorded writer nonce does not match; lock was not removed.");
}

function invalidOwner(): WriterLockError {
  return new WriterLockError("trace.writer_owner_invalid", "Writer owner metadata is invalid; lock was not removed.");
}
