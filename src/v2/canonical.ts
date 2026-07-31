import type {
  V2Artifact,
  V2AuthorityEvent,
  V2Critique,
  V2Digest,
  V2Evidence,
  V2ExecutionResult,
  V2JsonValue,
  V2Plan,
  V2PolicySnapshot,
  V2Scope,
  V2TypedInput,
} from "./contracts.js";

const encoder = new TextEncoder();

export class V2CanonicalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "V2CanonicalizationError";
  }
}

/** Serializes one I-JSON value using RFC 8785 JCS rules. */
export function canonicalizeV2(value: V2JsonValue): string {
  return canonicalize(value);
}

function canonicalize(value: V2JsonValue): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      assertNoLoneSurrogate(value);
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
        throw new V2CanonicalizationError("Numbers must be finite I-JSON values.");
      }
      return JSON.stringify(value);
    case "object":
      if (isV2JsonArray(value)) {
        return canonicalizeArray(value);
      }
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
        throw new V2CanonicalizationError("Objects must be JSON records.");
      }
      return `{${Object.keys(value).sort(compareUnicodeCodeUnits).map((key) => {
        assertNoLoneSurrogate(key);
        return `${JSON.stringify(key)}:${canonicalize(value[key])}`;
      }).join(",")}}`;
    default:
      throw new V2CanonicalizationError("Value is not JSON.");
  }
}
function isV2JsonArray(value: V2JsonValue): value is readonly V2JsonValue[] {
  return Array.isArray(value);
}
function canonicalizeArray(value: readonly V2JsonValue[]): string {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new V2CanonicalizationError("Arrays cannot be sparse.");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !isArrayIndexKey(key)) {
      if (Object.getOwnPropertyDescriptor(value, key)?.enumerable) {
        throw new V2CanonicalizationError("Arrays cannot contain enumerable non-index properties.");
      }
    }
  }
  const entries: string[] = [];
  for (let index = 0; index < value.length; index += 1) entries.push(canonicalize(value[index]));
  return `[${entries.join(",")}]`;
}

function isArrayIndexKey(key: string): boolean {
  if (key === "0") return true;
  if (!/^[1-9]\d*$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index < 4_294_967_295 && String(index) === key;
}

function compareUnicodeCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertNoLoneSurrogate(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new V2CanonicalizationError("Strings cannot contain lone surrogate code points.");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new V2CanonicalizationError("Strings cannot contain lone surrogate code points.");
    }
  }
}

export async function sha256V2(value: string): Promise<V2Digest> {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return `sha256:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Hashes DOMAIN + LF + RFC 8785 JCS(PROJECTION), with no terminating newline. */
export async function digestV2(domain: string, projection: V2JsonValue): Promise<V2Digest> {
  return sha256V2(`${domain}\n${canonicalizeV2(projection)}`);
}

export function omitV2Field<T extends object>(value: T, field: string): { readonly [key: string]: V2JsonValue } {
  const projection: Record<string, V2JsonValue> = {};
  const record = value as unknown as Readonly<Record<string, V2JsonValue>>;
  for (const key of Object.keys(record)) {
    if (key !== field) projection[key] = record[key];
  }
  return projection;
}

export const digestV2PolicySnapshot = (snapshot: V2PolicySnapshot): Promise<V2Digest> =>
  digestV2("boulder.v2.policy.v1", { policyRevision: snapshot.policyRevision });
export const digestV2Scope = (scope: V2Scope): Promise<V2Digest> =>
  digestV2("boulder.v2.scope.v1", { kind: scope.kind, resources: scope.resources });
export const digestV2Input = (input: Pick<V2TypedInput, "value">): Promise<V2Digest> =>
  digestV2("boulder.v2.input.v1", input.value);
export const digestV2Plan = (plan: V2Plan): Promise<V2Digest> =>
  digestV2("boulder.v2.plan.v1", omitV2Field(plan, "planDigest"));
export const digestV2Content = (content: V2JsonValue): Promise<V2Digest> =>
  digestV2("boulder.v2.content.v1", content);
export const digestV2Artifact = (artifact: Omit<V2Artifact, "artifactDigest">): Promise<V2Digest> =>
  digestV2("boulder.v2.artifact.v1", omitV2Field(artifact, "artifactDigest"));
export const digestV2Evidence = (evidence: Omit<V2Evidence, "digest">): Promise<V2Digest> =>
  digestV2("boulder.v2.evidence.v1", omitV2Field(evidence, "digest"));
export const digestV2ExecutionResult = (result: Omit<V2ExecutionResult, "resultDigest">): Promise<V2Digest> =>
  digestV2("boulder.v2.execution-result.v1", omitV2Field(result, "resultDigest"));
export const digestV2Critique = (critique: V2Critique): Promise<V2Digest> =>
  digestV2("boulder.v2.critique.v1", omitV2Field(critique, "critiqueDigest"));
export const digestV2EvaluatorPolicy = (policy: V2JsonValue): Promise<V2Digest> =>
  digestV2("boulder.v2.evaluator-policy.v1", policy);
export const digestV2AuthorityEvent = (event: V2AuthorityEvent): Promise<V2Digest> =>
  digestV2("boulder.v2.authority-event.v1", omitV2Field(omitV2Field(event, "signature"), "eventDigest"));

/** The exact Ed25519 signature payload; signing itself belongs to injected trusted code. */
export function authoritySignaturePreimageV2(event: V2AuthorityEvent): string {
  return `boulder.v2.authority-signature.v1\n${canonicalizeV2(omitV2Field(event, "signature"))}`;
}
