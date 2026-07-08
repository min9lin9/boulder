import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
import { readText, writeGeneratedText } from "./fs";
import { EVIDENCE_RECOVERY_CODES, type EvidenceRecoveryCode } from "./recovery-codes";
import { evaluateReleaseCheck } from "./release-check";

export type FieldEvidenceStatus = "pass" | "fail";

export type FieldEvidenceCheck = {
  readonly id: string;
  readonly status: FieldEvidenceStatus;
  readonly evidence: string;
};

export type FieldEvidenceResult = {
  readonly status: FieldEvidenceStatus;
  readonly runId: string;
  readonly evidencePath: string;
  readonly manifestPath: string;
  readonly checks: readonly FieldEvidenceCheck[];
};

export type EvidenceArea = "release" | "package" | "docs";
export type EvidenceState = "pass" | "fail";
export type EvidenceInspectItem = { readonly id: string; readonly area: EvidenceArea; readonly state: EvidenceState; readonly evidence: string };
export type EvidenceInspectReport = { readonly schemaVersion: "boulder.evidence.inspect.v1"; readonly status: EvidenceState; readonly evidence: readonly EvidenceInspectItem[] };
export type EvidenceDiffIssue = { readonly code: EvidenceRecoveryCode; readonly message: string; readonly path: string };
export type EvidenceDiffChange = { readonly id: string; readonly fromState: EvidenceState | "missing"; readonly toState: EvidenceState | "missing" };
export type EvidenceDiffReport = { readonly schemaVersion: "boulder.evidence.diff.v1"; readonly status: "ready" | "blocked"; readonly recoveryCode?: EvidenceRecoveryCode; readonly changedEvidenceIds: readonly string[]; readonly changes: readonly EvidenceDiffChange[]; readonly issues: readonly EvidenceDiffIssue[] };

const DECISION_OUTCOMES = ["merge", "reject", "defer", "request-changes"];
const REQUIRED_METRICS = ["time-to-first-readiness-delta", "readiness delta count", "public evidence link count"];

export async function inspectEvidence(root: string): Promise<EvidenceInspectReport> {
  const release = await evaluateReleaseCheck(root);
  const evidence = [
    ...release.checks.map((check): EvidenceInspectItem => ({
      id: `release.${check.id}`,
      area: "release",
      state: check.status,
      evidence: check.evidence
    })),
    await fixtureEvidence(root, "package.inventory", "package", "fixtures/package-inventory/packaged-files.v0.json", isPackageInventory),
    await fixtureEvidence(root, "docs.registry", "docs", "fixtures/docs/doc-registry.v0.json", Array.isArray)
  ];
  return {
    schemaVersion: "boulder.evidence.inspect.v1",
    status: evidence.every((item) => item.state === "pass") ? "pass" : "fail",
    evidence
  };
}

export async function diffEvidence(from: string, to: string): Promise<EvidenceDiffReport> {
  const issues = [...await inputIssues(from), ...await inputIssues(to)];
  if (issues.length > 0) return inputMissingReport(issues);

  const fromItems = keyById((await inspectEvidence(from)).evidence);
  const toItems = keyById((await inspectEvidence(to)).evidence);
  const ids = Array.from(new Set([...fromItems.keys(), ...toItems.keys()])).sort();
  const changes = ids.flatMap((id): EvidenceDiffChange[] => {
    const before = fromItems.get(id);
    const after = toItems.get(id);
    return evidenceChanged(before, after) ? [{
      id,
      fromState: before?.state ?? "missing",
      toState: after?.state ?? "missing"
    }] : [];
  });

  return { schemaVersion: "boulder.evidence.diff.v1", status: "ready", changedEvidenceIds: changes.map((change) => change.id), changes, issues: [] };
}

export async function evaluateFieldEvidence(root: string, runId: string, evidencePath: string): Promise<FieldEvidenceResult> {
  const base = await normalizeEvidencePath(root, runId, evidencePath);
  if (!base) {
    const fallback = safeFallbackPath(runId);
    return {
      status: "fail",
      runId,
      evidencePath: fallback,
      manifestPath: `${fallback}/manifest.json`,
      checks: [{ id: "evidence-path", status: "fail", evidence: "evidence path must stay under evidence/field-readiness/<run-id>" }]
    };
  }
  const checks = [
    await activationTranscriptCheck(root, base),
    await firstReadinessCheck(root, base),
    await deltaCheck(root, base),
    await shareSafeUrlCheck(root, base),
    await decisionCheck(root, base),
    await officialDocsCheck(root, base),
    await metricsCheck(root, base)
  ];
  return {
    status: checks.every((item) => item.status === "pass") ? "pass" : "fail",
    runId,
    evidencePath: base,
    manifestPath: `${base}/manifest.json`,
    checks
  };
}

function defaultEvidencePath(runId: string): string {
  return `evidence/field-readiness/${runId}`;
}

function safeFallbackPath(runId: string): string {
  return safeRunId(runId) ? defaultEvidencePath(runId) : "evidence/field-readiness/invalid-run-id";
}

async function normalizeEvidencePath(root: string, runId: string, evidencePath: string): Promise<string | null> {
  if (!safeRunId(runId)) return null;
  const normalized = evidencePath.replace(/^\/+/, "").replace(/\/+$/, "");
  if (normalized.includes("..")) return null;
  if (normalized !== defaultEvidencePath(runId)) return null;
  return await isContainedDirectory(root, normalized) ? normalized : null;
}

function safeRunId(runId: string): boolean {
  return Boolean(runId) && !runId.includes("/") && !runId.includes("..");
}

async function isContainedDirectory(root: string, relative: string): Promise<boolean> {
  const target = join(root, relative);
  try {
    if ((await lstat(join(root, "evidence", "field-readiness"))).isSymbolicLink()) return false;
    if ((await lstat(target)).isSymbolicLink()) return false;
    const realTarget = await realpath(target);
    const realRoot = await realpath(join(root, "evidence", "field-readiness"));
    return realTarget === join(realRoot, relative.split("/").at(-1) ?? "") && realTarget.startsWith(`${realRoot}/`);
  } catch {
    return true;
  }
}

export async function recordFieldEvidence(root: string, runId: string, evidencePath: string): Promise<FieldEvidenceResult> {
  const result = await evaluateFieldEvidence(root, runId, evidencePath);
  if (result.checks.some((item) => item.id === "evidence-path" && item.status === "fail")) {
    return result;
  }
  await writeGeneratedText(root, result.manifestPath, JSON.stringify(result, null, 2), true);
  return result;
}

function fieldPath(base: string, fileName: string): string {
  return `${base}/${fileName}`;
}

async function activationTranscriptCheck(root: string, base: string): Promise<FieldEvidenceCheck> {
  const relative = fieldPath(base, "activation-transcript.txt");
  const content = await readText(join(root, relative));
  return {
    id: "activation-transcript",
    status: content && content.trim() ? "pass" : "fail",
    evidence: content && content.trim() ? relative : `missing ${relative}`
  };
}

async function firstReadinessCheck(root: string, base: string): Promise<FieldEvidenceCheck> {
  const relative = fieldPath(base, "first-readiness.json");
  const parsed = parseJson(await readText(join(root, relative)));
  const ok = isRecord(parsed) && typeof parsed["status"] === "string";
  return { id: "first-readiness", status: ok ? "pass" : "fail", evidence: ok ? relative : `${relative} must contain JSON object with status` };
}

async function deltaCheck(root: string, base: string): Promise<FieldEvidenceCheck> {
  const relative = fieldPath(base, "second-readiness-delta.json");
  const parsed = parseJson(await readText(join(root, relative)));
  const changed = isRecord(parsed)
    && Array.isArray(parsed["changedRecommendations"])
    && parsed["changedRecommendations"].every((item) => typeof item === "string")
    && parsed["changedRecommendations"].length > 0;
  return { id: "second-readiness-delta", status: changed ? "pass" : "fail", evidence: changed ? relative : `${relative} missing changedRecommendations` };
}

async function shareSafeUrlCheck(root: string, base: string): Promise<FieldEvidenceCheck> {
  const relative = fieldPath(base, "share-safe-artifact-url.txt");
  const content = await readText(join(root, relative));
  const isPublicUrl = content?.trim().startsWith("https://github.com/") === true;
  return { id: "share-safe-artifact-url", status: isPublicUrl ? "pass" : "fail", evidence: isPublicUrl ? relative : `${relative} must be a public GitHub URL` };
}

async function decisionCheck(root: string, base: string): Promise<FieldEvidenceCheck> {
  const relative = fieldPath(base, "decision-log.json");
  const parsed = parseJson(await readText(join(root, relative)));
  const outcome = isRecord(parsed) && typeof parsed["outcome"] === "string" ? parsed["outcome"] : "";
  return {
    id: "decision-log",
    status: DECISION_OUTCOMES.includes(outcome) ? "pass" : "fail",
    evidence: DECISION_OUTCOMES.includes(outcome) ? relative : `${relative} outcome must be one of ${DECISION_OUTCOMES.join(", ")}`
  };
}

async function officialDocsCheck(root: string, base: string): Promise<FieldEvidenceCheck> {
  const relative = fieldPath(base, "official-docs-refresh.json");
  const parsed = parseJson(await readText(join(root, relative)));
  const ok = isRecord(parsed)
    && parsed["officialDocsFirst"] === true
    && Array.isArray(parsed["docsUrls"])
    && parsed["docsUrls"].every((item) => typeof item === "string")
    && parsed["docsUrls"].length > 0;
  return { id: "official-docs-refresh", status: ok ? "pass" : "fail", evidence: ok ? relative : `${relative} must prove officialDocsFirst with docsUrls` };
}

async function metricsCheck(root: string, base: string): Promise<FieldEvidenceCheck> {
  const relative = fieldPath(base, "generated-metrics.json");
  const parsed = parseJson(await readText(join(root, relative)));
  const metrics = isRecord(parsed) && Array.isArray(parsed["metrics"]) ? parsed["metrics"] : [];
  const hasMetrics = metrics.every((item) => typeof item === "string") && REQUIRED_METRICS.every((item) => metrics.includes(item));
  const ok = isRecord(parsed) && parsed["generatedFromEvidence"] === true && hasMetrics;
  return { id: "generated-metrics", status: ok ? "pass" : "fail", evidence: ok ? relative : `${relative} missing generated evidence metrics` };
}

async function fixtureEvidence(
  root: string,
  id: string,
  area: EvidenceArea,
  relativePath: string,
  valid: (value: unknown) => boolean
): Promise<EvidenceInspectItem> {
  const content = await readText(join(root, relativePath));
  const parsed = parseJson(content);
  const ok = content !== null && valid(parsed);
  return {
    id,
    area,
    state: ok ? "pass" : "fail",
    evidence: ok ? relativePath : `missing or invalid ${relativePath}`
  };
}

async function inputIssues(path: string): Promise<readonly EvidenceDiffIssue[]> {
  try {
    return (await lstat(path)).isDirectory() ? [] : [{ code: EVIDENCE_RECOVERY_CODES.inputMissing, message: "evidence input path must be a directory", path }];
  } catch {
    return [{ code: EVIDENCE_RECOVERY_CODES.inputMissing, message: "evidence input path is missing", path }];
  }
}

function inputMissingReport(issues: readonly EvidenceDiffIssue[]): EvidenceDiffReport {
  return { schemaVersion: "boulder.evidence.diff.v1", status: "blocked", recoveryCode: EVIDENCE_RECOVERY_CODES.inputMissing, changedEvidenceIds: [], changes: [], issues };
}

function keyById(items: readonly EvidenceInspectItem[]): ReadonlyMap<string, EvidenceInspectItem> {
  return new Map(items.map((item) => [item.id, item]));
}

function evidenceChanged(before: EvidenceInspectItem | undefined, after: EvidenceInspectItem | undefined): boolean {
  return before?.state !== after?.state || before?.evidence !== after?.evidence;
}

function isPackageInventory(value: unknown): boolean {
  return isRecord(value) && value["schemaVersion"] === "packaged-files.v0" && Array.isArray(value["classes"]);
}

function parseJson(content: string | null): unknown {
  if (!content) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
