import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { scoreProfiles } from "../src/task-scoring";
import { BUILT_IN_WORKFLOW_PROFILE_IDS } from "../src/workflow-profile-builtins";
import { resolveWorkflowProfile, taskClassFor } from "../src/workflow-profiles";
import { removeTempRepo, tempRepo, write, writeCustomExecutorManifest } from "./helpers/cli";

describe("workflow profile resolution", () => {
  test("loads programming-default as the built-in resolved profile", async () => {
    const root = await tempRepo();
    try {
      const resolution = await resolveWorkflowProfile(root, {});

      expect(resolution.profile.schemaVersion).toBe("boulder.profile.resolved.v1");
      expect(resolution.profile.id).toBe("programming-default");
      expect(resolution.profile.source).toBe("built-in");
      expect(resolution.profile.lanes.plan.adapter).toBe("gajae-code");
      expect(resolution.profile.lanes.plan.modelPreference).toBe("kimi-k2.7");
      expect(resolution.profile.lanes.execute.adapter).toBe("lazycodex");
      expect(resolution.profile.lanes.execute.modelPreference).toBe("gpt-5.5-medium");
      expect(resolution.profile.externalPolicy.default).toBe("blocked");
      expect(resolution.profile.externalPolicy.rawWorkspaceContent).toBe("forbidden");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("suggests bootstrap profiles without applying them", async () => {
    const root = await tempRepo();
    try {
      const resolution = await resolveWorkflowProfile(root, { task: "research" });

      expect(resolution.profile.id).toBe("programming-default");
      expect(resolution.profile.suggestion.profileId).toBe("research-corpus");
      expect(resolution.profile.suggestion.applied).toBe(false);
      expect(resolution.profile.drift.some((item) => item.id === "profile.suggestion.not-applied")).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("migrates legacy boulder yaml executors into a resolved profile", async () => {
    const root = await tempRepo();
    try {
      await writeCustomExecutorManifest(root);

      const resolution = await resolveWorkflowProfile(root, {});

      expect(resolution.profile.id).toBe("legacy-boulder-yaml");
      expect(resolution.profile.source).toBe("legacy-manifest");
      expect(resolution.profile.lanes.plan.adapter).toBe("custom-planner");
      expect(resolution.profile.lanes.plan.mode).toBe("local-only");
      expect(resolution.profile.lanes.execute.adapter).toBe("custom-executor");
      expect(resolution.profile.lanes.execute.mode).toBe("approval-gated-send");
      expect(resolution.profile.fallback.execute).toBe("manual");
      expect(resolution.profile.drift.some((item) => item.id === "profile.drift.legacy-executors")).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("reports missing current profile as drift and falls back to built-in", async () => {
    const root = await tempRepo();
    try {
      await write(root, ".boulder/current-profile", "missing-profile\n");

      const resolution = await resolveWorkflowProfile(root, {});

      expect(resolution.profile.id).toBe("programming-default");
      expect(resolution.profile.drift.some((item) => item.id === "profile.drift.current-missing")).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("reports manifest drift when current profile differs from legacy executors", async () => {
    const root = await tempRepo();
    try {
      await writeCustomExecutorManifest(root);
      await write(root, ".boulder/current-profile", "research-default\n");

      const resolution = await resolveWorkflowProfile(root, {});

      expect(resolution.profile.id).toBe("research-default");
      expect(resolution.profile.drift.some((item) => item.id === "profile.drift.manifest-differs")).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("maps task classes to suggestions without changing active profile", () => {
    expect(taskClassFor("research")).toBe("research-corpus");
    expect(taskClassFor("release")).toBe("release-safe");
    expect(taskClassFor("docs")).toBe("docs-reviewer");
    expect(taskClassFor("ops")).toBe("ops-default");
    expect(taskClassFor("programming")).toBe("programming-heavy");
    expect(taskClassFor("research official docs and synthesize citations")).toBe("research-corpus");
  });

  test("keeps resolved profile fixtures for the built-in profiles", async () => {
    const root = join(import.meta.dir, "..");
    const fixtureNames = ["programming-default", "boulder-native-preview", "research-default", "ops-default"];

    for (const fixtureName of fixtureNames) {
      const text = await readFile(join(root, "fixtures", "profiles", "resolved", `${fixtureName}.json`), "utf8");
      const value: unknown = JSON.parse(text);

      expect(hasFixtureShape(value)).toBe(true);
      if (hasFixtureShape(value)) {
        expect(value.id).toBe(fixtureName);
        expect(value.schemaVersion).toBe("boulder.profile.resolved.v1");
        expect(value.externalPolicy.default).toBe("blocked");
        expect(value.externalPolicy.rawWorkspaceContent).toBe("forbidden");
        expect(Object.keys(value.lanes).sort()).toEqual([
          "compound",
          "critic",
          "execute",
          "handoff",
          "intake",
          "plan",
          "record",
          "verify"
        ]);
      }
    }
  });

  test("keeps programming-default golden and resolves boulder-native-preview only when explicit", async () => {
    const root = await tempRepo();
    const fixtureRoot = join(import.meta.dir, "..", "fixtures", "profiles", "resolved");
    try {
      const programmingDefault: unknown = JSON.parse(await readFile(join(fixtureRoot, "programming-default.json"), "utf8"));
      const preview: unknown = JSON.parse(await readFile(join(fixtureRoot, "boulder-native-preview.json"), "utf8"));

      expect((await resolveWorkflowProfile(root, {})).profile).toEqual(programmingDefault);
      expect((await resolveWorkflowProfile(root, { profile: "boulder-native-preview" })).profile).toEqual({
        ...(preview as Record<string, unknown>),
        source: "cli"
      });
    } finally {
      await removeTempRepo(root);
    }
  });

  test("keeps bootstrap profile taxonomy synchronized across docs and skills", async () => {
    const root = join(import.meta.dir, "..");
    const bootstrapProfiles = scoreProfiles(null).map((item) => item.profileId);
    const baseProfiles = ["programming-default", "research-default", "ops-default"];
    const surfaces = [
      await readFile(join(root, "docs", "BOOTSTRAP_INTERVIEW_RESEARCH.md"), "utf8"),
      await readFile(join(root, "docs", "BOOTSTRAP_PROFILE_RESEARCH.md"), "utf8"),
      await readFile(join(root, "skills", "boulder-bootstrap-designer", "SKILL.md"), "utf8"),
      await readFile(join(root, "docs", "BOULDER_CODEX_SKILL_USAGE.ko.md"), "utf8")
    ].join("\n");

    for (const profile of [...bootstrapProfiles, ...baseProfiles]) {
      expect(BUILT_IN_WORKFLOW_PROFILE_IDS).toContain(profile as (typeof BUILT_IN_WORKFLOW_PROFILE_IDS)[number]);
      expect(surfaces).toContain(profile);
    }
    for (const [bootstrap, base] of [
      ["programming-heavy", "programming-default"],
      ["research-corpus", "research-default"],
      ["release-safe", "ops-default"],
      ["issue-triage", "ops-default"],
      ["docs-reviewer", "research-default"]
    ]) {
      expect(surfaces).toContain(`${bootstrap} -> ${base}`);
    }
  });
});

function hasFixtureShape(value: unknown): value is {
  readonly id: string;
  readonly schemaVersion: string;
  readonly externalPolicy: {
    readonly default: string;
    readonly rawWorkspaceContent: string;
  };
  readonly lanes: Record<string, unknown>;
} {
  if (!isRecord(value)) return false;
  if (!("id" in value) || !("schemaVersion" in value) || !("externalPolicy" in value) || !("lanes" in value)) return false;
  const policy = value.externalPolicy;
  return typeof value.id === "string"
    && typeof value.schemaVersion === "string"
    && isRecord(policy)
    && isRecord(value.lanes)
    && "default" in policy
    && "rawWorkspaceContent" in policy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
