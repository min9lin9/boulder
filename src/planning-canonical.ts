type Sha256Hasher = {
  update(input: string): Sha256Hasher;
  digest(encoding: "hex"): string;
};

const CryptoHasher = (Bun as typeof Bun & {
  readonly CryptoHasher: new (algorithm: "sha256") => Sha256Hasher;
}).CryptoHasher;

export type PlanningPrimitive = boolean | null | number | string;
export type PlanningValue = PlanningPrimitive | readonly PlanningValue[] | { readonly [key: string]: PlanningValue };

export interface PlanningValidationIssue {
  readonly id: string;
  readonly path: string;
  readonly message: string;
}

export interface PlanningValidationResult<T> {
  readonly valid: boolean;
  readonly value?: T;
  readonly issues: readonly PlanningValidationIssue[];
}

export interface PlanningProducer {
  readonly adapter: string;
  readonly mode: "direct" | "focused" | "deep";
  readonly host: string;
  readonly toolVersion: string;
  readonly model?: string;
}

export interface PlanningSourceRef {
  readonly id: string;
  readonly path: string;
  readonly sha256: string;
  readonly kind: "code" | "test" | "manifest" | "documentation" | "policy";
  readonly trust: "operator-contract" | "repo-instruction" | "repo-evidence" | "official-external" | "untrusted-external";
  readonly symbol?: string;
  readonly lineHint?: string;
}

export interface PlanningEnvelope {
  readonly schemaVersion: string;
  readonly runId: string;
  readonly createdAt: string;
  readonly packetDigest: string;
  readonly producer: PlanningProducer;
  readonly sourceRefs: readonly PlanningSourceRef[];
}

const invalidPlanningDigest = "invalid:non-json-value";

function isPlanningValue(value: unknown, ancestors = new WeakSet<object>()): value is PlanningValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;

  try {
    if (ancestors.has(value)) return false;
    ancestors.add(value);

    if (Array.isArray(value)) {
      const length = value.length;
      const names = Object.getOwnPropertyNames(value);
      if (Object.getOwnPropertySymbols(value).length > 0 || names.length !== length + 1) return false;

      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || !isPlanningValue(descriptor.value, ancestors)) return false;
      }

      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      return Boolean(lengthDescriptor && !lengthDescriptor.enumerable && "value" in lengthDescriptor && lengthDescriptor.value === length);
    }

    const prototype = Object.getPrototypeOf(value);
    if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0) return false;

    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || !isPlanningValue(descriptor.value, ancestors)) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
}

function canonicalize(value: PlanningValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as { readonly [key: string]: PlanningValue };
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

export function canonicalizePlanningValue(value: unknown): string {
  if (!isPlanningValue(value)) throw new TypeError("Planning values must be finite JSON values.");
  try {
    return canonicalize(value);
  } catch {
    throw new TypeError("Planning values must be finite JSON values.");
  }
}
export function sha256Digest(value: string): string {
  return `sha256:${new CryptoHasher("sha256").update(value).digest("hex")}`;
}

export function planningDigest(value: unknown): string {
  try {
    if (!isPlanningValue(value)) return invalidPlanningDigest;
    if (value === null || typeof value !== "object" || Array.isArray(value)) return sha256Digest(canonicalize(value));

    const record = value as { readonly [key: string]: PlanningValue };
    const digestInput: Record<string, PlanningValue> = Object.create(null);
    for (const key of Object.keys(record)) {
      if (key !== "packetDigest") digestInput[key] = record[key];
    }
    return sha256Digest(canonicalizePlanningValue(digestInput));
  } catch {
    return invalidPlanningDigest;
  }
}
