import { resolve } from "node:path";
import type { RunEventRecord } from "./run-event-shape";

export const DEFAULT_PROTECTED_PATTERNS = [".env*", "secrets/**", "vendor/**", "node_modules/**", "dist/**"] as const;

export function sanitizeEvent(root: string, protectedPatterns: readonly string[], event: RunEventRecord): RunEventRecord {
  return {
    ...event,
    command: sanitizeString(root, protectedPatterns, event.command),
    packageVersion: sanitizeString(root, protectedPatterns, event.packageVersion),
    checkIds: event.checkIds.map((item) => sanitizeString(root, protectedPatterns, item)),
    recoveryHintIds: event.recoveryHintIds.map((item) => sanitizeString(root, protectedPatterns, item)),
    artifactPaths: event.artifactPaths.map((item) => sanitizeString(root, protectedPatterns, item))
  };
}

function sanitizeString(root: string, protectedPatterns: readonly string[], value: string): string {
  if (value.includes("\n") || value.includes("\r")) return "[REDACTED_FILE_BODY]";
  let redacted = value
    .replace(/\bsk-proj-[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/\bghp_[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/\bnpm_[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/Bearer\s+\S+/g, "Bearer [REDACTED_SECRET]");
  for (const pattern of protectedPatterns) {
    redacted = redactProtectedPath(root, pattern, redacted);
  }
  return redacted.split(resolve(root)).join("[CWD]");
}

function redactProtectedPath(root: string, pattern: string, value: string): string {
  const clean = pattern.trim();
  if (!clean) return value;
  const globstar = clean.endsWith("/**");
  const wildcard = !globstar && clean.endsWith("*");
  const prefix = globstar ? clean.slice(0, -3) : wildcard ? clean.slice(0, -1) : clean;
  const absolute = resolve(root, prefix);
  const escaped = escapeRegExp(absolute);
  const relative = relativeProtectedPathPattern(prefix, wildcard, globstar);
  const absoluteMatch = globstar
    ? new RegExp(`${escaped}/[^\\s"']*`, "g")
    : wildcard
      ? new RegExp(`${escaped}[^\\s"']*`, "g")
      : new RegExp(escaped, "g");
  const relativeMatch = new RegExp(`(^|[\\s"'=:])(${relative})`, "g");
  return value
    .replace(absoluteMatch, "[REDACTED_PROTECTED_PATH]")
    .replace(relativeMatch, "$1[REDACTED_PROTECTED_PATH]");
}

function relativeProtectedPathPattern(prefix: string, wildcard: boolean, globstar: boolean): string {
  const escaped = escapeRegExp(prefix);
  const segment = prefix.includes("/") ? escaped : `(?:[^\\s"']*/)*${escaped}`;
  if (globstar) return `${segment}/[^\\s"']*`;
  return wildcard ? `${segment}[^\\s"']*` : segment;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
