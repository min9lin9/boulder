import type { ExecutorProfiles } from "./types";

export function defaultExecutors(): ExecutorProfiles {
  return {
    planning: {
      preferred: "gajae-code",
      mode: "detect-and-suggest"
    },
    execution: {
      preferred: "lazycodex",
      mode: "detect-and-suggest"
    },
    fallback: {
      planning: "codex",
      execution: "codex"
    }
  };
}

export function executorsFromText(text: string, defaults: ExecutorProfiles): ExecutorProfiles {
  return {
    planning: {
      preferred: nestedGroupScalar(text, "executors", "planning", "preferred") ?? defaults.planning.preferred,
      mode: executorMode(nestedGroupScalar(text, "executors", "planning", "mode")) ?? defaults.planning.mode
    },
    execution: {
      preferred: nestedGroupScalar(text, "executors", "execution", "preferred") ?? defaults.execution.preferred,
      mode: executorMode(nestedGroupScalar(text, "executors", "execution", "mode")) ?? defaults.execution.mode
    },
    fallback: {
      planning: nestedGroupScalar(text, "executors", "fallback", "planning") ?? defaults.fallback.planning,
      execution: nestedGroupScalar(text, "executors", "fallback", "execution") ?? defaults.fallback.execution
    }
  };
}

function nestedGroupScalar(text: string, section: string, group: string, key: string): string | null {
  const lines = sectionLines(text, section);
  const start = lines.findIndex((line) => line.trim() === `${group}:`);
  if (start === -1) return null;
  const groupLines: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s{2}\S/.test(line) && line.includes(":")) break;
    groupLines.push(line);
  }
  const match = groupLines.join("\n").match(new RegExp(`^\\s{4}${escapeRegExp(key)}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function executorMode(value: string | null): ExecutorProfiles["planning"]["mode"] | null {
  return value === "detect-and-suggest" ? value : null;
}

function sectionLines(text: string, section: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === `${section}:`);
  if (start === -1) return [];
  const result: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && line.includes(":")) break;
    result.push(line);
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
