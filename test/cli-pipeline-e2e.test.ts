import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { removeTempRepo, runBoulder, tempRepo, writeCustomExecutorManifest } from "./helpers/cli";

describe("boulder pipeline CLI e2e", () => {
  test("renders high friction pipeline human output", async () => {
    const result = await runBoulder(["pipeline", "--friction", "high"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Boulder pipeline plan\n- friction: high");
    expect(result.stdout).toContain("stage: cso-qa");
    expect(result.stdout).toContain("executor: plan=gajae-code");
    expect(result.stdout).toContain("fail-closed: true");
  });

  test("renders high friction pipeline json output", async () => {
    const result = await runBoulder(["pipeline", "--friction", "high", "--json"]);
    const payload = JSON.parse(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload.friction).toBe("high");
    expect(payload.failClosed).toBe(true);
    expect(JSON.stringify(payload.stages.map((item: { id: string }) => item.id))).toBe(JSON.stringify(["classification", "deep-interview", "pm-debate", "synthesizer", "cso-qa"]));
    expect(payload.forbiddenSideEffects).toContain("credential-access");
    expect(payload.forbiddenSideEffects).toContain("package-install");
    expect(payload.forbiddenSideEffects).toContain("external-launch");
    expect(payload.forbiddenSideEffects).toContain("provider-call");
    expect(payload.approvalGates).toContain("cso-qa");
    expect(payload.executors.some((item: { lane: string; preferred: string; mode: string }) => item.lane === "plan" && item.preferred === "gajae-code" && item.mode === "detect-and-suggest")).toBe(true);
    expect(payload.executors.some((item: { lane: string; preferred: string; fallback: string }) => item.lane === "execute" && item.preferred === "lazycodex" && item.fallback === "codex")).toBe(true);
  });

  test("renders pipeline executor routes from the manifest", async () => {
    const root = await tempRepo();
    try {
      await writeCustomExecutorManifest(root);

      const result = await runBoulder(["pipeline", "--cwd", root, "--friction", "medium", "--json"]);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.executors.some((item: { lane: string; preferred: string }) => item.lane === "plan" && item.preferred === "custom-planner")).toBe(true);
      expect(payload.executors.some((item: { lane: string; preferred: string; fallback: string }) => item.lane === "execute" && item.preferred === "custom-executor" && item.fallback === "manual")).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("exports pipeline executor routes from the manifest", async () => {
    const root = await tempRepo();
    try {
      await writeCustomExecutorManifest(root);

      const result = await runBoulder(["export", "--cwd", root, "--force"]);
      const exported = await readFile(join(root, "docs", "BOULDER_EXPORT.md"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(exported).toContain("executor: plan=custom-planner");
      expect(exported).toContain("executor: execute=custom-executor");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects invalid pipeline friction", async () => {
    const result = await runBoulder(["pipeline", "--friction", "impossible"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe('ERROR pipeline.friction.invalid: Unsupported friction level "impossible". Expected one of: low, medium, high.');
  });
});
