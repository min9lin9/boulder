import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import {
  authoritySignaturePreimageV2,
  canonicalizeV2,
  digestV2AuthorityEvent,
  digestV2Input,
  digestV2Plan,
  digestV2PolicySnapshot,
  digestV2Scope,
} from "../src/v2/canonical";
import {
  V2_AUTHORITY_EVENT_SCHEMA_VERSION,
  V2_EFFECT_SCHEMA_VERSION,
  V2_EXECUTION_ENVELOPE_SCHEMA_VERSION,
  V2_PLAN_SCHEMA_VERSION,
  type V2AuthorityEvent,
  type V2Digest,
  type V2ExecutionEnvelope,
  type V2JsonValue,
  type V2Plan,
  isV2Digest,
  isV2EffectClass,
} from "../src/v2/contracts";

type JsonObject = { [key: string]: V2JsonValue };
type MutationSource = {
  readonly id: string;
  readonly eventPatch: JsonObject;
  readonly trustedState: "active" | "revoked" | "policy2";
  readonly clock: string;
  readonly verifierAvailable: boolean;
  readonly nonceStateBefore: "empty" | "consumed";
  readonly nonceStateAfter: "empty" | "consumed";
  readonly integrity: string;
  readonly expected: string;
  readonly precedenceProbe: { readonly clock: string; readonly expected: string } | null;
};

const encoder = new TextEncoder();
const FIXTURE_VERSION = "boulder.v2.authority-vector.v1";
const BASELINE_SCHEMA_VERSION = "boulder.v2.authority-baseline-wrapper.v1";
const MUTATION_SCHEMA_VERSION = "boulder.v2.authority-mutation-wrapper.v1";
const BASELINE_PATH = join(import.meta.dir, "..", "fixtures", "v2-kernel", "valid-ed25519-authority-unsupported-effect.json");
const MUTATIONS_PATH = join(import.meta.dir, "..", "fixtures", "v2-kernel", "invalid-authority-vectors.json");
const GENERATOR_PATH = join(import.meta.dir, "v2-authority-vectors.generate.ts");
const BASELINE_REF = "fixtures/v2-kernel/valid-ed25519-authority-unsupported-effect.json";
const EXPECTED_PUBLIC_KEY = "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo";
const RFC8032_VECTOR_1_SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const EMPTY_DIGEST = "sha256:0000000000000000000000000000000000000000000000000000000000000000" as V2Digest;
const SEED_EXCLUSION_WORKFLOW_METADATA = new Set([".git", ".gjc", ".boulder", ".codegraph", ".code-review-graph", ".omo", "node_modules"]);
const SEED_EXCLUSION_COVERAGE = [
  "bin/boulder.ts",
  "src/cli.ts",
  "docs/AGENTS.md",
  "skills/AGENTS.md",
  "examples/mcp-server/README.md",
  "fixtures/v2-kernel/valid-ed25519-authority-unsupported-effect.json",
  "test/v2-authority-vectors.test.ts",
  "AGENTS.md",
  "README.md",
  "package.json",
  "bun.lock",
  "boulder.yaml",
  "tsconfig.json",
] as const;
const REPOSITORY_ROOT = join(import.meta.dir, "..");

const serialization = {
  encoding: "UTF-8",
  canonicalization: "RFC8785 JCS/I-JSON",
  suffix: "LF",
  baselineWrapperSchemaVersion: BASELINE_SCHEMA_VERSION,
  mutationWrapperSchemaVersion: MUTATION_SCHEMA_VERSION,
  baselineWrapperKeys: ["schemaVersion", "fixtureVersion", "generationSetDigest", "trustedState", "clock", "verifierAvailable", "nonceStateBefore", "envelope", "authorityEventPreimage", "signaturePreimage", "expected"],
  mutationWrapperKeys: ["schemaVersion", "fixtureVersion", "generationSetDigest", "baselineRef", "baselineSha256", "vectors"],
  mutationVectorKeys: ["id", "event", "trustedState", "clock", "verifierAvailable", "nonceStateBefore", "nonceStateAfter", "integrity", "expected", "precedenceProbe"],
  baselineExpectedKeys: ["authorityStatus", "namespace", "eventDigest", "signature", "authorityEventPreimage", "signaturePreimage", "nonceStateAfter", "outcome", "capabilityInvocations"],
  mutationExpectedKeys: ["firstReason", "nonceStateAfter"],
  precedenceProbeKeys: ["clock", "firstReason", "nonceStateAfter"],
} as const;

const mutations: readonly MutationSource[] = [
  { id: "algorithm-unsupported", eventPatch: { algorithm: "Ed448" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "retain-integrity", expected: "v2.authority.algorithm_unsupported", precedenceProbe: null },
  { id: "key-unknown", eventPatch: { keyId: "rfc8032-vector-1-unknown" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "retain-integrity", expected: "v2.authority.key_unknown", precedenceProbe: null },
  { id: "key-revoked", eventPatch: {}, trustedState: "revoked", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "retain-integrity", expected: "v2.authority.key_revoked", precedenceProbe: null },
  { id: "event-digest-invalid", eventPatch: { eventDigest: { operation: "set-sha256-zero-32", value: EMPTY_DIGEST } }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "corrupt-event-digest-only; retain-signature", expected: "v2.authority.event_digest_invalid", precedenceProbe: null },
  { id: "signature-invalid", eventPatch: { signature: { operation: "set-base64url-zero-64", bytes: 64, value: "base64url(64*0x00)" } }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "corrupt-signature-only; retain-event-digest", expected: "v2.authority.signature_invalid", precedenceProbe: null },
  { id: "timestamp-invalid", eventPatch: { signedAt: "not-a-timestamp" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "rederive-and-sign", expected: "v2.authority.timestamp_invalid", precedenceProbe: null },
  { id: "expired", eventPatch: {}, trustedState: "active", clock: "2026-07-20T00:05:00.000Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "retain-integrity", expected: "v2.authority.expired", precedenceProbe: null },
  { id: "stale", eventPatch: { expiresAt: "2026-07-20T00:10:00.000Z" }, trustedState: "active", clock: "2026-07-20T00:05:00.001Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "rederive-and-sign", expected: "v2.authority.stale", precedenceProbe: { clock: "2026-07-20T00:10:00.000Z", expected: "v2.authority.expired" } },
  { id: "policy-mismatch", eventPatch: {}, trustedState: "policy2", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "retain-integrity", expected: "v2.authority.policy_mismatch", precedenceProbe: null },
  { id: "binding-workflow", eventPatch: { workflowId: "workflow-authority-2" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "rederive-and-sign", expected: "v2.authority.binding_mismatch", precedenceProbe: null },
  { id: "binding-plan-revision", eventPatch: { planRevision: 2 }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "rederive-and-sign", expected: "v2.authority.binding_mismatch", precedenceProbe: null },
  { id: "binding-step", eventPatch: { stepId: "step-authority-2" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "rederive-and-sign", expected: "v2.authority.binding_mismatch", precedenceProbe: null },
  { id: "binding-effect", eventPatch: { effectId: "effect-local-read-2" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "rederive-and-sign", expected: "v2.authority.binding_mismatch", precedenceProbe: null },
  { id: "binding-class", eventPatch: { effectClass: "local-write" }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "rederive-and-sign", expected: "v2.authority.binding_mismatch", precedenceProbe: null },
  { id: "binding-scope", eventPatch: { scopeDigest: EMPTY_DIGEST }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "rederive-and-sign", expected: "v2.authority.binding_mismatch", precedenceProbe: null },
  { id: "binding-input", eventPatch: { inputDigest: EMPTY_DIGEST }, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "rederive-and-sign", expected: "v2.authority.binding_mismatch", precedenceProbe: null },
  { id: "replayed", eventPatch: {}, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: true, nonceStateBefore: "consumed", nonceStateAfter: "consumed", integrity: "retain-integrity", expected: "v2.authority.replayed", precedenceProbe: null },
  { id: "verifier-unavailable", eventPatch: {}, trustedState: "active", clock: "2026-07-20T00:04:59.999Z", verifierAvailable: false, nonceStateBefore: "empty", nonceStateAfter: "empty", integrity: "retain-integrity", expected: "v2.authority.verifier_unavailable", precedenceProbe: null },
];

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hexBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/../g)?.map((octet) => Number.parseInt(octet, 16)) ?? []);
}

function jsonValue(value: unknown): V2JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") {
    const result: JsonObject = {};
    for (const [key, item] of Object.entries(value)) result[key] = jsonValue(item);
    return result;
  }
  throw new Error("Authority vector values must be JSON.");
}
function isJsonObject(value: V2JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


function authorityEventJson(event: V2AuthorityEvent): JsonObject {
  return {
    schemaVersion: event.schemaVersion,
    id: event.id,
    issuer: event.issuer,
    keyId: event.keyId,
    algorithm: event.algorithm,
    signedAt: event.signedAt,
    expiresAt: event.expiresAt,
    policyRevision: event.policyRevision,
    workflowId: event.workflowId,
    planRevision: event.planRevision,
    stepId: event.stepId,
    effectId: event.effectId,
    effectClass: event.effectClass,
    scopeDigest: event.scopeDigest,
    inputDigest: event.inputDigest,
    nonce: event.nonce,
    eventDigest: event.eventDigest,
    signature: event.signature,
  };
}

function requiredString(value: JsonObject, field: string): string {
  const result = value[field];
  if (typeof result !== "string") throw new Error(`Authority event ${field} must be a string.`);
  return result;
}

function requiredNumber(value: JsonObject, field: string): number {
  const result = value[field];
  if (typeof result !== "number") throw new Error(`Authority event ${field} must be a number.`);
  return result;
}

function unsignedAuthorityEvent(value: JsonObject): Omit<V2AuthorityEvent, "eventDigest" | "signature"> {
  const schemaVersion = requiredString(value, "schemaVersion");
  const algorithm = requiredString(value, "algorithm");
  const effectClass = requiredString(value, "effectClass");
  const scopeDigest = requiredString(value, "scopeDigest");
  const inputDigest = requiredString(value, "inputDigest");
  if (schemaVersion !== V2_AUTHORITY_EVENT_SCHEMA_VERSION || algorithm !== "Ed25519" || !isV2EffectClass(effectClass) || !isV2Digest(scopeDigest) || !isV2Digest(inputDigest)) {
    throw new Error("Authority event cannot be rederived.");
  }
  return {
    schemaVersion,
    id: requiredString(value, "id"),
    issuer: requiredString(value, "issuer"),
    keyId: requiredString(value, "keyId"),
    algorithm,
    signedAt: requiredString(value, "signedAt"),
    expiresAt: requiredString(value, "expiresAt"),
    policyRevision: requiredString(value, "policyRevision"),
    workflowId: requiredString(value, "workflowId"),
    planRevision: requiredNumber(value, "planRevision"),
    stepId: requiredString(value, "stepId"),
    effectId: requiredString(value, "effectId"),
    effectClass,
    scopeDigest,
    inputDigest,
    nonce: requiredString(value, "nonce"),
  };
}

function patchedEvent(event: V2AuthorityEvent, patch: JsonObject): JsonObject {
  const patched = authorityEventJson(event);
  for (const [field, value] of Object.entries(patch)) {
    if (field === "eventDigest") {
      if (!isJsonObject(value) || !isV2Digest(value.value)) {
        throw new Error("Authority event digest patch is invalid.");
      }
      patched.eventDigest = value.value;
    } else if (field === "signature") {
      patched.signature = base64Url(new Uint8Array(64));
    } else {
      patched[field] = value;
    }
  }
  return patched;
}

function digestFromHex(hex: string): V2Digest {
  const digest = `sha256:${hex}`;
  if (!isV2Digest(digest)) throw new Error("SHA-256 digest is invalid.");
  return digest;
}

async function sha256(value: string): Promise<V2Digest> {
  return digestFromHex(createHash("sha256").update(value, "utf8").digest("hex"));
}

async function privateKeyFromSeed() {
  const pkcs8Prefix = hexBytes("302e020100300506032b657004220420");
  const seed = hexBytes(RFC8032_VECTOR_1_SEED);
  const pkcs8 = new Uint8Array(pkcs8Prefix.length + seed.length);
  pkcs8.set(pkcs8Prefix);
  pkcs8.set(seed, pkcs8Prefix.length);
  const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const publicDer = new Uint8Array(createPublicKey(privateKey).export({ format: "der", type: "spki" }));
  if (base64Url(publicDer.slice(-32)) !== EXPECTED_PUBLIC_KEY) throw new Error("RFC 8032 vector 1 seed did not derive the frozen public key.");
  return privateKey;
}

async function signEvent(preimage: string, privateKey: Awaited<ReturnType<typeof privateKeyFromSeed>>): Promise<string> {
  return base64Url(new Uint8Array(sign(null, encoder.encode(preimage), privateKey)));
}

async function deriveEvent(event: Omit<V2AuthorityEvent, "eventDigest" | "signature">, privateKey: Awaited<ReturnType<typeof privateKeyFromSeed>>): Promise<{ readonly event: V2AuthorityEvent; readonly authorityEventPreimage: string; readonly signaturePreimage: string }> {
  const eventDigest = await digestV2AuthorityEvent({ ...event, eventDigest: EMPTY_DIGEST, signature: "" });
  const unsigned = { ...event, eventDigest };
  const signaturePreimage = authoritySignaturePreimageV2({ ...unsigned, signature: "" });
  const signature = await signEvent(signaturePreimage, privateKey);
  const complete = { ...unsigned, signature };
  return { event: complete, authorityEventPreimage: `boulder.v2.authority-event.v1\n${canonicalizeV2(jsonValue(event))}`, signaturePreimage };
}

async function materialize(): Promise<{ readonly baseline: string; readonly mutations: string }> {
  const privateKey = await privateKeyFromSeed();
  const policyDigest = await digestV2PolicySnapshot({ policyRevision: "policy-1", digest: EMPTY_DIGEST });
  const scopeDigest = await digestV2Scope({ kind: "path", resources: ["/fixture/authority-resource"], scopeDigest: EMPTY_DIGEST });
  const inputDigest = await digestV2Input({ value: { message: "authority" } });
  const planWithoutDigest = {
    schemaVersion: V2_PLAN_SCHEMA_VERSION,
    workflowId: "workflow-authority-1",
    planRevision: 1,
    intent: { id: "intent-authority-1", objective: "verify unsupported local read", acceptance: ["authority-verified", "effect-remains-unsupported"] },
    policySnapshot: { policyRevision: "policy-1", digest: policyDigest },
    steps: [{
      id: "step-authority-1",
      dependsOn: [],
      capabilityBinding: { capabilityId: "fixture-uppercase", capabilityVersion: "1.0.0", invocationId: "invoke-authority-1" },
      input: { schemaId: "org.example.fixture-input.v1", digest: inputDigest, value: { message: "authority" } },
      declaredEffects: [{ schemaVersion: V2_EFFECT_SCHEMA_VERSION, id: "effect-local-read-1", class: "local-read" as const, scope: { kind: "path", resources: ["/fixture/authority-resource"], scopeDigest }, inputDigest }],
      requiredEvidenceKinds: [],
    }],
    extensions: { "org.example.fixture": { label: "authority-vector" } },
  };
  const planDigest = await digestV2Plan({ ...planWithoutDigest, planDigest: EMPTY_DIGEST } satisfies V2Plan);
  const plan = { ...planWithoutDigest, planDigest } satisfies V2Plan;
  const eventBase: Omit<V2AuthorityEvent, "eventDigest" | "signature"> = {
    schemaVersion: V2_AUTHORITY_EVENT_SCHEMA_VERSION,
    id: "authority-event-1",
    issuer: "fixture-rfc8032",
    keyId: "rfc8032-vector-1",
    algorithm: "Ed25519",
    signedAt: "2026-07-20T00:00:00.000Z",
    expiresAt: "2026-07-20T00:05:00.000Z",
    policyRevision: "policy-1",
    workflowId: "workflow-authority-1",
    planRevision: 1,
    stepId: "step-authority-1",
    effectId: "effect-local-read-1",
    effectClass: "local-read",
    scopeDigest,
    inputDigest,
    nonce: "AAECAwQFBgcICQoLDA0ODw",
  };
  const baselineDerived = await deriveEvent(eventBase, privateKey);
  const envelope: V2ExecutionEnvelope = {
    schemaVersion: V2_EXECUTION_ENVELOPE_SCHEMA_VERSION,
    plan,
    authorityEvents: [baselineDerived.event],
    requestedStepId: "step-authority-1",
    extensions: { "org.example.fixture": { label: "authority-vector" } },
  };
  const namespace = "boulder.v2.authority-event.v1/fixture-rfc8032/rfc8032-vector-1/policy-1";
  const nonceStates = { empty: {}, consumed: { [namespace]: { "AAECAwQFBgcICQoLDA0ODw": "consumed" } } };
  const trustedStates = {
    active: { policyRevision: "policy-1", keys: [{ issuer: "fixture-rfc8032", keyId: "rfc8032-vector-1", status: "active", publicKey: EXPECTED_PUBLIC_KEY }] },
    revoked: { policyRevision: "policy-1", keys: [{ issuer: "fixture-rfc8032", keyId: "rfc8032-vector-1", status: "revoked", publicKey: EXPECTED_PUBLIC_KEY }] },
    policy2: { policyRevision: "policy-2", keys: [{ issuer: "fixture-rfc8032", keyId: "rfc8032-vector-1", status: "active", publicKey: EXPECTED_PUBLIC_KEY }] },
  };
  const source = {
    sourceSchemaVersion: "boulder.v2.authority-vector-source.v3",
    namespace,
    nonce: "AAECAwQFBgcICQoLDA0ODw",
    baseline: {
      fixtureVersion: FIXTURE_VERSION,
      trustedState: "active",
      clock: "2026-07-20T00:04:59.999Z",
      verifierAvailable: true,
      nonceStateBefore: "empty",
      envelope,
      authorityEvent: baselineDerived.event,
      expected: { authorityStatus: "verified", nonceStateAfter: "consumed", outcome: "v2.effect.unsupported", capabilityInvocations: 0 },
    },
    nonceStates,
    trustedStates,
    serialization,
    mutations,
  };
  const generationSetDigest = await sha256(canonicalizeV2(jsonValue(source)));
  const baselineWrapper = {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    fixtureVersion: FIXTURE_VERSION,
    generationSetDigest,
    trustedState: trustedStates.active,
    clock: "2026-07-20T00:04:59.999Z",
    verifierAvailable: true,
    nonceStateBefore: nonceStates.empty,
    envelope,
    authorityEventPreimage: baselineDerived.authorityEventPreimage,
    signaturePreimage: baselineDerived.signaturePreimage,
    expected: {
      authorityStatus: "verified",
      namespace,
      eventDigest: baselineDerived.event.eventDigest,
      signature: baselineDerived.event.signature,
      authorityEventPreimage: baselineDerived.authorityEventPreimage,
      signaturePreimage: baselineDerived.signaturePreimage,
      nonceStateAfter: "consumed",
      outcome: "v2.effect.unsupported",
      capabilityInvocations: 0,
    },
  };
  const baseline = `${canonicalizeV2(jsonValue(baselineWrapper))}\n`;
  const vectors: JsonObject[] = [];
  for (const mutation of mutations) {
    let event = patchedEvent(baselineDerived.event, mutation.eventPatch);
    if (mutation.integrity === "rederive-and-sign") {
      const derived = await deriveEvent(unsignedAuthorityEvent(event), privateKey);
      event = authorityEventJson(derived.event);
    }
    vectors.push({
      id: mutation.id,
      event,
      trustedState: jsonValue(trustedStates[mutation.trustedState]),
      clock: mutation.clock,
      verifierAvailable: mutation.verifierAvailable,
      nonceStateBefore: jsonValue(nonceStates[mutation.nonceStateBefore]),
      nonceStateAfter: jsonValue(nonceStates[mutation.nonceStateAfter]),
      integrity: mutation.integrity,
      expected: { firstReason: mutation.expected, nonceStateAfter: jsonValue(nonceStates[mutation.nonceStateAfter]) },
      precedenceProbe: mutation.precedenceProbe === null ? null : { clock: mutation.precedenceProbe.clock, firstReason: mutation.precedenceProbe.expected, nonceStateAfter: jsonValue(nonceStates.empty) },
    });
  }
  const mutationWrapper = {
    schemaVersion: MUTATION_SCHEMA_VERSION,
    fixtureVersion: FIXTURE_VERSION,
    generationSetDigest,
    baselineRef: BASELINE_REF,
    baselineSha256: await sha256(baseline),
    vectors,
  };
  return { baseline, mutations: `${canonicalizeV2(jsonValue(mutationWrapper))}\n` };
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${base64Url(crypto.getRandomValues(new Uint8Array(12)))}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

async function seedExclusionFiles(): Promise<readonly string[]> {
  const files: string[] = [];
  async function scan(path: string): Promise<void> {
    const relativePath = relative(REPOSITORY_ROOT, path);
    if (path === GENERATOR_PATH || SEED_EXCLUSION_WORKFLOW_METADATA.has(relativePath.split("/")[0])) return;
    try {
      const content = await readFile(path, "utf8");
      if (content.includes(RFC8032_VECTOR_1_SEED)) throw new Error(`RFC 8032 seed leaked to ${path}.`);
      files.push(path);
      return;
    } catch (error) {
      if (error instanceof Error && error.message.includes("RFC 8032 seed leaked")) throw error;
    }
    for (const entry of await readdir(path)) await scan(join(path, entry));
  }

  await scan(REPOSITORY_ROOT);
  return files;
}

async function assertSeedExclusion(): Promise<void> {
  const paths = await seedExclusionFiles();
  const covered = new Set(paths.map((path) => relative(REPOSITORY_ROOT, path)));
  for (const path of SEED_EXCLUSION_COVERAGE) {
    if (!covered.has(path)) throw new Error(`Seed-exclusion scanner did not cover ${path}.`);
  }
}

export async function generateAuthorityVectorFiles(): Promise<void> {
  const generated = await materialize();
  await atomicWrite(BASELINE_PATH, generated.baseline);
  await atomicWrite(MUTATIONS_PATH, generated.mutations);
}

export async function checkAuthorityVectorFiles(): Promise<void> {
  const generated = await materialize();
  if (await readFile(BASELINE_PATH, "utf8") !== generated.baseline) throw new Error("Authority baseline fixture is not generated deterministically.");
  if (await readFile(MUTATIONS_PATH, "utf8") !== generated.mutations) throw new Error("Authority mutation fixture is not generated deterministically.");
  await assertSeedExclusion();
}

function isGeneratorMain(): boolean {
  const entry = Bun.argv[1];
  return entry !== undefined && resolve(entry) === GENERATOR_PATH;
}

if (isGeneratorMain()) {
  if (Bun.argv.slice(2).join(" ") === "--check") await checkAuthorityVectorFiles();
  else if (Bun.argv.length === 2) await generateAuthorityVectorFiles();
  else throw new Error("Usage: bun test/v2-authority-vectors.generate.ts [--check]");
}
