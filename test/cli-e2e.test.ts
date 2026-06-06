import { exec } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

type CliResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

async function tempRepo(): Promise<string> {
  return mkdtemp(join(tmpdir(), "boulder-cli-e2e-"));
}

async function removeTempRepo(root: string): Promise<void> {
  await rm(root, { force: true, recursive: true });
}

async function runBoulder(args: readonly string[]): Promise<CliResult> {
  const root = join(import.meta.dir, "..");
  return new Promise((resolve, reject) => {
    exec(`bun bin/boulder.ts ${args.map(shellQuote).join(" ")}`, { cwd: root }, (error, stdout, stderr) => {
      if (error && !stdout && !stderr) {
        reject(error);
        return;
      }
      resolve({ exitCode: exitCodeFrom(error), stdout, stderr });
    });
  });
}

function exitCodeFrom(error: Error | null): number {
  if (!error) return 0;
  if ("code" in error && typeof error.code === "number") return error.code;
  return 1;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

describe("boulder CLI e2e cleanup safety", () => {
  test("preserves full init-to-export happy path", async () => {
    // Given
    const root = await tempRepo();

    try {
      // When
      const init = await runBoulder(["init", "--cwd", root]);
      const validate = await runBoulder(["validate", "--cwd", root]);
      const scorecard = await runBoulder(["scorecard", "--cwd", root, "--json"]);
      const exported = await runBoulder(["export", "--cwd", root, "--force"]);

      // Then
      expect(init.exitCode).toBe(0);
      expect(validate.exitCode).toBe(0);
      expect(scorecard.exitCode).toBe(0);
      expect(exported.exitCode).toBe(0);
      expect(init.stdout).toContain("Boulder initialized\n- created: boulder.yaml");
      expect(init.stdout).toContain("- created: docs/REPO_BRIEF.md");
      expect(scorecard.stdout).toContain('"rating": "ready"');
      expect(exported.stdout).toContain(
        "Boulder export complete\n- created: docs/BOULDER_EXPORT.md\n- created: docs/CODEX_WORKFLOW_NOTES.md"
      );
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects unsafe provider policy through validate command", async () => {
    // Given
    const root = await tempRepo();
    try {
      await runBoulder(["init", "--cwd", root]);
      await writeFile(
        join(root, "boulder.yaml"),
        [
          "name: fixture",
          "description: invalid provider policy",
          "maintainers:",
          "  - min9lin9",
          "workflows:",
          "  - issue-triage",
          "protectedPaths:",
          "  - .env*",
          "verification:",
          "  - name: smoke",
          "    command: echo ok",
          "    required: true",
          "providers:",
          "  default: codex",
          "  externalAllowed: true",
          "  approvalRequired: false",
          "export:",
          "  markdown: true",
          "  codexNotes: true",
          ""
        ].join("\n"),
        "utf8"
      );

      // When
      const result = await runBoulder(["validate", "--cwd", root]);

      // Then
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("External providers require approval gating.");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("preserves root release-plan and initialized export surface", async () => {
    // Given
    const root = join(import.meta.dir, "..");
    const target = await tempRepo();
    try {
      await runBoulder(["init", "--cwd", target]);

      // When
      const releasePlan = await runBoulder(["release-plan", "--cwd", root, "--json"]);
      const exported = await runBoulder(["export", "--cwd", target, "--force"]);

      // Then
      expect(releasePlan.exitCode).toBe(0);
      expect(exported.exitCode).toBe(0);
      expect(releasePlan.stdout).toContain('"status": "ready"');
      expect(exported.stdout).toContain("Boulder export complete");
    } finally {
      await removeTempRepo(target);
    }
  });
});
