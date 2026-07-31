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
const plannerOutputId = (plannerId: string): string => plannerId === "lazycodex-ulw-plan" ? "lazycodex" : plannerId;
const runIdForCell = (cell: typeof cells[number], index: number): string => `R${String(index + 1).padStart(2, "0")}-${cell.plannerId}-${taskIdForCell(cell)}-r${cell.repeat}`;
const firstRunId = runIdForCell(cells[0], 0);
const secondRunId = runIdForCell(cells[1], 1);
const firstLazycodexIndex = cells.findIndex((cell) => cell.plannerId === "lazycodex-ulw-plan");
const firstLazycodexRunId = runIdForCell(cells[firstLazycodexIndex]!, firstLazycodexIndex);
const shortenedLazycodexRunId = firstLazycodexRunId.replace("lazycodex-ulw-plan", "lazycodex");
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
  readonly mutateProtocol?: (draft: Record<string, unknown>) => void;
  readonly mutateReport?: (draft: Record<string, unknown>) => void;
  readonly tamperBytes?: string;
  readonly scenario?: "execution-failure" | "critical-cap" | "incomplete-traceability" | "preview-minimum" | "preview-variance" | "below-preview" | "observed-study-hold" | "retrospective-lock";
  readonly chronologyFault?: "omit-artifacts" | "prospective-kind-mismatch" | "protocol-lock-digest-mismatch" | "protocol-private-map-digest-mismatch";
  readonly executorFault?: "unauthorized-signer" | "unknown-signer" | "revoked-signer" | "invalid-signature" | "wrong-model" | "nonzero-exit" | "patch-digest-mismatch" | "test-digest-mismatch" | "typecheck-digest-mismatch" | "omit-test-artifact" | "malformed-failed-exits" | "legacy-timeout" | "reported-noncompletion" | "reported-noncompletion-original-wrong-signer" | "reported-noncompletion-original-tampered" | "reported-noncompletion-original-invented-digest" | "reported-noncompletion-tail-mismatch" | "reported-noncompletion-extra-artifact" | "reported-noncompletion-missing-artifact" | "reported-noncompletion-invented-digest" | "reported-noncompletion-wrong-reason" | "approval-cycle" | "approval-cycle-original-wrong-signer" | "approval-cycle-original-invented-digest" | "approval-cycle-wrong-status" | "approval-cycle-invented-digest" | "approval-cycle-extra-artifact";
  readonly scopeFault?: "unknown" | "missing" | "execution-mismatch";
  readonly orphanIndexedRawRecord?: boolean;
  readonly identityFault?: "run-task" | "run-repository" | "run-repeat" | "run-planner-alias" | "planner-output";
  readonly contractFault?: "approval" | "redaction" | "normalizer" | "task-card-repo" | "runner-handoff" | "runner-normalizer-contract-digest" | "runner-legacy-normalizer-digest" | "planner-alias" | "planner-disclosure" | "criterion-score" | "protocol-policy" | "source-revision" | "execution-body" | "execution-text-contradiction";
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
  const addText = async (path: string, schemaVersion: string, value: string) => {
    const bytes = encoder.encode(value);
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
  const normalizerContract = await add("study/normalizer-contract.json", "boulder.planner-normalizer-contract.v2", {
    schemaVersion: "boulder.planner-normalizer-contract.v2",
    version: "pr8b-strict-packet-v2",
    sourceDigest: normalizer.digest,
    inputSchema: change.contractFault === "normalizer" ? "unknown.input.v1" : "boulder.planner-output.v1",
    artifactSchema: "boulder.planner-normalization-artifact.v1",
    packetSchema: "boulder.planning-packet.v1",
    rawCapture: "Persist raw output.",
    trustPolicy: "Only independently verified sources are trusted."
  });
  const runnerContractValue = {
    schemaVersion: "boulder.planner-runner-contract.v1",
    transport: change.contractFault === "runner-handoff" ? "handoff" : "gjc",
    model: "openai-codex/gpt-5.6-sol",
    thinking: "medium",
    scoredRunsStartAfterAmendment: true,
    normalizerVersion: "pr8b-strict-packet-v2",
    ...(change.contractFault === "runner-legacy-normalizer-digest"
      ? { normalizerDigest: normalizer.digest }
      : { normalizerContractDigest: change.contractFault === "runner-normalizer-contract-digest" ? digest : normalizerContract.digest }),
    commonConstraints: ["planning-only", "read-only repository inspection", "no source edits", "no implementation execution", "same task card and frozen revision"],
    planners: ["gjc", "boulder-native", "lazycodex-ulw-plan"].map((plannerId) => ({ plannerId })),
    personas: { gjc: "direct", "boulder-native": "native", lazycodex: "prometheus" }
  };
  await add("study/runner-contract.json", "boulder.planner-runner-contract.v1", runnerContractValue);
  const prospectivePolicy = change.scenario !== "retrospective-lock";
  const plannerAliasFor = (cell: typeof cells[number], index: number): string => change.contractFault === "planner-alias" && index === 0
    ? "planner-A"
    : change.contractFault === "planner-disclosure" && index === 0
      ? "planner-boulder"
      : cell.plannerId === "gjc" ? "planner-C" : cell.plannerId === "boulder-native" ? "planner-A" : "planner-B";
  const privateItems: Record<string, unknown>[] = cells.map((cell, index) => ({
    reviewItemId: `review-${index}`,
    runId: runIdForCell(cell, index),
    cellId: `${cell.plannerId}:${cell.taskClass}:${cell.repoId}`,
    repeat: cell.repeat,
    plannerAlias: plannerAliasFor(cell, index)
  }));
  const privateAssignment = await add("scores/assignments.json", "boulder.review-private-map.v1", { schemaVersion: "boulder.review-private-map.v1", items: privateItems });
  const prospectiveItems = cells.map((cell, index) => ({
    reviewItemId: `review-${index}`,
    plannerAlias: plannerAliasFor(cell, index),
    scores: null,
    criticalCaps: null,
    notes: "",
    locked: false
  }));
  const prospectiveScoreSheet = prospectivePolicy
    ? await add("scores/prospective-sheet.json", "boulder.blinded-score-sheet.v1", { schemaVersion: "boulder.blinded-score-sheet.v1", items: prospectiveItems })
    : undefined;
  const prospectiveLockItems = prospectiveItems.map((item) => ({ reviewItemId: item.reviewItemId, blindedItemDigest: hash(item) }));
  const prospectiveScoreLock = prospectiveScoreSheet
    ? await add("scores/prospective-lock.json", "boulder.planner-score-lock-receipt.v1", {
      schemaVersion: "boulder.planner-score-lock-receipt.v1",
      sequence: 1,
      occurredAt: "2026-07-16T00:00:00Z",
      kind: change.chronologyFault === "prospective-kind-mismatch" ? "retrospective-attestation" : "prospective-lock",
      scoreSheet: prospectiveScoreSheet,
      lockDigest: hash(prospectiveLockItems),
      blindedItems: prospectiveLockItems
    })
    : undefined;
  const protocol: Record<string, unknown> = {
    schemaVersion: "boulder.planner-study-protocol.v1", studyId: "pr8b", rubricVersion: "1", rubricDigest: rubric.digest,
    normalizerVersion: "pr8b-strict-packet-v2", normalizerDigest: normalizer.digest, normalizerContractDigest: normalizerContract.digest, runnerContractDigest: hash(runnerContractValue), protocolSigner: { keyId: key.keyId, fingerprint: key.fingerprint },
    delegatedSigners: [
      { keyId: key.keyId, fingerprint: key.fingerprint, roles: ["manifest", "bundle"] },
      ...(change.executorFault === "unauthorized-signer" ? [] : [{ keyId: executorKey.keyId, fingerprint: executorKey.fingerprint, roles: ["executor"] }])
    ],
    authorizationPolicy: change.contractFault === "protocol-policy" ? "none" : "Operator approval is required before external calls and common-executor validation; automated blinded evaluation was explicitly user-authorized and remains disclosed as non-human exploratory evidence.",
    redactionPolicy: "Apply pr8b-redaction-v1 before blinded review while preserving technical evidence.",
    blindingPolicy: prospectivePolicy
      ? "Reviewer agents receive reviewItemId/blinded planner alias only; assignments, the empty score sheet, the private run map, and a prospective lock receipt are bound by this signed protocol before any scoring begins (prospective lock); the private run map is bound by the reveal receipt after every score item is locked."
      : "Reviewer agents receive reviewItemId/blinded planner alias only; the private run map is bound by the reveal receipt after every score item is locked. This repaired receipt is a retrospective chronology attestation and therefore forces HOLD.",
    ...(prospectiveScoreLock
      ? {
        scoreLockReceiptDigest: change.chronologyFault === "protocol-lock-digest-mismatch" ? digest : prospectiveScoreLock.digest,
        privateMapDigest: change.chronologyFault === "protocol-private-map-digest-mismatch" ? digest : privateAssignment.digest
      }
      : {}),
    exclusionPolicy: "Exclude only malformed, interrupted, contaminated, or policy-violating runs with signed evidence and adjudicator reason.",
    replacementPolicy: "A replacement must immediately follow and reference the excluded run for the same cell and repeat."
  };
  change.mutateProtocol?.(protocol);
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
      : change.identityFault === "run-planner-alias" && index === firstLazycodexIndex
        ? shortenedLazycodexRunId
        : canonicalRunId;
    const reviewItemId = `review-${index}`;
    const outputPlannerId = index === 0 && change.identityFault === "planner-output" ? "boulder-native" : plannerOutputId(cell.plannerId);
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
      ? index < 18 ? "execution-failure" : undefined
      : change.scenario === "below-preview" && cell.plannerId === "boulder-native"
        ? change.scenario
        : change.scenario === "preview-minimum" && index === 12
          ? change.scenario
          : change.scenario === "preview-variance" && (index === 12 || index === 13)
            ? change.scenario
            : index === 0 && !["below-preview", "preview-minimum", "preview-variance"].includes(change.scenario ?? "")
              ? change.scenario
              : undefined;
    const criticalCaps = scenario === "critical-cap" || observedStudyHold && index < 13
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
    const plannerAlias = plannerAliasFor(cell, index);
    const item = { reviewItemId, locked: true, plannerAlias, scores: scoreValues, criticalCaps, ...(criticalCaps.length > 0 ? { notes: `Authenticated rubric cap: ${criticalCaps.join(", ")}` } : {}) };
    scoreItems.push(item);
    const itemDigest = hash(item);
    reveals.push({ reviewItemId, runId, cellId: raw.cellId, repeat: cell.repeat, rawScore, score, criticalCaps, traceabilityPercent });
    const executionArtifactRunId = change.contractFault === "execution-body" && index === 0 ? secondRunId : runId;
    const patch = await add(`runs/${runId}/execution.patch`, "boulder.planner-execution-patch.v1", { schemaVersion: "boulder.planner-execution-patch.v1", runId: executionArtifactRunId, status: executionStatus });
    const testOutput = await add(`runs/${runId}/tests.json`, "boulder.planner-test-output.v1", change.contractFault === "execution-text-contradiction" && index === 0 ? "2 pass\n1 fail" : { schemaVersion: "boulder.planner-test-output.v1", runId: executionArtifactRunId, status: executionStatus });
    const typecheckOutput = await add(`runs/${runId}/typecheck.json`, "boulder.planner-typecheck-output.v1", change.contractFault === "execution-text-contradiction" && index === 0 ? "tsc\nFound 1 error." : { schemaVersion: "boulder.planner-typecheck-output.v1", runId: executionArtifactRunId, status: executionStatus });
    const executorFault = index === 0 ? change.executorFault : undefined;
    const reportedNoncompletion = executorFault === "reported-noncompletion"
      || executorFault === "reported-noncompletion-original-wrong-signer"
      || executorFault === "reported-noncompletion-original-tampered"
      || executorFault === "reported-noncompletion-original-invented-digest"
      || executorFault === "reported-noncompletion-tail-mismatch"
      || executorFault === "reported-noncompletion-extra-artifact"
      || executorFault === "reported-noncompletion-missing-artifact"
      || executorFault === "reported-noncompletion-invented-digest"
      || executorFault === "reported-noncompletion-wrong-reason";
    const approvalCycle = executorFault === "approval-cycle"
      || executorFault === "approval-cycle-original-wrong-signer"
      || executorFault === "approval-cycle-original-invented-digest"
      || executorFault === "approval-cycle-wrong-status"
      || executorFault === "approval-cycle-invented-digest"
      || executorFault === "approval-cycle-extra-artifact";
    let originalReceipt: Record<string, unknown> | undefined;
    let stdout: Record<string, unknown> | undefined;
    let stderr: Record<string, unknown> | undefined;
    if (executorFault === "legacy-timeout") {
      originalReceipt = await add(`runs/${runId}/legacy-timeout-receipt.json`, "boulder.common-executor-receipt.legacy-thin-failure", { runId, status: "failed", reason: "executor-timeout" });
    } else if (reportedNoncompletion || approvalCycle) {
      const stdoutTail = "";
      const stderrTail = "";
      const originalUnsigned: Record<string, unknown> = reportedNoncompletion
        ? {
          schemaVersion: "boulder.common-executor-receipt.v1",
          runId,
          status: "failed",
          reason: "executor-noncompletion-reported",
          reportedReason: "executor-timeout",
          terminationEvidenceStatus: "unavailable-retrospectively",
          budgetSeconds: 30,
          elapsedSeconds: 31,
          commandStartedAt: "2026-07-16T01:00:00Z",
          currentCommand: "gjc -p executor apply",
          stdoutTail,
          stderrTail,
          overallDisposition: "hold",
          promotionEligibility: "hold"
        }
        : {
          schemaVersion: "boulder.common-executor-receipt.v1",
          runId,
          status: executorFault === "approval-cycle-wrong-status" ? "passed" : "failed",
          reason: "approval-cycle-detected",
          approvalCycleDetected: true
        };
      if (executorFault === "reported-noncompletion-original-invented-digest" || executorFault === "approval-cycle-original-invented-digest") {
        originalUnsigned.patchDigest = patch.digest;
      }
      const originalSignature = await (executorFault === "reported-noncompletion-original-wrong-signer" || executorFault === "approval-cycle-original-wrong-signer"
        ? sign(originalUnsigned)
        : signExecutor(originalUnsigned));
      const originalValue: Record<string, unknown> = { ...originalUnsigned, signature: originalSignature };
      if (executorFault === "reported-noncompletion-original-tampered") originalValue.reportedReason = "executor-cancelled";
      originalReceipt = await add(`runs/${runId}/original-receipt.json`, "boulder.common-executor-receipt.v1", originalValue);
      if (reportedNoncompletion) {
        stdout = await addText(`runs/${runId}/executor.stdout`, "boulder.planner-executor-stdout.v1", executorFault === "reported-noncompletion-tail-mismatch" ? "different stdout tail" : stdoutTail);
        stderr = await addText(`runs/${runId}/executor.stderr`, "boulder.planner-executor-stderr.v1", stderrTail);
      }
    }
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
    if (executorFault === "legacy-timeout") {
      sourceReceiptValue.failureKind = "timeout";
      sourceReceiptValue.executorExitCode = null;
      sourceReceiptValue.testExitCode = null;
      sourceReceiptValue.typecheckExitCode = null;
      sourceReceiptValue.reason = "executor-timeout";
      sourceReceiptValue.originalReceipt = originalReceipt;
      delete sourceReceiptValue.patchDigest;
      delete sourceReceiptValue.testDigest;
      delete sourceReceiptValue.typecheckDigest;
    } else if (reportedNoncompletion || approvalCycle) {
      sourceReceiptValue.failureKind = reportedNoncompletion ? "reported-noncompletion" : "approval-cycle";
      sourceReceiptValue.executorExitCode = null;
      sourceReceiptValue.testExitCode = null;
      sourceReceiptValue.typecheckExitCode = null;
      sourceReceiptValue.reason = reportedNoncompletion && executorFault === "reported-noncompletion-wrong-reason"
        ? "executor-timeout"
        : reportedNoncompletion ? "executor-noncompletion-reported" : "approval-cycle-detected";
      sourceReceiptValue.originalReceipt = originalReceipt;
      delete sourceReceiptValue.patchDigest;
      delete sourceReceiptValue.testDigest;
      delete sourceReceiptValue.typecheckDigest;
      if (executorFault === "reported-noncompletion-invented-digest" || executorFault === "approval-cycle-invented-digest") sourceReceiptValue.patchDigest = patch.digest;
    }
    const sourceReceipt = await add(`runs/${runId}/source-receipt.json`, "boulder.common-executor-receipt.v1", sourceReceiptValue);
    const verification = executionStatus === "passed"
      ? { status: "passed", testDigest: sourceReceiptValue.testDigest, typecheckDigest: sourceReceiptValue.typecheckDigest }
      : reportedNoncompletion
        ? { status: "failed", reason: sourceReceiptValue.reason, testDigest: null, typecheckDigest: null, terminationEvidenceStatus: "unavailable-retrospectively" }
        : approvalCycle || executorFault === "legacy-timeout"
          ? { status: "failed", reason: sourceReceiptValue.reason, testDigest: null, typecheckDigest: null }
          : { status: "failed", reason: sourceReceiptValue.reason, testDigest: sourceReceiptValue.testDigest, typecheckDigest: sourceReceiptValue.typecheckDigest };
    const verificationArtifacts = reportedNoncompletion
      ? executorFault === "reported-noncompletion-missing-artifact" ? [stdout] : executorFault === "reported-noncompletion-extra-artifact" ? [stdout, stderr, patch] : [stdout, stderr]
      : approvalCycle
        ? executorFault === "approval-cycle-extra-artifact" ? [patch] : []
        : executorFault === "legacy-timeout" ? [] : executorFault === "omit-test-artifact" ? [patch, typecheckOutput] : [patch, testOutput, typecheckOutput];
    const scopeStatus = observedStudyHold || index === 0 && change.scopeFault === "unknown" ? "unknown" as const : "passed" as const;
    const nestedScopeStatus = observedStudyHold || index === 0 && change.scopeFault === "execution-mismatch" ? "unknown" as const : scopeStatus;
    const executionUnsigned = { schemaVersion: "boulder.planner-execution-receipt.v1", runId, status: executionStatus, scopeStatus, executorModel: sourceReceiptValue.executorModel, sourceReceipt, verificationArtifacts, verification, verificationDigest: hash(verification) };
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
      normalizerVersion: "pr8b-strict-packet-v2", normalizerDigest: normalizer.digest, score, rawScore, criticalCaps, traceabilityPercent, scopeStatus,
      execution: { status: executionStatus, scopeStatus: nestedScopeStatus, path: executionRef.path, digest: executionRef.digest, schemaVersion: "boulder.planner-execution-receipt.v1" }, reviewItemId, blindedItemDigest: itemDigest
    };
    if (index === 0 && change.scopeFault === "missing") {
      delete (normalizedRun as Record<string, unknown>).scopeStatus;
      delete (normalizedRun.execution as Record<string, unknown>).scopeStatus;
    }
    normalizedRuns.push(normalizedRun);
    if (executionStatus === "failed" || scopeStatus !== "passed" || nestedScopeStatus !== "passed" || criticalCaps.length > 0 || traceabilityPercent !== 100) exclusions.push({
      runId,
      cellId: raw.cellId,
      repeat: cell.repeat,
      sequence: index + 1,
      reason: scenario ?? (scopeStatus !== "passed" || nestedScopeStatus !== "passed" ? "scope-attribution-not-passed" : "ineligible-run"),
      evidenceDigest: executionStatus === "failed" || scopeStatus !== "passed" || nestedScopeStatus !== "passed" ? executionRef.digest : itemDigest,
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
  const lockItems = scoreItems.map((item) => ({ reviewItemId: item.reviewItemId as string, blindedItemDigest: hash(item) }));
  const itemDigestById = new Map(lockItems.map((entry) => [entry.reviewItemId, entry.blindedItemDigest]));
  const receiptReveals = reveals.map((entry) => ({
    ...entry,
    blindedItemDigest: itemDigestById.get(entry.reviewItemId as string),
    traceabilityPercent: entry.traceabilityPercent
  }));
  const scoredLockSequence = prospectivePolicy ? 2 : 1;
  const bundle: Record<string, unknown> = {
    schemaVersion: "boulder.planner-evidence-bundle.v1", studyId: "pr8b", protocolDigest, manifestDigest, rubricDigest: rubric.digest, normalizerDigest: normalizer.digest,
    normalizedRuns, exclusions, artifactIndex: [...refs.values()], studyArtifacts: {
      rubric, normalizer, assignments, approvals, redactions,
      ...(prospectiveScoreSheet && prospectiveScoreLock && change.chronologyFault !== "omit-artifacts" ? { prospectiveScoreSheet, prospectiveScoreLock } : {})
    },
    scoreLockReceipt: { schemaVersion: "boulder.planner-score-lock-receipt.v1", sequence: scoredLockSequence, occurredAt: "2026-07-16T01:00:00Z", kind: change.scenario === "observed-study-hold" || change.scenario === "retrospective-lock" ? "retrospective-attestation" : "prospective-lock", scoreSheet: lockSheet, lockDigest: hash(lockItems), blindedItems: lockItems },
    scoreRevealReceipt: { schemaVersion: "boulder.planner-score-reveal-receipt.v1", sequence: scoredLockSequence + 1, occurredAt: "2026-07-16T02:00:00Z", lockDigest: hash(lockItems), scoreSheet: revealSheet, privateAssignment, reveals: receiptReveals },
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
  change.mutateReport?.(report);
  report.signature = await sign(report);
  return { ...draft, report };
}

describe("planner benchmark byte-verified PR8B provenance", () => {
  test("accepts a signed 36-run prospective chronology", async () => {
    const evidence = await signedBenchmark();
    expect(buildPlannerBenchmarkReport(evidence).decision).toBe("HOLD");
    expect(buildPlannerBenchmarkReport(evidence).reasons).toContain("plan.benchmark.provenance_missing");
    expect(await validatePlannerBenchmarkProvenance(evidence)).toEqual([]);
    const report = buildPlannerBenchmarkReport(evidence);
    expect(report.decision).toBe("FIRST_FALLBACK_REVIEW");
    expect(report.reasons).toEqual(["first_fallback_threshold_met"]);
  });
  test("fails closed on omitted, tampered, mismatched, and incorrectly bound prospective locks", async () => {
    const cases = [
      [await signedBenchmark({ chronologyFault: "omit-artifacts" }), "plan.benchmark.evidence_invalid", "studyArtifacts.prospectiveScoreLock"],
      [await signedBenchmark({ tamperBytes: "scores/prospective-sheet.json" }), "plan.benchmark.digest_mismatch", "artifactIndex.scores/prospective-sheet.json"],
      [await signedBenchmark({ chronologyFault: "prospective-kind-mismatch" }), "plan.benchmark.evidence_invalid", "studyArtifacts.prospectiveScoreLock"],
      [await signedBenchmark({ chronologyFault: "protocol-lock-digest-mismatch" }), "plan.benchmark.evidence_invalid", "studyArtifacts.prospectiveScoreLock"],
      [await signedBenchmark({ chronologyFault: "protocol-private-map-digest-mismatch" }), "plan.benchmark.evidence_invalid", "scoreReceipts"]
    ] as const;
    for (const [evidence, code, path] of cases) {
      const issues = await validatePlannerBenchmarkProvenance(evidence);
      expect(issues.some((entry) => entry.code === code && entry.path === path)).toBe(true);
      expect(buildPlannerBenchmarkReport(evidence, issues).decision).toBe("HOLD");
    }
  }, 30_000);
  test("fails closed on missing, unknown, and mismatched execution scope attribution", async () => {
    const [unknownScope, missingScope, mismatchedScope] = await Promise.all([
      signedBenchmark({ scopeFault: "unknown" }),
      signedBenchmark({ scopeFault: "missing" }),
      signedBenchmark({ scopeFault: "execution-mismatch" })
    ]);

    expect(await validatePlannerBenchmarkProvenance(unknownScope)).toEqual([]);
    const unknownReport = buildPlannerBenchmarkReport(unknownScope);
    expect(unknownReport.decision).toBe("HOLD");
    expect(unknownReport.reasons).toContain("scope_attribution_unknown");
    expect(unknownReport.metrics.eligibleRunCount).toBe(35);
    expect(unknownReport.excludedRunIds).toContain(firstRunId);

    for (const [evidence, code, path] of [
      [missingScope, "plan.benchmark.run_invalid", "normalizedRuns[0]"],
      [mismatchedScope, "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution`]
    ] as const) {
      const issues = await validatePlannerBenchmarkProvenance(evidence);
      expect(issues.some((entry) => entry.code === code && entry.path === path)).toBe(true);
      const report = buildPlannerBenchmarkReport(evidence, issues);
      expect(report.decision).toBe("HOLD");
      expect(report.reasons).toContain("scope_attribution_unknown");
      expect(report.metrics.eligibleRunCount).toBe(0);
    }
  }, 20_000);
  test("rejects a signed report that omits the canonical scope HOLD reason", async () => {
    const evidence = await signedBenchmark({
      scopeFault: "unknown",
      mutateReport: (report) => {
        report.reasons = (report.reasons as readonly string[]).filter((reason) => reason !== "scope_attribution_unknown");
      }
    });
    const issues = await validatePlannerBenchmarkProvenance(evidence);
    expect(issues.some((entry) => entry.code === "plan.benchmark.report_invalid" && entry.path === "report")).toBe(true);
    expect(issues.some((entry) => entry.code === "plan.benchmark.signature_invalid" && entry.path === "report.signature")).toBe(false);
  }, 20_000);
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
    expect(report.metrics.eligibleRunCount).toBe(0);
    expect(report.metrics.executionFailureCount).toBe(18);
    expect(report.metrics.criticalCapCount).toBe(13);
    expect(report.reasons).toEqual([
      "critical_caps",
      "execution_failures",
      "insufficient_eligible_runs",
      "retrospective_lock_attestation",
      "scope_attribution_unknown"
    ]);
    expect(["PREVIEW", "FIRST_FALLBACK_REVIEW"]).not.toContain(report.decision);
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
  test("requires full lazycodex raw-run IDs while preserving lazycodex planner output identity", async () => {
    const [valid, shortened] = await Promise.all([
      signedBenchmark(),
      signedBenchmark({ identityFault: "run-planner-alias" })
    ]);
    expect((valid.rawRuns as readonly Record<string, unknown>[]).some((run) => run.runId === firstLazycodexRunId)).toBe(true);
    expect(await validatePlannerBenchmarkProvenance(valid)).toEqual([]);

    const issues = await validatePlannerBenchmarkProvenance(shortened);
    expect(issues.some((entry) => entry.code === "plan.benchmark.run_invalid" && entry.path === `rawRuns.${shortenedLazycodexRunId}.identity`)).toBe(true);
    expect(buildPlannerBenchmarkReport(shortened, issues).metrics.eligibleRunCount).toBe(0);
  }, 20_000);

  test("requires the runner's normalizer contract digest to exactly match the signed protocol", async () => {
    const [valid, mismatch, legacyField] = await Promise.all([
      signedBenchmark(),
      signedBenchmark({ contractFault: "runner-normalizer-contract-digest" }),
      signedBenchmark({ contractFault: "runner-legacy-normalizer-digest" })
    ]);
    expect(await validatePlannerBenchmarkProvenance(valid)).toEqual([]);

    for (const evidence of [mismatch, legacyField]) {
      const issues = await validatePlannerBenchmarkProvenance(evidence);
      expect(issues.some((entry) => entry.code === "plan.benchmark.evidence_invalid" && entry.path === "runnerContract")).toBe(true);
      expect(buildPlannerBenchmarkReport(evidence, issues).metrics.eligibleRunCount).toBe(0);
    }
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
  test("rejects malformed failed exit evidence and a valid-shape unsigned legacy timeout receipt", async () => {
    for (const executorFault of ["malformed-failed-exits", "legacy-timeout"] as const) {
      const evidence = await signedBenchmark({ scenario: "execution-failure", executorFault });
      const issues = await validatePlannerBenchmarkProvenance(evidence);
      expect(issues.some((entry) => entry.code === "plan.benchmark.evidence_invalid" && entry.path === `normalizedRuns.${firstRunId}.execution.sourceReceipt`)).toBe(true);
      expect(buildPlannerBenchmarkReport(evidence, issues).decision).toBe("HOLD");
      expect(buildPlannerBenchmarkReport(evidence, issues).metrics.eligibleRunCount).toBe(0);
    }
  }, 20_000);
  test("accepts signed reported noncompletion and approval-cycle execution evidence", async () => {
    for (const executorFault of ["reported-noncompletion", "approval-cycle"] as const) {
      const evidence = await signedBenchmark({ scenario: "execution-failure", executorFault });
      expect(await validatePlannerBenchmarkProvenance(evidence)).toEqual([]);
      expect(buildPlannerBenchmarkReport(evidence).decision).toBe("HOLD");
    }
  }, 20_000);
  test("rejects tampered signed reported-noncompletion and approval-cycle evidence", async () => {
    const cases = [
      ["reported-noncompletion-original-wrong-signer", "plan.benchmark.signer_unauthorized", `normalizedRuns.${firstRunId}.execution.sourceReceipt.originalReceipt.signature.keyId`],
      ["reported-noncompletion-original-tampered", "plan.benchmark.signature_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt.originalReceipt.signature`],
      ["reported-noncompletion-original-invented-digest", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
      ["reported-noncompletion-tail-mismatch", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
      ["reported-noncompletion-extra-artifact", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
      ["reported-noncompletion-missing-artifact", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
      ["reported-noncompletion-invented-digest", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
      ["reported-noncompletion-wrong-reason", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
      ["approval-cycle-original-wrong-signer", "plan.benchmark.signer_unauthorized", `normalizedRuns.${firstRunId}.execution.sourceReceipt.originalReceipt.signature.keyId`],
      ["approval-cycle-original-invented-digest", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
      ["approval-cycle-wrong-status", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
      ["approval-cycle-invented-digest", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`],
      ["approval-cycle-extra-artifact", "plan.benchmark.evidence_invalid", `normalizedRuns.${firstRunId}.execution.sourceReceipt`]
    ] as const;
    const results = await Promise.all(cases.map(async ([executorFault, code, path]) => {
      const evidence = await signedBenchmark({ scenario: "execution-failure", executorFault });
      return { code, path, issues: await validatePlannerBenchmarkProvenance(evidence) };
    }));
    for (const { code, path, issues } of results) expect(issues.some((entry) => entry.code === code && entry.path === path)).toBe(true);
  }, 30_000);



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

  test("routes valid high-average sub-fallback score and variance to preview", async () => {
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
  test("preserves signed v1 evidence when the remediation policy is absent", async () => {
    const evidence = await signedBenchmark();
    expect(await validatePlannerBenchmarkProvenance(evidence)).toEqual([]);
  });
  test("fails closed when a fresh-study remediation policy lacks a complete indexed graph", async () => {
    const missing = await signedBenchmark({
      mutateProtocol: (protocol) => { protocol.remediationPolicy = "scope-lifecycle-score-v1"; }
    });
    const unknownSchema = await signedBenchmark({
      mutateProtocol: (protocol) => { protocol.remediationPolicy = "scope-lifecycle-score-v1"; },
      mutate: (bundle) => {
        bundle.remediationEvidence = {
          path: "study/remediation.json",
          digest,
          schemaVersion: "boulder.planner-study-remediation-evidence.v9"
        };
      }
    });
    for (const evidence of [missing, unknownSchema]) {
      const issues = await validatePlannerBenchmarkProvenance(evidence);
      expect(issues.some((entry) => entry.code === "plan.benchmark.evidence_invalid" || entry.code === "plan.benchmark.bundle_invalid")).toBe(true);
    }
  });
});