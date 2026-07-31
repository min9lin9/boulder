import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { approvalReceiptPath, captureK0rEvidence } from "./k0r-capture-evidence.js";
import { runK0rIndependentOracle } from "./k0r-independent-oracle.js";
import { assertK0rAllowedArgv, isolatedRunCommandArgv, isolatedRunReceiptPath, isolatedRunSchemaVersion, readK0rIsolationArgvAllowlist, validateK0rIsolatedRunReceipt, verifyK0rSandboxEnforcement, writeK0rIsolatedRunReceipt } from "./k0r-run-evidence.js";

const root = join(import.meta.dir, "..");
const inventoryPath = join(root, "evidence/k0r/v1-public-contract-inventory.json");
const acceptancePath = join(root, "evidence/k0r/acceptance-manifest.json");
const approvalReceiptFile = join(root, approvalReceiptPath);
const isolationPath = join(root, "evidence/k0r/isolation-manifest.json");
const releaseManifestPath = join(root, "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json");
const requiredCategories = ["commands", "outputContracts", "exitAndStderrPolicy", "statePaths", "profileAndDefaultPrecedence", "packageAndRuntime", "inventoryReferences", "ownershipAndOracle", "evidenceBindings"];
const oracleReportKeys = ["schemaVersion", "reproductionMode", "status", "oracleSourceSha256", "artifacts", "reproduced", "derivedPublicKey", "generationSetDigest", "vectorIds", "seedMaterial", "failures"];
const oracleArtifactIds = ["baseline", "mutations", "none"];

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
    expect(commands.find((command) => command["id"] === "evidence-generator")?.["command"]).toBe("bun test/k0r-capture-evidence.ts --approval-receipt evidence/k0r/approval-provenance.json");
    const observed = recordValue(recordValue(isolation["commands"], "commands")["observedResultSchema"], "observed command result schema");
    expect(observed["argv"]).toBe("string[]");
    expect(observed["cwd"]).toBe(".");
    expect(observed["stdoutSha256"]).toBe("sha256:<64-lowercase-hex>");
    expect(observed["stderrSha256"]).toBe("sha256:<64-lowercase-hex>");
    const source = await readFile(join(root, "test/k0r-capture-evidence.ts"), "utf8");
    expect(source).toContain("node:child_process");
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
    const [, , isolation] = await readContracts();
    expect(stringArray(recordValue(isolation["pathPolicy"], "path policy")["allowedK0RPaths"], "allowed K0R paths")).toEqual([
      approvalReceiptPath, "evidence/k0r/superseding-adr.md", "evidence/k0r/acceptance-manifest.json", "evidence/k0r/evidence-manifest.json", "evidence/k0r/independent-clean-source-reproduction.json", "evidence/k0r/isolation-manifest.json", isolatedRunReceiptPath, "evidence/k0r/v1-public-contract-inventory.json", "test/k0r-capture-evidence.ts", "test/k0r-globals.d.ts", "test/k0r-evidence-contract.test.ts", "test/k0r-independent-oracle.test.ts", "test/k0r-independent-oracle.ts", "test/k0r-run-evidence.ts"
    ]);
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
      await expect(captureK0rEvidence({
        root: ignored,
        approvalReceipt: approvalReceiptPath,
        testHooks: { beforePostInventory: async () => { await writeFile(join(ignored, "ignored evidence input.txt"), "changed ignored\n"); } }
      })).rejects.toThrow("Capture introduced undeclared mutations: ignored evidence input.txt");
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
      await expect(captureK0rEvidence({
        root: failure,
        approvalReceipt: approvalReceiptPath,
        testHooks: { rename: async () => { throw new Error("injected rename failure"); } }
      })).rejects.toThrow("injected rename failure");
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
        expect(sha256(await readFile(join(root, path)))).toBe(derivedInventory.get(path));
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
  test("requires a generated, exact-schema receipt and declares its exact argv-array checks", async () => {
    const bytes = await readFile(join(root, isolatedRunReceiptPath));
    const receipt = await validateK0rIsolatedRunReceipt(bytes, root);
    expect(["not_run", "pass", "fail"]).toContain(receipt.status);
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
      expect(gitMetadata["packageVersion"]).toBe("0.1.16");
      expect(gitMetadata["tag"]).toBe(releaseManifest["tag"]);
      expect(gitMetadata["tagCommit"]).toBe(releaseManifest["tagCommit"]);
      expect(gitMetadata["commit"]).toMatch(/^[0-9a-f]{40}$/);
      expect(gitMetadata["tree"]).toMatch(/^[0-9a-f]{40}$/);
      const historicalTagBundle = recordValue(gitMetadata["historicalTagBundle"], "historical tag bundle");
      expect(historicalTagBundle["path"]).toMatch(/\/boulder-k0r-isolated-[^/]+\/tmp\/release-v0\.1\.16\.bundle$/);
      expect(historicalTagBundle["sha256"]).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(historicalTagBundle["sourceTagCommit"]).toBe(releaseManifest["tagCommit"]);
      expect(historicalTagBundle["removed"]).toBe(true);
      expect(recordArray(historicalTagBundle["commands"], "historical tag bundle commands").map((command) => command["argv"])).toEqual([
        ["git", "rev-parse", "--verify", "refs/tags/v0.1.16^{}"],
        ["git", "bundle", "create", historicalTagBundle["path"], "refs/tags/v0.1.16"],
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
        ["git", "fetch", "--no-tags", "/tmp/release-v0.1.16.bundle", "refs/tags/v0.1.16:refs/tags/v0.1.16"],
        ["git", "rev-parse", "HEAD"],
        ["git", "rev-parse", "--verify", "refs/tags/v0.1.16^{}"]
      ]);
      const forged = JSON.parse(new TextDecoder().decode(bytes)) as RecordValue;
      recordValue(recordValue(forged["run"], "forged receipt run")["dependencyBinding"], "forged dependency binding")["bunLock"] = { path: "bun.lock", sha256: "sha256:0000000000000000000000000000000000000000000000000000000000000000" };
      await expect(validateK0rIsolatedRunReceipt(new TextEncoder().encode(JSON.stringify(forged)), root)).rejects.toThrow("dependency binding is stale");
      const forgedBase = JSON.parse(new TextDecoder().decode(bytes)) as RecordValue;
      recordValue(recordValue(recordValue(forgedBase["run"], "forged receipt run")["sourceBundle"], "forged source bundle")["derivation"], "forged source derivation")["base"] = { archiveSha256: "sha256:0000000000000000000000000000000000000000000000000000000000000000", commit: "0000000000000000000000000000000000000000", tree: "0000000000000000000000000000000000000000" };
      await expect(validateK0rIsolatedRunReceipt(new TextEncoder().encode(JSON.stringify(forgedBase)), root)).rejects.toThrow("source derivation");

      const forgedOverlay = JSON.parse(new TextDecoder().decode(bytes)) as RecordValue;
      const overlayFiles = recordArray(recordValue(recordValue(recordValue(recordValue(forgedOverlay["run"], "forged receipt run")["sourceBundle"], "forged source bundle")["derivation"], "forged source derivation")["overlay"], "forged source overlay")["files"], "forged source overlay files");
      overlayFiles[0]!["path"] = "src/planner-benchmark.ts";
      await expect(validateK0rIsolatedRunReceipt(new TextEncoder().encode(JSON.stringify(forgedOverlay)), root)).rejects.toThrow("source overlay");
      const forgedGeneratedInventories = JSON.parse(new TextDecoder().decode(bytes)) as RecordValue;
      const generatedInventories = recordValue(recordValue(recordValue(recordValue(forgedGeneratedInventories["run"], "forged receipt run")["sourceBundle"], "forged source bundle")["derivation"], "forged source derivation")["overlay"], "forged source overlay")["generatedInventories"] as RecordValue;
      const generatedEntries = recordArray(generatedInventories["entries"], "forged generated inventory entries");
      expect(generatedEntries.map((entry) => entry["path"])).toEqual(["fixtures/package-inventory/packaged-files.v0.json", "fixtures/docs/doc-registry.v0.json", "test/fixtures/baselines/readiness-v0/pack-dry-run.txt", "test/package-inventory-contract.test.ts", "evidence/k0r/evidence-manifest.json"]);
      const excludedPaths = stringArray(generatedEntries[0]?.["excludedPaths"], "forged package exclusions");
      expect(excludedPaths.some((path) => path.startsWith("src/planner-"))).toBe(true);
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
    const acceptance = parseRecord(await readFile(acceptancePath, "utf8"), "acceptance manifest");
    const artifact = recordArray(acceptance["requiredArtifacts"], "required artifacts").find((entry) => entry["id"] === "isolated-run-receipt");
    expect(artifact).toEqual({
      id: "isolated-run-receipt",
      path: isolatedRunReceiptPath,
      schema: isolatedRunSchemaVersion,
      role: "generated measured isolated-run provenance; structurally not_run until an execution is captured"
    });
    const command = recordArray(acceptance["requiredCommands"], "required commands").find((entry) => entry["id"] === "isolated-run-evidence");
    expect(command?.["argv"]).toEqual(isolatedRunCommandArgv);
    expect(command?.["runtimeProbeArgv"]).toEqual([["bun", "--version"], ["git", "--version"]]);
    expect(command?.["oracleArgv"]).toEqual(["bun", "test/k0r-run-evidence.ts", "--isolated-oracle"]);
    expect(command?.["repositoryChecks"]).toEqual([
      { id: "focused-k0r-tests", argv: ["bun", "test", "test/k0r-evidence-contract.test.ts", "test/k0r-independent-oracle.test.ts"] },
      { id: "typecheck", argv: ["bunx", "tsc", "--noEmit"] },
      { id: "ci", argv: ["bun", "run", "ci"] },
      { id: "root-agents-diff", argv: ["git", "diff", "--exit-code", "--", "AGENTS.md"] }
    ]);
    const source = await readFile(join(root, "test/k0r-run-evidence.ts"), "utf8");
    const [, , isolation] = await readContracts();
    expect(source).toContain("execFile");
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

      await expect(writeK0rIsolatedRunReceipt(fixture, destination, "unsafe temp\n", {
        beforeRename: async (temporary) => {
          await rm(temporary);
          await symlink(outside, temporary);
        }
      })).rejects.toThrow("single-link regular file");
      await expect(writeK0rIsolatedRunReceipt(fixture, destination, "unsafe temp\n", {
        beforeRename: async (temporary) => {
          await rm(temporary);
          await link(outside, temporary);
        }
      })).rejects.toThrow("single-link regular file");
      await expect(writeK0rIsolatedRunReceipt(fixture, destination, "rename failure\n", {
        rename: async () => { throw new Error("injected rename failure"); }
      })).rejects.toThrow("injected rename failure");
      expect(await residue()).toEqual([]);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
  test("enforces bwrap isolation probes and rejects argv drift before process spawn", async () => {
    const [, , isolation] = await readContracts();
    const bwrap = recordValue(recordValue(isolation["isolation"], "isolation")["bwrap"], "bwrap policy");
    expect(bwrap["runtime"]).toBe("bwrap");
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
    expect(hasArgv(["git", "rev-parse", "--verify", "refs/tags/v0.1.16^{}"])).toBe(true);
    expect(hasArgv(["git", "bundle", "create", "${K0R_TEMP_ROOT}/tmp/release-v0.1.16.bundle", "refs/tags/v0.1.16"])).toBe(true);
    expect(hasArgv(["git", "bundle", "list-heads", "${K0R_TEMP_ROOT}/tmp/release-v0.1.16.bundle"])).toBe(true);
    expect(hasArgv(["git", "fetch", "--no-tags", "/tmp/release-v0.1.16.bundle", "refs/tags/v0.1.16:refs/tags/v0.1.16"])).toBe(true);
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

async function createEvidenceRoot(temp: string): Promise<string> {
  const fixture = join(temp, "repo");
  const isolation = parseRecord(await readFile(isolationPath, "utf8"), "isolation manifest");
  const initialPaths = recordArray(recordValue(isolation["inventories"], "inventories")["initialPriorK0K1Inventory"], "initial inventory").map((entry) => stringValue(entry["path"], "initial inventory path"));
  const paths = [...new Set([
    "AGENTS.md", "package.json", "bun.lock", "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json", approvalReceiptPath, "evidence/k0r/superseding-adr.md", "evidence/k0r/acceptance-manifest.json", "evidence/k0r/isolation-manifest.json", "evidence/k0r/isolated-run-receipt.json", "evidence/k0r/v1-public-contract-inventory.json", "evidence/k0r/independent-clean-source-reproduction.json", "evidence/k0r/evidence-manifest.json", "test/k0r-capture-evidence.ts", "test/k0r-evidence-contract.test.ts", "test/k0r-globals.d.ts", "test/k0r-independent-oracle.test.ts", "test/k0r-independent-oracle.ts", "test/k0r-run-evidence.ts", "fixtures/v2-kernel/valid-ed25519-authority-unsupported-effect.json", "fixtures/v2-kernel/invalid-authority-vectors.json", "fixtures/v2-kernel/valid-none-effect-execution.json", ...initialPaths
  ])];
  for (const path of paths) {
    const destination = join(fixture, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(root, path), destination);
  }
  await writeFile(join(fixture, isolatedRunReceiptPath), JSON.stringify({ schemaVersion: isolatedRunSchemaVersion, status: "not_run", networkSurface: "none", run: null }));
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
