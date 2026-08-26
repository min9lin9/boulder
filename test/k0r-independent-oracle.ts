import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonRecord = { [key: string]: Json };
type FixtureName = "baseline" | "mutations" | "none";
type Integrity = "retain-integrity" | "corrupt-event-digest-only; retain-signature" | "corrupt-signature-only; retain-event-digest" | "rederive-and-sign";

type MutationSource = {
  readonly id: string;
  readonly firstReason: string;
  readonly integrity: Integrity;
  readonly eventPatch: JsonRecord;
  readonly trustedState: "active" | "revoked" | "policy2";
  readonly clock: string;
  readonly verifierAvailable: boolean;
  readonly nonceState: "empty" | "consumed";
  readonly precedenceProbe: { readonly clock: string; readonly firstReason: string } | null;
};

export type K0rOracleReport = {
  readonly schemaVersion: "boulder.k0r-independent-oracle-report.v1";
  readonly reproductionMode: "complete-byte-independent";
  readonly status: "pass" | "fail";
  readonly oracleSourceSha256: string;
  readonly artifacts: Readonly<Record<FixtureName, string>>;
  readonly reproduced: Readonly<Record<FixtureName, { readonly sha256: string; readonly fixtureSha256: string; readonly byteMatch: boolean }>>;
  readonly derivedPublicKey: string;
  readonly generationSetDigest: string;
  readonly vectorIds: readonly string[];
  readonly seedMaterial: { readonly status: "absentOutsideApprovedOracleAndGenerator" | "present" | "scan_failed"; readonly scannedFileCount: number };
  readonly failures: readonly string[];
};

export type K0rOracleOptions = {
  readonly root?: string;
  readonly fixtureBytes?: Partial<Record<FixtureName, string>>;
  readonly oracleSourceBytes?: string;
  readonly stagedFiles?: readonly { readonly path: string; readonly bytes: string | Uint8Array }[];
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const repositoryRoot = join(import.meta.dir, "..");
const publicKey = "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo";
const rfc8032Vector1Seed = ["9d61b19deffd5a60", "ba844af492ec2cc4", "4449c5697b326919", "703bac031cae7f60"].join("");
const baselineOutputDigest = "sha256:0172bc8c3241db159f45b45d5320a466e612856afa2ca6c3478d6d55f5fda750";
const mutationOutputDigest = "sha256:88ed614d1757525c543d86e71b301887b9160465ea9b5126193045d4d0d388ec";
const noneOutputDigest = "sha256:df3a2d6da157837886206a2512e50868e1b468b9b48dbcf5ce4bba582cc7c754";
const generationSetDigest = "sha256:cae1b30b108761597e83350dd359206a87edc629231f7fcbffba9cc599117b65";
const namespace = "boulder.v2.authority-event.v1/fixture-rfc8032/rfc8032-vector-1/policy-1";
const nonce = "AAECAwQFBgcICQoLDA0ODw";
const zeroDigest = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
const approvedSeedSourcePaths = new Set(["test/k0r-independent-oracle.ts", "test/v2-authority-vectors.generate.ts"]);
const ignoredSeedScanDirectories = new Set([".git", ".gjc", ".boulder", ".codegraph", ".code-review-graph", ".omo", "node_modules"]);

const serialization = {
  encoding: "UTF-8",
  canonicalization: "RFC8785 JCS/I-JSON",
  suffix: "LF",
  baselineWrapperSchemaVersion: "boulder.v2.authority-baseline-wrapper.v1",
  mutationWrapperSchemaVersion: "boulder.v2.authority-mutation-wrapper.v1",
  baselineWrapperKeys: ["schemaVersion", "fixtureVersion", "generationSetDigest", "trustedState", "clock", "verifierAvailable", "nonceStateBefore", "envelope", "authorityEventPreimage", "signaturePreimage", "expected"],
  mutationWrapperKeys: ["schemaVersion", "fixtureVersion", "generationSetDigest", "baselineRef", "baselineSha256", "vectors"],
  mutationVectorKeys: ["id", "event", "trustedState", "clock", "verifierAvailable", "nonceStateBefore", "nonceStateAfter", "integrity", "expected", "precedenceProbe"],
  baselineExpectedKeys: ["authorityStatus", "namespace", "eventDigest", "signature", "authorityEventPreimage", "signaturePreimage", "nonceStateAfter", "outcome", "capabilityInvocations"],
  mutationExpectedKeys: ["firstReason", "nonceStateAfter"],
  precedenceProbeKeys: ["clock", "firstReason", "nonceStateAfter"],
};

// This is the approved source model. It deliberately does not load a fixture, product module, or producer.
const approvedBaselineSource: JsonRecord = {
  envelope: {
    schemaVersion: "boulder.v2.execution-envelope.v1",
    requestedStepId: "step-authority-1",
    extensions: { "org.example.fixture": { label: "authority-vector" } },
    plan: {
      schemaVersion: "boulder.v2.plan.v1",
      workflowId: "workflow-authority-1",
      planRevision: 1,
      policySnapshot: { policyRevision: "policy-1", digest: "sha256:389c3257e3101ced1d432e37e7aaad7a5fd2fce92b19c572e12c94da102f8dcd" },
      intent: { id: "intent-authority-1", objective: "verify unsupported local read", acceptance: ["authority-verified", "effect-remains-unsupported"] },
      extensions: { "org.example.fixture": { label: "authority-vector" } },
      steps: [{
        id: "step-authority-1",
        dependsOn: [],
        capabilityBinding: { capabilityId: "fixture-uppercase", capabilityVersion: "1.0.0", invocationId: "invoke-authority-1" },
        input: { schemaId: "org.example.fixture-input.v1", digest: "sha256:42dca349078571613068ad58d483d13016d06310673ee444382580c570cfc622", value: { message: "authority" } },
        requiredEvidenceKinds: [],
        declaredEffects: [{
          schemaVersion: "boulder.v2.effect.v1",
          id: "effect-local-read-1",
          class: "local-read",
          inputDigest: "sha256:42dca349078571613068ad58d483d13016d06310673ee444382580c570cfc622",
          scope: { kind: "path", resources: ["/fixture/authority-resource"], scopeDigest: "sha256:c8af3cb695a7978f5d196d2ec716556e8506090d847c81bb19fb2c23c13d2bc1" },
        }],
      }],
    },
  },
  event: {
    schemaVersion: "boulder.v2.authority-event.v1",
    id: "authority-event-1",
    issuer: "fixture-rfc8032",
    keyId: "rfc8032-vector-1",
    algorithm: "Ed25519",
    policyRevision: "policy-1",
    workflowId: "workflow-authority-1",
    planRevision: 1,
    stepId: "step-authority-1",
    effectId: "effect-local-read-1",
    effectClass: "local-read",
    scopeDigest: "sha256:c8af3cb695a7978f5d196d2ec716556e8506090d847c81bb19fb2c23c13d2bc1",
    inputDigest: "sha256:42dca349078571613068ad58d483d13016d06310673ee444382580c570cfc622",
    nonce,
    signedAt: "2026-07-20T00:00:00.000Z",
    expiresAt: "2026-07-20T00:05:00.000Z",
  },
};

const approvedNoneEnvelope: JsonRecord = {
  schemaVersion: "boulder.v2.execution-envelope.v1",
  requestedStepId: "step-1",
  extensions: { "org.example.fixture": { label: "canonical" } },
  plan: {
    schemaVersion: "boulder.v2.plan.v1",
    workflowId: "workflow-1",
    planRevision: 1,
    planDigest: "sha256:682409ebcd3075d7fe315af78f0417a4f368c494e1cc91722194f42621dc48d5",
    policySnapshot: { policyRevision: "policy-1", digest: "sha256:389c3257e3101ced1d432e37e7aaad7a5fd2fce92b19c572e12c94da102f8dcd" },
    intent: { id: "intent-1", objective: "uppercase fixture message", acceptance: ["artifact-nonempty", "evidence-fixture-output"] },
    extensions: { "org.example.fixture": { label: "canonical" } },
    steps: [{
      id: "step-1",
      dependsOn: [],
      capabilityBinding: { capabilityId: "fixture-uppercase", capabilityVersion: "1.0.0", invocationId: "invoke-1" },
      input: { schemaId: "org.example.fixture-input.v1", digest: "sha256:61dfca047dac4db1c9206c8a27dced51f1fd22d9baa4fb9ef03a0dfc0a7424cd", value: { message: "boulder" } },
      requiredEvidenceKinds: ["fixture-transform"],
      declaredEffects: [{
        schemaVersion: "boulder.v2.effect.v1",
        id: "effect-1",
        class: "none",
        inputDigest: "sha256:61dfca047dac4db1c9206c8a27dced51f1fd22d9baa4fb9ef03a0dfc0a7424cd",
        scope: { kind: "none", resources: [], scopeDigest: "sha256:07f15fed3722ea4f93edffcb8f5fd1ef94e496e17343f14a42dc55a0fe0581e9" },
      }],
    }],
  },
};

const mutationTable: readonly MutationSource[] = [
  { id: "algorithm-unsupported", firstReason: "v2.authority.algorithm_unsupported", integrity: "retain-integrity", eventPatch: { algorithm: "Ed448" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "key-unknown", firstReason: "v2.authority.key_unknown", integrity: "retain-integrity", eventPatch: { keyId: "rfc8032-vector-1-unknown" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "key-revoked", firstReason: "v2.authority.key_revoked", integrity: "retain-integrity", eventPatch: {}, trustedState: "revoked", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "event-digest-invalid", firstReason: "v2.authority.event_digest_invalid", integrity: "corrupt-event-digest-only; retain-signature", eventPatch: { eventDigest: { operation: "set-sha256-zero-32", value: zeroDigest } }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "signature-invalid", firstReason: "v2.authority.signature_invalid", integrity: "corrupt-signature-only; retain-event-digest", eventPatch: { signature: { operation: "set-base64url-zero-64", bytes: 64, value: "base64url(64*0x00)" } }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "timestamp-invalid", firstReason: "v2.authority.timestamp_invalid", integrity: "rederive-and-sign", eventPatch: { signedAt: "not-a-timestamp" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "expired", firstReason: "v2.authority.expired", integrity: "retain-integrity", eventPatch: {}, trustedState: "active", clock: "2026-07-20T00:05:00.000Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "stale", firstReason: "v2.authority.stale", integrity: "rederive-and-sign", eventPatch: { expiresAt: "2026-07-20T00:10:00.000Z" }, trustedState: "active", clock: "2026-07-20T00:05:00.001Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: { clock: "2026-07-20T00:10:00.000Z", firstReason: "v2.authority.expired" } },
  { id: "policy-mismatch", firstReason: "v2.authority.policy_mismatch", integrity: "retain-integrity", eventPatch: {}, trustedState: "policy2", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "binding-workflow", firstReason: "v2.authority.binding_mismatch", integrity: "rederive-and-sign", eventPatch: { workflowId: "workflow-authority-2" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "binding-plan-revision", firstReason: "v2.authority.binding_mismatch", integrity: "rederive-and-sign", eventPatch: { planRevision: 2 }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "binding-step", firstReason: "v2.authority.binding_mismatch", integrity: "rederive-and-sign", eventPatch: { stepId: "step-authority-2" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "binding-effect", firstReason: "v2.authority.binding_mismatch", integrity: "rederive-and-sign", eventPatch: { effectId: "effect-local-read-2" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "binding-class", firstReason: "v2.authority.binding_mismatch", integrity: "rederive-and-sign", eventPatch: { effectClass: "local-write" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "binding-scope", firstReason: "v2.authority.binding_mismatch", integrity: "rederive-and-sign", eventPatch: { scopeDigest: zeroDigest }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "binding-input", firstReason: "v2.authority.binding_mismatch", integrity: "rederive-and-sign", eventPatch: { inputDigest: zeroDigest }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "empty", precedenceProbe: null },
  { id: "replayed", firstReason: "v2.authority.replayed", integrity: "retain-integrity", eventPatch: {}, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceState: "consumed", precedenceProbe: null },
  { id: "verifier-unavailable", firstReason: "v2.authority.verifier_unavailable", integrity: "retain-integrity", eventPatch: {}, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: false, nonceState: "empty", precedenceProbe: null },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: Json, name: string): JsonRecord {
  assert(typeof value === "object" && value !== null && !Array.isArray(value), `${name} must be an object.`);
  return value;
}

function array(value: Json | undefined, name: string): Json[] {
  assert(Array.isArray(value), `${name} must be an array.`);
  return value;
}

function string(value: Json | undefined, name: string): string {
  assert(typeof value === "string", `${name} must be a string.`);
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertNoLoneSurrogate(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      assert(next >= 0xdc00 && next <= 0xdfff, "Strings cannot contain lone surrogate code points.");
      index += 1;
    } else {
      assert(code < 0xdc00 || code > 0xdfff, "Strings cannot contain lone surrogate code points.");
    }
  }
}

function canonicalize(value: Json): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    assertNoLoneSurrogate(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    assert(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)), "Numbers must be finite I-JSON values.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) assert(Object.hasOwn(value, index), "Arrays cannot be sparse.");
    return `[${value.map(canonicalize).join(",")}]`;
  }
  assert(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, "Objects must be JSON records.");
  return `{${Object.keys(value).sort(compareCodeUnits).map((key) => {
    assertNoLoneSurrogate(key);
    return `${JSON.stringify(key)}:${canonicalize(value[key])}`;
  }).join(",")}}`;
}

export function canonicalizeK0r(value: Json): string {
  return canonicalize(value);
}

export function serializeK0r(value: Json): string {
  return `${canonicalize(value)}\n`;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function sha256Text(value: string): string {
  return sha256(encoder.encode(value));
}
function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}


function clone<T extends Json>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function omit(value: JsonRecord, ...fields: readonly string[]): JsonRecord {
  const result: JsonRecord = {};
  for (const [key, entry] of Object.entries(value)) if (!fields.includes(key)) result[key] = entry;
  return result;
}

function authorityEventPreimage(event: JsonRecord): string {
  return `boulder.v2.authority-event.v1\n${canonicalize(omit(event, "eventDigest", "signature"))}`;
}

function signaturePreimage(event: JsonRecord): string {
  return `boulder.v2.authority-signature.v1\n${canonicalize(omit(event, "signature"))}`;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
  assert(/^[A-Za-z0-9_-]*$/.test(value), "Base64url value contains an invalid character.");
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  assert(encodeBase64Url(bytes) === value, "Base64url value is not canonical.");
  return bytes;
}

function signingKey() {
  const seed = Uint8Array.from(rfc8032Vector1Seed.match(/../g)?.map((octet) => Number.parseInt(octet, 16)) ?? []);
  assert(seed.length === 32, "RFC 8032 section 7.1 seed must be 32 bytes.");
  const prefix = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);
  const pkcs8 = new Uint8Array(prefix.length + seed.length);
  pkcs8.set(prefix);
  pkcs8.set(seed, prefix.length);
  return createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
}

function verificationKey() {
  const privateKey = signingKey();
  const derived = new Uint8Array(createPublicKey(privateKey).export({ format: "der", type: "spki" }));
  assert(encodeBase64Url(derived.slice(-32)) === publicKey, "RFC 8032 section 7.1 seed does not derive the pinned public key.");
  return createPublicKey({ key: new Uint8Array([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00, ...decodeBase64Url(publicKey)]), format: "der", type: "spki" });
}

function signEvent(event: JsonRecord): void {
  event.eventDigest = sha256Text(authorityEventPreimage(event));
  event.signature = encodeBase64Url(sign(null, encoder.encode(signaturePreimage(event)), signingKey()));
}

function nonceState(name: "empty" | "consumed"): JsonRecord {
  return name === "empty" ? {} : { [namespace]: { [nonce]: "consumed" } };
}

function trustedState(name: "active" | "revoked" | "policy2"): JsonRecord {
  return {
    policyRevision: name === "policy2" ? "policy-2" : "policy-1",
    keys: [{ issuer: "fixture-rfc8032", keyId: "rfc8032-vector-1", status: name === "revoked" ? "revoked" : "active", publicKey }],
  };
}

function isRfc3339Millis(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function firstReason(event: JsonRecord, trusted: JsonRecord, verifierAvailable: boolean, clock: string, nonceBefore: JsonRecord, binding: JsonRecord): string {
  if (!verifierAvailable) return "v2.authority.verifier_unavailable";
  if (event.algorithm !== "Ed25519") return "v2.authority.algorithm_unsupported";
  const keys = array(trusted.keys, "trustedState.keys").map((entry, index) => record(entry, `trustedState.keys[${index}]`));
  const match = keys.find((candidate) => candidate.issuer === event.issuer && candidate.keyId === event.keyId);
  if (match === undefined || match.publicKey !== publicKey) return "v2.authority.key_unknown";
  if (match.status !== "active") return "v2.authority.key_revoked";
  if (event.eventDigest !== sha256Text(authorityEventPreimage(event))) return "v2.authority.event_digest_invalid";
  const signature = event.signature;
  if (typeof signature !== "string" || !verify(null, encoder.encode(signaturePreimage(event)), verificationKey(), decodeBase64Url(signature))) return "v2.authority.signature_invalid";
  const signedAt = event.signedAt;
  const expiresAt = event.expiresAt;
  if (typeof signedAt !== "string" || typeof expiresAt !== "string" || !isRfc3339Millis(signedAt) || !isRfc3339Millis(expiresAt) || !isRfc3339Millis(clock)) return "v2.authority.timestamp_invalid";
  const signedTime = Date.parse(signedAt);
  const expiryTime = Date.parse(expiresAt);
  const currentTime = Date.parse(clock);
  if (signedTime > currentTime || expiryTime <= signedTime) return "v2.authority.timestamp_invalid";
  if (currentTime >= expiryTime) return "v2.authority.expired";
  if (currentTime - signedTime > 300_000) return "v2.authority.stale";
  if (event.policyRevision !== trusted.policyRevision || event.policyRevision !== binding.policyRevision) return "v2.authority.policy_mismatch";
  for (const field of ["workflowId", "planRevision", "stepId", "effectId", "effectClass", "scopeDigest", "inputDigest"] as const) {
    if (event[field] !== binding[field]) return "v2.authority.binding_mismatch";
  }
  const consumed = record(nonceBefore[namespace] ?? {}, "nonce state");
  if (Object.hasOwn(consumed, string(event.nonce, "event.nonce"))) return "v2.authority.replayed";
  return "v2.authority.verified";
}

function buildBaselineWrapper(): JsonRecord {
  const envelope = clone(record(approvedBaselineSource.envelope, "approved baseline envelope"));
  const plan = record(envelope.plan, "approved baseline plan");
  plan.planDigest = sha256Text(`boulder.v2.plan.v1\n${canonicalize(omit(plan, "planDigest"))}`);
  const event = clone(record(approvedBaselineSource.event, "approved baseline event"));
  signEvent(event);
  envelope.authorityEvents = [event];
  const authorityPreimage = authorityEventPreimage(event);
  const signature = signaturePreimage(event);
  return {
    schemaVersion: serialization.baselineWrapperSchemaVersion,
    fixtureVersion: "boulder.v2.authority-vector.v1",
    generationSetDigest,
    trustedState: trustedState("active"),
    clock: "2026-07-20T00:04:59.999Z",
    verifierAvailable: true,
    nonceStateBefore: {},
    envelope,
    authorityEventPreimage: authorityPreimage,
    signaturePreimage: signature,
    expected: {
      authorityStatus: "verified",
      namespace,
      eventDigest: event.eventDigest,
      signature: event.signature,
      authorityEventPreimage: authorityPreimage,
      signaturePreimage: signature,
      nonceStateAfter: "consumed",
      outcome: "v2.effect.unsupported",
      capabilityInvocations: 0,
    },
  };
}

function buildMutationEvent(baselineEvent: JsonRecord, mutation: MutationSource): JsonRecord {
  const event = clone(baselineEvent);
  if (mutation.integrity === "corrupt-event-digest-only; retain-signature") {
    event.eventDigest = string(record(mutation.eventPatch.eventDigest, `${mutation.id} event patch`).value, `${mutation.id} event digest`);
  } else if (mutation.integrity === "corrupt-signature-only; retain-event-digest") {
    const patch = record(mutation.eventPatch.signature, `${mutation.id} signature patch`);
    assert(patch.operation === "set-base64url-zero-64" && patch.bytes === 64 && patch.value === "base64url(64*0x00)", `${mutation.id} signature patch is invalid.`);
    event.signature = encodeBase64Url(new Uint8Array(64));
  } else {
    for (const [field, value] of Object.entries(mutation.eventPatch)) event[field] = clone(value);
  }
  if (mutation.integrity === "rederive-and-sign") signEvent(event);
  return event;
}

function buildMutationWrapper(baseline: JsonRecord): JsonRecord {
  const envelope = record(baseline.envelope, "baseline envelope");
  const baselineEvent = record(array(envelope.authorityEvents, "baseline authority events")[0], "baseline authority event");
  return {
    schemaVersion: serialization.mutationWrapperSchemaVersion,
    fixtureVersion: "boulder.v2.authority-vector.v1",
    generationSetDigest,
    baselineRef: "fixtures/v2-kernel/valid-ed25519-authority-unsupported-effect.json",
    baselineSha256: baselineOutputDigest,
    vectors: mutationTable.map((mutation) => ({
      id: mutation.id,
      event: buildMutationEvent(baselineEvent, mutation),
      trustedState: trustedState(mutation.trustedState),
      clock: mutation.clock,
      verifierAvailable: mutation.verifierAvailable,
      nonceStateBefore: nonceState(mutation.nonceState),
      nonceStateAfter: nonceState(mutation.nonceState),
      integrity: mutation.integrity,
      expected: { firstReason: mutation.firstReason, nonceStateAfter: nonceState(mutation.nonceState) },
      precedenceProbe: mutation.precedenceProbe === null ? null : { ...mutation.precedenceProbe, nonceStateAfter: {} },
    })),
  };
}

function expectedGenerationSource(baseline: JsonRecord): JsonRecord {
  const envelope = record(baseline.envelope, "baseline envelope");
  const event = record(array(envelope.authorityEvents, "baseline authority events")[0], "baseline authority event");
  return {
    sourceSchemaVersion: "boulder.v2.authority-vector-source.v3",
    namespace,
    nonce,
    baseline: {
      fixtureVersion: "boulder.v2.authority-vector.v1",
      trustedState: "active",
      clock: "2026-07-20T00:04:59.999Z",
      verifierAvailable: true,
      nonceStateBefore: "empty",
      envelope,
      authorityEvent: event,
      expected: { authorityStatus: "verified", nonceStateAfter: "consumed", outcome: "v2.effect.unsupported", capabilityInvocations: 0 },
    },
    nonceStates: { empty: {}, consumed: nonceState("consumed") },
    trustedStates: { active: trustedState("active"), revoked: trustedState("revoked"), policy2: trustedState("policy2") },
    serialization,
    mutations: mutationTable.map((mutation) => ({
      id: mutation.id,
      eventPatch: mutation.eventPatch,
      trustedState: mutation.trustedState,
      clock: mutation.clock,
      verifierAvailable: mutation.verifierAvailable,
      nonceStateBefore: mutation.nonceState,
      nonceStateAfter: mutation.nonceState,
      integrity: mutation.integrity,
      expected: mutation.firstReason,
      precedenceProbe: mutation.precedenceProbe === null ? null : { clock: mutation.precedenceProbe.clock, expected: mutation.precedenceProbe.firstReason },
    })),
  };
}

function stagedFileMap(files: K0rOracleOptions["stagedFiles"]): ReadonlyMap<string, Uint8Array> {
  const result = new Map<string, Uint8Array>();
  let previous: Uint8Array | undefined;
  for (const file of files ?? []) {
    const path = file.path.normalize("NFC");
    assert(path === file.path && path !== "" && !isAbsolute(path) && !path.includes("\\") && !path.includes("\0") && !path.split("/").some((part) => part === "" || part === "." || part === ".."), "Staged oracle path is invalid.");
    const bytes = encoder.encode(path);
    assert(previous === undefined || compareBytes(previous, bytes) < 0, "Staged oracle paths must be unique and sorted.");
    assert(!result.has(path), "Staged oracle paths must be unique and sorted.");
    result.set(path, typeof file.bytes === "string" ? encoder.encode(file.bytes) : file.bytes);
    previous = bytes;
  }
  return result;
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

async function loadRootFile(root: string, relativePath: string, staged: ReadonlyMap<string, Uint8Array>): Promise<Uint8Array> {
  return staged.get(relativePath) ?? readFile(join(root, relativePath));
}

async function loadFixture(root: string, relativePath: string, override: string | undefined, staged: ReadonlyMap<string, Uint8Array>): Promise<Uint8Array> {
  return override === undefined ? loadRootFile(root, relativePath, staged) : encoder.encode(override);
}

async function scanForSeed(root: string, staged: ReadonlyMap<string, Uint8Array>): Promise<{ readonly status: "absentOutsideApprovedOracleAndGenerator" | "present"; readonly scannedFileCount: number }> {
  let scannedFileCount = 0;
  let present = false;
  const scanned = new Set<string>();
  async function scan(path: string): Promise<void> {
    const relativePath = relative(root, path);
    if (approvedSeedSourcePaths.has(relativePath) || ignoredSeedScanDirectories.has(relativePath.split("/")[0])) return;
    const stat = await lstat(path);
    assert(!stat.isSymbolicLink(), `Seed scan refuses symbolic link ${relativePath}.`);
    if (stat.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) await scan(join(path, entry));
      return;
    }
    if (!stat.isFile()) return;
    scanned.add(relativePath);
    scannedFileCount += 1;
    if (decoder.decode(await loadRootFile(root, relativePath, staged)).includes(rfc8032Vector1Seed)) present = true;
  }
  await scan(root);
  for (const [path, bytes] of staged) {
    if (approvedSeedSourcePaths.has(path) || ignoredSeedScanDirectories.has(path.split("/")[0]) || scanned.has(path)) continue;
    scannedFileCount += 1;
    if (decoder.decode(bytes).includes(rfc8032Vector1Seed)) present = true;
  }
  return { status: present ? "present" : "absentOutsideApprovedOracleAndGenerator", scannedFileCount };
}

export function assertIndependentOracleSource(source: string): void {
  assert(/\bconst\s+approvedBaselineSource\s*:/.test(source), "Oracle source does not define the approved baseline source model.");
  assert(/\bconst\s+approvedNoneEnvelope\s*:/.test(source), "Oracle source does not define the approved none envelope model.");
  assert(/\bconst\s+mutationTable\s*:/.test(source), "Oracle source does not define the ordered mutation table.");
  assert(/\bconst\s+rfc8032Vector1Seed\s*=/.test(source), "Oracle source does not define RFC 8032 section 7.1 key material.");
  assert(!/\b(?:from|import)\s*\(?\s*["'][^"']*(?:\/src\/|v2-authority-vectors\.generate)/.test(source), "Oracle source imports product v2 code or the producer generator.");
}

export async function runK0rIndependentOracle(options: K0rOracleOptions = {}): Promise<K0rOracleReport> {
  const root = options.root === undefined ? repositoryRoot : resolve(options.root);
  const staged = stagedFileMap(options.stagedFiles);
  const artifacts: Record<FixtureName, string> = { baseline: "", mutations: "", none: "" };
  const reproduced: Record<FixtureName, { sha256: string; fixtureSha256: string; byteMatch: boolean }> = {
    baseline: { sha256: "", fixtureSha256: "", byteMatch: false },
    mutations: { sha256: "", fixtureSha256: "", byteMatch: false },
    none: { sha256: "", fixtureSha256: "", byteMatch: false },
  };
  const failures: string[] = [];
  let oracleSourceSha256 = "";
  let seedMaterial: K0rOracleReport["seedMaterial"] = { status: "scan_failed", scannedFileCount: 0 };
  const check = async (name: string, action: () => void | Promise<void>): Promise<void> => {
    try {
      await action();
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  await check("oracle-source", async () => {
    const source = options.oracleSourceBytes ?? decoder.decode(await loadRootFile(root, "test/k0r-independent-oracle.ts", staged));
    assertIndependentOracleSource(source);
    oracleSourceSha256 = sha256Text(source);
  });

  const baseline = buildBaselineWrapper();
  const mutations = buildMutationWrapper(baseline);
  const none = clone(approvedNoneEnvelope);
  await check("generation", () => {
    assert(sha256Text(canonicalize(expectedGenerationSource(baseline))) === generationSetDigest, "Independent generation source digest is invalid.");
    const event = record(array(record(baseline.envelope, "baseline envelope").authorityEvents, "baseline authority events")[0], "baseline event");
    const plan = record(record(baseline.envelope, "baseline envelope").plan, "baseline plan");
    assert(event.eventDigest === sha256Text(authorityEventPreimage(event)), "Independent baseline event digest is invalid.");
    assert(plan.planDigest === sha256Text(`boulder.v2.plan.v1\n${canonicalize(omit(plan, "planDigest"))}`), "Independent baseline plan digest is invalid.");
    assert(!Object.hasOwn(none, "authorityEvents"), "Independent none envelope must omit authorityEvents.");
  });

  await check("mutation-semantics", () => {
    const plan = record(record(baseline.envelope, "baseline envelope").plan, "baseline plan");
    const step = record(array(plan.steps, "baseline steps")[0], "baseline step");
    const effect = record(array(step.declaredEffects, "baseline effects")[0], "baseline effect");
    const binding = { policyRevision: record(plan.policySnapshot, "policy snapshot").policyRevision, workflowId: plan.workflowId, planRevision: plan.planRevision, stepId: step.id, effectId: effect.id, effectClass: effect.class, scopeDigest: record(effect.scope, "effect scope").scopeDigest, inputDigest: effect.inputDigest };
    const vectors = array(mutations.vectors, "independent mutations");
    for (const [index, mutation] of mutationTable.entries()) {
      const vector = record(vectors[index], `independent mutation ${index}`);
      const event = record(vector.event, `${mutation.id} event`);
      assert(firstReason(event, record(vector.trustedState, `${mutation.id} trusted state`), vector.verifierAvailable === true, string(vector.clock, `${mutation.id} clock`), record(vector.nonceStateBefore, `${mutation.id} nonce state`), binding) === mutation.firstReason, `Independent mutation ${mutation.id} has wrong first reason.`);
      if (mutation.precedenceProbe !== null) assert(firstReason(event, record(vector.trustedState, `${mutation.id} trusted state`), vector.verifierAvailable === true, mutation.precedenceProbe.clock, {}, binding) === mutation.precedenceProbe.firstReason, `Independent mutation ${mutation.id} has wrong precedence reason.`);
    }
  });

  const fixtureEntries: readonly [FixtureName, string, JsonRecord, string][] = [
    ["baseline", "fixtures/v2-kernel/valid-ed25519-authority-unsupported-effect.json", baseline, baselineOutputDigest],
    ["mutations", "fixtures/v2-kernel/invalid-authority-vectors.json", mutations, mutationOutputDigest],
    ["none", "fixtures/v2-kernel/valid-none-effect-execution.json", none, noneOutputDigest],
  ];
  for (const [name, path, value, approvedDigest] of fixtureEntries) {
    await check(`fixture-${name}`, async () => {
      const fixture = await loadFixture(root, path, options.fixtureBytes?.[name], staged);
      const expected = encoder.encode(serializeK0r(value));
      artifacts[name] = sha256(fixture);
      reproduced[name] = { sha256: sha256(expected), fixtureSha256: artifacts[name], byteMatch: equalBytes(expected, fixture) };
      assert(reproduced[name].sha256 === approvedDigest, `${name} independent reproduction digest is not approved.`);
      assert(artifacts[name] === approvedDigest, `${name} fixture byte digest is not approved.`);
      assert(reproduced[name].byteMatch, `${name} fixture bytes do not exactly match independent reproduction.`);
    });
  }

  await check("seed-exclusion", async () => {
    seedMaterial = await scanForSeed(root, staged);
    assert(seedMaterial.status === "absentOutsideApprovedOracleAndGenerator", "RFC 8032 seed material is present outside the approved oracle and generator.");
  });
  if (failures.some((failure) => failure.startsWith("seed-exclusion:")) && seedMaterial.status !== "present") seedMaterial = { ...seedMaterial, status: "scan_failed" };

  return {
    schemaVersion: "boulder.k0r-independent-oracle-report.v1",
    reproductionMode: "complete-byte-independent",
    status: failures.length === 0 ? "pass" : "fail",
    oracleSourceSha256,
    artifacts,
    reproduced,
    derivedPublicKey: publicKey,
    generationSetDigest,
    vectorIds: mutationTable.map((mutation) => mutation.id),
    seedMaterial,
    failures,
  };
}

function isMain(): boolean {
  return Bun.argv[1] !== undefined && resolve(Bun.argv[1]) === resolve(join(import.meta.dir, "k0r-independent-oracle.ts"));
}

if (isMain()) {
  const report = await runK0rIndependentOracle();
  console.log(JSON.stringify(report));
  if (report.status !== "pass") process.exitCode = 1;
}
