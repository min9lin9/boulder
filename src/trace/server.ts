import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isMissingPath, noFollowFlag } from "../fs";
import { sourceRevisionForDecodedEvent, type SessionSnapshot } from "./contracts";
import type { TraceBinding } from "./bindings";
import { loadHead, TraceCommitError, type TraceHead } from "./journal";
import { isRecord, readPublishedChain } from "./published-chain";
import { projectSnapshot, type SessionProjection } from "./projection";

export type HeadRevision = { readonly sequence: number; readonly digest: string };
export type TraceServer = { readonly port: number; readonly hostname: string; stop(closeActiveConnections?: boolean): Promise<void> | void };
type RoutedRequest = Request & { params?: Record<string, string> };
type Route = "sessions" | "detail" | "bindings" | "asset" | "unknown";
type ServeOptions = { hostname: string; port: number;
  routes: Record<string, (request: RoutedRequest) => Promise<Response>>;
  fetch(request: Request): Promise<Response>;
};
type ServeRuntime = { serve(options: ServeOptions): TraceServer };
export type TraceServerOptions = {
  readonly root: string;
  readonly host?: string;
  readonly port?: number;
  /** Only the explicit serve command opts into packaged, module-relative assets. */
  readonly serveStatic?: boolean;
};
type PublishedView = { head_revision: HeadRevision | null; sessions: SessionProjection[]; bindings: TraceBinding[]; bindings_revision: string; bindings_warnings: string[] };
type BindingView = { bindings: TraceBinding[]; bindings_revision: string; bindings_warnings: string[] };
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store"
};
const revisionKey = (revision: HeadRevision | null) => revision ? `${revision.sequence}:${revision.digest}` : "0:none";

/** GET ?head_revision=<sequence>:<digest> pins all API reads (alias: revision).
 * The last eight observed revisions are retained in memory. Bindings are an
 * independent store: catalog/bindings responses also expose bindings_revision.
 * Pin that token alongside head_revision to freeze the binding list. Unpinned
 * requests refresh bindings even when the journal head has not changed; a head
 * pin alone uses the binding list captured when that head was first observed.
 * Unknown/evicted pins return 409, NEVER newer data. After restart, refresh the
 * catalog. Every response, including API errors, carries head_revision; null
 * denotes no published head (pin token 0:none). No reader recovers the journal.
 */
export async function startTraceServer(options: TraceServerOptions): Promise<TraceServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4319;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error("trace.loopback_required: bind to 127.0.0.1 or localhost.");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("trace.port_invalid: use an integer port from 0 to 65535.");
  const root = resolve(options.root);
  const cache = new Map<string, PublishedView>();
  const bindingCache = new Map<string, BindingView>();
  async function captureBindings(): Promise<BindingView> {
    const { bindings, warnings } = await readBindings(root);
    // The revision covers the sorted warning set too: a degraded read must
    // never collide with the pin issued for a clean read of the same files.
    const bindings_revision = await sourceRevisionForDecodedEvent({ bindings, warnings: [...warnings].sort() });
    const view = { bindings, bindings_revision, bindings_warnings: warnings };
    bindingCache.set(bindings_revision, view);
    if (bindingCache.size > 8) bindingCache.delete(bindingCache.keys().next().value!);
    return view;
  }
  const pending = new Map<string, Promise<PublishedView>>();
  let lastRevision: HeadRevision | null = null;
  async function capture(head: TraceHead | null): Promise<PublishedView> {
    const revision = head ? { sequence: head.sequence, digest: head.digest } : null;
    const key = revisionKey(revision);
    const cached = cache.get(key);
    if (cached) return cached;
    const inflight = pending.get(key);
    if (inflight) return inflight;
    const work = (async () => {
      const sessions = (await readPublishedSnapshots(root, head)).map(projectSnapshot);
      const view = { head_revision: revision, sessions, ...await captureBindings() };
      cache.set(key, view);
      if (cache.size > 8) cache.delete(cache.keys().next().value!);
      return view;
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  }
  const initial = await capture(await loadHead(root));
  lastRevision = initial.head_revision;
  const staticRoot = options.serveStatic ? await findStaticRoot() : null;
  async function respond(request: RoutedRequest, route: Route): Promise<Response> {
      let revision = lastRevision;
      const json = (body: Record<string, unknown>, status = 200) => Response.json(
        { ...body, head_revision: revision }, { status, headers: securityHeaders });
      if (!validHost(request.headers.get("host"), server.port)
        || !validOrigin(request.headers.get("origin"), server.port)) return json({ error: "trace.forbidden_origin" }, 403);
      let pathname: string;
      try {
        pathname = safeRequestPath(request.url);
        for (const value of Object.values(request.params ?? {})) {
          if (value === "." || value === ".." || /[/\\\\%\x00-\x1f]/.test(value)) throw new Error("Invalid path parameter");
        }
      } catch { return json({ error: "trace.path_invalid" }, 400); }
      if (request.method !== "GET" || route === "unknown") return json({ error: "trace.not_found" }, 404);
      const url = new URL(request.url);
      try {
        if (route === "sessions" || route === "detail" || route === "bindings") {
          const pin = url.searchParams.get("head_revision") ?? url.searchParams.get("revision");
          let view: PublishedView;
          if (pin !== null) {
            const pinned = cache.get(pin);
            if (!pinned) return json({ error: "trace.revision_unavailable", refresh_required: true }, 409);
            view = pinned;
          } else {
            view = await capture(await loadHead(root));
            lastRevision = view.head_revision;
          }
          revision = view.head_revision;
          let bindingView: BindingView = { bindings: view.bindings, bindings_revision: view.bindings_revision, bindings_warnings: view.bindings_warnings };
          if (route === "sessions" || route === "bindings") {
            const bindingPin = url.searchParams.get("bindings_revision");
            if (bindingPin !== null) {
              const bindings = bindingCache.get(bindingPin);
              if (!bindings) return json({ error: "trace.bindings_revision_unavailable", refresh_required: true }, 409);
              bindingView = bindings;
            } else if (pin === null) bindingView = await captureBindings();
          }
          const bindingWarnings = bindingView.bindings_warnings.length === 0 ? {} : { bindings_warnings: bindingView.bindings_warnings };
          if (route === "sessions") return json({ bindings_revision: bindingView.bindings_revision, ...bindingWarnings, sessions: view.sessions.map((session) => ({
            id: session.snapshot_id, session_id: session.session_id, snapshot_id: session.snapshot_id,
            snapshot_digest: session.snapshot_digest, source_instance_id: session.source_instance_id,
            agent_id: session.agent_id, coverage: session.coverage, disposition_counts: session.disposition_counts
          })) });
          if (route === "bindings") return json({ bindings: bindingView.bindings, bindings_revision: bindingView.bindings_revision, ...bindingWarnings });
          const id = request.params!.id;
          const matches = view.sessions.filter((session) => session.snapshot_id === id || session.session_id === id);
          if (matches.length > 1) return json({ error: "trace.session_ambiguous" }, 409);
          return matches.length === 1 ? json({ ...matches[0] }) : json({ error: "trace.not_found" }, 404);
        }
        if (route === "asset" && staticRoot) {
          const response = await serveStatic(pathname, staticRoot);
          if (response) return response;
        }
        return json({ error: "trace.not_found" }, 404);
      } catch (error) {
        // Report fixed diagnostics, never filesystem paths, payloads or stacks.
        return json({ error: error instanceof TraceCommitError ? error.code : "trace.read_failed" }, 500);
      }
  }
  // Bun normalizes Request.url BEFORE fetch. Its route matcher retains the
  // original path structure, so whitelist routes there and NEVER dispatch a
  // normalized fallback URL. /../api/sessions must not become a valid API read.
  const server = (Bun as unknown as ServeRuntime).serve({
    hostname: host, port,
    routes: {
      "/api/sessions": (request) => respond(request, "sessions"),
      "/api/sessions/:id": (request) => respond(request, "detail"),
      "/api/bindings": (request) => respond(request, "bindings"),
      "/": (request) => respond(request, "asset"),
      "/:asset": (request) => respond(request, "asset")
    },
    fetch: (request) => respond(request, "unknown")
  });
  return server;
}

function validHost(host: string | null, port: number): boolean {
  if (host === null) return false;
  const match = /^(127\.0\.0\.1|localhost)(?::(\d+))?$/.exec(host.toLowerCase());
  return match !== null && (match[2] === undefined || Number(match[2]) === port);
}
function validOrigin(origin: string | null, port: number): boolean {
  if (origin === null) return true;
  // Require the exact loopback HTTP origin, including the bound port. Reject
  // opaque, multi-origin, credentialed and cross-port browser requests.
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`
    || (port === 80 && (origin === "http://127.0.0.1" || origin === "http://localhost"));
}
function safeRequestPath(rawUrl: string): string {
  // Route whitelisting rejects dot-segment paths before this normalized URL
  // reaches us. Reject remaining encoded separators and double-encoding too.
  const raw = rawUrl.replace(/^[a-z]+:\/\/[^/]+/i, "").split(/[?#]/, 1)[0] || "/";
  const decoded = decodeURIComponent(raw);
  if (!decoded.startsWith("/") || /[\\\x00-\x1f\x7f%]/.test(decoded)
    || /%2f/i.test(raw) || decoded.split("/").some((part) => part === "." || part === "..")) throw new Error("Invalid path");
  return decoded;
}

/** Resolve ONLY files in the prefix selected by head.json, through the shared
 * published-chain walker. Unpublished files are not opened and never choose
 * the revision. Sessions are served in the published snapshotRefs order; the
 * walker has already authenticated every referenced snapshot.
 */
async function readPublishedSnapshots(root: string, head: TraceHead | null): Promise<SessionSnapshot[]> {
  if (!head) return [];
  const { snapshotById } = await readPublishedChain(root, head, (code) => new Error(code));
  return head.snapshotRefs.map((reference) => {
    const snapshot = snapshotById.get(reference.snapshot_id);
    if (!snapshot) throw new Error("trace.snapshot_missing");
    return snapshot;
  });
}

async function readBindings(root: string): Promise<{ bindings: TraceBinding[]; warnings: string[] }> {
  let directory: string;
  try { directory = await safeDirectory(root, ".boulder/trace-state/bindings"); }
  catch (error) { if (isMissingPath(error)) return { bindings: [], warnings: [] }; throw error; }
  const bindings: TraceBinding[] = [];
  const warnings: string[] = [];
  for (const name of (await readdir(directory)).filter((name) => name.endsWith(".json")).sort()) {
    try {
      bindings.push(await readBindingEntry(root, name));
    } catch (error) {
      // One corrupt or unreadable entry degrades the list, never the API:
      // report it as a warning and keep serving the verified remainder.
      warnings.push(`${name}: ${bindingWarningCode(error)}`);
    }
  }
  return { bindings, warnings };
}

/** Stable diagnostic codes only: raw error messages can carry absolute paths
 * (ENOENT between readdir and open, EACCES, ...), and warnings go out over HTTP. */
function bindingWarningCode(error: unknown): string {
  if (error instanceof Error) {
    const code = Reflect.get(error, "code");
    if (typeof code === "string" && /^[A-Za-z0-9_.]+$/.test(code)) return code;
    if (/^trace\.[a-z_]+$/.test(error.message)) return error.message;
  }
  return "trace.binding_unreadable";
}

async function readBindingEntry(root: string, name: string): Promise<TraceBinding> {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true })
      .decode(await safeRead(root, `.boulder/trace-state/bindings/${name}`)));
    // Keep the HTTP read path free of bindings.ts's writer/SQLite imports.
    // Locator-only selected events are valid (native logical IDs are optional).
    if (!isRecord(value) || value.schemaVersion !== "boulder.trace.binding.v1"
      || typeof value.binding_id !== "string" || name !== `${value.binding_id}.json`
      || typeof value.journal_id !== "string" || typeof value.snapshot_id !== "string"
      || typeof value.snapshot_digest !== "string" || !/^[a-f0-9]{64}$/.test(value.snapshot_digest)
      || typeof value.boulder_command_run_id !== "string" || value.binding_basis !== "operator_explicit"
      || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))
      || !Array.isArray(value.selected_events) || value.selected_events.length === 0
      || !value.selected_events.every((event) => isRecord(event) && typeof event.source_row_key === "string"
        && typeof event.source_revision === "string" && /^[a-f0-9]{64}$/.test(event.source_revision)
        && (event.logical_event_id === undefined || typeof event.logical_event_id === "string"))) throw new Error("trace.binding_invalid");
    const { binding_id, createdAt, ...content } = value;
    if (await sourceRevisionForDecodedEvent(content) !== binding_id) throw new Error("trace.binding_digest_mismatch");
    return value as TraceBinding;
}

async function safeDirectory(root: string, relative: string): Promise<string> {
  let path = root;
  for (const component of ["", ...relative.split("/").filter(Boolean)]) {
    if (component === "." || component === ".." || component.includes("\\")) throw new TraceCommitError("trace.journal_path_unsafe");
    path = resolve(path, component);
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new TraceCommitError("trace.journal_path_unsafe");
  }
  return path;
}
async function safeRead(root: string, relative: string): Promise<Uint8Array> {
  const parts = relative.split("/");
  const name = parts.pop()!;
  if (!name || name === "." || name === ".." || name.includes("\\")) throw new TraceCommitError("trace.journal_path_unsafe");
  const directory = await safeDirectory(root, parts.join("/"));
  const path = resolve(directory, name);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new TraceCommitError("trace.journal_path_unsafe");
  const handle = await open(path, constants.O_RDONLY | noFollowFlag());
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1) throw new TraceCommitError("trace.journal_path_unsafe");
    return await handle.readFile();
  } finally { await handle.close(); }
}

/** Installed module location, never target --cwd; supports src and bundled bin. */
async function findStaticRoot(): Promise<string | null> {
  for (let current = import.meta.dir; ; current = dirname(current)) {
    try { return await safeDirectory(current, "packages/trace-ui/dist"); }
    catch (error) { if (!isMissingPath(error)) throw error; }
    if (dirname(current) === current) return null;
  }
}

/** Trusted bundled files only. Transcript strings are served exclusively as JSON. */
export async function serveStatic(pathname: string, installedRoot?: string): Promise<Response | null> {
  const root = installedRoot ?? await findStaticRoot();
  if (!root) return null;
  const name = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!/^[A-Za-z0-9_./-]+\.(?:html|js|css|svg|png|ico|woff2)$/.test(name)
    || name.split("/").some((part) => !part || part === "." || part === "..")
    || (name.endsWith(".html") && name !== "index.html")) return null;
  const types: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8",
    css: "text/css; charset=utf-8", svg: "image/svg+xml", png: "image/png", ico: "image/x-icon", woff2: "font/woff2" };
  let bytes: Uint8Array;
  try { bytes = await safeRead(root, name); }
  catch (error) { if (isMissingPath(error)) return null; throw error; }
  return new Response(new Uint8Array(bytes), { headers: { ...securityHeaders,
    "Content-Type": types[name.split(".").pop()!],
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  } });
}
