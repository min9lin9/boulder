import { describe, expect, test } from "bun:test";
import { removeTempRepo, runBoulder, tempRepo, write, writeCustomExecutorManifest } from "./helpers/cli";

describe("boulder profile CLI e2e", () => {
  test("resolves workflow profiles without applying task suggestions", async () => {
    const root = await tempRepo();
    try {
      const jsonResult = await runBoulder(["profile", "resolve", "--cwd", root, "--json"]);
      const humanResult = await runBoulder(["profile", "resolve", "--cwd", root, "--task", "research"]);
      const payload = JSON.parse(jsonResult.stdout);

      expect(jsonResult.exitCode).toBe(0);
      expect(payload.id).toBe("programming-default");
      expect(payload.lanes.plan.adapter).toBe("gajae-code");
      expect(payload.externalPolicy.default).toBe("blocked");
      expect(humanResult.exitCode).toBe(0);
      expect(humanResult.stdout).toContain("active-profile: programming-default");
      expect(humanResult.stdout).toContain("suggested-profile: research-default");
      expect(humanResult.stdout).toContain("suggestion-applied: false");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("lists, shows, and saves workflow profiles", async () => {
    const root = await tempRepo();
    try {
      const list = await runBoulder(["profile", "list", "--cwd", root, "--json"]);
      const show = await runBoulder(["profile", "show", "research-default", "--cwd", root, "--json"]);
      const save = await runBoulder(["profile", "save", "saved-research", "--cwd", root, "--profile", "research-default"]);
      const saveActive = await runBoulder(["profile", "save", "snapshot", "--cwd", root, "--json"]);

      expect(list.exitCode).toBe(0);
      expect(list.stdout).toContain("programming-default");
      expect(list.stdout).toContain("research-default");
      expect(show.exitCode).toBe(0);
      expect(JSON.parse(show.stdout).id).toBe("research-default");
      expect(save.exitCode).toBe(0);
      expect(save.stdout).toContain(".boulder/profiles/saved-research.json");
      expect(saveActive.exitCode).toBe(0);
      expect(JSON.parse(saveActive.stdout).profile).toBe("active");

      const useSaved = await runBoulder(["profile", "use", "saved-research", "--cwd", root]);
      const showSaved = await runBoulder(["profile", "show", "saved-research", "--cwd", root, "--json"]);

      expect(useSaved.exitCode).toBe(0);
      expect(useSaved.stdout).toContain("saved-research");
      expect(showSaved.exitCode).toBe(0);
      expect(JSON.parse(showSaved.stdout).id).toBe("saved-research");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("saves active profile snapshots without transient drift metadata", async () => {
    const root = await tempRepo();
    try {
      await writeCustomExecutorManifest(root);
      await runBoulder(["profile", "use", "research-default", "--cwd", root]);
      const resolved = await runBoulder(["profile", "resolve", "--cwd", root, "--json"]);
      const saveActive = await runBoulder(["profile", "save", "research-snapshot", "--cwd", root, "--json"]);
      const showSaved = await runBoulder(["profile", "show", "research-snapshot", "--cwd", root, "--json"]);
      const resolvedPayload = JSON.parse(resolved.stdout);
      const savedPayload = JSON.parse(showSaved.stdout);

      expect(resolved.exitCode).toBe(0);
      expect(resolvedPayload.drift.some((item: { id: string }) => item.id === "profile.drift.manifest-differs")).toBe(true);
      expect(saveActive.exitCode).toBe(0);
      expect(savedPayload.id).toBe("research-snapshot");
      expect(savedPayload.drift).toEqual([]);
      expect(savedPayload.suggestion).toEqual({ profileId: null, applied: false, task: null });
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects missing explicit workflow profile", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["profile", "resolve", "--cwd", root, "--profile", "missing", "--json"]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe('ERROR profile.not_found: Profile "missing" was not found.');
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects profile save path traversal", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["profile", "save", "../../../escape", "--cwd", root, "--profile", "research-default"]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("ERROR profile.invalid_name: Profile name must contain only letters, numbers, dots, underscores, or hyphens.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects profile use path traversal as an invalid profile name", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["profile", "use", "../../../escape", "--cwd", root]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("ERROR profile.invalid_name: Profile name must contain only letters, numbers, dots, underscores, or hyphens.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects saved profile names that collide with built-ins", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["profile", "save", "research-default", "--cwd", root, "--profile", "ops-default"]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("ERROR profile.invalid_name: Built-in profile names are reserved.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects malformed project profiles without stack traces", async () => {
    const root = await tempRepo();
    try {
      await write(root, ".boulder/profiles/bad.json", JSON.stringify({
        schemaVersion: "boulder.profile.resolved.v1",
        id: "bad",
        lanes: {},
        externalPolicy: {},
        fallback: {},
        suggestion: {},
        drift: []
      }));
      const use = await runBoulder(["profile", "use", "bad", "--cwd", root]);
      const pipeline = await runBoulder(["pipeline", "--cwd", root, "--json"]);

      expect(use.exitCode).toBe(1);
      expect(use.stderr.trim()).toBe('ERROR profile.not_found: Profile "bad" was not found.');
      expect(pipeline.exitCode).toBe(0);
      expect(JSON.parse(pipeline.stdout).activeProfile?.id).not.toBe("bad");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects project profiles with invalid lane and purpose literals", async () => {
    const root = await tempRepo();
    try {
      const badLane = {
        owner: "not-a-real-owner",
        adapter: "../../escape",
        modelPreference: null,
        mode: "raw-send",
        evidenceRequired: [123]
      };
      await write(root, ".boulder/current-profile", "bad\n");
      await write(root, ".boulder/profiles/bad.json", JSON.stringify({
        schemaVersion: "boulder.profile.resolved.v1",
        source: "project-current",
        id: "bad",
        purpose: "not-real",
        surface: ["plan"],
        lanes: {
          intake: badLane,
          plan: badLane,
          critic: badLane,
          handoff: badLane,
          execute: badLane,
          verify: badLane,
          compound: badLane,
          record: badLane
        },
        externalPolicy: {
          default: "blocked",
          requireExplicitApproval: true,
          rawWorkspaceContent: "forbidden",
          sanitizedPacket: "allowed-after-approval"
        },
        fallback: { plan: "codex", execute: "manual", critic: "codex", compound: "codex" },
        drift: [],
        suggestion: { profileId: null, applied: false, task: null }
      }));
      const result = await runBoulder(["profile", "resolve", "--cwd", root, "--json"]);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.id).not.toBe("bad");
      expect(payload.drift.some((item: { id: string }) => item.id === "profile.drift.current-missing")).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });


  test("uses active research profile for quickstart and pipeline routing", async () => {
    const root = await tempRepo();
    try {
      await runBoulder(["init", "--cwd", root]);
      const useProfile = await runBoulder(["profile", "use", "research-default", "--cwd", root]);
      const quickstart = await runBoulder(["quickstart", "--cwd", root, "--json"]);
      const pipeline = await runBoulder(["pipeline", "--cwd", root, "--friction", "medium", "--json"]);
      const quickstartPayload = JSON.parse(quickstart.stdout);
      const pipelinePayload = JSON.parse(pipeline.stdout);

      expect(useProfile.exitCode).toBe(0);
      expect(quickstart.exitCode).toBe(0);
      expect(quickstartPayload.status).toBe("ready");
      expect(quickstartPayload.checks.some((item: { id: string; evidence: string }) => item.id === "active-profile" && item.evidence.includes("research-default"))).toBe(true);
      expect(pipeline.exitCode).toBe(0);
      expect(pipelinePayload.activeProfile.id).toBe("research-default");
      expect(pipelinePayload.executors.some((item: { lane: string; preferred: string; mode: string }) => item.lane === "execute" && item.preferred === "codex" && item.mode === "local-only")).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });
});
