import type { ExecutorMode, ExecutorProfiles } from "./types";
import { yamlNestedGroupScalar } from "./manifest-yaml";

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
      preferred: yamlNestedGroupScalar(text, "executors", "planning", "preferred") ?? defaults.planning.preferred,
      mode: executorMode(yamlNestedGroupScalar(text, "executors", "planning", "mode")) ?? defaults.planning.mode
    },
    execution: {
      preferred: yamlNestedGroupScalar(text, "executors", "execution", "preferred") ?? defaults.execution.preferred,
      mode: executorMode(yamlNestedGroupScalar(text, "executors", "execution", "mode")) ?? defaults.execution.mode
    },
    fallback: {
      planning: yamlNestedGroupScalar(text, "executors", "fallback", "planning") ?? defaults.fallback.planning,
      execution: yamlNestedGroupScalar(text, "executors", "fallback", "execution") ?? defaults.fallback.execution
    }
  };
}

function executorMode(value: string | null): ExecutorMode | null {
  if (value === "detect-and-suggest") return value;
  if (value === "local-only") return value;
  if (value === "packet-only") return value;
  if (value === "approval-gated-send") return value;
  return null;
}
