import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { diffEvidence, evaluateFieldEvidence, inspectEvidence, recordFieldEvidence } from "../src/field-evidence";

async function tempRepo(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "boulder-field-evidence-"));
}

async function write(root: string, path: string, content: string): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function writeCompleteFieldRun(root: string, runId = "oss-run-1"): Promise<string> {
  const base = `evidence/field-readiness/${runId}`;
  await write(root, `${base}/activation-transcript.txt`, "boulder inspect\nboulder service-readiness\n");
  await write(root, `${base}/first-readiness.json`, "{\"status\":\"pilot-ready\"}\n");
  await write(root, `${base}/second-readiness-delta.json`, "{\"changedRecommendations\":[\"add public evidence link\"]}\n");
  await write(root, `${base}/share-safe-artifact-url.txt`, "https://github.com/min9lin9/boulder/pull/1\n");
  await write(root, `${base}/decision-log.json`, "{\"outcome\":\"request-changes\"}\n");
  await write(root, `${base}/official-docs-refresh.json`, "{\"officialDocsFirst\":true,\"docsUrls\":[\"https://github.com/min9lin9/boulder#readme\"]}\n");
  await write(root, `${base}/generated-metrics.json`, "{\"generatedFromEvidence\":true,\"metrics\":[\"time-to-first-readiness-delta\",\"readiness delta count\",\"public evidence link count\"]}\n");
  return base;
}

describe("field evidence", () => {
  test("inspects release package and docs evidence states", async () => {
    const root = await tempRepo();
    await write(root, "package.json", "{\"version\":\"0.1.16\"}\n");
    await write(root, "fixtures/package-inventory/packaged-files.v0.json", "{\"schemaVersion\":\"packaged-files.v0\",\"classes\":[]}\n");
    await write(root, "fixtures/docs/doc-registry.v0.json", "[]\n");

    const result = await inspectEvidence(root);

    expect(result.schemaVersion).toBe("boulder.evidence.inspect.v1");
    expect(result.evidence.some((item) => item.id === "release.release-workflow-doc" && item.area === "release")).toBe(true);
    expect(result.evidence.some((item) => item.id === "package.inventory" && item.area === "package" && item.state === "pass")).toBe(true);
    expect(result.evidence.some((item) => item.id === "docs.registry" && item.area === "docs" && item.state === "pass")).toBe(true);
  });

  test("diff reports changed evidence ids between roots", async () => {
    const from = await tempRepo();
    const to = await tempRepo();
    await write(from, "package.json", "{\"version\":\"0.1.16\"}\n");
    await write(to, "package.json", "{\"version\":\"0.1.16\"}\n");
    await write(from, "fixtures/package-inventory/packaged-files.v0.json", "{\"schemaVersion\":\"packaged-files.v0\",\"classes\":[]}\n");
    await write(to, "fixtures/package-inventory/packaged-files.v0.json", "not json\n");
    await write(from, "fixtures/docs/doc-registry.v0.json", "[]\n");
    await write(to, "fixtures/docs/doc-registry.v0.json", "[]\n");

    const result = await diffEvidence(from, to);

    expect(result.status).toBe("ready");
    expect(result.changedEvidenceIds).toContain("package.inventory");
  });

  test("diff fails with evidence input recovery code when a path is missing", async () => {
    const root = await tempRepo();

    const result = await diffEvidence(join(root, "missing-from"), join(root, "missing-to"));

    expect(result.status).toBe("blocked");
    expect(result.recoveryCode).toBe("evidence.input_missing");
    expect(result.issues.every((item) => item.code === "evidence.input_missing")).toBe(true);
  });

  test("passes a complete field-readiness run and writes a manifest", async () => {
    const root = await tempRepo();
    const evidencePath = await writeCompleteFieldRun(root);

    const result = await recordFieldEvidence(root, "oss-run-1", evidencePath);
    const ids = result.checks.map((item) => item.id);

    expect(result.status).toBe("pass");
    expect(result.manifestPath).toBe("evidence/field-readiness/oss-run-1/manifest.json");
    expect(result.checks.every((item) => item.status === "pass")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("fails when the maintainer decision outcome is unsupported", async () => {
    const root = await tempRepo();
    const evidencePath = await writeCompleteFieldRun(root);
    await write(root, `${evidencePath}/decision-log.json`, "{\"outcome\":\"ship-it-anyway\"}\n");

    const result = await evaluateFieldEvidence(root, "oss-run-1", evidencePath);

    expect(result.status).toBe("fail");
    expect(result.checks.some((item) => item.id === "decision-log" && item.status === "fail")).toBe(true);
  });

  test("fails when JSON evidence is malformed", async () => {
    const root = await tempRepo();
    const evidencePath = await writeCompleteFieldRun(root);
    await write(root, `${evidencePath}/first-readiness.json`, "not json\n");

    const result = await evaluateFieldEvidence(root, "oss-run-1", evidencePath);

    expect(result.status).toBe("fail");
    expect(result.checks.some((item) => item.id === "first-readiness" && item.status === "fail")).toBe(true);
  });

  test("fails closed for evidence paths outside field-readiness", async () => {
    const root = await tempRepo();

    const result = await evaluateFieldEvidence(root, "oss-run-1", "../outside");

    expect(result.status).toBe("fail");
    expect(result.manifestPath).toBe("evidence/field-readiness/oss-run-1/manifest.json");
    expect(result.checks.some((item) => item.id === "evidence-path" && item.status === "fail")).toBe(true);
  });

  test("does not overwrite a valid manifest when evidence path is unsafe", async () => {
    const root = await tempRepo();
    await write(root, "evidence/field-readiness/oss-run-1/manifest.json", "{\"status\":\"pass\"}\n");

    const result = await recordFieldEvidence(root, "oss-run-1", "../outside");

    expect(result.status).toBe("fail");
    expect(await readFile(join(root, "evidence/field-readiness/oss-run-1/manifest.json"), "utf8")).toBe("{\"status\":\"pass\"}\n");
  });

  test("does not write a manifest when run id is unsafe", async () => {
    const root = await tempRepo();

    const result = await recordFieldEvidence(root, "../escape", "../escape");

    expect(result.status).toBe("fail");
    expect(await fileExists(join(root, "evidence/escape/manifest.json"))).toBe(false);
  });

  test("does not write through a symlinked field evidence directory", async () => {
    const root = await tempRepo();
    const external = await tempRepo();
    await mkdir(join(root, "evidence/field-readiness"), { recursive: true });
    await symlink(external, join(root, "evidence/field-readiness/oss-run-1"));

    const result = await recordFieldEvidence(root, "oss-run-1", "evidence/field-readiness/oss-run-1");

    expect(result.status).toBe("fail");
    expect(result.checks.some((item) => item.id === "evidence-path" && item.status === "fail")).toBe(true);
    expect(await fileExists(join(external, "manifest.json"))).toBe(false);
  });

  test("does not write through a symlinked field-readiness parent directory", async () => {
    const root = await tempRepo();
    const external = await tempRepo();
    await mkdir(join(root, "evidence"), { recursive: true });
    await mkdir(join(external, "oss-run-1"), { recursive: true });
    await symlink(external, join(root, "evidence/field-readiness"));
    await writeCompleteFieldRun(external, "oss-run-1");

    const result = await recordFieldEvidence(root, "oss-run-1", "evidence/field-readiness/oss-run-1");

    expect(result.status).toBe("fail");
    expect(result.checks.some((item) => item.id === "evidence-path" && item.status === "fail")).toBe(true);
    expect(await fileExists(join(external, "oss-run-1/manifest.json"))).toBe(false);
  });
});

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
