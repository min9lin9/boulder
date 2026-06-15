export function yamlScalar(text: string, key: string): string | null {
  const match = text.match(new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

export function yamlNestedScalar(text: string, section: string, key: string): string | null {
  const lines = yamlSectionLines(text, section);
  const match = lines.join("\n").match(new RegExp(`^\\s{2}${escapeRegExp(key)}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

export function yamlNestedGroupScalar(text: string, section: string, group: string, key: string): string | null {
  const lines = yamlSectionLines(text, section);
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

export function yamlList(text: string, key: string): readonly string[] | null {
  const values = yamlSectionLines(text, key)
    .map((line) => line.match(/^\s{2}-\s+(.+)$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
  return values.length ? values : null;
}

export function yamlSectionLines(text: string, section: string): readonly string[] {
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

export function yamlBool(value: string | null | undefined): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
