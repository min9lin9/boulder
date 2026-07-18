type GlobState = readonly [number, "base" | "directory"];

export function globMatches(pattern: string, path: string): boolean {
  const normalizedPattern = normalizePathGlob(pattern);
  const normalizedPath = normalizeConcretePath(path);
  if (normalizedPattern === null || normalizedPath === null) return false;
  let expression = "^";
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    if (character === "*") {
      if (normalizedPattern[index + 1] === "*") {
        if (normalizedPattern[index + 2] === "/") {
          expression += "(?:[^/]+/)*";
          index += 2;
        } else {
          expression += ".*";
          index += 1;
        }
      } else {
        expression += "[^/]*";
      }
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${expression}$`).test(normalizedPath);
}

/** Returns whether two path globs have at least one shared concrete path. */
export function globPatternsIntersect(first: string, second: string): boolean {
  const normalizedFirst = normalizePathGlob(first);
  const normalizedSecond = normalizePathGlob(second);
  if (normalizedFirst === null || normalizedSecond === null) return true;

  const alphabet = new Set(["/", "a"]);
  for (const character of `${normalizedFirst}${normalizedSecond}`) {
    if (character !== "*" && character !== "?") alphabet.add(character);
  }
  const firstStart = epsilonClosure(normalizedFirst, [[0, "base"]]);
  const secondStart = epsilonClosure(normalizedSecond, [[0, "base"]]);
  const queue: [readonly GlobState[], readonly GlobState[]][] = [[firstStart, secondStart]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const [firstStates, secondStates] = queue.shift()!;
    const key = `${stateKey(firstStates)}|${stateKey(secondStates)}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (accepts(normalizedFirst, firstStates) && accepts(normalizedSecond, secondStates)) return true;
    for (const character of alphabet) {
      const nextFirst = step(normalizedFirst, firstStates, character);
      const nextSecond = step(normalizedSecond, secondStates, character);
      if (nextFirst.length > 0 && nextSecond.length > 0) queue.push([nextFirst, nextSecond]);
    }
  }
  return false;
}

export function protectedPathsReferencedByTask(task: string, protectedPaths: readonly string[]): readonly string[] {
  const taskPaths = concreteTaskPaths(task, protectedPaths);
  return protectedPaths.filter((pattern) => {
    const normalizedPattern = normalizePathGlob(pattern);
    return normalizedPattern !== null && taskPaths.some(({ path, directory }) =>
      globMatches(normalizedPattern.toLowerCase(), path.toLowerCase())
      || (directory && globPatternsIntersect(normalizedPattern.toLowerCase(), `${path.toLowerCase()}/**`)));
  });
}

function concreteTaskPaths(task: string, protectedPaths: readonly string[]): readonly { readonly path: string; readonly directory: boolean }[] {
  const paths = new Map<string, boolean>();
  for (const token of task.split(/\s+/)) {
    const stripped = stripTaskPunctuation(token);
    const path = normalizeConcretePath(stripped);
    if (path !== null && isPathReference(token, path, protectedPaths)) paths.set(path, paths.get(path) === true || /[\\/]$/.test(stripped));
  }
  return [...paths].map(([path, directory]) => ({ path, directory }));
}

function stripTaskPunctuation(token: string): string {
  const trimmed = token.replace(/[.,;!?]+$/g, "");
  const unwrapped = trimmed.replace(/^[([{`"']+|[\])},;!?`"']+$/g, "");
  return unwrapped.replace(/:(?:\d+)(?::\d+)?$/g, "");
}

function isPathReference(token: string, path: string, protectedPaths: readonly string[]): boolean {
  return token.includes("/") || token.includes("\\") || token.startsWith(".") || /\.[A-Za-z0-9_@+-]+(?::\d+(?::\d+)?)?[.,;!?)]*$/.test(token) || path.includes("/")
    || protectedPaths.some((pattern) => {
      const normalized = normalizePathGlob(pattern);
      return normalized !== null && globMatches(normalized.toLowerCase(), path.toLowerCase());
    });
}

function normalizeConcretePath(token: string): string | null {
  return normalizePath(token, false);
}

function normalizePathGlob(pattern: string): string | null {
  return normalizePath(pattern, true);
}

function normalizePath(value: string, allowGlob: boolean): string | null {
  const separatorNormalized = value.replaceAll("\\", "/").replace(/\/{2,}/g, "/");
  if (separatorNormalized.length === 0 || separatorNormalized.startsWith("/")) return null;
  const segments: string[] = [];
  for (const segment of separatorNormalized.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    const expression = allowGlob ? /^[A-Za-z0-9._@+*?\-]+$/ : /^[A-Za-z0-9._@+-]+$/;
    if (!expression.test(segment)) return null;
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join("/") : null;
}

function epsilonClosure(pattern: string, states: readonly GlobState[]): readonly GlobState[] {
  const result = new Map<string, GlobState>();
  const pending = [...states];
  while (pending.length > 0) {
    const state = pending.pop()!;
    const key = `${state[0]}:${state[1]}`;
    if (result.has(key)) continue;
    result.set(key, state);
    if (state[1] === "base" && pattern[state[0]] === "*") {
      if (pattern[state[0] + 1] === "*" && pattern[state[0] + 2] === "/") pending.push([state[0] + 3, "base"]);
      else if (pattern[state[0] + 1] === "*") pending.push([state[0] + 2, "base"]);
      else pending.push([state[0] + 1, "base"]);
    }
  }
  return [...result.values()];
}

function step(pattern: string, states: readonly GlobState[], character: string): readonly GlobState[] {
  const next: GlobState[] = [];
  for (const state of states) {
    const [index, mode] = state;
    if (mode === "directory") {
      if (character === "/") next.push([index, "base"], [index + 3, "base"]);
      else next.push(state);
      continue;
    }
    const token = pattern[index];
    if (token === undefined) continue;
    if (token === "*") {
      if (pattern[index + 1] === "*" && pattern[index + 2] === "/") {
        if (character !== "/") next.push([index, "directory"]);
      } else if (pattern[index + 1] === "*") next.push(state);
      else if (character !== "/") next.push(state);
    } else if (token === "?") {
      if (character !== "/") next.push([index + 1, "base"]);
    } else if (token === character) next.push([index + 1, "base"]);
  }
  return epsilonClosure(pattern, next);
}

function accepts(pattern: string, states: readonly GlobState[]): boolean {
  return states.some(([index, mode]) => mode === "base" && index === pattern.length);
}

function stateKey(states: readonly GlobState[]): string {
  return states.map(([index, mode]) => `${index}:${mode}`).sort().join(",");
}
