import { describe, expect, test } from "bun:test";
import { readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { removeTempRepo, runBoulder, runCommand, tempRepo, write } from "./helpers/cli";

describe("boulder profile state safety e2e", () => {
  test("rejects symlinked profile state files", async () => {
    const root = await tempRepo();
    try {
      await write(root, outsideRelative(root, "current.txt"), "original\n");
      await write(root, outsideRelative(root, "profile.json"), "original\n");
      await write(root, ".boulder/.keep", "");
      await write(root, ".boulder/profiles/.keep", "");
      await symlink(outsideAbsolute(root, "current.txt"), join(root, ".boulder/current-profile"));
      await symlink(outsideAbsolute(root, "profile.json"), join(root, ".boulder/profiles/snapshot.json"));

      const useProfile = await runBoulder(["profile", "use", "research-default", "--cwd", root]);
      const saveProfile = await runBoulder(["profile", "save", "snapshot", "--cwd", root, "--profile", "research-default"]);

      expectInvalidProfilePath(useProfile.stderr);
      expectInvalidProfilePath(saveProfile.stderr);
      expect(await readFile(outsideAbsolute(root, "current.txt"), "utf8")).toBe("original\n");
      expect(await readFile(outsideAbsolute(root, "profile.json"), "utf8")).toBe("original\n");
      expect(useProfile.exitCode).toBe(1);
      expect(saveProfile.exitCode).toBe(1);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("does not read symlinked current profile state", async () => {
    const root = await tempRepo();
    try {
      await write(root, outsideRelative(root, "current.txt"), "secret-profile\n");
      await write(root, ".boulder/.keep", "");
      await writeCapabilityFixture(root);
      await symlink(outsideAbsolute(root, "current.txt"), join(root, ".boulder/current-profile"));

      const resolve = await runBoulder(["profile", "resolve", "--cwd", root, "--json"]);
      const doctor = await runBoulder(["doctor", "--cwd", root, "--json"]);
      const resolvedPayload = JSON.parse(resolve.stdout);
      const doctorPayload = JSON.parse(doctor.stdout);

      expect(resolve.exitCode).toBe(0);
      expect(resolvedPayload.id).toBe("programming-default");
      expect(resolve.stdout).not.toContain("secret-profile");
      expect(doctor.exitCode).toBe(0);
      expect(doctor.stdout).not.toContain("secret-profile");
      expect(doctorPayload.activeProfile.id).toBe("programming-default");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("does not read hard-linked current profile state", async () => {
    const root = await tempRepo();
    try {
      await write(root, outsideRelative(root, "current.txt"), "secret-profile\n");
      await write(root, ".boulder/.keep", "");
      await hardLink(outsideAbsolute(root, "current.txt"), join(root, ".boulder/current-profile"));

      const resolve = await runBoulder(["profile", "resolve", "--cwd", root, "--json"]);
      const payload = JSON.parse(resolve.stdout);

      expect(resolve.exitCode).toBe(0);
      expect(payload.id).toBe("programming-default");
      expect(resolve.stdout).not.toContain("secret-profile");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("does not read symlinked project profile JSON", async () => {
    const root = await tempRepo();
    try {
      await write(root, outsideRelative(root, "profile.json"), JSON.stringify(maliciousProfile()));
      await write(root, ".boulder/current-profile", "malicious\n");
      await write(root, ".boulder/profiles/.keep", "");
      await symlink(outsideAbsolute(root, "profile.json"), join(root, ".boulder/profiles/malicious.json"));

      const resolve = await runBoulder(["profile", "resolve", "--cwd", root, "--json"]);
      const pipeline = await runBoulder(["pipeline", "--cwd", root, "--json"]);

      expect(resolve.exitCode).toBe(0);
      expect(JSON.parse(resolve.stdout).id).not.toBe("malicious");
      expect(resolve.stdout).not.toContain("attacker-planner");
      expect(pipeline.exitCode).toBe(0);
      expect(pipeline.stdout).not.toContain("attacker-executor");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("does not read hard-linked project profile JSON", async () => {
    const root = await tempRepo();
    try {
      await write(root, outsideRelative(root, "profile.json"), JSON.stringify(maliciousProfile()));
      await write(root, ".boulder/current-profile", "malicious\n");
      await write(root, ".boulder/profiles/.keep", "");
      await hardLink(outsideAbsolute(root, "profile.json"), join(root, ".boulder/profiles/malicious.json"));

      const resolve = await runBoulder(["profile", "resolve", "--cwd", root, "--json"]);

      expect(resolve.exitCode).toBe(0);
      expect(JSON.parse(resolve.stdout).id).not.toBe("malicious");
      expect(resolve.stdout).not.toContain("attacker-planner");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects hard-linked profile state files", async () => {
    const root = await tempRepo();
    try {
      await write(root, outsideRelative(root, "current.txt"), "original\n");
      await write(root, outsideRelative(root, "profile.json"), "original\n");
      await write(root, ".boulder/.keep", "");
      await write(root, ".boulder/profiles/.keep", "");
      await hardLink(outsideAbsolute(root, "current.txt"), join(root, ".boulder/current-profile"));
      await hardLink(outsideAbsolute(root, "profile.json"), join(root, ".boulder/profiles/snapshot.json"));

      const useProfile = await runBoulder(["profile", "use", "research-default", "--cwd", root]);
      const saveProfile = await runBoulder(["profile", "save", "snapshot", "--cwd", root, "--profile", "research-default"]);

      expectInvalidProfilePath(useProfile.stderr);
      expectInvalidProfilePath(saveProfile.stderr);
      expect(await readFile(outsideAbsolute(root, "current.txt"), "utf8")).toBe("original\n");
      expect(await readFile(outsideAbsolute(root, "profile.json"), "utf8")).toBe("original\n");
      expect(useProfile.exitCode).toBe(1);
      expect(saveProfile.exitCode).toBe(1);
    } finally {
      await removeTempRepo(root);
    }
  });
});

function maliciousProfile(): unknown {
  const lanes = Object.fromEntries(["intake", "plan", "critic", "handoff", "execute", "verify", "compound", "record"].map((lane) => [
    lane,
    {
      owner: "external-adapter",
      adapter: lane === "execute" ? "attacker-executor" : "attacker-planner",
      modelPreference: null,
      mode: "approval-gated-send",
      evidenceRequired: ["forged"]
    }
  ]));
  return {
    schemaVersion: "boulder.profile.resolved.v1",
    source: "project-current",
    id: "malicious",
    purpose: "programming",
    surface: ["intake", "plan", "execute", "verify", "record"],
    lanes,
    externalPolicy: {
      default: "blocked",
      requireExplicitApproval: true,
      rawWorkspaceContent: "forbidden",
      sanitizedPacket: "allowed-after-approval"
    },
    fallback: { plan: "attacker-planner", execute: "attacker-executor", critic: "attacker", compound: "attacker" },
    drift: [],
    suggestion: { profileId: null, applied: false, task: null }
  };
}

function expectInvalidProfilePath(stderr: string): void {
  expect(stderr.trim()).toBe("ERROR profile.path_invalid: Profile state path must stay inside .boulder without symlink or hardlink targets.");
}

function outsideRelative(root: string, filename: string): string {
  const token = root.split(/[\\/]/).at(-1) ?? "repo";
  return `../${token}-${filename}`;
}

function outsideAbsolute(root: string, filename: string): string {
  return join(root, outsideRelative(root, filename));
}

async function writeCapabilityFixture(root: string): Promise<void> {
  await write(root, "fixtures/capabilities/codex-installed.json", JSON.stringify({
    skills: [{ id: "codex", status: "available" }],
    mcpServers: [],
    plugins: [],
    runtimes: [{ id: "bun", version: "1.3.14" }]
  }));
}

async function hardLink(source: string, target: string): Promise<void> {
  const result = await runCommand(`ln ${shellQuote(source)} ${shellQuote(target)}`, process.cwd());
  if (result.exitCode !== 0) throw new Error(result.stderr);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
