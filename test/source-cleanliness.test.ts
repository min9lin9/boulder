import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "..");

describe("source cleanliness", () => {
  test("command modules use shared pretty JSON rendering", async () => {
    const commandFiles = [
      "src/profile-command.ts",
      "src/handoff-command.ts",
      "src/cli.ts"
    ];

    for (const file of commandFiles) {
      const source = await readFile(join(root, file), "utf8");

      expect(source.includes("JSON.stringify")).toBe(false);
    }
  });
});
