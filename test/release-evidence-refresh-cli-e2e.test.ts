import { mkdir, readFile, writeFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import releaseManifest from "../docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json" with { type: "json" };
import packageJson from "../package.json" with { type: "json" };
import { RELEASE_EVIDENCE_TARGETS } from "../src/release-evidence";
import { removeTempRepo, runBoulder, runCommand, tempRepo, write } from "./helpers/cli";

describe("release evidence refresh CLI", () => {
  test("reports every renderer target in dry-run JSON", async () => {
    const result = await runBoulder(["release", "evidence", "refresh", "--dry-run", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    expect(refreshTargetPaths(result.stdout).sort()).toEqual([...RELEASE_EVIDENCE_TARGETS].sort());
  });

  test("blocks mismatched bundle without writes", async () => {
    const root = await tempRepo();
    const untouched = "keep this exact file\nTotal files: 146\n";

    try {
      await write(root, "package.json", JSON.stringify({ name: packageJson.name, version: packageJson.version }, null, 2));
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json", "{\"schemaVersion\":2}\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt", untouched);
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", "CI\nCommit: 806330e\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", "old install smoke\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/ci.txt", "old ci\n");
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/release-plan.json", "{}\n");
      await write(root, "docs/PRODUCT_READINESS.md", "- public-release-check: pass - release-check ready for 0.1.15\n");

      const result = await runBoulder(["release", "evidence", "refresh", "--write", "--json", "--cwd", root]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("release.malformed_input");
      expect(await readFile(join(root, "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt"), "utf8")).toBe(untouched);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("write updates approved targets and leaves adjacent files alone", async () => {
    const root = await tempRepo();
    const adjacent = "adjacent evidence\n";

    try {
      await writeRefreshFixture(root, JSON.stringify(releaseManifest, null, 2));
      await write(root, "docs/CASE_STUDIES/evidence/release-workflow/not-a-target.txt", adjacent);
      const packTotal = await currentPackTotal(root);

      const result = await runBoulder(["release", "evidence", "refresh", "--write", "--json", "--cwd", root]);
      const releaseCheck = await runBoulder(["release-check", "--json", "--cwd", root]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      if (releaseCheck.exitCode !== 0) throw new Error(releaseCheck.stdout);
      expect(await readFile(join(root, "docs/CASE_STUDIES/evidence/release-workflow/not-a-target.txt"), "utf8")).toBe(adjacent);
      expect(await readFile(join(root, "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt"), "utf8")).toContain(`Total files: ${packTotal}`);
      expect(await readFile(join(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt"), "utf8")).toContain(`bunx boulder-oss-cli@${packageJson.version} --version`);
      expect(await readFile(join(root, "docs/PRODUCT_READINESS.md"), "utf8")).toContain(`- public-release-check: pass - release-check ready for ${packageJson.version}`);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("blocks refresh when package metadata is malformed", async () => {
    const root = await tempRepo();

    try {
      await writeRefreshFixture(root, JSON.stringify(releaseManifest, null, 2));
      await write(root, "package.json", "{not json}\n");

      const result = await runBoulder(["release", "evidence", "refresh", "--dry-run", "--json", "--cwd", root]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("release.malformed_input");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("blocks refresh when live pack dry-run exits nonzero even if output looks valid", async () => {
    const root = await tempRepo();
    const bin = join(root, "fake-bin");

    try {
      await writeRefreshFixture(root, JSON.stringify(releaseManifest, null, 2));
      await mkdir(bin, { recursive: true });
      await writeFile(join(bin, "bun"), "#!/usr/bin/env bash\nprintf 'Total files: 999\\n'\nexit 1\n", "utf8");
      await runCommand(`chmod 755 ${shellQuote(join(bin, "bun"))}`, root);
      const realBun = (await runCommand("command -v bun", root)).stdout.trim();

      const result = await runCommandWithPath(`${shellQuote(realBun)} ${shellQuote(join(import.meta.dir, "..", "bin", "boulder.ts"))} release evidence refresh --dry-run --json --cwd ${shellQuote(root)}`, root, `${bin}:${process.env.PATH ?? ""}`);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("release.pack_file_count_mismatch");
    } finally {
      await removeTempRepo(root);
    }
  });
});

async function writeRefreshFixture(root: string, manifest: string): Promise<void> {
  await write(root, "package.json", JSON.stringify({
    name: packageJson.name,
    version: packageJson.version,
    license: "MIT",
    repository: { type: "git", url: "git+https://github.com/min9lin9/boulder.git" },
    homepage: "https://github.com/min9lin9/boulder#readme",
    bugs: { url: "https://github.com/min9lin9/boulder/issues" }
  }, null, 2));
  await write(root, "CHANGELOG.md", `# Changelog\n\n## ${packageJson.version}\n\n- Fixture release.\n`);
  await write(root, "docs/RELEASE_WORKFLOW.md", "npm publish\nGitHub Release\ntag\n");
  await write(root, ".github/workflows/ci.yml", "name: CI\non: [push]\njobs:\n  smoke:\n    steps:\n      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: \"1.3.14\"\n");
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json", manifest);
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt", "Package version: 0.1.15\nTotal files: 146\n");
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt", "CI\nCommit: 806330e\n");
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt", "old install smoke\n");
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/ci.txt", "old ci\n");
  await write(root, "docs/CASE_STUDIES/evidence/release-workflow/release-plan.json", "{}\n");
  await write(root, "docs/PRODUCT_READINESS.md", [
    "# Product Readiness",
    "",
    "- public-release-check: pass - release-check ready for 0.1.15",
    "- limitations-explicit: pass - docs/CODEX_OSS_APPLICATION_PACKET.md",
    ""
  ].join("\n"));
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "fixture@example.com"]);
  await git(root, ["config", "user.name", "Fixture"]);
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "fixture"]);
  await git(root, ["tag", `v${packageJson.version}`]);
}

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    exec(`git ${args.map(shellQuote).join(" ")}`, { cwd }, (error) => error ? reject(error) : resolve());
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function refreshTargetPaths(source: string): string[] {
  const payload: unknown = JSON.parse(source);
  if (!isRecord(payload) || !Array.isArray(payload.targets)) return [];
  return payload.targets.flatMap((target) => {
    if (!isRecord(target) || typeof target.path !== "string") return [];
    return [target.path];
  });
}

async function currentPackTotal(root: string): Promise<number> {
  const result = await runCommand("bun pm pack --dry-run --ignore-scripts", root);
  const match = /^Total files:\s*(\d+)$/im.exec(`${result.stdout}\n${result.stderr}`);
  if (!match?.[1]) throw new Error("pack dry-run did not report total files");
  return Number(match[1]);
}

async function runCommandWithPath(command: string, cwd: string, path: string): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  return await new Promise((resolve) => {
    exec(`PATH=${shellQuote(path)} ${command}`, { cwd }, (error, stdout, stderr) => {
      resolve({ exitCode: exitCodeFrom(error), stdout, stderr });
    });
  });
}

function exitCodeFrom(error: Error | null): number {
  if (!error) return 0;
  if ("code" in error && typeof error.code === "number") return error.code;
  return 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
