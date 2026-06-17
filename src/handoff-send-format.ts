import { adapterCommandsForExecutor } from "./executor-adapters";
import type { HandoffPacket } from "./handoff-packet";

export function formatHandoffSendDryRun(packet: HandoffPacket): string {
  const commands = adapterCommandsForExecutor(packet.destination.adapter);
  const commandLines = commands.length
    ? commands.map((item) => `- command: ${item.command}${item.requiresApproval ? " (approval required)" : ""}`)
    : ["- command: no known adapter command; use packet artifact manually"];
  return [
    "Boulder handoff send dry-run",
    `- adapter: ${packet.destination.adapter}`,
    "- external execution: skipped",
    "- raw workspace content: excluded",
    ...commandLines
  ].join("\n");
}
