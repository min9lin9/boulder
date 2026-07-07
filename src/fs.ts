import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function writeText(path: string, content: string, force = false): Promise<"created" | "skipped"> {
  if (!force && await exists(path)) {
    return "skipped";
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return "created";
}

export async function pathIsProtectedLink(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    return info.isSymbolicLink() || (info.isFile() && info.nlink > 1);
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
}

export async function safeReplaceText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(), 0o600);
    await handle.writeFile(content, "utf8");
    await handle.close();
    handle = null;
    await rename(temporary, path);
  } catch (error) {
    try {
      await unlink(temporary);
    } catch (cleanupError) {
      if (!isMissingPath(cleanupError)) throw cleanupError;
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

export function noFollowFlag(): number {
  return typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
}

export function isMissingPath(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, "code") === "ENOENT";
}

export async function protectedWritePathIsSafe(root: string, directory: string, path: string): Promise<boolean> {
  await mkdir(at(root, ".boulder"), { recursive: true });
  if (await pathIsProtectedLink(at(root, ".boulder"))) return false;
  await mkdir(directory, { recursive: true });
  return !await pathIsProtectedLink(directory) && !await pathIsProtectedLink(path);
}

export class UnsafeGeneratedWritePathError extends Error {
  constructor(message = "Generated file path must stay inside the workspace without symlink or hardlink targets.") {
    super(message);
    this.name = "UnsafeGeneratedWritePathError";
  }
}

export async function writeGeneratedText(root: string, relativePath: string, content: string, force = false): Promise<"created" | "skipped"> {
  const rootPath = resolve(root);
  await assertSafeGeneratedRoot(rootPath);
  const target = resolve(rootPath, relativePath);
  const relation = relative(rootPath, target);
  if (!relation || relation.startsWith("..") || isAbsolutePathLike(relation)) {
    throw new UnsafeGeneratedWritePathError();
  }
  await assertSafeGeneratedPath(rootPath, target);
  if (!force && await exists(target)) {
    return "skipped";
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  return "created";
}

async function assertSafeGeneratedRoot(root: string): Promise<void> {
  try {
    const info = await lstat(root);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new UnsafeGeneratedWritePathError();
    }
  } catch (error) {
    if (error instanceof UnsafeGeneratedWritePathError) throw error;
  }
}

async function assertSafeGeneratedPath(root: string, target: string): Promise<void> {
  const parent = dirname(target);
  const segments = relative(root, parent).split(/[\\/]/).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new UnsafeGeneratedWritePathError();
      }
    } catch (error) {
      if (error instanceof UnsafeGeneratedWritePathError) throw error;
    }
  }

  try {
    const info = await lstat(target);
    if (info.isSymbolicLink() || (info.isFile() && info.nlink > 1)) {
      throw new UnsafeGeneratedWritePathError();
    }
  } catch (error) {
    if (error instanceof UnsafeGeneratedWritePathError) throw error;
  }
}

function isAbsolutePathLike(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

export function at(root: string, ...parts: string[]): string {
  return join(root, ...parts);
}
