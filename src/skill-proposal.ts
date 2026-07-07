import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { lstat, open } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { at, isMissingPath, noFollowFlag, pathIsProtectedLink, protectedWritePathIsSafe, safeReplaceText } from "./fs";
import { isRoutineArtifact, isSafeEvidencePath, type EvidenceRef, type RoutineArtifact } from "./routine";

export type SkillProposalResult = {
  readonly status: "dry-run" | "written";
  readonly path: string;
  readonly markdown: string;
};

export class InvalidSkillProposalRoutineIdError extends Error {
  constructor() {
    super("Routine id must be a slug.");
    this.name = "InvalidSkillProposalRoutineIdError";
  }
}

export class MissingSkillProposalRoutineError extends Error {
  constructor() {
    super("Routine artifact not found.");
    this.name = "MissingSkillProposalRoutineError";
  }
}

export class InvalidSkillProposalArtifactError extends Error {
  constructor(message = "Routine artifact is not valid.") {
    super(message);
    this.name = "InvalidSkillProposalArtifactError";
  }
}

export async function proposeSkillFromRoutine(root: string, routineId: string | null, write: boolean): Promise<SkillProposalResult> {
  const id = parseRoutineId(routineId);
  const routine = await loadRoutineForProposal(root, id);
  const path = proposalPath(root, id);
  if (!proposalPathIsValid(root, path)) throw new InvalidSkillProposalArtifactError("Skill proposal path must stay under .boulder/skill-proposals.");
  const markdown = skillProposalMarkdown(routine);
  if (write) {
    if (!await proposalPathIsSafe(root, path)) throw new InvalidSkillProposalArtifactError("Skill proposal path must stay under .boulder/skill-proposals.");
    await safeReplaceText(path, markdown);
    if (!await proposalPathIsSafe(root, path)) throw new InvalidSkillProposalArtifactError("Skill proposal path must stay under .boulder/skill-proposals.");
  }
  return { status: write ? "written" : "dry-run", path: `.boulder/skill-proposals/${id}.md`, markdown };
}

function parseRoutineId(value: string | null): string {
  const id = value ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || /[\u0000-\u001F\u007F]/.test(id) || id.includes("\\0")) {
    throw new InvalidSkillProposalRoutineIdError();
  }
  return id;
}

async function loadRoutineForProposal(root: string, id: string): Promise<RoutineArtifact> {
  const path = at(root, ".boulder", "routines", `${id}.json`);
  if (await pathIsProtectedLink(at(root, ".boulder", "routines")) || await pathIsProtectedLink(path)) {
    throw new InvalidSkillProposalArtifactError("Routine artifact path is unsafe.");
  }
  try {
    const info = await lstat(path);
    if (!info.isFile()) throw new InvalidSkillProposalArtifactError();
    const handle = await open(path, constants.O_RDONLY | noFollowFlag());
    return await readRoutineFromHandle(handle, id);
  } catch (error) {
    if (isMissingPath(error)) throw new MissingSkillProposalRoutineError();
    throw error;
  }
}

async function readRoutineFromHandle(handle: FileHandle, id: string): Promise<RoutineArtifact> {
  try {
    const parsed: unknown = JSON.parse(await handle.readFile("utf8"));
    if (!isRoutineArtifact(parsed) || parsed.id !== id) throw new InvalidSkillProposalArtifactError();
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) throw new InvalidSkillProposalArtifactError();
    throw error;
  } finally {
    await handle.close();
  }
}

function skillProposalMarkdown(routine: RoutineArtifact): string {
  const evidence = safeEvidenceRefs(routine.evidenceRefs);
  return [
    `# Skill Proposal: ${safeMetadataText(routine.title)}`,
    "",
    "## Required Context",
    `- routine-id: ${routine.id}`,
    `- routine-title: ${safeMetadataText(routine.title)}`,
    `- profile-id: ${safeMetadataText(routine.profileId)}`,
    `- seen-count: ${routine.seenCount}`,
    `- last-seen-at: ${safeMetadataText(routine.lastSeenAt)}`,
    "",
    "## Allowed Tools",
    "- local repo inspection",
    "- local tests",
    "- local file edits in reviewed paths",
    "",
    "## Evidence Source Metadata",
    ...formatEvidence(evidence),
    "",
    "## Review Checklist",
    "- [ ] Confirm this packet is metadata-only.",
    "- [ ] Confirm the reusable workflow remains review-only.",
    "- [ ] Confirm no private excerpts or credentials are present.",
    ""
  ].join("\n");
}

function safeMetadataText(value: string): string {
  if (containsSensitiveText(value)) return "[redacted]";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim() || "[redacted]";
}

function containsSensitiveText(value: string): boolean {
  return /sk-[a-z0-9_-]+/i.test(value)
    || /\bsecret\s*=/i.test(value)
    || /\btoken\b/i.test(value)
    || /\bAKIA[0-9A-Z]{16}\b/.test(value);
}

function safeEvidenceRefs(refs: readonly EvidenceRef[]): readonly EvidenceRef[] {
  return refs.filter((ref) => safeEvidenceKind(ref.kind) && isSafeEvidencePath(ref.path) && !containsSensitiveText(`${ref.kind} ${ref.path} ${ref.hash ?? ""} ${ref.note ?? ""}`));
}

function safeEvidenceKind(kind: string): boolean {
  return /^(routine|retro|test|verification|manual)$/.test(kind);
}

function formatEvidence(refs: readonly EvidenceRef[]): readonly string[] {
  if (refs.length === 0) return ["- evidence: none"];
  return refs.map((ref) => `- evidence: kind=${safeMetadataText(ref.kind)} path=${safeMetadataText(ref.path)}`);
}

function proposalPath(root: string, id: string): string {
  return at(root, ".boulder", "skill-proposals", `${id}.md`);
}

function proposalPathIsValid(root: string, path: string): boolean {
  const base = resolve(root, ".boulder", "skill-proposals");
  const relation = relative(base, path).replace(/\\/g, "/");
  return relation.length > 0 && relation !== ".." && !relation.startsWith("../") && /^[a-z0-9-]+\.md$/.test(relation);
}

async function proposalPathIsSafe(root: string, path: string): Promise<boolean> {
  return protectedWritePathIsSafe(root, at(root, ".boulder", "skill-proposals"), path);
}
