import { createHash } from "node:crypto";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const DIGEST = /^(?:sha256:)?([0-9a-f]{64})$/;
const OWNER_SNAPSHOT_PREFIX = "protected/pre-edit-binding-owners/";
const PLAN_EXTERNAL_OWNER_PATHS = new Set([
  `${OWNER_SNAPSHOT_PREFIX}evidence/k0r/acceptance-manifest.json`,
  `${OWNER_SNAPSHOT_PREFIX}evidence/k0r/isolation-manifest.json`,
  `${OWNER_SNAPSHOT_PREFIX}evidence/k0r/v1-public-contract-inventory.json`,
]);
const APPROVED_ADDITIONAL_OWNER_PATHS = new Set([
  `${OWNER_SNAPSHOT_PREFIX}evidence/k0r/approval-provenance.json`,
  `${OWNER_SNAPSHOT_PREFIX}evidence/k0r/evidence-manifest.json`,
  `${OWNER_SNAPSHOT_PREFIX}evidence/k0r/isolated-run-receipt.json`,
]);

export type K0rPreTrackedFormat = "jcs-json" | "jcs-jsonl" | "external-raw-json";

export interface K0rPromotionArtifact {
  readonly path: string;
  readonly bytes: string | Uint8Array;
}

export interface K0rTrackedOverlaySnapshot {
  readonly snapshotPath: string;
  readonly sha256: string;
}

export interface K0rBindingOwnerSnapshot {
  readonly snapshotPath: string;
  readonly sha256: string;
}

export interface K0rPromotionClassificationPolicy {
  readonly trackedOverlaySnapshots?: readonly K0rTrackedOverlaySnapshot[];
  readonly bindingOwnerSnapshots?: readonly K0rBindingOwnerSnapshot[];
}

export interface K0rPreTrackedVerificationResult {
  readonly entriesSha256: string;
  readonly verifiedEntriesSha256: string;
  readonly verifiedEntryCount: number;
}

export interface K0rCanonicalPromotionInput {
  readonly bootstrapReceipt: string | Uint8Array;
  readonly hostRunnerReceipt: string | Uint8Array;
  readonly preTrackedManifest: string | Uint8Array;
  readonly artifacts: readonly K0rPromotionArtifact[];
  readonly bootstrapSource?: string | Uint8Array;
  readonly classificationPolicy?: K0rPromotionClassificationPolicy;
}

export interface K0rBoundedProcessOptions {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly deadlineMs: number;
  readonly stdoutCapBytes: number;
  readonly stderrCapBytes: number;
}

export interface K0rBoundedProcessResult {
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly stdoutOverflow: boolean;
  readonly stderrOverflow: boolean;
  readonly orphanProcess: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutBytes: Uint8Array;
  readonly stderrBytes: Uint8Array;
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
}

export interface K0rCanonicalPromotionVerification {
  readonly bootstrapReceiptSha256: string;
  readonly hostRunnerReceiptSha256: string;
  readonly hostRunnerToolIdentitySha256: string;
  readonly hostRunnerVectorResultSha256: string;
  readonly preTrackedManifestSha256: string;
  readonly verifiedEntriesSha256: string;
  readonly verifiedEntryCount: number;
}

export interface K0rRequestBoundApprovalExpected {
  readonly requestPayload: unknown;
  readonly requestPayloadRawSha256: string;
  readonly requestPayloadJcsSha256: string;
}

export interface K0rRequestBoundApprovalIdentity {
  readonly sessionId: string;
  readonly requestEventId: string;
  readonly responseEventId: string;
  readonly responseTimestamp: string;
}

export class K0rCanonicalizationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "K0rCanonicalizationError";
  }
}

export class K0rPromotionClassificationError extends K0rCanonicalizationError {
  readonly path: string;
  readonly reconciliation: string;

  constructor(path: string, detail: string) {
    const reconciliation =
      "Preserve the snapshot bytes. Reconcile the external-raw-json allowlist with " +
      "receipts/k0r-binding-snapshot.json, regenerate the pre-tracked manifest, and restart promotion.";
    super(`K0R promotion classification error for ${path}: ${detail} ${reconciliation}`);
    this.name = "K0rPromotionClassificationError";
    this.path = path;
    this.reconciliation = reconciliation;
  }
}

function fail(message: string): never {
  throw new K0rCanonicalizationError(message);
}

function assertScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) fail("lone surrogate in string");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      fail("lone surrogate in string");
    }
  }
}

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    assertScalarString(value);
    return JSON.stringify(value);
  }
  if (typeof value !== "object") fail(`unsupported value: ${typeof value}`);
  if (ancestors.has(value)) fail("cycle");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail("sparse or accessor array");
        result.push(serialize(descriptor.value, ancestors));
      }
      const expected = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string") fail("symbol array key");
        if (!expected.has(key)) fail("non-index array property");
      }
      return `[${result.join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail("unsupported object prototype");
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) fail("symbol object key");
    const fields: string[] = [];
    for (const key of (ownKeys as string[]).sort()) {
      assertScalarString(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail("accessor or non-enumerable property");
      fields.push(`${JSON.stringify(key)}:${serialize(descriptor.value, ancestors)}`);
    }
    return `{${fields.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** Serialize one I-JSON value according to RFC 8785 JCS. */
export function canonicalizeK0rJson(value: unknown): string {
  return serialize(value, new Set<object>());
}

export function canonicalK0rJsonBytes(value: unknown): Uint8Array {
  return encoder.encode(canonicalizeK0rJson(value));
}

export function canonicalK0rJsonLine(value: unknown): string {
  return `${canonicalizeK0rJson(value)}\n`;
}

export function sha256K0rBytes(value: string | Uint8Array): string {
  return createHash("sha256").update(typeof value === "string" ? encoder.encode(value) : value).digest("hex");
}

export function sha256CanonicalK0r(value: unknown): string {
  return sha256K0rBytes(canonicalK0rJsonBytes(value));
}

interface K0rReadable {
  on(event: "data", listener: (chunk: Uint8Array) => void): K0rReadable;
  once(event: "error", listener: (error: Error) => void): K0rReadable;
  once(event: "end", listener: () => void): K0rReadable;
}

interface K0rChildProcess {
  readonly pid?: number;
  readonly stdout: K0rReadable | null;
  readonly stderr: K0rReadable | null;
  once(event: "error", listener: (error: Error) => void): K0rChildProcess;
  once(event: "exit", listener: (code: number | null, signal: string | null) => void): K0rChildProcess;
  kill(signal: "SIGTERM" | "SIGKILL"): boolean;
}

type K0rSpawn = (
  executable: string,
  arguments_: readonly string[],
  options: Readonly<Record<string, unknown>>,
) => K0rChildProcess;

function validateBoundedOptions(options: K0rBoundedProcessOptions): void {
  if (options.argv.length === 0 || options.argv.some((argument) => argument.length === 0 || argument.includes("\0"))) {
    fail("bounded process requires a non-empty NUL-free argv array");
  }
  if (!options.cwd.startsWith("/") || options.cwd.includes("\0")) fail("bounded process cwd must be absolute");
  if (!Number.isInteger(options.deadlineMs) || options.deadlineMs <= 0 || options.deadlineMs > 180_000) {
    fail("bounded process deadline must be between 1 and 180000 milliseconds");
  }
  for (const [name, cap] of [["stdout", options.stdoutCapBytes], ["stderr", options.stderrCapBytes]] as const) {
    if (!Number.isInteger(cap) || cap < 0 || cap > 8 * 1024 * 1024) fail(`${name} cap must be between 0 and 8 MiB`);
  }
  for (const [key, value] of Object.entries(options.environment)) {
    if (key.length === 0 || key.includes("=") || key.includes("\0") || value.includes("\0")) fail("invalid process environment");
  }
}

function joinChunks(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/** Launch one direct argv under fixed timeout, output, process-group, and closure bounds. */
export async function runBoundedK0rProcess(options: K0rBoundedProcessOptions): Promise<K0rBoundedProcessResult> {
  validateBoundedOptions(options);
  const childProcess = await import("node:child_process");
  if (!("spawn" in childProcess) || typeof childProcess.spawn !== "function") fail("node:child_process.spawn unavailable");
  const spawn = childProcess.spawn as K0rSpawn;
  const child = spawn(options.argv[0], options.argv.slice(1), {
    cwd: options.cwd,
    detached: true,
    env: { ...options.environment, PWD: options.cwd },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!child.stdout || !child.stderr) fail("bounded process pipes unavailable");

  const stdoutChunks: Uint8Array[] = [];
  const stderrChunks: Uint8Array[] = [];
  let stdoutSize = 0;
  let stderrSize = 0;
  let stdoutOverflow = false;
  let stderrOverflow = false;
  let timedOut = false;
  let exited = false;
  let terminating = false;
  let escalationTimer: ReturnType<typeof setTimeout> | undefined;

  const processSignal = (process as unknown as {
    kill(pid: number, signal: "SIGTERM" | "SIGKILL"): boolean;
  }).kill;
  const signalGroup = (signal: "SIGTERM" | "SIGKILL"): void => {
    if (child.pid !== undefined) {
      try { processSignal(-child.pid, signal); return; } catch (error) {
        const code = error instanceof Error && "code" in error ? String(error.code) : "";
        if (code !== "ESRCH") throw error;
      }
    }
    if (!exited) child.kill(signal);
  };
  const terminate = (): void => {
    if (terminating) return;
    terminating = true;
    signalGroup("SIGTERM");
    escalationTimer = setTimeout(() => signalGroup("SIGKILL"), 1_000);
  };

  const exitPromise = new Promise<{ readonly code: number | null; readonly signal: string | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => { exited = true; resolve({ code, signal }); });
  });
  const stdoutEnd = new Promise<void>((resolve, reject) => {
    child.stdout?.once("error", reject);
    child.stdout?.once("end", resolve);
  });
  const stderrEnd = new Promise<void>((resolve, reject) => {
    child.stderr?.once("error", reject);
    child.stderr?.once("end", resolve);
  });
  child.stdout.on("data", (chunk) => {
    const remaining = Math.max(0, options.stdoutCapBytes - stdoutSize);
    if (remaining > 0) stdoutChunks.push(chunk.slice(0, remaining));
    stdoutSize += Math.min(remaining, chunk.byteLength);
    if (chunk.byteLength > remaining) { stdoutOverflow = true; terminate(); }
  });
  child.stderr.on("data", (chunk) => {
    const remaining = Math.max(0, options.stderrCapBytes - stderrSize);
    if (remaining > 0) stderrChunks.push(chunk.slice(0, remaining));
    stderrSize += Math.min(remaining, chunk.byteLength);
    if (chunk.byteLength > remaining) { stderrOverflow = true; terminate(); }
  });

  const deadlineTimer = setTimeout(() => { timedOut = true; terminate(); }, options.deadlineMs);
  let exit: { readonly code: number | null; readonly signal: string | null };
  try {
    exit = await exitPromise;
  } finally {
    clearTimeout(deadlineTimer);
  }

  let orphanProcess = false;
  let closureTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([stdoutEnd, stderrEnd]),
      new Promise<never>((_, reject) => {
        closureTimer = setTimeout(() => reject(new Error("bounded process pipe closure timeout")), 5_000);
      }),
    ]);
  } catch (error) {
    orphanProcess = true;
    signalGroup("SIGKILL");
    throw error;
  } finally {
    if (closureTimer !== undefined) clearTimeout(closureTimer);
    if (escalationTimer !== undefined) clearTimeout(escalationTimer);
  }
  const stdoutBytes = joinChunks(stdoutChunks, stdoutSize);
  const stderrBytes = joinChunks(stderrChunks, stderrSize);
  return {
    exitCode: exit.code,
    signal: exit.signal,
    timedOut,
    stdoutOverflow,
    stderrOverflow,
    orphanProcess,
    stdout: toText(stdoutBytes),
    stderr: toText(stderrBytes),
    stdoutBytes,
    stderrBytes,
    stdoutSha256: sha256K0rBytes(stdoutBytes),
    stderrSha256: sha256K0rBytes(stderrBytes),
  };
}

class StrictJsonParser {
  private index = 0;
  constructor(private readonly source: string) {}

  parse(): unknown {
    this.space();
    const value = this.value();
    this.space();
    if (this.index !== this.source.length) fail(`unexpected JSON token at offset ${this.index}`);
    return value;
  }

  private value(): unknown {
    const token = this.source[this.index];
    if (token === '"') return this.string();
    if (token === "{") return this.object();
    if (token === "[") return this.array();
    if (token === "t") return this.literal("true", true);
    if (token === "f") return this.literal("false", false);
    if (token === "n") return this.literal("null", null);
    return this.number();
  }

  private string(): string {
    const start = this.index++;
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index++);
      if (code === 0x22) {
        const parsed: unknown = JSON.parse(this.source.slice(start, this.index));
        if (typeof parsed !== "string") fail("invalid JSON string");
        assertScalarString(parsed);
        return parsed;
      }
      if (code < 0x20) fail(`unescaped control character at offset ${this.index - 1}`);
      if (code === 0x5c) {
        const escape = this.source[this.index++];
        if (escape === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(this.source.slice(this.index, this.index + 4))) {
            fail(`invalid Unicode escape at offset ${this.index}`);
          }
          this.index += 4;
        } else if (!escape || !'"\\/bfnrt'.includes(escape)) {
          fail(`invalid escape at offset ${this.index - 1}`);
        }
      }
    }
    return fail("unterminated JSON string");
  }

  private object(): Readonly<Record<string, unknown>> {
    this.index += 1;
    const result: Record<string, unknown> = Object.create(null);
    const seen = new Set<string>();
    this.space();
    if (this.take("}")) return result;
    while (true) {
      if (this.source[this.index] !== '"') fail(`object key required at offset ${this.index}`);
      const key = this.string();
      if (seen.has(key)) fail(`duplicate object key: ${JSON.stringify(key)}`);
      seen.add(key);
      this.space();
      if (!this.take(":")) fail(`colon required at offset ${this.index}`);
      this.space();
      result[key] = this.value();
      this.space();
      if (this.take("}")) return result;
      if (!this.take(",")) fail(`comma required at offset ${this.index}`);
      this.space();
    }
  }

  private array(): readonly unknown[] {
    this.index += 1;
    const result: unknown[] = [];
    this.space();
    if (this.take("]")) return result;
    while (true) {
      result.push(this.value());
      this.space();
      if (this.take("]")) return result;
      if (!this.take(",")) fail(`comma required at offset ${this.index}`);
      this.space();
    }
  }

  private number(): number {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.index));
    if (!match) fail(`JSON value required at offset ${this.index}`);
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) fail("non-finite parsed number");
    return value;
  }

  private literal<T extends boolean | null>(source: string, value: T): T {
    if (!this.source.startsWith(source, this.index)) fail(`invalid literal at offset ${this.index}`);
    this.index += source.length;
    return value;
  }

  private take(token: string): boolean {
    if (this.source[this.index] !== token) return false;
    this.index += 1;
    return true;
  }

  private space(): void {
    while (/[\u0009\u000a\u000d\u0020]/.test(this.source[this.index] ?? "x")) this.index += 1;
  }
}

/** Parse JSON with scoped duplicate-key rejection and I-JSON checks. */
export function parseK0rJson(source: string): unknown {
  return new StrictJsonParser(source).parse();
}

function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? encoder.encode(value) : value;
}

function toText(value: string | Uint8Array): string {
  try {
    return decoder.decode(toBytes(value));
  } catch {
    return fail("invalid UTF-8");
  }
}

function asRecord(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[], name: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${name} has missing or unknown fields`);
  }
}

function stringField(value: Readonly<Record<string, unknown>>, key: string): string {
  const field = value[key];
  if (typeof field !== "string") fail(`${key} must be a string`);
  return field;
}

function digestField(value: Readonly<Record<string, unknown>>, key: string): string {
  const field = stringField(value, key);
  const match = DIGEST.exec(field);
  if (!match) fail(`${key} must be a lowercase SHA-256 digest`);
  return match[1];
}

function requireDigest(actual: string, expected: string, name: string): void {
  const match = DIGEST.exec(expected);
  if (!match || actual !== match[1]) fail(`${name} digest mismatch`);
}

function prefixedDigestField(value: Readonly<Record<string, unknown>>, key: string): string {
  const field = stringField(value, key);
  if (!/^sha256:[0-9a-f]{64}$/.test(field)) fail(`${key} must be a prefixed lowercase SHA-256 digest`);
  return field;
}

function canonicalTimestampField(value: Readonly<Record<string, unknown>>, key: string): string {
  const field = stringField(value, key);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(field) || new Date(field).toISOString() !== field) {
    fail(`${key} must be a canonical host timestamp`);
  }
  return field;
}

function nonNegativeSafeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${name} must be a non-negative safe integer`);
  return value as number;
}

/** Validate the exact Task 1 request/response provenance contract. */
export function validateK0rRequestBoundApprovalProvenance(
  value: unknown,
  expected: K0rRequestBoundApprovalExpected,
): K0rRequestBoundApprovalIdentity {
  const provenance = asRecord(value, "request-bound approval provenance");
  requireExactKeys(provenance, [
    "schemaVersion", "sessionId", "requestEvent", "responseEvent", "transcript",
    "requestPayloadPath", "requestPayloadRawSha256", "requestPayloadJcsSha256",
    "requestReceiptPath", "requestReceiptSha256", "responseRawSha256",
    "responseJcsSha256", "interveningEventCount", "interveningEventsSha256",
  ], "request-bound approval provenance");
  if (provenance.schemaVersion !== "boulder.senpi.request-bound-approval.v2") {
    fail("Task 1 authority requires request-bound approval provenance v2");
  }
  const sessionId = stringField(provenance, "sessionId");
  if (sessionId.length === 0) fail("request-bound sessionId must not be empty");

  const event = (candidate: unknown, role: "assistant" | "user", name: string) => {
    const record = asRecord(candidate, name);
    requireExactKeys(record, ["eventId", "eventTimestamp", "role", "eventLineNumber", "eventLineSha256", "eventContentSha256"], name);
    const eventId = stringField(record, "eventId");
    if (eventId.length === 0 || record.role !== role) fail(`${name} identity or role is invalid`);
    const eventTimestamp = canonicalTimestampField(record, "eventTimestamp");
    const eventLineNumber = nonNegativeSafeInteger(record.eventLineNumber, `${name} eventLineNumber`);
    if (eventLineNumber < 1) fail(`${name} eventLineNumber must be positive`);
    return {
      eventId,
      eventTimestamp,
      eventLineNumber,
      eventLineSha256: prefixedDigestField(record, "eventLineSha256"),
      eventContentSha256: prefixedDigestField(record, "eventContentSha256"),
    };
  };
  const requestEvent = event(provenance.requestEvent, "assistant", "request event");
  const responseEvent = event(provenance.responseEvent, "user", "response event");
  if (responseEvent.eventLineNumber <= requestEvent.eventLineNumber || responseEvent.eventTimestamp <= requestEvent.eventTimestamp) {
    fail("request-bound response event order is invalid");
  }

  const transcript = asRecord(provenance.transcript, "request-bound transcript");
  requireExactKeys(transcript, ["realpathSha256", "device", "inode", "uid", "mode", "prefixBytesSha256"], "request-bound transcript");
  prefixedDigestField(transcript, "realpathSha256");
  prefixedDigestField(transcript, "prefixBytesSha256");
  for (const key of ["device", "inode", "uid"] as const) nonNegativeSafeInteger(transcript[key], `request-bound transcript ${key}`);
  const mode = stringField(transcript, "mode");
  if (!/^[0-7]{4}$/.test(mode) || (Number.parseInt(mode, 8) & 0o077) !== 0) fail("request-bound transcript mode is unsafe");

  const payloadJcs = canonicalizeK0rJson(expected.requestPayload);
  const payloadJcsSha256 = `sha256:${sha256K0rBytes(payloadJcs)}`;
  const payloadRawSha256 = `sha256:${sha256K0rBytes(`${payloadJcs}\n`)}`;
  if (expected.requestPayloadJcsSha256 !== payloadJcsSha256 || expected.requestPayloadRawSha256 !== payloadRawSha256) {
    fail("expected request payload digests are stale");
  }
  if (provenance.requestPayloadPath !== "authorizations/k0r-a.json" ||
      provenance.requestPayloadJcsSha256 !== payloadJcsSha256 ||
      provenance.requestPayloadRawSha256 !== payloadRawSha256) {
    fail("request-bound provenance is not bound to the generated scope payload");
  }
  if (provenance.requestReceiptPath !== "receipts/k0r-a-request.json") fail("request-bound request receipt path is invalid");
  const requestReceiptSha256 = prefixedDigestField(provenance, "requestReceiptSha256");
  const requestEnvelope = canonicalizeK0rJson({
    requestPayload: expected.requestPayload,
    requestPayloadJcsSha256: payloadJcsSha256,
    requestReceiptSha256,
    schemaVersion: "boulder.k0r.scope-authorization-request.v2",
  });
  if (requestEvent.eventContentSha256 !== `sha256:${sha256K0rBytes(requestEnvelope)}`) {
    fail("request event content is not bound to the exact request envelope");
  }

  const responseText = canonicalizeK0rJson({
    decision: "approve_exact_frozen_scope",
    requestPayloadJcsSha256: payloadJcsSha256,
    requestReceiptSha256,
    schemaVersion: "boulder.k0r.scope-authorization-response.v1",
  });
  const responseSha256 = `sha256:${sha256K0rBytes(responseText)}`;
  if (prefixedDigestField(provenance, "responseRawSha256") !== responseSha256 ||
      prefixedDigestField(provenance, "responseJcsSha256") !== responseSha256 ||
      responseEvent.eventContentSha256 !== responseSha256) {
    fail("response digests do not bind the exact canonical approval response");
  }
  const interveningEventCount = nonNegativeSafeInteger(provenance.interveningEventCount, "interveningEventCount");
  if (interveningEventCount !== responseEvent.eventLineNumber - requestEvent.eventLineNumber - 1) {
    fail("intervening event count is inconsistent with bound line numbers");
  }
  prefixedDigestField(provenance, "interveningEventsSha256");
  return { sessionId, requestEventId: requestEvent.eventId, responseEventId: responseEvent.eventId, responseTimestamp: responseEvent.eventTimestamp };
}

function parseCanonicalReceipt(raw: string | Uint8Array, name: string): Readonly<Record<string, unknown>> {
  const source = toText(raw);
  if (!source.endsWith("\n") || source.endsWith("\n\n")) fail(`${name} must end in exactly one LF`);
  const value = asRecord(parseK0rJson(source.slice(0, -1)), name);
  if (source !== canonicalK0rJsonLine(value)) fail(`${name} is not JCS+LF`);
  return value;
}

function compareUtf8(left: string, right: string): number {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function validPath(path: string): boolean {
  return path.length > 0 && !path.startsWith("/") && !path.includes("\\") &&
    path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function externalRawAllowed(path: string, policy: K0rPromotionClassificationPolicy): boolean {
  if (path.startsWith("protected/prior-k0r/")) return true;
  if (PLAN_EXTERNAL_OWNER_PATHS.has(path)) return true;
  if (APPROVED_ADDITIONAL_OWNER_PATHS.has(path)) return bindingOwnerSnapshot(policy, path) !== undefined;
  return policy.trackedOverlaySnapshots?.some((entry) => entry.snapshotPath === path) === true;
}

function bindingOwnerSnapshot(
  policy: K0rPromotionClassificationPolicy,
  path: string,
): K0rBindingOwnerSnapshot | undefined {
  const matches = policy.bindingOwnerSnapshots?.filter((entry) => entry.snapshotPath === path) ?? [];
  if (matches.length > 1) fail(`duplicate binding owner snapshot: ${path}`);
  return matches[0];
}

function parseSemantic(path: string, raw: string, format: K0rPreTrackedFormat): { value: unknown; generated?: string } {
  if (!path.endsWith(".jsonl")) {
    const value = parseK0rJson(format === "jcs-json" ? raw.slice(0, -1) : raw);
    return { value, generated: format === "jcs-json" ? canonicalK0rJsonLine(value) : undefined };
  }
  const lines = raw.endsWith("\n") ? raw.slice(0, -1).split("\n") : raw.split("\n");
  if (lines.length === 0 || lines.some((line) => line.length === 0)) fail(`${path} contains an empty JSONL line`);
  const values = lines.map(parseK0rJson);
  return { value: values, generated: format === "jcs-jsonl" ? `${values.map(canonicalizeK0rJson).join("\n")}\n` : undefined };
}

/** Verify a complete pre-Task-7 manifest without writing or normalizing an artifact. */
export function verifyK0rPreTrackedJcsManifest(
  manifestValue: unknown,
  artifacts: readonly K0rPromotionArtifact[],
  policy: K0rPromotionClassificationPolicy = {},
): K0rPreTrackedVerificationResult {
  const manifest = asRecord(manifestValue, "pre-tracked manifest");
  requireExactKeys(manifest, ["schemaVersion", "canonicalizerReceiptSha256", "selfPath", "selfDigestExcluded", "entries", "entriesSha256"], "pre-tracked manifest");
  if (manifest.schemaVersion !== "boulder.k0r.pre-tracked-jcs-manifest.v1") fail("unexpected manifest schema");
  if (manifest.selfDigestExcluded !== true) fail("manifest must exclude its own digest");
  if (manifest.selfPath !== "protected/pre-tracked-jcs-manifest.json") fail("invalid manifest selfPath");
  if (!Array.isArray(manifest.entries)) fail("manifest entries must be an array");

  const byPath = new Map<string, Uint8Array>();
  for (const artifact of artifacts) {
    if (!validPath(artifact.path) || byPath.has(artifact.path)) fail(`invalid or duplicate artifact path: ${artifact.path}`);
    byPath.set(artifact.path, toBytes(artifact.bytes));
  }
  let previous: string | undefined;
  for (const candidate of manifest.entries) {
    const entry = asRecord(candidate, "manifest entry");
    requireExactKeys(entry, ["path", "fileSha256", "semanticJcsSha256", "format"], "manifest entry");
    const path = stringField(entry, "path");
    const allowedRoot = ["authorizations/", "claims/", "identities/", "protected/", "receipts/"].some((prefix) => path.startsWith(prefix));
    if (!allowedRoot) fail(`artifact is outside the promotion roots: ${path}`);
    if (!validPath(path) || (previous !== undefined && compareUtf8(previous, path) >= 0)) fail(`entries not uniquely path-sorted at ${path}`);
    previous = path;
    const format = stringField(entry, "format");
    if (format !== "jcs-json" && format !== "jcs-jsonl" && format !== "external-raw-json") fail(`invalid format for ${path}`);
    if (!/\.jsonl?$/.test(path) || (format === "jcs-json" && path.endsWith(".jsonl")) ||
      (format === "jcs-jsonl" && !path.endsWith(".jsonl"))) fail(`format/suffix mismatch for ${path}`);
    if (format === "external-raw-json" && !externalRawAllowed(path, policy)) {
      if (path.startsWith(OWNER_SNAPSHOT_PREFIX)) {
        throw new K0rPromotionClassificationError(path, "the immutable owner snapshot is bound by k0r-binding-snapshot.json but omitted from the plan's external-raw allowlist.");
      }
      throw new K0rPromotionClassificationError(path, "external-raw-json is not authorized for this path.");
    }
    const rawBytes = byPath.get(path);
    if (!rawBytes) fail(`missing artifact: ${path}`);
    byPath.delete(path);
    const raw = toText(rawBytes);
    const fileSha256 = sha256K0rBytes(rawBytes);
    requireDigest(fileSha256, stringField(entry, "fileSha256"), `${path} file`);
    if (APPROVED_ADDITIONAL_OWNER_PATHS.has(path)) {
      const binding = bindingOwnerSnapshot(policy, path);
      if (!binding) throw new K0rPromotionClassificationError(path, "approved external raw owner snapshot lacks its binding-snapshot entry.");
      requireDigest(fileSha256, binding.sha256, `${path} binding owner snapshot`);
    }
    if (format !== "external-raw-json" && !raw.endsWith("\n")) fail(`${path} lacks canonical LF`);
    const semantic = parseSemantic(path, raw, format);
    if (semantic.generated !== undefined && semantic.generated !== raw) {
      if (path.startsWith(OWNER_SNAPSHOT_PREFIX)) {
        throw new K0rPromotionClassificationError(path, "immutable raw bytes were incorrectly classified as generated JCS.");
      }
      fail(`${path} is not byte-identical JCS`);
    }
    requireDigest(sha256CanonicalK0r(semantic.value), stringField(entry, "semanticJcsSha256"), `${path} semantic JCS`);
  }
  if (byPath.size !== 0) fail(`unmanifested artifact: ${String(byPath.keys().next().value)}`);
  const entriesSha256 = sha256CanonicalK0r(manifest.entries);
  requireDigest(entriesSha256, stringField(manifest, "entriesSha256"), "manifest entries");
  return { entriesSha256, verifiedEntriesSha256: entriesSha256, verifiedEntryCount: manifest.entries.length };
}

/** Pure promotion proof. Receipt persistence belongs to the owning reconciliation tool. */
export function verifyK0rCanonicalPromotion(input: K0rCanonicalPromotionInput): K0rCanonicalPromotionVerification {
  const bootstrap = parseCanonicalReceipt(input.bootstrapReceipt, "bootstrap receipt");
  requireExactKeys(bootstrap, ["schemaVersion", "status", "sourcePath", "sourceSha256", "bunVersion", "vectorSetSha256", "vectorResultSha256"], "bootstrap receipt");
  if (bootstrap.schemaVersion !== "boulder.k0r.canonicalizer-bootstrap.v1" || bootstrap.status !== "verified") fail("bootstrap receipt is not verified");
  digestField(bootstrap, "sourceSha256");
  digestField(bootstrap, "vectorSetSha256");
  digestField(bootstrap, "vectorResultSha256");
  if (input.bootstrapSource !== undefined) requireDigest(sha256K0rBytes(input.bootstrapSource), stringField(bootstrap, "sourceSha256"), "bootstrap source");

  const host = parseCanonicalReceipt(input.hostRunnerReceipt, "host runner receipt");
  requireExactKeys(host, [
    "schemaVersion", "status", "hostSessionId", "toolName", "contractVersion", "toolIdentitySha256",
    "hostSourceSetSha256", "hostArtifactPathSha256", "hostArtifactSha256", "planSha256",
    "bunRealpathSha256", "bunExecutableSha256", "bunVersion", "invocationPolicySha256",
    "callRecordSha256", "resultRecordSha256", "stdoutSha256", "stderrSha256", "vectorSetSha256",
    "vectorResultSha256", "receiptSha256",
  ], "host runner receipt");
  if (host.schemaVersion !== "boulder.k0r.host-bounded-runner.v1" || host.status !== "verified") fail("host runner receipt is not verified");
  const projection: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(host)) if (key !== "receiptSha256") projection[key] = host[key];
  requireDigest(sha256CanonicalK0r(projection), stringField(host, "receiptSha256"), "host receipt self");

  const manifestRaw = toText(input.preTrackedManifest);
  if (!manifestRaw.endsWith("\n")) fail("pre-tracked manifest must end in LF");
  const manifest = asRecord(parseK0rJson(manifestRaw.slice(0, -1)), "pre-tracked manifest");
  if (manifestRaw !== canonicalK0rJsonLine(manifest)) fail("pre-tracked manifest is not JCS+LF");
  requireDigest(sha256K0rBytes(input.bootstrapReceipt), stringField(manifest, "canonicalizerReceiptSha256"), "manifest bootstrap receipt");
  const verified = verifyK0rPreTrackedJcsManifest(manifest, input.artifacts, input.classificationPolicy);
  return {
    bootstrapReceiptSha256: sha256K0rBytes(input.bootstrapReceipt),
    hostRunnerReceiptSha256: sha256K0rBytes(input.hostRunnerReceipt),
    hostRunnerToolIdentitySha256: digestField(host, "toolIdentitySha256"),
    hostRunnerVectorResultSha256: digestField(host, "vectorResultSha256"),
    preTrackedManifestSha256: sha256K0rBytes(input.preTrackedManifest),
    verifiedEntriesSha256: verified.verifiedEntriesSha256,
    verifiedEntryCount: verified.verifiedEntryCount,
  };
}
