export const V2_PLAN_SCHEMA_VERSION = "boulder.v2.plan.v1" as const;
export const V2_EFFECT_SCHEMA_VERSION = "boulder.v2.effect.v1" as const;
export const V2_AUTHORITY_EVENT_SCHEMA_VERSION = "boulder.v2.authority-event.v1" as const;
export const V2_ARTIFACT_SCHEMA_VERSION = "boulder.v2.artifact.v1" as const;
export const V2_EVIDENCE_SCHEMA_VERSION = "boulder.v2.evidence.v1" as const;
export const V2_EXECUTION_RESULT_SCHEMA_VERSION = "boulder.v2.execution-result.v1" as const;
export const V2_CRITIQUE_SCHEMA_VERSION = "boulder.v2.critique.v1" as const;
export const V2_EXECUTION_ENVELOPE_SCHEMA_VERSION = "boulder.v2.execution-envelope.v1" as const;

export const V2_EFFECT_CLASSES = [
  "none", "local-read", "local-write", "remote-read", "remote-write",
  "communicate", "financial", "identity", "signing", "destructive",
] as const;

export type V2EffectClass = (typeof V2_EFFECT_CLASSES)[number];
export type V2Digest = `sha256:${string}`;
export type V2Id = string;
export type V2JsonPrimitive = string | number | boolean | null;
export type V2JsonValue = V2JsonPrimitive | readonly V2JsonValue[] | { readonly [key: string]: V2JsonValue };
export type V2Extensions = Readonly<Record<string, V2JsonValue>>;

export interface V2PolicySnapshot {
  readonly policyRevision: string;
  readonly digest: V2Digest;
}

export interface V2Intent {
  readonly id: V2Id;
  readonly objective: string;
  readonly acceptance: readonly string[];
}

export interface V2Scope {
  readonly kind: string;
  readonly resources: readonly string[];
  readonly scopeDigest: V2Digest;
}

export interface V2EffectDeclaration {
  readonly schemaVersion: typeof V2_EFFECT_SCHEMA_VERSION;
  readonly id: V2Id;
  readonly class: V2EffectClass;
  readonly scope: V2Scope;
  readonly inputDigest: V2Digest;
}

export interface V2CapabilityBinding {
  readonly capabilityId: V2Id;
  readonly capabilityVersion: string;
  readonly invocationId: V2Id;
}

export interface V2TypedInput {
  readonly schemaId: string;
  readonly digest: V2Digest;
  readonly value: V2JsonValue;
}

export interface V2Step {
  readonly id: V2Id;
  readonly dependsOn: readonly V2Id[];
  readonly capabilityBinding: V2CapabilityBinding;
  readonly input: V2TypedInput;
  readonly declaredEffects: readonly V2EffectDeclaration[];
  readonly requiredEvidenceKinds: readonly string[];
}

export interface V2Plan {
  readonly schemaVersion: typeof V2_PLAN_SCHEMA_VERSION;
  readonly workflowId: V2Id;
  readonly planRevision: number;
  readonly intent: V2Intent;
  readonly policySnapshot: V2PolicySnapshot;
  readonly steps: readonly V2Step[];
  readonly extensions: V2Extensions;
  readonly planDigest: V2Digest;
}

export interface V2AuthorityEvent {
  readonly schemaVersion: typeof V2_AUTHORITY_EVENT_SCHEMA_VERSION;
  readonly id: V2Id;
  readonly issuer: string;
  readonly keyId: string;
  readonly algorithm: "Ed25519";
  readonly signedAt: string;
  readonly expiresAt: string;
  readonly policyRevision: string;
  readonly workflowId: V2Id;
  readonly planRevision: number;
  readonly stepId: V2Id;
  readonly effectId: V2Id;
  readonly effectClass: V2EffectClass;
  readonly scopeDigest: V2Digest;
  readonly inputDigest: V2Digest;
  readonly nonce: string;
  readonly eventDigest: V2Digest;
  readonly signature: string;
}

export interface V2Artifact {
  readonly schemaVersion: typeof V2_ARTIFACT_SCHEMA_VERSION;
  readonly id: V2Id;
  readonly kind: string;
  readonly schemaId: string;
  readonly subjectPlanDigest: V2Digest;
  readonly stepId: V2Id;
  readonly inputDigest: V2Digest;
  readonly contentDigest: V2Digest;
  readonly content: V2JsonValue;
  readonly artifactDigest: V2Digest;
}

export interface V2EvidenceProducer {
  readonly id: V2Id;
  readonly version: string;
}

export interface V2Evidence {
  readonly schemaVersion: typeof V2_EVIDENCE_SCHEMA_VERSION;
  readonly id: V2Id;
  readonly kind: string;
  readonly subjectArtifactId: V2Id;
  readonly subjectArtifactDigest: V2Digest;
  readonly producer: V2EvidenceProducer;
  readonly observedAt: string;
  readonly digest: V2Digest;
  readonly payload: V2JsonValue;
}

export type V2ExecutionStatus = "succeeded" | "blocked";
export interface V2ExecutionFailure {
  readonly code: string;
  readonly message: string;
}
export interface V2ExecutionResult {
  readonly schemaVersion: typeof V2_EXECUTION_RESULT_SCHEMA_VERSION;
  readonly workflowId: V2Id;
  readonly planDigest: V2Digest;
  readonly stepId: V2Id;
  readonly invocationId: V2Id;
  readonly capability: V2EvidenceProducer;
  readonly status: V2ExecutionStatus;
  readonly artifactIds: readonly V2Id[];
  readonly artifactDigests: readonly V2Digest[];
  readonly evidenceIds: readonly V2Id[];
  readonly evidenceDigests: readonly V2Digest[];
  readonly resultDigest: V2Digest;
  readonly failure?: V2ExecutionFailure;
}

export type V2CritiqueVerdict = "pass" | "revise" | "human-review" | "reject";
export type V2FindingSeverity = "info" | "warning" | "error";
export interface V2CritiqueFinding {
  readonly id: string;
  readonly severity: V2FindingSeverity;
  readonly message: string;
}
export interface V2EvaluatorProvenance {
  readonly id: V2Id;
  readonly version: string;
  readonly policyDigest: V2Digest;
}
export interface V2Critique {
  readonly schemaVersion: typeof V2_CRITIQUE_SCHEMA_VERSION;
  readonly targetResultDigest: V2Digest;
  readonly targetArtifactIds: readonly V2Id[];
  readonly targetArtifactDigests: readonly V2Digest[];
  readonly evidenceIds: readonly V2Id[];
  readonly evidenceDigests: readonly V2Digest[];
  readonly evaluator: V2EvaluatorProvenance;
  readonly verdict: V2CritiqueVerdict;
  readonly findings: readonly V2CritiqueFinding[];
  readonly critiqueDigest: V2Digest;
}

export interface V2ExecutionEnvelope {
  readonly schemaVersion: typeof V2_EXECUTION_ENVELOPE_SCHEMA_VERSION;
  readonly plan: V2Plan;
  readonly authorityEvents?: readonly V2AuthorityEvent[];
  readonly requestedStepId: V2Id;
  readonly extensions: V2Extensions;
}

export interface V2AuthorityBinding {
  readonly policyRevision: string;
  readonly workflowId: V2Id;
  readonly planRevision: number;
  readonly stepId: V2Id;
  readonly effectId: V2Id;
  readonly effectClass: V2EffectClass;
  readonly scopeDigest: V2Digest;
  readonly inputDigest: V2Digest;
}

export type V2AuthorityVerification =
  | { readonly status: "verified"; readonly reasonCode: "v2.authority.verified" }
  | { readonly status: "unavailable"; readonly reasonCode: "v2.authority.verifier_unavailable" }
  | { readonly status: "rejected"; readonly reasonCode: string };

export interface V2AuthorityVerifier {
  verifyAndConsume(
    event: V2AuthorityEvent,
    requiredBinding: V2AuthorityBinding,
    now: string,
  ): Promise<V2AuthorityVerification> | V2AuthorityVerification;
}

export const V2_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
export const V2_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const V2_EXTENSION_KEY_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const V2_RFC3339_MILLIS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const V2_BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isV2Id(value: unknown): value is V2Id {
  return typeof value === "string" && V2_ID_PATTERN.test(value);
}
export function isV2Digest(value: unknown): value is V2Digest {
  return typeof value === "string" && V2_DIGEST_PATTERN.test(value);
}
export function isV2EffectClass(value: unknown): value is V2EffectClass {
  return typeof value === "string" && (V2_EFFECT_CLASSES as readonly string[]).includes(value);
}
export function isV2ExtensionKey(value: unknown): value is string {
  return typeof value === "string" && V2_EXTENSION_KEY_PATTERN.test(value);
}
export function isV2Rfc3339Millis(value: unknown): value is string {
  if (typeof value !== "string" || !V2_RFC3339_MILLIS_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}
export function isV2Base64Url(value: unknown, minimumBytes: number, maximumBytes: number): value is string {
  if (typeof value !== "string" || !V2_BASE64URL_PATTERN.test(value) || value.includes("=") || value.length % 4 === 1) return false;
  try {
    const decoded = atob(`${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - value.length % 4) % 4)}`);
    const canonical = btoa(decoded).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return decoded.length >= minimumBytes && decoded.length <= maximumBytes && canonical === value;
  } catch {
    return false;
  }
}
