declare module "node:child_process" {
  type K0rExecFileError = Error & { readonly code?: number | string | null };

  export function execFile(
    file: string,
    args: readonly string[],
    options: { readonly cwd?: string },
    callback: (error: K0rExecFileError | null, stdout: string, stderr: string) => void
  ): void;
}

declare module "node:crypto" {
  export function randomUUID(): string;
}

declare module "node:fs/promises" {
  type K0rDirent = {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  };
  export function copyFile(source: string, destination: string): Promise<void>;
  export function readdir(path: string, options: { readonly withFileTypes: true }): Promise<K0rDirent[]>;
  export function writeFile(path: string, content: string): Promise<void>;
}
