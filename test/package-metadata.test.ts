import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

describe("package metadata contract", () => {
  test("npm package links back to the public repository", async () => {
    const raw = await readFile(join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      repository?: { type?: string; url?: string };
      homepage?: string;
    };

    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/min9lin9/boulder.git",
    });
    expect(pkg.homepage).toBe("https://github.com/min9lin9/boulder#readme");
  });

  test("cli VERSION stays in lockstep with package.json version", async () => {
    const [pkgRaw, cliRaw] = await Promise.all([
      readFile(join(repoRoot, "package.json"), "utf8"),
      readFile(join(repoRoot, "src", "cli.ts"), "utf8"),
    ]);
    const pkgVersion = (JSON.parse(pkgRaw) as { version: string }).version;
    const match = /const VERSION = "([^"]+)";/.exec(cliRaw);

    expect(match).not.toBeNull();
    expect(match?.[1]).toBe(pkgVersion);
  });
});
