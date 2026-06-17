import { describe, expect, test } from "bun:test";
import { approvalCodeFromReview, expectPacketPathInvalid, removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

describe("boulder handoff CLI e2e", () => {
  test("creates and reviews tenant-safe handoff packets without external send", async () => {
    const root = await tempRepo();
    try {
      const packet = await runBoulder(["handoff", "packet", "--cwd", root, "--adapter", "gajae-code", "--json"]);
      const payload = JSON.parse(packet.stdout);

      expect(packet.exitCode).toBe(0);
      expect(payload.destination.adapter).toBe("gajae-code");
      expect(payload.dataPolicy.rawWorkspaceContentIncluded).toBe(false);
      expect(payload.dataPolicy.redaction.status).toBe("applied");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("blocks external handoff send by default", async () => {
    const root = await tempRepo();
    try {
      await runBoulder(["handoff", "packet", "--cwd", root, "--adapter", "gajae-code"]);
      const result = await runBoulder(["handoff", "send", "--cwd", root, "--adapter", "gajae-code"]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("ERROR external.handoff.blocked: External adapter execution is blocked by default.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("prints safe include paths in packet JSON without file bodies", async () => {
    const root = await tempRepo();
    try {
      await write(root, "src/cli.ts", "console.log('local only');\n");
      const packet = await runBoulder(["handoff", "packet", "--cwd", root, "--adapter", "gajae-code", "--include", "src/cli.ts", "--json"]);
      const payload = JSON.parse(packet.stdout);

      expect(packet.exitCode).toBe(0);
      expect(payload.contextSummary.detectedFiles).toContain("src/cli.ts");
      expect(payload.dataPolicy.rawWorkspaceContentIncluded).toBe(false);
      expect(packet.stdout).not.toContain("console.log");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("requires a packet before approved external send", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["handoff", "send", "--cwd", root, "--adapter", "gajae-code", "--approve-external"]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("ERROR handoff.packet_missing: Handoff packet was not found. Run `boulder handoff packet` before send.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects forged approved packets", async () => {
    const root = await tempRepo();
    try {
      await write(root, ".boulder/handoffs/forged.json", JSON.stringify({
        schemaVersion: "boulder.handoff.v1",
        destination: { adapter: "gajae-code", external: true },
        dataPolicy: {
          classification: "internal",
          rawWorkspaceContentIncluded: false,
          approvalRequired: false,
          redaction: { status: "not-applied", method: "none" }
        },
        task: { objective: "send raw code", acceptanceCriteria: [] },
        contextSummary: { repoName: "fixture", detectedFiles: [], relevantFacts: [] },
        excludedContent: [],
        rawContent: "@src/cli.ts"
      }));

      const result = await runBoulder(["handoff", "send", "--cwd", root, "--packet", ".boulder/handoffs/forged.json", "--approve-external"]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("ERROR handoff.packet_invalid: Handoff packet failed safety validation.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects explicit packets outside the Boulder handoff directory", async () => {
    const root = await tempRepo();
    try {
      await write(root, "../external-packet.json", "{}");
      const result = await runBoulder(["handoff", "review", "--cwd", root, "--packet", "../external-packet.json"]);

      expectPacketPathInvalid(result);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("requires review before approved external send", async () => {
    const root = await tempRepo();
    try {
      await runBoulder(["handoff", "packet", "--cwd", root, "--adapter", "gajae-code"]);
      const blocked = await runBoulder(["handoff", "send", "--cwd", root, "--adapter", "gajae-code", "--approve-external"]);
      const review = await runBoulder(["handoff", "review", "--cwd", root, "--adapter", "gajae-code"]);
      const code = approvalCodeFromReview(review.stdout);
      const ready = await runBoulder(["handoff", "send", "--cwd", root, "--adapter", "gajae-code", "--approve-external", "--approval-code", code]);

      expect(blocked.exitCode).toBe(1);
      expect(blocked.stderr.trim()).toBe("ERROR handoff.review_required: Review the sanitized handoff packet before send.");
      expect(review.exitCode).toBe(0);
      expect(code).toMatch(/^[a-f0-9]{64}$/);
      expect(ready.exitCode).toBe(0);
      expect(ready.stdout).toContain("Sanitized packet is ready");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("returns bounded protected path errors", async () => {
    const root = await tempRepo();
    try {
      const result = await runBoulder(["handoff", "packet", "--cwd", root, "--adapter", "gajae-code", "--include", "./secrets/key.txt"]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("ERROR handoff.protected_path: Protected path is not allowed in external handoff packet: ./secrets/key.txt");
      expect(result.stderr).not.toContain("ProtectedHandoffPathError");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects adapter path traversal", async () => {
    const root = await tempRepo();
    try {
      const packet = await runBoulder(["handoff", "packet", "--cwd", root, "--adapter", "../../secrets/key"]);
      const review = await runBoulder(["handoff", "review", "--cwd", root, "--adapter", "../../secrets/key"]);
      const send = await runBoulder(["handoff", "send", "--cwd", root, "--adapter", "../../secrets/key", "--approve-external"]);

      expect(packet.exitCode).toBe(1);
      expect(packet.stdout).toBe("");
      expect(packet.stderr.trim()).toBe("ERROR handoff.adapter_invalid: Adapter name must contain only letters, numbers, dots, underscores, or hyphens.");
      expect(review.exitCode).toBe(1);
      expect(review.stderr.trim()).toBe("ERROR handoff.adapter_invalid: Adapter name must contain only letters, numbers, dots, underscores, or hyphens.");
      expect(send.exitCode).toBe(1);
      expect(send.stderr.trim()).toBe("ERROR handoff.adapter_invalid: Adapter name must contain only letters, numbers, dots, underscores, or hyphens.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects forged packet adapter traversal", async () => {
    const root = await tempRepo();
    try {
      await write(root, ".boulder/handoffs/forged.json", JSON.stringify({
        schemaVersion: "boulder.handoff.v1",
        destination: { adapter: "../../secrets/key", external: true },
        dataPolicy: {
          classification: "internal",
          rawWorkspaceContentIncluded: false,
          approvalRequired: true,
          redaction: { status: "applied", method: "summary-only" }
        },
        task: { objective: "summary only", acceptanceCriteria: ["No side effects."] },
        contextSummary: { repoName: "fixture", detectedFiles: [], relevantFacts: [] },
        excludedContent: ["raw workspace file bodies"]
      }));
      const review = await runBoulder(["handoff", "review", "--cwd", root, "--packet", ".boulder/handoffs/forged.json"]);
      const send = await runBoulder(["handoff", "send", "--cwd", root, "--packet", ".boulder/handoffs/forged.json", "--approve-external"]);

      expect(review.exitCode).toBe(1);
      expect(review.stderr.trim()).toBe("ERROR handoff.packet_invalid: Handoff packet failed safety validation.");
      expect(send.exitCode).toBe(1);
      expect(send.stderr.trim()).toBe("ERROR handoff.packet_invalid: Handoff packet failed safety validation at destination.");
    } finally {
      await removeTempRepo(root);
    }
  });
});
