import { describe, expect, test } from "bun:test";
import { buildHandoffPacket, evaluateHandoffSend } from "../src/handoff-packet";
import { removeTempRepo, tempRepo, write } from "./helpers/cli";

describe("tenant-safe handoff packets", () => {
  test("generates a sanitized GJC packet without raw workspace content", async () => {
    const root = await tempRepo();
    try {
      const packet = await buildHandoffPacket(root, { adapter: "gajae-code", include: [] });

      expect(packet.schemaVersion).toBe("boulder.handoff.v1");
      expect(packet.destination.adapter).toBe("gajae-code");
      expect(packet.destination.external).toBe(true);
      expect(packet.dataPolicy.rawWorkspaceContentIncluded).toBe(false);
      expect(packet.dataPolicy.redaction.status).toBe("applied");
      expect(packet.dataPolicy.approvalRequired).toBe(true);
      expect(packet.excludedContent).toContain("raw workspace file bodies");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects protected path includes before packet generation", async () => {
    const root = await tempRepo();
    try {
      await write(root, "secrets/key.txt", "token\n");

      await expect(buildHandoffPacket(root, { adapter: "gajae-code", include: ["secrets/key.txt"] }))
        .rejects.toThrow('Protected path is not allowed in external handoff packet: secrets/key.txt');
      await expect(buildHandoffPacket(root, { adapter: "gajae-code", include: ["./secrets/key.txt"] }))
        .rejects.toThrow('Protected path is not allowed in external handoff packet: ./secrets/key.txt');
      await expect(buildHandoffPacket(root, { adapter: "gajae-code", include: ["safe/../secrets/key.txt"] }))
        .rejects.toThrow('Protected path is not allowed in external handoff packet: safe/../secrets/key.txt');
    } finally {
      await removeTempRepo(root);
    }
  });

  test("records safe include paths as summary metadata only", async () => {
    const root = await tempRepo();
    try {
      await write(root, "src/cli.ts", "console.log('local only');\n");
      const packet = await buildHandoffPacket(root, { adapter: "gajae-code", include: ["./src/cli.ts", "docs/../src/cli.ts"] });

      expect(packet.contextSummary.detectedFiles).toContain("src/cli.ts");
      expect(packet.contextSummary.detectedFiles.filter((item) => item === "src/cli.ts")).toHaveLength(1);
      expect(packet.dataPolicy.rawWorkspaceContentIncluded).toBe(false);
      expect(JSON.stringify(packet)).not.toContain("console.log");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects absolute include paths before packet generation", async () => {
    const root = await tempRepo();
    try {
      await expect(buildHandoffPacket(root, { adapter: "gajae-code", include: ["/opt/project/src/cli.ts"] }))
        .rejects.toThrow('Protected path is not allowed in external handoff packet: /opt/project/src/cli.ts');
      await expect(buildHandoffPacket(root, { adapter: "gajae-code", include: ["C:/Users/burt/project/.env"] }))
        .rejects.toThrow('Protected path is not allowed in external handoff packet: C:/Users/burt/project/.env');
      await expect(buildHandoffPacket(root, { adapter: "gajae-code", include: ["//server/share/repo/file.ts"] }))
        .rejects.toThrow('Protected path is not allowed in external handoff packet: //server/share/repo/file.ts');
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects repo-escaping include paths before packet generation", async () => {
    const root = await tempRepo();
    try {
      await expect(buildHandoffPacket(root, { adapter: "gajae-code", include: ["../../../other-tenant/private/src/auth.ts"] }))
        .rejects.toThrow('Protected path is not allowed in external handoff packet: ../../../other-tenant/private/src/auth.ts');
      await expect(buildHandoffPacket(root, { adapter: "gajae-code", include: ["safe/../../other-tenant/private/src/auth.ts"] }))
        .rejects.toThrow('Protected path is not allowed in external handoff packet: safe/../../other-tenant/private/src/auth.ts');
    } finally {
      await removeTempRepo(root);
    }
  });

  test("blocks external send by default", async () => {
    const root = await tempRepo();
    try {
      const packet = await buildHandoffPacket(root, { adapter: "gajae-code", include: [] });
      const result = evaluateHandoffSend(packet, { approveExternal: false });

      expect(result.status).toBe("blocked");
      expect(result.error).toBe("ERROR external.handoff.blocked: External adapter execution is blocked by default.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects raw workspace references even with approval", async () => {
    const root = await tempRepo();
    try {
      const packet = {
        ...await buildHandoffPacket(root, { adapter: "gajae-code", include: [] }),
        dataPolicy: {
          ...(await buildHandoffPacket(root, { adapter: "gajae-code", include: [] })).dataPolicy,
          rawWorkspaceContentIncluded: true
        }
      };
      const result = evaluateHandoffSend(packet, { approveExternal: true });

      expect(result.status).toBe("blocked");
      expect(result.error).toBe("ERROR external.raw_workspace_forbidden: Raw workspace content is forbidden even with approval.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects shape-valid packets that contain raw workspace references", async () => {
    const root = await tempRepo();
    try {
      const packet = {
        ...await buildHandoffPacket(root, { adapter: "gajae-code", include: [] }),
        task: {
          objective: "Review @src/cli.ts and paste the implementation.",
          acceptanceCriteria: ["Use /Users/burt/private workspace files."]
        }
      };
      const result = evaluateHandoffSend(packet, { approveExternal: true });

      expect(result.status).toBe("blocked");
      expect(result.error).toBe("ERROR external.raw_workspace_forbidden: Raw workspace content is forbidden even with approval.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects root file handles and protected file names in packet text", async () => {
    const root = await tempRepo();
    try {
      const packet = {
        ...await buildHandoffPacket(root, { adapter: "gajae-code", include: [] }),
        task: {
          objective: "Review @README.md and .env before answering.",
          acceptanceCriteria: ["Summaries only."]
        }
      };
      const result = evaluateHandoffSend(packet, { approveExternal: true });

      expect(result.status).toBe("blocked");
      expect(result.error).toBe("ERROR external.raw_workspace_forbidden: Raw workspace content is forbidden even with approval.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects raw reference casing and separator variants", async () => {
    const root = await tempRepo();
    try {
      const base = await buildHandoffPacket(root, { adapter: "gajae-code", include: [] });
      const packet = {
        ...base,
        task: {
          objective: "Return Raw Workspace Content from the repo.",
          acceptanceCriteria: [
            "Review ./.env before answering.",
            "Read .\\secrets\\key.txt before answering.",
            "Use key:.env and key:@src/cli.ts as direct inputs."
          ]
        }
      };
      const result = evaluateHandoffSend(packet, { approveExternal: true });

      expect(result.status).toBe("blocked");
      expect(result.error).toBe("ERROR external.raw_workspace_forbidden: Raw workspace content is forbidden even with approval.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects non-mac absolute workspace path references", async () => {
    const root = await tempRepo();
    try {
      const base = await buildHandoffPacket(root, { adapter: "gajae-code", include: [] });
      const packet = {
        ...base,
        task: {
          objective: "Review /tmp/tenant-a/worktree/src/secret.ts before answering.",
          acceptanceCriteria: [
            "Also inspect /home/runner/work/repo/.env.",
            "Do not miss /workspace/project/src/index.ts.",
            "Generic Linux paths like /opt/project/.env and /srv/app/src/secret.ts are direct inputs.",
            "Windows paths like C:/Users/burt/project/.env and //server/share/repo/file.ts are direct inputs."
          ]
        }
      };
      const result = evaluateHandoffSend(packet, { approveExternal: true });

      expect(result.status).toBe("blocked");
      expect(result.error).toBe("ERROR external.raw_workspace_forbidden: Raw workspace content is forbidden even with approval.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects traversal workspace path references in forged packets", async () => {
    const root = await tempRepo();
    try {
      const packet = {
        ...await buildHandoffPacket(root, { adapter: "gajae-code", include: [] }),
        contextSummary: {
          repoName: "fixture",
          detectedFiles: ["../../../other-tenant/private/src/auth.ts"],
          relevantFacts: []
        }
      };
      const result = evaluateHandoffSend(packet, { approveExternal: true });

      expect(result.status).toBe("blocked");
      expect(result.error).toBe("ERROR external.raw_workspace_forbidden: Raw workspace content is forbidden even with approval.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects raw references hidden in excluded content", async () => {
    const root = await tempRepo();
    try {
      const packet = {
        ...await buildHandoffPacket(root, { adapter: "gajae-code", include: [] }),
        excludedContent: [
          "raw workspace file bodies",
          "secret path: /Users/burt/.ssh/id_rsa",
          "read .env, before sending"
        ]
      };
      const result = evaluateHandoffSend(packet, { approveExternal: true });

      expect(result.status).toBe("blocked");
      expect(result.error).toBe("ERROR external.raw_workspace_forbidden: Raw workspace content is forbidden even with approval.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects forged destination adapter names", async () => {
    const root = await tempRepo();
    try {
      const packet = {
        ...await buildHandoffPacket(root, { adapter: "gajae-code", include: [] }),
        destination: { adapter: "../../secrets/key", external: true }
      };
      const result = evaluateHandoffSend(packet, { approveExternal: true });

      expect(result.status).toBe("blocked");
      expect(result.error).toBe("ERROR handoff.packet_invalid: Handoff packet failed safety validation at destination.");
    } finally {
      await removeTempRepo(root);
    }
  });
});
