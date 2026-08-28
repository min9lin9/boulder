import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { evaluatePlannerBenchmark } from "../src/planner-benchmark-command";

test("planner benchmark command fails closed when required local evidence is unavailable", async () => {
  const result = await evaluatePlannerBenchmark({ trustRootPath: "/definitely-missing-trust-root.json", studyRootPath: "/definitely-missing-study-root" });
  expect(result.status).toBe("blocked");
  expect(result.report.decision).toBe("HOLD");
  expect(result.issues.map((entry) => entry.code)).toContain("plan.benchmark.provenance_missing");
});

test("accepts the shipped study-root envelope and holds without field-study provenance fabrication", async () => {
  const fixture = (name: string) => decodeURIComponent(new URL(`../fixtures/planner-benchmarks/${name}`, import.meta.url).pathname);
  const result = await evaluatePlannerBenchmark({ trustRootPath: fixture("trust-root.json"), studyRootPath: fixture("study-root.json") });
  expect(result.status).toBe("blocked");
  expect(result.report.decision).toBe("HOLD");
  expect(result.report.reasons).toEqual(["field_study_not_performed"]);
  expect(result.issues.map((entry) => entry.code)).not.toContain("plan.benchmark.provenance_missing");
});
test("rejects performed envelopes that omit deterministic evidence bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "boulder-planner-benchmark-"));
  try {
    const trustRootPath = join(root, "trust-root.json");
    const studyRootPath = join(root, "study-root.json");
    await writeFile(trustRootPath, "{}", "utf8");
    await writeFile(studyRootPath, JSON.stringify({ schemaVersion: "boulder.planner-study-root.v1", protocol: {}, manifest: {}, bundle: {}, report: {}, rawRuns: [] }), "utf8");
    expect((await evaluatePlannerBenchmark({ trustRootPath, studyRootPath })).issues.map((entry) => entry.code)).toContain("plan.benchmark.provenance_missing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("rejects NOT_PERFORMED markers outside the shipped fixture-only envelope contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "boulder-planner-benchmark-"));
  try {
    const trustRootPath = join(root, "trust-root.json");
    const studyRootPath = join(root, "study-root.json");
    await writeFile(trustRootPath, "{}", "utf8");
    await writeFile(studyRootPath, JSON.stringify({
      schemaVersion: "boulder.planner-study-root.v1",
      fixtureOnly: false,
      fixtureNotice: "fixture",
      study: { fieldStudyStatus: "NOT_PERFORMED" },
      evidenceBundle: {}
    }), "utf8");
    const result = await evaluatePlannerBenchmark({ trustRootPath, studyRootPath });
    expect(result.issues.map((entry) => entry.code)).toContain("plan.benchmark.provenance_missing");

    const performed = {
      schemaVersion: "boulder.planner-study-root.v1",
      fixtureOnly: true,
      fixtureNotice: "fixture",
      study: { fieldStudyStatus: "NOT_PERFORMED" },
      protocol: {},
      manifest: {},
      evidenceBundle: {},
      report: {},
      rawRuns: [],
      evidenceFiles: []
    };
    await writeFile(studyRootPath, JSON.stringify(performed), "utf8");
    expect((await evaluatePlannerBenchmark({ trustRootPath, studyRootPath })).issues.map((entry) => entry.code)).toContain("plan.benchmark.provenance_missing");
    const fixturePath = decodeURIComponent(new URL("../fixtures/planner-benchmarks/study-root.json", import.meta.url).pathname);
    const nearFixture = JSON.parse(await readFile(fixturePath, "utf8")) as Record<string, unknown>;
    ((nearFixture.study as Record<string, unknown>).matrix as Record<string, unknown>).requiredRunCount = 35;
    await writeFile(studyRootPath, JSON.stringify(nearFixture), "utf8");
    expect((await evaluatePlannerBenchmark({ trustRootPath, studyRootPath })).issues.map((entry) => entry.code)).toContain("plan.benchmark.provenance_missing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("does not mask unexpected filesystem argument errors", async () => {
  let rejected = false;
  try {
    await evaluatePlannerBenchmark({ trustRootPath: "\0", studyRootPath: "/definitely-missing-study-root" });
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
});

test("passes regular indexed evidence bytes to the domain validator", async () => {
  const root = await mkdtemp(join(tmpdir(), "boulder-planner-benchmark-"));
  try {
    const trustRootPath = join(root, "trust-root.json");
    const studyRootPath = join(root, "study");
    await writeFile(trustRootPath, "{}", "utf8");
    await mkdir(join(studyRootPath, "evidence"), { recursive: true });
    await writeStudyFiles(studyRootPath, [{ path: "evidence/receipt.bin", digest: "sha256:6f32860910ca0fb2a20c7fda143666b09dbf8db5238195c90a586fb542ff0cad", schemaVersion: "v1" }]);
    await writeFile(join(studyRootPath, "evidence", "receipt.bin"), "receipt", "utf8");
    const result = await evaluatePlannerBenchmark({ trustRootPath, studyRootPath });
    expect(result.status).toBe("blocked");
    expect(result.report.decision).toBe("HOLD");
    expect(result.issues.some((entry) => entry.code === "plan.benchmark.digest_mismatch" && entry.path === "artifactIndex.evidence/receipt.bin")).toBe(false);
    const mismatchRootPath = join(root, "mismatch");
    await mkdir(join(mismatchRootPath, "evidence"), { recursive: true });
    await writeStudyFiles(mismatchRootPath, [{ path: "evidence/receipt.bin", digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000", schemaVersion: "v1" }]);
    await writeFile(join(mismatchRootPath, "evidence", "receipt.bin"), "receipt", "utf8");
    const mismatch = await evaluatePlannerBenchmark({ trustRootPath, studyRootPath: mismatchRootPath });
    expect(mismatch.issues.some((entry) => entry.code === "plan.benchmark.digest_mismatch" && entry.path === "artifactIndex.evidence/receipt.bin")).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("rejects traversal, missing, symlinked, and duplicate indexed artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "boulder-planner-benchmark-"));
  try {
    const trustRootPath = join(root, "trust-root.json");
    await writeFile(trustRootPath, "{}", "utf8");
    const digest = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    for (const [name, paths, expectedCode] of [
      ["traversal", ["../outside.bin"], "plan.benchmark.study_path_invalid"],
      ["alias", ["evidence//receipt.bin"], "plan.benchmark.study_path_invalid"],
      ["missing", ["evidence/missing.bin"], "plan.benchmark.provenance_missing"],
      ["duplicate", ["evidence/receipt.bin", "evidence/receipt.bin"], "plan.benchmark.study_path_invalid"],
      ["non-file", ["evidence/receipt.bin"], "plan.benchmark.study_path_invalid"],
      ["symlink", ["evidence/link.bin"], "plan.benchmark.study_path_invalid"]
    ] as const) {
      const studyRootPath = join(root, name);
      await mkdir(studyRootPath);
      await writeStudyFiles(studyRootPath, paths.map((path) => ({ path, digest, schemaVersion: "v1" })));
      if (name === "symlink") {
        await writeFile(join(root, "outside.bin"), "outside", "utf8");
        await mkdir(join(studyRootPath, "evidence"));
        await symlink(join(root, "outside.bin"), join(studyRootPath, "evidence", "link.bin"));
      }
      if (name === "non-file") await mkdir(join(studyRootPath, "evidence", "receipt.bin"), { recursive: true });
      const issues = (await evaluatePlannerBenchmark({ trustRootPath, studyRootPath })).issues;
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe(expectedCode);
      expect(issues[0].path).toBe("study-root");
    }
    const realStudyRoot = join(root, "real-study-root");
    const linkedStudyRoot = join(root, "linked-study-root");
    await mkdir(realStudyRoot);
    await writeStudyFiles(realStudyRoot, []);
    await symlink(realStudyRoot, linkedStudyRoot);
    const linkedRootIssues = (await evaluatePlannerBenchmark({ trustRootPath, studyRootPath: linkedStudyRoot })).issues;
    expect(linkedRootIssues).toHaveLength(1);
    expect(linkedRootIssues[0].code).toBe("plan.benchmark.study_path_invalid");
    const linkedTrustRoot = join(root, "linked-trust-root.json");
    await symlink(trustRootPath, linkedTrustRoot);
    const linkedTrustIssues = (await evaluatePlannerBenchmark({ trustRootPath: linkedTrustRoot, studyRootPath: realStudyRoot })).issues;
    expect(linkedTrustIssues).toHaveLength(1);
    expect(linkedTrustIssues[0].code).toBe("plan.benchmark.study_path_invalid");
    expect(linkedTrustIssues[0].path).toBe("--trust-root");
    const hardLinkedTrustRoot = join(realStudyRoot, "trust-root-alias.json");
    await link(trustRootPath, hardLinkedTrustRoot);
    const hardLinkedTrustIssues = (await evaluatePlannerBenchmark({ trustRootPath, studyRootPath: realStudyRoot })).issues;
    expect(hardLinkedTrustIssues).toHaveLength(1);
    expect(hardLinkedTrustIssues[0].code).toBe("plan.benchmark.study_path_invalid");
    expect(hardLinkedTrustIssues[0].path).toBe("--trust-root");

    const hardLinkedArtifactRoot = join(root, "hard-linked-artifact");
    const outsideArtifact = join(root, "outside-artifact.bin");
    await mkdir(join(hardLinkedArtifactRoot, "evidence"), { recursive: true });
    await writeFile(outsideArtifact, "receipt", "utf8");
    await writeStudyFiles(hardLinkedArtifactRoot, [{ path: "evidence/receipt.bin", digest: "sha256:6f32860910ca0fb2a20c7fda143666b09dbf8db5238195c90a586fb542ff0cad", schemaVersion: "v1" }]);
    await link(outsideArtifact, join(hardLinkedArtifactRoot, "evidence", "receipt.bin"));
    const independentTrustRoot = join(root, "independent-trust-root.json");
    await writeFile(independentTrustRoot, "{}", "utf8");
    const hardLinkedArtifactIssues = (await evaluatePlannerBenchmark({ trustRootPath: independentTrustRoot, studyRootPath: hardLinkedArtifactRoot })).issues;
    expect(hardLinkedArtifactIssues).toHaveLength(1);
    expect(hardLinkedArtifactIssues[0].code).toBe("plan.benchmark.study_path_invalid");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeStudyFiles(root: string, artifactIndex: readonly Record<string, unknown>[]): Promise<void> {
  await Promise.all(["protocol.json", "manifest.json", "report.json"].map((name) => writeFile(join(root, name), "{}", "utf8")));
  await writeFile(join(root, "bundle.json"), JSON.stringify({ artifactIndex }), "utf8");
}
