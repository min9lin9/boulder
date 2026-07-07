import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { optionValue } from "./cli-options";
import { at } from "./fs";
import { InvalidHandoffAdapterError } from "./handoff-packet";

export class UnsafeHandoffPathError extends Error {
  constructor() {
    super("Handoff path changed during safe file access.");
    this.name = "UnsafeHandoffPathError";
  }
}

export function packetPathFromArgs(args: readonly string[], cwd: string): string {
  const explicit = optionValue(args, "--packet");
  if (explicit) return resolve(cwd, explicit);
  const adapter = optionValue(args, "--adapter") ?? "gajae-code";
  if (!safeAdapterName(adapter)) {
    throw new InvalidHandoffAdapterError();
  }
  return packetFile(cwd, adapter);
}

export function packetFile(root: string, adapter: string): string {
  return at(root, ".boulder", "handoffs", `${adapter}.json`);
}

export function validPacketPath(path: string, root: string): boolean {
  const base = resolve(root, ".boulder", "handoffs");
  const relation = relative(base, path).replace(/\\/g, "/");
  return relation.length > 0 && !relation.startsWith("../") && relation !== "..";
}

export async function packetPathIsSafe(path: string, root: string): Promise<boolean> {
  return validPacketPath(path, root)
    && !await pathIsSymlink(at(root, ".boulder"))
    && !await pathIsSymlink(at(root, ".boulder", "handoffs"))
    && !await pathHasSymlinkSegment(path, root)
    && !await pathIsSymlink(path)
    && !await pathIsHardLink(path)
    && !await pathIsSymlink(receiptFile(path))
    && !await pathIsHardLink(receiptFile(path))
    && !await pathIsSymlink(reviewSecretFile(root))
    && !await pathIsHardLink(reviewSecretFile(root));
}

export async function writeReviewReceipt(path: string, root: string, packetText: string): Promise<string> {
  const nonce = reviewNonce();
  const secret = await reviewSecret(root);
  const packetHash = await sha256Hex(packetText);
  const signature = await hmacHex(secret, `receipt:${nonce}:${packetText}`);
  const approvalCode = await hmacHex(secret, `approval:${nonce}:${packetText}`);
  const approvalDigest = await sha256Hex(approvalCode);
  await safeReplaceText(receiptFile(path), receiptText(path, packetHash, nonce, signature, approvalDigest));
  return approvalCode;
}

export async function hasReviewReceipt(path: string, root: string, packetText: string, approvalCode: string | null): Promise<boolean> {
  const receipt = await safeReadText(receiptFile(path));
  const secret = await safeReadText(reviewSecretFile(root));
  return receipt !== null && secret !== null && approvalCode !== null
    && await receiptIsValid(receipt, path, packetText, secret.trim(), approvalCode);
}

export async function readHandoffPacketText(path: string, root: string): Promise<string | null> {
  if (!await packetPathIsSafe(path, root)) throw new UnsafeHandoffPathError();
  const text = await safeReadText(path);
  if (!await packetPathIsSafe(path, root)) throw new UnsafeHandoffPathError();
  return text;
}

export async function writeHandoffPacketText(path: string, root: string, content: string): Promise<void> {
  if (!await packetPathIsSafe(path, root)) throw new UnsafeHandoffPathError();
  await safeReplaceText(path, content);
  if (!await packetPathIsSafe(path, root)) throw new UnsafeHandoffPathError();
}

function receiptFile(path: string): string {
  return `${path}.reviewed`;
}

function pathBaseName(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter((part) => part.length > 0).at(-1) ?? path;
}

function safeAdapterName(adapter: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(adapter);
}

function receiptText(path: string, packetHash: string, nonce: string, signature: string, approvalDigest: string): string {
  return [
    "schema: boulder.handoff.review.v1",
    `packet: ${pathBaseName(path)}`,
    `digest: ${packetHash}`,
    `nonce: ${nonce}`,
    `signature: ${signature}`,
    `approval-digest: ${approvalDigest}`,
    ""
  ].join("\n");
}

async function receiptIsValid(receipt: string, path: string, packetText: string, secret: string, approvalCode: string): Promise<boolean> {
  const lines = Object.fromEntries(receipt.trimEnd().split("\n").map((line) => {
    const separator = line.indexOf(":");
    return separator < 0 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 1).trim()];
  }));
  const nonce = lines["nonce"];
  if (typeof nonce !== "string" || !/^[a-f0-9]{32}$/.test(nonce)) return false;
  const packetHash = await sha256Hex(packetText);
  const signature = await hmacHex(secret, `receipt:${nonce}:${packetText}`);
  const approvalDigest = await sha256Hex(approvalCode);
  const expectedApprovalCode = await hmacHex(secret, `approval:${nonce}:${packetText}`);
  return lines["schema"] === "boulder.handoff.review.v1"
    && lines["packet"] === pathBaseName(path)
    && lines["digest"] === packetHash
    && lines["signature"] === signature
    && lines["approval-digest"] === approvalDigest
    && approvalCode === expectedApprovalCode;
}

async function sha256Hex(text: string): Promise<string> {
  return hexFromBuffer(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hexFromBuffer(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function hexFromBuffer(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

async function pathIsSymlink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

async function pathIsHardLink(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    const isFile = Reflect.get(info, "isFile");
    const nlink = Reflect.get(info, "nlink");
    return typeof isFile === "function" && isFile.call(info) === true && typeof nlink === "number" && nlink > 1;
  } catch {
    return false;
  }
}

async function pathHasSymlinkSegment(path: string, root: string): Promise<boolean> {
  const base = resolve(root, ".boulder", "handoffs");
  const relation = relative(base, path).replace(/\\/g, "/");
  const parts = relation.split("/").filter((part) => part.length > 0);
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (await pathIsSymlink(resolve(base, ...parts.slice(0, index + 1)))) return true;
  }
  return false;
}

function reviewNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

async function reviewSecret(root: string): Promise<string> {
  const path = reviewSecretFile(root);
  const existing = await safeReadText(path);
  if (existing) return existing.trim();
  const secret = reviewNonce();
  await safeReplaceText(path, `${secret}\n`);
  return secret;
}

function reviewSecretFile(root: string): string {
  return at(root, ".boulder", "review-secret");
}

async function safeReadText(path: string): Promise<string | null> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(path, constants.O_RDONLY | noFollowFlag());
    const info = await handle.stat();
    if (!info.isFile() || info.nlink > 1) throw new UnsafeHandoffPathError();
    return await handle.readFile("utf8");
  } catch (error) {
    if (isMissingPath(error)) return null;
    if (isUnsafeOpen(error)) throw new UnsafeHandoffPathError();
    throw error;
  } finally {
    await handle?.close();
  }
}

async function safeReplaceText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${reviewNonce()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(), 0o600);
    await handle.writeFile(content, "utf8");
    await handle.close();
    handle = null;
    await rename(temporary, path);
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile() || info.nlink > 1) throw new UnsafeHandoffPathError();
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    if (isUnsafeOpen(error)) throw new UnsafeHandoffPathError();
    throw error;
  } finally {
    await handle?.close();
  }
}

function noFollowFlag(): number {
  return typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
}

function isMissingPath(error: unknown): boolean {
  return isCode(error, "ENOENT");
}

function isUnsafeOpen(error: unknown): boolean {
  return isCode(error, "ELOOP") || isCode(error, "EMLINK");
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && Reflect.get(error, "code") === code;
}
