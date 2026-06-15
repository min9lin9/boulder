import { describe, expect, test } from "bun:test";
import { defaultManifest } from "../src/manifest";
import { buildPipelinePlan, validatePipelinePlan, type PipelinePlan } from "../src/pipeline";
import { validateManifest } from "../src/validation";

describe("pipeline planning surface", () => {
  test("builds a low friction pipeline plan", () => {
    const plan = buildPipelinePlan("low");
    expect(plan.friction).toBe("low");
    expect(plan.failClosed).toBe(true);
    expect(JSON.stringify(plan.stages.map((item) => item.id))).toBe(JSON.stringify(["classification", "synthesizer"]));
    expect(JSON.stringify(plan.approvalGates)).toBe(JSON.stringify([]));
    expect(plan.forbiddenSideEffects).toContain("credential-access");
    expect(JSON.stringify(validatePipelinePlan(plan))).toBe(JSON.stringify([]));
  });

  test("builds a medium friction pipeline plan", () => {
    const plan = buildPipelinePlan("medium");
    expect(plan.friction).toBe("medium");
    expect(JSON.stringify(plan.stages.map((item) => item.id))).toBe(JSON.stringify(["classification", "deep-interview", "pm-debate", "synthesizer"]));
    expect(JSON.stringify(plan.approvalGates)).toBe(JSON.stringify(["pm-debate"]));
    expect(plan.evidenceRequired).toContain("debate-notes");
    expect(plan.executors.some((item) => item.lane === "plan" && item.preferred === "gajae-code")).toBe(true);
    expect(plan.executors.some((item) => item.lane === "execute" && item.preferred === "lazycodex")).toBe(true);
    expect(JSON.stringify(validatePipelinePlan(plan))).toBe(JSON.stringify([]));
  });

  test("adds command adapter candidates for GJC and LazyCodex handoff", () => {
    const plan = buildPipelinePlan("medium");
    const planning = plan.executors.find((item) => item.lane === "plan");
    const execution = plan.executors.find((item) => item.lane === "execute");

    expect(planning?.adapterCommands.some((item) => item.command === "bunx gajae-code --help")).toBe(true);
    expect(planning?.adapterCommands.some((item) => item.command.includes("gjc-plan.md"))).toBe(true);
    expect(execution?.adapterCommands.some((item) => item.command.includes("lazycodex"))).toBe(true);
    expect(execution?.adapterCommands.some((item) => item.requiresApproval)).toBe(true);
  });

  test("builds a high friction pipeline plan", () => {
    const plan = buildPipelinePlan("high");
    expect(plan.friction).toBe("high");
    expect(JSON.stringify(plan.stages.map((item) => item.id))).toBe(JSON.stringify(["classification", "deep-interview", "pm-debate", "synthesizer", "cso-qa"]));
    expect(plan.stages.find((item) => item.id === "deep-interview")?.depth).toBe("deep");
    expect(JSON.stringify(plan.approvalGates)).toBe(JSON.stringify(["pm-debate", "cso-qa"]));
    expect(plan.evidenceRequired).toContain("security-review");
    expect(JSON.stringify(validatePipelinePlan(plan))).toBe(JSON.stringify([]));
  });

  test("fails closed for forbidden side effects", () => {
    const plan = buildPipelinePlan("high");
    const unsafe: PipelinePlan = {
      ...plan,
      stages: plan.stages.map((item) => item.id === "cso-qa" ? { ...item, allowedSideEffects: ["none", "external-launch"] } : item)
    };
    const issues = validatePipelinePlan(unsafe);
    expect(issues.some((item) => item.id === "pipeline.sideEffect.forbidden" && item.stageId === "cso-qa")).toBe(true);
  });

  test("default manifest routes planning and execution executors by profile", () => {
    const manifest = defaultManifest("fixture");

    expect(manifest.executors.planning.preferred).toBe("gajae-code");
    expect(manifest.executors.planning.mode).toBe("detect-and-suggest");
    expect(manifest.executors.execution.preferred).toBe("lazycodex");
    expect(manifest.executors.execution.mode).toBe("detect-and-suggest");
    expect(manifest.executors.fallback.planning).toBe("codex");
    expect(manifest.executors.fallback.execution).toBe("codex");
    expect(validateManifest(manifest).some((item) => item.path === "executors")).toBe(false);
  });
});
