export function firstProtectedHandoffPath(paths: readonly string[]): string | null {
  return paths.find((item) => isProtectedPath(item)) ?? null;
}

export function includedContextFiles(paths: readonly string[]): readonly string[] {
  return paths
    .map(normalizeHandoffPath)
    .filter(uniqueNonEmpty);
}

export function hasRawWorkspaceReference(value: string): boolean {
  const normalized = value.replace(/\\/g, "/").toLowerCase();
  return /(?:^|[\s([{:;"'`])@[a-z0-9_.-]+(?:\/[a-z0-9_.\/-]*)?/.test(normalized)
    || /(?:^|[\s([{:;"'`])(?:\.\/|\.\.\/)*(?:\.env(?:$|[\s,.:;)\]}"'`])|(?:secrets|vendor|node_modules|dist)(?:\/|$|[\s,.:;)\]}"'`]))/.test(normalized)
    || /(?:^|[\s([{:;"'`])(?:\.\.\/[a-z0-9_.\/-]+|\/[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)+|[a-z]:\/|\/\/[^/\s]+\/[^/\s]+)/.test(normalized)
    || normalized.includes("/users/")
    || normalized.includes("/private/")
    || normalized.includes("raw workspace file")
    || normalized.includes("raw workspace content");
}

function isProtectedPath(path: string): boolean {
  const normalized = normalizeHandoffPath(path);
  return isAbsolutePathLike(path)
    || hasEscapingTraversal(path)
    || normalized === ".env"
    || normalized.startsWith(".env.")
    || normalized === "secrets"
    || normalized.startsWith("secrets/")
    || normalized === "vendor"
    || normalized.startsWith("vendor/")
    || normalized === "node_modules"
    || normalized.startsWith("node_modules/")
    || normalized === "dist"
    || normalized.startsWith("dist/");
}

function normalizeHandoffPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part.length === 0 || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function hasEscapingTraversal(path: string): boolean {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part.length === 0 || part === ".") continue;
    if (part !== "..") {
      parts.push(part);
      continue;
    }
    if (parts.length === 0) return true;
    parts.pop();
  }
  return false;
}

function uniqueNonEmpty(value: string, index: number, values: readonly string[]): boolean {
  return value.length > 0 && values.indexOf(value) === index;
}

function isAbsolutePathLike(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith("/")
    || /^[A-Za-z]:\//.test(normalized)
    || normalized.startsWith("//");
}
