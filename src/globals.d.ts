declare const Bun: {
  argv: string[];
  version: string;
};

declare const process: {
  cwd(): string;
  exitCode?: number;
  env: Record<string, string | undefined>;
};

interface ImportMeta {
  dir: string;
}

declare module "node:child_process" {
  export function exec(command: string, options: { cwd?: string; timeout?: number }, callback: (error: Error | null, stdout: string, stderr: string) => void): void;
}

declare module "node:fs/promises" {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function lstat(path: string): Promise<{ isSymbolicLink(): boolean }>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function readdir(path: string): Promise<string[]>;
  export function realpath(path: string): Promise<string>;
  export function rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
  export function stat(path: string): Promise<unknown>;
  export function writeFile(path: string, content: string, encoding: "utf8"): Promise<void>;
}

declare module "node:os" {
  export function homedir(): string;
  export function tmpdir(): string;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...parts: string[]): string;
  export const sep: string;
}

declare module "node:util" {
  export function promisify<TArgs extends unknown[], TResult>(
    fn: (...args: [...TArgs, (error: Error | null, result: TResult) => void]) => void
  ): (...args: TArgs) => Promise<TResult>;
}

declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => Promise<void> | void): void;
  export const expect: (value: unknown) => {
    toBe(expected: unknown): void;
    toContain(expected: unknown): void;
    toBeGreaterThan(expected: number): void;
  };
}
