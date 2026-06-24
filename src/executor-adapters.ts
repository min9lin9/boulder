import type { ExecutorAdapterCommand } from "./types";

export function adapterCommandsForExecutor(executorId: string): readonly ExecutorAdapterCommand[] {
  const normalized = executorId.toLowerCase();
  if (normalized === "gajae-code" || normalized === "gjc" || normalized.includes("gajae")) {
    return [
      {
        command: "gjc mcp-serve coordinator --check --json",
        purpose: "confirm the GJC Hermes coordinator MCP bridge is installed and compatible",
        requiresApproval: false
      },
      {
        command: "gjc setup hermes --root . --smoke",
        purpose: "render and smoke-check the Hermes-compatible GJC setup without mutating files",
        requiresApproval: false
      },
      {
        command: "gjc_delegate_plan --cwd . --task @docs/CASE_STUDIES/evidence/core-implementation/gjc-plan.md",
        purpose: "candidate live planning delegation through the GJC coordinator contract",
        requiresApproval: true
      }
    ];
  }
  if (normalized === "lazycodex" || normalized.includes("lazycodex")) {
    return [
      {
        command: "lazycodex --help",
        purpose: "confirm the execution adapter is installed and compatible",
        requiresApproval: false
      },
      {
        command: "lazycodex run --plan artifacts/gjc-plan.json --evidence artifacts/lazycodex-result.json",
        purpose: "candidate live execution handoff from a GJC plan into LazyCodex evidence",
        requiresApproval: true
      }
    ];
  }
  return [];
}
