import {
  K2A_F_CONTRACT_FOUNDATION_SCHEMA_VERSION,
  type K2aFContractFoundation,
  type K2aFDigest,
  type K2aFJsonValue,
} from "./contracts.js";

const encoder = new TextEncoder();

export class K2aFCanonicalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "K2aFCanonicalizationError";
  }
}

/** Serializes one I-JSON value using RFC 8785 JCS rules. */
export function canonicalizeK2aF(value: unknown): string {
  return canonicalize(value, new WeakSet<object>());
}

function canonicalize(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      assertNoLoneSurrogate(value);
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
        throw new K2aFCanonicalizationError("Numbers must be finite I-JSON values.");
      }
      return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) return canonicalizeArray(value, ancestors);
      if (!isK2aFRecord(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
        throw new K2aFCanonicalizationError("Objects must be JSON records.");
      }
      return canonicalizeRecord(value, ancestors);
    default:
      throw new K2aFCanonicalizationError("Value is not JSON.");
  }
}
function isK2aFRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function canonicalizeRecord(value: Record<string, unknown>, ancestors: WeakSet<object>): string {
  if (ancestors.has(value)) {
    throw new K2aFCanonicalizationError("Objects cannot contain cycles.");
  }
  ancestors.add(value);
  try {
    const keys = ownEnumerableDataKeys(value);
    return `{${keys.sort(compareUnicodeCodeUnits).map((key) => {
      assertNoLoneSurrogate(key);
      return `${JSON.stringify(key)}:${canonicalize(value[key], ancestors)}`;
    }).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function canonicalizeArray(value: readonly unknown[], ancestors: WeakSet<object>): string {
  if (ancestors.has(value)) {
    throw new K2aFCanonicalizationError("Arrays cannot contain cycles.");
  }
  ancestors.add(value);
  try {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new K2aFCanonicalizationError("Arrays cannot be sparse.");
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key === "symbol") {
        throw new K2aFCanonicalizationError("Arrays cannot contain symbol properties.");
      }
      assertEnumerableDataProperty(value, key);
      if (!isArrayIndexKey(key)) {
        throw new K2aFCanonicalizationError("Arrays cannot contain enumerable non-index properties.");
      }
    }
    const entries: string[] = [];
    for (let index = 0; index < value.length; index += 1) entries.push(canonicalize(value[index], ancestors));
    return `[${entries.join(",")}]`;
  } finally {
    ancestors.delete(value);
  }
}

function ownEnumerableDataKeys(value: object): string[] {
  const keys: string[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      throw new K2aFCanonicalizationError("Objects cannot contain symbol properties.");
    }
    assertEnumerableDataProperty(value, key);
    keys.push(key);
  }
  return keys;
}

function assertEnumerableDataProperty(value: object, key: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
    throw new K2aFCanonicalizationError("Objects must contain enumerable data properties.");
  }
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
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new K2aFCanonicalizationError("Strings cannot contain lone surrogate code points.");
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new K2aFCanonicalizationError("Strings cannot contain lone surrogate code points.");
    }
  }
}

export async function sha256K2aF(text: string): Promise<K2aFDigest> {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return `sha256:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Hashes DOMAIN + LF + RFC 8785 JCS(PROJECTION), with no terminating newline. */
export async function digestK2aF(domain: string, projection: K2aFJsonValue): Promise<K2aFDigest> {
  return sha256K2aF(`${domain}\n${canonicalizeK2aF(projection)}`);
}

export function digestK2aFContractFoundation(
  contract: K2aFContractFoundation,
): Promise<K2aFDigest> {
  canonicalizeK2aF(contract);
  const invariants: K2aFJsonValue[] = [];
  for (let index = 0; index < contract.invariants.length; index += 1) {
    const invariant = contract.invariants[index];
    const projectionInvariant: K2aFJsonValue = {
      id: invariant.id,
      statement: invariant.statement,
    };
    invariants.push(projectionInvariant);
  }
  const projection: K2aFJsonValue = {
    schemaVersion: contract.schemaVersion,
    id: contract.id,
    title: contract.title,
    invariants,
  };
  return digestK2aF(K2A_F_CONTRACT_FOUNDATION_SCHEMA_VERSION, projection);
}
