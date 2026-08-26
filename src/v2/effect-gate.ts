import {
  isV2Base64Url,
  isV2Rfc3339Millis,
  type V2AuthorityBinding,
  type V2AuthorityEvent,
  type V2AuthorityVerification,
  type V2AuthorityVerifier,
  type V2EffectDeclaration,
  type V2Plan,
  type V2Step,
} from "./contracts.js";
import { V2CanonicalizationError, authoritySignaturePreimageV2, digestV2AuthorityEvent } from "./canonical.js";

export interface V2TrustedAuthorityKey {
  readonly issuer: string;
  readonly keyId: string;
  readonly status: "active" | "revoked";
  /** Canonical unpadded base64url encoding of a raw 32-octet Ed25519 public key. */
  readonly publicKey: string;
}

export interface V2InMemoryAuthorityVerifierOptions {
  readonly available: boolean;
  readonly policyRevision: string;
  readonly keys: readonly V2TrustedAuthorityKey[];
  /** An injected mutable replay set, keyed with authorityNonceReplayKeyV2(). */
  readonly consumedNonces: Set<string>;
}

export type V2EffectGateDecision =
  | { readonly status: "allowed-no-authority" }
  | { readonly status: "blocked"; readonly reasonCode: string; readonly authority?: V2AuthorityVerification };

export function authorityNonceNamespaceV2(event: Pick<V2AuthorityEvent, "issuer" | "keyId" | "policyRevision">): string {
  return `boulder.v2.authority-event.v1/${event.issuer}/${event.keyId}/${event.policyRevision}`;
}

export function authorityNonceReplayKeyV2(event: Pick<V2AuthorityEvent, "issuer" | "keyId" | "policyRevision" | "nonce">): string {
  return `${authorityNonceNamespaceV2(event)}\n${event.nonce}`;
}

/**
 * Creates an injected, in-memory trusted verifier. Envelope content supplies
 * claims only; key material, policy revision, availability, and replay state
 * are exclusively supplied by the caller.
 */
export function createV2InMemoryAuthorityVerifier(options: V2InMemoryAuthorityVerifierOptions): V2AuthorityVerifier {
  return {
    async verifyAndConsume(event, requiredBinding, now): Promise<V2AuthorityVerification> {
      if (!options.available) return rejectedUnavailable();
      if (event.algorithm !== "Ed25519") return rejected("v2.authority.algorithm_unsupported");

      const key = options.keys.find((candidate) => candidate.issuer === event.issuer && candidate.keyId === event.keyId);
      if (!key || !isCanonicalPublicKey(key.publicKey)) return rejected("v2.authority.key_unknown");
      if (key.status !== "active") return rejected("v2.authority.key_revoked");

      try {
        if (event.eventDigest !== await digestV2AuthorityEvent(event)) return rejected("v2.authority.event_digest_invalid");
      } catch (error) {
        if (error instanceof V2CanonicalizationError) return rejected("v2.authority.event_digest_invalid");
        return rejectedUnavailable();
      }
      let signatureVerified: boolean;
      try {
        signatureVerified = await verifiesSignature(event, key.publicKey);
      } catch {
        return rejectedUnavailable();
      }
      if (!signatureVerified) return rejected("v2.authority.signature_invalid");

      if (!isV2Rfc3339Millis(event.signedAt) || !isV2Rfc3339Millis(event.expiresAt) || !isV2Rfc3339Millis(now)) {
        return rejected("v2.authority.timestamp_invalid");
      }
      const signedAt = Date.parse(event.signedAt);
      const expiresAt = Date.parse(event.expiresAt);
      const current = Date.parse(now);
      if (signedAt > current || expiresAt <= signedAt) return rejected("v2.authority.timestamp_invalid");
      if (current >= expiresAt) return rejected("v2.authority.expired");
      if (current - signedAt > 300_000) return rejected("v2.authority.stale");
      if (event.policyRevision !== options.policyRevision || event.policyRevision !== requiredBinding.policyRevision) {
        return rejected("v2.authority.policy_mismatch");
      }
      if (!matchesBinding(event, requiredBinding)) return rejected("v2.authority.binding_mismatch");

      const replayKey = authorityNonceReplayKeyV2(event);
      if (options.consumedNonces.has(replayKey)) return rejected("v2.authority.replayed");
      options.consumedNonces.add(replayKey);
      return { status: "verified", reasonCode: "v2.authority.verified" };
    },
  };
}

export async function gateV2StepEffects(
  plan: V2Plan,
  step: V2Step,
  authorityEvents: readonly V2AuthorityEvent[] | undefined,
  verifier: V2AuthorityVerifier | undefined,
  now: string,
): Promise<V2EffectGateDecision> {
  if (step.declaredEffects.length !== 1) return { status: "blocked", reasonCode: "v2.effect.declaration_unsupported" };
  const effect = step.declaredEffects[0];
  if (effect.inputDigest !== step.input.digest) return { status: "blocked", reasonCode: "v2.effect.input_mismatch" };
  if (effect.class === "none") {
    return authorityEvents === undefined || authorityEvents.length === 0
      ? { status: "allowed-no-authority" }
      : { status: "blocked", reasonCode: "v2.effect.authority_unexpected" };
  }
  const events = authorityEvents ?? [];
  if (events.length === 0) return { status: "blocked", reasonCode: "v2.effect.authority_missing" };
  if (events.length !== 1) return { status: "blocked", reasonCode: "v2.effect.authority_ambiguous" };
  if (!verifier) return { status: "blocked", reasonCode: "v2.authority.verifier_unavailable" };
  let authority: V2AuthorityVerification;
  try {
    authority = await verifier.verifyAndConsume(events[0], bindingFor(plan, step, effect), now);
  } catch {
    return { status: "blocked", reasonCode: "v2.authority.verifier_unavailable" };
  }
  if (authority.status !== "verified") return { status: "blocked", reasonCode: authority.reasonCode, authority };
  return { status: "blocked", reasonCode: "v2.effect.unsupported", authority };
}

export function bindingForV2Effect(plan: V2Plan, step: V2Step, effect: V2EffectDeclaration): V2AuthorityBinding {
  return bindingFor(plan, step, effect);
}

function bindingFor(plan: V2Plan, step: V2Step, effect: V2EffectDeclaration): V2AuthorityBinding {
  return {
    policyRevision: plan.policySnapshot.policyRevision,
    workflowId: plan.workflowId,
    planRevision: plan.planRevision,
    stepId: step.id,
    effectId: effect.id,
    effectClass: effect.class,
    scopeDigest: effect.scope.scopeDigest,
    inputDigest: step.input.digest,
  };
}

function matchesBinding(event: V2AuthorityEvent, binding: V2AuthorityBinding): boolean {
  return event.policyRevision === binding.policyRevision
    && event.workflowId === binding.workflowId
    && event.planRevision === binding.planRevision
    && event.stepId === binding.stepId
    && event.effectId === binding.effectId
    && event.effectClass === binding.effectClass
    && event.scopeDigest === binding.scopeDigest
    && event.inputDigest === binding.inputDigest;
}

function rejected(reasonCode: string): V2AuthorityVerification {
  return { status: "rejected", reasonCode };
}

function rejectedUnavailable(): V2AuthorityVerification {
  return { status: "unavailable", reasonCode: "v2.authority.verifier_unavailable" };
}

function isCanonicalPublicKey(value: string): boolean {
  return value.length === 43 && isV2Base64Url(value, 32, 32);
}

async function verifiesSignature(event: V2AuthorityEvent, publicKey: string): Promise<boolean> {
  if (!isV2Base64Url(event.signature, 64, 64)) return false;
  let preimage: string;
  try {
    preimage = authoritySignaturePreimageV2(event);
  } catch (error) {
    if (error instanceof V2CanonicalizationError) return false;
    throw error;
  }
  const key = await crypto.subtle.importKey("raw", copiedBuffer(decodeBase64Url(publicKey)), { name: "Ed25519" }, false, ["verify"]);
  return await crypto.subtle.verify(
    "Ed25519",
    key,
    copiedBuffer(decodeBase64Url(event.signature)),
    copiedBuffer(new TextEncoder().encode(preimage)),
  );
}

function decodeBase64Url(value: string): Uint8Array {
  const encoded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

function copiedBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}
