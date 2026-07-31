import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

async function filesUnder(path: string): Promise<string[]> {
  const entries = await readdir(path);
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(path, entry);
    return (await stat(entryPath)).isDirectory() ? filesUnder(entryPath) : [entryPath];
  }));
  return files.flat();
}

describe("v2 source boundary", () => {
  test("keeps the v2 kernel self-contained rather than importing v1 or unrelated domain modules", async () => {
    const sourceRoot = join(import.meta.dir, "../src/v2");
    const files = (await filesUnder(sourceRoot)).filter((path) => path.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const path of files) {
      const source = await readFile(path, "utf8");
      const specifiers = [...source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g)].map((match) => match[1]);
      expect(specifiers.some((specifier) => specifier.startsWith("../") || specifier.includes("/v1/") || specifier.includes("v1-"))).toBe(false);
      for (const specifier of specifiers) {
        if (specifier.startsWith(".")) expect(specifier.startsWith("./")).toBe(true);
      }
    }
  });
});
