import { inspectRepo } from "./inspect";
import { firstProtectedHandoffPath, hasRawWorkspaceReference, includedContextFiles } from "./handoff-path-policy";

export type HandoffPacketOptions = {
  readonly adapter: string;
  readonly include: readonly string[];
};

export type HandoffPacket = {
  readonly schemaVersion: "boulder.handoff.v1";
  readonly destination: {
    readonly adapter: string;
    readonly external: boolean;
  };
  readonly dataPolicy: {
    readonly classification: "internal";
    readonly rawWorkspaceContentIncluded: boolean;
    readonly approvalRequired: true;
    readonly redaction: {
      readonly status: "applied";
      readonly method: "summary-only";
    };
  };
  readonly task: {
    readonly objective: string;
    readonly acceptanceCriteria: readonly string[];
  };
  readonly contextSummary: {
    readonly repoName: string;
    readonly detectedFiles: readonly string[];
    readonly relevantFacts: readonly string[];
  };
  readonly excludedContent: readonly string[];
};

export type HandoffSendOptions = {
  readonly approveExternal: boolean;
};

export type HandoffSendResult = {
  readonly status: "blocked" | "ready";
  readonly error: string | null;
  readonly message: string;
};

export type HandoffPacketValidation = {
  readonly valid: boolean;
  readonly error: string | null;
};

export class ProtectedHandoffPathError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Protected path is not allowed in external handoff packet: ${path}`);
    this.name = "ProtectedHandoffPathError";
    this.path = path;
  }
}

export class InvalidHandoffAdapterError extends Error {
  constructor() {
    super("Adapter name must contain only letters, numbers, dots, underscores, or hyphens.");
    this.name = "InvalidHandoffAdapterError";
  }
}

export async function buildHandoffPacket(root: string, options: HandoffPacketOptions): Promise<HandoffPacket> {
  if (!isSafeAdapterName(options.adapter)) {
    throw new InvalidHandoffAdapterError();
  }
  const protectedPath = firstProtectedHandoffPath(options.include);
  if (protectedPath) {
    throw new ProtectedHandoffPathError(protectedPath);
  }
  const includedFiles = includedContextFiles(options.include);
  const inspection = await inspectRepo(root);
  return {
    schemaVersion: "boulder.handoff.v1",
    destination: {
      adapter: options.adapter,
      external: true
    },
    dataPolicy: {
      classification: "internal",
      rawWorkspaceContentIncluded: false,
      approvalRequired: true,
      redaction: {
        status: "applied",
        method: "summary-only"
      }
    },
    task: {
      objective: "Review the sanitized Boulder handoff packet and return bounded next-step guidance.",
      acceptanceCriteria: [
        "Use summary-only context.",
        "Use the provided summary and acceptance criteria only.",
        "Return implementation or planning guidance without executing external side effects."
      ]
    },
    contextSummary: {
      repoName: inspection.name,
      detectedFiles: [
        inspection.detected.readme ? "README.md" : "",
        inspection.detected.packageJson ? "package.json" : "",
        inspection.detected.pyproject ? "pyproject.toml" : "",
        ...includedFiles
      ].filter(uniqueNonEmpty),
      relevantFacts: [
        `recommended workflows: ${inspection.recommendedWorkflows.join(", ")}`,
        `risks: ${inspection.risks.join(", ")}`
      ]
    },
    excludedContent: [
      "raw workspace file bodies",
      "raw diffs",
      "secrets",
      "local absolute paths",
      "protected paths"
    ]
  };
}

export function evaluateHandoffSend(packet: HandoffPacket, options: HandoffSendOptions): HandoffSendResult {
  const validation = validateHandoffPacketForSend(packet);
  if (!validation.valid) {
    return {
      status: "blocked",
      error: validation.error,
      message: validation.error ?? "Invalid handoff packet."
    };
  }
  if (packet.dataPolicy.rawWorkspaceContentIncluded) {
    return {
      status: "blocked",
      error: "ERROR external.raw_workspace_forbidden: Raw workspace content is forbidden even with approval.",
      message: "Raw workspace content is forbidden."
    };
  }
  if (!options.approveExternal) {
    return {
      status: "blocked",
      error: "ERROR external.handoff.blocked: External adapter execution is blocked by default.",
      message: "External adapter execution is blocked by default."
    };
  }
  return {
    status: "ready",
    error: null,
    message: "Sanitized packet is ready for an explicitly approved external adapter handoff."
  };
}

export function validateHandoffPacketForSend(packet: HandoffPacket): HandoffPacketValidation {
  if (packet.schemaVersion !== "boulder.handoff.v1") {
    return invalidPacket("schemaVersion");
  }
  if (!packet.destination.external || !isSafeAdapterName(packet.destination.adapter)) {
    return invalidPacket("destination");
  }
  if (packet.dataPolicy.classification !== "internal") {
    return invalidPacket("classification");
  }
  if (packet.dataPolicy.rawWorkspaceContentIncluded) {
    return {
      valid: false,
      error: "ERROR external.raw_workspace_forbidden: Raw workspace content is forbidden even with approval."
    };
  }
  if (!packet.dataPolicy.approvalRequired) {
    return invalidPacket("approvalRequired");
  }
  if (packet.dataPolicy.redaction.status !== "applied" || packet.dataPolicy.redaction.method !== "summary-only") {
    return invalidPacket("redaction");
  }
  if (!packet.excludedContent.includes("raw workspace file bodies")) {
    return invalidPacket("excludedContent");
  }
  if (packetContainsRawWorkspaceReference(packet)) {
    return {
      valid: false,
      error: "ERROR external.raw_workspace_forbidden: Raw workspace content is forbidden even with approval."
    };
  }
  return { valid: true, error: null };
}

function uniqueNonEmpty(value: string, index: number, values: readonly string[]): boolean {
  return value.length > 0 && values.indexOf(value) === index;
}

function invalidPacket(field: string): HandoffPacketValidation {
  return {
    valid: false,
    error: `ERROR handoff.packet_invalid: Handoff packet failed safety validation at ${field}.`
  };
}

function isSafeAdapterName(adapter: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(adapter);
}

function packetContainsRawWorkspaceReference(packet: HandoffPacket): boolean {
  return [
    packet.task.objective,
    ...packet.task.acceptanceCriteria,
    packet.contextSummary.repoName,
    ...packet.contextSummary.detectedFiles,
    ...packet.contextSummary.relevantFacts,
    ...packet.excludedContent.filter((item) => !SAFE_EXCLUDED_CONTENT.includes(item))
  ].some(hasRawWorkspaceReference);
}

const SAFE_EXCLUDED_CONTENT = [
  "raw workspace file bodies",
  "raw diffs",
  "secrets",
  "local absolute paths",
  "protected paths"
];
