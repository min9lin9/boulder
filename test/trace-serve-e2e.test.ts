import { describe, expect, test } from "bun:test";
// @ts-expect-error -- bun:sqlite types are not vendored in this repo.
import { Database } from "bun:sqlite";
import { copyFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BindingsResponse, SessionResponse, SessionsResponse } from "../packages/trace-ui/src/api";
import { isViewEntry } from "../src/trace/contracts";
import { loadHead } from "../src/trace/journal";
import { removeTempRepo, runBoulder, runCommand, tempRepo } from "./helpers/cli";

type Child = { stdout: ReadableStream<Uint8Array>; stderr: ReadableStream<Uint8Array>; exited: Promise<number>; kill(signal: string): void };
const runtime = Bun as unknown as { spawn(args: string[], options: { stdout: "pipe"; stderr: "pipe" }): Child };
type Sqlite = { query(sql: string): { get(...args: unknown[]): unknown; run(...args: unknown[]): void }; close(): void };
const session = "sess-plain-001";
const hostileText = '<img src=x onerror="window.__traceInjected=true">';

async function bounded<T>(signal: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([signal, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("CLI lifecycle event timed out")), 4000);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

function update(path: string, seq: number, change: (event: Record<string, unknown>) => void) {
  const db = new Database(path) as Sqlite;
  try {
    const row = db.query("SELECT event_json FROM transcript_events WHERE session_id = ? AND seq = ?").get(session, seq) as { event_json: string };
    const event = JSON.parse(row.event_json);
    change(event);
    const json = JSON.stringify(event);
    db.query("UPDATE transcript_events SET event_json = ?, event_utf8_bytes = ? WHERE session_id = ? AND seq = ?")
      .run(json, new TextEncoder().encode(json).byteLength, session, seq);
  } finally { db.close(); }
}

describe("trace collect -> trace serve CLI", () => {
  test("serves installed UI and real projections, pins revisions, rejects attacks, and exits on SIGINT", async () => {
    const root = await tempRepo("boulder-trace-serve-");
    let child: Child | undefined;
    try {
      const path = join(root, "source.sqlite");
      await copyFile(join(import.meta.dir, "../fixtures/trace/openclaw/30afbaf8-claim/case-01-plain.sqlite"), path);
      update(path, 3, (event) => { event.tool = hostileText; });
      const db = new Database(path) as Sqlite;
      try {
        const orphan = JSON.stringify({ type: "tool_result", requestId: "absent", ok: true, output: "not exported" });
        db.query("INSERT INTO transcript_events VALUES (?, 6, ?, NULL, ?)").run(session, orphan, new TextEncoder().encode(orphan).byteLength);
      } finally { db.close(); }
      const collect = () => runBoulder(["trace", "collect", "--cwd", root, "--db-path", path, "--session", session, "--once", "--write", "--json"]);
      const first = await collect();
      expect(first.exitCode).toBe(1); // A durable quarantined observation is NOT successful collection.
      expect(first.stderr).toContain("trace.quarantined");
      expect(JSON.parse(first.stdout).disposition_counts).toEqual({ normalized: 5, ignored: 0, quarantined: 1 });

      child = runtime.spawn(["bun", join(import.meta.dir, "../bin/boulder.ts"), "trace", "serve", "--cwd", root, "--host", "127.0.0.1", "--port", "0"],
        { stdout: "pipe", stderr: "pipe" });
      const stderr = new Response(child.stderr).text();
      const reader = child.stdout.getReader();
      // Readiness is emitted after listen AND signal handlers are installed.
      // Subscribe to stdout, not a fixed sleep or timing-dependent port poll.
      const ready = (async () => {
        let output = "";
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) throw new Error(`Serve exited before its URL: ${output}; ${await stderr}`);
          output += new TextDecoder().decode(chunk.value);
          const url = /http:\/\/127\.0\.0\.1:\d+/.exec(output)?.[0];
          if (url) return url;
        }
      })();
      const url = await bounded(ready);
      reader.releaseLock();
      const get = (route: string, init?: RequestInit) => fetch(`${url}${route}`, { ...init, signal: AbortSignal.timeout(4000) });
      const htmlResponse = await get("/");
      expect(htmlResponse.status).toBe(200);
      expect(htmlResponse.headers.get("content-security-policy")).toContain("script-src 'self'");
      const html = await htmlResponse.text();
      expect(html).toBe(await readFile(join(import.meta.dir, "../packages/trace-ui/dist/index.html"), "utf8"));
      const assets = [...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)].map((match) => match[1]);
      expect(assets.length).toBeGreaterThan(0);
      for (const asset of assets) expect((await fetch(new URL(asset, `${url}/`))).status).toBe(200);
      const catalog: SessionsResponse = await (await get("/api/sessions")).json();
      const head = (await loadHead(root))!;
      expect(catalog.head_revision).toEqual({ sequence: head.sequence, digest: head.digest });
      expect(Object.keys(catalog.sessions[0]).sort()).toEqual(["agent_id", "coverage", "disposition_counts", "id", "session_id", "snapshot_digest", "snapshot_id", "source_instance_id"]);
      expect(catalog.sessions[0].id).toBe(JSON.parse(first.stdout).snapshot_id);
      const pin = `head_revision=${head.sequence}:${head.digest}`;
      const detailPath = `/api/sessions/${catalog.sessions[0].snapshot_id}?${pin}`;
      const detail: SessionResponse = await (await get(detailPath)).json();
      expect(detail.entries.every(isViewEntry)).toBe(true);
      expect(detail.entries).toHaveLength(5);
      expect(detail.entries.find((entry) => entry.name === hostileText)?.kind).toBe("tool");
      expect(detail.hierarchy.length).toBeGreaterThan(0);
      expect(detail.unresolved).toHaveLength(1);
      expect(detail.unresolved[0].reason).toBe("dangling_tool_result");
      expect(detail.unresolved[0].entry).toBe(undefined);
      expect(detail.usage.coverage).toBe("observed_snapshot");
      expect(detail.usage.entries[0].usage).toEqual({ promptTokens: 120, completionTokens: 40, cacheReadTokens: 12 });
      expect(detail.usage.entries[0].basis).toBe("source_reported");
      expect(detail.usage.entries[0].scope).toBe("unknown");
      expect(detail.usage.entries[0].additive).toBe(false);
      const bindingResponse: BindingsResponse = await (await get(`/api/bindings?${pin}&bindings_revision=${catalog.bindings_revision}`)).json();
      expect(bindingResponse).toEqual({ head_revision: catalog.head_revision, bindings_revision: catalog.bindings_revision, bindings: [] });

      update(path, 5, (event) => { (event.usage as Record<string, number>).promptTokens = 321; });
      const second = await collect();
      expect(second.exitCode).toBe(1);
      expect(JSON.parse(second.stdout).segment_seq).toBe(2);
      const latest: SessionsResponse = await (await get("/api/sessions")).json();
      expect(latest.head_revision?.sequence).toBe(2);
      expect(latest.head_revision?.digest).not.toBe(head.digest);
      expect(await (await get(detailPath)).json()).toEqual(detail);
      const updated: SessionResponse = await (await get(`/api/sessions/${latest.sessions[0].snapshot_id}`)).json();
      expect(updated.usage.entries[0].usage.promptTokens).toBe(321);
      for (const route of ["/api/sessions?head_revision=999:missing", `/api/bindings?${pin}&bindings_revision=missing`]) {
        const response = await get(route);
        expect(response.status).toBe(409);
        expect((await response.json()).refresh_required).toBe(true);
      }
      const attacks: Record<string, string>[] = [{ Host: "evil.com" }, { Origin: "https://evil.com" }];
      for (const headers of attacks) {
        const response = await get("/api/sessions", { headers });
        expect(response.status).toBe(403);
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
      }
      expect((await get("/api/sessions", { method: "POST" })).status).toBe(404);
      for (const route of ["/../api/sessions", "/%2e%2e/index.html", "/api/sessions/%2e%2e"]) {
        const response = await runCommand(`curl --silent --show-error --path-as-is --max-time 4 -o /dev/null -w '%{http_code}' '${url}${route}'`, root);
        expect(response.exitCode).toBe(0);
        expect(["400", "404"]).toContain(response.stdout);
      }
      const refused = await runBoulder(["trace", "serve", "--cwd", root, "--host", "0.0.0.0", "--port", "0"]);
      expect(refused.exitCode).toBe(1);
      expect(refused.stderr).toContain("trace.loopback_required");
      const exited = bounded(child.exited); // subscribe BEFORE signal
      child.kill("SIGINT");
      expect(await exited).toBe(0);
      expect(await stderr).toBe("");
      child = undefined;
    } finally {
      if (child) { child.kill("SIGKILL"); await bounded(child.exited); }
      await removeTempRepo(root);
    }
  });
});
