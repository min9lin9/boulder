import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";
import { canonicalizeV2 } from "../src/v2/canonical.js";
import { createV2FixtureCapabilityRegistry } from "../src/v2/capability.js";
import { createV2FixtureCritiqueEvaluator } from "../src/v2/critique.js";
import { executeV2Envelope } from "../src/v2/execution.js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type ObjectValue = { [key: string]: Json };
function jsonValue(value: unknown): Json {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") {
    const result: ObjectValue = {};
    for (const [key, item] of Object.entries(value)) result[key] = jsonValue(item);
    return result;
  }
  throw new Error("Fixture value must be JSON.");
}

function objectValue(value: unknown, field: string): ObjectValue {
  const json = jsonValue(value);
  if (typeof json !== "object" || json === null || Array.isArray(json)) throw new Error(`${field} must be a JSON object.`);
  return json;
}

function objectField(value: ObjectValue, field: string): ObjectValue {
  return objectValue(value[field], field);
}

function arrayField(value: ObjectValue, field: string): Json[] {
  const result = value[field];
  if (!Array.isArray(result)) throw new Error(`${field} must be a JSON array.`);
  return result;
}

function firstValue(values: readonly Json[], field: string): Json {
  const result = values[0];
  if (result === undefined) throw new Error(`${field} must not be empty.`);
  return result;
}

function firstObject(values: readonly Json[], field: string): ObjectValue {
  return objectValue(firstValue(values, field), field);
}

function objectArrayField(value: ObjectValue, field: string): ObjectValue[] {
  return arrayField(value, field).map((item, index) => objectValue(item, `${field}[${index}]`));
}

function stringField(value: ObjectValue, field: string): string {
  const result = value[field];
  if (typeof result !== "string") throw new Error(`${field} must be a string.`);
  return result;
}

const root = join(import.meta.dir, "..");
const baselinePath = join(root, "fixtures", "v2-kernel", "valid-ed25519-authority-unsupported-effect.json");
const noneExecutionPath = join(root, "fixtures", "v2-kernel", "valid-none-effect-execution.json");
const noneExecutionNow = "2026-07-20T00:04:59.999Z";
const approvedNoneExecutionFixtureDigest = "sha256:df3a2d6da157837886206a2512e50868e1b468b9b48dbcf5ce4bba582cc7c754";
const mutationsPath = join(root, "fixtures", "v2-kernel", "invalid-authority-vectors.json");
const generatorPath = join(root, "test", "v2-authority-vectors.generate.ts");
const publicKey = "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo";
const namespace = "boulder.v2.authority-event.v1/fixture-rfc8032/rfc8032-vector-1/policy-1";
const nonce = "AAECAwQFBgcICQoLDA0ODw";
const zeroDigest = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

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

const expectedMutations = [
  ["algorithm-unsupported", "v2.authority.algorithm_unsupported", "empty", "empty", "retain-integrity", { algorithm: "Ed448" }, null],
  ["key-unknown", "v2.authority.key_unknown", "empty", "empty", "retain-integrity", { keyId: "rfc8032-vector-1-unknown" }, null],
  ["key-revoked", "v2.authority.key_revoked", "empty", "empty", "retain-integrity", {}, null],
  ["event-digest-invalid", "v2.authority.event_digest_invalid", "empty", "empty", "corrupt-event-digest-only; retain-signature", { eventDigest: { operation: "set-sha256-zero-32", value: zeroDigest } }, null],
  ["signature-invalid", "v2.authority.signature_invalid", "empty", "empty", "corrupt-signature-only; retain-event-digest", { signature: { operation: "set-base64url-zero-64", bytes: 64, value: "base64url(64*0x00)" } }, null],
  ["timestamp-invalid", "v2.authority.timestamp_invalid", "empty", "empty", "rederive-and-sign", { signedAt: "not-a-timestamp" }, null],
  ["expired", "v2.authority.expired", "empty", "empty", "retain-integrity", {}, null],
  ["stale", "v2.authority.stale", "empty", "empty", "rederive-and-sign", { expiresAt: "2026-07-20T00:10:00.000Z" }, { clock: "2026-07-20T00:10:00.000Z", expected: "v2.authority.expired" }],
  ["policy-mismatch", "v2.authority.policy_mismatch", "empty", "empty", "retain-integrity", {}, null],
  ["binding-workflow", "v2.authority.binding_mismatch", "empty", "empty", "rederive-and-sign", { workflowId: "workflow-authority-2" }, null],
  ["binding-plan-revision", "v2.authority.binding_mismatch", "empty", "empty", "rederive-and-sign", { planRevision: 2 }, null],
  ["binding-step", "v2.authority.binding_mismatch", "empty", "empty", "rederive-and-sign", { stepId: "step-authority-2" }, null],
  ["binding-effect", "v2.authority.binding_mismatch", "empty", "empty", "rederive-and-sign", { effectId: "effect-local-read-2" }, null],
  ["binding-class", "v2.authority.binding_mismatch", "empty", "empty", "rederive-and-sign", { effectClass: "local-write" }, null],
  ["binding-scope", "v2.authority.binding_mismatch", "empty", "empty", "rederive-and-sign", { scopeDigest: zeroDigest }, null],
  ["binding-input", "v2.authority.binding_mismatch", "empty", "empty", "rederive-and-sign", { inputDigest: zeroDigest }, null],
  ["replayed", "v2.authority.replayed", "consumed", "consumed", "retain-integrity", {}, null],
  ["verifier-unavailable", "v2.authority.verifier_unavailable", "empty", "empty", "retain-integrity", {}, null],
] as const;

function canonicalize(value: Json): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw new Error("Invalid I-JSON number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length !== Object.keys(value).length) throw new Error("Sparse fixture arrays are not I-JSON.");
    return `[${value.map(canonicalize).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function omit(event: ObjectValue, ...fields: readonly string[]): ObjectValue {
  const result: ObjectValue = {};
  for (const [key, value] of Object.entries(event)) if (!fields.includes(key)) result[key] = value;
  return result;
}

function authorityPreimage(event: ObjectValue): string {
  return `boulder.v2.authority-event.v1\n${canonicalize(omit(event, "eventDigest", "signature"))}`;
}

function signaturePreimage(event: ObjectValue): string {
  return `boulder.v2.authority-signature.v1\n${canonicalize(omit(event, "signature"))}`;
}

function nonceState(name: "empty" | "consumed"): ObjectValue {
  return name === "empty" ? {} : { [namespace]: { [nonce]: "consumed" } };
}

function trustedState(status: "active" | "revoked", policyRevision = "policy-1"): ObjectValue {
  return { policyRevision, keys: [{ issuer: "fixture-rfc8032", keyId: "rfc8032-vector-1", status, publicKey }] };
}

const frozenPolicyProjection: ObjectValue = { policyRevision: "policy-1" };
const frozenScopeProjection: ObjectValue = { kind: "path", resources: ["/fixture/authority-resource"] };
const frozenInputProjection: ObjectValue = { message: "authority" };
const frozenEvent: ObjectValue = {
  schemaVersion: "boulder.v2.authority-event.v1",
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
  scopeDigest: "sha256:c8af3cb695a7978f5d196d2ec716556e8506090d847c81bb19fb2c23c13d2bc1",
  inputDigest: "sha256:42dca349078571613068ad58d483d13016d06310673ee444382580c570cfc622",
  nonce,
  eventDigest: "sha256:8fb1295d04b4517f5b05d018b9a1d725842e62800fc8b91620692b761b44a325",
  signature: "eICKWspsU-ZxE_knBc1XD3lQJXSZBUEEQfrmygPo8aYZd4m2_GGjr54fLEyoDATlyryV0f9awSN77fgkhm1UBQ",
};
const frozenPlan: ObjectValue = {
  schemaVersion: "boulder.v2.plan.v1",
  workflowId: "workflow-authority-1",
  planRevision: 1,
  intent: { id: "intent-authority-1", objective: "verify unsupported local read", acceptance: ["authority-verified", "effect-remains-unsupported"] },
  policySnapshot: { policyRevision: "policy-1", digest: "sha256:389c3257e3101ced1d432e37e7aaad7a5fd2fce92b19c572e12c94da102f8dcd" },
  steps: [{
    id: "step-authority-1",
    dependsOn: [],
    capabilityBinding: { capabilityId: "fixture-uppercase", capabilityVersion: "1.0.0", invocationId: "invoke-authority-1" },
    input: { schemaId: "org.example.fixture-input.v1", digest: frozenEvent.inputDigest, value: frozenInputProjection },
    declaredEffects: [{
      schemaVersion: "boulder.v2.effect.v1",
      id: "effect-local-read-1",
      class: "local-read",
      scope: { ...frozenScopeProjection, scopeDigest: frozenEvent.scopeDigest },
      inputDigest: frozenEvent.inputDigest,
    }],
    requiredEvidenceKinds: [],
  }],
  extensions: { "org.example.fixture": { label: "authority-vector" } },
  planDigest: "sha256:f9481a18b612fab6c4136c63062445e82e7c5e3ddd1451e2e5f5e234f98f22ee",
};
const frozenEnvelope: ObjectValue = {
  schemaVersion: "boulder.v2.execution-envelope.v1",
  plan: frozenPlan,
  authorityEvents: [frozenEvent],
  requestedStepId: "step-authority-1",
  extensions: { "org.example.fixture": { label: "authority-vector" } },
};
const frozenTrustedStates: ObjectValue = {
  active: trustedState("active"),
  revoked: trustedState("revoked"),
  policy2: trustedState("active", "policy-2"),
};
const frozenSource: ObjectValue = {
  sourceSchemaVersion: "boulder.v2.authority-vector-source.v3",
  namespace,
  nonce,
  baseline: {
    fixtureVersion: "boulder.v2.authority-vector.v1",
    trustedState: "active",
    clock: "2026-07-20T00:04:59.999Z",
    verifierAvailable: true,
    nonceStateBefore: "empty",
    envelope: frozenEnvelope,
    authorityEvent: frozenEvent,
    expected: { authorityStatus: "verified", nonceStateAfter: "consumed", outcome: "v2.effect.unsupported", capabilityInvocations: 0 },
  },
  nonceStates: { empty: {}, consumed: nonceState("consumed") },
  trustedStates: frozenTrustedStates,
  serialization,
  mutations: expectedMutations.map(([id, expected, before, after, integrity, eventPatch, precedenceProbe]) => ({
    id,
    eventPatch,
    trustedState: id === "key-revoked" ? "revoked" : id === "policy-mismatch" ? "policy2" : "active",
    clock: id === "expired" ? "2026-07-20T00:05:00.000Z" : id === "stale" ? "2026-07-20T00:05:00.001Z" : "2026-07-20T00:04:59.999Z",
    verifierAvailable: id !== "verifier-unavailable",
    nonceStateBefore: before,
    nonceStateAfter: after,
    integrity,
    expected,
    precedenceProbe,
  })),
};
const approvedDigests = {
  policy: "sha256:389c3257e3101ced1d432e37e7aaad7a5fd2fce92b19c572e12c94da102f8dcd",
  scope: "sha256:c8af3cb695a7978f5d196d2ec716556e8506090d847c81bb19fb2c23c13d2bc1",
  input: "sha256:42dca349078571613068ad58d483d13016d06310673ee444382580c570cfc622",
  plan: "sha256:f9481a18b612fab6c4136c63062445e82e7c5e3ddd1451e2e5f5e234f98f22ee",
  event: "sha256:8fb1295d04b4517f5b05d018b9a1d725842e62800fc8b91620692b761b44a325",
  set: "sha256:cae1b30b108761597e83350dd359206a87edc629231f7fcbffba9cc599117b65",
  baselineOutput: "sha256:0172bc8c3241db159f45b45d5320a466e612856afa2ca6c3478d6d55f5fda750",
  mutationOutput: "sha256:88ed614d1757525c543d86e71b301887b9160465ea9b5126193045d4d0d388ec",
} as const;
const seedExclusionWorkflowMetadata = new Set([".git", ".gjc", ".boulder", ".codegraph", ".code-review-graph", ".omo", "node_modules"]);
const seedExclusionCoverage = [
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

async function fixture(path: string): Promise<{ readonly bytes: string; readonly value: ObjectValue }> {
  const bytes = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(bytes);
  return { bytes, value: objectValue(parsed, path) };
}

async function filesUnder(path: string): Promise<readonly string[]> {
  const relativePath = relative(root, path);
  if (path === generatorPath || seedExclusionWorkflowMetadata.has(relativePath.split("/")[0])) return [];
  try {
    await readFile(path, "utf8");
    return [path];
  } catch {
    const entries = await readdir(path);
    return (await Promise.all(entries.map((entry) => filesUnder(join(path, entry))))).flat();
  }
}

describe("v2 authority vectors", () => {
  test("are canonical, cryptographically valid, and generation-linked", async () => {
    const baselineFixture = await fixture(baselinePath);
    const mutationFixture = await fixture(mutationsPath);
    for (const candidate of [baselineFixture, mutationFixture]) {
      expect(candidate.bytes.endsWith("\n")).toBe(true);
      expect(candidate.bytes.endsWith("\n\n")).toBe(false);
      expect(candidate.bytes).toBe(`${canonicalize(candidate.value)}\n`);
    }
    const baseline = baselineFixture.value;
    const mutation = mutationFixture.value;
    expect(baseline.schemaVersion).toBe(serialization.baselineWrapperSchemaVersion);
    expect(mutation.schemaVersion).toBe(serialization.mutationWrapperSchemaVersion);
    expect(Object.keys(baseline).sort()).toEqual([...serialization.baselineWrapperKeys].sort());
    expect(Object.keys(mutation).sort()).toEqual([...serialization.mutationWrapperKeys].sort());
    expect(sha256(baselineFixture.bytes)).toBe(approvedDigests.baselineOutput);
    expect(sha256(mutationFixture.bytes)).toBe(approvedDigests.mutationOutput);
    expect(baseline.generationSetDigest).toBe(approvedDigests.set);
    expect(mutation.generationSetDigest).toBe(approvedDigests.set);
    expect(mutation.baselineRef).toBe("fixtures/v2-kernel/valid-ed25519-authority-unsupported-effect.json");
    expect(mutation.baselineSha256).toBe(approvedDigests.baselineOutput);
    expect(sha256(canonicalize(frozenSource))).toBe(approvedDigests.set);

    expect(canonicalize(frozenPolicyProjection)).toBe('{"policyRevision":"policy-1"}');
    expect(sha256(`boulder.v2.policy.v1\n${canonicalize(frozenPolicyProjection)}`)).toBe(approvedDigests.policy);
    expect(canonicalize(frozenScopeProjection)).toBe('{"kind":"path","resources":["/fixture/authority-resource"]}');
    expect(sha256(`boulder.v2.scope.v1\n${canonicalize(frozenScopeProjection)}`)).toBe(approvedDigests.scope);
    expect(canonicalize(frozenInputProjection)).toBe('{"message":"authority"}');
    expect(sha256(`boulder.v2.input.v1\n${canonicalize(frozenInputProjection)}`)).toBe(approvedDigests.input);
    expect(sha256(`boulder.v2.plan.v1\n${canonicalize(omit(frozenPlan, "planDigest"))}`)).toBe(approvedDigests.plan);
    expect(sha256(authorityPreimage(frozenEvent))).toBe(approvedDigests.event);

    expect(baseline.trustedState).toEqual(frozenTrustedStates.active);
    expect(baseline.envelope).toEqual(frozenEnvelope);
    const event = firstObject(arrayField(objectField(baseline, "envelope"), "authorityEvents"), "authorityEvents");
    expect(event).toEqual(frozenEvent);
    const expected = objectField(baseline, "expected");
    const authorityEventPreimage = authorityPreimage(frozenEvent);
    const frozenSignaturePreimage = signaturePreimage(frozenEvent);
    expect(baseline.authorityEventPreimage).toBe(authorityEventPreimage);
    expect(expected.authorityEventPreimage).toBe(authorityEventPreimage);
    expect(baseline.signaturePreimage).toBe(frozenSignaturePreimage);
    expect(expected.signaturePreimage).toBe(frozenSignaturePreimage);
    expect(event.eventDigest).toBe(approvedDigests.event);
    expect(expected).toEqual({
      authorityStatus: "verified",
      namespace,
      eventDigest: approvedDigests.event,
      signature: frozenEvent.signature,
      authorityEventPreimage,
      signaturePreimage: frozenSignaturePreimage,
      nonceStateAfter: "consumed",
      outcome: "v2.effect.unsupported",
      capabilityInvocations: 0,
    });
    const spki = new Uint8Array([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00, ...decodeBase64Url(publicKey)]);
    const key = createPublicKey({ key: spki, format: "der", type: "spki" });
    expect(verify(null, new TextEncoder().encode(frozenSignaturePreimage), key, decodeBase64Url(stringField(event, "signature")))).toBe(true);
  });
  test("pins canonical none-effect bytes, omitted authority, and the complete generated digest chain", async () => {
    const noneFixture = await fixture(noneExecutionPath);
    expect(noneFixture.bytes).toBe(`${canonicalize(noneFixture.value)}\n`);
    expect(sha256(noneFixture.bytes)).toBe(approvedNoneExecutionFixtureDigest);
    expect(Object.hasOwn(noneFixture.value, "authorityEvents")).toBe(false);

    const outcome = await executeV2Envelope(noneFixture.value, {
      capabilityRegistry: createV2FixtureCapabilityRegistry(),
      critiqueEvaluator: await createV2FixtureCritiqueEvaluator(),
      now: noneExecutionNow,
    });
    expect(outcome).toEqual({
      status: "succeeded",
      lifecycle: "critiqued",
      gate: { status: "allowed-no-authority" },
      artifacts: [{
        schemaVersion: "boulder.v2.artifact.v1",
        id: "artifact-1",
        kind: "fixture-summary",
        schemaId: "org.example.fixture-summary.v1",
        subjectPlanDigest: "sha256:682409ebcd3075d7fe315af78f0417a4f368c494e1cc91722194f42621dc48d5",
        stepId: "step-1",
        inputDigest: "sha256:61dfca047dac4db1c9206c8a27dced51f1fd22d9baa4fb9ef03a0dfc0a7424cd",
        contentDigest: "sha256:406578a47582ed0bf9a9e555c6d872adcfea30143088cc50009af2c1025b4a9c",
        content: { canonicalMessage: "BOULDER", length: 7 },
        artifactDigest: "sha256:3e3da9f9f7ae0ad5c40cb119430eb8d523e3ce0b20bbb2b317c0392ca21bd01d",
      }],
      evidence: [{
        schemaVersion: "boulder.v2.evidence.v1",
        id: "evidence-1",
        kind: "fixture-transform",
        subjectArtifactId: "artifact-1",
        subjectArtifactDigest: "sha256:3e3da9f9f7ae0ad5c40cb119430eb8d523e3ce0b20bbb2b317c0392ca21bd01d",
        producer: { id: "fixture-uppercase", version: "1.0.0" },
        observedAt: noneExecutionNow,
        payload: { output: "BOULDER" },
        digest: "sha256:3aa497a67038b5e2329e9796f5cb7ce442f90f80b414a01b862b6baf5cdb43eb",
      }],
      result: {
        schemaVersion: "boulder.v2.execution-result.v1",
        workflowId: "workflow-1",
        planDigest: "sha256:682409ebcd3075d7fe315af78f0417a4f368c494e1cc91722194f42621dc48d5",
        stepId: "step-1",
        invocationId: "invoke-1",
        capability: { id: "fixture-uppercase", version: "1.0.0" },
        status: "succeeded",
        artifactIds: ["artifact-1"],
        artifactDigests: ["sha256:3e3da9f9f7ae0ad5c40cb119430eb8d523e3ce0b20bbb2b317c0392ca21bd01d"],
        evidenceIds: ["evidence-1"],
        evidenceDigests: ["sha256:3aa497a67038b5e2329e9796f5cb7ce442f90f80b414a01b862b6baf5cdb43eb"],
        resultDigest: "sha256:f810e6baae0baa5e182654e89ac1936bf5de51b53157ddbd2834ef5f801797eb",
      },
      critique: {
        schemaVersion: "boulder.v2.critique.v1",
        targetResultDigest: "sha256:f810e6baae0baa5e182654e89ac1936bf5de51b53157ddbd2834ef5f801797eb",
        targetArtifactIds: ["artifact-1"],
        targetArtifactDigests: ["sha256:3e3da9f9f7ae0ad5c40cb119430eb8d523e3ce0b20bbb2b317c0392ca21bd01d"],
        evidenceIds: ["evidence-1"],
        evidenceDigests: ["sha256:3aa497a67038b5e2329e9796f5cb7ce442f90f80b414a01b862b6baf5cdb43eb"],
        evaluator: {
          id: "fixture-evaluator",
          version: "1.0.0",
          policyDigest: "sha256:b0bd7eb26b46393fd3e84c80d063976dd33e6d58e62f2bf02579283ab73d1473",
        },
        verdict: "pass",
        findings: [],
        critiqueDigest: "sha256:f28ad747d444f49d17b61b34f63242062ab644712c393f84e437681a86024760",
      },
    });
  });

  test("preserve all ordered first-reason, nonce, integrity, and precedence vectors", async () => {
    const { value: mutation } = await fixture(mutationsPath);
    const vectors = objectArrayField(mutation, "vectors");
    expect(vectors).toHaveLength(18);
    const signedIds = new Set(["timestamp-invalid", "stale", "binding-workflow", "binding-plan-revision", "binding-step", "binding-effect", "binding-class", "binding-scope", "binding-input", "key-revoked", "expired", "policy-mismatch", "replayed", "verifier-unavailable"]);
    const spki = new Uint8Array([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00, ...decodeBase64Url(publicKey)]);
    const key = createPublicKey({ key: spki, format: "der", type: "spki" });
    for (const [index, expected] of expectedMutations.entries()) {
      const [id, reason, before, after, integrity, eventPatch] = expected;
      const vector = objectValue(vectors[index], `vectors[${index}]`);
      expect(Object.keys(vector).sort()).toEqual([...serialization.mutationVectorKeys].sort());
      expect(vector.id).toBe(id);
      expect(objectField(vector, "expected").firstReason).toBe(reason);
      expect(Object.keys(objectField(vector, "expected")).sort()).toEqual([...serialization.mutationExpectedKeys].sort());
      expect(vector.integrity).toBe(integrity);
      expect(vector.nonceStateBefore).toEqual(nonceState(before));
      expect(vector.nonceStateAfter).toEqual(nonceState(after));
      expect(objectField(vector, "expected").nonceStateAfter).toEqual(nonceState(after));
      expect(vector.trustedState).toEqual(id === "key-revoked" ? trustedState("revoked") : id === "policy-mismatch" ? trustedState("active", "policy-2") : trustedState("active"));
      expect(vector.clock).toBe(id === "expired" ? "2026-07-20T00:05:00.000Z" : id === "stale" ? "2026-07-20T00:05:00.001Z" : "2026-07-20T00:04:59.999Z");
      expect(vector.verifierAvailable).toBe(id !== "verifier-unavailable");
      const event = objectField(vector, "event");
      for (const [field, value] of Object.entries(objectValue(eventPatch, `${id}.eventPatch`))) {
        if (field === "eventDigest") expect(event.eventDigest).toBe(stringField(objectValue(value, `${id}.eventDigest`), "value"));
        else if (field === "signature") expect(Array.from(decodeBase64Url(stringField(event, "signature")))).toEqual(Array.from(new Uint8Array(64)));
        else expect(event[field]).toEqual(value);
      }
      const digestMatches = event.eventDigest === sha256(authorityPreimage(event));
      expect(digestMatches).toBe(id !== "event-digest-invalid" && id !== "algorithm-unsupported" && id !== "key-unknown");
      expect(verify(null, new TextEncoder().encode(signaturePreimage(event)), key, decodeBase64Url(stringField(event, "signature")))).toBe(signedIds.has(id));
      if (id === "signature-invalid") expect(event.eventDigest).toBe(frozenEvent.eventDigest);
      if (id === "timestamp-invalid") expect(event.signedAt).toBe("not-a-timestamp");
      if (id === "stale") {
        expect(Object.keys(objectField(vector, "precedenceProbe")).sort()).toEqual([...serialization.precedenceProbeKeys].sort());
        expect(vector.precedenceProbe).toEqual({ clock: "2026-07-20T00:10:00.000Z", firstReason: "v2.authority.expired", nonceStateAfter: {} });
      } else expect(vector.precedenceProbe).toBeNull();
    }
  });

  test("rejects sparse arrays before canonical serialization", () => {
    const sparse = ["first", , "third"] as unknown as Json;
    let message = "";
    try {
      canonicalizeV2(sparse);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe("Arrays cannot be sparse.");
  });

  test("keeps the RFC seed exclusively in the generator across product surfaces", async () => {
    const generator = await readFile(generatorPath, "utf8");
    const seed = generator.match(/RFC8032_VECTOR_1_SEED\s*=\s*"([0-9a-f]{64})"/)?.[1];
    if (seed === undefined) throw new Error("Generator seed is missing.");
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    const files = await filesUnder(root);
    const covered = new Set(files.map((path) => relative(root, path)));
    for (const path of seedExclusionCoverage) expect(covered.has(path)).toBe(true);
    for (const path of files) {
      if (path !== generatorPath) expect((await readFile(path, "utf8")).includes(seed)).toBe(false);
    }
  });
});
