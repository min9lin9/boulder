import { capabilityInventoryPath, hasValidInventoryItems, loadCapabilityInventory, type CapabilityDiscoveryOptions, type InventoryItem } from "./capability-inventory";
import type { ProfileDriftWarning, ResolvedWorkflowProfile } from "./types";
import { executorsFromResolvedProfile, resolveWorkflowProfile } from "./workflow-profiles";

export type CapabilityLane = "intake" | "plan" | "execute" | "verify" | "record" | "compound";
export type DoctorStatus = "pass" | "warn" | "fail";
export type DoctorSeverity = "warn" | "error";

export type Capability = {
  readonly id: string;
  readonly kind: "skill" | "mcp" | "plugin" | "runtime" | "adapter";
  readonly status: string;
  readonly lane: CapabilityLane;
  readonly officialDocsFirst: boolean;
  readonly routingHint: string;
};

export type DoctorIssue = {
  readonly id: string;
  readonly severity: DoctorSeverity;
  readonly message: string;
};

export type ActiveProfileSummary = {
  readonly id: string;
  readonly source: ResolvedWorkflowProfile["source"];
  readonly purpose: ResolvedWorkflowProfile["purpose"];
  readonly externalDefault: ResolvedWorkflowProfile["externalPolicy"]["default"];
  readonly externalRequiresApproval: boolean;
  readonly suggestion: ResolvedWorkflowProfile["suggestion"];
  readonly drift: readonly ProfileDriftWarning[];
};

export type CapabilityDoctorReport = {
  readonly status: DoctorStatus;
  readonly activeProfile: ActiveProfileSummary | null;
  readonly capabilities: readonly Capability[];
  readonly issues: readonly DoctorIssue[];
  readonly nextSteps: readonly string[];
};

export async function evaluateCapabilityDoctor(root: string, options: CapabilityDiscoveryOptions = {}): Promise<CapabilityDoctorReport> {
  const resolution = await resolveWorkflowProfile(root, {});
  const inventoryResult = await loadCapabilityInventory(root, options);
  if (inventoryResult.kind === "missing") {
    return {
      status: "fail",
      activeProfile: toActiveProfileSummary(resolution.profile),
      capabilities: [],
      issues: [{ id: "capability-inventory-missing", severity: "error", message: `Missing ${capabilityInventoryPath()}; doctor cannot verify local skills, MCPs, runtimes, or adapters without it.` }],
      nextSteps: ["Run doctor again after adding the inventory."]
    };
  }
  if (inventoryResult.kind === "invalid") {
    return {
      status: "fail",
      activeProfile: toActiveProfileSummary(resolution.profile),
      capabilities: [],
      issues: [{ id: "capability-inventory-invalid", severity: "error", message: `${capabilityInventoryPath()} is malformed; every item needs a string id and each top-level group must be an array.` }],
      nextSteps: ["Fix capability inventory entries so every item has a string id before routing work."]
    };
  }
  const inventory = inventoryResult.inventory;
  if (!hasValidInventoryItems(inventory)) {
    return {
      status: "fail",
      activeProfile: toActiveProfileSummary(resolution.profile),
      capabilities: [],
      issues: [{ id: "capability-inventory-invalid", severity: "error", message: `${capabilityInventoryPath()} contains malformed capability entries; every item needs a string id.` }],
      nextSteps: ["Fix capability inventory entries so every item has a string id before routing work."]
    };
  }
  const capabilities = [
    ...inventory.skills.map((item) => toCapability(item, "skill")),
    ...inventory.mcpServers.map((item) => toCapability(item, "mcp")),
    ...inventory.plugins.map((item) => toCapability(item, "plugin")),
    ...inventory.runtimes.map((item) => toCapability(item, "runtime")),
    ...adapterCapabilities(resolution.profile, inventory)
  ];
  const issues = [
    ...profileDriftIssues(resolution.profile.drift),
    ...runtimeIssues(inventory.runtimes, resolution.profile),
    ...adapterIssues(capabilities)
  ];
  return {
    status: issues.some((item) => item.severity === "error") ? "fail" : issues.length ? "warn" : "pass",
    activeProfile: toActiveProfileSummary(resolution.profile),
    capabilities,
    issues,
    nextSteps: issues.length
      ? issues.map((item) => item.message)
      : ["Capability routing is ready; use official docs before invoking public OSS adapters."]
  };
}

function adapterCapabilities(profile: ResolvedWorkflowProfile, inventory: {
  readonly skills: readonly InventoryItem[];
  readonly mcpServers: readonly InventoryItem[];
  readonly plugins: readonly InventoryItem[];
  readonly runtimes: readonly InventoryItem[];
}): readonly Capability[] {
  const executors = executorsFromResolvedProfile(profile);
  return [
    {
      id: executors.planning.preferred,
      kind: "adapter",
      status: adapterStatus(executors.planning.preferred, inventory),
      lane: "plan",
      officialDocsFirst: true,
      routingHint: `plan: ${routingHintFor("plan")}`
    },
    {
      id: executors.execution.preferred,
      kind: "adapter",
      status: adapterStatus(executors.execution.preferred, inventory),
      lane: "execute",
      officialDocsFirst: true,
      routingHint: `execute: ${routingHintFor("execute")}`
    }
  ];
}

function adapterStatus(executorId: string, inventory: {
  readonly skills: readonly InventoryItem[];
  readonly mcpServers: readonly InventoryItem[];
  readonly plugins: readonly InventoryItem[];
  readonly runtimes: readonly InventoryItem[];
}): string {
  const normalized = executorId.toLowerCase();
  const candidates = [
    ...inventory.skills,
    ...inventory.mcpServers,
    ...inventory.plugins,
    ...inventory.runtimes
  ];
  const isAvailable = candidates.some((item) => {
    const id = item.id.toLowerCase();
    return adapterMatchesInventory(normalized, id);
  });
  return isAvailable ? "available" : "configured-unverified";
}

function adapterMatchesInventory(adapterId: string, inventoryId: string): boolean {
  if (adapterId === inventoryId) return true;
  if (adapterId === "codex") return inventoryId === "codex" || inventoryId === "openai-codex";
  if (adapterId === "gajae-code") return inventoryId === "gajae-code" || inventoryId === "gjc";
  if (adapterId === "lazycodex") return inventoryId === "lazycodex" || inventoryId === "lazy-codex";
  return inventoryTokens(inventoryId).includes(adapterId);
}

function inventoryTokens(inventoryId: string): readonly string[] {
  return inventoryId.split(/[:/@\s]+/).filter((item) => item.length > 0);
}

function toCapability(item: InventoryItem, kind: Capability["kind"]): Capability {
  const lane = laneFor(item.id, kind);
  return {
    id: item.id,
    kind,
    status: kind === "runtime" ? item.version ?? item.status ?? "unknown" : item.status ?? "unknown",
    lane,
    officialDocsFirst: kind === "mcp" || Boolean(item.officialDocsUrl),
    routingHint: `${lane}: ${routingHintFor(lane)}`
  };
}

function laneFor(id: string, kind: Capability["kind"]): CapabilityLane {
  const normalized = id.toLowerCase();
  if (normalized.includes("ulw-plan") || normalized.includes("gajae") || normalized.includes("deep-interview")) return "plan";
  if (normalized.includes("ulw-loop") || normalized.includes("lazycodex") || normalized.includes("programming")) return "execute";
  if (normalized.includes("lsp") || normalized.includes("review") || normalized.includes("qa")) return "verify";
  if (normalized.includes("ledger") || normalized.includes("notion")) return "record";
  if (kind === "mcp") return "intake";
  return "compound";
}

function routingHintFor(lane: CapabilityLane): string {
  switch (lane) {
    case "intake":
      return "collect public docs, repo context, and task facts before planning";
    case "plan":
      return "produce decision-complete planning packet";
    case "execute":
      return "implement from approved packet and capture QA evidence";
    case "verify":
      return "run gates, LSP, tests, and reviewer checks";
    case "record":
      return "append reusable evidence and decision logs";
    case "compound":
      return "coordinate cross-lane workflow and capability selection";
  }
}

function runtimeIssues(runtimes: readonly InventoryItem[], profile: ResolvedWorkflowProfile): readonly DoctorIssue[] {
  const executors = executorsFromResolvedProfile(profile);
  const usesGajaeCode = executors.planning.preferred === "gajae-code"
    || executors.execution.preferred === "gajae-code";
  if (!usesGajaeCode) return [];
  const bun = runtimes.find((item) => item.id === "bun");
  if (bun?.version && compareVersions(bun.version, "1.3.14") < 0) {
    return [{
      id: "gajae-code-bun-runtime",
      severity: "warn",
      message: `Gajae-Code requires Bun >=1.3.14; detected Bun ${bun.version}. Upgrade Bun before live GJC execution.`
    }];
  }
  return [];
}

function adapterIssues(capabilities: readonly Capability[]): readonly DoctorIssue[] {
  return capabilities
    .filter((item) => item.kind === "adapter" && item.status === "configured-unverified")
    .map((item) => ({
      id: `${item.id}-adapter-unverified`,
      severity: "warn",
      message: `${item.id} is configured as the ${item.lane} adapter but was not found in the local Codex inventory. Install or enable ${item.id}, or keep using Codex fallback; live execution remains approval-gated.`
    }));
}

function profileDriftIssues(drift: readonly ProfileDriftWarning[]): readonly DoctorIssue[] {
  return drift.map((item) => ({
    id: item.id,
    severity: "warn",
    message: item.message
  }));
}

function toActiveProfileSummary(profile: ResolvedWorkflowProfile): ActiveProfileSummary {
  return {
    id: profile.id,
    source: profile.source,
    purpose: profile.purpose,
    externalDefault: profile.externalPolicy.default,
    externalRequiresApproval: profile.externalPolicy.requireExplicitApproval,
    suggestion: profile.suggestion,
    drift: profile.drift
  };
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number.parseInt(part, 10));
  const b = right.split(".").map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const leftPart = Number.isFinite(a[index]) ? a[index] : 0;
    const rightPart = Number.isFinite(b[index]) ? b[index] : 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return 0;
}
