import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  K2A_F_CONTRACT_FOUNDATION_SCHEMA_VERSION,
  K2A_F_DIGEST_PATTERN,
  K2A_F_ID_PATTERN,
  isK2aFDigest,
  isK2aFId,
  type K2aFContractFoundation,
  type K2aFJsonValue,
} from "../src/k2a-f/contracts.js";
import {
  K2aFCanonicalizationError,
  canonicalizeK2aF,
  digestK2aF,
  digestK2aFContractFoundation,
  sha256K2aF,
} from "../src/k2a-f/canonical.js";
import { validateK2aFContractFoundation } from "../src/k2a-f/validation.js";

const root = join(import.meta.dir, "..");
const fixturePath = join(root, "fixtures/k2a-f/contract-foundation.v1.json");
const issueMessages = {
  type: "Contract foundation must be an object.",
  required: "Required field is missing.",
  unknown: "Unknown field is not permitted.",
  schema: "Expected boulder.k2a-f.contract-foundation.v1.",
  id: "ID must be a safe slug.",
  digest: "Digest must be sha256 with lowercase hexadecimal.",
  string: "Value must be a non-empty string.",
  invariants: "Invariants must be a non-empty array.",
  invariantType: "Invariant must be an object.",
  duplicate: "Invariant IDs must be unique.",
  projection: "Canonical digest projection is invalid.",
  mismatch: "Digest does not match its canonical projection.",
} as const;

type Issue = { readonly id: string; readonly path: string; readonly message: string };
type Fixture = {
  readonly schemaVersion: string;
  readonly domain: string;
  readonly valid: Record<string, unknown>;
  readonly canonicalJson: string;
  readonly preimage: string;
  readonly digest: string;
  readonly invalid: Record<string, unknown>;
};

const fixtureBytes = await readFile(fixturePath);
const fixture = parseFixture(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fixtureBytes)));

function cloneValid(): Record<string, unknown> {
  const clone: unknown = JSON.parse(JSON.stringify(fixture.valid));
  if (!isRecord(clone)) throw new Error("Fixture valid contract must be an object.");
  return clone;
}

async function issuesFor(value: unknown): Promise<readonly Issue[]> {
  const result = await validateK2aFContractFoundation(value);
  return result.issues;
}

async function expectOnly(value: unknown, issue: Issue): Promise<void> {
  expect(await issuesFor(value)).toEqual([issue]);
}

describe("K2a-F contract foundation", () => {
  test("uses the literal byte-first fixture vector", async () => {
    expect(Array.from(fixtureBytes.subarray(0, 3))).not.toEqual([0xef, 0xbb, 0xbf]);
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(fixtureBytes);
    expect(parseFixture(JSON.parse(raw))).toEqual(fixture);

    const validated = await validateK2aFContractFoundation(fixture.valid);
    if (!validated.ok) throw new Error("Fixture valid contract is invalid.");
    const valid = validated.value;
    const projection = omitDigest(valid);

    expect(fixture.schemaVersion).toBe("boulder.k2a-f.contract-foundation.fixture.v1");
    expect(fixture.domain).toBe(K2A_F_CONTRACT_FOUNDATION_SCHEMA_VERSION);
    expect(fixture.canonicalJson).toBe(canonicalizeK2aF(projection));
    expect(fixture.preimage).toBe(`${fixture.domain}\n${fixture.canonicalJson}`);
    expect(fixture.preimage.endsWith("\n")).toBe(false);
    expect(await sha256K2aF(fixture.preimage)).toBe(fixture.digest);
    expect(await digestK2aF(fixture.domain, projection)).toBe(fixture.digest);
    expect(await digestK2aFContractFoundation(valid)).toBe(fixture.digest);
    expect(valid.contractDigest).toBe(fixture.digest);
  });

  test("accepts only frozen ID and digest lexical boundaries", () => {
    for (const value of ["a", "a0", "a-", `a${"z".repeat(63)}`]) {
      expect(K2A_F_ID_PATTERN.test(value)).toBe(true);
      expect(isK2aFId(value)).toBe(true);
    }
    for (const value of ["", "A", "0a", "-a", "a_", `a${"z".repeat(64)}`, 7]) {
      expect(isK2aFId(value)).toBe(false);
    }
    const digest = `sha256:${"a".repeat(64)}`;
    expect(K2A_F_DIGEST_PATTERN.test(digest)).toBe(true);
    expect(isK2aFDigest(digest)).toBe(true);
    for (const value of ["sha256:", `sha256:${"A".repeat(64)}`, `sha512:${"a".repeat(64)}`, `sha256:${"a".repeat(63)}`, null]) {
      expect(isK2aFDigest(value)).toBe(false);
    }
  });

  test("accepts the valid contract and validates the literal multi-fault vector", async () => {
    const accepted = await validateK2aFContractFoundation(cloneValid());
    expect(accepted).toEqual({ ok: true, value: fixture.valid, issues: [] });
    expect(await issuesFor(fixture.invalid)).toEqual([
      { id: "k2a-f.digest.invalid", path: "$.contractDigest", message: issueMessages.digest },
      { id: "k2a-f.id.invalid", path: "$.id", message: issueMessages.id },
      { id: "k2a-f.invariants.invalid", path: "$.invariants", message: issueMessages.invariants },
      { id: "k2a-f.schema.invalid", path: "$.schemaVersion", message: issueMessages.schema },
      { id: "k2a-f.field.string_invalid", path: "$.title", message: issueMessages.string },
    ]);
  });

  test("reports every frozen structural diagnostic exactly", async () => {
    for (const value of [null, [], 1]) {
      await expectOnly(value, { id: "k2a-f.contract.type", path: "$", message: issueMessages.type });
    }
    expect(await issuesFor({})).toEqual([
      { id: "k2a-f.field.required", path: "$.contractDigest", message: issueMessages.required },
      { id: "k2a-f.field.required", path: "$.id", message: issueMessages.required },
      { id: "k2a-f.field.required", path: "$.invariants", message: issueMessages.required },
      { id: "k2a-f.field.required", path: "$.schemaVersion", message: issueMessages.required },
      { id: "k2a-f.field.required", path: "$.title", message: issueMessages.required },
    ]);

    const unknownRoot = cloneValid();
    unknownRoot["extra"] = true;
    await expectOnly(unknownRoot, { id: "k2a-f.field.unknown", path: '$["extra"]', message: issueMessages.unknown });
    const escapedUnknownRoot = cloneValid();
    escapedUnknownRoot["quote\"slash\\line\n"] = true;
    await expectOnly(escapedUnknownRoot, { id: "k2a-f.field.unknown", path: '$["quote\\"slash\\\\line\\n"]', message: issueMessages.unknown });
    const hiddenUnknownRoot = cloneValid();
    Object.defineProperty(hiddenUnknownRoot, "hidden", { value: true });
    await expectOnly(hiddenUnknownRoot, { id: "k2a-f.field.unknown", path: '$["hidden"]', message: issueMessages.unknown });

    const missingInvariantFields = cloneValid();
    missingInvariantFields["invariants"] = [{}];
    expect(await issuesFor(missingInvariantFields)).toEqual([
      { id: "k2a-f.field.required", path: "$.invariants[0].id", message: issueMessages.required },
      { id: "k2a-f.field.required", path: "$.invariants[0].statement", message: issueMessages.required },
    ]);

    const unknownInvariant = cloneValid();
    unknownInvariant["invariants"] = [{ id: "known", statement: "Known.", extra: true }];
    await expectOnly(unknownInvariant, { id: "k2a-f.field.unknown", path: '$.invariants[0]["extra"]', message: issueMessages.unknown });
    const hiddenUnknownInvariant = cloneValid();
    const hiddenInvariants = hiddenUnknownInvariant["invariants"];
    if (!Array.isArray(hiddenInvariants)) throw new Error("Fixture invariants must be an array.");
    const hiddenInvariant = hiddenInvariants[0];
    if (!isRecord(hiddenInvariant)) throw new Error("Fixture invariant must be an object.");
    Object.defineProperty(hiddenInvariant, "hidden", { value: true });
    await expectOnly(hiddenUnknownInvariant, { id: "k2a-f.field.unknown", path: '$.invariants[0]["hidden"]', message: issueMessages.unknown });

    const schema = cloneValid();
    schema["schemaVersion"] = "boulder.k2a-f.contract-foundation.v0";
    await expectOnly(schema, { id: "k2a-f.schema.invalid", path: "$.schemaVersion", message: issueMessages.schema });

    const rootId = cloneValid();
    rootId["id"] = "K2A_F";
    await expectOnly(rootId, { id: "k2a-f.id.invalid", path: "$.id", message: issueMessages.id });

    const invariantId = cloneValid();
    invariantId["invariants"] = [{ id: "K2A_F", statement: "Known." }];
    await expectOnly(invariantId, { id: "k2a-f.id.invalid", path: "$.invariants[0].id", message: issueMessages.id });

    const digest = cloneValid();
    digest["contractDigest"] = "sha256:ABC";
    await expectOnly(digest, { id: "k2a-f.digest.invalid", path: "$.contractDigest", message: issueMessages.digest });

    const title = cloneValid();
    title["title"] = "";
    await expectOnly(title, { id: "k2a-f.field.string_invalid", path: "$.title", message: issueMessages.string });

    const statement = cloneValid();
    statement["invariants"] = [{ id: "known", statement: "" }];
    await expectOnly(statement, { id: "k2a-f.field.string_invalid", path: "$.invariants[0].statement", message: issueMessages.string });

    const emptyInvariants = cloneValid();
    emptyInvariants["invariants"] = [];
    await expectOnly(emptyInvariants, { id: "k2a-f.invariants.invalid", path: "$.invariants", message: issueMessages.invariants });

    const nonArrayInvariants = cloneValid();
    nonArrayInvariants["invariants"] = {};
    await expectOnly(nonArrayInvariants, { id: "k2a-f.invariants.invalid", path: "$.invariants", message: issueMessages.invariants });

    const invariantType = cloneValid();
    invariantType["invariants"] = [null];
    await expectOnly(invariantType, { id: "k2a-f.invariant.type", path: "$.invariants[0]", message: issueMessages.invariantType });

    const duplicate = cloneValid();
    duplicate["invariants"] = [
      { id: "duplicate", statement: "First." },
      { id: "duplicate", statement: "Second." },
    ];
    await expectOnly(duplicate, { id: "k2a-f.invariant.duplicate", path: "$.invariants[1].id", message: issueMessages.duplicate });
  });

  test("uses fail-closed projection errors and suppresses mismatches", async () => {
    const loneTitle = cloneValid();
    loneTitle["title"] = "\ud800";
    const loneStatement = cloneValid();
    loneStatement["invariants"] = [{ id: "known", statement: "\udc00" }];
    const prototypeInvariant = cloneValid();
    prototypeInvariant["invariants"] = [Object.assign(Object.create({ inherited: true }), { id: "known", statement: "Known." })];
    const enumerableArray = cloneValid();
    const invariants = enumerableArray["invariants"];
    if (!Array.isArray(invariants)) throw new Error("Fixture invariants must be an array.");
    Object.defineProperty(invariants, "extra", { enumerable: true, value: true });

    const rootSymbol = cloneValid();
    Object.defineProperty(rootSymbol, Symbol("hidden"), { value: true });
    const rootAccessor = cloneValid();
    Object.defineProperty(rootAccessor, "title", { enumerable: true, get: () => "K2a-F Contract Foundation" });
    const rootPrototype = cloneValid();
    Object.setPrototypeOf(rootPrototype, { inherited: true });
    const rootNonEnumerable = cloneValid();
    Object.defineProperty(rootNonEnumerable, "title", { enumerable: false, value: rootNonEnumerable["title"] });

    const invariantSymbol = cloneValid();
    const invariantWithSymbol = { id: "known", statement: "Known." };
    Object.defineProperty(invariantWithSymbol, Symbol("hidden"), { value: true });
    invariantSymbol["invariants"] = [invariantWithSymbol];
    const invariantAccessor = cloneValid();
    invariantAccessor["invariants"] = [{ id: "known", get statement() { return "Known."; } }];
    const invariantPrototype = cloneValid();
    invariantPrototype["invariants"] = [Object.assign(Object.create({ inherited: true }), { id: "known", statement: "Known." })];
    const invariantNonEnumerable = cloneValid();
    const invariantWithNonEnumerable = { id: "known", statement: "Known." };
    Object.defineProperty(invariantWithNonEnumerable, "statement", { enumerable: false, value: "Known." });
    invariantNonEnumerable["invariants"] = [invariantWithNonEnumerable];

    for (const value of [
      loneTitle,
      loneStatement,
      prototypeInvariant,
      enumerableArray,
      rootSymbol,
      rootAccessor,
      rootPrototype,
      rootNonEnumerable,
      invariantSymbol,
      invariantAccessor,
      invariantPrototype,
      invariantNonEnumerable,
    ]) {
      await expectOnly(value, { id: "k2a-f.digest.projection_invalid", path: "$.contractDigest", message: issueMessages.projection });
    }

    const mismatch = cloneValid();
    mismatch["contractDigest"] = `sha256:${"0".repeat(64)}`;
    await expectOnly(mismatch, { id: "k2a-f.digest.mismatch", path: "$.contractDigest", message: issueMessages.mismatch });

    const earlyFailure = cloneValid();
    earlyFailure["title"] = "";
    earlyFailure["contractDigest"] = `sha256:${"0".repeat(64)}`;
    await expectOnly(earlyFailure, { id: "k2a-f.field.string_invalid", path: "$.title", message: issueMessages.string });
  });

  test("rejects unsupported canonicalizer inputs", () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    const objectWithSymbol = { value: true };
    Object.defineProperty(objectWithSymbol, Symbol("hidden"), { value: true });
    const arrayWithSymbol = [true];
    Object.defineProperty(arrayWithSymbol, Symbol("hidden"), { value: true });
    const objectCycle: { self?: unknown } = {};
    objectCycle.self = objectCycle;
    const arrayCycle: unknown[] = [];
    arrayCycle.push(arrayCycle);

    for (const value of [
      sparse,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      new Date(),
      undefined,
      objectWithSymbol,
      arrayWithSymbol,
      objectCycle,
      arrayCycle,
    ]) {
      let thrown: unknown;
      try {
        canonicalizeK2aF(value);
      } catch (error) {
        thrown = error;
      }
      expect(thrown instanceof K2aFCanonicalizationError).toBe(true);
    }
  });

  test("sorts all issues before applying the 100 issue cap", async () => {
    const ascending = cloneValid();
    const descending = cloneValid();
    for (const index of Array.from({ length: 105 }, (_, value) => value)) {
      ascending[`unknown-${String(index).padStart(3, "0")}`] = true;
    }
    for (const index of Array.from({ length: 105 }, (_, value) => 104 - value)) {
      descending[`unknown-${String(index).padStart(3, "0")}`] = true;
    }
    const ascendingIssues = await issuesFor(ascending);
    const descendingIssues = await issuesFor(descending);
    expect(ascendingIssues).toEqual(descendingIssues);
    expect(ascendingIssues).toEqual(Array.from({ length: 100 }, (_, index) => ({
      id: "k2a-f.field.unknown",
      path: `$["unknown-${String(index).padStart(3, "0")}"]`,
      message: issueMessages.unknown,
    })));
  });

  test("keeps K2a-F runtime imports sibling-only", async () => {
    const allowedImports: Readonly<Record<string, readonly string[]>> = {
      "contracts.ts": [],
      "canonical.ts": ["./contracts.js"],
      "validation.ts": ["./canonical.js", "./contracts.js"],
    };
    for (const [file, allowed] of Object.entries(allowedImports)) {
      const source = await readFile(join(root, "src/k2a-f", file), "utf8");
      expect(importSpecifiers(source).sort()).toEqual([...allowed].sort());
    }
  });
});

function parseFixture(value: unknown): Fixture {
  if (
    !isRecord(value)
    || typeof value.schemaVersion !== "string"
    || typeof value.domain !== "string"
    || !isRecord(value.valid)
    || typeof value.canonicalJson !== "string"
    || typeof value.preimage !== "string"
    || typeof value.digest !== "string"
    || !isRecord(value.invalid)
  ) {
    throw new Error("K2a-F fixture is malformed.");
  }
  return {
    schemaVersion: value.schemaVersion,
    domain: value.domain,
    valid: value.valid,
    canonicalJson: value.canonicalJson,
    preimage: value.preimage,
    digest: value.digest,
    invalid: value.invalid,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function omitDigest(value: K2aFContractFoundation): K2aFJsonValue {
  return {
    schemaVersion: value.schemaVersion,
    id: value.id,
    title: value.title,
    invariants: value.invariants.map((invariant) => ({
      id: invariant.id,
      statement: invariant.statement,
    })),
  };
}

function importSpecifiers(source: string): string[] {
  return Array.from(source.matchAll(/(?:import\s*\(\s*|(?:import|export)\s+(?:type\s+)?(?:[^"']+?\s+from\s+)?)[\"']([^\"']+)[\"']/g), (match) => match[1] ?? "");
}
