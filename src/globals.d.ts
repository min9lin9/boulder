declare const Bun: {
  argv: string[];
  version: string;
};

declare const process: {
  cwd(): string;
  exitCode?: number;
  env: Record<string, string | undefined>;
};

declare const crypto: {
  getRandomValues<T extends Uint8Array>(array: T): T;
};

interface ImportMeta {
  dir: string;
}

declare module "node:child_process" {
  export function exec(command: string, options: { cwd?: string; timeout?: number }, callback: (error: Error | null, stdout: string, stderr: string) => void): void;
}

declare module "node:fs/promises" {
  type FileStat = {
    readonly nlink: number;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  };
  type FileHandle = {
    stat(): Promise<FileStat>;
    readFile(encoding: "utf8"): Promise<string>;
    writeFile(content: string, encoding: "utf8"): Promise<void>;
    close(): Promise<void>;
  };
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function lstat(path: string): Promise<FileStat>;
  export function link(existingPath: string, newPath: string): Promise<void>;
  export function open(path: string, flags: number, mode?: number): Promise<FileHandle>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function readdir(path: string): Promise<string[]>;
  export function realpath(path: string): Promise<string>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
  export function rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
  export function stat(path: string): Promise<FileStat>;
  export function symlink(target: string, path: string): Promise<void>;
  export function unlink(path: string): Promise<void>;
  export function writeFile(path: string, content: string, encoding: "utf8"): Promise<void>;
}

declare module "node:fs" {
  export const constants: {
    readonly O_CREAT: number;
    readonly O_EXCL: number;
    readonly O_NOFOLLOW?: number;
    readonly O_RDONLY: number;
    readonly O_WRONLY: number;
  };
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
  type Matchers = {
    toBe(expected: unknown): void;
    toBeNull(): void;
    toContain(expected: unknown): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toEqual(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatch(expected: RegExp): void;
    readonly not: Matchers;
    readonly rejects: {
      toThrow(expected: string): Promise<void>;
    };
  };
  export const expect: (value: unknown) => Matchers;
}
