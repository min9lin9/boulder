import { describe, expect, test } from "bun:test";
import { mkdir, readFile, readdir, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";
import { snapshotDigest, SNAPSHOT_RECORD_VERSION } from "../src/trace/collect";
import { sourceRevisionForDecodedEvent, type SessionSnapshot } from "../src/trace/contracts";
import { commitBatch, loadHead } from "../src/trace/journal";
import { startTraceServer, type TraceServer } from "../src/trace/server";
import { removeTempRepo, runBoulder, runCommand, tempRepo, write } from "./helpers/cli";

async function publish(root: string, version = 1, sessionId = "session"): Promise<SessionSnapshot> {
  const head = await loadHead(root);
  const content = {
    source_instance_id: "source", agent_id: "agent", session_id: sessionId, selection_scope: "full_session",
    input_inventory: [{ source_row_key: JSON.stringify([sessionId, 1]), source_revision: "a".repeat(64),
      disposition: "normalized" as const, reason: null, quality_flags: [],
      normalized_facts: { event_type: "message", kind: "message", role: "user", source_order: 1,
        label: "</script><img src=x onerror=alert(1)>", version } }],
    disposition_counts: { normalized: 1, ignored: 0, quarantined: 0 }, coverage: { kind: "full_session" as const, input_count: 1 }
  };
  const snapshot = { ...content, snapshot_id: `${sessionId}-${version}`, snapshot_digest: await snapshotDigest(content),
    supersedes_snapshot_id: head?.snapshotRefs.find((ref) => ref.session_id === sessionId)?.snapshot_id ?? null };
  await commitBatch(root, {
    schema_version: "boulder.trace.batch.v1", journal_id: "journal", batch_id: `batch-${(head?.sequence ?? 0) + 1}`,
    batch_seq: (head?.sequence ?? 0) + 1, previous_segment_hash: head?.digest ?? null,
    adapter_id: "openclaw-local", interpretation_version: "test", content_policy_version: "metadata-only",
    records: [{ schema_version: SNAPSHOT_RECORD_VERSION, ...snapshot }],
    snapshotRefs: [...(head?.snapshotRefs ?? []).filter((ref) => ref.session_id !== sessionId), {
      source_instance_id: snapshot.source_instance_id, agent_id: snapshot.agent_id, session_id: sessionId,
      snapshot_id: snapshot.snapshot_id, snapshot_digest: snapshot.snapshot_digest
    }]
  }, { command: "trace server test" });
  return snapshot;
}
const base = (server: TraceServer) => `http://127.0.0.1:${server.port}`;
const get = (server: TraceServer, path: string, headers?: Record<string, string>) => fetch(`${base(server)}${path}`, { headers });

describe("read-only loopback trace HTTP server", () => {
  test("published catalog and projected detail carry one revision; transcript text is JSON data", async () => {
    const root = await tempRepo();
    let server: TraceServer | undefined;
    try {
      const snapshot = await publish(root);
      const head = (await loadHead(root))!;
      server = await startTraceServer({ root, port: 0 });
      const listResponse = await get(server, "/api/sessions");
      expect(listResponse.status).toBe(200);
      const list = await listResponse.json();
      expect(list.head_revision).toEqual({ sequence: head.sequence, digest: head.digest });
      expect(list.sessions[0].id).toBe(snapshot.snapshot_id);
      const detailResponse = await get(server, `/api/sessions/${snapshot.snapshot_id}`);
      const detail = await detailResponse.json();
      expect(detail.head_revision).toEqual(list.head_revision);
      expect(detail.hierarchy[0].attributes.label).toBe("</script><img src=x onerror=alert(1)>");
      expect(detail.usage).toEqual({ coverage: "observed_snapshot", entries: [] });
      expect(detail.unresolved).toEqual([]);
      expect(detailResponse.headers.get("content-type")).toContain("application/json");
      expect(detailResponse.headers.get("x-content-type-options")).toBe("nosniff");
      expect(detailResponse.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(detailResponse.headers.get("access-control-allow-origin")).toBeNull();
      expect((await (await get(server, "/api/bindings")).json()).bindings).toEqual([]);
      for (const path of ["/", "/unknown", "/api/sessions/missing", "/api/sessions/session/extra"]) {
        const response = await get(server, path);
        expect(response.status).toBe(404);
        expect((await response.json()).head_revision).toEqual(list.head_revision);
      }
      expect((await fetch(`${base(server)}/api/sessions`, { method: "POST" })).status).toBe(404);
      expect((await readdir(join(root, ".boulder/trace-state"))).sort()).toEqual(["head.json"]);
    } finally { await server?.stop(true); await removeTempRepo(root); }
  });

  test("old-revision pins stay coherent after another commit; unknown pins explicitly require refresh", async () => {
    const root = await tempRepo();
    let server: TraceServer | undefined;
    try {
      await publish(root);
      server = await startTraceServer({ root, port: 0 });
      const catalog = await (await get(server, "/api/sessions")).json();
      const pin = `${catalog.head_revision.sequence}:${catalog.head_revision.digest}`;
      const old = await (await get(server, `/api/sessions/session?head_revision=${pin}`)).json();
      await publish(root, 2);
      await publish(root, 1, "other");
      const refreshed = await (await get(server, "/api/sessions")).json();
      expect(refreshed.head_revision.sequence).toBe(3);
      expect(refreshed.sessions).toHaveLength(2);
      const pinned = await (await get(server, `/api/sessions/session?head_revision=${pin}`)).json();
      expect(pinned).toEqual(old);
      const current = await (await get(server, "/api/sessions/session")).json();
      expect(current.snapshot_id).toBe("session-2");
      expect(current.head_revision.sequence).toBe(3);
      expect(current.entries[0].attributes.version).toBe(2);
      const unavailable = await get(server, "/api/sessions?head_revision=99:missing");
      expect(unavailable.status).toBe(409);
      expect((await unavailable.json()).refresh_required).toBe(true);
    } finally { await server?.stop(true); await removeTempRepo(root); }
  });

  test("unpublished files cannot select a revision, including when head is absent", async () => {
    const root = await tempRepo();
    let server: TraceServer | undefined;
    try {
      await write(root, ".boulder/traces/000009-unpublished.jsonl", "NOT A JOURNAL\n");
      server = await startTraceServer({ root, port: 0 });
      const empty = await (await get(server, "/api/sessions")).json();
      expect(empty.sessions).toEqual([]);
      expect(empty.head_revision).toBeNull();
      await server.stop(true);
      server = undefined;
      await removeTempRepo(root);
      await mkdir(root, { recursive: true });
      await publish(root);
      await write(root, ".boulder/traces/999999-unpublished.jsonl", "NEVER OPEN THIS\n");
      server = await startTraceServer({ root, port: 0 });
      const list = await (await get(server, "/api/sessions")).json();
      expect(list.head_revision.sequence).toBe(1);
      expect(list.sessions).toHaveLength(1);
      expect(await readFile(join(root, ".boulder/traces/999999-unpublished.jsonl"), "utf8")).toBe("NEVER OPEN THIS\n");
    } finally { await server?.stop(true); await removeTempRepo(root); }
  });

  test("rejects DNS rebinding, cross-origin requests, raw traversal and non-loopback binds", async () => {
    const root = await tempRepo();
    let server: TraceServer | undefined;
    try {
      server = await startTraceServer({ root, port: 0 });
      const attacks: Record<string, string>[] = [{ Host: "evil.com" }, { Host: "127.0.0.1.evil.com" }, { Origin: "http://evil.com" },
        { Origin: "null" }, { Origin: "http://127.0.0.1:1" }];
      for (const headers of attacks) {
        const response = await get(server, "/api/sessions", headers);
        expect(response.status).toBe(403);
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      }
      expect((await get(server, "/api/sessions", { Origin: base(server) })).status).toBe(200);
      expect((await get(server, "/api/sessions", { Host: `localhost:${server.port}` })).status).toBe(200);
      for (const [path, status] of [
        ["/../api/sessions", "404"], ["/%2e%2e/api/sessions", "404"], ["/../index.html", "404"],
        ["/%252e%252e/api/sessions", "400"], ["/api%2fsessions", "400"], ["/..%5capi/sessions", "400"],
        ["/api/sessions/%2e%2e", "400"]
      ]) {
        const response = await runCommand(`curl --silent --show-error --path-as-is --max-time 5 -o /dev/null -w '%{http_code}' '${base(server)}${path}'`, root);
        expect(response.exitCode).toBe(0);
        expect(response.stdout).toBe(status);
      }
      for (const host of ["0.0.0.0", "192.168.1.1", "evil.com", "::"]) {
        await expect(startTraceServer({ root, port: 0, host })).rejects.toThrow("trace.loopback_required");
      }
      await expect(startTraceServer({ root, port: -1 })).rejects.toThrow("trace.port_invalid");
    } finally { await server?.stop(true); await removeTempRepo(root); }
  });

  test("serves installed assets, never cwd HTML or arbitrary target files", async () => {
    const root = await tempRepo();
    let server: TraceServer | undefined;
    try {
      await write(root, "packages/trace-ui/dist/index.html", "UNTRUSTED_TARGET_HTML");
      server = await startTraceServer({ root, port: 0, serveStatic: true });
      const response = await get(server, "/");
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toBe(await readFile(join(import.meta.dir, "../packages/trace-ui/dist/index.html"), "utf8"));
      expect(html).not.toContain("UNTRUSTED_TARGET_HTML");
      const assets = [...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)].map((match) => match[1]);
      expect(assets.length).toBeGreaterThan(0);
      for (const asset of assets) {
        const url = new URL(asset, `${base(server)}/`);
        expect((await fetch(url)).status).toBe(200);
      }
      expect((await get(server, "/.boulder/trace-state/head.json")).status).toBe(404);
      expect(response.headers.get("content-security-policy")).toContain("script-src 'self'");
    } finally { await server?.stop(true); await removeTempRepo(root); }
  });

  test("lists content-verified bindings with locator-only selected events", async () => {
    const root = await tempRepo();
    let server: TraceServer | undefined;
    try {
      const snapshot = await publish(root);
      const content = { schemaVersion: "boulder.trace.binding.v1", journal_id: "journal", snapshot_id: snapshot.snapshot_id,
        snapshot_digest: snapshot.snapshot_digest, selected_events: [{ source_row_key: snapshot.input_inventory[0].source_row_key,
          source_revision: snapshot.input_inventory[0].source_revision }], boulder_command_run_id: "run", binding_basis: "operator_explicit" };
      const id = await sourceRevisionForDecodedEvent(content);
      const binding = { ...content, binding_id: id, createdAt: "2026-01-01T00:00:00Z" };
      await write(root, `.boulder/trace-state/bindings/${id}.json`, JSON.stringify(binding));
      server = await startTraceServer({ root, port: 0 });
      const response = await (await get(server, "/api/bindings")).json();
      expect(response.bindings).toEqual([binding]);
      expect(response.head_revision.sequence).toBe(1);
      const secondContent = { ...content, boulder_command_run_id: "another-run" };
      const secondId = await sourceRevisionForDecodedEvent(secondContent);
      await write(root, `.boulder/trace-state/bindings/${secondId}.json`, JSON.stringify({
        ...secondContent, binding_id: secondId, createdAt: binding.createdAt
      }));
      const catalog = await (await get(server, "/api/sessions")).json();
      expect(catalog.head_revision).toEqual(response.head_revision);
      expect(catalog.bindings_revision).not.toBe(response.bindings_revision);
      expect((await (await get(server, "/api/bindings")).json()).bindings).toHaveLength(2);
      const pin = `${response.head_revision.sequence}:${response.head_revision.digest}`;
      const frozen = await (await get(server, `/api/bindings?head_revision=${pin}&bindings_revision=${response.bindings_revision}`)).json();
      expect(frozen).toEqual(response);
      const refreshed = await (await get(server, `/api/bindings?head_revision=${pin}&bindings_revision=${catalog.bindings_revision}`)).json();
      expect(refreshed.bindings).toHaveLength(2);
    } finally { await server?.stop(true); await removeTempRepo(root); }
  });

  test("one corrupt binding file degrades to warnings; the API stays up", async () => {
    const root = await tempRepo();
    let server: TraceServer | undefined;
    try {
      const snapshot = await publish(root);
      const content = { schemaVersion: "boulder.trace.binding.v1", journal_id: "journal", snapshot_id: snapshot.snapshot_id,
        snapshot_digest: snapshot.snapshot_digest, selected_events: [{ source_row_key: snapshot.input_inventory[0].source_row_key,
          source_revision: snapshot.input_inventory[0].source_revision }], boulder_command_run_id: "run", binding_basis: "operator_explicit" };
      const id = await sourceRevisionForDecodedEvent(content);
      await write(root, `.boulder/trace-state/bindings/${id}.json`, JSON.stringify({ ...content, binding_id: id, createdAt: "2026-01-01T00:00:00Z" }));
      await write(root, ".boulder/trace-state/bindings/notes.json", "not a binding at all{");
      server = await startTraceServer({ root, port: 0 });
      const bindings = await (await get(server, "/api/bindings")).json();
      expect(bindings.bindings).toHaveLength(1);
      expect(bindings.bindings[0].binding_id).toBe(id);
      expect(bindings.bindings_warnings).toHaveLength(1);
      expect(bindings.bindings_warnings[0]).toContain("notes.json");
      const catalog = await (await get(server, "/api/sessions")).json();
      expect(catalog.sessions).toHaveLength(1);
      expect(catalog.bindings_warnings).toHaveLength(1);
      expect(catalog.head_revision.sequence).toBe(1);
    } finally { await server?.stop(true); await removeTempRepo(root); }
  });

  test("binding warnings leak no filesystem path and move bindings_revision", async () => {
    const root = await tempRepo();
    let server: TraceServer | undefined;
    const leakFile = ".boulder/trace-state/bindings/leak.json";
    const chmod = (mode: number) => runCommand(`chmod ${mode.toString(8)} ${leakFile}`, root);
    try {
      const snapshot = await publish(root);
      const content = { schemaVersion: "boulder.trace.binding.v1", journal_id: "journal", snapshot_id: snapshot.snapshot_id,
        snapshot_digest: snapshot.snapshot_digest, selected_events: [{ source_row_key: snapshot.input_inventory[0].source_row_key,
          source_revision: snapshot.input_inventory[0].source_revision }], boulder_command_run_id: "run", binding_basis: "operator_explicit" };
      const id = await sourceRevisionForDecodedEvent(content);
      await write(root, `.boulder/trace-state/bindings/${id}.json`, JSON.stringify({ ...content, binding_id: id, createdAt: "2026-01-01T00:00:00Z" }));
      server = await startTraceServer({ root, port: 0 });
      const clean = await (await get(server, "/api/bindings")).json();
      expect(clean.bindings).toHaveLength(1);
      expect(clean.bindings_warnings).toBe(undefined);
      // An unreadable entry fails open(2) with EACCES, whose raw message embeds
      // the absolute path. The warning must carry only the filename and code.
      await write(root, leakFile, "garbage{");
      await chmod(0o000);
      const degraded = await (await get(server, "/api/bindings")).json();
      expect(degraded.bindings).toHaveLength(1);
      expect(degraded.bindings_warnings).toEqual(["leak.json: EACCES"]);
      expect(degraded.bindings_warnings[0]).not.toContain(root);
      expect(degraded.bindings_warnings[0]).not.toContain("/");
      expect(degraded.bindings).toEqual(clean.bindings);
      expect(degraded.bindings_revision).not.toBe(clean.bindings_revision);
      await chmod(0o600);
      await unlink(join(root, leakFile));
      const restored = await (await get(server, "/api/bindings")).json();
      expect(restored.bindings_warnings).toBe(undefined);
      expect(restored.bindings_revision).toBe(clean.bindings_revision);
    } finally {
      await chmod(0o600);
      await server?.stop(true); await removeTempRepo(root);
    }
  });

  test("rejects symlink escapes and committed segment corruption instead of serving success", async () => {
    const root = await tempRepo();
    const outside = await tempRepo();
    try {
      await write(root, ".boulder/trace-state/placeholder", "");
      await symlink(outside, join(root, ".boulder/trace-state/bindings"));
      await expect(startTraceServer({ root, port: 0 })).rejects.toThrow("trace.journal_path_unsafe");
      await removeTempRepo(root);
      await mkdir(root, { recursive: true });
      await publish(root);
      const head = (await loadHead(root))!;
      await write(root, `.boulder/traces/${head.fileName}`, "corrupt\n");
      await expect(startTraceServer({ root, port: 0 })).rejects.toThrow("trace.segment_invalid");
    } finally { await removeTempRepo(root); await removeTempRepo(outside); }
  });

  test("real CLI process announces its ephemeral listener and stops on SIGINT", async () => {
    const root = await tempRepo();
    type Child = { stdout: ReadableStream<Uint8Array>; stderr: ReadableStream<Uint8Array>; exited: Promise<number>; kill(signal: string): void };
    const runtime = Bun as unknown as { spawn(args: string[], options: { stdout: "pipe"; stderr: "pipe" }): Child };
    let child: Child | undefined;
    try {
      await publish(root);
      const rejected = await runBoulder(["trace", "serve", "--cwd", root, "--host", "0.0.0.0", "--port", "0"]);
      expect(rejected.exitCode).toBe(1);
      expect(rejected.stderr).toContain("trace.loopback_required");
      child = runtime.spawn(["bun", join(import.meta.dir, "../bin/boulder.ts"), "trace", "serve", "--cwd", root, "--port", "0"],
        { stdout: "pipe", stderr: "pipe" });
      const stderr = new Response(child.stderr).text();
      const reader = child.stdout.getReader();
      const ready = (async () => {
        let output = "";
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) throw new Error(`Server exited before readiness: ${output}; ${await stderr}`);
          output += new TextDecoder().decode(chunk.value);
          const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
          if (match) return match[0];
        }
      })();
      const url = await bounded(ready);
      expect((await fetch(`${url}/api/sessions`)).status).toBe(200);
      child.kill("SIGINT");
      expect(await bounded(child.exited)).toBe(0);
      expect(await stderr).toBe("");
      reader.releaseLock();
      child = undefined;
    } finally {
      if (child) { child.kill("SIGKILL"); await child.exited; }
      await removeTempRepo(root);
    }
  });
});

async function bounded<T>(signal: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([signal, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Server event timed out")), 5000);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
