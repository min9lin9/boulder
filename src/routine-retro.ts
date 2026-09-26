import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { at, isMissingPath, noFollowFlag, pathIsProtectedLink } from "./fs";
import { isRoutineArtifact, isSafeEvidencePath, routineEvidenceRefs, type RoutineArtifact } from "./routine";

const ROUTINE_FILESYSTEM_ERROR_CODES = ["EACCES", "EPERM", "EISDIR", "ENOTDIR", "ELOOP", "ENAMETOOLONG", "EIO"] as const;

export type RetroCandidate = {
  readonly routineId: string;
  readonly title: string;
  readonly seenCount: number;
  readonly lastSeenAt: string;
  readonly reason: string;
};

export type RetroAttachedEvidence = {
  readonly routineId: string;
  readonly kind: string;
  readonly path: string;
  // Set only for .boulder/evidence/<kind>/<id>.json descriptor references.
  readonly descriptorId?: string;
};

export type RetroTraceBinding = {
  readonly routineId: string;
  readonly bindingId: string;
  // Present when the binding record under .boulder/trace-state/bindings resolves.
  readonly snapshotId?: string;
  readonly commandRunId?: string;
};

export type WeeklyRetroReport = {
  readonly status: "ready" | "empty" | "blocked";
  readonly period: "weekly";
  readonly routineCount: number;
  readonly improvementCandidates: readonly RetroCandidate[];
  readonly skillProposalCandidates: readonly RetroCandidate[];
  readonly attachedEvidence: readonly RetroAttachedEvidence[];
  readonly traceBindings: readonly RetroTraceBinding[];
  readonly warnings: readonly string[];
};

export async function evaluateWeeklyRetro(root: string): Promise<WeeklyRetroReport> {
  const base = at(root, ".boulder", "routines");
  if (!await pathExists(base)) return emptyWeeklyRetro([]);
  if (await pathIsProtectedLink(base)) return emptyWeeklyRetro([".boulder/routines: unsafe routine artifact path"], "blocked");
  const warnings: string[] = [];
  const routines: RoutineArtifact[] = [];
  try {
    const entries = await readdir(base);
    for (const entry of entries) {
      const warningPath = `.boulder/routines/${entry}`;
      const path = at(root, ".boulder", "routines", entry);
      const info = await lstat(path);
      if (!info.isFile() || !routineArtifactNameIsSafe(entry) || await pathIsProtectedLink(path)) {
        warnings.push(`${warningPath}: unsafe routine artifact path`);
        continue;
      }
      const routine = await readRoutineArtifactOrWarn(path);
      if (routine === "unreadable") {
        warnings.push(`${warningPath}: unreadable routine artifact`);
        continue;
      }
      if (!routine || routine.id !== routineIdFromFileName(entry) || routine.seenCount < 1) {
        warnings.push(`${warningPath}: malformed routine artifact`);
        continue;
      }
      routines.push(routine);
    }
  } catch (error) {
    if (isMissingPath(error)) return emptyWeeklyRetro(warnings);
    if (!isRoutineFilesystemFailure(error)) throw error;
    warnings.push(".boulder/routines: unreadable routine directory");
  }
  routines.sort((left, right) => right.seenCount - left.seenCount || left.id.localeCompare(right.id));
  return {
    status: routines.length > 0 ? "ready" : warnings.length > 0 ? "blocked" : "empty",
    period: "weekly",
    routineCount: routines.length,
    improvementCandidates: routines.map(improvementCandidate),
    skillProposalCandidates: routines.filter((routine) => routine.seenCount > 1).map(skillProposalCandidate),
    attachedEvidence: routines.flatMap(attachedEvidence),
    traceBindings: await traceBindingsFor(root, routines),
    warnings
  };
}

async function readRoutineArtifact(path: string): Promise<RoutineArtifact | null> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(path, constants.O_RDONLY | noFollowFlag());
    const parsed: unknown = JSON.parse(await handle.readFile("utf8"));
    return isRoutineArtifact(parsed) ? parsed : null;
  } catch (error) {
    if (error instanceof SyntaxError || isMissingPath(error)) return null;
    throw error;
  } finally {
    await handle?.close();
  }
}

async function readRoutineArtifactOrWarn(path: string): Promise<RoutineArtifact | "unreadable" | null> {
  try {
    return await readRoutineArtifact(path);
  } catch (error) {
    if (isRoutineFilesystemFailure(error)) return "unreadable";
    throw error;
  }
}

function isRoutineFilesystemFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = Reflect.get(error, "code");
  return typeof code === "string" && ROUTINE_FILESYSTEM_ERROR_CODES.some((expected) => expected === code);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
}

function routineArtifactNameIsSafe(name: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(name);
}

function routineIdFromFileName(name: string): string {
  return name.slice(0, -".json".length);
}

function emptyWeeklyRetro(warnings: readonly string[], status: WeeklyRetroReport["status"] = "empty"): WeeklyRetroReport {
  return {
    status,
    period: "weekly",
    routineCount: 0,
    improvementCandidates: [],
    skillProposalCandidates: [],
    attachedEvidence: [],
    traceBindings: [],
    warnings
  };
}

function improvementCandidate(routine: RoutineArtifact): RetroCandidate {
  return {
    routineId: routine.id,
    title: routine.title,
    seenCount: routine.seenCount,
    lastSeenAt: routine.lastSeenAt,
    reason: routine.seenCount > 1
      ? "Repeated routine is ready for weekly improvement review."
      : "Captured routine is ready for weekly improvement review."
  };
}

function skillProposalCandidate(routine: RoutineArtifact): RetroCandidate {
  return {
    routineId: routine.id,
    title: routine.title,
    seenCount: routine.seenCount,
    lastSeenAt: routine.lastSeenAt,
    reason: "Seen at least twice; review for reusable skill proposal."
  };
}

const descriptorRefPattern = /^\.boulder\/evidence\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\.json$/;
const traceDescriptorRefPattern = /^\.boulder\/evidence\/traces?\/([a-f0-9]{64})\.json$/;

function attachedEvidence(routine: RoutineArtifact): readonly RetroAttachedEvidence[] {
  const items: RetroAttachedEvidence[] = [];
  // Merged view: canonical evidenceRefs plus migrated legacy evidence_refs.
  for (const ref of routineEvidenceRefs(routine)) {
    if (!isSafeEvidencePath(ref.path)) continue;
    const descriptorId = descriptorRefPattern.exec(ref.path)?.[2];
    items.push({
      routineId: routine.id,
      kind: ref.kind,
      path: ref.path,
      ...(descriptorId === undefined ? {} : { descriptorId })
    });
  }
  return items;
}

/**
 * Resolve committable trace descriptors whose id is a binding id. Unresolvable
 * or missing backing stays listed with just its binding id: references must
 * never silently claim a verified snapshot/run they do not have.
 */
async function traceBindingsFor(root: string, routines: readonly RoutineArtifact[]): Promise<readonly RetroTraceBinding[]> {
  const candidates: { routineId: string; bindingId: string }[] = [];
  const seen = new Set<string>();
  for (const routine of routines) {
    for (const ref of routineEvidenceRefs(routine)) {
      const bindingId = traceDescriptorRefPattern.exec(ref.path)?.[1];
      if (!bindingId) continue;
      const key = `${routine.id}:${bindingId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ routineId: routine.id, bindingId });
    }
  }
  if (candidates.length === 0) return [];
  // Trace modules stay off the routine/retro hot path (plan C3).
  const { readBinding } = await import("./trace/bindings");
  const bindings: RetroTraceBinding[] = [];
  for (const candidate of candidates) {
    const binding = await readBinding(root, candidate.bindingId).catch(() => null);
    bindings.push({
      routineId: candidate.routineId,
      bindingId: candidate.bindingId,
      ...(binding === null ? {} : { snapshotId: binding.snapshot_id, commandRunId: binding.boulder_command_run_id })
    });
  }
  return bindings;
}
