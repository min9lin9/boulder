export const K2A_F_CONTRACT_FOUNDATION_SCHEMA_VERSION =
  "boulder.k2a-f.contract-foundation.v1" as const;
export const K2A_F_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
export const K2A_F_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export type K2aFJsonPrimitive = string | number | boolean | null;
export type K2aFJsonValue = K2aFJsonPrimitive | readonly K2aFJsonValue[] | { readonly [key: string]: K2aFJsonValue };
export type K2aFDigest = `sha256:${string}`;

export type K2aFInvariant = {
  readonly id: string;
  readonly statement: string;
};

export interface K2aFContractFoundation {
  readonly schemaVersion: typeof K2A_F_CONTRACT_FOUNDATION_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly invariants: readonly [K2aFInvariant, ...K2aFInvariant[]];
  readonly contractDigest: K2aFDigest;
}

export interface K2aFValidationIssue {
  readonly id: `k2a-f.${string}`;
  readonly path: string;
  readonly message: string;
}

export type K2aFValidationResult<T> =
  | { readonly ok: true; readonly value: T; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: readonly K2aFValidationIssue[] };

export function isK2aFId(value: unknown): value is string {
  return typeof value === "string" && K2A_F_ID_PATTERN.test(value);
}

export function isK2aFDigest(value: unknown): value is K2aFDigest {
  return typeof value === "string" && K2A_F_DIGEST_PATTERN.test(value);
}
