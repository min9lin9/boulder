// OpenClaw read-only acquisition adapter (plan v2 B2/B3, todo 3).
//
// Acquires ONE session from an installed openclaw-agent.sqlite in ONE read
// transaction, under configured bounds, and returns FACTS ONLY: schema
// fingerprint, admission verdict, session metadata, and the complete row
// inventory with locator/encoding/decoded bytes/decode status. Normalization
// and per-row dispositions live in a separate module (todo 8).
//
// Guarantees:
// - The source DB is opened read-only with create:false: a missing path
//   errors, it is never created, and the adapter never writes to the source.
// - Unknown schema is REFUSED with a distinct UnsupportedSchemaError; it is
//   never treated as an empty source.
// - Over-limit acquisition throws BoundedAcquisitionError naming the bound;
//   payload bytes are never silently truncated.
// - No async or fs work happens inside the synchronous transaction callback:
//   bounded payload bytes are copied into owned memory inside the txn and
//   zstd decoding happens after it closes.

// bun:sqlite is a Bun builtin. This repo hand-rolls its globals (src/globals.d.ts)
// and does not vendor bun-types, so the import is suppressed once here and the
// surface the adapter relies on is typed structurally below.
// @ts-expect-error -- bun:sqlite types are not vendored in this repo.
import { Database } from "bun:sqlite";
import { DEFAULT_ADAPTER_ID } from "./source-config";

export const OPENCLAW_INTERPRETATION_VERSION = "openclaw-local.interpretation.v1";

export const TRANSCRIPT_EVENTS_TABLE = "transcript_events";

// Documented-claim schema (docs/trace/openclaw-admission.md section 1):
// transcript_events(session_id, seq, event_json, event_zstd, event_utf8_bytes)
// with PRIMARY KEY (session_id, seq). Admission requires exactly this column
// set and PK; extra unrelated tables are tolerated and recorded.
export const EXPECTED_TRANSCRIPT_COLUMNS = [
  "session_id",
  "seq",
  "event_json",
  "event_zstd",
  "event_utf8_bytes"
] as const;

type BunCompression = {
  zstdDecompress(data: Uint8Array): Promise<Uint8Array>;
};

const bunRuntime = (globalThis as unknown as { Bun: BunCompression }).Bun;

type SqliteStatement = {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  // Row-by-row iteration: transcript payloads can be large, so acquisition
  // streams rows inside the transaction and aborts as soon as a bound trips
  // instead of materializing the whole session first.
  iterate(...params: unknown[]): Iterable<unknown>;
};

type SqliteDatabase = {
  query(sql: string): SqliteStatement;
  exec(sql: string): void;
  transaction<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult): (...args: TArgs) => TResult;
  close(): void;
};

export type ColumnFingerprint = {
  readonly name: string;
  readonly declaredType: string;
  readonly notNull: boolean;
  // SQLite PRAGMA table_info pk value: 0 = not in PK, otherwise 1-based
  // position within the primary key.
  readonly primaryKeyPosition: number;
};

export type SchemaFingerprint = {
  // Sorted table names; extra tables unrelated to transcript_events are
  // tolerated by admission and recorded here.
  readonly tables: readonly string[];
  // Null when transcript_events is absent entirely.
  readonly transcriptEventsColumns: readonly ColumnFingerprint[] | null;
  // SHA-256 hex over the normalized column descriptors (name|TYPE|notnull|pk
  // position, sorted by name); empty string when the table is absent.
  readonly columnSetHash: string;
  readonly userVersion: number;
  readonly applicationId: number;
};

export type AdmissionVerdict = {
  readonly admitted: boolean;
  readonly reasons: readonly string[];
  readonly fingerprint: SchemaFingerprint;
};

export type AcquisitionBound = "rows" | "encoded_bytes_per_row" | "total_decoded_bytes" | "query_wait";

export type AcquisitionLimits = {
  readonly maxRows: number;
  readonly maxEncodedBytesPerRow: number;
  readonly maxTotalDecodedBytes: number;
  readonly queryWaitMs: number;
};

export const DEFAULT_ACQUISITION_LIMITS: AcquisitionLimits = {
  maxRows: 100_000,
  maxEncodedBytesPerRow: 16 * 1024 * 1024,
  maxTotalDecodedBytes: 256 * 1024 * 1024,
  queryWaitMs: 5_000
};

// The configured path could not be opened read-only (missing file,
// unreadable, not a database). Never a create-on-missing outcome.
export class OpenClawSourceOpenError extends Error {
  readonly dbPath: string;

  constructor(dbPath: string, cause: unknown) {
    super(`Cannot open OpenClaw source at ${dbPath} read-only: ${causeMessage(cause)}. The file must exist; it is never created.`);
    this.name = "OpenClawSourceOpenError";
    this.dbPath = dbPath;
  }
}

// Distinct refusal for an unknown/divergent schema: the fingerprint and the
// human-readable reasons travel with the error. An unknown schema is never
// treated as an empty source.
export class UnsupportedSchemaError extends Error {
  readonly fingerprint: SchemaFingerprint;
  readonly reasons: readonly string[];

  constructor(dbPath: string, fingerprint: SchemaFingerprint, reasons: readonly string[]) {
    super(`OpenClaw source at ${dbPath} refused: unsupported schema (${reasons.join("; ")}). This is not an empty source.`);
    this.name = "UnsupportedSchemaError";
    this.fingerprint = fingerprint;
    this.reasons = reasons;
  }
}

// A configured acquisition bound was hit. `bound` names which one; acquisition
// aborts rather than truncating.
export class BoundedAcquisitionError extends Error {
  readonly bound: AcquisitionBound;

  constructor(bound: AcquisitionBound, detail: string) {
    super(`Bounded acquisition refused: ${detail}`);
    this.name = "BoundedAcquisitionError";
    this.bound = bound;
  }
}

export class SessionNotFoundError extends Error {
  readonly sessionId: string;

  constructor(dbPath: string, sessionId: string) {
    super(`Session "${sessionId}" has no transcript_events rows in ${dbPath}.`);
    this.name = "SessionNotFoundError";
    this.sessionId = sessionId;
  }
}

export type RowLocator = {
  readonly session_id: string;
  readonly seq: number;
};

export type RowEncoding = "plain" | "zstd" | "invalid";

export type RowDecodeStatus =
  | { readonly kind: "ok" }
  | {
      readonly kind: "error";
      // encoding: both payload columns set or both NULL (admission rule 3).
      // decompress: zstd payload failed to decode (e.g. truncated bytes).
      // column_type: a stored column value violated the admitted declared type
      // (e.g. non-numeric seq/event_utf8_bytes, event_json stored as a blob).
      // length_mismatch: decoded byte length != event_utf8_bytes (admission rule 4).
      // parse: decoded text is not parseable JSON.
      readonly stage: "encoding" | "decompress" | "column_type" | "length_mismatch" | "parse";
      readonly reason: string;
    };

export type AcquiredRow = {
  readonly locator: RowLocator;
  readonly encoding: RowEncoding;
  // event_utf8_bytes as stored (the declared decoded length).
  readonly declaredUtf8Bytes: number;
  // Stored size read into memory: event_json UTF-8 bytes plus event_zstd
  // blob bytes; when both columns are set (encoding-invalid) BOTH count.
  readonly encodedBytes: number;
  // Actual decoded UTF-8 byte length; null when decoding failed.
  readonly decodedBytes: number | null;
  // Owned copy of the decoded text; null when decoding failed.
  readonly decodedText: string | null;
  // JSON.parse of decodedText; null when decode or parse failed.
  readonly decodedJson: unknown;
  readonly decodeStatus: RowDecodeStatus;
};

export type AcquiredSessionMetadata = {
  readonly sessionId: string;
  readonly rowCount: number;
  // Null when no gathered row has a finite seq: column_type violations surface
  // as NaN locators and are skipped rather than corrupting the range.
  readonly minSeq: number | null;
  readonly maxSeq: number | null;
  readonly plainRowCount: number;
  readonly zstdRowCount: number;
  readonly invalidRowCount: number;
  readonly totalDeclaredUtf8Bytes: number;
  readonly totalEncodedBytes: number;
  readonly totalDecodedBytes: number;
};

export type OpenClawAcquisition = {
  readonly adapterId: string;
  readonly interpretationVersion: string;
  readonly fingerprint: SchemaFingerprint;
  readonly admission: AdmissionVerdict;
  readonly session: AcquiredSessionMetadata;
  readonly rows: readonly AcquiredRow[];
};

// Opens the source read-only, fingerprints the schema, closes, and returns the
// admit/refuse verdict. Never throws UnsupportedSchemaError - the verdict is
// the return value (used by doctor); acquireSession throws instead.
export async function probeOpenClawSource(dbPath: string): Promise<AdmissionVerdict> {
  const db = openReadOnly(dbPath);
  try {
    return probeOpenClawHandle(db);
  } finally {
    db.close();
  }
}

// Opens the source under the adapter's exact policy (read-only, create:false)
// and hands the handle to the caller. `trace doctor` uses this so the whole
// inspection - fingerprint, admission, payload scan - rides ONE connection
// instead of probing on one handle and scanning on a second.
export function openOpenClawSourceReadOnly(dbPath: string): SqliteDatabase {
  return openReadOnly(dbPath);
}

// Narrowest handle shape admission needs: read-only queries.
type ProbeDatabase = {
  query(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  };
};

// Fingerprint + admission on an already-open handle. Sharing this keeps
// doctor's verdict bit-identical to acquireSession's without a second open.
export function probeOpenClawHandle(db: ProbeDatabase): AdmissionVerdict {
  return admitFingerprint(fingerprintDatabase(db));
}

// Full acquisition of one session under bounded limits. Throws
// OpenClawSourceOpenError (unopenable path), UnsupportedSchemaError (unknown
// schema), SessionNotFoundError (no rows for the session), or
// BoundedAcquisitionError (a configured bound was hit).
export async function acquireSession(
  dbPath: string,
  sessionId: string,
  limits: AcquisitionLimits = DEFAULT_ACQUISITION_LIMITS
): Promise<OpenClawAcquisition> {
  validateLimits(limits);

  const db = openReadOnly(dbPath);
  try {
    db.exec(`PRAGMA busy_timeout = ${limits.queryWaitMs}`);

    const fingerprint = fingerprintDatabase(db);
    const admission = admitFingerprint(fingerprint);
    if (!admission.admitted) {
      throw new UnsupportedSchemaError(dbPath, fingerprint, admission.reasons);
    }

    // ONE read transaction: gather the complete row inventory for the session
    // and copy bounded payload bytes into owned memory. No async or fs work in
    // here; zstd decode + JSON parse happen after the transaction closes.
    const gathered = gatherRowsInTransaction(db, dbPath, sessionId, limits);
    const rows = await decodeRows(sessionId, gathered, limits);

    let plainRowCount = 0;
    let zstdRowCount = 0;
    let invalidRowCount = 0;
    let totalDecodedBytes = 0;
    let minSeq: number | null = null;
    let maxSeq: number | null = null;
    for (const row of rows) {
      if (row.encoding === "plain") plainRowCount += 1;
      else if (row.encoding === "zstd") zstdRowCount += 1;
      else invalidRowCount += 1;
      totalDecodedBytes += row.decodedBytes ?? 0;
      // Column_type violations surface as non-finite seq locators (NaN); skip
      // them so session metadata never carries NaN (which also sorts silently
      // to JSON null) instead of a real range.
      if (Number.isFinite(row.locator.seq)) {
        minSeq = minSeq === null ? row.locator.seq : Math.min(minSeq, row.locator.seq);
        maxSeq = maxSeq === null ? row.locator.seq : Math.max(maxSeq, row.locator.seq);
      }
    }

    return {
      adapterId: DEFAULT_ADAPTER_ID,
      interpretationVersion: OPENCLAW_INTERPRETATION_VERSION,
      fingerprint,
      admission,
      session: {
        sessionId,
        rowCount: rows.length,
        minSeq,
        maxSeq,
        plainRowCount,
        zstdRowCount,
        invalidRowCount,
        totalDeclaredUtf8Bytes: gathered.totalDeclaredUtf8Bytes,
        totalEncodedBytes: gathered.totalEncodedBytes,
        totalDecodedBytes
      },
      rows
    };
  } finally {
    db.close();
  }
}

export const EXPECTED_TRANSCRIPT_PRIMARY_KEY = "session_id,seq";

export function admitFingerprint(fingerprint: SchemaFingerprint): AdmissionVerdict {
  const reasons: string[] = [];
  const columns = fingerprint.transcriptEventsColumns;

  if (columns === null) {
    reasons.push(`missing table "${TRANSCRIPT_EVENTS_TABLE}"`);
  } else {
    const names = columns.map((column) => column.name);
    for (const expected of EXPECTED_TRANSCRIPT_COLUMNS) {
      if (!names.includes(expected)) {
        reasons.push(`missing column "${expected}" on ${TRANSCRIPT_EVENTS_TABLE}`);
      }
    }
    for (const name of names) {
      if (!(EXPECTED_TRANSCRIPT_COLUMNS as readonly string[]).includes(name)) {
        reasons.push(`unexpected column "${name}" on ${TRANSCRIPT_EVENTS_TABLE} (no versioned compatibility rule admits it)`);
      }
    }
    if (!transcriptPrimaryKeyMatches(columns)) {
      reasons.push(`primary key on ${TRANSCRIPT_EVENTS_TABLE} is (${transcriptPrimaryKeyOrder(columns) || "none"}), expected (${EXPECTED_TRANSCRIPT_PRIMARY_KEY})`);
    }
  }

  return { admitted: reasons.length === 0, reasons, fingerprint };
}

// Shared admission predicates, exported so `trace doctor` reports the adapter's
// exact checks instead of re-deriving them (column ORDER is irrelevant to both;
// the primary key must be exactly (session_id, seq) in that order).
export function transcriptColumnsExact(columns: readonly ColumnFingerprint[] | null): boolean {
  if (columns === null || columns.length !== EXPECTED_TRANSCRIPT_COLUMNS.length) return false;
  const names = columns.map((column) => column.name);
  return EXPECTED_TRANSCRIPT_COLUMNS.every((expected) => names.includes(expected));
}

export function transcriptPrimaryKeyOrder(columns: readonly ColumnFingerprint[] | null): string {
  return (columns ?? [])
    .filter((column) => column.primaryKeyPosition > 0)
    .sort((a, b) => a.primaryKeyPosition - b.primaryKeyPosition)
    .map((column) => column.name)
    .join(",");
}

export function transcriptPrimaryKeyMatches(columns: readonly ColumnFingerprint[] | null): boolean {
  return transcriptPrimaryKeyOrder(columns) === EXPECTED_TRANSCRIPT_PRIMARY_KEY;
}

function openReadOnly(dbPath: string): SqliteDatabase {
  try {
    return new Database(dbPath, { readonly: true, create: false }) as SqliteDatabase;
  } catch (error) {
    throw new OpenClawSourceOpenError(dbPath, error);
  }
}

function fingerprintDatabase(db: ProbeDatabase): SchemaFingerprint {
  const tableRows = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  const tables = tableRows.map((row) => row.name);

  let columns: ColumnFingerprint[] | null = null;
  if (tables.includes(TRANSCRIPT_EVENTS_TABLE)) {
    const infoRows = db.query(`PRAGMA table_info(${TRANSCRIPT_EVENTS_TABLE})`).all() as {
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }[];
    columns = infoRows.map((row) => ({
      name: row.name,
      declaredType: row.type.toUpperCase(),
      notNull: row.notnull !== 0,
      primaryKeyPosition: row.pk
    }));
  }

  const userVersionRow = db.query("PRAGMA user_version").get() as { user_version: number };
  const applicationIdRow = db.query("PRAGMA application_id").get() as { application_id: number };

  return {
    tables,
    transcriptEventsColumns: columns,
    columnSetHash: columns === null ? "" : columnSetHash(columns),
    userVersion: userVersionRow.user_version,
    applicationId: applicationIdRow.application_id
  };
}

// Normalized column set hash: stable across declaration ordering and type-name
// casing; identical schema -> identical hash. SHA-256 via Bun's native hasher,
// reached through globalThis because this repo's hand-rolled globals do not
// type it.
type BunCryptoHasher = {
  update(input: string): BunCryptoHasher;
  digest(encoding: "hex"): string;
};

function columnSetHash(columns: readonly ColumnFingerprint[]): string {
  const descriptors = columns
    .map((column) => `${column.name}|${column.declaredType}|${column.notNull ? 1 : 0}|pk=${column.primaryKeyPosition}`)
    .sort()
    .join("\n");
  const runtime = globalThis as unknown as { Bun: { CryptoHasher: new (algorithm: string) => BunCryptoHasher } };
  return new runtime.Bun.CryptoHasher("sha256").update(descriptors).digest("hex");
}

type GatheredRow = TranscriptPayload & {
  // Encoded-byte accounting as measured inside the transaction (SQL-side
  // lengths, both payload columns summed via transcriptEncodedBytes);
  // AcquiredRow carries it through so the reported number is identical to
  // what the bound enforced.
  readonly encodedBytes: number;
};

type GatheredInventory = {
  readonly rows: readonly GatheredRow[];
  readonly totalDeclaredUtf8Bytes: number;
  readonly totalEncodedBytes: number;
};

// The payload fields one transcript row contributes, after declared column
// types are checked. `doctor` consumes the same checks through
// readTranscriptRowValues/decodeTranscriptPayload instead of a looser copy.
export type TranscriptPayload = {
  readonly seq: number;
  readonly eventJson: string | null;
  readonly eventZstd: Uint8Array | null;
  readonly declaredUtf8Bytes: number;
  // Named violation when a stored value violates the admitted declared type;
  // the row is still gathered but decodes to a column_type quarantine.
  readonly columnTypeError: string | null;
};

const utf8Encoder = new TextEncoder();

// ONE encoded-byte accounting rule shared by acquisition bounds, the reported
// row/session totals, and doctor's payload scan: sum BOTH stored byte
// lengths. A row with both payload columns set is quarantined as
// encoding-invalid, but both values were still read into memory, so both
// count. `raw` must carry the query's event_json_bytes / event_zstd_bytes
// aliases: SQL-side length() is exact even when a stored value violates the
// declared column type (e.g. event_json stored as a blob). The UTF-8 fallback
// only covers an absent/zero SQL length for a present TEXT value.
export function transcriptEncodedBytes(
  raw: Record<string, unknown>,
  row: Pick<TranscriptPayload, "eventJson">
): number {
  const sqlJsonBytes = finite(raw["event_json_bytes"]);
  const jsonBytes = sqlJsonBytes > 0 || row.eventJson === null
    ? sqlJsonBytes
    : utf8Encoder.encode(row.eventJson).byteLength;
  return jsonBytes + finite(raw["event_zstd_bytes"]);
}

export type TranscriptPayloadDecode = {
  readonly encoding: RowEncoding;
  readonly declaredUtf8Bytes: number;
  readonly decodedBytes: number | null;
  readonly decodedText: string | null;
  readonly decodedJson: unknown;
  readonly decodeStatus: RowDecodeStatus;
};

// Type-checked read of one raw transcript_events row. SQLite dynamically types
// values, so a hostile or corrupted database can hand back values that violate
// the admitted schema's declared types; unchecked casts would silently bypass
// byte bounds (non-numeric event_utf8_bytes) or corrupt session metadata.
export function readTranscriptRowValues(raw: Record<string, unknown>): TranscriptPayload {
  const seq = raw["seq"];
  const json = raw["event_json"] ?? null;
  const zstd = raw["event_zstd"] ?? null;
  const declared = raw["event_utf8_bytes"];
  const violations: string[] = [];
  if (typeof seq !== "number" || !Number.isFinite(seq)) violations.push("seq is not a finite number");
  if (json !== null && typeof json !== "string") violations.push("event_json is not TEXT");
  if (zstd !== null && !(zstd instanceof Uint8Array)) violations.push("event_zstd is not a BLOB");
  if (typeof declared !== "number" || !Number.isFinite(declared)) violations.push("event_utf8_bytes is not a finite number");
  return {
    seq: typeof seq === "number" ? seq : Number.NaN,
    eventJson: typeof json === "string" ? json : null,
    eventZstd: zstd instanceof Uint8Array ? zstd : null,
    declaredUtf8Bytes: typeof declared === "number" ? declared : Number.NaN,
    columnTypeError: violations.length === 0 ? null : violations.join("; ")
  };
}

// Decode one gathered row per docs/trace/openclaw-admission.md rules 3 and 4:
// exactly one of event_json/event_zstd must be set, zstd rows must decompress,
// the decoded UTF-8 byte length must equal event_utf8_bytes, and the decoded
// text is parsed as JSON. Decode failures are surfaced as statuses, not throws.
export async function decodeTranscriptPayload(row: TranscriptPayload): Promise<TranscriptPayloadDecode> {
  const decoder = new TextDecoder();
  let encoding: RowEncoding;
  let decodedBytes: number | null = null;
  let decodedText: string | null = null;
  let decodedJson: unknown = null;
  let decodeStatus: RowDecodeStatus;

  if (row.columnTypeError !== null) {
    encoding = "invalid";
    decodeStatus = { kind: "error", stage: "column_type", reason: row.columnTypeError };
  } else if (row.eventJson !== null && row.eventZstd !== null) {
    encoding = "invalid";
    decodeStatus = { kind: "error", stage: "encoding", reason: "both event_json and event_zstd are set" };
  } else if (row.eventJson !== null) {
    encoding = "plain";
    decodedText = row.eventJson;
    decodedBytes = utf8Encoder.encode(decodedText).byteLength;
    decodeStatus = decodedBytes === row.declaredUtf8Bytes
      ? { kind: "ok" }
      : {
          kind: "error",
          stage: "length_mismatch",
          reason: `plain row decoded to ${decodedBytes} UTF-8 bytes but event_utf8_bytes declares ${row.declaredUtf8Bytes}`
        };
  } else if (row.eventZstd !== null) {
    encoding = "zstd";
    try {
      const decompressed = await bunRuntime.zstdDecompress(row.eventZstd);
      decodedBytes = decompressed.byteLength;
      decodedText = decoder.decode(decompressed);
      decodeStatus = decodedBytes === row.declaredUtf8Bytes
        ? { kind: "ok" }
        : {
            kind: "error",
            stage: "length_mismatch",
            reason: `zstd row decoded to ${decodedBytes} bytes but event_utf8_bytes declares ${row.declaredUtf8Bytes}`
          };
    } catch (error) {
      decodeStatus = { kind: "error", stage: "decompress", reason: `zstd decode failed: ${causeMessage(error)}` };
    }
  } else {
    encoding = "invalid";
    decodeStatus = { kind: "error", stage: "encoding", reason: "both event_json and event_zstd are NULL" };
  }

  if (decodedText !== null) {
    try {
      decodedJson = JSON.parse(decodedText);
    } catch (error) {
      if (decodeStatus.kind === "ok") {
        decodeStatus = { kind: "error", stage: "parse", reason: `decoded text is not parseable JSON: ${causeMessage(error)}` };
      }
    }
  }

  return {
    encoding,
    declaredUtf8Bytes: row.declaredUtf8Bytes,
    decodedBytes,
    decodedText,
    decodedJson,
    decodeStatus
  };
}

function gatherRowsInTransaction(
  db: SqliteDatabase,
  dbPath: string,
  sessionId: string,
  limits: AcquisitionLimits
): GatheredInventory {
  const gather = db.transaction((sid: string): GatheredInventory => {
    // Stream rows inside the transaction: bounds fire DURING materialization,
    // so a large session or hostile DB trips a named bound without ever holding
    // the full result set. LIMIT maxRows + 1 caps the prepared result as well.
    const statement = db.query(
      `SELECT seq, event_json, event_zstd, event_utf8_bytes,
              length(CAST(event_json AS BLOB)) AS event_json_bytes,
              length(event_zstd) AS event_zstd_bytes
       FROM ${TRANSCRIPT_EVENTS_TABLE}
       WHERE session_id = ?
       ORDER BY seq ASC
       LIMIT ${limits.maxRows + 1}`
    );

    const rows: GatheredRow[] = [];
    let totalDeclaredUtf8Bytes = 0;
    let totalEncodedBytes = 0;
    for (const value of statement.iterate(sid)) {
      if (rows.length >= limits.maxRows) {
        throw new BoundedAcquisitionError(
          "rows",
          `session "${sid}" has more than ${limits.maxRows} transcript_events rows, exceeding maxRows=${limits.maxRows}`
        );
      }
      const raw = value as Record<string, unknown>;
      const row = readTranscriptRowValues(raw);
      const encodedBytes = transcriptEncodedBytes(raw, row);
      if (encodedBytes > limits.maxEncodedBytesPerRow) {
        throw new BoundedAcquisitionError(
          "encoded_bytes_per_row",
          `row (${sid}, seq ${row.seq}) stores ${encodedBytes} encoded bytes, exceeding maxEncodedBytesPerRow=${limits.maxEncodedBytesPerRow}`
        );
      }
      totalDeclaredUtf8Bytes += Number.isFinite(row.declaredUtf8Bytes) ? row.declaredUtf8Bytes : 0;
      if (totalDeclaredUtf8Bytes > limits.maxTotalDecodedBytes) {
        throw new BoundedAcquisitionError(
          "total_decoded_bytes",
          `session "${sid}" declares ${totalDeclaredUtf8Bytes} decoded bytes so far (at seq ${row.seq}), exceeding maxTotalDecodedBytes=${limits.maxTotalDecodedBytes}`
        );
      }
      totalEncodedBytes += encodedBytes;
      rows.push({
        ...row,
        encodedBytes,
        // Copy blob bytes into owned memory before the transaction ends.
        eventZstd: row.eventZstd === null ? null : new Uint8Array(row.eventZstd)
      });
    }
    if (rows.length === 0) {
      throw new SessionNotFoundError(dbPath, sid);
    }
    return { rows, totalDeclaredUtf8Bytes, totalEncodedBytes };
  });

  try {
    return gather(sessionId);
  } catch (error) {
    if (error instanceof SessionNotFoundError || error instanceof BoundedAcquisitionError) {
      throw error;
    }
    if (causeMessage(error).includes("locked")) {
      throw new BoundedAcquisitionError(
        "query_wait",
        `read transaction on ${dbPath} did not acquire within queryWaitMs=${limits.queryWaitMs} (${causeMessage(error)})`
      );
    }
    throw error;
  }
}

async function decodeRows(sessionId: string, gathered: GatheredInventory, limits: AcquisitionLimits): Promise<AcquiredRow[]> {
  const rows: AcquiredRow[] = [];
  let actualTotalDecodedBytes = 0;

  for (const row of gathered.rows) {
    const locator: RowLocator = { session_id: sessionId, seq: row.seq };
    const decoded = await decodeTranscriptPayload(row);

    if (decoded.decodedBytes !== null) {
      actualTotalDecodedBytes += decoded.decodedBytes;
      if (actualTotalDecodedBytes > limits.maxTotalDecodedBytes) {
        throw new BoundedAcquisitionError(
          "total_decoded_bytes",
          `decoded payloads total ${actualTotalDecodedBytes} bytes (at seq ${row.seq}), exceeding maxTotalDecodedBytes=${limits.maxTotalDecodedBytes}`
        );
      }
    }

    rows.push({
      locator,
      encoding: decoded.encoding,
      declaredUtf8Bytes: row.declaredUtf8Bytes,
      encodedBytes: row.encodedBytes,
      decodedBytes: decoded.decodedBytes,
      decodedText: decoded.decodedText,
      decodedJson: decoded.decodedJson,
      decodeStatus: decoded.decodeStatus
    });
  }

  return rows;
}

function validateLimits(limits: AcquisitionLimits): void {
  const entries: readonly [string, number][] = [
    ["maxRows", limits.maxRows],
    ["maxEncodedBytesPerRow", limits.maxEncodedBytesPerRow],
    ["maxTotalDecodedBytes", limits.maxTotalDecodedBytes],
    ["queryWaitMs", limits.queryWaitMs]
  ];
  for (const [name, value] of entries) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`Acquisition limit ${name} must be a positive integer, got ${value}.`);
    }
  }
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function causeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
