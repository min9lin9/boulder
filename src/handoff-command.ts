import {
  InvalidHandoffAdapterError,
  ProtectedHandoffPathError,
  buildHandoffPacket,
  evaluateHandoffSend,
  validateHandoffPacketForSend,
  type HandoffPacket
} from "./handoff-packet";
import {
  hasReviewReceipt,
  optionValue,
  packetFile,
  packetPathIsSafe,
  packetPathFromArgs,
  readHandoffPacketText,
  UnsafeHandoffPathError,
  writeHandoffPacketText,
  writeReviewReceipt
} from "./handoff-paths";
import { isHandoffPacket } from "./handoff-packet-shape";

export type HandoffCommandOptions = {
  readonly cwd: string;
  readonly json: boolean;
  readonly force: boolean;
};

export async function runHandoffCommand(args: readonly string[], options: HandoffCommandOptions): Promise<void> {
  const subcommand = subcommandAfter(args, "handoff") ?? "packet";
  if (subcommand === "packet") {
    await packetCommand(args, options);
    return;
  }
  if (subcommand === "review") {
    await reviewCommand(args, options);
    return;
  }
  if (subcommand === "send") {
    await sendCommand(args, options);
    return;
  }
  console.error(`Unknown handoff command: ${subcommand}`);
  process.exitCode = 1;
}

async function packetCommand(args: readonly string[], options: HandoffCommandOptions): Promise<void> {
  const adapter = optionValue(args, "--adapter") ?? "gajae-code";
  const include = allOptionValues(args, "--include");
  const packet = await buildPacketOrReport(options.cwd, { adapter, include });
  if (!packet) return;
  const packetPath = packetFile(options.cwd, adapter);
  if (!await packetPathIsSafe(packetPath, options.cwd)) {
    invalidPacketPath();
    return;
  }
  const written = await unsafePathGuard(
    () => writeHandoffPacketText(packetPath, options.cwd, `${JSON.stringify(packet, null, 2)}\n`).then(() => true),
    false
  );
  if (!written) return;
  if (options.json) {
    console.log(JSON.stringify(packet, null, 2));
    return;
  }
  console.log(`Boulder handoff packet written: ${packetPath}`);
}

async function reviewCommand(args: readonly string[], options: HandoffCommandOptions): Promise<void> {
  const packetPath = packetPathOrReport(args, options.cwd);
  if (!packetPath) return;
  if (!await packetPathIsSafe(packetPath, options.cwd)) {
    invalidPacketPath();
    return;
  }
  const packet = await unsafePathGuard(() => loadPacket(packetPath, options.cwd), null);
  if (!packet) return;
  if (packet.status === "missing") {
    missingPacket();
    return;
  }
  if (packet.status === "invalid") {
    invalidPacket();
    process.exitCode = 1;
    return;
  }
  if (!validatePacketOrReport(packet.value)) return;
  const approvalCode = await unsafePathGuard(() => writeReviewReceipt(packetPath, options.cwd, packet.text), null);
  if (!approvalCode) return;
  if (options.json) {
    console.log(JSON.stringify({ packet: packet.value, approvalCode }, null, 2));
    return;
  }
  console.log([
    "Boulder handoff packet review",
    `- adapter: ${packet.value.destination.adapter}`,
    `- raw-workspace-content: ${packet.value.dataPolicy.rawWorkspaceContentIncluded ? "included" : "excluded"}`,
    `- redaction: ${packet.value.dataPolicy.redaction.status}`,
    `- approval-code: ${approvalCode}`
  ].join("\n"));
}

async function sendCommand(args: readonly string[], options: HandoffCommandOptions): Promise<void> {
  const approveExternal = args.includes("--approve-external");
  const approvalCode = optionValue(args, "--approval-code");
  const packetPath = packetPathOrReport(args, options.cwd);
  if (!packetPath) return;
  if (!await packetPathIsSafe(packetPath, options.cwd)) {
    invalidPacketPath();
    return;
  }
  const packet = await unsafePathGuard(() => loadPacket(packetPath, options.cwd), null);
  if (!packet) return;
  if (packet.status === "missing") {
    missingPacket();
    return;
  }
  if (packet.status === "invalid") {
    invalidPacket();
    return;
  }
  const result = evaluateHandoffSend(packet.value, { approveExternal });
  if (result.status === "blocked") {
    console.error(result.error ?? "ERROR external.handoff.blocked: External adapter execution is blocked by default.");
    process.exitCode = 1;
    return;
  }
  if (approveExternal && !await unsafePathGuard(() => hasReviewReceipt(packetPath, options.cwd, packet.text, approvalCode), false)) {
    console.error("ERROR handoff.review_required: Review the sanitized handoff packet before send.");
    process.exitCode = 1;
    return;
  }
  console.log(result.message);
}

type PacketLoadResult =
  | { readonly status: "ready"; readonly value: HandoffPacket; readonly text: string }
  | { readonly status: "missing" }
  | { readonly status: "invalid" };

async function buildPacketOrReport(
  root: string,
  options: { readonly adapter: string; readonly include: readonly string[] }
): Promise<HandoffPacket | null> {
  try {
    return await buildHandoffPacket(root, options);
  } catch (error) {
    if (error instanceof ProtectedHandoffPathError) {
      console.error(`ERROR handoff.protected_path: ${error.message}`);
      process.exitCode = 1;
      return null;
    }
    if (error instanceof InvalidHandoffAdapterError) {
      console.error(`ERROR handoff.adapter_invalid: ${error.message}`);
      process.exitCode = 1;
      return null;
    }
    throw error;
  }
}

function packetPathOrReport(args: readonly string[], cwd: string): string | null {
  try {
    return packetPathFromArgs(args, cwd);
  } catch (error) {
    if (error instanceof InvalidHandoffAdapterError || isNamedError(error, "InvalidHandoffAdapterError")) {
      const message = error instanceof Error ? error.message : "Invalid adapter name.";
      console.error(`ERROR handoff.adapter_invalid: ${message}`);
      process.exitCode = 1;
      return null;
    }
    throw error;
  }
}

async function loadPacket(path: string, root: string): Promise<PacketLoadResult> {
  const text = await readHandoffPacketText(path, root);
  if (!text) return { status: "missing" };
  try {
    const parsed: unknown = JSON.parse(text);
    return isHandoffPacket(parsed) ? { status: "ready", value: parsed, text } : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

async function unsafePathGuard<T>(action: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isUnsafeHandoffPath(error)) {
      invalidPacketPath();
      return fallback;
    }
    throw error;
  }
}

function subcommandAfter(args: readonly string[], command: string): string | null {
  const index = args.findIndex((item) => item === command);
  const value = index >= 0 ? args[index + 1] : null;
  return value && !value.startsWith("-") ? value : null;
}

function allOptionValues(args: readonly string[], flag: string): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) {
      values.push(args[index + 1]);
    }
  }
  return values;
}

function missingPacket(): void {
  console.error("ERROR handoff.packet_missing: Handoff packet was not found. Run `boulder handoff packet` before send.");
  process.exitCode = 1;
}

function invalidPacket(): void {
  console.error("ERROR handoff.packet_invalid: Handoff packet failed safety validation.");
  process.exitCode = 1;
}

function invalidPacketPath(): void {
  console.error("ERROR handoff.packet_path_invalid: Handoff packet path must stay under .boulder/handoffs.");
  process.exitCode = 1;
}

function validatePacketOrReport(packet: HandoffPacket): boolean {
  const validation = validateHandoffPacketForSend(packet);
  if (validation.valid) return true;
  invalidPacket();
  return false;
}

function isNamedError(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

function isUnsafeHandoffPath(error: unknown): boolean {
  return error instanceof UnsafeHandoffPathError || isNamedError(error, "UnsafeHandoffPathError");
}
