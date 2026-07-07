import { lstat, mkdir, readFile, stat, writeFile } from "node:fs/promises";
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
