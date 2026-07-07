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

export function optionValue(args: readonly string[], flag: string): string | null {
  const index = args.findIndex((arg) => arg === flag);
  return index >= 0 ? valueAfter(args, index) : null;
}

export function allOptionValues(args: readonly string[], flag: string): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flag) continue;
    const value = valueAfter(args, index);
    if (value) values.push(value);
  }
  return values;
}

export function subcommandAfter(args: readonly string[], command: string): string | null {
  const index = args.findIndex((arg) => arg === command);
  const value = index >= 0 ? valueAfter(args, index) : null;
  return value && !value.startsWith("-") ? value : null;
}

export function valueAfter(args: readonly string[], index: number): string | null {
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : null;
}
