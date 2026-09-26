// Doctor opens its SQLite handle through src/trace/openclaw-adapter.ts
// (openOpenClawSourceReadOnly), so no bun:sqlite import is needed here; this
// repo hand-rolls its globals (src/globals.d.ts) and does not vendor
// bun-types, so the handle surface doctor relies on is typed structurally
// below (same pattern as the adapter).
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { formatLines, prettyJson } from "./cli-format";
import { optionValue, type CliOptions } from "./cli-options";
import { unlockStale, WriterLockError } from "./evidence-write-lock";
import { collectSession, TraceCollectError, type CollectReport } from "./trace/collect";
import { linkTrace, TraceBindingError, type LinkReport } from "./trace/bindings";
import { TraceCommitError } from "./trace/journal";
import {
  BoundedAcquisitionError, decodeTranscriptPayload, OpenClawSourceOpenError,
  OPENCLAW_INTERPRETATION_VERSION, openOpenClawSourceReadOnly,
  probeOpenClawHandle, readTranscriptRowValues,
  SessionNotFoundError, transcriptColumnsExact, transcriptEncodedBytes,
  TRANSCRIPT_EVENTS_TABLE, transcriptPrimaryKeyMatches, UnsupportedSchemaError,
  type SchemaFingerprint
} from "./trace/openclaw-adapter";
import { DEFAULT_ADAPTER_ID, SourceConfigNotFoundError } from "./trace/source-config";
import { verifyJournal, type TraceVerifyReport } from "./trace/verify";

type SqliteStatement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  iterate(...params: unknown[]): Iterable<unknown>;
};

type SqliteDatabase = {
  query(sql: string): SqliteStatement;
  close(throwOnError?: boolean): void;
};

// Adapter interpretation version is owned by the acquisition adapter
// (src/trace/openclaw-adapter.ts): bumped only with an explicit, versioned
// compatibility rule change for the admitted transcript format (plan v2 B2).
export { OPENCLAW_INTERPRETATION_VERSION };

// Doctor's diagnostic scan bounds. Collect uses the adapter's explicit
// DEFAULT_ACQUISITION_LIMITS and reports those bounds in its own result.
export const TRACE_COLLECTION_LIMITS = {
  maxRows: 1000,
  maxEncodedBytes: 8 * 1024 * 1024,
  maxDecodedBytes: 16 * 1024 * 1024,
  queryWaitMs: 1000
} as const;

type TraceCommandOptions = Pick<CliOptions, "cwd" | "dryRun" | "json">;

type ColumnInfo = {
  readonly name: string;
  readonly type: string;
  readonly pk: number;
};

type TraceDoctorReport = {
  readonly schemaVersion: "boulder.trace.doctor.v1";
  readonly source: string;
  readonly adapter: {
    readonly adapter_id: string;
    readonly interpretation_version: string;
  };
  readonly mode: "dry-run" | "read-only";
  readonly db: {
    readonly path: string;
    readonly exists: boolean;
    readonly opened_readonly: boolean;
    readonly journal_mode: string | null;
    readonly wal_file_present: boolean;
    readonly wal_mode: boolean;
  };
  readonly schema: {
    readonly fingerprint: string;
    readonly tables: readonly { readonly name: string; readonly columns: readonly ColumnInfo[] }[];
    readonly transcript_events_columns_exact: boolean;
    readonly transcript_events_primary_key: boolean;
  } | null;
  readonly payloads: {
    readonly rows_scanned: number;
    readonly plain: number;
    readonly zstd: number;
    readonly both_set: number;
    readonly both_null: number;
    readonly decode_errors: number;
    // Encoded bytes read into memory across scanned rows, under the adapter's
    // shared accounting (both payload columns summed on both-set rows).
    readonly encoded_bytes: number;
    readonly truncated: boolean;
  } | null;
  readonly evidence: {
    readonly timing: { readonly available: boolean; readonly rows: number };
    readonly usage: { readonly available: boolean; readonly rows: number };
    readonly linking: { readonly available: boolean; readonly rows: number };
  } | null;
  readonly limits: typeof TRACE_COLLECTION_LIMITS;
  readonly verdict: "admit" | "refuse";
  readonly reasons: readonly string[];
};

export async function runTraceCommand(commandArgs: readonly string[], options: TraceCommandOptions, rawArgs: readonly string[] = commandArgs): Promise<boolean> {
  if (commandArgs[0] !== "trace") return false;
  if (commandArgs[1] === undefined) {
    printTraceHelp();
    return true;
  }
  // All subcommands read raw argv uniformly: global value flags like --run-id
  // are stripped from commandArgs by cli.ts, so a mixed convention would let
  // flag sets diverge per subcommand. Dispatch still uses stripped commandArgs.
  if (commandArgs[1] === "doctor") {
    await runTraceDoctor(rawArgs, options);
    return true;
  }
  if (commandArgs[1] === "collect") {
    await runTraceCollect(rawArgs, options);
    return true;
  }
  if (commandArgs[1] === "link") {
    await runTraceLink(rawArgs, options);
    return true;
  }
  if (commandArgs[1] === "verify") {
    await runTraceVerify(rawArgs, options);
    return true;
  }
  if (commandArgs[1] === "serve") {
    await runTraceServe(rawArgs, options);
    return true;
  }
  if (commandArgs[1] === "unlock") {
    await runTraceUnlock(rawArgs, options);
    return true;
  }
  return false;
}

export function printTraceHelp(): void {
  console.log([
    "boulder trace",
    "",
    "Usage:",
    "  boulder trace doctor --source openclaw-local --db-path path [--cwd path] [--json]",
    "  boulder trace collect --source openclaw-local --session id --once --dry-run|--write [--db-path path] [--cwd path] [--json]",
    "  boulder trace verify --strict [--cwd path] [--json] (no head: empty PASS; read-only)",
    "  boulder trace serve --host 127.0.0.1 --port 4319 [--cwd path]",
    "  boulder trace link --snapshot id --from-event a --to-event b --run-id uuid --dry-run|--write [--cwd path] [--json]",
    '    Events: logical/native ID or JSON source locator ["session-id",seq]; inclusive snapshot order.',
    "  boulder trace unlock --confirm [--nonce <n>] [--cwd path] [--json]"
  ].join("\n"));
}

async function runTraceServe(args: readonly string[], options: TraceCommandOptions): Promise<void> {
  try {
    if (options.dryRun || args.includes("--write")) throw new Error("Serve is read-only; omit --dry-run and --write.");
    const host = optionValue(args, "--host") ?? "127.0.0.1";
    const portText = optionValue(args, "--port") ?? "4319";
    if ((args.includes("--host") && !optionValue(args, "--host"))
      || (args.includes("--port") && !optionValue(args, "--port")) || !/^\d+$/.test(portText)) {
      throw new Error("Use --host 127.0.0.1 --port <0-65535>.");
    }
    const { loadSourceConfig } = await import("./trace/source-config");
    // Resolve registration, without opening its SQLite path. An empty journal
    // can still be viewed before first collection; it publishes an empty list.
    await loadSourceConfig(options.cwd);
    const { startTraceServer } = await import("./trace/server");
    const server = await startTraceServer({ root: options.cwd, host, port: Number(portText), serveStatic: true });
    const signals = process as unknown as {
      once(signal: string, listener: () => void): void;
      removeListener(signal: string, listener: () => void): void;
    };
    let stop!: () => void;
    const stopped = new Promise<void>((resolve) => { stop = resolve; });
    signals.once("SIGINT", stop);
    signals.once("SIGTERM", stop);
    const url = `http://127.0.0.1:${server.port}`;
    console.log(options.json ? prettyJson({ url }) : `Boulder trace: ${url}`);
    try { await stopped; }
    finally {
      signals.removeListener("SIGINT", stop);
      signals.removeListener("SIGTERM", stop);
      await server.stop(true);
    }
  } catch (error) {
    console.error(`ERROR trace.serve_failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

async function runTraceLink(args: readonly string[], options: TraceCommandOptions): Promise<void> {
  try {
    if (options.dryRun === args.includes("--write")) {
      throw new TraceBindingError("trace.link_mode_required", "Choose exactly one of --dry-run or --write.");
    }
    const required = (flag: string): string => {
      const value = optionValue(args, flag)?.trim();
      if (!value) throw new TraceBindingError("trace.link_argument_required", `${flag} requires a value.`);
      return value;
    };
    const report = await linkTrace(options.cwd, {
      snapshotId: required("--snapshot"), fromEvent: required("--from-event"),
      toEvent: required("--to-event"), runId: required("--run-id"), dryRun: options.dryRun
    });
    console.log(options.json ? prettyJson(report) : formatLinkLines(report));
  } catch (error) {
    const code = error instanceof TraceBindingError || error instanceof TraceCommitError || error instanceof WriterLockError
      ? error.code : "trace.link_failed";
    console.error(`ERROR ${code}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

function formatLinkLines(report: LinkReport): string {
  return formatLines("Boulder trace link", [
    `mode: ${report.mode}; status: ${report.status}`,
    `binding: ${report.binding.binding_id}; path: ${report.binding_path}`,
    `snapshot: ${report.binding.snapshot_id}; digest: ${report.binding.snapshot_digest}`,
    `command-run: ${report.binding.boulder_command_run_id}; basis: operator_explicit`,
    `span coverage: ${report.span_coverage.selected_input_count}/${report.span_coverage.snapshot_input_count} snapshot inputs (inclusive); execution span coverage: unavailable`,
    ...report.binding.selected_events.map((event) => `event: ${event.logical_event_id ?? event.source_row_key}; locator: ${event.source_row_key}; revision: ${event.source_revision}`)
  ]);
}

async function runTraceCollect(args: readonly string[], options: TraceCommandOptions): Promise<void> {
  try {
    if (args.some((arg) => /^--(?:follow|live)(?:=|$)/.test(arg)) || !args.includes("--once")) {
      throw new TraceCollectError("trace.once_required", "Collection supports only --once; --follow and --live are not supported.");
    }
    if (options.dryRun === args.includes("--write")) {
      throw new TraceCollectError("trace.collect_mode_required", "Choose exactly one of --dry-run or --write.");
    }
    const source = optionValue(args, "--source") ?? DEFAULT_ADAPTER_ID;
    if (source !== DEFAULT_ADAPTER_ID || (args.includes("--source") && !optionValue(args, "--source"))) {
      throw new TraceCollectError("trace.source_unknown", `Supported trace source: ${DEFAULT_ADAPTER_ID}.`);
    }
    const sessionId = optionValue(args, "--session");
    if (!sessionId?.trim()) throw new TraceCollectError("trace.session_required", "Use trace collect --session <id>.");
    const dbPath = optionValue(args, "--db-path");
    if (args.includes("--db-path") && !dbPath?.trim()) {
      throw new TraceCollectError("trace.db_path_required", "--db-path requires a database path.");
    }
    const report = await collectSession(options.cwd, { sessionId, dbPath: dbPath ?? undefined, dryRun: options.dryRun });
    console.log(options.json ? prettyJson(report) : formatCollectLines(report));
    if (!report.complete) {
      console.error(`ERROR trace.quarantined: Snapshot ${report.snapshot_id} ${report.mode === "dry-run" ? "would contain" : "contains"} quarantined rows: ${report.reasons.join(", ")}.`);
      process.exitCode = 1;
    }
  } catch (error) {
    const code = error instanceof WriterLockError || error instanceof TraceCommitError || error instanceof TraceCollectError ? error.code
      : error instanceof SessionNotFoundError ? "trace.session_not_found"
      : error instanceof SourceConfigNotFoundError ? "trace.source_config_required"
      : error instanceof UnsupportedSchemaError ? "trace.unsupported_schema"
      : error instanceof OpenClawSourceOpenError ? "trace.source_open_failed"
      : error instanceof BoundedAcquisitionError ? "trace.acquisition_limit"
      : "trace.collect_failed";
    console.error(`ERROR ${code}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

function formatCollectLines(report: CollectReport): string {
  return formatLines("Boulder trace collect", [
    `mode: ${report.mode}; status: ${report.status}; complete: ${report.complete}`,
    `session: ${report.session_id}; source: ${report.source_instance_id}; agent: unavailable`,
    `inputs: ${report.input_count}; normalized: ${report.disposition_counts.normalized}; ignored: ${report.disposition_counts.ignored}; quarantined: ${report.disposition_counts.quarantined}`,
    `coverage: ${report.coverage.kind} (${report.coverage.input_count} inputs)`,
    `snapshot: ${report.snapshot_id}; digest: ${report.snapshot_digest}`,
    `supersedes: ${report.supersedes_snapshot_id ?? "none"}; segment-seq: ${report.segment_seq}${report.mode === "dry-run" && report.status !== "no-op" ? " (proposed)" : ""}`,
    ...report.reasons.map((reason) => `reason: ${reason}`)
  ]);
}

async function runTraceVerify(args: readonly string[], options: TraceCommandOptions): Promise<void> {
  if (!args.includes("--strict")) {
    console.error("ERROR trace.strict_required: Use trace verify --strict.");
    process.exitCode = 1;
    return;
  }
  const report = await verifyJournal(options.cwd);
  console.log(options.json ? prettyJson(report) : formatVerifyLines(report));
  if (report.verdict === "fail") process.exitCode = 1;
}

function formatVerifyLines(report: TraceVerifyReport): string {
  const counts = report.source_coverage.disposition_counts;
  return formatLines("Boulder trace verify", [
    `verdict: ${report.verdict.toUpperCase()}; status: ${report.status}`,
    `journal_integrity: ${report.journal_integrity.verdict}; segments: ${report.journal_integrity.segments_checked}; records: ${report.journal_integrity.records_checked}`,
    `source_coverage: ${report.source_coverage.verdict}; snapshots: ${report.source_coverage.snapshots_checked}; inputs: ${report.source_coverage.input_count}; cold history: not collected`,
    `dispositions (all committed snapshots): normalized ${counts.normalized}; ignored ${counts.ignored}; quarantined ${counts.quarantined}`,
    `telemetry_fidelity: ${report.telemetry_fidelity.verdict}; current timestamps available: ${report.telemetry_fidelity.timestamps_available}; unavailable: ${report.telemetry_fidelity.timestamps_unavailable}; unknown-scope usage: ${report.telemetry_fidelity.usage_scope_unknown}`,
    ...(report.status === "empty" ? ["No published head; empty journal PASS does not establish source coverage or telemetry fidelity."] : []),
    ...report.failed_checks.map((failure) => `FAIL ${failure.check}: ${failure.message}${failure.fileName ? ` [${failure.fileName}]` : ""}${failure.snapshot_id ? ` [snapshot ${failure.snapshot_id}]` : ""}`)
  ]);
}

async function runTraceUnlock(args: readonly string[], options: TraceCommandOptions): Promise<void> {
  const nonce = optionValue(args, "--nonce");
  if (args.includes("--nonce") && (!nonce || !/^[a-f0-9]{32}$/.test(nonce))) {
    console.error("ERROR trace.unlock_nonce_invalid: --nonce requires a 32-character lowercase hex nonce.");
    process.exitCode = 1;
    return;
  }
  if (options.dryRun) {
    console.error("ERROR trace.unlock_dry_run: Unlock cannot be combined with --dry-run. Omit --confirm to inspect without removing.");
    process.exitCode = 1;
    return;
  }
  try {
    await unlockStale(options.cwd, {
      confirm: args.includes("--confirm"),
      expectNonce: nonce ?? undefined,
      onOwner(owner) {
        console.log(options.json ? prettyJson({ owner }) : formatLines("Boulder trace unlock", [`owner: ${JSON.stringify(owner)}`]));
      }
    });
    if (!options.json) console.log("Writer lock removed.");
  } catch (error) {
    const code = error instanceof WriterLockError ? error.code : "trace.writer_unlock_failed";
    console.error(`ERROR ${code}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

async function runTraceDoctor(args: readonly string[], options: TraceCommandOptions): Promise<void> {
  const source = optionValue(args, "--source") ?? DEFAULT_ADAPTER_ID;
  if (source !== DEFAULT_ADAPTER_ID) {
    console.error(`ERROR trace.source_unknown: Unsupported trace source "${source}". Supported: ${DEFAULT_ADAPTER_ID}.`);
    process.exitCode = 1;
    return;
  }
  const dbPathFlag = optionValue(args, "--db-path");
  if (!dbPathFlag) {
    console.error("ERROR trace.db_path_required: Use trace doctor --db-path path.");
    process.exitCode = 1;
    return;
  }
  const dbPath = dbPathFlag.startsWith("/") ? dbPathFlag : resolve(options.cwd, dbPathFlag);
  if (!await pathExists(dbPath)) {
    console.error(`ERROR trace.db_missing: Trace database not found at ${dbPath}.`);
    process.exitCode = 1;
    return;
  }
  const report = await inspectTraceDatabase(dbPath, source, options);
  if (options.json) {
    console.log(prettyJson(report));
  } else {
    console.log(formatDoctorLines(report));
  }
  if (report.verdict === "refuse") {
    process.exitCode = 1;
  }
}

async function inspectTraceDatabase(dbPath: string, source: string, options: TraceCommandOptions): Promise<TraceDoctorReport> {
  const reasons: string[] = [];
  let db: SqliteDatabase | null = null;
  let openedReadonly = false;
  let journalMode: string | null = null;
  let schema: TraceDoctorReport["schema"] = null;
  let payloads: TraceDoctorReport["payloads"] = null;
  let evidence: TraceDoctorReport["evidence"] = null;
  try {
    // ONE connection for the whole inspection, opened under the adapter's
    // read-only policy; admission is the adapter's OWN probe run on that same
    // handle, so doctor can never admit a database collect would refuse.
    db = openOpenClawSourceReadOnly(dbPath);
    openedReadonly = true;
    const probe = probeOpenClawHandle(db);
    for (const reason of probe.reasons) reasons.push(`schema_mismatch: ${reason}`);
    schema = doctorSchema(probe.fingerprint);
    journalMode = journalModeOf(db);
    if (probe.admitted) {
      const scan = await scanPayloads(db);
      payloads = scan.payloads;
      evidence = scan.evidence;
    }
  } catch (error) {
    reasons.push(`sqlite_unreadable: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    db?.close(false);
  }
  const walFilePresent = await pathExists(`${dbPath}-wal`);
  return {
    schemaVersion: "boulder.trace.doctor.v1",
    source,
    adapter: { adapter_id: DEFAULT_ADAPTER_ID, interpretation_version: OPENCLAW_INTERPRETATION_VERSION },
    mode: options.dryRun ? "dry-run" : "read-only",
    db: {
      path: dbPath,
      exists: true,
      opened_readonly: openedReadonly,
      journal_mode: journalMode,
      wal_file_present: walFilePresent,
      wal_mode: journalMode === "wal" || walFilePresent
    },
    schema,
    payloads,
    evidence,
    limits: TRACE_COLLECTION_LIMITS,
    verdict: reasons.length === 0 ? "admit" : "refuse",
    reasons
  };
}

function journalModeOf(db: SqliteDatabase): string | null {
  const row = db.query("PRAGMA journal_mode").get() as { journal_mode?: unknown } | undefined;
  return typeof row?.journal_mode === "string" ? row.journal_mode : null;
}

// Report the adapter's schema fingerprint verbatim: the same columnSetHash and
// the same column/PK predicates the admission gate uses.
function doctorSchema(fingerprint: SchemaFingerprint): NonNullable<TraceDoctorReport["schema"]> {
  const transcript = fingerprint.transcriptEventsColumns;
  return {
    fingerprint: fingerprint.columnSetHash,
    tables: fingerprint.tables.map((name) => ({
      name,
      columns: name === TRANSCRIPT_EVENTS_TABLE && transcript !== null
        ? transcript.map((column) => ({ name: column.name, type: column.declaredType, pk: column.primaryKeyPosition }))
        : []
    })),
    transcript_events_columns_exact: transcriptColumnsExact(transcript),
    transcript_events_primary_key: transcriptPrimaryKeyMatches(transcript)
  };
}

// Streaming scan over the admitted table under doctor's smaller bounds; the
// adapter's typed read + decode path is shared, and byte accounting uses UTF-8
// byte length, not string length (UTF-16 code units undercount).
async function scanPayloads(db: SqliteDatabase): Promise<{ payloads: NonNullable<TraceDoctorReport["payloads"]>; evidence: NonNullable<TraceDoctorReport["evidence"]> }> {
  let plain = 0;
  let zstd = 0;
  let bothSet = 0;
  let bothNull = 0;
  let decodeErrors = 0;
  let timingRows = 0;
  let usageRows = 0;
  let linkingRows = 0;
  let scanned = 0;
  let encodedBytes = 0;
  let decodedBytes = 0;
  let truncated = false;
  const statement = db.query(
    `SELECT seq, event_json, event_zstd, event_utf8_bytes,
            length(CAST(event_json AS BLOB)) AS event_json_bytes,
            length(event_zstd) AS event_zstd_bytes
     FROM ${TRANSCRIPT_EVENTS_TABLE}
     ORDER BY session_id, seq
     LIMIT ${TRACE_COLLECTION_LIMITS.maxRows + 1}`
  );
  for (const value of statement.iterate()) {
    if (scanned >= TRACE_COLLECTION_LIMITS.maxRows
      || encodedBytes >= TRACE_COLLECTION_LIMITS.maxEncodedBytes
      || decodedBytes >= TRACE_COLLECTION_LIMITS.maxDecodedBytes) {
      truncated = true;
      break;
    }
    scanned += 1;
    const raw = value as Record<string, unknown>;
    const values = readTranscriptRowValues(raw);
    const hasJson = values.eventJson !== null;
    const hasZstd = values.eventZstd !== null;
    if (hasJson && hasZstd) bothSet += 1;
    if (!hasJson && !hasZstd) bothNull += 1;
    if (hasJson && !hasZstd) plain += 1;
    if (hasZstd && !hasJson) zstd += 1;
    // Shared encoded-byte accounting with acquisition: identical function,
    // identical result on every row shape (including both-set).
    encodedBytes += transcriptEncodedBytes(raw, values);
    const decoded = await decodeTranscriptPayload(values);
    if (decoded.decodeStatus.kind === "error") {
      decodeErrors += 1;
      continue;
    }
    decodedBytes += decoded.decodedBytes ?? 0;
    if (!isRecord(decoded.decodedJson)) {
      decodeErrors += 1;
      continue;
    }
    if (typeof decoded.decodedJson["ts"] === "string") timingRows += 1;
    if (isRecord(decoded.decodedJson["usage"])) usageRows += 1;
    if (typeof decoded.decodedJson["requestId"] === "string") linkingRows += 1;
  }
  return {
    payloads: {
      rows_scanned: scanned,
      plain,
      zstd,
      both_set: bothSet,
      both_null: bothNull,
      decode_errors: decodeErrors,
      encoded_bytes: encodedBytes,
      truncated
    },
    evidence: {
      timing: { available: timingRows > 0, rows: timingRows },
      usage: { available: usageRows > 0, rows: usageRows },
      linking: { available: linkingRows > 0, rows: linkingRows }
    }
  };
}

function formatDoctorLines(report: TraceDoctorReport): string {
  const lines = [
    `source: ${report.source}`,
    `adapter: ${report.adapter.adapter_id} (interpretation_version ${report.adapter.interpretation_version})`,
    `mode: ${report.mode}`,
    `db: ${report.db.path} (exists: ${report.db.exists}, readonly-open: ${report.db.opened_readonly})`,
    `journal-mode: ${report.db.journal_mode ?? "unknown"} (wal-file: ${report.db.wal_file_present}, wal-mode: ${report.db.wal_mode})`
  ];
  if (report.schema) {
    lines.push(`schema-fingerprint: ${report.schema.fingerprint}`);
    for (const table of report.schema.tables) {
      lines.push(table.columns.length === 0 ? `table: ${table.name}`
        : `table: ${table.name} (${table.columns.map((column) => `${column.name} ${column.type}${column.pk > 0 ? " pk" : ""}`).join(", ")})`);
    }
  }
  if (report.payloads) {
    lines.push(`payloads: plain ${report.payloads.plain}, zstd ${report.payloads.zstd}, both-set ${report.payloads.both_set}, both-null ${report.payloads.both_null}, decode-errors ${report.payloads.decode_errors}, rows-scanned ${report.payloads.rows_scanned}, encoded-bytes ${report.payloads.encoded_bytes}${report.payloads.truncated ? " (truncated)" : ""}`);
  }
  if (report.evidence) {
    lines.push(`evidence: timing ${report.evidence.timing.rows} rows, usage ${report.evidence.usage.rows} rows, linking ${report.evidence.linking.rows} rows`);
  }
  lines.push(`limits: max-rows ${report.limits.maxRows}, max-encoded-bytes ${report.limits.maxEncodedBytes}, max-decoded-bytes ${report.limits.maxDecodedBytes}, query-wait-ms ${report.limits.queryWaitMs}`);
  lines.push(`verdict: ${report.verdict}`);
  for (const reason of report.reasons) {
    lines.push(`reason: ${reason}`);
  }
  return formatLines("Boulder trace doctor", lines);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
