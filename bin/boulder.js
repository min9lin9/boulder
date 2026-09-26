#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const child = spawn("bun", [join(root, "bin", "boulder.ts"), ...process.argv.slice(2)], { stdio: "inherit" });

// Forward termination signals so killing the shim cannot orphan the bun child.
// POSIX path only: on Windows these events are not emitted and consoles rely on
// console-handler behavior, which is out of scope here.
let childDone = false;
const forwarded = ["SIGINT", "SIGTERM", "SIGHUP"];
const forward = (signal) => {
  if (!childDone) child.kill(signal);
};
for (const signal of forwarded) process.on(signal, forward);
const release = () => {
  for (const signal of forwarded) process.removeListener(signal, forward);
};

let spawnFailed = false;
child.on("error", (error) => {
  spawnFailed = true;
  console.error(`Boulder requires Bun: ${error.message}`);
});

// Wait for the child; never exit first. Listen on "close" rather than "exit":
// on spawn failure (missing bun) Node emits "error" then "close" but never
// "exit", so an "exit" handler leaves spawnFailed unread and the shim would
// terminate normally with status 0. "close" fires in both cases. Mirror signal
// death so the shim's own exit status matches what the child received
// (re-raise kills self once listeners are released, so no orphan survives
// either path).
child.on("close", (code, signal) => {
  childDone = true;
  release();
  if (spawnFailed) process.exit(1);
  if (signal) {
    try { process.kill(process.pid, signal); } catch { /* unsupported signal: fall through */ }
    process.exit(1);
  }
  process.exit(code ?? 1);
});
