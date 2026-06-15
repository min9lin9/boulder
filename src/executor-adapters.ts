import type { ExecutorAdapterCommand } from "./types";

export function adapterCommandsForExecutor(executorId: string): readonly ExecutorAdapterCommand[] {
  const normalized = executorId.toLowerCase();
  if (normalized === "gajae-code" || normalized === "gjc" || normalized.includes("gajae")) {
    return [
      {
        command: "bunx gajae-code --help",
        purpose: "confirm the planning adapter is installed and compatible",
        requiresApproval: false
      },
      {
        command: "bunx gajae-code -p @docs/CASE_STUDIES/evidence/core-implementation/gjc-plan.md \"Review this Boulder planning packet and return execution handoff notes\"",
        purpose: "candidate live planning review handoff from Boulder evidence to GJC",
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
