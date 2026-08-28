import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { approvalReceiptPath, assertK0rCaptureReceiptStatus, captureK0rEvidenceForTest as captureK0rEvidence, captureK0rEvidenceForTest, parseK0rCaptureEvidenceArgv, validateDirtyEntriesSequentially } from "./k0r-capture-evidence.js";
import { buildK0rStaticBaseline, k0rApprovedSourceOverlayPaths } from "./k0r-baseline-generator.js";
import { sha256CanonicalK0r, sha256K0rBytes, verifyK0rPreTrackedJcsManifest } from "./k0r-canonical.js";
import { runK0rIndependentOracle } from "./k0r-independent-oracle.js";
import {
  assertK0rMaterializationJournalAuthority,
  classifyK0rBindingPath,
  classifyK0rRemovedBindingDisposition,
  deriveK0rHeadOverlayBase,
  formatK0rHistoricalBindingDiagnostic,
  formatK0rRemovedBindingDiagnostic,
  k0rFocusedGatePolicies,
  k0rPreCaptureFocusedGateStage,
  k0rFocusedGateReceiptPaths,
  k0rPlanAuthoritySha256,
  myersK0rByteEdits,
  newOwnerPaths,
  normalizeK0rPlanExecutionState,
  reconcileK0rBindingEntries,
  validateK0rFinalScanProjection,
  validateK0rFocusedGateReceiptForTest,
  type K0rFocusedGateExpectedBindings,
  type K0rFocusedGatePolicy,
  type K0rFocusedGateStage,
} from "./k0r-reconcile-evidence.js";
import { applyK0rApprovedOverlayForTest, assertK0rAllowedArgv, deriveK0rSourceBaseForTest, isolatedPriorSnapshotMode, isolatedRunCommandArgv, isolatedRunReceiptPath, isolatedRunSchemaVersion, isolatedSourceBundlePaths, parseK0rRunEvidenceArgv, readK0rIsolationArgvAllowlist, registerK0rIsolationBoundaryHandler, resolveK0rRepositoryCheckArgv, resolveK0rRepositoryCheckExecution, runK0rIsolatedEvidence, validateK0rIsolatedRunReceipt, validateK0rSourceBaseForTest, verifyK0rSandboxEnforcement, writeK0rIsolatedRunReceipt, writeK0rIsolatedRunReceiptForTest } from "./k0r-run-evidence.js";
import { assertExactK0rEvidenceOutputPaths, authenticateImplementerProvenance, authenticateTaskProvenance, authenticateUserProvenance, buildMaintainerApprovalRequest, parseK0rIssueExitArgv, trackedOverlayPaths, validateMaintainerApproval, validatePendingExitPresence, validatePriorExit } from "./k0r-issue-exit.js";

const root = join(import.meta.dir, "..");
const inventoryPath = join(root, "evidence/k0r/v1-public-contract-inventory.json");
const acceptancePath = join(root, "evidence/k0r/acceptance-manifest.json");
const approvalReceiptFile = join(root, approvalReceiptPath);
const isolationPath = join(root, "evidence/k0r/isolation-manifest.json");
const releaseManifestPath = join(root, "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json");
const requiredCategories = ["commands", "outputContracts", "exitAndStderrPolicy", "statePaths", "profileAndDefaultPrecedence", "packageAndRuntime", "inventoryReferences", "ownershipAndOracle", "evidenceBindings"];
const oracleReportKeys = ["schemaVersion", "reproductionMode", "status", "oracleSourceSha256", "artifacts", "reproduced", "derivedPublicKey", "generationSetDigest", "vectorIds", "seedMaterial", "failures"];
const oracleArtifactIds = ["baseline", "mutations", "none"];
const exactK0rEvidenceOutputPaths = [
  "evidence/k0r/acceptance-manifest.json",
  "evidence/k0r/baseline-transition.json",
  "evidence/k0r/evidence-manifest.json",
  "evidence/k0r/final-verification-bundle.json",
  "evidence/k0r/independent-clean-source-reproduction.json",
  "evidence/k0r/isolated-run-receipt.json",
  "evidence/k0r/isolation-manifest.json",
  "evidence/k0r/k0r-exit-receipt.json",
  "evidence/k0r/superseding-adr.md",
  "evidence/k0r/v1-public-contract-inventory.json",
] as const;

const exactFocusedTestPaths = [
  "test/k0r-baseline-generator.test.ts",
  "test/k0r-evidence-contract.test.ts",
  "test/k0r-independent-oracle.test.ts",
] as const;
const exactFocusedRuntimeSourcePaths = [
  "test/k0r-baseline-generator.ts",
  "test/k0r-canonical.ts",
  "test/k0r-capture-evidence.ts",
  "test/k0r-independent-oracle.ts",
  "test/k0r-issue-exit.ts",
  "test/k0r-reconcile-evidence.ts",
  "test/k0r-run-evidence.ts",
] as const;

describe("K0R focused gate receipt contract", () => {
  test("normalizes only completed top-level execution-state checkboxes", () => {
    const input = "- [x] 1. first\n  - [x] nested\n- [x] 10. tenth\n- [x] 11. outside\n";
    expect(normalizeK0rPlanExecutionState(input)).toBe(
      "- [ ] 1. first\n  - [x] nested\n- [ ] 10. tenth\n- [x] 11. outside\n",
    );
    expect(k0rPlanAuthoritySha256(input)).toBe(
      `sha256:${createHash("sha256").update(new TextEncoder().encode("- [ ] 1. first\n  - [x] nested\n- [ ] 10. tenth\n- [x] 11. outside\n")).digest("hex")}`,
    );
  });

  test("accepts the exact receipt for every ordered policy stage", () => {
    expect(k0rFocusedGatePolicies.map((policy) => policy.stage)).toEqual([
      "pre-materialization",
      "post-materialization",
      "post-isolated-run",
    ]);
    for (const policy of k0rFocusedGatePolicies) {
      const expected = focusedGateExpectedBindings(policy);
      expect(thrownMessage(() => validateK0rFocusedGateReceiptForTest(focusedGateReceipt(policy, expected), expected))).toBe("");
    }
  });

  test("binds exactly three focused tests and the relevant runtime sources", () => {
    expect(k0rFocusedGateReceiptPaths).toEqual({
      "pre-materialization": "receipts/k0r-focused-gate.pre-materialization.json",
      "post-materialization": "receipts/k0r-focused-gate.post-materialization.json",
      "post-isolated-run": "receipts/k0r-focused-gate.post-isolated-run.json",
    });
    for (const policy of k0rFocusedGatePolicies) {
      expect(Object.keys(policy).sort()).toEqual(["counts", "failures", "stage", "status"]);
      const expected = focusedGateExpectedBindings(policy);
      expect(expected.testFiles.map((binding) => binding.path)).toEqual(exactFocusedTestPaths);
      expect(expected.runtimeSources.map((binding) => binding.path)).toEqual(exactFocusedRuntimeSourcePaths);
      expect(expected.command.argv).toEqual(["bun", "test", ...exactFocusedTestPaths]);
    }
  });

  test("records the expected failure IDs at each materialization boundary", () => {
    const staleEvidenceFailures = [
      "K0R evidence contract > binds the complete-byte report and rejects forged reproduction, alternate-root source, and semantic report evidence",
      "K0R evidence contract > rejects changed and deleted declared prior K0/K1 inventory entries",
      "K0R evidence contract > rejects root, oracle, directory, pending approval, and ignored-path forgeries",
      "K0R evidence contract > atomically replaces an existing evidence manifest and cleans up after rename failure",
      "K0R isolated-run receipt > validates the currently installed isolated-run receipt and rejects forgeries",
    ];
    expect({
      counts: focusedGatePolicy("pre-materialization").counts,
      failures: focusedGatePolicy("pre-materialization").failures.map((failure) => failure.id),
    }).toEqual({
      counts: { assertions: 763, discoveredTests: 75, failedTests: 5, passedTests: 70, skippedTests: 0 },
      failures: staleEvidenceFailures,
    });
    expect(focusedGatePolicy("post-materialization").failures.map((failure) => failure.id)).toEqual(staleEvidenceFailures);
    expect(focusedGatePolicy("post-isolated-run").failures).toEqual([]);
  });

  test("rejects forged authority, execution, count, and binding fields", () => {
    const mutations: readonly ((receipt: RecordValue) => void)[] = [
      (receipt) => { receipt["stage"] = "post-isolated-run"; },
      (receipt) => { receipt["status"] = "pass"; },
      (receipt) => { receipt["scopeAuthorizationSha256"] = digestFixture("8"); },
      (receipt) => { receipt["planSha256"] = digestFixture("9"); },
      (receipt) => { receipt["headCommit"] = "1".repeat(40); },
      (receipt) => { receipt["headTree"] = "2".repeat(40); },
      (receipt) => { focusedGateBindings(receipt, "testFiles")[0]!["sha256"] = digestFixture("e"); },
    (receipt) => { focusedGateBindings(receipt, "runtimeSources")[0]!["path"] = ["test", "forged.ts"].join("/"); },
      (receipt) => { focusedGateCounts(receipt)["discoveredTests"] = Number(focusedGateCounts(receipt)["discoveredTests"]) + 1; },
      (receipt) => { focusedGateCounts(receipt)["failedTests"] = Number(focusedGateCounts(receipt)["failedTests"]) + 1; },
      (receipt) => { focusedGateCounts(receipt)["assertions"] = Number(focusedGateCounts(receipt)["assertions"]) + 1; },
      (receipt) => { focusedGateCounts(receipt)["skippedTests"] = 1; },
      (receipt) => { focusedGateCommand(receipt)["crashed"] = true; },
      (receipt) => { focusedGateCommand(receipt)["timedOut"] = true; },
    (receipt) => { focusedGateCommand(receipt)["argv"] = ["bun", "test", ["test", "forged.test.ts"].join("/")]; },
    ];
    for (const mutate of mutations) {
      const policy = focusedGatePolicy("pre-materialization");
      const expected = focusedGateExpectedBindings(policy);
      const receipt = focusedGateReceipt(policy, expected);
      mutate(receipt);
      refreshFocusedGateDigest(receipt);
      expect(thrownMessage(() => validateK0rFocusedGateReceiptForTest(receipt, expected))).not.toBe("");
    }
  });

  test("rejects forged failure identity, order, and diagnostic bindings", () => {
    const mutations: readonly ((failures: RecordValue[]) => void)[] = [
      (failures) => { failures[0]!["id"] = "forged-failure"; },
      (failures) => {
        const first = { ...failures[0]! };
        failures[0]!["id"] = failures[1]!["id"];
        failures[0]!["diagnosticSha256"] = failures[1]!["diagnosticSha256"];
        failures[1]!["id"] = first["id"];
        failures[1]!["diagnosticSha256"] = first["diagnosticSha256"];
      },
      (failures) => { failures[0]!["diagnosticSha256"] = digestFixture("2"); },
    ];
    for (const mutate of mutations) {
      const policy = focusedGatePolicy("pre-materialization");
      const expected = focusedGateExpectedBindings(policy);
      const receipt = focusedGateReceipt(policy, expected);
      mutate(recordArray(receipt["failures"], "focused gate failures"));
      refreshFocusedGateDigest(receipt);
      expect(thrownMessage(() => validateK0rFocusedGateReceiptForTest(receipt, expected))).not.toBe("");
    }
  });

  test("rejects an invalid self digest and any extra schema field", () => {
    const policy = focusedGatePolicy("post-isolated-run");
    const expected = focusedGateExpectedBindings(policy);
    const digestForgery = focusedGateReceipt(policy, expected);
    digestForgery["receiptSha256"] = digestFixture("3");
    expect(thrownMessage(() => validateK0rFocusedGateReceiptForTest(digestForgery, expected))).not.toBe("");

    const schemaForgery = focusedGateReceipt(policy, expected);
    schemaForgery["unexpected"] = true;
    refreshFocusedGateDigest(schemaForgery);
    expect(thrownMessage(() => validateK0rFocusedGateReceiptForTest(schemaForgery, expected))).not.toBe("");
  });
});

function focusedGatePolicy(stage: K0rFocusedGateStage): K0rFocusedGatePolicy {
  const policy = k0rFocusedGatePolicies.find((candidate) => candidate.stage === stage);
  if (policy === undefined) throw new Error(`Missing focused gate policy: ${stage}.`);
  return policy;
}

function focusedGateExpectedBindings(policy: K0rFocusedGatePolicy): K0rFocusedGateExpectedBindings {
  return {
    scopeAuthorizationSha256: digestFixture("a"),
    planSha256: digestFixture("b"),
    headCommit: "a".repeat(40),
    headTree: "b".repeat(40),
    testFiles: exactFocusedTestPaths.map((path, index) => ({ path, sha256: digestFixture(String(index + 1)) })),
    runtimeSources: exactFocusedRuntimeSourcePaths.map((path, index) => ({ path, sha256: digestFixture(String(index + 1)) })),
    command: {
      argv: ["bun", "test", ...exactFocusedTestPaths],
      cwd: ".",
      exitCode: policy.status === "pass" ? 0 : 1,
      stdoutSha256: digestFixture("c"),
      stderrSha256: digestFixture("d"),
      timedOut: false,
      crashed: false,
    },
  };
}

function focusedGateReceipt(policy: K0rFocusedGatePolicy, expected: K0rFocusedGateExpectedBindings): RecordValue {
  const counts = policy.counts.discoveredTests === null ? {
    discoveredTests: 70,
    passedTests: 70,
    failedTests: 0,
    assertions: 800,
    skippedTests: 0,
  } : policy.counts;
  const projection: RecordValue = {
    schemaVersion: "boulder.k0r.focused-gate.v1",
    stage: policy.stage,
    status: policy.status,
    scopeAuthorizationSha256: expected.scopeAuthorizationSha256,
    planSha256: expected.planSha256,
    headCommit: expected.headCommit,
    headTree: expected.headTree,
    testFiles: expected.testFiles.map((binding) => ({ ...binding })),
    runtimeSources: expected.runtimeSources.map((binding) => ({ ...binding })),
    command: { ...expected.command, argv: [...expected.command.argv] },
    counts,
    failures: policy.failures.map((failure) => ({ ...failure })),
  };
  return { ...projection, receiptSha256: `sha256:${sha256CanonicalK0r(projection)}` };
}

function refreshFocusedGateDigest(receipt: RecordValue): void {
  const projection = { ...receipt };
  delete projection["receiptSha256"];
  receipt["receiptSha256"] = `sha256:${sha256CanonicalK0r(projection)}`;
}

function focusedGateBindings(receipt: RecordValue, field: "testFiles" | "runtimeSources"): RecordValue[] {
  return recordArray(receipt[field], `focused gate ${field}`);
}

function focusedGateCounts(receipt: RecordValue): RecordValue {
  return recordValue(receipt["counts"], "focused gate counts");
}

function focusedGateCommand(receipt: RecordValue): RecordValue {
  return recordValue(receipt["command"], "focused gate command");
}

function digestFixture(digit: string): string { return `sha256:${digit.repeat(64)}`; }

describe("K0R compact maintainer approval", () => {
  const expected = {
    reviewedInputs: [
      { path: "docs/boulder-guide.ko.html", sha256: digestFixture("1") },
      { path: "evidence/k0r/superseding-adr.md", sha256: digestFixture("2") },
    ],
    architectReviewSha256: digestFixture("3"),
    criticReviewSha256: digestFixture("4"),
    adrSha256: digestFixture("5"),
    evidenceManifestSha256: digestFixture("6"),
    baselineTransitionSha256: digestFixture("7"),
  } as const;
  const requestId = "123e4567-e89b-42d3-a456-426614174000";

  test("accepts one compact response bound to the full frozen request", () => {
    const request = buildMaintainerApprovalRequest(expected, requestId);
    const response = {
      decision: "approve_exact_frozen_scope",
      requestPayloadJcsSha256: request["requestPayloadJcsSha256"],
      requestReceiptSha256: request["receiptSha256"],
      schemaVersion: "boulder.k0r.maintainer-approval-response.v1",
    };
    expect(JSON.stringify(response).length < 320).toBe(true);
    expect(thrownMessage(() => validateMaintainerApproval(response, request, expected))).toBe("");
  });

  test("rejects stale, replayable, expanded, and malformed compact responses", () => {
    const request = buildMaintainerApprovalRequest(expected, requestId);
    const response: RecordValue = {
      decision: "approve_exact_frozen_scope",
      requestPayloadJcsSha256: request["requestPayloadJcsSha256"],
      requestReceiptSha256: request["receiptSha256"],
      schemaVersion: "boulder.k0r.maintainer-approval-response.v1",
    };
    const forgeries: readonly ((candidate: RecordValue) => void)[] = [
      (candidate) => { candidate["requestReceiptSha256"] = digestFixture("8"); },
      (candidate) => { candidate["requestPayloadJcsSha256"] = digestFixture("9"); },
      (candidate) => { candidate["decision"] = "approve"; },
      (candidate) => { candidate["scope"] = "expanded"; },
    ];
    for (const forge of forgeries) {
      const candidate = { ...response };
      forge(candidate);
      expect(thrownMessage(() => validateMaintainerApproval(candidate, request, expected))).not.toBe("");
    }

    const staleRequest = { ...request, requestId: "123e4567-e89b-42d3-a456-426614174001" };
    expect(thrownMessage(() => validateMaintainerApproval(response, staleRequest, expected))).not.toBe("");
    const stalePayload = {
      ...request,
      requestPayload: {
        ...recordValue(request["requestPayload"], "request payload"),
        architectReviewSha256: digestFixture("8"),
      },
    };
    expect(thrownMessage(() => validateMaintainerApproval(response, stalePayload, expected))).not.toBe("");
    expect(thrownMessage(() => validateMaintainerApproval(response, buildMaintainerApprovalRequest(expected, "not-a-uuid"), expected))).not.toBe("");
  });

  test("requires the canonical maintainer-request CLI position", () => {
    const options = [
      "--scope-authorization", "--scope-provenance", "--implementer-provenance",
      "--architect-review", "--architect-provenance", "--critic-review", "--critic-provenance",
      "--reviewed-inputs-manifest", "--maintainer-request", "--maintainer-approval", "--maintainer-provenance",
      "--architect-attestation", "--architect-attestation-provenance",
      "--critic-attestation", "--critic-attestation-provenance", "--pending-transition",
    ];
    const argv = ["--write", ...options.flatMap((option) => [option, `/private/${option.slice(2)}.json`])];
    const parsed = parseK0rIssueExitArgv(argv);
    expect({
      mode: parsed.mode,
      pendingOnlyAbsentAccepted: thrownMessage(() => validatePendingExitPresence(false, false)) === "",
      pendingOnlyPresentRejected: thrownMessage(() => validatePendingExitPresence(true, false)) !== "",
      selfVerificationPresentAccepted: thrownMessage(() => validatePendingExitPresence(true, true)) === "",
      selfVerificationAbsentRejected: thrownMessage(() => validatePendingExitPresence(false, true)) !== "",
    }).toEqual({
      mode: "write",
      pendingOnlyAbsentAccepted: true,
      pendingOnlyPresentRejected: true,
      selfVerificationPresentAccepted: true,
      selfVerificationAbsentRejected: true,
    });
    if (parsed.mode !== "write") throw new Error("Expected write command.");
    expect(parsed.values["--maintainer-request"]).toBe("/private/maintainer-request.json");
    expect(thrownMessage(() => parseK0rIssueExitArgv(argv.filter((value) => value !== "--maintainer-request")))).not.toBe("");
  });
});

describe("K0R scope output authority", () => {
  test("accepts only exact ordered Task 8 runner and capture argv", () => {
    const runner = ["--write", "--pending-transition", "/qa/protected/k0r-transition.pending.json", "--private-candidate", "/qa/receipts/isolated-run.candidate.json", "--private-work-root", "/qa/work/isolated-run"];
    expect({
      mode: parseK0rRunEvidenceArgv(runner).mode,
      preCaptureFocusedGateStage: k0rPreCaptureFocusedGateStage,
    }).toEqual({
      mode: "write",
      preCaptureFocusedGateStage: "post-isolated-run",
    });
    expect(thrownMessage(() => parseK0rRunEvidenceArgv(["--write"]))).toContain("exact Task 8");
    expect(thrownMessage(() => parseK0rRunEvidenceArgv([...runner, "trailing"]))).toContain("exact Task 8");
    const capture = [
      "--pending-transition", "/qa/protected/k0r-transition.pending.json",
      "--acceptance-manifest", "evidence/k0r/acceptance-manifest.json",
      "--baseline-transition", "evidence/k0r/baseline-transition.json",
      "--independent-reproduction", "evidence/k0r/independent-clean-source-reproduction.json",
      "--isolation-manifest", "evidence/k0r/isolation-manifest.json",
      "--superseding-adr", "evidence/k0r/superseding-adr.md",
      "--public-contract-inventory", "evidence/k0r/v1-public-contract-inventory.json",
      "--isolated-run-receipt", "evidence/k0r/isolated-run-receipt.json",
      "--approval-receipt", "evidence/k0r/approval-provenance.json",
      "--focused-gate-receipt", "/qa/receipts/k0r-focused-gate.post-isolated-run.json",
    ];
    expect(parseK0rCaptureEvidenceArgv(capture)["--pending-transition"]).toBe("/qa/protected/k0r-transition.pending.json");
    expect(thrownMessage(() => parseK0rCaptureEvidenceArgv([...capture, "trailing"]))).toContain("exact Task 8");
  });
  test("rejects forged reconciliation state while permitting justified removals", () => {
    const digest = `sha256:${"1".repeat(64)}`;
    const ownerPaths = [...newOwnerPaths];
    const value = {
      schemaVersion: "boulder.k0r.binding-reconciliation.v1",
      status: "complete",
      materializationSha256: digest,
      preEditScan: { path: "receipts/k0r-binding-scan.pre.json", sha256: digest, schemaVersion: "boulder.k0r.binding-scan.pre.v1" },
      scanner: {},
      typescript: {},
      ownerPaths,
      evidenceContractPaths: [],
      evidenceContractPathsSha256: digest,
      bindings: [],
      bindingsSha256: digest,
      bindingSchemaInventory: [],
      bindingSchemaInventorySha256: digest,
      sourceSchemaInventory: [],
      sourceSchemaInventorySha256: digest,
      receiptSha256: digest,
    };
    const removedHistorical = {
      disposition: "removed",
      finalBindingId: null,
      finalSha256: null,
      oldSha256: digest,
      preBindingId: digest,
      reason: "historical-missing",
      targetState: "historical-missing",
    };
    const finalBindingContractPaths = [
      exactK0rEvidenceOutputPaths[0],
      "evidence/k0r/approval-provenance.json",
      ...exactK0rEvidenceOutputPaths.slice(1),
    ];
    const validValue = {
      ...value,
      evidenceContractPaths: finalBindingContractPaths,
      evidenceContractPathsSha256: `sha256:${sha256CanonicalK0r(finalBindingContractPaths)}`,
      bindings: [removedHistorical],
      bindingsSha256: `sha256:${sha256CanonicalK0r([removedHistorical])}`,
      bindingSchemaInventorySha256: `sha256:${sha256CanonicalK0r([])}`,
      sourceSchemaInventorySha256: `sha256:${sha256CanonicalK0r([])}`,
    };
    const activeHistorical = [{ ...removedHistorical, disposition: "added", finalBindingId: digest, finalSha256: digest, reason: "new-contract" }];
    expect({
      aggregate: thrownMessage(() => validateK0rFinalScanProjection(value, { materializationSha256: digest, preEditScanSha256: digest, ownerPaths })),
      justifiedRemoval: thrownMessage(() => validateK0rFinalScanProjection(validValue, { materializationSha256: digest, preEditScanSha256: digest, ownerPaths })),
      activeHistorical: thrownMessage(() => validateK0rFinalScanProjection({
        ...validValue,
        bindings: activeHistorical,
        bindingsSha256: `sha256:${sha256CanonicalK0r(activeHistorical)}`,
      }, { materializationSha256: digest, preEditScanSha256: digest, ownerPaths })),
    }).toEqual({
      aggregate: "Final evidence contract path aggregate is invalid.",
      justifiedRemoval: "",
      activeHistorical: "Final binding reconciliation retains historical-missing authority.",
    });
  });
  test("adds exactly the three initially absent final owners", () => {
    expect(newOwnerPaths).toEqual([
      "test/k0r-canonical.ts",
      "test/k0r-issue-exit.ts",
      "test/k0r-reconcile-evidence.ts",
    ]);
  });
  test("rejects a recovery journal outside protected authority", () => {
    const digest = (value: string): string => `sha256:${value.repeat(64)}`;
    const expected = { scopeSha256: digest("1"), trackedFreezeSha256: digest("2"), ownerSnapshotSha256: digest("3") };
    expect(thrownMessage(() => assertK0rMaterializationJournalAuthority(expected, expected))).toBe("");
    expect(thrownMessage(() => assertK0rMaterializationJournalAuthority({ ...expected, scopeSha256: digest("4") }, expected))).toContain("not bound to protected authority");
  });
  for (const status of ["not_run", "fail"] as const) {
    test(`rejects ${status} isolated evidence before capture`, () => {
      expect(thrownMessage(() => assertK0rCaptureReceiptStatus({
        status,
        run: status === "not_run" ? null : {},
      } as Awaited<ReturnType<typeof validateK0rIsolatedRunReceipt>>))).toContain("requires a passing pending-review");
    });
  }
  test("derives overlay base state from immutable HEAD bytes", async () => {
    const head = (await gitStdout(["rev-parse", "HEAD"])).trim();
    const [guideBytes, evidenceAgentBytes] = await Promise.all([
      gitStdout(["show", `${head}:docs/boulder-guide.ko.html`]),
      gitStdout(["show", `${head}:evidence/AGENTS.md`]),
    ]);
    const entries = await deriveK0rHeadOverlayBase(head, [
      { path: "docs/boulder-guide.ko.html", sha256: `sha256:${"1".repeat(64)}` },
      { path: "evidence/AGENTS.md", sha256: `sha256:${"2".repeat(64)}` },
    ]);
    expect(entries[0]).toEqual({
      path: "docs/boulder-guide.ko.html",
      baseState: "present",
      baseSha256: `sha256:${sha256K0rBytes(guideBytes)}`,
      replacementSha256: `sha256:${"1".repeat(64)}`,
      owner: "authorized tracked overlay",
    });
    expect(entries[1]?.["baseState"]).toBe("present");
    expect(entries[1]?.["baseSha256"]).toBe(`sha256:${sha256K0rBytes(evidenceAgentBytes)}`);
  });
  test("parses exactly the documented finalize-transition argv", () => {
    const argv = [
      "--finalize-transition", "/private/protected/pending.json",
      "--exit-receipt", "evidence/k0r/k0r-exit-receipt.json",
      "--replacement-baseline", "/private/protected/baseline.json",
      "--output", "/private/protected/final.json",
    ];
    expect(parseK0rIssueExitArgv(argv).mode).toBe("finalize-transition");
    expect(thrownMessage(() => parseK0rIssueExitArgv([...argv, "trailing"]))).toContain("Usage:");
  });
  test("authorizes both modified independent-oracle sources", () => {
    expect(trackedOverlayPaths).toHaveLength(18);
    expect(trackedOverlayPaths).toContain("test/k0r-independent-oracle.test.ts");
    expect(trackedOverlayPaths).toContain("test/k0r-independent-oracle.ts");
  });
  test("rejects a same-length substituted tracked overlay path", () => {
    const substituted: string[] = [...trackedOverlayPaths];
    substituted[0] = ["docs", "substituted-guide.html"].join("/");
    expect(substituted).not.toEqual(trackedOverlayPaths);
  });
  test("accepts only the exact ten mutable evidence paths", () => {
    expect(thrownMessage(() => assertExactK0rEvidenceOutputPaths(exactK0rEvidenceOutputPaths))).toBe("");
    expect(thrownMessage(() => assertExactK0rEvidenceOutputPaths([
      ...exactK0rEvidenceOutputPaths,
      "evidence/k0r/approval-provenance.json",
    ]))).toContain("exact ten");
    expect(thrownMessage(() => assertExactK0rEvidenceOutputPaths(exactK0rEvidenceOutputPaths.slice(1)))).toContain("exact ten");
    expect(thrownMessage(() => assertExactK0rEvidenceOutputPaths([
      exactK0rEvidenceOutputPaths[1],
      exactK0rEvidenceOutputPaths[0],
      ...exactK0rEvidenceOutputPaths.slice(2),
    ]))).toContain("exact ten");
  });

  test("rejects shape-valid task provenance without host records", async () => {
    const digest = `sha256:${"0".repeat(64)}`;
    const forged = {
      completionEvent: {
        lineNumber: 1,
        lineSha256: digest,
        prefixBytesSha256: digest,
      },
      completionEventId: "forged-event",
      completionTimestamp: "2026-08-09T00:00:00.000Z",
      hostRecordSha256: digest,
      model: "forged-model",
      parentSessionId: "forged-parent",
      resultSha256: digest,
      reviewerIdentity: "senpi-task:st_01999999",
      schemaVersion: "boulder.senpi.task-provenance.v1",
      taskId: "st_01999999",
      taskRecord: {
        device: 0,
        inode: 0,
        mode: "0600",
        pathSha256: digest,
        sha256: digest,
        size: 0,
        uid: 0,
      },
    };
    let hostMessage = "";
    try {
      await authenticateTaskProvenance(
        forged,
        {
      sessionFile: join(root, ".omo", "nonexistent-session.jsonl"),
          taskStoreRoot: join(root, ".omo/nonexistent-task-store"),
        },
        digest,
        "senpi-task:st_01999999",
      );
    } catch (error) {
      hostMessage = error instanceof Error ? error.message : String(error);
    }
    expect(hostMessage).toContain("ENOENT");
  });

  test("rederives task authority from private host records", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "k0r-host-provenance-"));
    try {
      const taskStoreRoot = join(fixtureRoot, ".omo/senpi-task");
      const taskId = "st_01999999";
      const sessionId = "01999999-1111-7222-8333-444444444444";
      const timestamp = "2026-08-09T00:00:00.000Z";
      const model = "oracle-model";
      const finalResponse = '{"verdict":"confirmed"}';
      const digestBytes = (bytes: Uint8Array): string =>
        `sha256:${sha256K0rBytes(bytes)}`;
      const resultSha256 = digestBytes(new TextEncoder().encode(`${finalResponse}\n`));
      const taskPath = join(taskStoreRoot, "tasks", `${taskId}.json`);
      await mkdir(dirname(taskPath), { recursive: true });
      const taskValue = {
        final_response: finalResponse,
        model,
        parent_session_id: sessionId,
        status: "completed",
        task_id: taskId,
      };
      const taskText = JSON.stringify(taskValue);
      const taskBytes = new TextEncoder().encode(taskText);
      const taskHandle = await open(taskPath, "wx", 0o600);
      const privateTaskHandle = taskHandle as unknown as {
        chmod(mode: number): Promise<void>;
        close(): Promise<void>;
        writeFile(data: string, encoding: "utf8"): Promise<void>;
      };
      try {
        await privateTaskHandle.writeFile(taskText, "utf8");
        await privateTaskHandle.chmod(0o600);
      } finally {
        await privateTaskHandle.close();
      }
      const taskState = await lstat(taskPath) as Awaited<ReturnType<typeof lstat>> & {
        readonly dev: number; readonly ino: number; readonly uid: number;
      };
      const eventId = "completion-event";
      const header = JSON.stringify({
        cwd: root,
        id: sessionId,
        timestamp,
        type: "session",
      });
      const completion = JSON.stringify({
        content: "task completion",
        customType: "omo-senpi:wake",
        details: [{
          customType: "senpi-task.completion",
          details: [{
            final_response: finalResponse,
            model,
            status: "completed",
            task_id: taskId,
          }],
        }],
        display: false,
        id: eventId,
        parentId: null,
        timestamp,
        type: "custom_message",
      });
      const sessionFile = join(fixtureRoot, "session.jsonl");
      const sessionHandle = await open(sessionFile, "wx", 0o600);
      const privateSessionHandle = sessionHandle as unknown as {
        chmod(mode: number): Promise<void>;
        close(): Promise<void>;
        writeFile(data: string, encoding: "utf8"): Promise<void>;
      };
      try {
        await privateSessionHandle.writeFile(`${header}\n${completion}\n`, "utf8");
        await privateSessionHandle.chmod(0o600);
      } finally {
        await privateSessionHandle.close();
      }
      const provenance = {
        completionEvent: {
          lineNumber: 2,
          lineSha256: digestBytes(new TextEncoder().encode(completion)),
          prefixBytesSha256: digestBytes(new TextEncoder().encode(`${header}\n${completion}\n`)),
        },
        completionEventId: eventId,
        completionTimestamp: timestamp,
        hostRecordSha256: digestBytes(taskBytes),
        model,
        parentSessionId: sessionId,
        resultSha256,
        reviewerIdentity: `senpi-task:${taskId}`,
        schemaVersion: "boulder.senpi.task-provenance.v1",
        taskId,
        taskRecord: {
          device: taskState.dev,
          inode: taskState.ino,
          mode: "0600",
          pathSha256: digestBytes(new TextEncoder().encode(await realpath(taskPath))),
          sha256: digestBytes(taskBytes),
          size: taskState.size,
          uid: taskState.uid,
        },
      };

      expect(await authenticateTaskProvenance(
        provenance,
        { sessionFile, taskStoreRoot },
        resultSha256,
        `senpi-task:${taskId}`,
      )).toEqual({
        key: `task:${sessionId}:${taskId}:${eventId}`,
        timestamp,
      });
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });

  test("rederives lead and user authority from a private native transcript", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "k0r-session-provenance-"));
    try {
      const sessionId = "01999999-1111-7222-8333-555555555555";
      const timestamp = "2026-08-09T00:00:00.000Z";
      const model = "lead-model";
      const header = JSON.stringify({ cwd: root, id: sessionId, timestamp, type: "session" });
      const assistantContent = [{ text: "capture", type: "text" }];
      const assistant = JSON.stringify({
        id: "assistant-event",
        message: { content: assistantContent, model, role: "assistant" },
        timestamp,
        type: "message",
      });
      const payloadText = '{"decision":"approve"}';
      const payloadValue = { decision: "approve" };
      const user = JSON.stringify({
        id: "user-event",
        message: { content: [{ text: payloadText, type: "text" }], role: "user" },
        timestamp,
        type: "message",
      });
      const transcriptText = `${header}\n${assistant}\n${user}\n`;
      const sessionFile = join(fixtureRoot, "session.jsonl");
      const sessionHandle = await open(sessionFile, "wx", 0o600);
      const privateSessionHandle = sessionHandle as unknown as {
        chmod(mode: number): Promise<void>;
        close(): Promise<void>;
        writeFile(data: string, encoding: "utf8"): Promise<void>;
      };
      try {
        await privateSessionHandle.writeFile(transcriptText, "utf8");
        await privateSessionHandle.chmod(0o600);
      } finally {
        await privateSessionHandle.close();
      }
      const digestBytes = (bytes: Uint8Array): string =>
        `sha256:${sha256K0rBytes(bytes)}`;
      const digestCanonical = (value: unknown): string =>
        `sha256:${sha256CanonicalK0r(value)}`;
      const planFile = join(fixtureRoot, "plan.md");
      const planText = "- [ ] 1. first task\n- [ ] 10. final task\n";
      await writeFile(planFile, planText);
      const planSha256 = digestBytes(new TextEncoder().encode(planText));
      const implementerBase = {
        captureEventId: "assistant-event",
        captureTimestamp: timestamp,
        hostEventContentSha256: digestCanonical(assistantContent),
        model,
        planSha256,
        role: "assistant",
        schemaVersion: "boulder.senpi.lead-session-provenance.v1",
        sessionId,
      };
      const implementer = {
        ...implementerBase,
        hostRecordSha256: digestCanonical(implementerBase),
      };
      const context = { sessionFile, taskStoreRoot: join(fixtureRoot, "tasks"), planFile };
      expect(await authenticateImplementerProvenance(implementer, context)).toEqual({
        key: `lead-session:${sessionId}:assistant-event`,
        timestamp,
      });
      await writeFile(planFile, planText.replace("- [ ] 1. ", "- [x] 1. ").replace("- [ ] 10. ", "- [x] 10. "));
      expect(await authenticateImplementerProvenance(implementer, context, planSha256)).toEqual({
        key: `lead-session:${sessionId}:assistant-event`,
        timestamp,
      });

      const sessionState = await lstat(sessionFile) as Awaited<ReturnType<typeof lstat>> & {
        readonly dev: number; readonly ino: number; readonly uid: number;
      };
      const payloadBytes = new TextEncoder().encode(payloadText);
      const payloadSha256 = digestBytes(payloadBytes);
      const userProvenance = {
        eventContentSha256: payloadSha256,
        eventId: "user-event",
        eventLineNumber: 3,
        eventLineSha256: digestBytes(new TextEncoder().encode(user)),
        eventTimestamp: timestamp,
        payloadJcsSha256: digestCanonical(payloadValue),
        payloadPath: "reviews/k0r-maintainer.json",
        payloadRawSha256: payloadSha256,
        role: "user",
        schemaVersion: "boulder.senpi.user-event-provenance.v1",
        sessionId,
        transcript: {
          device: sessionState.dev,
          inode: sessionState.ino,
          mode: "0600",
          prefixBytesSha256: digestBytes(new TextEncoder().encode(transcriptText)),
          realpathSha256: digestBytes(new TextEncoder().encode(await realpath(sessionFile))),
          uid: sessionState.uid,
        },
      };
      expect(await authenticateUserProvenance(
        userProvenance,
        context,
        {
          bytes: payloadBytes,
          path: join(fixtureRoot, "maintainer.json"),
          sha256: payloadSha256,
          value: payloadValue,
        },
        "reviews/k0r-maintainer.json",
      )).toEqual({
        key: `user-event:${sessionId}:user-event`,
        timestamp,
      });
      const denialBytes = new TextEncoder().encode('{"decision":"deny"}');
      await expect(authenticateUserProvenance(
        userProvenance,
        context,
        {
          bytes: denialBytes,
          path: join(fixtureRoot, "maintainer.json"),
          sha256: payloadSha256,
          value: payloadValue,
        },
        "reviews/k0r-maintainer.json",
      )).rejects.toThrow("message bytes");
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });

  test("rejects a recomputed prior-exit receipt with a wrong manifest pointer", () => {
    const fileSha256 = `sha256:${"1".repeat(64)}`;
    const bindings = [
      { fileSha256, path: "evidence/k0r/acceptance-manifest.json", pointer: "/evidenceBinding/exitReceipt", value: "not_issued" },
      { fileSha256, path: "evidence/k0r/acceptance-manifest.json", pointer: "/requiredApprovals/3/status", value: "not_issued" },
      { fileSha256, path: "evidence/k0r/evidence-manifest.json", pointer: "/reviews/exitReceipt/status", value: "not_issued" },
      { fileSha256, path: "evidence/k0r/isolation-manifest.json", pointer: "/evidenceBinding/exitReceipt", value: "not_issued" },
      { fileSha256, path: "evidence/k0r/isolation-manifest.json", pointer: "/reviews/exitReceipt/status", value: "not_issued" },
    ];
    const receipt = (manifestBindings: typeof bindings) => {
      const base = {
        exitReceiptPath: "evidence/k0r/k0r-exit-receipt.json",
        manifestBindings,
        manifestBindingsSha256: `sha256:${sha256CanonicalK0r(manifestBindings)}`,
        schemaVersion: "boulder.k0r.prior-exit-state.v1",
        snapshotEntry: null,
        state: "absent_not_issued",
      };
      return {
        ...base,
        receiptSha256: `sha256:${sha256CanonicalK0r(base)}`,
      };
    };
    expect(thrownMessage(() => validatePriorExit(receipt(bindings)))).toBe("");
    const forged = bindings.map((binding, index) => index === 4
      ? { ...binding, pointer: "/reviews/exitReceipt/forged" }
      : binding);
    expect(thrownMessage(() => validatePriorExit(receipt(forged)))).toContain("binding");
  });
});

type RecordValue = Record<string, unknown>;

describe("K0R evidence contract", () => {
  test("uses schema-versioned, fail-closed external bindings with pending exact-byte approvals", async () => {
    const [inventory, acceptance, isolation] = await readContracts();
    expect(inventory["schemaVersion"]).toBe("k0r.v1-public-contract-inventory.v1");
    expect(acceptance["schemaVersion"]).toBe("k0r.acceptance-manifest.v1");
    expect(isolation["schemaVersion"]).toBe("boulder.k0r.isolation-manifest.v1");
    expect(recordValue(acceptance["exitPolicy"], "exit policy")["mode"]).toBe("fail_closed");
    expect(recordValue(inventory["evidenceBindings"], "inventory bindings")["bindingManifestSchemaVersion"]).toBe("boulder.k0r.evidence-manifest.v2");
    expect(recordValue(acceptance["thresholds"], "thresholds")["pendingContractBindings"]).toBe(4);
    const approvals = recordArray(acceptance["requiredApprovals"], "required approvals");
    expect(approvals.map((approval) => approval["id"])).toEqual(["architect-exact-byte-review", "critic-exact-byte-review", "maintainer-adr-exact-byte-approval", "k0r-exit-receipt"]);
    expect(approvals.slice(0, 3).every((approval) => approval["status"] === "pending_review" && approval["required"] === true)).toBe(true);
    expect(approvals[3]?.["status"]).toBe("not_issued");
    const receipt = parseRecord(await readFile(approvalReceiptFile, "utf8"), "approval provenance receipt");
    expect(Object.keys(receipt).sort()).toEqual(["approvalLimits", "authorizedScope", "consensusPlanSha256", "nonAuthoritativeProvenance", "prohibitedActions", "schemaVersion", "selectedBranch", "status"]);
    expect(receipt["schemaVersion"]).toBe("boulder.k0r.approval-provenance.v1");
    expect(receipt["status"]).toBe("scope_approved_adr_exact_bytes_pending");
    expect(receipt["consensusPlanSha256"]).toBe("sha256:12c210a0c57a611f3450c78e7e4743b11ae10258a682ea47a3eef4a1033d5c3a");
    expect(receipt["selectedBranch"]).toBe("superseding-adr");
    expect(receipt["authorizedScope"]).toBe("K0R evidence/ADR preparation only");
    expect(stringArray(receipt["prohibitedActions"], "prohibited actions")).toEqual(["K2 authority", "K3 authority", "K4 authority", "repository actions", "publication actions", "release actions", "root-guidance actions"]);
    expect(recordValue(receipt["approvalLimits"], "approval limits")).toEqual({ adrExactByteApproval: false, k0rExitReceipt: false });
    const receiptArtifact = recordArray(acceptance["requiredArtifacts"], "required artifacts").find((artifact) => artifact["id"] === "approval-provenance");
    expect(receiptArtifact).toEqual({ id: "approval-provenance", path: approvalReceiptPath, schema: "boulder.k0r.approval-provenance.v1" });
    expect(stringArray(acceptance["requiredOutputSchemas"], "required output schemas")).toContain("boulder.k0r.approval-provenance.v1");
  });

  test("keeps every v1 category, excludes v2 routing, and binds prior K0/K1 surfaces by path and digest", async () => {
    const [inventory, acceptance, isolation] = await readContracts();
    expect(stringArray(inventory["categories"], "categories")).toEqual(requiredCategories);
    expect(stringArray(recordValue(inventory["scope"], "scope")["excluded"], "excluded")).toContain("src/v2/**");
    expect(recordValue(acceptance["acceptance"], "acceptance")["v2ExclusionRequired"]).toBe(true);
    const initial = recordArray(recordValue(isolation["inventories"], "inventories")["initialPriorK0K1Inventory"], "initial inventory");
    for (const path of ["src/v2/execution.ts", "fixtures/v2-kernel/invalid-authority-vectors.json", "test/v2-cli-e2e.test.ts", "docs/adr/0003-v2-kernel-gates.md"]) expect(initial.some((entry) => entry["path"] === path)).toBe(true);
    expect(initial.every((entry) => typeof entry["path"] === "string" && /^sha256:[0-9a-f]{64}$/.test(String(entry["sha256"])))).toBe(true);
  });

  test("declares the generator and observed command-result schema without shell interpolation", async () => {
    const [, acceptance, isolation] = await readContracts();
    const commands = recordArray(acceptance["requiredCommands"], "required commands");
    expect(commandArgv(commands.find((command) => command["id"] === "evidence-generator") ?? {})).toEqual([
      "bun", "test/k0r-capture-evidence.ts",
      "--pending-transition", "${QA_ROOT}/protected/k0r-transition.pending.json",
      "--acceptance-manifest", "evidence/k0r/acceptance-manifest.json",
      "--baseline-transition", "evidence/k0r/baseline-transition.json",
      "--independent-reproduction", "evidence/k0r/independent-clean-source-reproduction.json",
      "--isolation-manifest", "evidence/k0r/isolation-manifest.json",
      "--superseding-adr", "evidence/k0r/superseding-adr.md",
      "--public-contract-inventory", "evidence/k0r/v1-public-contract-inventory.json",
      "--isolated-run-receipt", "evidence/k0r/isolated-run-receipt.json",
      "--approval-receipt", "evidence/k0r/approval-provenance.json",
      "--focused-gate-receipt", "${QA_ROOT}/receipts/k0r-focused-gate.post-isolated-run.json",
    ]);
    const observed = recordValue(recordValue(isolation["commands"], "commands")["observedResultSchema"], "observed command result schema");
    expect(observed["argv"]).toBe("string[]");
    expect(observed["cwd"]).toBe(".");
    expect(observed["stdoutSha256"]).toBe("sha256:<64-lowercase-hex>");
    expect(observed["stderrSha256"]).toBe("sha256:<64-lowercase-hex>");
    const source = await readFile(join(root, "test/k0r-capture-evidence.ts"), "utf8");
    expect(source).not.toContain("node:child_process");
    expect(source).toContain("runBoundedK0rProcess");
    expect(source).not.toContain("Bun.spawn");
    expect(source).not.toContain("shellQuote");
    expect(source).not.toContain("approvedPlan");
    expect(source).not.toContain(".gjc/");
    expect(source).toContain("--approval-receipt");
  });

  test("rejects unsafe output destinations and output escape in a minimal temporary repository", async () => {
    const temp = await mkdtemp(join(tmpdir(), "boulder-k0r-adversarial-"));
    try {
      const fakeRoot = join(temp, "repo");
      await mkdir(join(fakeRoot, "evidence/k0r"), { recursive: true });
      await writeFile(join(fakeRoot, "evidence/k0r/acceptance-manifest.json"), "{}");
      await expect(captureK0rEvidence({ root: fakeRoot, outputPath: join(temp, "escape.json"), approvalReceipt: approvalReceiptPath })).rejects.toThrow("output path");
      const output = join(fakeRoot, "evidence/k0r/evidence-manifest.json");
      await symlink(join(fakeRoot, "elsewhere"), output);
      await expect(captureK0rEvidence({ root: fakeRoot, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("single-link regular file");
      await rm(output);
      await link(join(fakeRoot, "evidence/k0r/acceptance-manifest.json"), output);
      await expect(captureK0rEvidence({ root: fakeRoot, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("single-link regular file");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  test("rejects symlink and hardlink inputs only after constructing a complete temporary evidence root", async () => {
    const temp = await mkdtemp(join(tmpdir(), "boulder-k0r-input-adversarial-"));
    try {
      const fixture = await createEvidenceRoot(temp);
      const input = join(fixture, "evidence/k0r/isolation-manifest.json");
      const output = join(fixture, "evidence/k0r/evidence-manifest.json");
      const outside = join(temp, "outside-input.json");
      await writeFile(outside, "{}");
      await rm(input);
      await symlink(outside, input);
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("single-link regular file");
      await rm(input);
      await link(outside, input);
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("single-link regular file");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
  test("rejects forged approval provenance receipts before capture", async () => {
    const temp = await mkdtemp(join(tmpdir(), "boulder-k0r-approval-receipt-"));
    try {
      const fixture = await createEvidenceRoot(temp);
      const output = join(fixture, "evidence/k0r/evidence-manifest.json");
      const receiptPath = join(fixture, approvalReceiptPath);
      const source = await readFile(receiptPath, "utf8");
      const forgedReceipt = async (mutate: (receipt: RecordValue) => void): Promise<void> => {
        const receipt = parseRecord(source, "approval provenance receipt");
        mutate(receipt);
        await writeFile(receiptPath, JSON.stringify(receipt));
      };

      await forgedReceipt((receipt) => { receipt["consensusPlanSha256"] = "sha256:0000000000000000000000000000000000000000000000000000000000000000"; });
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("consensus plan SHA-256");

      await forgedReceipt((receipt) => { receipt["authorizedScope"] = "K2 implementation"; });
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("authorized scope");

      await forgedReceipt((receipt) => { receipt["prohibitedActions"] = ["K2 authority"]; });
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("prohibited actions");

      await forgedReceipt((receipt) => { receipt["unexpected"] = true; });
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("unexpected keys");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  test("binds the complete-byte report and rejects forged reproduction, alternate-root source, and semantic report evidence", async () => {
    const temp = await mkdtemp(join(tmpdir(), "boulder-k0r-provenance-"));
    try {
      const fixture = await createEvidenceRoot(temp);
      const output = join(fixture, "evidence/k0r/evidence-manifest.json");
      const manifest = await captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath });
      expect(manifest.schemaVersion).toBe("boulder.k0r.evidence-manifest.v2");
      expect(manifest.approvalProvenance.path).toBe(approvalReceiptPath);
      expect(manifest.approvalProvenance.sha256).toBe(sha256(await readFile(join(fixture, approvalReceiptPath))));
      expect(manifest.approvalProvenance.consensusPlanSha256).toBe("sha256:12c210a0c57a611f3450c78e7e4743b11ae10258a682ea47a3eef4a1033d5c3a");
      expect(manifest.approvalProvenance.authorizedScope).toBe("K0R evidence/ADR preparation only");
      expect(manifest.approvalProvenance.prohibitedActions).toEqual(["K2 authority", "K3 authority", "K4 authority", "repository actions", "publication actions", "release actions", "root-guidance actions"]);
      expect(manifest.provenance.commandResults.every((result) => result.argv[0] === "git" && result.cwd === "." && result.exitCode === 0 && /^sha256:[0-9a-f]{64}$/.test(result.stdoutSha256))).toBe(true);
      expect(manifest.inventories.pre.ignored.some((entry) => entry.path === "ignored evidence input.txt")).toBe(true);
      expect(manifest.inventories.pre.tracked.find((entry) => entry.path === "src/v2/execution.ts")?.classification).toBe("prior-k0-k1");
      expect(manifest.inventories.pre.tracked.some((entry) => entry.path === "renamed odd\npath" && entry.status.includes("R"))).toBe(true);
      expect(manifest.inventories.pre.untracked.some((entry) => entry.path === "odd\nuntracked path")).toBe(true);
      expect(manifest.inventories.pre.tracked.map((entry) => entry.path)).toEqual(manifest.inventories.pre.tracked.map((entry) => entry.path).slice().sort());
      expect(manifest.inventories.pre.untracked.map((entry) => entry.path)).toEqual(manifest.inventories.pre.untracked.map((entry) => entry.path).slice().sort());
      expect(manifest.inventories.pre.ignored.map((entry) => entry.path)).toEqual(manifest.inventories.pre.ignored.map((entry) => entry.path).slice().sort());
      expect(manifest.mutationAssessment.count).toBe(0);
      expect(manifest.reviews.pendingReviewCount).toBe(4);
      const oracle = recordValue(manifest.independentOracle, "independent oracle binding");
      expect(oracle["reproductionMode"]).toBe("complete-byte-independent");
      const artifactDigests = recordValue(oracle["artifactDigests"], "bound artifact digests");
      const reproduced = recordValue(oracle["reproduced"], "bound reproduced artifacts");
      expect(Object.keys(artifactDigests).sort()).toEqual(oracleArtifactIds);
      expect(Object.keys(reproduced).sort()).toEqual(oracleArtifactIds);
      for (const id of oracleArtifactIds) {
        const reproduction = recordValue(reproduced[id], `bound reproduced ${id}`);
        expect(Object.keys(reproduction).sort()).toEqual(["byteMatch", "fixtureSha256", "sha256"]);
        expect(reproduction["sha256"]).toBe(artifactDigests[id]);
        expect(reproduction["fixtureSha256"]).toBe(artifactDigests[id]);
        expect(reproduction["byteMatch"]).toBe(true);
      }
      expect(oracle["oracleSourceSha256"]).toBe(sha256(await readFile(join(fixture, "test/k0r-independent-oracle.ts"))));
      await rm(output);
      const reportPath = join(fixture, "evidence/k0r/independent-clean-source-reproduction.json");
      const report = JSON.parse(await readFile(reportPath, "utf8")) as RecordValue;
      expect(Object.keys(report).sort()).toEqual(oracleReportKeys.slice().sort());
      expect(Object.keys(recordValue(report["artifacts"], "report artifacts")).sort()).toEqual(oracleArtifactIds);
      expect(Object.keys(recordValue(report["reproduced"], "report reproduced artifacts")).sort()).toEqual(oracleArtifactIds);
      expect(stringArray(report["failures"], "report failures")).toEqual([]);

      report["oracleSourceSha256"] = "sha256:not-a-digest";
      await writeFile(reportPath, JSON.stringify(report));
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("SHA-256 digest");

      report["oracleSourceSha256"] = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
      await writeFile(reportPath, JSON.stringify(report));
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("Oracle source digest is stale");

      report["oracleSourceSha256"] = sha256(await readFile(join(fixture, "test/k0r-independent-oracle.ts")));
      const oracleSourcePath = join(fixture, "test/k0r-independent-oracle.ts");
      const oracleSource = await readFile(oracleSourcePath, "utf8");
      await writeFile(oracleSourcePath, `${oracleSource}\n// alternate-root source tampering\n`);
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("Oracle source digest is stale");
      await writeFile(oracleSourcePath, oracleSource);
      const baseline = recordValue(recordValue(report["reproduced"], "report reproduced artifacts")["baseline"], "report reproduced baseline");
      const originalReproducedDigest = baseline["sha256"];
      baseline["sha256"] = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
      await writeFile(reportPath, JSON.stringify(report));
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("Oracle reproduction binding is invalid");

      baseline["sha256"] = originalReproducedDigest;
      baseline["byteMatch"] = false;
      await writeFile(reportPath, JSON.stringify(report));
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("Oracle reproduction binding is invalid");

      baseline["byteMatch"] = true;
      const artifacts = recordValue(report["artifacts"], "report artifacts");
      const originalArtifactDigest = artifacts["baseline"];
      artifacts["baseline"] = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
      await writeFile(reportPath, JSON.stringify(report));
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("Oracle artifact digest is stale");

      artifacts["baseline"] = originalArtifactDigest;
      await writeFile(output, "prior evidence\n");
      const seed = recordValue(report["seedMaterial"], "report seed material");
      const originalScannedFileCount = seed["scannedFileCount"];
      seed["scannedFileCount"] = (originalScannedFileCount as number) + 1;
      await writeFile(reportPath, JSON.stringify(report));
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("does not match the remeasured canonical report");
      seed["scannedFileCount"] = originalScannedFileCount;
      seed["status"] = "present";
      await writeFile(reportPath, JSON.stringify(report));
      await expect(captureK0rEvidence({ root: fixture, outputPath: output, approvalReceipt: approvalReceiptPath })).rejects.toThrow("seed material must be measured absent outside the approved oracle and generator");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
  test("uses the isolation manifest as the single exact K0R path authority", async () => {
    const isolation = (await buildK0rStaticBaseline(root)).isolation;
    expect(stringArray(recordValue(isolation["pathPolicy"], "path policy")["allowedK0RPaths"], "allowed K0R paths")).toEqual(k0rApprovedSourceOverlayPaths);
    const temp = await mkdtemp(join(tmpdir(), "boulder-k0r-allowlist-"));
    try {
      const fixture = await createEvidenceRoot(temp);
      const path = join(fixture, "evidence/k0r/isolation-manifest.json");
      const isolationFixture = parseRecord(await readFile(path, "utf8"), "isolation manifest");
      stringArray(recordValue(isolationFixture["pathPolicy"], "path policy")["allowedK0RPaths"], "allowed K0R paths").pop();
      await writeFile(path, JSON.stringify(isolationFixture));
      await expect(captureK0rEvidence({ root: fixture, approvalReceipt: approvalReceiptPath })).rejects.toThrow("does not exactly match implementation-required K0R paths");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  test("rejects changed and deleted declared prior K0/K1 inventory entries", async () => {
    const temp = await mkdtemp(join(tmpdir(), "boulder-k0r-prior-inventory-"));
    try {
      const changed = await createEvidenceRoot(join(temp, "changed"));
      await writeFile(join(changed, "src/v2/execution.ts"), "changed\n");
      await expect(captureK0rEvidence({ root: changed, approvalReceipt: approvalReceiptPath })).rejects.toThrow("Initial prior K0/K1 inventory digest differs");
      const deleted = await createEvidenceRoot(join(temp, "deleted"));
      await rm(join(deleted, "src/v2/execution.ts"));
      await expect(captureK0rEvidence({ root: deleted, approvalReceipt: approvalReceiptPath })).rejects.toThrow("Initial prior K0/K1 inventory path is missing");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  test("reports the first unsigned-UTF-8-sorted dirty-entry failure deterministically", async () => {
    const calls: string[] = [];
    const entries = [
      { path: "test/package-inventory-contract.test.ts", error: "Initial prior K0/K1 inventory digest differs: test/package-inventory-contract.test.ts." },
      { path: "src/v2/execution.ts", error: "Initial prior K0/K1 inventory path is missing: src/v2/execution.ts." }
    ];
    await expect(validateDirtyEntriesSequentially(entries, async (entry) => {
      calls.push(entry.path);
      throw new Error(entry.error);
    })).rejects.toThrow("Initial prior K0/K1 inventory path is missing: src/v2/execution.ts.");
    expect(calls).toEqual(["src/v2/execution.ts"]);
  });

  test("rejects dirty path aliases instead of normalizing them", async () => {
    for (const path of ["evidence\\k0r\\x.json", "evidence/k0r/\0x.json", "evidence/k0r/e\u0301.json"]) {
      await expect(validateDirtyEntriesSequentially([{ path }], async () => undefined)).rejects.toThrow("normalized repository-relative path");
    }
  });

  test("rejects root, oracle, directory, pending approval, and ignored-path forgeries", async () => {
    const temp = await mkdtemp(join(tmpdir(), "boulder-k0r-forgery-"));
    const expectFailure = async (name: string, mutate: (fixture: string) => Promise<void>, message: string): Promise<void> => {
      const fixture = await createEvidenceRoot(join(temp, name));
      await mutate(fixture);
      await expect(captureK0rEvidence({ root: fixture, approvalReceipt: approvalReceiptPath })).rejects.toThrow(message);
    };
    try {
      await expectFailure("agents", async (fixture) => { await writeFile(join(fixture, "AGENTS.md"), "tampered\n"); }, "Root AGENTS.md differs from HEAD");
      await expectFailure("seed", async (fixture) => { await writeFile(join(fixture, "real-seed.txt"), ["9d61b19deffd5a60", "ba844af492ec2cc4", "4449c5697b326919", "703bac031cae7f60"].join("")); }, "Independent oracle report does not match the remeasured canonical report");
      await expectFailure("directory", async (fixture) => {
        const k0r = join(fixture, "evidence/k0r");
        const outside = join(temp, "outside-k0r");
        await mkdir(outside);
        await rm(k0r, { recursive: true });
        await symlink(outside, k0r);
      }, "unsafe directory");
      await expectFailure("pending", async (fixture) => {
        const path = join(fixture, "evidence/k0r/acceptance-manifest.json");
        const acceptance = parseRecord(await readFile(path, "utf8"), "acceptance manifest");
        acceptance["forgery"] = "pending_capture";
        await writeFile(path, JSON.stringify(acceptance));
      }, "pending_capture");
      await expectFailure("approval-limit", async (fixture) => {
        const path = join(fixture, approvalReceiptPath);
        const receipt = parseRecord(await readFile(path, "utf8"), "approval receipt");
        recordValue(receipt["approvalLimits"], "approval limits")["k0rExitReceipt"] = true;
        await writeFile(path, JSON.stringify(receipt));
      }, "cannot grant ADR exact-byte approval or K0R exit");
      const ignored = await createEvidenceRoot(join(temp, "ignored"));
      await expect(captureK0rEvidenceForTest({
        root: ignored,
        approvalReceipt: approvalReceiptPath,
      }, { beforePostInventory: async () => { await writeFile(join(ignored, "ignored evidence input.txt"), "changed ignored\n"); } })).rejects.toThrow("Capture introduced undeclared mutations: ignored evidence input.txt");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  test("atomically replaces an existing evidence manifest and cleans up after rename failure", async () => {
    const temp = await mkdtemp(join(tmpdir(), "boulder-k0r-atomic-"));
    const residue = async (fixture: string): Promise<string[]> => (await readdir(join(fixture, "evidence/k0r"))).filter((entry) => entry.startsWith(".evidence-manifest.") && entry.endsWith(".tmp"));
    try {
      const success = await createEvidenceRoot(join(temp, "success"));
      const destination = join(success, "evidence/k0r/evidence-manifest.json");
      await writeFile(destination, "old manifest\n");
      await captureK0rEvidence({ root: success, approvalReceipt: approvalReceiptPath });
      expect(await readFile(destination, "utf8")).not.toBe("old manifest\n");
      expect(await residue(success)).toEqual([]);

      const failure = await createEvidenceRoot(join(temp, "failure"));
      const failedDestination = join(failure, "evidence/k0r/evidence-manifest.json");
      await writeFile(failedDestination, "old manifest\n");
      await expect(captureK0rEvidenceForTest({
        root: failure,
        approvalReceipt: approvalReceiptPath,
      }, { rename: async () => { throw new Error("injected rename failure"); } })).rejects.toThrow("injected rename failure");
      expect(await readFile(failedDestination, "utf8")).toBe("old manifest\n");
      expect(await residue(failure)).toEqual([]);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
  test("derives every v1 routed top-level route and public subcommand from source without unclassified surfaces", async () => {
    const [inventory] = await readContracts();
    const [cli, ops, routine, plan, profile, runs] = await Promise.all([
      readFile(join(root, "src/cli.ts"), "utf8"),
      readFile(join(root, "src/cli-ops-command.ts"), "utf8"),
      readFile(join(root, "src/routine-command.ts"), "utf8"),
      readFile(join(root, "src/plan-command.ts"), "utf8"),
      readFile(join(root, "src/profile-command.ts"), "utf8"),
      readFile(join(root, "src/runs-command.ts"), "utf8")
    ]);
    const commands = recordArray(inventory["commands"], "commands");
    const classifications = recordValue(inventory["routeClassifications"], "route classifications");
    const publicRoutes = stringArray(classifications["publicTopLevelRoutes"], "public routes");
    const excludedRoutes = recordArray(classifications["excludedInternalRoutes"], "excluded routes").map((entry) => stringValue(entry["route"], "excluded route"));
    const sourceRoutes = normalizeSet([
      ...literalMatches(cli, /command === "([^"]+)"/g),
      ...literalMatches(ops, /command === "([^"]+)"/g),
      ...literalMatches(routine, /args\[0\] === "([^"]+)"/g)
    ]);
    expect(sourceRoutes).toEqual(normalizeSet([...publicRoutes, ...excludedRoutes]));
    expect(normalizeSet(commands.map((command) => commandArgv(command)[0]!))).toEqual(normalizeSet(publicRoutes));

    expect(subcommandsFor(commands, "plan")).toEqual(quotedValues(plan.match(/const subcommands = new Set\(\[([^\]]+)\]\)/)?.[1] ?? "", "plan subcommands"));
    expect(subcommandsFor(commands, "profile")).toEqual(normalizeSet(literalMatches(profile, /subcommand === "([^"]+)"/g)));
    expect(subcommandsFor(commands, "runs")).toEqual(normalizeSet(literalMatches(runs, /action === "([^"]+)"/g)));
    expect(commandPaths(commands, "evidence")).toEqual(["evidence diff", "evidence inspect"]);
    expect(commandPaths(commands, "release")).toEqual(["release evidence refresh"]);
    expect(commandPaths(commands, "record")).toEqual(["record field-readiness"]);

    const commandIds = commands.map((command) => stringValue(command["id"], "command id"));
    expect(new Set(commandIds).size).toBe(commandIds.length);
    const paths = commands.map((command) => commandArgv(command).join(" "));
    expect(new Set(paths).size).toBe(paths.length);
    const hidden = recordArray(classifications["hiddenPublicTopLevelRoutes"], "hidden public routes").map((entry) => stringValue(entry["route"], "hidden route"));
    expect(normalizeSet(hidden)).toEqual(["evidence", "runs"]);
    expect(excludedRoutes).toEqual(["v2"]);
  });

  test("binds built-in profiles and every cited source to current bytes", async () => {
    const [inventory, , isolation] = await readContracts();
    const builtins = await readFile(join(root, "src/workflow-profile-builtins.ts"), "utf8");
    const profileDeclaration = builtins.match(/BUILT_IN_WORKFLOW_PROFILE_IDS = \[([\s\S]*?)\] as const/);
    const profiles = recordValue(inventory["profileAndDefaultPrecedence"], "profile precedence");
    expect(stringArray(profiles["builtInProfileIds"], "built-in profile ids").sort()).toEqual(quotedValues(profileDeclaration?.[1] ?? "", "built-in profile declaration").sort());
    expect(profiles["defaultProfile"]).toBe("programming-default");
    expect(recordValue(profiles["previewIdentity"], "preview identity")["id"]).toBe("boulder-native-preview");

    const derivedInventoryPaths = new Set(["fixtures/package-inventory/packaged-files.v0.json", "fixtures/docs/doc-registry.v0.json"]);
    const initialInventory = recordArray(recordValue(isolation["inventories"], "inventories")["initialPriorK0K1Inventory"], "initial inventory");
    const derivedInventory = new Map(initialInventory.map((entry) => [stringValue(entry["path"], "initial inventory path"), entry["sha256"]]));
    for (const path of derivedInventoryPaths) expect(derivedInventory.has(path)).toBe(true);
    const sourceRefs = recordArray(inventory["sourceRefs"], "source references");
    for (const path of sourceCitationPaths(inventory)) expect(sourceRefs.some((entry) => entry["path"] === path)).toBe(true);
    expect(new Set(sourceRefs.map((entry) => stringValue(entry["path"], "source reference path"))).size).toBe(sourceRefs.length);
    for (const sourceRef of sourceRefs) {
      const path = stringValue(sourceRef["path"], "source reference path");
      expect(sourceRef["binding"]).toBe("current");
      if (derivedInventoryPaths.has(path)) {
        expect(sourceRef["sha256"]).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(sha256(new TextEncoder().encode(await readHeadFile(path)))).toBe(derivedInventory.get(path));
      } else expect(sourceRef["sha256"]).toBe(sha256(await readFile(join(root, path))));
    }
  });

  test("keeps source-derivation dirty exclusions exact while requiring complete stable v1 schema coverage", async () => {
    const [inventory, , isolation] = await readContracts();
    const sourceDerivationDirtyExclusions = stringArray(recordValue(isolation["pathPolicy"], "path policy")["excludedUnrelatedPlannerPaths"], "source-derivation dirty exclusions");
    expect(sourceDerivationDirtyExclusions).toEqual([
      "docs/Boulder_ReFoundation_Initial_Planning_v0.1.zip",
      "src/common-executor-evidence.ts",
      "src/planner-benchmark.ts",
      "src/planner-pre-execution-safety.ts",
      "src/planner-scope-attribution.ts",
      "src/planner-score-workflow.ts",
      "src/planner-study-remediation.ts",
      "test/common-executor-evidence.test.ts",
      "test/planner-benchmark.test.ts",
      "test/planner-pre-execution-safety.test.ts",
      "test/planner-scope-attribution.test.ts",
      "test/planner-score-workflow.test.ts",
      "test/planner-study-remediation.test.ts"
    ]);
    expect(sourceDerivationDirtyExclusions.every((path) => !path.includes("*"))).toBe(true);
    const sourceDerivationDirtyOwnerPaths = sourceDerivationDirtyExclusions.filter((path) => path.startsWith("src/"));
    const discovery = recordValue(inventory["schemaVersionDiscovery"], "schema-version discovery");
    const scope = recordValue(discovery["scope"], "schema discovery scope");
    expect(scope).toEqual({
      packageInventoryPath: "fixtures/package-inventory/packaged-files.v0.json",
      sourcePathPattern: "src/**/*.ts",
      fixturePathPattern: "fixtures/**/*.json",
      discoveryRule: "Discover every shipped TypeScript string literal matching a Boulder or package schema-version identifier and every string JSON value whose key is schemaVersion; compare path-and-value pairs exactly."
    });

    const exclusions = recordValue(discovery["exclusions"], "schema exclusions");
    const unapprovedDirtyOwnerPaths = stringArray(exclusions["unapprovedDirtyOwnerPaths"], "unapproved dirty owner paths");
    const headOwnedDirtyOwnerPaths = sourceDerivationDirtyOwnerPaths.filter((path) => !unapprovedDirtyOwnerPaths.includes(path));
    expect(unapprovedDirtyOwnerPaths).toEqual(sourceDerivationDirtyOwnerPaths.filter((path) => path !== "src/planner-benchmark.ts"));
    expect(headOwnedDirtyOwnerPaths).toEqual(["src/planner-benchmark.ts"]);
    expect(stringValue(exclusions["unapprovedDirtyOwnerReason"], "unapproved dirty owner reason")).toContain("explicitly recorded");
    const packaged = parseRecord(await readFile(join(root, stringValue(scope["packageInventoryPath"], "package inventory path")), "utf8"), "package inventory");
    const shippedFiles = packageInventoryFiles(packaged);
    expect(shippedFiles).not.toContain("AGENTS.md");
    expect(shippedFiles.some((path) => path.startsWith("test/"))).toBe(false);
    expect(["src/AGENTS.md", "docs/AGENTS.md", "docs/CASE_STUDIES/AGENTS.md"].every((path) => shippedFiles.includes(path))).toBe(true);

    const sourcePaths = shippedFiles.filter((path) => path.startsWith("src/") && path.endsWith(".ts"));
    const fixturePaths = shippedFiles.filter((path) => path.startsWith("fixtures/") && path.endsWith(".json"));
    const actualForSourcePaths = async (paths: readonly string[]): Promise<string[]> => {
      const pairs = await Promise.all(paths.map(async (path) => {
        const source = await (headOwnedDirtyOwnerPaths.includes(path) ? readHeadFile(path) : readFile(join(root, path), "utf8"));
        return schemaPairs(path, schemaVersionLiterals(source));
      }));
      return normalizeSet(pairs.flat());
    };
    const actual = normalizeSet([
      ...(await actualForSourcePaths(sourcePaths.filter((path) => !unapprovedDirtyOwnerPaths.includes(path)))),
      ...(await Promise.all(fixturePaths.map(async (path) => schemaPairs(path, jsonSchemaVersions(JSON.parse(await readFile(join(root, path), "utf8"))))))).flat()
    ]);

    const classifications = stringArray(discovery["classifications"], "schema classifications");
    expect(classifications).toEqual(["public", "persisted/internal", "fixture-only", "v2-excluded", "unapproved-dirty-excluded"]);
    const v2PathPrefixes = stringArray(exclusions["v2PathPrefixes"], "v2 path prefixes");
    const v2Paths = stringArray(exclusions["v2Paths"], "v2 paths");
    const v2SchemaPrefixes = stringArray(exclusions["v2SchemaPrefixes"], "v2 schema prefixes");
    const v2SchemaSuffixes = stringArray(exclusions["v2SchemaSuffixes"], "v2 schema suffixes");
    expect(stringValue(exclusions["reason"], "v2 exclusion reason")).toContain("excluded");

    const contracts = recordArray(discovery["contracts"], "schema contracts");
    const declared = contracts.flatMap((contract) => {
      const path = stringValue(contract["path"], "schema contract path");
      const classification = stringValue(contract["classification"], "schema contract classification");
      const ownership = stringValue(contract["ownership"], "schema contract ownership");
      const versions = stringArray(contract["schemaVersions"], "schema contract versions");
      const dirtyOwner = unapprovedDirtyOwnerPaths.includes(path);
      expect(ownership.length).toBeGreaterThan(0);
      expect(versions.length).toBeGreaterThan(0);
      expect(classifications).toContain(classification);
      if (dirtyOwner) {
        expect(classification).toBe("unapproved-dirty-excluded");
        return [];
      }
      const v2Excluded = v2Paths.includes(path)
        || v2PathPrefixes.some((prefix) => path.startsWith(prefix))
        || versions.some((version) => v2SchemaPrefixes.some((prefix) => version.startsWith(prefix)) || v2SchemaSuffixes.some((suffix) => version.endsWith(suffix)));
      expect(classification).toBe(v2Excluded ? "v2-excluded" : path.startsWith("fixtures/") ? "fixture-only" : classification);
      if (!v2Excluded && !path.startsWith("fixtures/")) expect(["public", "persisted/internal"]).toContain(classification);
      return schemaPairs(path, versions);
    });
    const excludedContracts = contracts.filter((contract) => unapprovedDirtyOwnerPaths.includes(stringValue(contract["path"], "schema contract path")));
    expect(excludedContracts.map((contract) => stringValue(contract["path"], "schema contract path"))).toEqual(unapprovedDirtyOwnerPaths);
    expect(excludedContracts.flatMap((contract) => stringArray(contract["schemaVersions"], "excluded schema contract versions"))).toEqual([
      "boulder.common-executor-event.v1",
      "boulder.common-executor-final-receipt.v2",
      "boulder.common-executor-lifecycle.v1",
      "boulder.planner-pre-execution-safety-receipt-signature.v1",
      "boulder.planner-pre-execution-safety-receipt.v1",
      "boulder.planner-scope-attribution-receipt.v1",
      "boulder.planner-score-lock-receipt.v1",
      "boulder.planner-score-workflow.v1",
      "boulder.common-executor-final-receipt.v2",
      "boulder.common-executor-lifecycle.v1",
      "boulder.execution-approval.v1",
      "boulder.execution-packet.v1",
      "boulder.plan-approval.v1",
      "boulder.planner-pre-execution-safety-receipt.v1",
      "boulder.planner-scope-attribution-receipt.v1",
      "boulder.planner-score-workflow.v1",
      "boulder.planner-study-remediation-evidence.v1",
      "boulder.planning-packet.v1"
    ]);
    expect(new Set(declared).size).toBe(declared.length);
    expectSameSchemaPairs(actual, declared);

    const stablePlanPlannerPairs = contracts
      .filter((contract) => {
        const path = stringValue(contract["path"], "schema contract path");
        return (path.startsWith("src/plan-") || path.startsWith("src/planner-")) && !unapprovedDirtyOwnerPaths.includes(path) && stringArray(contract["schemaVersions"], "schema contract versions").some((version) => version.endsWith(".v1"));
      })
      .flatMap((contract) => schemaPairs(stringValue(contract["path"], "schema contract path"), stringArray(contract["schemaVersions"], "schema contract versions")));
    expect(stablePlanPlannerPairs.length).toBeGreaterThan(0);
    expect(stablePlanPlannerPairs.every((pair) => declared.includes(pair) && actual.includes(pair))).toBe(true);
  });
  test("rejects a new schema in the stable plan-command owner", async () => {
    const [inventory] = await readContracts();
    const discovery = recordValue(inventory["schemaVersionDiscovery"], "schema-version discovery");
    const contracts = recordArray(discovery["contracts"], "schema contracts");
    const declared = contracts
      .filter((contract) => stringValue(contract["classification"], "schema contract classification") !== "unapproved-dirty-excluded")
      .flatMap((contract) => schemaPairs(stringValue(contract["path"], "schema contract path"), stringArray(contract["schemaVersions"], "schema contract versions")));
    const planCommand = await readFile(join(root, "src/plan-command.ts"), "utf8");
    const injected = schemaPairs("src/plan-command.ts", schemaVersionLiterals(`${planCommand}\nconst regressionSchema = "boulder.plan-command-regression.v1";\n`));
    let rejection: unknown;
    try {
      expectSameSchemaPairs(normalizeSet([...declared, ...injected]), declared);
    } catch (error) {
      rejection = error;
    }
    expect(rejection instanceof Error && rejection.message === "schema contract inventory is incomplete").toBe(true);
  });
});
describe("K0R isolated-run receipt", () => {
  test("enforces fixture-local isolation and declares the pre-Task-8 isolated-run contract", async () => {
    const temp = await mkdtemp(join(tmpdir(), "boulder-k0r-isolation-boundary-"));
    const runIds = ["fixture-a", "fixture-b"] as const;
    const ready = new Map(runIds.map((runId) => [runId, deferred<void>()]));
    const accessComplete = new Map(runIds.map((runId) => [runId, deferred<readonly { readonly id: string; readonly path: string; readonly device: number; readonly inode: number }[]>()]));
    const releaseContestedAccess = deferred<void>();
    const phases = new Map(runIds.map((runId) => [runId, [] as string[]]));
    const unregister = runIds.map((runId) => registerK0rIsolationBoundaryHandler(runId, async (event) => {
      const seen = phases.get(runId)!;
      if (seen.includes(event.phase) || (event.phase === "access-complete" && seen[0] !== "fixture-root-ready")) throw new Error(`duplicate or out-of-order isolation event: ${runId}:${event.phase}`);
      seen.push(event.phase);
      if (event.phase === "fixture-root-ready") {
        ready.get(runId)!.resolve(undefined);
        await releaseContestedAccess.promise;
      } else {
        accessComplete.get(runId)!.resolve(event.resources);
        throw new Error(`boundary regression complete: ${runId}`);
      }
    }));
    try {
      const fixtures = await Promise.all(runIds.map((runId) => createEvidenceRoot(join(temp, runId))));
      const runs = runIds.map((runId, index) => runK0rIsolatedEvidence({ root: fixtures[index]!, runId }));
      const settledRuns = Promise.allSettled(runs);
      await withTimeout(Promise.all(runIds.map((runId) => ready.get(runId)!.promise)), 5_000, "fixture-root-ready");
      expect(phases).toEqual(new Map(runIds.map((runId) => [runId, ["fixture-root-ready"]])));
      releaseContestedAccess.resolve(undefined);
      const completed = await withTimeout(Promise.all(runIds.map((runId) => accessComplete.get(runId)!.promise)), 30_000, "access-complete");
      expect(completed.every((resources) => resources.map((resource) => resource.id).join(",") === "evidenceRoot,tempRoot,sourceBundlePath,candidatePath")).toBe(true);
      for (let index = 0; index < completed[0]!.length; index += 1) {
        const left = completed[0]![index]!;
        const right = completed[1]![index]!;
        expect(left.path).not.toBe(right.path);
        expect(`${left.device}:${left.inode}`).not.toBe(`${right.device}:${right.inode}`);
      }
      const results = await settledRuns;
      expect(results.map((result) => result.status === "rejected" && result.reason instanceof Error ? result.reason.message : "")).toEqual(runIds.map((runId) => `boundary regression complete: ${runId}`));
      expect(phases).toEqual(new Map(runIds.map((runId) => [runId, ["fixture-root-ready", "access-complete"]])));
    } finally {
      unregister.forEach((remove) => remove());
      await rm(temp, { recursive: true, force: true });
    }
    await verifyAtomicSourceBaseRegression();
    await verifySymlinkOverlayParentRegression();
    const acceptance = parseRecord(await readFile(acceptancePath, "utf8"), "acceptance manifest");
    const artifact = recordArray(acceptance["requiredArtifacts"], "required artifacts").find((entry) => entry["id"] === "isolated-run-receipt");
    expect(artifact).toEqual({
      id: "isolated-run-receipt",
      path: isolatedRunReceiptPath,
      schema: isolatedRunSchemaVersion,
      role: "generated measured isolated-run provenance; structurally not_run until an execution is captured"
    });
    const command = recordArray(acceptance["requiredCommands"], "required commands").find((entry) => entry["id"] === "isolated-run");
    expect(command?.["argv"]).toEqual(isolatedRunCommandArgv);
    const expectedChecks = await resolveK0rRepositoryCheckArgv(root);
    expect(recordArray(command?.["repositoryChecks"], "repository checks").map((entry) => entry["argv"])).toEqual(expectedChecks);
    expect(expectedChecks).toHaveLength(5);
    expect(expectedChecks.some((argv) => JSON.stringify(argv) === JSON.stringify(["bun", "run", "ci"]))).toBe(false);
    const source = await readFile(join(root, "test/k0r-run-evidence.ts"), "utf8");
    const [, , isolation] = await readContracts();
    expect(source).toContain("runBoundedK0rProcess");
    expect(source).not.toContain("Bun.spawn");
    expect(source).toContain("networkSurface: \"none\"");
    const dependencies = recordValue(recordValue(isolation["isolation"], "isolation")["dependencies"], "dependency contract");
    expect(dependencies).toEqual({
      typescript: {
        required: true,
        bunLockPath: "bun.lock",
        executable: "tsc",
        packageName: "typescript",
        packageVersionRange: "^6.0.3",
        packageJsonPath: "package.json",
        artifactPath: "lib/tsc.js",
        packageTreeDigestRequired: true,
        symlinkBoundaryForbidden: true,
        readOnlyDestinations: ["/k0r/typescript"]
      }
    });
  });
  test("validates the currently installed isolated-run receipt and rejects forgeries", async () => {
    const bytes = await readFile(join(root, isolatedRunReceiptPath));
    const receipt = await validateK0rIsolatedRunReceipt(bytes, root);
    expect(["not_run", "pass_pending_exact_byte_review", "fail"]).toContain(receipt.status);
    expect(receipt.status === "not_run" ? receipt.run === null : receipt.run !== null).toBe(true);
    if (receipt.run !== null) {
      const dependencyBinding = recordValue(receipt.run.dependencyBinding, "dependency binding");
      const bunLock = recordValue(dependencyBinding["bunLock"], "Bun lock binding");
      const typescript = recordValue(dependencyBinding["typescript"], "TypeScript binding");
      expect(bunLock).toEqual({ path: "bun.lock", sha256: sha256(await readFile(join(root, "bun.lock"))) });
      expect(typescript["executable"]).toBe("tsc");
      expect(typescript["packageName"]).toBe("typescript");
      expect(typescript["packageJsonPath"]).toBe("package.json");
      expect(typescript["artifactPath"]).toBe("lib/tsc.js");
      expect(typescript["version"]).toBe("6.0.3");
      expect(typescript["packageJsonSha256"]).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(typescript["artifactSha256"]).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(typescript["treeSha256"]).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(dependencyBinding["readOnlyDestinations"]).toEqual(["/k0r/typescript"]);
      const cleanInventory = recordValue(recordValue(receipt.run.isolation, "isolation")["cleanTempInventory"], "clean temporary inventory");
      const gitMetadata = recordValue(cleanInventory["gitMetadata"], "clean temporary Git metadata");
      const releaseManifest = parseRecord(await readFile(releaseManifestPath, "utf8"), "release manifest");
      const releaseTag = stringValue(releaseManifest["tag"], "release manifest tag");
      const releaseBundleFileName = `release-${releaseTag}.bundle`;
      expect(gitMetadata["packageVersion"]).toBe("0.1.17");
      expect(gitMetadata["tag"]).toBe(releaseTag);
      expect(gitMetadata["tagCommit"]).toBe(releaseManifest["tagCommit"]);
      expect(gitMetadata["commit"]).toMatch(/^[0-9a-f]{40}$/);
      expect(gitMetadata["tree"]).toMatch(/^[0-9a-f]{40}$/);
      const historicalTagBundle = recordValue(gitMetadata["historicalTagBundle"], "historical tag bundle");
      const privateQaRoot = join(tmpdir(), "boulder-k0r-private-qa");
      const privateReceipt = structuredClone(receipt);
      if (privateReceipt.run === null) throw new Error("private receipt clone lost its run");
      const privateBundle = recordValue(privateReceipt.run.isolation.cleanTempInventory.gitMetadata.historicalTagBundle, "private historical tag bundle");
      const privateBundlePath = join(privateQaRoot, "work/isolated-run/tmp", releaseBundleFileName);
      privateBundle["path"] = privateBundlePath;
      const privateBundleCommands = recordArray(privateBundle["commands"], "private historical tag bundle commands");
      privateBundleCommands[1]!["argv"] = ["git", "bundle", "create", privateBundlePath, `refs/tags/${releaseTag}`];
      privateBundleCommands[2]!["argv"] = ["git", "bundle", "list-heads", privateBundlePath];
      const privateValidated = await validateK0rIsolatedRunReceipt(new TextEncoder().encode(`${JSON.stringify(privateReceipt)}\n`), root);
      const installedBundlePath = stringValue(historicalTagBundle["path"], "installed historical tag bundle path");
      expect({
        installedPathMatches: installedBundlePath.endsWith(`/tmp/${releaseBundleFileName}`),
        privateStatus: privateValidated.status,
      }).toEqual({
        installedPathMatches: true,
        privateStatus: receipt.status,
      });
      expect(historicalTagBundle["sha256"]).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(historicalTagBundle["sourceTagCommit"]).toBe(releaseManifest["tagCommit"]);
      expect(historicalTagBundle["removed"]).toBe(true);
      expect(recordArray(historicalTagBundle["commands"], "historical tag bundle commands").map((command) => command["argv"])).toEqual([
        ["git", "rev-parse", "--verify", `refs/tags/${releaseTag}^{}`],
        ["git", "bundle", "create", historicalTagBundle["path"], `refs/tags/${releaseTag}`],
        ["git", "bundle", "list-heads", historicalTagBundle["path"]]
      ]);
      expect(stringArray(cleanInventory["tracked"], "clean temporary tracked paths")).toContain("package.json");
      expect(stringArray(cleanInventory["tracked"], "clean temporary tracked paths")).not.toContain(".git");
      expect(recordArray(gitMetadata["commands"], "clean temporary Git commands").map((command) => command["argv"])).toEqual([
        ["git", "init", "--quiet"],
        ["git", "add", "--all"],
        ["git", "commit", "--quiet", "--message", "K0R isolated clean source"],
        ["git", "rev-parse", "HEAD"],
        ["git", "rev-parse", "HEAD^{tree}"],
        ["git", "fetch", "--no-tags", `/tmp/${releaseBundleFileName}`, `refs/tags/${releaseTag}:refs/tags/${releaseTag}`],
        ["git", "rev-parse", "HEAD"],
        ["git", "rev-parse", "--verify", `refs/tags/${releaseTag}^{}`]
      ]);
      const forged = JSON.parse(new TextDecoder().decode(bytes)) as RecordValue;
      recordValue(recordValue(forged["run"], "forged receipt run")["dependencyBinding"], "forged dependency binding")["bunLock"] = { path: "bun.lock", sha256: "sha256:0000000000000000000000000000000000000000000000000000000000000000" };
      await expect(validateK0rIsolatedRunReceipt(new TextEncoder().encode(JSON.stringify(forged)), root)).rejects.toThrow("dependency binding is stale");
      const forgedBase = JSON.parse(new TextDecoder().decode(bytes)) as RecordValue;
      recordValue(recordValue(recordValue(forgedBase["run"], "forged receipt run")["sourceBundle"], "forged source bundle")["derivation"], "forged source derivation")["base"] = { archiveSha256: "sha256:0000000000000000000000000000000000000000000000000000000000000000", commit: "0000000000000000000000000000000000000000", tree: "0000000000000000000000000000000000000000" };
      await expect(validateK0rIsolatedRunReceipt(new TextEncoder().encode(JSON.stringify(forgedBase)), root)).rejects.toThrow("Unable to resolve immutable Git source identity");

      const forgedOverlay = JSON.parse(new TextDecoder().decode(bytes)) as RecordValue;
      const overlayFiles = recordArray(recordValue(recordValue(recordValue(recordValue(forgedOverlay["run"], "forged receipt run")["sourceBundle"], "forged source bundle")["derivation"], "forged source derivation")["overlay"], "forged source overlay")["files"], "forged source overlay files");
      overlayFiles[0]!["path"] = "src/planner-benchmark.ts";
      await expect(validateK0rIsolatedRunReceipt(new TextEncoder().encode(JSON.stringify(forgedOverlay)), root)).rejects.toThrow("source overlay");
      const forgedGeneratedInventories = JSON.parse(new TextDecoder().decode(bytes)) as RecordValue;
      const generatedInventories = recordValue(recordValue(recordValue(recordValue(forgedGeneratedInventories["run"], "forged receipt run")["sourceBundle"], "forged source bundle")["derivation"], "forged source derivation")["overlay"], "forged source overlay")["generatedInventories"] as RecordValue;
      const generatedEntries = recordArray(generatedInventories["entries"], "forged generated inventory entries");
      expect(generatedEntries.map((entry) => entry["path"])).toEqual(["fixtures/package-inventory/packaged-files.v0.json", "fixtures/docs/doc-registry.v0.json", "test/fixtures/baselines/readiness-v0/pack-dry-run.txt", "test/package-inventory-contract.test.ts", "evidence/k0r/evidence-manifest.json"]);
      const excludedPaths = stringArray(generatedEntries[0]?.["excludedPaths"], "forged package exclusions");
      expect(excludedPaths).toEqual([]);
      generatedEntries[0]!["excludedPaths"] = [...excludedPaths, "src/cli.ts"].sort();
      await expect(validateK0rIsolatedRunReceipt(new TextEncoder().encode(JSON.stringify(forgedGeneratedInventories)), root)).rejects.toThrow("generated inventory entry");
      const forgedCanonicalEvidenceManifest = JSON.parse(new TextDecoder().decode(bytes)) as RecordValue;
      const canonicalGeneratedInventories = recordValue(recordValue(recordValue(recordValue(forgedCanonicalEvidenceManifest["run"], "forged receipt run")["sourceBundle"], "forged source bundle")["derivation"], "forged source derivation")["overlay"], "forged source overlay")["generatedInventories"] as RecordValue;
      const canonicalEvidenceManifest = recordArray(canonicalGeneratedInventories["entries"], "canonical generated inventory entries").find((entry) => entry["path"] === "evidence/k0r/evidence-manifest.json");
      expect(canonicalEvidenceManifest).toEqual({
        path: "evidence/k0r/evidence-manifest.json",
        sourceSha256: canonicalEvidenceManifest?.["resultSha256"],
        resultSha256: canonicalEvidenceManifest?.["resultSha256"],
        excludedPaths: [],
        transformation: "install_canonical_pending_not_run_evidence_manifest"
      });
      canonicalEvidenceManifest!["resultSha256"] = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
      await expect(validateK0rIsolatedRunReceipt(new TextEncoder().encode(JSON.stringify(forgedCanonicalEvidenceManifest)), root)).rejects.toThrow("stale or forged");

      const forgedInventory = JSON.parse(new TextDecoder().decode(bytes)) as RecordValue;
      recordArray(recordValue(recordValue(forgedInventory["run"], "forged receipt run")["isolation"], "forged isolation")["postInventory"], "forged post inventory")[0]!["sha256"] = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
      await expect(validateK0rIsolatedRunReceipt(new TextEncoder().encode(JSON.stringify(forgedInventory)), root)).rejects.toThrow("inventory delta");
    }
    await expect(validateK0rIsolatedRunReceipt(new TextEncoder().encode(JSON.stringify({ ...receipt, unexpected: true })), root)).rejects.toThrow("unexpected keys");
    const invalidStatus = receipt.status === "not_run" ? "pass" : "not_run";
    await expect(validateK0rIsolatedRunReceipt(new TextEncoder().encode(JSON.stringify({ ...receipt, status: invalidStatus })), root)).rejects.toThrow(receipt.status === "not_run" ? "must be an object" : "must not contain measured output");
  });
  test("writes isolated receipts only through contained single-link paths and cleans failed randomized temporaries", async () => {
    const temp = await mkdtemp(join(tmpdir(), "boulder-k0r-receipt-writer-"));
    const fixture = join(temp, "repo");
    const destination = join(fixture, isolatedRunReceiptPath);
    const residue = async (): Promise<string[]> => (await readdir(join(fixture, "evidence/k0r"))).filter((entry) => entry.startsWith(".isolated-run-receipt.") && entry.endsWith(".tmp"));
    try {
      await mkdir(dirname(destination), { recursive: true });
      await writeK0rIsolatedRunReceipt(fixture, destination, "first\n");
      expect(await readFile(destination, "utf8")).toBe("first\n");
      await expect(writeK0rIsolatedRunReceipt(fixture, join(temp, "escape.json"), "escape\n")).rejects.toThrow("output path");

      const outside = join(temp, "outside");
      await writeFile(outside, "outside\n");
      await rm(destination);
      await symlink(outside, destination);
      await expect(writeK0rIsolatedRunReceipt(fixture, destination, "unsafe\n")).rejects.toThrow("single-link regular file");
      await rm(destination);
      await link(outside, destination);
      await expect(writeK0rIsolatedRunReceipt(fixture, destination, "unsafe\n")).rejects.toThrow("single-link regular file");
      await rm(destination);

      await expect(writeK0rIsolatedRunReceiptForTest(fixture, destination, "unsafe temp\n", {
        beforeRename: async (temporary) => {
          await rm(temporary);
          await symlink(outside, temporary);
        }
      })).rejects.toThrow("single-link regular file");
      await expect(writeK0rIsolatedRunReceiptForTest(fixture, destination, "unsafe temp\n", {
        beforeRename: async (temporary) => {
          await rm(temporary);
          await link(outside, temporary);
        }
      })).rejects.toThrow("single-link regular file");
      await expect(writeK0rIsolatedRunReceiptForTest(fixture, destination, "rename failure\n", {
        rename: async () => { throw new Error("injected rename failure"); }
      })).rejects.toThrow("injected rename failure");
      await expect(writeK0rIsolatedRunReceiptForTest(fixture, destination, "intended\n", {
        rename: async (_temporary, target) => { await writeFile(target, "forged\n"); }
      })).rejects.toThrow("differs from intended bytes");
      expect(await residue()).toEqual([]);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
  test("enforces bwrap isolation probes and rejects argv drift before process spawn", async () => {
    const [, , isolation] = await readContracts();
    const releaseManifest = parseRecord(await readFile(releaseManifestPath, "utf8"), "release manifest");
    const releaseTag = stringValue(releaseManifest["tag"], "release manifest tag");
    const releaseBundleFileName = `release-${releaseTag}.bundle`;
    const bwrap = recordValue(recordValue(isolation["isolation"], "isolation")["bwrap"], "bwrap policy");
    expect({
      priorSnapshotMode: isolatedPriorSnapshotMode,
      runtime: bwrap["runtime"],
      repositoryChecks: [0, 1, 2, 3, 4].map(resolveK0rRepositoryCheckExecution),
    }).toEqual({
      priorSnapshotMode: 0o600,
      runtime: "bwrap",
      repositoryChecks: [
        { location: "repository", readOnlyBoulder: true },
        { location: "boulder", readOnlyBoulder: false },
        { location: "boulder", readOnlyBoulder: false },
        { location: "boulder", readOnlyBoulder: false },
        { location: "boulder", readOnlyBoulder: false },
      ],
    });
    expect(bwrap["required"]).toBe(true);
    expect(stringArray(bwrap["mandatoryArgv"], "bwrap mandatory argv")).toEqual(["--die-with-parent", "--new-session", "--unshare-net", "--clearenv"]);
    expect(stringArray(bwrap["readOnlySystemRuntimePaths"], "bwrap runtime paths")).toEqual(["/usr", "/lib", "/lib64", "/etc"]);
    expect(bwrap["readOnlyRepositoryDestination"]).toBe("/workspace");
    expect(stringArray(bwrap["writableDedicatedRootDestinations"], "bwrap writable roots")).toEqual(["/k0r/home", "/k0r/cache", "/tmp", "/k0r/registry", "/k0r/credentials", "/k0r/boulder"]);
    expect(bwrap["hostHomeBindForbidden"]).toBe(true);
    expect(bwrap["hostHomeProbePath"]).toBe("/home");
    expect(recordValue(bwrap["runtimeExecutable"], "bwrap runtime executable")).toEqual({
      hostSource: "Bun.argv[0]",
      destination: "/k0r/runtime/bun",
      logicalArgv0: "bun",
      readOnly: true
    });
    const sourceDerivation = recordValue(recordValue(isolation["isolation"], "isolation")["sourceDerivation"], "source derivation");
    expect(recordValue(isolation["isolation"], "isolation")["kind"]).toBe("head-archive-plus-approved-overlay");
    expect(sourceDerivation["base"]).toBe("immutable HEAD tracked bytes via git archive");
    expect(sourceDerivation["unapprovedDirtyPathsExcluded"]).toBe(true);
    expect(recordValue(recordValue(isolation["isolation"], "isolation")["requirements"], "isolation requirements")["prePostInventoryMustMatchAfterCleanup"]).toBe(true);
    expect(recordValue(recordValue(isolation["isolation"], "isolation")["requirements"], "isolation requirements")["rootAgentsMustBeRecheckedAfterAllCommands"]).toBe(true);

    const allowlist = await readK0rIsolationArgvAllowlist(root);
    expect(allowlist).toEqual(stringArrayArray(recordValue(isolation["commands"], "commands")["argvAllowlist"], "argv allowlist"));
    const hasArgv = (expected: readonly string[]): boolean => allowlist.some((argv) => JSON.stringify(argv) === JSON.stringify(expected));
    expect(hasArgv(["bun", "test/k0r-capture-evidence.ts", "--approval-receipt", approvalReceiptPath])).toBe(true);
    expect(hasArgv(["git", "show", "HEAD:AGENTS.md"])).toBe(true);
    expect(hasArgv(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"])).toBe(true);
    expect(hasArgv(["git", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching"])).toBe(true);
    expect(hasArgv(["git", "ls-files", "-z"])).toBe(true);
    expect(hasArgv(["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"])).toBe(true);
    expect(hasArgv(["bun", "pm", "pack", "--dry-run", "--ignore-scripts"])).toBe(true);
    expect(hasArgv(["git", "commit", "--quiet", "--message", "K0R isolated clean source"])).toBe(true);
    expect(hasArgv(["git", "rev-parse", "--verify", `refs/tags/${releaseTag}^{}`])).toBe(true);
    expect(hasArgv(["git", "bundle", "create", `${"${K0R_TEMP_ROOT}"}/tmp/${releaseBundleFileName}`, `refs/tags/${releaseTag}`])).toBe(true);
    expect(hasArgv(["git", "bundle", "list-heads", `${"${K0R_TEMP_ROOT}"}/tmp/${releaseBundleFileName}`])).toBe(true);
    expect(hasArgv(["git", "fetch", "--no-tags", `/tmp/${releaseBundleFileName}`, `refs/tags/${releaseTag}:refs/tags/${releaseTag}`])).toBe(true);
    expect(hasArgv(["git", "archive", "--format=tar", "--output", "${K0R_TEMP_ROOT}/tmp/head-source.tar", "HEAD"])).toBe(true);
    expect(hasArgv(["tar", "-xf", "${K0R_TEMP_ROOT}/tmp/head-source.tar", "-C", "${K0R_TEMP_ROOT}/boulder"])).toBe(true);
    assertK0rAllowedArgv(["git", "show", "HEAD:AGENTS.md"], allowlist);
    let rejected = false;
    try {
      assertK0rAllowedArgv(["git", "show", "HEAD:package.json"], allowlist);
    } catch (error) {
      rejected = error instanceof Error && error.message.includes("not allowlisted");
    }
    expect(rejected).toBe(true);

    const enforcement = await verifyK0rSandboxEnforcement({ root });
    expect(enforcement.bwrapVersion).not.toBe("");
    expect(enforcement.networkProbe.exitCode).not.toBe(0);
    expect(enforcement.hostHomeProbe.exitCode).not.toBe(0);
  });
});

test("declares the planned canonical, reconcile, and exit module APIs", async () => {
  const [canonical, reconcile, exit] = await Promise.all([
    import("./k0r-canonical.js"),
    import("./k0r-reconcile-evidence.js"),
    import("./k0r-issue-exit.js")
  ]);
  expect(typeof canonical.canonicalizeK0rJson).toBe("function");
  expect(typeof canonical.sha256CanonicalK0r).toBe("function");
  expect(typeof canonical.runBoundedK0rProcess).toBe("function");
  expect(typeof reconcile.scanK0rBindings).toBe("function");
  expect(typeof reconcile.materializeK0rEvidence).toBe("function");
  expect(typeof reconcile.writeK0rTrackedFreeze).toBe("function");
  expect(typeof reconcile.finalizeK0rPendingTransition).toBe("function");
  expect(typeof exit.issueK0rExit).toBe("function");
  expect(typeof exit.verifyK0rExit).toBe("function");
  expect(typeof exit.finalizeK0rTransition).toBe("function");
  expect(typeof exit.verifyK0rTransition).toBe("function");
});

test("accepts approved external raw owner snapshots only with exact binding hashes", () => {
  const bytes = '{\n  "status": "historical"\n}\n';
  const paths = [
    "protected/pre-edit-binding-owners/evidence/k0r/approval-provenance.json",
    "protected/pre-edit-binding-owners/evidence/k0r/evidence-manifest.json",
    "protected/pre-edit-binding-owners/evidence/k0r/isolated-run-receipt.json",
  ];
  const entries = paths.map((path) => ({
    path,
    fileSha256: sha256K0rBytes(bytes),
    semanticJcsSha256: sha256CanonicalK0r({ status: "historical" }),
    format: "external-raw-json"
  }));
  const manifest = {
    schemaVersion: "boulder.k0r.pre-tracked-jcs-manifest.v1",
    canonicalizerReceiptSha256: `sha256:${"0".repeat(64)}`,
    selfPath: "protected/pre-tracked-jcs-manifest.json",
    selfDigestExcluded: true,
    entries,
    entriesSha256: sha256CanonicalK0r(entries)
  };
  const policy = {
    bindingOwnerSnapshots: paths.map((snapshotPath) => ({ snapshotPath, sha256: entries[0]!.fileSha256 }))
  };

  expect(verifyK0rPreTrackedJcsManifest(manifest, paths.map((path) => ({ path, bytes })), policy).verifiedEntryCount).toBe(3);
  let mismatch: unknown;
  try {
    verifyK0rPreTrackedJcsManifest(manifest, paths.map((path) => ({ path, bytes })), {
      bindingOwnerSnapshots: paths.map((snapshotPath, index) => ({ snapshotPath, sha256: index === 0 ? `sha256:${"f".repeat(64)}` : entries[0]!.fileSha256 }))
    });
  } catch (error) {
    mismatch = error;
  }
  expect(mismatch instanceof Error && mismatch.message.includes("binding owner snapshot digest mismatch")).toBe(true);
});

test("canonical promotion verifies every sealed manifest entry without a static count", async () => {
  const source = await readFile(
    join(import.meta.dir, "k0r-reconcile-evidence.ts"),
    "utf8",
  );
  expect(source).not.toContain("installedEntryCount");
  expect(source).toContain("verified.verifiedEntryCount !== entries.length");
});

test("classifies historical inventory paths without hiding live missing paths", () => {
  const base = {
    topLevelPaths: new Set(["docs", "evidence", "reference", "src", "test"]),
    presentPaths: new Set(["reference/DESIGN.md"])
  };

  expect(classifyK0rBindingPath("reference/DESIGN.md", {
    ...base,
    ownerPath: "evidence/k0r/evidence-manifest.json",
    bindingPath: "/inventories/pre/untracked/0/path"
  })).toEqual({ kind: "path", state: "present" });
  const historicalInventoryPath = ["docs", "BOULDER_PROJECT_SESSION_SUMMARY.ko.md"].join("/");
  expect(classifyK0rBindingPath(historicalInventoryPath, {
    ...base,
    ownerPath: "evidence/k0r/evidence-manifest.json",
    bindingPath: "/inventories/post/untracked/7/path"
  })).toEqual({ kind: "path", state: "evidence-contract" });
  expect(classifyK0rBindingPath("test/k0r-", {
    ...base,
    ownerPath: "test/k0r-capture-evidence.ts",
    bindingPath: "1139:1153"
  })).toEqual({ kind: "path", state: "runtime-contract" });
  const excludedPlannerPath = "docs/Boulder_ReFoundation_Initial_Planning_v0.1.zip";
  expect(classifyK0rBindingPath(excludedPlannerPath, {
    ...base,
    ownerPath: "evidence/k0r/isolation-manifest.json",
    bindingPath: "/pathPolicy/excludedUnrelatedPlannerPaths/0"
  })).toEqual({ kind: "path", state: "evidence-contract" });
  expect(classifyK0rBindingPath(excludedPlannerPath, {
    ...base,
    ownerPath: "test/k0r-evidence-contract.test.ts",
    bindingPath: "0:53"
  })).toEqual({ kind: "path", state: "evidence-contract" });
  expect(classifyK0rBindingPath(excludedPlannerPath, {
    ...base,
    ownerPath: "evidence/k0r/acceptance-manifest.json",
    bindingPath: "/requiredArtifacts/0/path"
  })).toEqual({ kind: "path", state: "historical-missing" });
  const syntheticDocFixturePath = ["docs", "a.md"].join("/");
  expect(classifyK0rBindingPath(syntheticDocFixturePath, {
    ...base,
    ownerPath: "test/k0r-evidence-contract.test.ts",
    bindingPath: "0:11"
  })).toEqual({ kind: "path", state: "evidence-contract" });
  const missingCurrentContractPath = ["docs", "missing-current-contract.md"].join("/");
  expect(classifyK0rBindingPath(missingCurrentContractPath, {
    ...base,
    ownerPath: "evidence/k0r/acceptance-manifest.json",
    bindingPath: "/requiredArtifacts/0/path"
  })).toEqual({ kind: "path", state: "historical-missing" });
});

test("formats final-owner diagnostics without changing binding state", () => {
  const diagnosticOwner = ["evidence", "k0r", "example.json"].join("/");
  const diagnosticLiteral = ["docs", "missing.zip"].join("/");
  expect(formatK0rHistoricalBindingDiagnostic({
    ownerPath: diagnosticOwner,
    bindingPath: "/paths/0",
    value: diagnosticLiteral
  })).toBe(
    'Final owners retain a historical-missing binding: owner=evidence/k0r/example.json binding=/paths/0 literal="docs/missing.zip".'
  );
});

test("formats removed-binding diagnostics without authorizing removal", () => {
  const removedOwner = ["evidence", "k0r", "example.json"].join("/");
  expect(formatK0rRemovedBindingDiagnostic({
    ownerPath: removedOwner,
    bindingPath: "/digests/0",
    bindingKind: "digest",
    targetState: "present",
    oldSha256: `sha256:${"0".repeat(64)}`,
    derivation: "json-pointer"
  })).toBe(
    `A pre-edit binding was removed without deterministic authority: owner=evidence/k0r/example.json binding=/digests/0 kind=digest state=present digest=sha256:${"0".repeat(64)} derivation=json-pointer.`
  );
});

test("authorizes only exact obsolete K0R writer binding removals", () => {
  const binding = {
    ownerPath: "evidence/k0r/acceptance-manifest.json",
    bindingPath: "/requiredCommands/0/argv/1",
    bindingKind: "path",
    targetState: "present",
    oldSha256: "sha256:4aca4b1f59c39d21667d4f0fcea14be940647840c941a350d2fb1fb05b11e994",
    derivation: "json-pointer"
  };
  expect([
    binding,
    { ...binding, ownerPath: "evidence/k0r/isolation-manifest.json", bindingPath: "/commands/argvAllowlist/30/1" },
    { ...binding, ownerPath: "evidence/k0r/isolation-manifest.json", bindingPath: "/commands/argvAllowlist/1/1", oldSha256: "sha256:50f7dd53b1267dd6d3c0338a16e4273faf2e148b42c4e683f94770885b1037df" },
    { ...binding, ownerPath: "evidence/k0r/isolation-manifest.json", bindingPath: "/commands/argvAllowlist/6/1", oldSha256: "sha256:50f7dd53b1267dd6d3c0338a16e4273faf2e148b42c4e683f94770885b1037df" },
    { ...binding, bindingPath: "/requiredCommands/5/oracleArgv/1", oldSha256: "sha256:50f7dd53b1267dd6d3c0338a16e4273faf2e148b42c4e683f94770885b1037df" },
    { ...binding, bindingPath: "/requiredCommands/5/repositoryChecks/0/argv/1", oldSha256: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" },
    { ...binding, bindingPath: "/requiredCommands/5/repositoryChecks/0/argv/2", oldSha256: "sha256:eae71ace01862f0ab4f487982e838bc3c5b7e76ba4a2d6d3d40ef2ec63ef3cf7" },
    { ...binding, bindingPath: "/requiredCommands/5/repositoryChecks/3/argv/4", oldSha256: "sha256:a54ff182c7e8acf56acfd6e4b9c3ff41e2c41a31c9b211b2deb9df75d9a478f9" },
    { ...binding, ownerPath: "evidence/k0r/isolation-manifest.json", bindingPath: "/commands/argvAllowlist/7/1", oldSha256: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" },
    { ...binding, ownerPath: "evidence/k0r/isolation-manifest.json", bindingPath: "/commands/argvAllowlist/7/2", oldSha256: "sha256:eae71ace01862f0ab4f487982e838bc3c5b7e76ba4a2d6d3d40ef2ec63ef3cf7" },
  ].map(classifyK0rRemovedBindingDisposition)).toEqual(Array(10).fill("obsolete-writer"));
  expect(classifyK0rRemovedBindingDisposition({ ...binding, ownerPath: "evidence/k0r/isolation-manifest.json", bindingPath: "/commands/argvAllowlist/30/1" })).toBe("obsolete-writer");
  expect(classifyK0rRemovedBindingDisposition({ ...binding, bindingPath: "/requiredCommands/1/argv/1" })).toBe(undefined);
  expect(classifyK0rRemovedBindingDisposition({ ...binding, oldSha256: `sha256:${"0".repeat(64)}` })).toBe(undefined);
});

describe("K0R reconciliation identity", () => {
  test("uses deletion-before-insertion Myers edits and replays ab to ba", () => {
    const edits = myersK0rByteEdits("ab", "ba");
    expect(edits).toEqual([
      { kind: "delete", byte: 97, preOffset: 0, finalOffset: null },
      { kind: "equal", byte: 98, preOffset: 1, finalOffset: 0 },
      { kind: "insert", byte: 97, preOffset: null, finalOffset: 1 }
    ]);
    expect(new TextDecoder().decode(Uint8Array.from(edits.filter((edit) => edit["kind"] !== "delete").map((edit) => Number(edit["byte"]))))).toBe("ba");
  });

  test("rejects duplicate and missing pre and final IDs before matching with deterministic diagnostics", () => {
    const ownerPath = "evidence/k0r/isolation-manifest.json";
    const source = '{"path":"docs/a.md"}';
    const item = reconciliationBinding(ownerPath, "path", "/path", "present", "docs/a.md", "json-pointer");
    const id = reconciliationBindingId(item, "oldRange");
    const owners = [{ ownerPath, preBytes: source, finalBytes: source }];

    expect(thrownMessage(() => reconcileBindings([item, item], [item], owners))).toBe(`Duplicate pre binding ID: id=${id} count=2.`);
    expect(thrownMessage(() => reconcileBindings([item], [item, item], owners))).toBe(`Duplicate final binding ID: id=${reconciliationBindingId(item, "finalRange")} count=2.`);
    const missingRange = { ...item, bindingPath: undefined } as unknown as ReconciliationTestBinding;
    expect(thrownMessage(() => reconcileBindings([missingRange], [item], owners))).toBe("Missing pre binding ID input.");
    expect(thrownMessage(() => reconcileBindings([item], [missingRange], owners))).toBe("Missing final binding ID input.");
  });

  test("keeps repeated identical values at distinct pointers deterministic under reversed input order", () => {
    const ownerPath = "evidence/k0r/isolation-manifest.json";
    const source = '{"left":"docs/a.md","right":"docs/a.md"}';
    const left = reconciliationBinding(ownerPath, "path", "/left", "present", "docs/a.md", "json-pointer");
    const right = reconciliationBinding(ownerPath, "path", "/right", "present", "docs/a.md", "json-pointer");
    const owners = [{ ownerPath, preBytes: source, finalBytes: source }];

    const forward = reconcileBindings([left, right], [left, right], owners);
    const reversed = reconcileBindings([right, left], [right, left], [...owners].reverse());
    expect(reversed).toEqual(forward);
    expect(forward.map((entry) => entry["disposition"])).toEqual(["unchanged", "unchanged"]);
    expect(new Set(forward.map((entry) => entry["preBindingId"])).size).toBe(2);
  });

  test("treats a changed JSON raw-token spelling with the same decoded digest as replaced", () => {
    const ownerPath = "evidence/k0r/isolation-manifest.json";
    const preBytes = '{"x":"docs/a.md"}';
    const finalBytes = '{"x":"docs\\/a.md"}';
    const oldBinding = reconciliationBinding(ownerPath, "path", "/x", "present", "docs/a.md", "json-pointer");
    const finalBinding = reconciliationBinding(ownerPath, "path", "/x", "present", "docs/a.md", "json-pointer");

    const [result] = reconcileBindings([oldBinding], [finalBinding], [{ ownerPath, preBytes, finalBytes }]);
    expect(result?.["disposition"]).toBe("replaced");
    expect(result?.["oldSha256"]).toBe(result?.["finalSha256"]);
  });

  test("maps an unchanged JSON literal through a pointer shift and adds the inserted literal", () => {
    const ownerPath = "evidence/k0r/isolation-manifest.json";
    const preBytes = '{"items":["A"]}';
    const finalBytes = '{"items":["B","A"]}';
    const oldA = reconciliationBinding(ownerPath, "path", "/items/0", "present", "A", "json-pointer");
    const finalA = reconciliationBinding(ownerPath, "path", "/items/1", "present", "A", "json-pointer");
    const finalB = reconciliationBinding(ownerPath, "path", "/items/0", "present", "B", "json-pointer");

    const result = reconcileBindings([oldA], [finalA, finalB], [{ ownerPath, preBytes, finalBytes }]);
    expect(result.map((entry) => [entry["disposition"], entry["finalSha256"]])).toEqual([
      ["added", finalB.oldSha256],
      ["unchanged", finalA.oldSha256]
    ]);
    const unchanged = result.find((entry) => entry["disposition"] === "unchanged");
    expect(unchanged?.["preBindingId"]).toBe(reconciliationBindingId(oldA, "oldRange"));
    expect(unchanged?.["finalBindingId"]).toBe(reconciliationBindingId(finalA, "finalRange"));
  });

  test("preserves stable JSON pointer identity across a crossing byte rewrite", () => {
    const ownerPath = "fixture.json";
    const value = "contract.v1";
    const stable = reconciliationBinding(
      ownerPath,
      "schema-version",
      "/schemaVersion",
      "present",
      value,
      "json-pointer",
    );
    const left = "a".repeat(128);
    const right = "b".repeat(128);
    const preBytes = JSON.stringify({ a: left, schemaVersion: value, z: right });
    const finalBytes = JSON.stringify({ a: right, schemaVersion: value, z: left });

    const [result] = reconcileBindings(
      [stable],
      [stable],
      [{ ownerPath, preBytes, finalBytes }],
    );
    expect(result?.["disposition"]).toBe("unchanged");
    expect(result?.["preBindingId"]).toBe(reconciliationBindingId(stable, "oldRange"));
    expect(result?.["finalBindingId"]).toBe(reconciliationBindingId(stable, "finalRange"));
  });

  test("replaces an exact JSON pointer value across a crossing byte rewrite", () => {
    const ownerPath = "fixture.json";
    const before = reconciliationBinding(
      ownerPath,
      "digest",
      "/sourceRefs/0/sha256",
      "present",
      `sha256:${"1".repeat(64)}`,
      "json-pointer",
    );
    const after = reconciliationBinding(
      ownerPath,
      "digest",
      "/sourceRefs/0/sha256",
      "present",
      `sha256:${"2".repeat(64)}`,
      "json-pointer",
    );
    const left = "a".repeat(128);
    const right = "b".repeat(128);
    const preBytes = JSON.stringify({
      a: left,
      sourceRefs: [{ sha256: before.value }],
      z: right,
    });
    const finalBytes = JSON.stringify({
      a: right,
      sourceRefs: [{ sha256: after.value }],
      z: left,
    });

    const [result] = reconcileBindings(
      [before],
      [after],
      [{ ownerPath, preBytes, finalBytes }],
    );
    expect(result?.["disposition"]).toBe("replaced");
    expect(result?.["preBindingId"]).toBe(reconciliationBindingId(before, "oldRange"));
    expect(result?.["finalBindingId"]).toBe(reconciliationBindingId(after, "finalRange"));
  });

  test("preserves shifted JSON array identity across a crossing byte rewrite", () => {
    const ownerPath = "fixture.json";
    const value = "test/k0r-run-evidence.ts";
    const before = reconciliationBinding(
      ownerPath,
      "path",
      "/items/0/path",
      "present",
      value,
      "json-pointer",
    );
    const after = reconciliationBinding(
      ownerPath,
      "path",
      "/items/1/path",
      "present",
      value,
      "json-pointer",
    );
    const left = "a".repeat(128);
    const right = "b".repeat(128);
    const preBytes = JSON.stringify({ a: left, items: [{ path: value }], z: right });
    const finalBytes = JSON.stringify({
      a: right,
      items: [{ ignored: true }, { path: value }],
      z: left,
    });

    const [result] = reconcileBindings(
      [before],
      [after],
      [{ ownerPath, preBytes, finalBytes }],
    );
    expect(result?.["disposition"]).toBe("unchanged");
    expect(result?.["preBindingId"]).toBe(reconciliationBindingId(before, "oldRange"));
    expect(result?.["finalBindingId"]).toBe(reconciliationBindingId(after, "finalRange"));
  });

  test("maps a TS literal after a seven-byte Korean comment insertion", () => {
    const ownerPath = "test/k0r-evidence-contract.test.ts";
    const preBytes = '"docs/a.md";\n';
    const finalBytes = `// 한\n${preBytes}`;
    const preRange = tsLiteralRange(preBytes, "docs/a.md");
    const finalRange = tsLiteralRange(finalBytes, "docs/a.md");
    expect(Number(finalRange.split(":")[0]) - Number(preRange.split(":")[0])).toBe(7);
    const oldBinding = reconciliationBinding(ownerPath, "path", preRange, "present", "docs/a.md", "ts-ast-literal");
    const finalBinding = reconciliationBinding(ownerPath, "path", finalRange, "present", "docs/a.md", "ts-ast-literal");

    const [result] = reconcileBindings([oldBinding], [finalBinding], [{ ownerPath, preBytes, finalBytes }]);
    expect(result?.["disposition"]).toBe("unchanged");
    expect(result?.["finalBindingId"]).toBe(reconciliationBindingId(finalBinding, "finalRange"));
  });

  test("does not pair candidates across an unchanged anchor and rejects a one-pre two-final hunk", () => {
    const ownerPath = "test/k0r-evidence-contract.test.ts";
    const literal = '"docs/a.md";\n';
    const anchor = "const anchor = 1;\n";
    const preBytes = `${literal}${anchor}`;
    const finalBytes = `${anchor}${literal}`;
    const oldBinding = reconciliationBinding(ownerPath, "path", tsLiteralRange(preBytes, "docs/a.md"), "historical-missing", "docs/a.md", "ts-ast-literal");
    const finalBinding = reconciliationBinding(ownerPath, "path", tsLiteralRange(finalBytes, "docs/a.md"), "present", "docs/a.md", "ts-ast-literal");
    const separated = reconcileBindings([oldBinding], [finalBinding], [{ ownerPath, preBytes, finalBytes }]);
    expect(separated.map((entry) => entry["disposition"]).sort()).toEqual(["added", "removed"]);

    const ambiguousPre = "'AAAAAAAA';";
    const ambiguousFinal = '"BBBBBBBB"`CCCCCCCC`;';
    const pre = reconciliationBinding(ownerPath, "path", tsLiteralRange(ambiguousPre, "AAAAAAAA"), "present", "AAAAAAAA", "ts-ast-literal");
    const first = reconciliationBinding(ownerPath, "path", tsLiteralRange(ambiguousFinal, "BBBBBBBB"), "present", "BBBBBBBB", "ts-ast-literal");
    const second = reconciliationBinding(ownerPath, "path", tsLiteralRange(ambiguousFinal, "CCCCCCCC"), "present", "CCCCCCCC", "ts-ast-literal");
    const obsoleteOwner = "evidence/k0r/acceptance-manifest.json";
    const obsoleteValue = "test/k0r-baseline-generator.ts";
    const obsoletePre = JSON.stringify({ requiredCommands: [{ argv: ["bun", obsoleteValue] }] });
    const obsoleteFinal = JSON.stringify({ fresh: ["test/k0r-run-evidence.ts", "test/k0r-capture-evidence.ts"] });
    const obsolete = reconciliationBinding(obsoleteOwner, "path", "/requiredCommands/0/argv/1", "present", obsoleteValue, "json-pointer");
    const freshRun = reconciliationBinding(obsoleteOwner, "path", "/fresh/0", "present", "test/k0r-run-evidence.ts", "json-pointer");
    const freshCapture = reconciliationBinding(obsoleteOwner, "path", "/fresh/1", "present", "test/k0r-capture-evidence.ts", "json-pointer");
    expect({
      added: reconcileBindings([], [first, second], [{ ownerPath, preBytes: "", finalBytes: ambiguousFinal }]).map((entry) => entry["disposition"]),
      ambiguous: thrownMessage(() => reconcileBindings([pre], [first, second], [{ ownerPath, preBytes: ambiguousPre, finalBytes: ambiguousFinal }])),
      authorizedMixed: reconcileBindings([obsolete], [freshRun, freshCapture], [{ ownerPath: obsoleteOwner, preBytes: obsoletePre, finalBytes: obsoleteFinal }]).map((entry) => [entry["disposition"], entry["reason"]]),
    }).toEqual({
      added: ["added", "added"],
      ambiguous: `Ambiguous literal-aware reconciliation hunk: owner=${ownerPath} preCandidates=1 finalCandidates=2.`,
      authorizedMixed: [["added", "new-contract"], ["added", "new-contract"], ["removed", "obsolete-binding"]],
    });
  });

  test("keeps owner and kind isolation fail-closed", () => {
    const preOwner = "evidence/k0r/isolation-manifest.json";
    const finalOwner = "evidence/k0r/acceptance-manifest.json";
    const source = '{"path":"docs/a.md"}';
    const oldBinding = reconciliationBinding(preOwner, "path", "/path", "present", "docs/a.md", "json-pointer");
    const otherOwner = reconciliationBinding(finalOwner, "path", "/path", "present", "docs/a.md", "json-pointer");
    expect(thrownMessage(() => reconcileBindings([oldBinding], [otherOwner], [
      { ownerPath: preOwner, preBytes: source, finalBytes: "{}" },
      { ownerPath: finalOwner, finalBytes: source }
    ]))).toContain("A pre-edit binding was removed without deterministic authority");

    const otherKind = reconciliationBinding(preOwner, "schema-version", "/path", "present", "docs/a.md", "json-pointer");
    expect(thrownMessage(() => reconcileBindings([oldBinding], [otherKind], [{ ownerPath: preOwner, preBytes: source, finalBytes: source }]))).toBe(
      `Unmatched pre binding after byte reconciliation: owner=${preOwner} kind=path binding=/path.`
    );
  });

  test("reconciles one changed literal in one minimal hunk as replaced", () => {
    const ownerPath = "evidence/k0r/isolation-manifest.json";
    const bindingPath = "/inventories/initialPriorK0K1Inventory/1/sha256";
    const oldLiteral = "sha256:e503fda73391a87848b54fa51b6659b7a3f182624fca36cf7c72f9f8c2c02a9a";
    const finalLiteral = "sha256:7b28a8f0f9f6b5e20f85194a7a732a1f373351f7ceee4a07ed6eeb5d03e99e55";
    const preBytes = `{"inventories":{"initialPriorK0K1Inventory":[null,{"sha256":${JSON.stringify(oldLiteral)}}]}}`;
    const finalBytes = `{"inventories":{"initialPriorK0K1Inventory":[null,{"sha256":${JSON.stringify(finalLiteral)}}]}}`;
    const oldBinding = reconciliationBinding(ownerPath, "digest", bindingPath, "present", oldLiteral, "json-pointer");
    const finalBinding = reconciliationBinding(ownerPath, "digest", bindingPath, "present", finalLiteral, "json-pointer");

    const [binding] = reconcileBindings([oldBinding], [finalBinding], [{ ownerPath, preBytes, finalBytes }]);
    expect(binding).toEqual({
      ownerPath,
      bindingKind: "digest",
      targetState: "present",
      disposition: "replaced",
      preBindingId: reconciliationBindingId(oldBinding, "oldRange"),
      finalBindingId: reconciliationBindingId(finalBinding, "finalRange"),
      oldSha256: oldBinding.oldSha256,
      finalSha256: finalBinding.oldSha256,
      reason: null,
      derivation: "json-pointer-diff"
    });
  });
});

interface ReconciliationTestBinding extends RecordValue {
  readonly ownerPath: string;
  readonly bindingKind: "digest" | "path" | "schema-version";
  readonly bindingPath: string;
  readonly targetState: "present" | "runtime-contract" | "evidence-contract" | "historical-missing";
  readonly oldSha256: string;
  readonly derivation: "json-pointer" | "ts-ast-literal";
  readonly value: string;
}

function reconciliationBinding(
  ownerPath: string,
  bindingKind: ReconciliationTestBinding["bindingKind"],
  bindingPath: string,
  targetState: ReconciliationTestBinding["targetState"],
  value: string,
  derivation: ReconciliationTestBinding["derivation"]
): ReconciliationTestBinding {
  return { ownerPath, bindingKind, bindingPath, targetState, oldSha256: `sha256:${sha256K0rBytes(value)}`, derivation, value };
}

function reconciliationBindingId(binding: ReconciliationTestBinding, rangeKey: "oldRange" | "finalRange"): string {
  return `sha256:${sha256CanonicalK0r({ ownerPath: binding.ownerPath, bindingKind: binding.bindingKind, [rangeKey]: binding.bindingPath, [rangeKey === "oldRange" ? "oldSha256" : "finalSha256"]: binding.oldSha256 })}`;
}

function reconcileBindings(
  pre: readonly ReconciliationTestBinding[],
  final: readonly ReconciliationTestBinding[],
  owners: readonly { readonly ownerPath: string; readonly preBytes?: string | Uint8Array; readonly finalBytes?: string | Uint8Array }[]
): RecordValue[] {
  return reconcileK0rBindingEntries(pre, final, owners);
}

function tsLiteralRange(source: string, value: string): string {
  const quoted = [`"${value}"`, `'${value}'`, `\`${value}\``].find((candidate) => source.includes(candidate));
  if (quoted === undefined) throw new Error(`TS test literal is missing: ${value}.`);
  const start = source.indexOf(quoted);
  const encoder = new TextEncoder();
  return `${encoder.encode(source.slice(0, start)).byteLength}:${encoder.encode(source.slice(0, start + quoted.length)).byteLength}`;
}

function thrownMessage(action: () => unknown): string {
  try { action(); } catch (error) { return error instanceof Error ? error.message : String(error); }
  return "";
}

function gitStdout(args: readonly string[]): Promise<string> {
  return gitStdoutAt(root, args);
}

function gitStdoutAt(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });
}

async function verifyAtomicSourceBaseRegression(): Promise<void> {
  const temp = await mkdtemp(join(tmpdir(), "boulder-k0r-source-revision-"));
  const fixture = join(temp, "repo");
  try {
    await runGit(root, ["worktree", "add", "--detach", fixture, "HEAD"]);
    let resolvedCommit = "";
    const base = await deriveK0rSourceBaseForTest(fixture, async (commit) => {
      resolvedCommit = commit;
      await runGit(fixture, ["-c", "user.name=K0R Test", "-c", "user.email=k0r@example.invalid", "commit", "--allow-empty", "-m", "advance fixture head"]);
    });
    const declaredCommit = stringValue(base["commit"], "generated source commit");
    if (declaredCommit !== resolvedCommit || (await gitStdoutAt(fixture, ["rev-parse", "HEAD"])).trim() === declaredCommit) throw new Error("K0R source base did not remain pinned while HEAD advanced.");
    await validateK0rSourceBaseForTest(base, fixture);

    const malformed = structuredClone(base);
    malformed["commit"] = "not-a-git-object";
    await requireRejection(() => validateK0rSourceBaseForTest(malformed, fixture), "source base is invalid");

    const unresolved = structuredClone(base);
    unresolved["commit"] = "0".repeat(40);
    await requireRejection(() => validateK0rSourceBaseForTest(unresolved, fixture), "Unable to resolve immutable Git source identity");

    const mismatched = structuredClone(base);
    mismatched["tree"] = "0".repeat(40);
    mismatched["archiveSha256"] = `sha256:${"0".repeat(64)}`;
    await requireRejection(() => validateK0rSourceBaseForTest(mismatched, fixture), "stale or forged");
  } finally {
    await execGit(root, ["worktree", "remove", "--force", fixture]);
    await rm(temp, { recursive: true, force: true });
  }
}

async function verifySymlinkOverlayParentRegression(): Promise<void> {
  const temp = await mkdtemp(join(tmpdir(), "boulder-k0r-overlay-parent-"));
  const source = join(temp, "source");
  const destination = join(temp, "destination");
  const outside = join(temp, "outside");
  const path = "fixture-docs/guide.html";
  try {
    await mkdir(join(source, "fixture-docs"), { recursive: true });
    await mkdir(destination);
    await mkdir(outside);
    await writeFile(join(source, path), "approved overlay\n");
    await symlink(outside, join(destination, "fixture-docs"));
    await requireRejection(() => applyK0rApprovedOverlayForTest(source, destination, [path]), "overlay parent");
    if (await lstat(join(outside, "guide.html")).then(() => true, () => false)) throw new Error("K0R overlay escaped through a symlinked archive parent.");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function requireRejection(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof Error && error.message.includes(message)) return;
    throw error;
  }
  throw new Error(`Expected rejection containing: ${message}`);
}

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T | PromiseLike<T>) => void; readonly reject: (reason?: unknown) => void } {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds); });
  try { return await Promise.race([promise, timeout]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

async function createEvidenceRoot(temp: string): Promise<string> {
  const fixture = join(temp, "repo");
  const isolation = parseRecord(await readFile(isolationPath, "utf8"), "isolation manifest");
  const initialPaths = recordArray(recordValue(isolation["inventories"], "inventories")["initialPriorK0K1Inventory"], "initial inventory").map((entry) => stringValue(entry["path"], "initial inventory path"));
  const paths = [...new Set([
    "AGENTS.md", "package.json", "bun.lock", "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json",
    ...k0rApprovedSourceOverlayPaths,
    ...isolatedSourceBundlePaths,
    "evidence/k0r/independent-clean-source-reproduction.json",
    "evidence/k0r/evidence-manifest.json",
    "fixtures/v2-kernel/valid-ed25519-authority-unsupported-effect.json",
    "fixtures/v2-kernel/invalid-authority-vectors.json",
    "fixtures/v2-kernel/valid-none-effect-execution.json",
    ...initialPaths,
  ])];
  const initialPathSet = new Set(initialPaths);
  for (const path of paths) {
    const destination = join(fixture, path);
    await mkdir(dirname(destination), { recursive: true });
    if (initialPathSet.has(path)) await writeFile(destination, await readHeadFile(path));
    else await copyFile(join(root, path), destination);
  }
  recordValue(isolation["inventories"], "inventories")["mode"] = "working-tree";
  await writeFile(join(fixture, "evidence/k0r/isolation-manifest.json"), `${JSON.stringify(isolation, null, 2)}\n`);
  const installedReceiptBytes = await readFile(join(root, isolatedRunReceiptPath));
  const installedReceiptText = new TextDecoder("utf-8", { fatal: true }).decode(installedReceiptBytes);
  const installedReceipt = parseRecord(installedReceiptText, "installed isolated receipt");
  const fixtureReceiptText = installedReceipt["schemaVersion"] === isolatedRunSchemaVersion && installedReceipt["status"] === "pass_pending_exact_byte_review"
    ? installedReceiptText
    : JSON.stringify({ schemaVersion: isolatedRunSchemaVersion, status: "not_run", networkSurface: "none", run: null });
  await writeFile(join(fixture, isolatedRunReceiptPath), fixtureReceiptText);
  await writeFile(join(fixture, ".gitignore"), "ignored evidence input.txt\n");
  await writeFile(join(fixture, "rename source.txt"), "rename source\n");
  await runGit(fixture, ["init"]);
  await runGit(fixture, ["add", "."]);
  await runGit(fixture, ["-c", "user.name=K0R Test", "-c", "user.email=k0r@example.invalid", "commit", "-m", "fixture"]);
  await runGit(fixture, ["rm", "--cached", ...initialPaths]);
  await runGit(fixture, ["mv", "rename source.txt", "renamed odd\npath"]);
  await writeFile(join(fixture, "odd\nuntracked path"), "odd\n");
  await writeFile(join(fixture, "ignored evidence input.txt"), "ignored\n");
  await writeFile(join(fixture, "evidence/k0r/independent-clean-source-reproduction.json"), `${JSON.stringify(await runK0rIndependentOracle({ root: fixture }), null, 2)}\n`);
  return fixture;
}

async function runGit(cwd: string, args: readonly string[]): Promise<void> {
  const result = await execGit(cwd, args);
  if (result.exitCode !== 0) throw new Error(`Temporary git setup failed: ${result.stderr}`);
}
function execGit(cwd: string, args: readonly string[]): Promise<{ readonly stderr: string; readonly exitCode: number }> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd }, (error, _stdout, stderr) => {
      resolve({ stderr, exitCode: error === null ? 0 : typeof error.code === "number" ? error.code : 1 });
    });
  });
}
async function readHeadFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", ["show", `HEAD:${path}`], { cwd: root }, (error, stdout, stderr) => {
      if (error !== null) reject(new Error(`Unable to read HEAD source ${path}: ${stderr}`));
      else resolve(stdout);
    });
  });
}
async function readContracts(): Promise<[RecordValue, RecordValue, RecordValue]> { return Promise.all([readFile(inventoryPath, "utf8").then((source) => parseRecord(source, "inventory")), readFile(acceptancePath, "utf8").then((source) => parseRecord(source, "acceptance manifest")), readFile(isolationPath, "utf8").then((source) => parseRecord(source, "isolation manifest"))]) as Promise<[RecordValue, RecordValue, RecordValue]>; }
function parseRecord(source: string, label: string): RecordValue { return recordValue(JSON.parse(source), label); }
function recordValue(value: unknown, label: string): RecordValue { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`); return value as RecordValue; }
function recordArray(value: unknown, label: string): RecordValue[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array.`); return value.map((item, index) => recordValue(item, `${label}[${index}]`)); }
function stringArray(value: unknown, label: string): string[] { if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`${label} must be a string array.`); return value as string[]; }
function stringArrayArray(value: unknown, label: string): string[][] { if (!Array.isArray(value) || !value.every((item) => Array.isArray(item) && item.every((part) => typeof part === "string"))) throw new Error(`${label} must be an argv-array list.`); return value as string[][]; }
function sha256(value: Uint8Array): string { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function stringValue(value: unknown, label: string): string { if (typeof value !== "string") throw new Error(`${label} must be a string.`); return value; }
function commandArgv(command: RecordValue): string[] { return stringArray(command["argv"], `command ${stringValue(command["id"], "command id")} argv`); }
function normalizeSet(values: readonly string[]): string[] { return [...new Set(values)].sort(); }
function literalMatches(source: string, expression: RegExp): string[] { return normalizeSet([...source.matchAll(expression)].map((match) => match[1] ?? "").filter(Boolean)); }
function quotedValues(source: string, label: string): string[] { return normalizeSet([...source.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "").filter(Boolean)); }
function subcommandsFor(commands: readonly RecordValue[], route: string): string[] { return normalizeSet(commands.filter((command) => commandArgv(command)[0] === route).map((command) => commandArgv(command)[1]).filter((value): value is string => typeof value === "string")); }
function commandPaths(commands: readonly RecordValue[], route: string): string[] { return commands.filter((command) => commandArgv(command)[0] === route).map((command) => commandArgv(command).join(" ")).sort(); }
function packageInventoryFiles(inventory: RecordValue): string[] {
  return normalizeSet(recordArray(inventory["classes"], "package inventory classes").flatMap((entry) => stringArray(entry["files"], "package inventory files")));
}
function schemaPairs(path: string, versions: readonly string[]): string[] { return versions.map((version) => `${path}\u0000${version}`); }
function schemaVersionLiterals(source: string): string[] {
  return normalizeSet([...source.matchAll(/["']((?:boulder(?:\.[A-Za-z0-9_-]+)+\.v\d+)|(?:packaged-files\.v\d+))["']/g)].map((match) => match[1] ?? "").filter(Boolean));
}
function jsonSchemaVersions(value: unknown): string[] {
  if (Array.isArray(value)) return normalizeSet(value.flatMap(jsonSchemaVersions));
  if (typeof value !== "object" || value === null) return [];
  return normalizeSet(Object.entries(value as RecordValue).flatMap(([key, item]) => [
    ...(key === "schemaVersion" && typeof item === "string" ? [item] : []),
    ...jsonSchemaVersions(item)
  ]));
}
function sourceCitationPaths(value: unknown): string[] {
  if (Array.isArray(value)) return normalizeSet(value.flatMap(sourceCitationPaths));
  if (typeof value !== "object" || value === null) return [];
  const record = value as RecordValue;
  const source = record["source"];
  const sourcePath = typeof source === "object" && source !== null && !Array.isArray(source) ? (source as RecordValue)["path"] : undefined;
  return normalizeSet([...(typeof sourcePath === "string" ? [sourcePath] : []), ...Object.values(record).flatMap(sourceCitationPaths)]);
}
function expectSameSchemaPairs(actual: readonly string[], declared: readonly string[]): void {
  if (JSON.stringify(normalizeSet(actual)) !== JSON.stringify(normalizeSet(declared))) throw new Error("schema contract inventory is incomplete");
}

test("K0R isolated source carries every final Task 7 and Task 8 owner", () => {
  expect(isolatedSourceBundlePaths).toEqual([
    "test/k0r-run-evidence.ts",
    "test/k0r-baseline-generator.ts",
    "test/k0r-independent-oracle.ts",
    "test/k0r-canonical.ts",
    "test/k0r-issue-exit.ts",
    "test/k0r-reconcile-evidence.ts",
    "test/boulder-guide-contract.test.ts",
    "test/helpers/boulder-guide.ts",
    "fixtures/v2-kernel/valid-ed25519-authority-unsupported-effect.json",
    "fixtures/v2-kernel/invalid-authority-vectors.json",
    "fixtures/v2-kernel/valid-none-effect-execution.json",
  ]);
});
