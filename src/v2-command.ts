import { constants } from "node:fs";
import { open, realpath, type FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { formatV2ExecutionOutcome, prettyJson } from "./cli-format.js";
import { createV2FixtureCapabilityRegistry } from "./v2/capability.js";
import { createV2FixtureCritiqueEvaluator } from "./v2/critique.js";
import { executeV2Envelope } from "./v2/execution.js";

const MAX_INPUT_BYTES = 256 * 1024;
const VALUE_FLAGS = new Set(["--input", "--cwd"]);
const BOOLEAN_FLAGS = new Set(["--json"]);

type V2CommandOptions = Readonly<{
  input: string;
  cwd: string;
  json: boolean;
}>;

type V2ArgumentParseResult =
  | { readonly ok: true; readonly options: V2CommandOptions }
  | { readonly ok: false; readonly error: V2CliError };

class V2CliError extends Error {
  constructor(readonly id: string, message: string) {
    super(message);
    this.name = "V2CliError";
  }
}

export async function runV2Command(args: readonly string[]): Promise<void> {
  const parsed = parseV2Arguments(args);
  if (!parsed.ok) return printV2Error(args.includes("--json"), parsed.error);

  const content = await readV2Input(parsed.options);
  if (!content.ok) return printV2Error(parsed.options.json, content.error);
  if (hasDuplicateJsonObjectMembers(content.value)) {
    return printV2Error(parsed.options.json, malformedInputError());
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(content.value);
  } catch {
    return printV2Error(parsed.options.json, malformedInputError());
  }

  const outcome = await executeV2Envelope(envelope, {
    capabilityRegistry: createV2FixtureCapabilityRegistry(),
    critiqueEvaluator: await createV2FixtureCritiqueEvaluator(),
    now: new Date().toISOString(),
  });
  const result = {
    schemaVersion: "boulder.v2.command-result.v1",
    command: "v2 execute",
    ...outcome,
  };
  if (parsed.options.json) console.log(prettyJson(result));
  else console.log(formatV2ExecutionOutcome(outcome));
  if (outcome.status === "blocked") process.exitCode = 1;
}

function parseV2Arguments(args: readonly string[]): V2ArgumentParseResult {
  if (args[0] !== "v2" || args[1] !== "execute") {
    return invalidCommand();
  }

  const values = new Map<string, string>();
  const booleans = new Set<string>();
  for (let index = 2; index < args.length; index += 1) {
    const arg = args[index];
    if (VALUE_FLAGS.has(arg)) {
      if (values.has(arg)) return parseError("v2.cli.option.duplicate", "An option may only be supplied once.");
      const value = args[index + 1];
      if (!value || value.startsWith("-")) return parseError("v2.cli.option.value_missing", "An option requires a value.");
      values.set(arg, value);
      index += 1;
      continue;
    }
    if (BOOLEAN_FLAGS.has(arg)) {
      if (booleans.has(arg)) return parseError("v2.cli.option.duplicate", "An option may only be supplied once.");
      booleans.add(arg);
      continue;
    }
    if (arg.startsWith("-")) return parseError("v2.cli.option.unknown", "An unsupported option was supplied.");
    return parseError("v2.cli.argument.unexpected", "An unexpected argument was supplied.");
  }

  const input = values.get("--input");
  if (!input) return parseError("v2.cli.input.required", "--input is required.");
  const cwd = resolve(values.get("--cwd") ?? process.cwd());
  return { ok: true, options: { input, cwd, json: booleans.has("--json") } };
}

async function readV2Input(options: V2CommandOptions): Promise<{ readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: V2CliError }> {
  const target = resolve(options.cwd, options.input);
  if (!isWithin(options.cwd, target)) return { ok: false, error: inputPathError() };

  let handle: FileHandle | undefined;
  try {
    const root = await realpath(options.cwd);
    if (root !== options.cwd) throw inputPathError();

    const parent = await realpath(dirname(target));
    if (!isWithin(root, parent)) throw inputPathError();

    handle = await open(target, constants.O_RDONLY | requiredNoFollowFlag());
    const info = await handle.stat();
    if (!info.isFile()) throw inputPathError();

    const openedPath = await realpath(`/proc/self/fd/${handle.fd}`);
    if (!isWithin(root, openedPath)) throw inputPathError();

    const bytes = new Uint8Array(MAX_INPUT_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < bytes.byteLength) {
      const read = await handle.read(bytes, bytesRead, bytes.byteLength - bytesRead, bytesRead);
      if (read.bytesRead === 0) break;
      bytesRead += read.bytesRead;
    }
    if (bytesRead > MAX_INPUT_BYTES) {
      return { ok: false, error: new V2CliError("v2.cli.input.too_large", "Input exceeds the 256 KiB size limit.") };
    }
    try {
      return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytesRead)) };
    } catch {
      return { ok: false, error: malformedInputError() };
    }
  } catch (error) {
    if (error instanceof V2CliError) return { ok: false, error };
    if (hasInputErrorCode(error, "ELOOP")) return { ok: false, error: inputPathError() };
    if (hasKnownInputErrorCode(error)) {
      return { ok: false, error: new V2CliError("v2.cli.input.unreadable", "Input could not be read.") };
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

function requiredNoFollowFlag(): number {
  const flag = constants.O_NOFOLLOW;
  if (typeof flag !== "number") throw inputPathError();
  return flag;
}

function hasKnownInputErrorCode(error: unknown): boolean {
  return ["EACCES", "EBADF", "EIO", "EISDIR", "EMFILE", "ENAMETOOLONG", "ENFILE", "ENOENT", "ENOTDIR", "EPERM"].some((code) => hasInputErrorCode(error, code));
}

function hasInputErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && Reflect.get(error, "code") === code;
}

function isWithin(root: string, target: string): boolean {
  const relation = relative(root, target);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}
function hasDuplicateJsonObjectMembers(input: string): boolean {
  const duplicate = new Error("Duplicate JSON object member.");
  let index = 0;

  function skipWhitespace(): void {
    while (/\s/.test(input[index] ?? "")) index += 1;
  }

  function parseString(): string {
    if (input[index] !== "\"") throw new Error("Expected JSON string.");
    index += 1;
    let value = "";
    while (index < input.length) {
      const character = input[index]!;
      index += 1;
      if (character === "\"") return value;
      if (character === "\\") {
        const escaped = input[index];
        index += 1;
        if (escaped === "\"" || escaped === "\\" || escaped === "/") value += escaped;
        else if (escaped === "b") value += "\b";
        else if (escaped === "f") value += "\f";
        else if (escaped === "n") value += "\n";
        else if (escaped === "r") value += "\r";
        else if (escaped === "t") value += "\t";
        else if (escaped === "u") {
          const hex = input.slice(index, index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error("Invalid JSON unicode escape.");
          value += String.fromCharCode(Number.parseInt(hex, 16));
          index += 4;
        } else throw new Error("Invalid JSON escape.");
      } else {
        if (character < " ") throw new Error("Invalid JSON control character.");
        value += character;
      }
    }
    throw new Error("Unterminated JSON string.");
  }

  function parsePrimitive(): void {
    const start = index;
    while (index < input.length && !/[\s,\]}]/.test(input[index]!)) index += 1;
    if (index === start) throw new Error("Expected JSON value.");
  }

  function parseArray(): void {
    index += 1;
    skipWhitespace();
    if (input[index] === "]") {
      index += 1;
      return;
    }
    while (true) {
      parseValue();
      skipWhitespace();
      if (input[index] === "]") {
        index += 1;
        return;
      }
      if (input[index] !== ",") throw new Error("Expected JSON array delimiter.");
      index += 1;
      skipWhitespace();
    }
  }

  function parseObject(): void {
    index += 1;
    const names = new Set<string>();
    skipWhitespace();
    if (input[index] === "}") {
      index += 1;
      return;
    }
    while (true) {
      skipWhitespace();
      const name = parseString();
      if (names.has(name)) throw duplicate;
      names.add(name);
      skipWhitespace();
      if (input[index] !== ":") throw new Error("Expected JSON object member delimiter.");
      index += 1;
      parseValue();
      skipWhitespace();
      if (input[index] === "}") {
        index += 1;
        return;
      }
      if (input[index] !== ",") throw new Error("Expected JSON object delimiter.");
      index += 1;
      skipWhitespace();
    }
  }

  function parseValue(): void {
    skipWhitespace();
    if (input[index] === "{") parseObject();
    else if (input[index] === "[") parseArray();
    else if (input[index] === "\"") void parseString();
    else parsePrimitive();
  }

  try {
    parseValue();
    skipWhitespace();
    if (index !== input.length) throw new Error("Unexpected trailing JSON input.");
    return false;
  } catch (error) {
    return error === duplicate;
  }
}

function invalidCommand(): V2ArgumentParseResult {
  return parseError("v2.cli.command.invalid", "Expected: boulder v2 execute --input <path> [--cwd <directory>] [--json].");
}

function parseError(id: string, message: string): V2ArgumentParseResult {
  return { ok: false, error: new V2CliError(id, message) };
}

function inputPathError(): V2CliError {
  return new V2CliError("v2.cli.input.path_invalid", "Input path is not permitted.");
}
function malformedInputError(): V2CliError {
  return new V2CliError("v2.cli.input.malformed", "Input must contain valid JSON.");
}

function printV2Error(json: boolean, error: V2CliError): void {
  if (json) console.log(prettyJson({ schemaVersion: "boulder.error.v1", error: { id: error.id, message: error.message } }));
  else console.error(`ERROR ${error.id}: ${error.message}`);
  process.exitCode = 1;
}
