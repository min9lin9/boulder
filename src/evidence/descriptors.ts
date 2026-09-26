import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { at, isMissingPath, noFollowFlag } from "../fs";
import { sourceRevisionForDecodedEvent, TraceCanonicalizationError } from "../trace/contracts";

export type EvidenceDescriptor = {
  readonly schema_version: "boulder.evidence-descriptor.v1";
  readonly descriptor_id: string;
  readonly descriptor_kind: string;
  readonly descriptor_path: string;
  readonly hash: string;
  readonly createdAt: string;
};

export class EvidenceDescriptorError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "EvidenceDescriptorError";
  }
}

const identityPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function evidenceDescriptorPath(kind: string, id: string): string {
  if (!identityPattern.test(kind) || !identityPattern.test(id)) {
    throw new EvidenceDescriptorError("evidence.identity_invalid", "Descriptor kind and id must be non-empty safe path components.");
  }
  return `.boulder/evidence/${kind}/${id}.json`;
}

/**
 * SHA-256 of UTF-8 canonical JSON (recursively sorted keys, no whitespace or
 * newline), excluding only the top-level hash field. Including hash itself
 * would require a self-referential digest. All other persisted fields count.
 */
export async function evidenceDescriptorHash(descriptor: Omit<EvidenceDescriptor, "hash"> & { readonly hash?: string }): Promise<string> {
  const { hash, ...content } = descriptor;
  return `sha256:${await sourceRevisionForDecodedEvent(content)}`;
}

/**
 * Mint a descriptor atomically (temp + fsync + rename) when absent, or reuse
 * and authenticate the existing one. The caller must already hold the shared
 * writer lock. A descriptor that survives a retry keeps its first-minted
 * identity and hash, exactly like the content-addressed artifacts it names.
 */
export async function writeEvidenceDescriptor(root: string, kind: string, id: string, createdAt: string): Promise<EvidenceDescriptor> {
  root = resolve(root);
  const path = evidenceDescriptorPath(kind, id);
  try {
    // Reuse path: an existing file must authenticate as this exact descriptor.
    return (await readEvidenceDescriptor(root, kind, id)).descriptor;
  } catch (error) {
    if (!(error instanceof EvidenceDescriptorError && error.code === "evidence.descriptor_missing")) throw error;
  }
  // Same ancestor policy as the reader: every component must be a real
  // directory before any descendant is created or opened.
  for (const directory of [".boulder", ".boulder/evidence", `.boulder/evidence/${kind}`]) {
    const info = await lstat(at(root, directory)).catch((error: unknown) => {
      if (isMissingPath(error)) return null;
      throw error;
    });
    if (info !== null && (info.isSymbolicLink() || !info.isDirectory())) throw unsafePath();
  }
  await mkdir(at(root, ".boulder", "evidence", kind), { recursive: true, mode: 0o700 });
  for (const parent of [root, at(root, ".boulder"), at(root, ".boulder", "evidence")]) await syncDirectory(parent);
  const content: Omit<EvidenceDescriptor, "hash"> = {
    schema_version: "boulder.evidence-descriptor.v1",
    descriptor_id: id,
    descriptor_kind: kind,
    descriptor_path: path,
    createdAt
  };
  const descriptor: EvidenceDescriptor = { ...content, hash: await evidenceDescriptorHash(content) };
  const target = at(root, path);
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(), 0o600);
  try {
    try { await file.writeFile(`${JSON.stringify(descriptor, null, 2)}\n`, "utf8"); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, target);
  } catch (error) {
    try { await unlink(temporary); } catch (cleanup) { if (!isMissingPath(cleanup)) throw cleanup; }
    throw error;
  }
  await syncDirectory(at(root, ".boulder", "evidence", kind));
  return descriptor;
}

/** Authenticate an existing descriptor, never infer an id or create evidence. */
export async function readEvidenceDescriptor(root: string, kind: string, id: string): Promise<{ descriptor: EvidenceDescriptor; path: string }> {
  root = resolve(root);
  const path = evidenceDescriptorPath(kind, id);
  let value: unknown;
  try {
    // Inspect every ancestor before opening: lexical containment alone permits
    // an in-repository symlink to read evidence from outside the repository.
    for (const directory of [".boulder", ".boulder/evidence", `.boulder/evidence/${kind}`]) {
      const info = await lstat(at(root, directory));
      if (info.isSymbolicLink() || !info.isDirectory()) throw unsafePath();
    }
    const target = at(root, path);
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw unsafePath();
    const file = await open(target, constants.O_RDONLY | noFollowFlag());
    try {
      const opened = await file.stat();
      if (!opened.isFile() || opened.nlink !== 1) throw unsafePath();
      value = JSON.parse(await file.readFile("utf8"));
    } finally { await file.close(); }
  } catch (error) {
    if (isMissingPath(error)) throw new EvidenceDescriptorError("evidence.descriptor_missing", "Descriptor file does not exist.");
    if (error instanceof SyntaxError) throw invalidDescriptor();
    throw error;
  }
  if (!isEvidenceDescriptor(value) || value.descriptor_id !== id || value.descriptor_kind !== kind) throw invalidDescriptor();
  const declared = value.descriptor_path;
  const absolute = resolve(root, declared);
  const contained = relative(at(root, ".boulder"), absolute);
  if (/[\\\u0000-\u001F\u007F]/.test(declared) || declared.split("/").some((part) => part === "." || part === "..")
    || !contained || contained === ".." || contained.startsWith("../")
    || (declared !== absolute && declared !== relative(root, absolute))
    || absolute !== at(root, path)) {
    throw unsafePath();
  }
  const { hash, ...content } = value;
  let computed: string;
  try { computed = await evidenceDescriptorHash(content); }
  catch (error) { if (error instanceof TraceCanonicalizationError) throw invalidDescriptor(); throw error; }
  if (computed !== hash) {
    throw new EvidenceDescriptorError("evidence.hash_mismatch", "Descriptor hash does not match its canonical file content.");
  }
  return { descriptor: value, path };
}

function isEvidenceDescriptor(value: unknown): value is EvidenceDescriptor {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return item.schema_version === "boulder.evidence-descriptor.v1"
    && typeof item.descriptor_id === "string" && identityPattern.test(item.descriptor_id)
    && typeof item.descriptor_kind === "string" && identityPattern.test(item.descriptor_kind)
    && typeof item.descriptor_path === "string" && item.descriptor_path.length > 0
    && typeof item.hash === "string" && /^sha256:[a-f0-9]{64}$/.test(item.hash)
    && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt));
}

async function syncDirectory(path: string): Promise<void> {
  const file = await open(path, constants.O_RDONLY | noFollowFlag());
  try { await file.sync(); } finally { await file.close(); }
}

function invalidDescriptor(): EvidenceDescriptorError {
  return new EvidenceDescriptorError("evidence.descriptor_invalid", "Descriptor schema, required fields, or identity is invalid.");
}
function unsafePath(): EvidenceDescriptorError {
  return new EvidenceDescriptorError("evidence.path_invalid", "Descriptor path must name its file under .boulder/evidence without traversal or links.");
}
