import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { removeTempRepo, runCommand, tempRepo } from "./helpers/cli";

type Child = {
  pid: number;
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  signalCode: string | null;
  kill(signal?: string): void;
};
const runtime = Bun as unknown as {
  spawn(args: string[], options: { stdin: "ignore"; stdout: "pipe"; stderr: "pipe"; env?: Record<string, string> }): Child;
  which(name: string): string | null;
};

async function bounded<T>(signal: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([signal, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("shim lifecycle event timed out")), 4000);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

async function childPidsOf(pid: number, cwd: string): Promise<number[]> {
  // pgrep exits 1 on no match; `|| true` keeps runCommand from rejecting.
  const result = await runCommand(`pgrep -P ${pid} || true`, cwd);
  return result.stdout.split(/\s+/).filter(Boolean).map(Number);
}

async function pidGone(pid: number, cwd: string): Promise<boolean> {
  // ps exits 1 when the pid is gone; `|| true` keeps runCommand from rejecting.
  const result = await runCommand(`ps -p ${pid} -o pid= || true`, cwd);
  return result.stdout.trim() === "";
}

// PID liveness has no event to subscribe to: after the shim exits the child is
// already reaped-or-reparented, so a short bounded poll covers the handoff.
async function waitUntilDead(pid: number, cwd: string): Promise<boolean> {
  for (let elapsed = 0; elapsed < 2000; elapsed += 25) {
    if (await pidGone(pid, cwd)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

async function serveShim(root: string): Promise<Child> {
  const proc = runtime.spawn(
    ["node", join(import.meta.dir, "../bin/boulder.js"), "trace", "serve", "--cwd", root, "--host", "127.0.0.1", "--port", "0"],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const stderr = new Response(proc.stderr).text();
  const reader = proc.stdout.getReader();
  const ready = (async () => {
    let output = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`shim closed stdout before the serve URL: ${output}; ${await stderr}`);
      output += new TextDecoder().decode(chunk.value);
      if (/http:\/\/127\.0\.0\.1:\d+/.test(output)) return;
    }
  })();
  await bounded(ready);
  reader.releaseLock();
  return proc;
}

describe("bin/boulder.js shim signal forwarding", () => {
  test("forwards SIGTERM/SIGINT to the bun child so no orphan survives", async () => {
    const root = await tempRepo("boulder-shim-signal-");
    let proc: Child | undefined;
    try {
      for (const signal of ["SIGTERM", "SIGINT"]) {
        proc = await serveShim(root);
        const shimPid = proc.pid;
        const children = await childPidsOf(shimPid, root);
        expect(children).toHaveLength(1);
        const bunPid = children[0];

        // Subscribe to the shim exit before signaling. Without forwarding the
        // shim would die instantly by the signal's default action; a graceful
        // exit proves the signal reached the bun child (serve traps it -> 0).
        const exited = bounded(proc.exited);
        proc.kill(signal);
        expect(await exited).toBe(0);
        expect(proc.signalCode).toBeNull();

        expect(await childPidsOf(shimPid, root)).toEqual([]);
        expect(await waitUntilDead(bunPid, root)).toBe(true);
        proc = undefined;
      }
    } finally {
      if (proc) { proc.kill("SIGKILL"); await bounded(proc.exited); }
      await removeTempRepo(root);
    }
  });

  test("exits nonzero when bun is missing from PATH (spawn ENOENT)", async () => {
    // Resolve node to an absolute path so the stripped child PATH cannot hide it.
    const node = runtime.which("node");
    if (!node) throw new Error("test requires node on PATH");
    const proc = runtime.spawn(
      [node, join(import.meta.dir, "../bin/boulder.js"), "--version"],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: { PATH: "/usr/bin:/bin" } });
    const exited = bounded(proc.exited);
    const stderr = new Response(proc.stderr).text();
    expect(await exited).toBe(1);
    expect(await stderr).toContain("Boulder requires Bun");
  });
});
