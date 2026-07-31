import {
  K2A_F_CONTRACT_FOUNDATION_SCHEMA_VERSION,
  isK2aFDigest,
  isK2aFId,
  type K2aFContractFoundation,
  type K2aFInvariant,
  type K2aFValidationIssue,
  type K2aFValidationResult,
} from "./contracts.js";
import {
  K2aFCanonicalizationError,
  canonicalizeK2aF,
  digestK2aFContractFoundation,
} from "./canonical.js";

const MAX_ISSUES = 100;
const ROOT_FIELDS = ["schemaVersion", "id", "title", "invariants", "contractDigest"] as const;
const INVARIANT_FIELDS = ["id", "statement"] as const;

type JsonRecord = Record<string, unknown>;
type IssuePhase = 0 | 1 | 2 | 3 | 4;

interface PendingIssue extends K2aFValidationIssue {
  readonly phase: IssuePhase;
}

class IssueCollector {
  readonly issues: PendingIssue[] = [];

  add(phase: IssuePhase, id: K2aFValidationIssue["id"], path: string, message: string): void {
    this.issues.push({ phase, id, path, message });
  }

  hasIssues(): boolean {
    return this.issues.length > 0;
  }

  failure(): K2aFValidationResult<K2aFContractFoundation> {
    return { ok: false, issues: this.sorted() };
  }

  private sorted(): readonly K2aFValidationIssue[] {
    return this.issues
      .sort((left, right) => left.phase - right.phase || compareUnicodeCodeUnits(left.path, right.path) || compareUnicodeCodeUnits(left.id, right.id))
      .slice(0, MAX_ISSUES)
      .map(({ id, path, message }) => ({ id, path, message }));
  }
}

export async function validateK2aFContractFoundation(
  value: unknown,
): Promise<K2aFValidationResult<K2aFContractFoundation>> {
  const issues = new IssueCollector();
  if (!isRecord(value)) {
    issues.add(0, "k2a-f.contract.type", "$", "Contract foundation must be an object.");
    return issues.failure();
  }

  validateRootFields(value, issues);
  validateInvariantFields(value, issues);
  validateLexicalFields(value, issues);
  validateDuplicateInvariantIds(value, issues);

  if (issues.hasIssues()) return issues.failure();

  try {
    canonicalizeK2aF(value);
    const contract = toContractFoundation(value);
    const digest = await digestK2aFContractFoundation(contract);
    if (contract.contractDigest !== digest) {
      issues.add(4, "k2a-f.digest.mismatch", "$.contractDigest", "Digest does not match its canonical projection.");
    }
    return issues.hasIssues()
      ? issues.failure()
      : { ok: true, value: contract, issues: [] };
  } catch (error) {
    if (error instanceof K2aFCanonicalizationError) {
      issues.add(4, "k2a-f.digest.projection_invalid", "$.contractDigest", "Canonical digest projection is invalid.");
    } else {
      throw error;
    }
  }
  return issues.failure();
}

function validateRootFields(value: JsonRecord, issues: IssueCollector): void {
  for (const field of ROOT_FIELDS) {
    if (!Object.hasOwn(value, field)) {
      issues.add(1, "k2a-f.field.required", `$.${field}`, "Required field is missing.");
    }
  }
  const allowed = new Set<string>(ROOT_FIELDS);
  for (const key of Object.getOwnPropertyNames(value)) {
    if (!allowed.has(key)) {
      issues.add(1, "k2a-f.field.unknown", unknownKeyPath("$", key), "Unknown field is not permitted.");
    }
  }
}

function validateInvariantFields(value: JsonRecord, issues: IssueCollector): void {
  const invariants = nonEmptyInvariantArray(value);
  if (!invariants) return;
  for (let index = 0; index < invariants.length; index += 1) {
    const invariant = ownDataProperty(invariants, String(index))?.value;
    if (!isRecord(invariant)) continue;
    const path = `$.invariants[${index}]`;
    for (const field of INVARIANT_FIELDS) {
      if (!Object.hasOwn(invariant, field)) {
        issues.add(1, "k2a-f.field.required", `${path}.${field}`, "Required field is missing.");
      }
    }
    const allowed = new Set<string>(INVARIANT_FIELDS);
    for (const key of Object.getOwnPropertyNames(invariant)) {
      if (!allowed.has(key)) {
        issues.add(1, "k2a-f.field.unknown", unknownKeyPath(path, key), "Unknown field is not permitted.");
      }
    }
  }
}

function validateLexicalFields(value: JsonRecord, issues: IssueCollector): void {
  const schemaVersion = ownDataProperty(value, "schemaVersion");
  if (schemaVersion && schemaVersion.value !== K2A_F_CONTRACT_FOUNDATION_SCHEMA_VERSION) {
    issues.add(2, "k2a-f.schema.invalid", "$.schemaVersion", "Expected boulder.k2a-f.contract-foundation.v1.");
  }
  const id = ownDataProperty(value, "id");
  if (id && !isK2aFId(id.value)) {
    issues.add(2, "k2a-f.id.invalid", "$.id", "ID must be a safe slug.");
  }
  const contractDigest = ownDataProperty(value, "contractDigest");
  if (contractDigest && !isK2aFDigest(contractDigest.value)) {
    issues.add(2, "k2a-f.digest.invalid", "$.contractDigest", "Digest must be sha256 with lowercase hexadecimal.");
  }
  const title = ownDataProperty(value, "title");
  if (title && (typeof title.value !== "string" || title.value.length === 0)) {
    issues.add(2, "k2a-f.field.string_invalid", "$.title", "Value must be a non-empty string.");
  }
  const invariants = ownDataProperty(value, "invariants");
  if (invariants && (!Array.isArray(invariants.value) || invariants.value.length === 0)) {
    issues.add(2, "k2a-f.invariants.invalid", "$.invariants", "Invariants must be a non-empty array.");
  }
  if (!invariants || !Array.isArray(invariants.value) || invariants.value.length === 0) return;

  for (let index = 0; index < invariants.value.length; index += 1) {
    const invariantProperty = ownDataProperty(invariants.value, String(index));
    if (!invariantProperty) continue;
    const invariant = invariantProperty.value;
    const path = `$.invariants[${index}]`;
    if (!isRecord(invariant)) {
      issues.add(2, "k2a-f.invariant.type", path, "Invariant must be an object.");
      continue;
    }
    const invariantId = ownDataProperty(invariant, "id");
    if (invariantId && !isK2aFId(invariantId.value)) {
      issues.add(2, "k2a-f.id.invalid", `${path}.id`, "ID must be a safe slug.");
    }
    const statement = ownDataProperty(invariant, "statement");
    if (statement && (typeof statement.value !== "string" || statement.value.length === 0)) {
      issues.add(2, "k2a-f.field.string_invalid", `${path}.statement`, "Value must be a non-empty string.");
    }
  }
}

function validateDuplicateInvariantIds(value: JsonRecord, issues: IssueCollector): void {
  const invariants = nonEmptyInvariantArray(value);
  if (!invariants) return;
  const seen = new Set<string>();
  for (let index = 0; index < invariants.length; index += 1) {
    const invariant = ownDataProperty(invariants, String(index))?.value;
    if (!isRecord(invariant)) continue;
    const id = ownDataProperty(invariant, "id");
    if (!id || !isK2aFId(id.value)) continue;
    if (seen.has(id.value)) {
      issues.add(3, "k2a-f.invariant.duplicate", `$.invariants[${index}].id`, "Invariant IDs must be unique.");
    }
    seen.add(id.value);
  }
}

function toContractFoundation(value: JsonRecord): K2aFContractFoundation {
  if (!isK2aFContractFoundation(value)) {
    throw new Error("Validated contract foundation is malformed.");
  }
  return value;
}

function isK2aFContractFoundation(value: unknown): value is K2aFContractFoundation {
  if (
    !isRecord(value)
    || value.schemaVersion !== K2A_F_CONTRACT_FOUNDATION_SCHEMA_VERSION
    || !isK2aFId(value.id)
    || typeof value.title !== "string"
    || value.title.length === 0
    || !isK2aFDigest(value.contractDigest)
    || !Array.isArray(value.invariants)
    || value.invariants.length === 0
  ) {
    return false;
  }
  return Array.prototype.every.call(value.invariants, isK2aFInvariant);
}

function isK2aFInvariant(value: unknown): value is K2aFInvariant {
  return isRecord(value)
    && isK2aFId(value.id)
    && typeof value.statement === "string"
    && value.statement.length > 0;
}

function unknownKeyPath(path: string, key: string): string {
  return `${path}[${JSON.stringify(key)}]`;
}

function compareUnicodeCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
interface OwnDataProperty {
  readonly value: unknown;
}

function ownDataProperty(value: object, key: string): OwnDataProperty | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value")
    ? { value: descriptor.value }
    : undefined;
}

function nonEmptyInvariantArray(value: JsonRecord): readonly unknown[] | undefined {
  const invariants = ownDataProperty(value, "invariants");
  return invariants && Array.isArray(invariants.value) && invariants.value.length > 0
    ? invariants.value
    : undefined;
}
