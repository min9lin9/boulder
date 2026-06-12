#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const result = spawnSync("bun", [join(root, "bin", "boulder.ts"), ...process.argv.slice(2)], { stdio: "inherit" });

if (result.error) {
  console.error(`Boulder requires Bun: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
