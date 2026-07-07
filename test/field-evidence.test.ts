import { mkdir, readFile, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { evaluateFieldEvidence, recordFieldEvidence } from "../src/field-evidence";
import { tempRepo, write } from "./helpers/cli";

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
  test("passes a complete field-readiness run and writes a manifest", async () => {
    const root = await tempRepo("boulder-field-evidence-");
    const evidencePath = await writeCompleteFieldRun(root);

    const result = await recordFieldEvidence(root, "oss-run-1", evidencePath);
    const ids = result.checks.map((item) => item.id);

    expect(result.status).toBe("pass");
    expect(result.manifestPath).toBe("evidence/field-readiness/oss-run-1/manifest.json");
    expect(result.checks.every((item) => item.status === "pass")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("fails when the maintainer decision outcome is unsupported", async () => {
    const root = await tempRepo("boulder-field-evidence-");
    const evidencePath = await writeCompleteFieldRun(root);
    await write(root, `${evidencePath}/decision-log.json`, "{\"outcome\":\"ship-it-anyway\"}\n");

    const result = await evaluateFieldEvidence(root, "oss-run-1", evidencePath);

    expect(result.status).toBe("fail");
    expect(result.checks.some((item) => item.id === "decision-log" && item.status === "fail")).toBe(true);
  });

  test("fails when JSON evidence is malformed", async () => {
    const root = await tempRepo("boulder-field-evidence-");
    const evidencePath = await writeCompleteFieldRun(root);
    await write(root, `${evidencePath}/first-readiness.json`, "not json\n");

    const result = await evaluateFieldEvidence(root, "oss-run-1", evidencePath);

    expect(result.status).toBe("fail");
    expect(result.checks.some((item) => item.id === "first-readiness" && item.status === "fail")).toBe(true);
  });

  test("fails closed for evidence paths outside field-readiness", async () => {
    const root = await tempRepo("boulder-field-evidence-");

    const result = await evaluateFieldEvidence(root, "oss-run-1", "../outside");

    expect(result.status).toBe("fail");
    expect(result.manifestPath).toBe("evidence/field-readiness/oss-run-1/manifest.json");
    expect(result.checks.some((item) => item.id === "evidence-path" && item.status === "fail")).toBe(true);
  });

  test("does not overwrite a valid manifest when evidence path is unsafe", async () => {
    const root = await tempRepo("boulder-field-evidence-");
    await write(root, "evidence/field-readiness/oss-run-1/manifest.json", "{\"status\":\"pass\"}\n");

    const result = await recordFieldEvidence(root, "oss-run-1", "../outside");

    expect(result.status).toBe("fail");
    expect(await readFile(join(root, "evidence/field-readiness/oss-run-1/manifest.json"), "utf8")).toBe("{\"status\":\"pass\"}\n");
  });

  test("does not write a manifest when run id is unsafe", async () => {
    const root = await tempRepo("boulder-field-evidence-");

    const result = await recordFieldEvidence(root, "../escape", "../escape");

    expect(result.status).toBe("fail");
    expect(await fileExists(join(root, "evidence/escape/manifest.json"))).toBe(false);
  });

  test("does not write through a symlinked field evidence directory", async () => {
    const root = await tempRepo("boulder-field-evidence-");
    const external = await tempRepo("boulder-field-evidence-");
    await mkdir(join(root, "evidence/field-readiness"), { recursive: true });
    await symlink(external, join(root, "evidence/field-readiness/oss-run-1"));

    const result = await recordFieldEvidence(root, "oss-run-1", "evidence/field-readiness/oss-run-1");

    expect(result.status).toBe("fail");
    expect(result.checks.some((item) => item.id === "evidence-path" && item.status === "fail")).toBe(true);
    expect(await fileExists(join(external, "manifest.json"))).toBe(false);
  });

  test("does not write through a symlinked field-readiness parent directory", async () => {
    const root = await tempRepo("boulder-field-evidence-");
    const external = await tempRepo("boulder-field-evidence-");
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
