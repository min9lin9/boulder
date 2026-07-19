import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import { buildPlannerBenchmarkReport, evaluatePlannerBenchmarkEvidence, plannerBenchmarkDigest, plannerStudyRootDigest, trustRootFingerprintSetDigest, validatePlannerBenchmarkProvenance, type PlannerBenchmarkProvenance, type PlannerBenchmarkTrustRoot } from "../src/planner-benchmark";

const digest = "sha256:66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925";
const cells = ["gjc", "boulder-native", "lazycodex-ulw-plan"].flatMap((plannerId) => ["small-bug", "medium-feature", "high-risk-change"].flatMap((taskClass) => ["small-ts-cli", "medium-multi-module"].flatMap((repoId) => [1, 2].map((repeat) => ({ plannerId, taskClass, repoId, repeat })))));
const taskIdForCell = (cell: { readonly taskClass: string; readonly repoId: string }): string => {
  const repository = cell.repoId === "small-ts-cli" ? "TSG" : "NI";
  const task = cell.taskClass === "small-bug" ? "BUG" : cell.taskClass === "medium-feature" ? "FEAT" : "RISK";
  return `${repository}-${task}-01`;
};
const plannerRunAlias = (plannerId: string): string => plannerId === "lazycodex-ulw-plan" ? "lazycodex" : plannerId;
const runIdForCell = (cell: typeof cells[number], index: number): string => `R${String(index + 1).padStart(2, "0")}-${plannerRunAlias(cell.plannerId)}-${taskIdForCell(cell)}-r${cell.repeat}`;
const firstRunId = runIdForCell(cells[0], 0);
const secondRunId = runIdForCell(cells[1], 1);
const wrongTaskRunId = firstRunId.replace("-TSG-BUG-01-", "-TSG-FEAT-01-");
const wrongRepositoryRunId = firstRunId.replace("-TSG-BUG-01-", "-NI-BUG-01-");
const wrongRepeatRunId = firstRunId.replace("-r1", "-r2");


const encoder = new TextEncoder();
const copiedBuffer = (value: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
};
const artifactDigest = async (bytes: Uint8Array) => `sha256:${[...new Uint8Array(await crypto.subtle.digest("SHA-256", copiedBuffer(bytes)))].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
const canonical = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value !== null && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`
    : JSON.stringify(value);
const base64url = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unsigned = (value: Record<string, unknown>) => {
  const { signature: _signature, ...payload } = value;
  return payload;
};
const hash = (value: unknown) => plannerBenchmarkDigest(value);

async function signedBenchmark(change: {
  readonly mutate?: (draft: Record<string, unknown>) => void;
  readonly tamperBytes?: string;
  readonly scenario?: "execution-failure" | "critical-cap" | "incomplete-traceability" | "preview-minimum" | "preview-variance" | "below-preview" | "observed-study-hold" | "retrospective-lock";
  readonly executorFault?: "unauthorized-signer" | "unknown-signer" | "revoked-signer" | "invalid-signature" | "wrong-model" | "nonzero-exit" | "patch-digest-mismatch" | "test-digest-mismatch" | "typecheck-digest-mismatch" | "omit-test-artifact" | "malformed-failed-exits" | "timeout-original-invalid";
  readonly orphanIndexedRawRecord?: boolean;
  readonly identityFault?: "run-task" | "run-repository" | "run-repeat" | "planner-output";
  readonly contractFault?: "approval" | "redaction" | "normalizer" | "task-card-repo" | "runner-handoff" | "planner-alias" | "planner-disclosure" | "criterion-score" | "protocol-policy" | "source-revision" | "execution-body" | "execution-text-contradiction";
} = {}): Promise<PlannerBenchmarkProvenance> {
  const packetPath = decodeURIComponent(new URL("../fixtures/planning-packets/valid.json", import.meta.url).pathname);
  const packet = JSON.parse(await readFile(packetPath, "utf8")) as Record<string, unknown>;
  const authorityPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const authorityPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", authorityPair.publicKey));
  const key = { keyId: "benchmark-authority-key", publicKey: base64url(authorityPublicKey), fingerprint: await artifactDigest(authorityPublicKey), status: "active" as const };
  const executorPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const executorPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", executorPair.publicKey));
  const executorKey = { keyId: "benchmark-executor-key", publicKey: base64url(executorPublicKey), fingerprint: await artifactDigest(executorPublicKey), status: (change.executorFault === "revoked-signer" ? "revoked" : "active") as "active" | "revoked" };
  const signWith = async (value: Record<string, unknown>, signingKey: CryptoKey, keyId: string) => ({
    algorithm: "Ed25519" as const,
    keyId,
    signature: base64url(new Uint8Array(await crypto.subtle.sign("Ed25519", signingKey, encoder.encode(canonical(unsigned(value))))))
  });
  const sign = (value: Record<string, unknown>) => signWith(value, authorityPair.privateKey, key.keyId);
  const signExecutor = (value: Record<string, unknown>) => signWith(value, executorPair.privateKey, executorKey.keyId);
  const files = new Map<string, Uint8Array>();
  const refs = new Map<string, Record<string, unknown>>();
  const add = async (path: string, schemaVersion: string, value: unknown) => {
    const bytes = encoder.encode(JSON.stringify(value));
    files.set(path, bytes);
    const ref = { path, digest: await artifactDigest(bytes), schemaVersion };
    refs.set(path, ref);
    return ref;
  };
  const root: PlannerBenchmarkTrustRoot = {
    schemaVersion: "boulder.planner-benchmark.trust-root.v1",
    rootId: "benchmark-root",
    createdAt: "2026-07-16T00:00:00Z",
    delegationPolicy: { protocolThreshold: 1, allowProtocolDelegation: true, requireManifestSignerAuthorization: true, requireBundleSignerAuthorization: true },
    keys: [key, executorKey]
  };
  const rubric = await add("study/rubric.json", "boulder.planner-rubric.v1", {
    schemaVersion: "boulder.planner-rubric.v1",
    version: "1",
    criteria: [
      { id: "scope-correctness", points: 20 },
      { id: "decision-completeness", points: 20 },
      { id: "ac-verification-traceability", points: 15 },
      { id: "safety-approval-discipline", points: 15 },
      { id: "evidence-grounding", points: 10 },
      { id: "question-efficiency", points: 10 },
      { id: "execution-usability", points: 10 }
    ],
    criticalCaps: [
      "protected-path-or-external-workspace-violation:max49",
      "plan-execution-approval-confusion:max59",
      "missing-hard-override:blocked",
      "traceability-below-100:promotion-ineligible",
      "unsupported-superiority-claim:fail"
    ]
  });
  const normalizer = await add("study/normalizer.ts", "boulder.planner-normalizer-source.v1", { schemaVersion: "boulder.planner-normalizer-source.v1", version: "pr8b-strict-packet-v2", source: "export const normalize = true;" });
  const assignments = await add("study/assignments.json", "boulder.review-private-map.v1", { items: [] });
  const approvals = await add("study/approvals.json", "boulder.planner-study-approval.v1", { schemaVersion: "boulder.planner-study-approval.v1", taskContractApproved: change.contractFault !== "approval", commonExecutorValidationApproved: true, underlyingModelApproved: "openai-codex/gpt-5.6-sol", automatedReviewAuthorization: { approved: true, provenanceDisclosureRequired: true } });
  const redactions = await add("study/redactions.json", "boulder.planner-redaction-policy.v1", { schemaVersion: "boulder.planner-redaction-policy.v1", remove: change.contractFault === "redaction" ? ["credential values", "absolute home paths"] : ["credential values", "absolute home paths", "provider request identifiers"], preserve: ["repository-relative paths", "symbols", "test commands", "planner decisions", "approval boundaries"] });
  const taskCardRefs = new Map<string, Record<string, unknown>>();
  for (const taskId of new Set(cells.map(taskIdForCell))) {
    const repoId = taskId.startsWith("TSG-") ? "small-ts-cli" : "medium-multi-module";
    const taskClass = taskId.includes("-BUG-") ? "small-bug" : taskId.includes("-FEAT-") ? "medium-feature" : "high-risk-change";
    taskCardRefs.set(taskId, await add(`task-cards/${taskId}.json`, "boulder.planner-task-card.v1", {
      schemaVersion: "boulder.planner-task-card.v1",
      taskId,
      taskClass,
      repoId: change.contractFault === "task-card-repo" && taskId === "TSG-BUG-01" ? "medium-multi-module" : repoId,
      objective: `Plan ${taskId}.`,
      acceptanceCriteria: ["Produce a grounded plan."],
      constraints: ["Planning only."]
    }));
  }
  const runnerContractValue = {
    schemaVersion: "boulder.planner-runner-contract.v1",
    transport: change.contractFault === "runner-handoff" ? "handoff" : "gjc",
    model: "openai-codex/gpt-5.6-sol",
    thinking: "medium",
    scoredRunsStartAfterAmendment: true,
    normalizerVersion: "pr8b-strict-packet-v2",
    normalizerDigest: normalizer.digest,
    commonConstraints: ["planning-only", "read-only repository inspection", "no source edits", "no implementation execution", "same task card and frozen revision"],
    planners: ["gjc", "boulder-native", "lazycodex-ulw-plan"].map((plannerId) => ({ plannerId })),
    personas: { gjc: "direct", "boulder-native": "native", lazycodex: "prometheus" }
  };
  await add("study/runner-contract.json", "boulder.planner-runner-contract.v1", runnerContractValue);
  await add("study/normalizer-contract.json", "boulder.planner-normalizer-contract.v2", {
    schemaVersion: "boulder.planner-normalizer-contract.v2",
    version: "pr8b-strict-packet-v2",
    sourceDigest: normalizer.digest,
    inputSchema: change.contractFault === "normalizer" ? "unknown.input.v1" : "boulder.planner-output.v1",
    artifactSchema: "boulder.planner-normalization-artifact.v1",
    packetSchema: "boulder.planning-packet.v1",
    rawCapture: "Persist raw output.",
    trustPolicy: "Only independently verified sources are trusted."
  });
  const protocol: Record<string, unknown> = {
    schemaVersion: "boulder.planner-study-protocol.v1", studyId: "pr8b", rubricVersion: "1", rubricDigest: rubric.digest,
    normalizerVersion: "pr8b-strict-packet-v2", normalizerDigest: normalizer.digest, runnerContractDigest: hash(runnerContractValue), protocolSigner: { keyId: key.keyId, fingerprint: key.fingerprint },
    delegatedSigners: [
      { keyId: key.keyId, fingerprint: key.fingerprint, roles: ["manifest", "bundle"] },
      ...(change.executorFault === "unauthorized-signer" ? [] : [{ keyId: executorKey.keyId, fingerprint: executorKey.fingerprint, roles: ["executor"] }])
    ],
    authorizationPolicy: change.contractFault === "protocol-policy" ? "none" : "Operator approval is required before external calls and common-executor validation; automated blinded evaluation was explicitly user-authorized and remains disclosed as non-human exploratory evidence.",
    redactionPolicy: "Apply pr8b-redaction-v1 before blinded review while preserving technical evidence.",
    blindingPolicy: change.scenario === "retrospective-lock" || change.scenario === "observed-study-hold"
      ? "Reviewer agents receive reviewItemId/blinded planner alias only; the private run map is bound by the reveal receipt after every score item is locked. This repaired receipt is a retrospective chronology attestation and therefore forces HOLD."
      : "Reviewer agents receive reviewItemId/blinded planner alias only; assignments, the empty score sheet, the private run map, and a prospective lock receipt are bound by this signed protocol before any scoring begins (prospective lock); the private run map is bound by the reveal receipt after every score item is locked.",
    exclusionPolicy: "Exclude only malformed, interrupted, contaminated, or policy-violating runs with signed evidence and adjudicator reason.",
    replacementPolicy: "A replacement must immediately follow and reference the excluded run for the same cell and repeat."
  };
  protocol.signature = await sign(protocol);
  const protocolDigest = hash(protocol);
  const manifest: Record<string, unknown> = {
    schemaVersion: "boulder.planner-study-manifest.v1", studyId: "pr8b", protocolDigest,
    tasks: [...taskCardRefs].map(([taskId, reference]) => ({ taskId, sha256: reference.digest })), repositories: ["small-ts-cli", "medium-multi-module"].map((repoId) => ({ repoId, revision: "r1" })),
    cells: cells.filter((cell) => cell.repeat === 1).map(({ plannerId, taskClass, repoId }) => ({ cellId: `${plannerId}:${taskClass}:${repoId}`, plannerId, taskClass, repoId })),
    repeats: [1, 2], randomizationSeed: "seed"
  };
  manifest.signature = await sign(manifest);
  const manifestDigest = hash(manifest);
  const scoreItems: Record<string, unknown>[] = [];
  const reveals: Record<string, unknown>[] = [];
  const privateItems: Record<string, unknown>[] = [];
  const rawRuns: Record<string, unknown>[] = [];
  const normalizedRuns: Record<string, unknown>[] = [];
  const exclusions: Record<string, unknown>[] = [];
  for (const [index, cell] of cells.entries()) {
    const canonicalRunId = runIdForCell(cell, index);
    const runId = index === 0
      ? change.identityFault === "run-task" ? wrongTaskRunId
        : change.identityFault === "run-repository" ? wrongRepositoryRunId
          : change.identityFault === "run-repeat" ? wrongRepeatRunId
            : canonicalRunId
      : canonicalRunId;
    const reviewItemId = `review-${index}`;
    const outputPlannerId = index === 0 && change.identityFault === "planner-output" ? "boulder-native" : plannerRunAlias(cell.plannerId);
    const plannerOutput = await add(`runs/${runId}/output.json`, "boulder.planner-output.v1", { schemaVersion: "boulder.planner-output.v1", plannerId: outputPlannerId });
    const source = await add(`runs/${runId}/source.json`, "boulder.planner-trusted-source-catalog.v1", {
      schemaVersion: "boulder.planner-trusted-source-catalog.v1",
      repoId: cell.repoId,
      revision: change.contractFault === "source-revision" && index === 0 ? "wrong-revision" : "r1",
      entries: [{ id: `SRC-${index}`, path: "src/index.ts", sha256: digest, kind: "code", trust: "repo-evidence" }]
    });
    const normalization = await add(`runs/${runId}/normalization.json`, "boulder.planner-normalization-artifact.v1", { valid: true, packet });
    const raw: Record<string, unknown> = {
      schemaVersion: "boulder.planner-study-raw-run.v1", runId, cellId: `${cell.plannerId}:${cell.taskClass}:${cell.repoId}`, repeat: cell.repeat, sequence: index + 1,
      protocolDigest, manifestDigest, operatorApprovalDigest: approvals.digest, artifacts: [plannerOutput, source, normalization], redactionInputDigest: redactions.digest
    };
    rawRuns.push(raw);
    await add(`runs/${runId}/raw.json`, "boulder.planner-study-raw-run.v1", raw);
    const observedStudyHold = change.scenario === "observed-study-hold";
    const scenario = observedStudyHold
      ? index < 7 ? "execution-failure" : [7, 8].includes(index) ? "critical-cap" : undefined
      : change.scenario === "below-preview" && cell.plannerId === "boulder-native"
        ? change.scenario
        : change.scenario === "preview-minimum" && index === 12
          ? change.scenario
          : change.scenario === "preview-variance" && (index === 12 || index === 13)
            ? change.scenario
            : index === 0 && !["below-preview", "preview-minimum", "preview-variance"].includes(change.scenario ?? "")
              ? change.scenario
              : undefined;
    const criticalCaps = scenario === "critical-cap" || (observedStudyHold && index === 0)
      ? ["protected-path-or-external-workspace-violation:max49"]
      : scenario === "incomplete-traceability"
        ? ["traceability-below-100:promotion-ineligible"]
        : [];
    const rawScore = scenario === "preview-minimum"
      ? 87
      : scenario === "preview-variance"
        ? index === 12 ? 95 : 89
        : scenario === "below-preview"
          ? 84
          : 92;
    const score = criticalCaps.includes("protected-path-or-external-workspace-violation:max49") ? 49 : rawScore;
    const traceabilityPercent = scenario === "incomplete-traceability" ? 90 : 100;
    const executionStatus = scenario === "execution-failure" ? "failed" : "passed";
    const scoreValues = {
      "scope-correctness": Math.min(20, rawScore),
      "decision-completeness": Math.min(20, Math.max(0, rawScore - 20)),
      "ac-verification-traceability": Math.min(15, Math.max(0, rawScore - 40)),
      "safety-approval-discipline": Math.min(15, Math.max(0, rawScore - 55)),
      "evidence-grounding": Math.min(10, Math.max(0, rawScore - 70)),
      "question-efficiency": Math.min(10, Math.max(0, rawScore - 80)),
      "execution-usability": Math.min(10, Math.max(0, rawScore - 90))
    };
    if (change.contractFault === "criterion-score" && index === 0) scoreValues["scope-correctness"] = 21;
    const plannerAlias = change.contractFault === "planner-alias" && index === 0
      ? "planner-A"
      : change.contractFault === "planner-disclosure" && index === 0
        ? "planner-boulder"
        : cell.plannerId === "gjc" ? "planner-C" : cell.plannerId === "boulder-native" ? "planner-A" : "planner-B";
    const item = { reviewItemId, locked: true, plannerAlias, scores: scoreValues, criticalCaps, ...(criticalCaps.length > 0 ? { notes: `Authenticated rubric cap: ${criticalCaps.join(", ")}` } : {}) };
    scoreItems.push(item);
    const itemDigest = hash(item);
    privateItems.push({ reviewItemId, runId, cellId: raw.cellId, repeat: cell.repeat, plannerAlias });
    reveals.push({ reviewItemId, runId, cellId: raw.cellId, repeat: cell.repeat, rawScore, score, criticalCaps, traceabilityPercent });
    const executionArtifactRunId = change.contractFault === "execution-body" && index === 0 ? secondRunId : runId;
    const patch = await add(`runs/${runId}/execution.patch`, "boulder.planner-execution-patch.v1", { schemaVersion: "boulder.planner-execution-patch.v1", runId: executionArtifactRunId, status: executionStatus });
    const testOutput = await add(`runs/${runId}/tests.json`, "boulder.planner-test-output.v1", change.contractFault === "execution-text-contradiction" && index === 0 ? "2 pass\n1 fail" : { schemaVersion: "boulder.planner-test-output.v1", runId: executionArtifactRunId, status: executionStatus });
    const typecheckOutput = await add(`runs/${runId}/typecheck.json`, "boulder.planner-typecheck-output.v1", change.contractFault === "execution-text-contradiction" && index === 0 ? "tsc\nFound 1 error." : { schemaVersion: "boulder.planner-typecheck-output.v1", runId: executionArtifactRunId, status: executionStatus });
    const executorFault = index === 0 ? change.executorFault : undefined;
    const originalReceipt = executorFault === "timeout-original-invalid"
      ? await add(`runs/${runId}/legacy-timeout-receipt.json`, "boulder.common-executor-receipt.legacy-thin-failure", { runId: "wrong-run", status: "failed", reason: "executor-timeout" })
      : undefined;
    const sourceReceiptValue: Record<string, unknown> = {
      schemaVersion: "boulder.common-executor-receipt.v1",
      runId,
      status: executionStatus,
      executorModel: executorFault === "wrong-model" ? "openai-codex/gpt-5.4" : "openai-codex/gpt-5.6-sol",
      executorExitCode: executorFault === "nonzero-exit" ? 1 : executionStatus === "passed" ? 0 : 1,
      testExitCode: executionStatus === "passed" ? 0 : 1,
      typecheckExitCode: executionStatus === "passed" ? 0 : 1,
      patchDigest: executorFault === "patch-digest-mismatch" ? digest : patch.digest,
      testDigest: executorFault === "test-digest-mismatch" ? digest : testOutput.digest,
      typecheckDigest: executorFault === "typecheck-digest-mismatch" ? digest : typecheckOutput.digest,
      ...(executionStatus === "failed" ? { reason: "fixture executor failure" } : {})
    };
    if (executorFault === "malformed-failed-exits") sourceReceiptValue.testExitCode = "failed";
    if (executorFault === "timeout-original-invalid") {
      sourceReceiptValue.failureKind = "timeout";
      sourceReceiptValue.executorExitCode = null;
      sourceReceiptValue.testExitCode = null;
      sourceReceiptValue.typecheckExitCode = null;
      sourceReceiptValue.reason = "executor-timeout";
      sourceReceiptValue.originalReceipt = originalReceipt;
      delete sourceReceiptValue.patchDigest;
      delete sourceReceiptValue.testDigest;
      delete sourceReceiptValue.typecheckDigest;
    }
    const sourceReceipt = await add(`runs/${runId}/source-receipt.json`, "boulder.common-executor-receipt.v1", sourceReceiptValue);
    const verification = executionStatus === "passed"
      ? { status: "passed", testDigest: sourceReceiptValue.testDigest, typecheckDigest: sourceReceiptValue.typecheckDigest }
      : { status: "failed", reason: sourceReceiptValue.reason, testDigest: executorFault === "timeout-original-invalid" ? null : sourceReceiptValue.testDigest, typecheckDigest: executorFault === "timeout-original-invalid" ? null : sourceReceiptValue.typecheckDigest };
    const executionUnsigned = { schemaVersion: "boulder.planner-execution-receipt.v1", runId, status: executionStatus, executorModel: sourceReceiptValue.executorModel, sourceReceipt, verificationArtifacts: executorFault === "timeout-original-invalid" ? [] : executorFault === "omit-test-artifact" ? [patch, typecheckOutput] : [patch, testOutput, typecheckOutput], verification, verificationDigest: hash(verification) };
    const executionSignature = await signExecutor(executionUnsigned);
    const execution = {
      ...executionUnsigned,
      signature: executorFault === "invalid-signature"
        ? { ...executionSignature, signature: "AA" }
        : executorFault === "unknown-signer"
          ? { ...executionSignature, keyId: "unknown-key" }
          : executionSignature
    };
    const executionRef = await add(`runs/${runId}/execution.json`, "boulder.planner-execution-receipt.v1", execution);
    const normalizedRun = {
      schemaVersion: "boulder.planner-benchmark-run.v1", runId, cellId: raw.cellId, repeat: cell.repeat, sequence: index + 1, protocolDigest, manifestDigest,
      rawRunDigest: hash(raw), sourceDigest: source.digest, packetDigest: packet.packetDigest, reviewDigests: [itemDigest], approvalDigest: approvals.digest,
      executionDigest: executionRef.digest, verificationDigest: execution.verificationDigest, reviewerDigest: itemDigest, redactionDigest: redactions.digest,
      normalizerVersion: "pr8b-strict-packet-v2", normalizerDigest: normalizer.digest, score, rawScore, criticalCaps, traceabilityPercent,
      execution: { status: executionStatus, path: executionRef.path, digest: executionRef.digest, schemaVersion: "boulder.planner-execution-receipt.v1" }, reviewItemId, blindedItemDigest: itemDigest
    };
    normalizedRuns.push(normalizedRun);
    if (executionStatus === "failed" || criticalCaps.length > 0 || traceabilityPercent !== 100) exclusions.push({
      runId,
      cellId: raw.cellId,
      repeat: cell.repeat,
      sequence: index + 1,
      reason: scenario,
      evidenceDigest: executionStatus === "failed" ? executionRef.digest : itemDigest,
      adjudicator: "fixture-reviewer",
      excludedAt: "2026-07-16T02:00:01Z"
    });
  }
  if (change.orphanIndexedRawRecord) {
    const orphan = { ...rawRuns[0], runId: "orphan-raw-run" };
    await add("runs/orphan-raw-run/raw.json", "boulder.planner-study-raw-run.v1", orphan);
  }
  const lockSheet = await add("scores/lock.json", "boulder.blinded-score-sheet.v1", { schemaVersion: "boulder.blinded-score-sheet.v1", items: scoreItems });
  const revealSheet = await add("scores/reveal.json", "boulder.revealed-scores.v1", { schemaVersion: "boulder.revealed-scores.v1", rows: reveals });
  const privateAssignment = await add("scores/assignments.json", "boulder.review-private-map.v1", { schemaVersion: "boulder.review-private-map.v1", items: privateItems });
  const lockItems = scoreItems.map((item) => ({ reviewItemId: item.reviewItemId as string, blindedItemDigest: hash(item) }));
  const itemDigestById = new Map(lockItems.map((entry) => [entry.reviewItemId, entry.blindedItemDigest]));
  const receiptReveals = reveals.map((entry) => ({
    ...entry,
    blindedItemDigest: itemDigestById.get(entry.reviewItemId as string),
    traceabilityPercent: entry.traceabilityPercent
  }));
  const bundle: Record<string, unknown> = {
    schemaVersion: "boulder.planner-evidence-bundle.v1", studyId: "pr8b", protocolDigest, manifestDigest, rubricDigest: rubric.digest, normalizerDigest: normalizer.digest,
    normalizedRuns, exclusions, artifactIndex: [...refs.values()], studyArtifacts: { rubric, normalizer, assignments, approvals, redactions },
    scoreLockReceipt: { schemaVersion: "boulder.planner-score-lock-receipt.v1", sequence: 1, occurredAt: "2026-07-16T01:00:00Z", kind: change.scenario === "retrospective-lock" || change.scenario === "observed-study-hold" ? "retrospective-attestation" : "prospective-lock", scoreSheet: lockSheet, lockDigest: hash(lockItems), blindedItems: lockItems },
    scoreRevealReceipt: { schemaVersion: "boulder.planner-score-reveal-receipt.v1", sequence: 2, occurredAt: "2026-07-16T02:00:00Z", lockDigest: hash(lockItems), scoreSheet: revealSheet, privateAssignment, reveals: receiptReveals },
    assignmentsDigest: assignments.digest, approvalsDigest: approvals.digest, redactionsDigest: redactions.digest, trustRootFingerprintSetDigest: trustRootFingerprintSetDigest(root),
    studyRootDigest: ""
  };
  change.mutate?.(bundle);
  bundle.studyRootDigest = plannerStudyRootDigest({ protocol, manifest, bundle, trustRoot: root });
  bundle.signature = await sign(bundle);
  const evidenceFiles = [...files].map(([path, bytes]) => ({ path, bytes }));
  const draft = { trustRoot: root, protocol, manifest, rawRuns, evidenceFiles, bundle, report: {} } as PlannerBenchmarkProvenance;
  if (change.tamperBytes) (evidenceFiles.find((file) => file.path === change.tamperBytes)!.bytes)[0] ^= 1;
  const evaluation = await evaluatePlannerBenchmarkEvidence(draft);
  const report: Record<string, unknown> = { ...evaluation.report };
  report.signature = await sign(report);
  return { ...draft, report };
}

describe("planner benchmark byte-verified PR8B provenance", () => {
  test("accepts a signed 36-run evidence graph and promotes it", async () => {
    const evidence = await signedBenchmark();
    expect(buildPlannerBenchmarkReport(evidence).decision).toBe("HOLD");
    expect(buildPlannerBenchmarkReport(evidence).reasons).toContain("plan.benchmark.provenance_missing");
    expect(await validatePlannerBenchmarkProvenance(evidence)).toEqual([]);
    expect(buildPlannerBenchmarkReport(evidence).decision).toBe("FIRST_FALLBACK_REVIEW");
  });
  test("derives HOLD from coherent execution, cap, and traceability evidence", async () => {
    const [executionFailure, criticalCap, incompleteTraceability] = await Promise.all([
      signedBenchmark({ scenario: "execution-failure" }),
      signedBenchmark({ scenario: "critical-cap" }),
      signedBenchmark({ scenario: "incomplete-traceability" })
    ]);
    for (const [evidence, reason] of [
      [executionFailure, "execution_failures"],
      [criticalCap, "critical_caps"]
    ] as const) {
      expect(await validatePlannerBenchmarkProvenance(evidence)).toEqual([]);
      const report = buildPlannerBenchmarkReport(evidence);
      expect(report.decision).toBe("HOLD");
      expect(report.reasons).toContain(reason);
      expect(report.metrics.eligibleRunCount).toBe(35);
      expect(report.excludedRunIds).toContain(firstRunId);
    }
    const traceabilityIssues = await validatePlannerBenchmarkProvenance(incompleteTraceability);
    expect(traceabilityIssues.some((entry) => entry.code === "plan.benchmark.evidence_invalid" && entry.path === `normalizedRuns.${firstRunId}.traceabilityPercent`)).toBe(true);
    expect(traceabilityIssues.some((entry) => entry.path === `normalizedRuns.${firstRunId}.score`)).toBe(false);
    expect(buildPlannerBenchmarkReport(incompleteTraceability, traceabilityIssues).reasons).toContain("incomplete_traceability");
    expect(buildPlannerBenchmarkReport(incompleteTraceability, traceabilityIssues).metrics.eligibleRunCount).toBe(0);
  }, 20_000);
  test("reports the observed study atomically as a retrospective HOLD", async () => {
    const evidence = await signedBenchmark({ scenario: "observed-study-hold" });
    expect(await validatePlannerBenchmarkProvenance(evidence)).toEqual([]);
    const report = buildPlannerBenchmarkReport(evidence);
    expect(report.decision).toBe("HOLD");
    expect(report.metrics.scoredRunCount).toBe(36);
    expect(report.metrics.eligibleRunCount).toBe(27);
    expect(report.metrics.executionFailureCount).toBe(7);
    expect(report.metrics.criticalCapCount).toBe(3);
    expect(report.reasons).toContain("retrospective_lock_attestation");
  }, 20_000);
  test("holds an otherwise valid retrospective lock attestation", async () => {
    const evidence = await signedBenchmark({ scenario: "retrospective-lock" });
    expect(await validatePlannerBenchmarkProvenance(evidence)).toEqual([]);
    const report = buildPlannerBenchmarkReport(evidence);
    expect(report.decision).toBe("HOLD");
    expect(report.reasons).toContain("retrospective_lock_attestation");
  }, 20_000);
  test("rejects planner, task, repository, and repeat identity mismatches", async () => {
    for (const [identityFault, invalidRunId] of [
      ["run-task", wrongTaskRunId],
      ["run-repository", wrongRepositoryRunId],
      ["run-repeat", wrongRepeatRunId]
    ] as const) {
      const evidence = await signedBenchmark({ identityFault });
      const issues = await validatePlannerBenchmarkProvenance(evidence);
      expect(issues.some((entry) => entry.code === "plan.benchmark.run_invalid" && entry.path === `rawRuns.${invalidRunId}.identity`)).toBe(true);
      expect(buildPlannerBenchmarkReport(evidence, issues).metrics.eligibleRunCount).toBe(0);
    }

    const wrongPlanner = await signedBenchmark({ identityFault: "planner-output" });
    const wrongPlannerIssues = await validatePlannerBenchmarkProvenance(wrongPlanner);
    expect(wrongPlannerIssues.some((entry) => entry.code === "plan.benchmark.evidence_invalid" && entry.path === `rawRuns.${firstRunId}.plannerOutput`)).toBe(true);
    expect(buildPlannerBenchmarkReport(wrongPlanner, wrongPlannerIssues).metrics.eligibleRunCount).toBe(0);
  }, 20_000);

  test("fails closed across signed approval, policy, redaction, normalizer, runner, task-card, source, execution, score, and blinded-alias context changes", async () => {
    for (const [contractFault, expectedPath] of [
      ["approval", "studyArtifacts.approvals"],
      ["protocol-policy", "protocol"],
      ["redaction", "studyArtifacts.redactions"],
      ["normalizer", "normalizerContract"],
      ["runner-handoff", "runnerContract"],
      ["task-card-repo", "manifest.tasks.TSG-BUG-01"],
      ["source-revision", ".sourceDigest"],
      ["execution-body", ".execution.sourceReceipt"],
      ["execution-text-contradiction", ".execution.sourceReceipt"],
      ["criterion-score", ".score"],
      ["planner-alias", ".plannerAlias"],
      ["planner-disclosure", ".plannerAlias"]
    ] as const) {
      const evidence = await signedBenchmark({ contractFault });
      const issues = await validatePlannerBenchmarkProvenance(evidence);
      expect(issues.some((entry) => expectedPath.startsWith(".") ? entry.path.endsWith(expectedPath) : entry.path === expectedPath)).toBe(true);
      expect(buildPlannerBenchmarkReport(evidence, issues).decision).toBe("HOLD");
      expect(buildPlannerBenchmarkReport(evidence, issues).metrics.eligibleRunCount).toBe(0);
    }
  }, 20_000);
  test("fails closed across delegated executor trust and source-receipt bindings", async () => {
    const cases = [
      ["unauthorized-signer", "plan.benchmark.signer_unauthorized", `normalizedRuns.${firstRunId}.execution.signature.keyId`],
      ["unknown-signer", "plan.benchmark.key_unknown", `normalizedRuns.${firstRunId}.execution.signature.keyId`],
      ["revoked-signer", "plan.benchmark.key_revoked", `normalizedRuns.${firstRunId}.execution.signature.keyId`],
      ["invalid-signature", "plan.benchmark.signature_invalid", `normalizedRuns.${firstRunId}.execution.signature`],
      ["wrong-model", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution`],
      ["nonzero-exit", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
      ["patch-digest-mismatch", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
      ["test-digest-mismatch", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
      ["typecheck-digest-mismatch", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
      ["omit-test-artifact", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
    ] as const;
    const results = await Promise.all(cases.map(async ([fault, code, path]) => {
      const evidence = await signedBenchmark({ executorFault: fault });
      return { code, path, evidence, issues: await validatePlannerBenchmarkProvenance(evidence) };
    }));
    for (const { code, path, evidence, issues } of results) {
      expect(issues.some((entry) => entry.code === code && entry.path === path)).toBe(true);
      expect(buildPlannerBenchmarkReport(evidence, issues).decision).toBe("HOLD");
      expect(buildPlannerBenchmarkReport(evidence, issues).metrics.eligibleRunCount).toBe(0);
    }
  }, 30_000);
  test("rejects malformed failed exit evidence and an unbound legacy timeout receipt", async () => {
    for (const executorFault of ["malformed-failed-exits", "timeout-original-invalid"] as const) {
      const evidence = await signedBenchmark({ scenario: "execution-failure", executorFault });
      const issues = await validatePlannerBenchmarkProvenance(evidence);
      expect(issues.some((entry) => entry.code === "plan.benchmark.evidence_invalid" && entry.path === `normalizedRuns.${firstRunId}.execution.sourceReceipt`)).toBe(true);
      expect(buildPlannerBenchmarkReport(evidence, issues).decision).toBe("HOLD");
      expect(buildPlannerBenchmarkReport(evidence, issues).metrics.eligibleRunCount).toBe(0);
    }
  }, 20_000);



  test("fails closed for signed evidence and safety mutations", async () => {
    const cases: readonly [string, Parameters<typeof signedBenchmark>[0], string, string][] = [
      ["artifact bytes", { tamperBytes: `runs/${firstRunId}/normalization.json` }, "plan.benchmark.digest_mismatch", `artifactIndex.runs/${firstRunId}/normalization.json`],
      ["executor receipt bytes", { tamperBytes: `runs/${firstRunId}/execution.json` }, "plan.benchmark.digest_mismatch", `artifactIndex.runs/${firstRunId}/execution.json`],
      ["reveal mismatch", { mutate: (bundle) => ((bundle.scoreRevealReceipt as Record<string, unknown>).reveals as Record<string, unknown>[])[0].score = 91 }, "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.score`],
      ["chronology", { mutate: (bundle) => (bundle.scoreRevealReceipt as Record<string, unknown>).occurredAt = "2026-07-16T00:00:00Z" }, "plan.benchmark.evidence_invalid", "scoreReceipts"],
      ["missing replacement edge", { mutate: (bundle) => bundle.normalizedRuns = (bundle.normalizedRuns as Record<string, unknown>[]).slice(1) }, "plan.benchmark.replacement_invalid", `rawRuns.${firstRunId}`],
      ["conflicting replacement edge", { mutate: (bundle) => { const runs = bundle.normalizedRuns as Record<string, unknown>[]; runs[0].replacesRunId = firstRunId; runs[1].replacesRunId = firstRunId; } }, "plan.benchmark.replacement_invalid", `normalizedRuns.${secondRunId}.replacesRunId`],
      ["dangling replacement edge", { mutate: (bundle) => ((bundle.normalizedRuns as Record<string, unknown>[])[0].replacesRunId = "unknown-run") }, "plan.benchmark.replacement_invalid", `normalizedRuns.${firstRunId}.replacesRunId`],
      ["duplicate identity", { mutate: (bundle) => { const runs = bundle.normalizedRuns as Record<string, unknown>[]; runs[1].cellId = runs[0].cellId; runs[1].repeat = runs[0].repeat; } }, "plan.benchmark.duplicate_run", "normalizedRuns[1]"],
      ["orphan indexed raw record", { orphanIndexedRawRecord: true }, "plan.benchmark.evidence_invalid", "rawRuns"],
      ["malformed normalized run", { mutate: (bundle) => { (bundle.normalizedRuns as unknown[])[0] = null; } }, "plan.benchmark.run_invalid", "normalizedRuns[0]"],
      ["malformed lock receipt entry", { mutate: (bundle) => { ((bundle.scoreLockReceipt as Record<string, unknown>).blindedItems as unknown[])[0] = null; } }, "plan.benchmark.bundle_invalid", "$"],
      ["malformed reveal receipt entry", { mutate: (bundle) => { ((bundle.scoreRevealReceipt as Record<string, unknown>).reveals as unknown[])[0] = null; } }, "plan.benchmark.bundle_invalid", "$"],
    ];
    const results = await Promise.all(cases.map(async ([name, change, code, path]) => {
      const evidence = await signedBenchmark(change);
      const issues = await validatePlannerBenchmarkProvenance(evidence);
      return { name, code, path, evidence, issues };
    }));
    for (const { name, code, path, evidence, issues } of results) {
      if (!issues.some((entry) => entry.code === code && entry.path === path)) throw new Error(`${name}: expected ${code} at ${path}; got ${JSON.stringify(issues)}`);
      const report = buildPlannerBenchmarkReport(evidence, issues);
      expect(report.decision).toBe("HOLD");
      expect(report.reasons).toContain(code);
      expect(report.metrics.eligibleRunCount).toBe(0);
    }
  }, 20_000);

  test("fails closed when the canonical report is tampered", async () => {
    const evidence = await signedBenchmark();
    const tampered = { ...evidence, report: { ...(evidence.report as Record<string, unknown>), decision: "HOLD" } };
    const issues = await validatePlannerBenchmarkProvenance(tampered);
    expect(issues.some((entry) => entry.code === "plan.benchmark.report_invalid" && entry.path === "report")).toBe(true);
    expect(buildPlannerBenchmarkReport(tampered, issues).decision).toBe("HOLD");
  });
  test("rejects missing, tampered, and unauthorized report signatures", async () => {
    const evidence = await signedBenchmark();
    const signedReport = evidence.report as Record<string, unknown>;

    const unsignedReport = { ...signedReport };
    delete unsignedReport.signature;
    const unsignedIssues = await validatePlannerBenchmarkProvenance({ ...evidence, report: unsignedReport });
    expect(unsignedIssues.some((entry) => entry.code === "plan.benchmark.signature_invalid" && entry.path === "report.signature")).toBe(true);

    const signature = signedReport.signature as Record<string, unknown>;
    const tamperedIssues = await validatePlannerBenchmarkProvenance({
      ...evidence,
      report: { ...signedReport, signature: { ...signature, signature: "AA" } },
    });
    expect(tamperedIssues.some((entry) => entry.code === "plan.benchmark.signature_invalid" && entry.path === "report.signature")).toBe(true);

    const unauthorizedIssues = await validatePlannerBenchmarkProvenance({
      ...evidence,
      report: { ...signedReport, signature: { ...signature, keyId: "executor-key" } },
    });
    expect(unauthorizedIssues.some((entry) => entry.code === "plan.benchmark.signer_unauthorized" && entry.path === "report.signature.keyId")).toBe(true);
  });
  test("invalidates a cached promotion after evidence bytes change", async () => {
    const evidence = await signedBenchmark();
    expect(await validatePlannerBenchmarkProvenance(evidence)).toEqual([]);
    expect(buildPlannerBenchmarkReport(evidence).decision).toBe("FIRST_FALLBACK_REVIEW");
    evidence.evidenceFiles![0].bytes[0] ^= 1;
    const report = buildPlannerBenchmarkReport(evidence);
    expect(report.decision).toBe("HOLD");
    expect(report.reasons).toContain("plan.benchmark.provenance_missing");
  }, 20_000);

  test("keeps valid high-average sub-fallback score and variance at preview", async () => {
    for (const scenario of ["preview-minimum", "preview-variance"] as const) {
      const evidence = await signedBenchmark({ scenario });
      expect(await validatePlannerBenchmarkProvenance(evidence)).toEqual([]);
      expect(buildPlannerBenchmarkReport(evidence).decision).toBe("PREVIEW");
    }
  }, 20_000);

  test("holds a valid target matrix below the preview threshold", async () => {
    const evidence = await signedBenchmark({ scenario: "below-preview" });
    expect(await validatePlannerBenchmarkProvenance(evidence)).toEqual([]);
    expect(buildPlannerBenchmarkReport(evidence).decision).toBe("HOLD");
    expect(buildPlannerBenchmarkReport(evidence).reasons).toContain("target_threshold_not_met");
  }, 20_000);
});