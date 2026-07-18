import { resolve } from "node:path";

export type CliOptions = {
  readonly cwd: string;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly json: boolean;
  readonly friction: string;
  readonly runId: string;
  readonly evidence: string;
};

export function parseOptions(args: readonly string[]): CliOptions {
  const cwd = optionValue(args, "--cwd");
  const friction = optionValue(args, "--friction");
  const runId = optionValue(args, "--run-id");
  const evidence = optionValue(args, "--evidence");
  return {
    cwd: cwd ? resolve(cwd) : process.cwd(),
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
    json: args.includes("--json"),
    friction: friction ?? "medium",
    runId: runId ?? "field-run",
    evidence: evidence ?? "evidence/field-readiness/field-run"
  };
}

function optionValue(args: readonly string[], flag: string): string | null {
  const index = args.findIndex((arg) => arg === flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("-") ? value : null;
}
