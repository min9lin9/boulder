import {
  type K2aFContractFoundation,
  type K2aFDigest,
  type K2aFValidationIssue,
} from "./contracts.js";
import { sha256K2aF } from "./canonical.js";
import { validateK2aFContractFoundation } from "./validation.js";

export const K2A_F_MAX_INPUT_BYTES = 65_536 as const;

export type K2aFReaderOwnedIssueId =
  | "k2a-f.reader.input.type"
  | "k2a-f.reader.input.too_large"
  | "k2a-f.reader.input.bom"
  | "k2a-f.reader.input.utf8_invalid"
  | "k2a-f.reader.input.json_duplicate"
  | "k2a-f.reader.input.json_invalid";

export type K2aFReaderIssue = K2aFValidationIssue | Readonly<{
  id: K2aFReaderOwnedIssueId;
  path: "$";
  message: string;
}>;

export type K2aFContractFoundationBytes = Readonly<{
  rawDigest: K2aFDigest;
  contract: K2aFContractFoundation;
}>;

export type K2aFContractFoundationBytesResult =
  | Readonly<{ ok: true; value: K2aFContractFoundationBytes; issues: readonly [] }>
  | Readonly<{ ok: false; issues: readonly K2aFReaderIssue[] }>;

type ArrayExpectation = "valueOrEnd" | "value" | "commaOrEnd";
type ObjectExpectation = "keyOrEnd" | "key" | "colon" | "value" | "commaOrEnd";

type JsonFrame =
  | { readonly kind: "array"; expectation: ArrayExpectation }
  | {
      readonly kind: "object";
      expectation: ObjectExpectation;
      readonly keys: Set<string>;
      key: string | undefined;
    };

type ScanResult = "valid" | "duplicate" | "invalid";

const BOM = [0xef, 0xbb, 0xbf] as const;

export async function parseK2aFContractFoundationBytes(
  input: unknown,
): Promise<K2aFContractFoundationBytesResult> {
  if (!(input instanceof Uint8Array)) {
    return readerFailure("k2a-f.reader.input.type", "Input must be a Uint8Array.");
  }
  if (input.byteLength > K2A_F_MAX_INPUT_BYTES) {
    return readerFailure("k2a-f.reader.input.too_large", "Input exceeds the 64 KiB size limit.");
  }
  if (input[0] === BOM[0] && input[1] === BOM[1] && input[2] === BOM[2]) {
    return readerFailure("k2a-f.reader.input.bom", "Input must not begin with a UTF-8 BOM.");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    return readerFailure("k2a-f.reader.input.utf8_invalid", "Input must be valid UTF-8.");
  }

  const scanResult = scanJson(text);
  if (scanResult === "duplicate") {
    return readerFailure("k2a-f.reader.input.json_duplicate", "Input must not contain duplicate JSON object members.");
  }
  if (scanResult === "invalid") {
    return readerFailure("k2a-f.reader.input.json_invalid", "Input must contain valid JSON.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return readerFailure("k2a-f.reader.input.json_invalid", "Input must contain valid JSON.");
  }

  const validation = await validateK2aFContractFoundation(parsed);
  if (!validation.ok) return { ok: false, issues: validation.issues };

  return {
    ok: true,
    value: {
      rawDigest: await sha256K2aF(text),
      contract: validation.value,
    },
    issues: [],
  };
}

function readerFailure(
  id: K2aFReaderOwnedIssueId,
  message: string,
): K2aFContractFoundationBytesResult {
  return { ok: false, issues: [{ id, path: "$", message }] };
}

function scanJson(text: string): ScanResult {
  const frames: JsonFrame[] = [];
  let index = 0;
  let rootComplete = false;

  const completeValue = (): void => {
    const parent = frames[frames.length - 1];
    if (!parent) {
      rootComplete = true;
    } else {
      parent.expectation = "commaOrEnd";
    }
  };

  while (true) {
    index = skipWhitespace(text, index);
    if (rootComplete) return index === text.length ? "valid" : "invalid";

    const frame = frames[frames.length - 1];
    if (!frame) {
      const valueIndex = scanValue(text, index, frames, completeValue);
      if (valueIndex < 0) return "invalid";
      index = valueIndex;
      continue;
    }

    if (frame.kind === "array") {
      if (frame.expectation === "commaOrEnd") {
        if (text[index] === "]") {
          index += 1;
          frames.pop();
          completeValue();
        } else if (text[index] === ",") {
          index += 1;
          frame.expectation = "value";
        } else {
          return "invalid";
        }
      } else if (frame.expectation === "valueOrEnd" && text[index] === "]") {
        index += 1;
        frames.pop();
        completeValue();
      } else {
        const valueIndex = scanValue(text, index, frames, completeValue);
        if (valueIndex < 0) return "invalid";
        index = valueIndex;
      }
      continue;
    }

    if (frame.expectation === "commaOrEnd") {
      if (text[index] === "}") {
        index += 1;
        frames.pop();
        completeValue();
      } else if (text[index] === ",") {
        index += 1;
        frame.expectation = "key";
      } else {
        return "invalid";
      }
      continue;
    }
    if (frame.expectation === "keyOrEnd" && text[index] === "}") {
      index += 1;
      frames.pop();
      completeValue();
      continue;
    }
    if (frame.expectation === "keyOrEnd" || frame.expectation === "key") {
      const key = scanString(text, index, true);
      if (!key) return "invalid";
      frame.key = key.value;
      frame.expectation = "colon";
      index = key.index;
      continue;
    }
    if (frame.expectation === "colon") {
      if (text[index] !== ":") return "invalid";
      if (frame.keys.has(frame.key!)) return "duplicate";
      frame.keys.add(frame.key!);
      frame.key = undefined;
      frame.expectation = "value";
      index += 1;
      continue;
    }

    const valueIndex = scanValue(text, index, frames, completeValue);
    if (valueIndex < 0) return "invalid";
    index = valueIndex;
  }
}

function scanValue(
  text: string,
  index: number,
  frames: JsonFrame[],
  completeValue: () => void,
): number {
  const character = text[index];
  if (character === "{") {
    frames.push({ kind: "object", expectation: "keyOrEnd", keys: new Set<string>(), key: undefined });
    return index + 1;
  }
  if (character === "[") {
    frames.push({ kind: "array", expectation: "valueOrEnd" });
    return index + 1;
  }
  if (character === '"') {
    const string = scanString(text, index, false);
    if (!string) return -1;
    completeValue();
    return string.index;
  }

  const literalIndex = scanLiteral(text, index);
  if (literalIndex >= 0) {
    completeValue();
    return literalIndex;
  }

  const numberIndex = scanNumber(text, index);
  if (numberIndex >= 0) {
    completeValue();
    return numberIndex;
  }
  return -1;
}

function scanString(text: string, index: number, decode: boolean): { readonly index: number; readonly value: string } | undefined {
  if (text[index] !== '"') return undefined;

  let value = "";
  let rawStart = index + 1;
  index += 1;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code === 0x22) {
      if (decode) value += text.slice(rawStart, index);
      return { index: index + 1, value };
    }
    if (code < 0x20) return undefined;
    if (code !== 0x5c) {
      index += 1;
      continue;
    }

    if (decode) value += text.slice(rawStart, index);
    index += 1;
    const escape = text[index];
    if (escape === '"' || escape === "\\" || escape === "/") {
      if (decode) value += escape;
      index += 1;
    } else if (escape === "b") {
      if (decode) value += "\b";
      index += 1;
    } else if (escape === "f") {
      if (decode) value += "\f";
      index += 1;
    } else if (escape === "n") {
      if (decode) value += "\n";
      index += 1;
    } else if (escape === "r") {
      if (decode) value += "\r";
      index += 1;
    } else if (escape === "t") {
      if (decode) value += "\t";
      index += 1;
    } else if (escape === "u") {
      if (index + 4 >= text.length) return undefined;
      const hex = text.slice(index + 1, index + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return undefined;
      if (decode) value += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
    } else {
      return undefined;
    }
    rawStart = index;
  }
  return undefined;
}

function scanLiteral(text: string, index: number): number {
  if (text.startsWith("true", index)) return index + 4;
  if (text.startsWith("false", index)) return index + 5;
  if (text.startsWith("null", index)) return index + 4;
  return -1;
}

function scanNumber(text: string, index: number): number {
  if (text[index] === "-") index += 1;
  if (text[index] === "0") {
    index += 1;
  } else if (isDigitOneToNine(text[index])) {
    index += 1;
    while (isDigit(text[index])) index += 1;
  } else {
    return -1;
  }

  if (text[index] === ".") {
    index += 1;
    if (!isDigit(text[index])) return -1;
    while (isDigit(text[index])) index += 1;
  }
  if (text[index] === "e" || text[index] === "E") {
    index += 1;
    if (text[index] === "+" || text[index] === "-") index += 1;
    if (!isDigit(text[index])) return -1;
    while (isDigit(text[index])) index += 1;
  }
  return index;
}

function skipWhitespace(text: string, index: number): number {
  while (text[index] === " " || text[index] === "\t" || text[index] === "\n" || text[index] === "\r") {
    index += 1;
  }
  return index;
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

function isDigitOneToNine(character: string | undefined): boolean {
  return character !== undefined && character >= "1" && character <= "9";
}
