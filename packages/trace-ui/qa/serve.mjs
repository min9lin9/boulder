// Real CLI + installed production assets + Chromium. No intercepted responses.
// bun packages/trace-ui/qa/serve.mjs <playwright-module> <chromium-executable> <evidence.txt>
import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { Database } from "bun:sqlite";

const [playwrightModule, executablePath, evidencePath] = process.argv.slice(2);
assert(playwrightModule && executablePath && evidencePath, "Supply installed Playwright, Chromium and evidence paths");
const { chromium } = await import(playwrightModule);
const worktree = resolve(import.meta.dir, "../../..");
const root = await mkdtemp(join(tmpdir(), "boulder-serve-browser-"));
const source = join(root, "source.sqlite");
const session = "sess-plain-001";
const hostile = '<img src=x onerror="window.__traceInjected=true"> & <script>window.__traceInjected=true</script>';
const log = [];
let server, browser, stderr, cleanup = "";
const record = (name, value) => log.push(`\n=== ${name} ===\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`);
async function bounded(signal, label) {
  let timer;
  try { return await Promise.race([signal, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), 10000); })]); }
  finally { clearTimeout(timer); }
}
async function command(args, expected = 0) {
  const child = Bun.spawn(args, { cwd: worktree, stdout: "pipe", stderr: "pipe" });
  try {
    const [code, stdout, stderr] = await bounded(Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]), args.join(" "));
    record(args.join(" "), { code, stdout, stderr });
    assert.equal(code, expected);
    return stdout;
  } finally { if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; } }
}
function change(seq, transform) {
  const db = new Database(source);
  try {
    const event = JSON.parse(db.query("SELECT event_json FROM transcript_events WHERE session_id=? AND seq=?").get(session, seq).event_json);
    transform(event);
    const json = JSON.stringify(event);
    db.query("UPDATE transcript_events SET event_json=?, event_utf8_bytes=? WHERE session_id=? AND seq=?").run(json, Buffer.byteLength(json), session, seq);
  } finally { db.close(); }
}
const collect = () => command(["bun", "bin/boulder.ts", "trace", "collect", "--cwd", root, "--db-path", source,
  "--session", session, "--once", "--write", "--json"], 1);
try {
  record("Path", "Installed Playwright + installed headless Chromium; real spawned CLI server, real journal, real built dist. No browser tool or DOM shim required; no mocked/intercepted HTTP.");
  record("Exact HTTP contract derived from server/projection/contracts", {
    catalog: "{head_revision: {sequence:number,digest:string}|null, bindings_revision:string, sessions:[{id:snapshot_id,session_id,snapshot_id,snapshot_digest,source_instance_id,agent_id,coverage:{kind:'full_session',input_count:number},disposition_counts:{normalized:number,ignored:number,quarantined:number}}]}",
    detail: "{head_revision,session_id,snapshot_id,snapshot_digest,source_instance_id,agent_id,coverage,disposition_counts,entries:ViewEntry[],hierarchy:ViewNode[],unresolved:UnresolvedEntry[],usage:{coverage:'observed_snapshot',entries:[{span_id,usage:Record<string,number>,basis:'source_reported'|'normalized_mapping',scope:'model_call'|'turn'|'session'|'unknown',evidence_id,additive:false}]}}",
    ViewEntry: "{kind:'message'|'tool'|'model'|'delegate',name,trace_id,trace_id_basis:'synthetic_session',span_id,source_event_refs:[{source_row_key,source_revision,logical_event_id?}],source_order:number,display_parent_id:string|null,execution_parent_span_id?:string,links:[{relationship:'transcript_lineage'|'tool_result'|'continuation'|'delegation',target_span_id}],start_time?:string,end_time?:string,duration_ms?:number,timing_basis:'measured'|'transcript_interval'|'unavailable',status:'ok'|'error'|'unknown',completion_basis:string,usage?:Record<string,number>,usage_basis?,usage_scope?,usage_evidence_id?,attributes:Record<string,unknown>,quality_flags:string[]}",
    ViewNode: "ViewEntry & {children:ViewNode[]}",
    UnresolvedEntry: "{source_event_refs:SourceEventRef[],source_order:number,reason:string,quality_flags:string[],entry?:ViewEntry}; quarantined rows have no entry",
    bindings: "{head_revision,bindings_revision:string,bindings:[{schemaVersion:'boulder.trace.binding.v1',binding_id,journal_id,snapshot_id,snapshot_digest,selected_events:SourceEventRef[],boulder_command_run_id,binding_basis:'operator_explicit',createdAt:string,validated_artifact_refs?:[{kind,path,digest}]}]}",
    pins: "?head_revision=sequence:digest (0:none for empty); independent bindings_revision token; unknown/evicted pins -> 409 {error,refresh_required:true,head_revision}; other API errors {error,head_revision}",
    decision: "Canonical projection reused by UI with type-only imports. No invented workflow/span types, metadata-only policy preserved. Server unchanged. Catalog fetched first, then head/binding-pinned dependent reads; navigation uses snapshot ID, refresh resolves successor by source+agent+session."
  });
  await copyFile(join(worktree, "fixtures/trace/openclaw/30afbaf8-claim/case-01-plain.sqlite"), source);
  change(3, (event) => { event.tool = hostile; });
  const db = new Database(source);
  try {
    const orphan = JSON.stringify({ type: "tool_result", requestId: "absent", ok: true, output: "private body excluded" });
    db.query("INSERT INTO transcript_events VALUES (?,6,?,NULL,?)").run(session, orphan, Buffer.byteLength(orphan));
  } finally { db.close(); }
  const first = JSON.parse(await collect());
  assert.deepEqual(first.disposition_counts, { normalized: 5, ignored: 0, quarantined: 1 });
  await command(["bun", "run", "build:trace-ui"]);
  server = Bun.spawn(["bun", "bin/boulder.ts", "trace", "serve", "--cwd", root, "--host", "127.0.0.1", "--port", "0"], { cwd: worktree, stdout: "pipe", stderr: "pipe" });
  stderr = new Response(server.stderr).text();
  const reader = server.stdout.getReader();
  const ready = (async () => {
    let output = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`No readiness URL: ${output}; ${await stderr}`);
      output += new TextDecoder().decode(value);
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
      if (match) { record("Server stdout / readiness event", output); return match[0]; }
    }
  })();
  const base = await bounded(ready, "listener readiness");
  reader.releaseLock();
  async function json(path, init, status = 200) {
    const response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(5000) });
    const body = await response.json();
    record(`HTTP ${init?.method ?? "GET"} ${path} ${init?.headers ? JSON.stringify(init.headers) : ""}`, { status: response.status, body });
    assert.equal(response.status, status);
    return body;
  }
  const html = await fetch(`${base}/`);
  assert.equal(html.status, 200);
  assert.equal(await html.text(), await readFile(join(worktree, "packages/trace-ui/dist/index.html"), "utf8"));
  record("HTTP GET /", { status: html.status, contentType: html.headers.get("content-type"), csp: html.headers.get("content-security-policy"), shippedCopyEqual: true });
  const catalog = await json("/api/sessions");
  const head = JSON.parse(await readFile(join(root, ".boulder/trace-state/head.json"), "utf8"));
  assert.deepEqual(catalog.head_revision, { sequence: head.sequence, digest: head.digest });
  const pin = `head_revision=${head.sequence}:${head.digest}`;
  const detailPath = `/api/sessions/${first.snapshot_id}?${pin}`;
  const detail = await json(detailPath);
  assert.equal(detail.entries.length, 5);
  assert.equal(detail.unresolved[0].reason, "dangling_tool_result");
  assert.equal(detail.usage.entries[0].usage.promptTokens, 120);
  assert.equal(detail.entries.find((entry) => entry.name === hostile).kind, "tool");
  assert(!JSON.stringify(detail).includes("private body excluded"));
  await json(`/api/bindings?${pin}&bindings_revision=${catalog.bindings_revision}`);

  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [], requests = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", (request) => requests.push(request.url()));
  await page.addInitScript(() => {
    window.__qaObserve = (selector) => new Promise((resolve, reject) => {
      const observer = new MutationObserver(check);
      const timer = setTimeout(() => { observer.disconnect(); reject(new Error(`Missing state: ${selector}`)); }, 5000);
      function check() {
        if (document.querySelector(selector)) { observer.disconnect(); clearTimeout(timer); resolve(); }
      }
      observer.observe(document, { subtree: true, attributes: true, childList: true });
      check();
    });
    window.__qaSignal = window.__qaObserve('.workspace[aria-busy="false"] .session-list button');
  });
  await page.goto(`${base}/`);
  await page.evaluate(() => window.__qaSignal);
  async function transition(selector, action) {
    await page.evaluate((selector) => { window.__qaSignal = window.__qaObserve(selector); }, selector);
    await action();
    await page.evaluate(() => window.__qaSignal);
  }
  await transition('[data-section="trace"] [data-entry-id]', () => page.getByRole("button", { name: session, exact: true }).click());
  assert.equal(await page.locator("[data-revision-sequence]").getAttribute("data-revision-sequence"), String(head.sequence));
  assert.equal(await page.locator(".revision-header code[title]").getAttribute("title"), head.digest);
  assert.equal(await page.locator('[data-metric="promptTokens"] strong').textContent(), "120");
  assert.equal(await page.locator('[data-usage-scope="unknown"][data-usage-basis="source_reported"]').count(), 1);
  assert.equal(await page.locator('[data-unresolved-reason="dangling_tool_result"]').count(), 1);
  assert.equal(await page.locator('[data-section="trace"] [data-entry-id]').count(), detail.entries.length);
  assert((await page.locator('[data-section="trace"]').textContent()).includes(hostile));
  assert.equal(await page.locator("main img, main script").count(), 0);
  assert.equal(await page.evaluate(() => window.__traceInjected), undefined);
  assert(requests.some((url) => url.includes(`/api/sessions/${first.snapshot_id}?head_revision=`)));
  assert(requests.some((url) => url.includes(`/api/bindings?head_revision=`) && url.includes(`bindings_revision=${catalog.bindings_revision}`)));
  for (const open of [false, true]) {
    await page.evaluate(() => {
      const disclosure = document.querySelector('.trace-tree > li > details');
      window.__qaSignal = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Disclosure did not toggle")), 5000);
        disclosure.addEventListener("toggle", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    });
    await page.locator(".trace-tree > li > details > summary").first().click();
    await page.evaluate(() => window.__qaSignal);
    assert.equal(await page.locator(".trace-tree > li > details").first().evaluate((element) => element.open), open);
  }
  record("Rendered real projection, before second collect", await page.locator("main").innerText());
  record("Real hierarchy DOM counts", { tree: await page.locator('[data-section="trace"] [data-entry-id]').count(), unresolved: await page.locator("[data-unresolved-order]").count(), rawUsageBuckets: await page.locator("[data-metric]").count() });
  await page.screenshot({ path: evidencePath.replace(/\.txt$/, ".png"), fullPage: true });

  change(5, (event) => { event.usage.promptTokens = 321; });
  const second = JSON.parse(await collect());
  assert.equal(second.segment_seq, 2);
  const latest = await json("/api/sessions");
  assert.equal(latest.head_revision.sequence, 2);
  assert.notEqual(latest.head_revision.digest, head.digest);
  assert.deepEqual(await json(detailPath), detail);
  await transition('[data-state="stale-revision"]', () => page.getByRole("button", { name: "Check for newer revision", exact: true }).click());
  assert.equal(await page.locator("[data-revision-sequence]").getAttribute("data-revision-sequence"), "1");
  assert.equal(await page.locator('[data-metric="promptTokens"] strong').textContent(), "120");
  record("Stale revision notice (real second collect)", { notice: await page.locator('[data-state="stale-revision"]').innerText(), pinned: await page.locator(".revision-header").innerText(), promptTokens: 120 });
  await page.screenshot({ path: evidencePath.replace(/\.txt$/, "-stale.png"), fullPage: true });
  await transition('[data-revision-sequence="2"]', () => page.getByRole("button", { name: "Refresh to latest revision", exact: true }).click());
  assert.equal(await page.locator('[data-metric="promptTokens"] strong').textContent(), "321");
  assert.equal(await page.locator(".revision-header code[title]").getAttribute("title"), latest.head_revision.digest);
  assert((await page.locator(".revision-header").innerText()).includes(second.snapshot_id));
  assert.equal(await page.locator('[data-state="stale-revision"]').count(), 0);
  record("Explicit refresh rendered successor", { header: await page.locator(".revision-header").innerText(), usage: await page.locator('[data-section="usage"]').innerText() });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  record("Responsive check", "390px viewport: no horizontal overflow with real synthetic span IDs and hostile metadata.");
  assert.deepEqual(errors, []);
  record("Browser errors", errors);
  record("Browser real HTTP requests", requests);
  assert(requests.every((url) => url.startsWith(base)));
  await json("/api/sessions", { headers: { Host: "evil.com" } }, 403);
  await json("/api/sessions", { headers: { Origin: "https://evil.com" } }, 403);
  await json("/api/sessions", { method: "POST" }, 404);
  await json("/api/sessions?head_revision=999:missing", undefined, 409);
  await json(`/api/bindings?${pin}&bindings_revision=missing`, undefined, 409);
  for (const path of ["/../api/sessions", "/%2e%2e/index.html", "/api/sessions/%2e%2e"]) {
    const output = await command(["curl", "--silent", "--show-error", "--path-as-is", "--max-time", "5", "-w", "\nHTTP %{http_code}", `${base}${path}`]);
    assert(/HTTP (400|404)$/.test(output));
  }
  await command(["bun", "bin/boulder.ts", "trace", "serve", "--cwd", root, "--host", "0.0.0.0", "--port", "0"], 1);
  const exited = bounded(server.exited, "SIGINT exit");
  server.kill("SIGINT");
  assert.equal(await exited, 0);
  assert.equal(await stderr, "");
  record("SIGINT", { exit: 0, stderr: "" });
  server = undefined;
  record("Adversarial classes", {
    untrusted_external_text: "PASS: tool name changed in actual source SQLite, collected, fetched and rendered literally; no img/script elements or execution. Transcript bodies remain omitted by canonical metadata-only policy.",
    misleading_success_output: "PASS: actual collected artifacts, CLI listener, production dist, HTTP responses and Chromium DOM; quarantined collection exits 1 as required.",
    stale_state: "PASS: head 1 remains pinned after head 2 collect; explicit check shows stale notice; explicit refresh shows successor and 321 tokens, pinned old HTTP detail unchanged.",
    path_traversal: "PASS: raw curl --path-as-is routes rejected 400/404.",
    authentication_authorization: "PASS: Host rebinding, cross-Origin and non-loopback bind rejected.",
    command_injection: "N/A: no transcript text is executed; subprocess arguments are fixed and passed as argv.",
    destructive_actions: "N/A: viewer GET-only; temporary QA source is the only mutated database.",
    secret_exfiltration: "N/A: synthetic fixture only; all browser requests asserted loopback, no secrets supplied.",
    resource_exhaustion: "N/A: bounded six-row fixture; load/virtualization outside this task."
  });
  record("Result", "PASS");
} catch (error) {
  record("FAILURE", String(error.stack ?? error));
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) { server.kill("SIGKILL"); await bounded(server.exited, "cleanup exit"); if (stderr) record("Server cleanup stderr", await stderr); }
  await rm(root, { recursive: true, force: true });
  cleanup = "Browser closed; CLI exited; temporary repo/source/journal removed. No source fixture mutated.";
  record("Cleanup", cleanup);
  await writeFile(evidencePath, log.join("\n"));
  console.log(`Manual QA evidence: ${evidencePath}\n${cleanup}`);
}
