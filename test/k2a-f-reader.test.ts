import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  K2A_F_MAX_INPUT_BYTES,
  parseK2aFContractFoundationBytes,
  type K2aFReaderOwnedIssueId,
} from "../src/k2a-f/reader.js";
import { validateK2aFContractFoundation } from "../src/k2a-f/validation.js";

const root = join(import.meta.dir, "..");
const fixturePath = join(root, "fixtures/k2a-f/contract-foundation.v1.json");
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const fixtureBytes = await readFile(fixturePath);
const fixture = parseFixture(JSON.parse(decoder.decode(fixtureBytes)));

const readerIssue = (id: K2aFReaderOwnedIssueId, message: string) => ({ id, path: "$", message });
const duplicateIssue = readerIssue("k2a-f.reader.input.json_duplicate", "Input must not contain duplicate JSON object members.");
const malformedIssue = readerIssue("k2a-f.reader.input.json_invalid", "Input must contain valid JSON.");

describe("K2a-F contract foundation byte reader", () => {
  test("accepts encoded valid fixture bytes and hashes the original supplied bytes", async () => {
    const bytes = encoder.encode(JSON.stringify(fixture.valid));
    const result = await parseK2aFContractFoundationBytes(bytes);

    expect(result).toEqual({
      ok: true,
      value: {
        rawDigest: independentDigest(bytes),
        contract: fixture.valid,
      },
      issues: [],
    });
    if (!result.ok) throw new Error("Encoded valid fixture bytes were rejected.");
    expect(result.value.rawDigest).not.toBe(result.value.contract.contractDigest);
    expect(Object.keys(result).sort()).toEqual(["issues", "ok", "value"]);
    expect(Object.keys(result.value).sort()).toEqual(["contract", "rawDigest"]);
  });

  test("rejects the fixture envelope through frozen validation without reader exceptions", async () => {
    const result = await parseK2aFContractFoundationBytes(fixtureBytes);

    expect(result).toEqual({
      ok: false,
      issues: (await validateK2aFContractFoundation(JSON.parse(decoder.decode(fixtureBytes)))).issues,
    });
    expect("value" in result).toBe(false);
  });

  test("delegates encoded invalid fixture bytes to frozen validation", async () => {
    const bytes = encoder.encode(JSON.stringify(fixture.invalid));
    const result = await parseK2aFContractFoundationBytes(bytes);
    const expected = await validateK2aFContractFoundation(JSON.parse(decoder.decode(bytes)));

    expect(result).toEqual({ ok: false, issues: expected.issues });
    expect("value" in result).toBe(false);
  });

  test("returns exact reader-owned input and resource issues", async () => {
    for (const input of [undefined, null, "{}", {}, new ArrayBuffer(0)]) {
      await expectReaderFailure(input, readerIssue("k2a-f.reader.input.type", "Input must be a Uint8Array."));
    }
    await expectReaderFailure(
      new Uint8Array(K2A_F_MAX_INPUT_BYTES + 1),
      readerIssue("k2a-f.reader.input.too_large", "Input exceeds the 64 KiB size limit."),
    );
    await expectReaderFailure(
      new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]),
      readerIssue("k2a-f.reader.input.bom", "Input must not begin with a UTF-8 BOM."),
    );
    await expectReaderFailure(
      new Uint8Array([0xc3, 0x28]),
      readerIssue("k2a-f.reader.input.utf8_invalid", "Input must be valid UTF-8."),
    );
  });

  test("accepts the exact 65,536-byte JSON boundary and rejects 65,537 bytes before parsing", async () => {
    const boundary = encoder.encode(`{"x":"${"a".repeat(65_528)}"}`);
    expect(boundary.byteLength).toBe(K2A_F_MAX_INPUT_BYTES);
    await expectFrozenValidationEquivalence(boundary);

    await expectReaderFailure(
      new Uint8Array(K2A_F_MAX_INPUT_BYTES + 1),
      readerIssue("k2a-f.reader.input.too_large", "Input exceeds the 64 KiB size limit."),
    );
  });

  test("preserves duplicate decoded-key and colon precedence", async () => {
    for (const source of [
      '{"a":0,"a":1}',
      '{"a":{"b":0,"b":1}}',
      '{"a":0,"\\u0061":1}',
    ]) {
      await expectReaderFailure(encoder.encode(source), duplicateIssue);
    }
    await expectReaderFailure(encoder.encode('{"a":0,"a" 1}'), malformedIssue);
    await expectReaderFailure(encoder.encode('{"a":0,"a":'), duplicateIssue);
    await expectReaderFailure(encoder.encode('{"a" 0,"a":1}'), malformedIssue);
  });

  test("rejects representative JSON grammar failures before frozen validation", async () => {
    for (const input of [
      encoder.encode(""),
      encoder.encode('{"a":0} trailing'),
      encoder.encode("01"),
      encoder.encode('"\\x"'),
      new Uint8Array([0x22, 0x61, 0x01, 0x62, 0x22]),
    ]) {
      await expectReaderFailure(input, malformedIssue);
    }
  });

  test("scans scalar and array roots before delegating frozen validation", async () => {
    await expectFrozenValidationEquivalence(encoder.encode("0"));
    await expectFrozenValidationEquivalence(encoder.encode("[]"));
  });

  test("handles deeply nested valid and malformed documents iteratively", async () => {
    const deepValid = encoder.encode(`{"x":${"[".repeat(20_000)}0${"]".repeat(20_000)}}`);
    const deepMalformed = encoder.encode(`{"x":${"[".repeat(20_000)}0`);

    expect(deepValid.byteLength <= K2A_F_MAX_INPUT_BYTES).toBe(true);
    expect(deepMalformed.byteLength <= K2A_F_MAX_INPUT_BYTES).toBe(true);
    await expectFrozenValidationEquivalence(deepValid);
    await expectReaderFailure(deepMalformed, malformedIssue);
  });

  test("keeps the reader at the sibling-only byte boundary", async () => {
    const source = await readFile(join(root, "src/k2a-f/reader.ts"), "utf8");

    expect(importSpecifiers(source).sort()).toEqual([
      "./canonical.js",
      "./contracts.js",
      "./validation.js",
    ]);
    expect(source).not.toMatch(/import\s*\(/);
    expect(source).not.toMatch(/node:/);
    expect(source).not.toMatch(/fixture|envelope|unwrap/i);
  });
});

async function expectReaderFailure(input: unknown, issue: { readonly id: string; readonly path: string; readonly message: string }): Promise<void> {
  const result = await parseK2aFContractFoundationBytes(input);
  expect(result).toEqual({ ok: false, issues: [issue] });
  expect("value" in result).toBe(false);
  expect(Object.keys(result).sort()).toEqual(["issues", "ok"]);
}

async function expectFrozenValidationEquivalence(bytes: Uint8Array): Promise<void> {
  const expected = await validateK2aFContractFoundation(JSON.parse(decoder.decode(bytes)));
  const result = await parseK2aFContractFoundationBytes(bytes);

  if (expected.ok) {
    expect(result).toEqual({
      ok: true,
      value: { rawDigest: independentDigest(bytes), contract: expected.value },
      issues: [],
    });
    return;
  }
  expect(result).toEqual({ ok: false, issues: expected.issues });
}

function independentDigest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseFixture(value: unknown): { readonly valid: Record<string, unknown>; readonly invalid: Record<string, unknown> } {
  if (!isRecord(value) || !isRecord(value.valid) || !isRecord(value.invalid)) {
    throw new Error("K2a-F fixture is malformed.");
  }
  return { valid: value.valid, invalid: value.invalid };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function importSpecifiers(source: string): string[] {
  return Array.from(source.matchAll(/(?:import\s*\(\s*|(?:import|export)\s+(?:type\s+)?(?:[^"']+?\s+from\s+)?)["']([^"']+)["']/g), (match) => match[1] ?? "");
}
