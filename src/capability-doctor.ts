import { join } from "node:path";
import { readText } from "./fs";

export type CapabilityLane = "intake" | "plan" | "execute" | "verify" | "record" | "compound";
export type DoctorStatus = "pass" | "warn" | "fail";
export type DoctorSeverity = "warn" | "error";

export type Capability = {
  readonly id: string;
  readonly kind: "skill" | "mcp" | "plugin" | "runtime";
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

export type CapabilityDoctorReport = {
  readonly status: DoctorStatus;
  readonly capabilities: readonly Capability[];
  readonly issues: readonly DoctorIssue[];
  readonly nextSteps: readonly string[];
};

type InventoryItem = {
  readonly id: string;
  readonly status?: string;
  readonly version?: string;
  readonly officialDocsUrl?: string;
};

type CapabilityInventory = {
  readonly skills: readonly InventoryItem[];
  readonly mcpServers: readonly InventoryItem[];
  readonly plugins: readonly InventoryItem[];
  readonly runtimes: readonly InventoryItem[];
};

const INVENTORY_PATH = "fixtures/capabilities/codex-installed.json";

export async function evaluateCapabilityDoctor(root: string): Promise<CapabilityDoctorReport> {
  const inventory = parseInventory(await readText(join(root, INVENTORY_PATH)));
  if (!inventory) {
    return {
      status: "fail",
      capabilities: [],
      issues: [{ id: "capability-inventory-missing", severity: "error", message: `missing or invalid ${INVENTORY_PATH}` }],
      nextSteps: ["Run capability discovery and commit fixtures/capabilities/codex-installed.json before routing work."]
    };
  }
  if (!hasValidItems(inventory)) {
    return {
      status: "fail",
      capabilities: [],
      issues: [{ id: "capability-inventory-invalid", severity: "error", message: `${INVENTORY_PATH} contains malformed capability entries` }],
      nextSteps: ["Fix capability inventory entries so every item has a string id before routing work."]
    };
  }
  const capabilities = [
    ...inventory.skills.map((item) => toCapability(item, "skill")),
    ...inventory.mcpServers.map((item) => toCapability(item, "mcp")),
    ...inventory.plugins.map((item) => toCapability(item, "plugin")),
    ...inventory.runtimes.map((item) => toCapability(item, "runtime"))
  ];
  const issues = runtimeIssues(inventory.runtimes);
  return {
    status: issues.some((item) => item.severity === "error") ? "fail" : issues.length ? "warn" : "pass",
    capabilities,
    issues,
    nextSteps: issues.length
      ? issues.map((item) => item.message)
      : ["Capability routing is ready; use official docs before invoking public OSS adapters."]
  };
}

function toCapability(item: InventoryItem, kind: Capability["kind"]): Capability {
  const lane = laneFor(item.id, kind);
  return {
    id: item.id,
    kind,
    status: item.status ?? "unknown",
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

function runtimeIssues(runtimes: readonly InventoryItem[]): readonly DoctorIssue[] {
  const bun = runtimes.find((item) => item.id === "bun");
  if (bun?.version && compareVersions(bun.version, "1.3.14") < 0) {
    return [{
      id: "gajae-code-bun-runtime",
      severity: "warn",
      message: `Gajae-Code requires Bun >=1.3.14; detected Bun ${bun.version}. Upgrade before live GJC execution.`
    }];
  }
  return [];
}

function parseInventory(content: string | null): CapabilityInventory | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isInventory(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isInventory(value: unknown): value is CapabilityInventory {
  if (!isRecord(value)) return false;
  return ["skills", "mcpServers", "plugins", "runtimes"].every((key) => Array.isArray(value[key]));
}

function hasValidItems(inventory: CapabilityInventory): boolean {
  return [
    ...inventory.skills,
    ...inventory.mcpServers,
    ...inventory.plugins,
    ...inventory.runtimes
  ].every((item) => isRecord(item) && typeof item["id"] === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
