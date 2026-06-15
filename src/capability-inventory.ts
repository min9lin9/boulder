import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import { readText } from "./fs";

export type InventoryItem = {
  readonly id: string;
  readonly status?: string;
  readonly version?: string;
  readonly officialDocsUrl?: string;
};

export type CapabilityInventory = {
  readonly skills: readonly InventoryItem[];
  readonly mcpServers: readonly InventoryItem[];
  readonly plugins: readonly InventoryItem[];
  readonly runtimes: readonly InventoryItem[];
};

export type CapabilityDiscoveryOptions = {
  readonly codexHome?: string;
};

const INVENTORY_PATH = "fixtures/capabilities/codex-installed.json";

export async function loadCapabilityInventory(root: string, options: CapabilityDiscoveryOptions = {}): Promise<CapabilityInventory | null> {
  const fixture = parseInventory(await readText(join(root, INVENTORY_PATH)));
  if (fixture) return fixture;
  return await discoverCapabilityInventory(root, options);
}

export function capabilityInventoryPath(): string {
  return INVENTORY_PATH;
}

export function hasValidInventoryItems(inventory: CapabilityInventory): boolean {
  return [
    ...inventory.skills,
    ...inventory.mcpServers,
    ...inventory.plugins,
    ...inventory.runtimes
  ].every((item) => isRecord(item) && typeof item["id"] === "string");
}

async function discoverCapabilityInventory(root: string, options: CapabilityDiscoveryOptions): Promise<CapabilityInventory | null> {
  const codexHomes = codexHomeCandidates(root, options);
  const discovered = await Promise.all(codexHomes.map(discoverCodexHome));
  const inventories = discovered.filter((item): item is CapabilityInventory => Boolean(item));
  if (!inventories.length) return null;
  return {
    skills: uniqueItems(inventories.flatMap((item) => item.skills)),
    mcpServers: uniqueItems(inventories.flatMap((item) => item.mcpServers)),
    plugins: uniqueItems(inventories.flatMap((item) => item.plugins)),
    runtimes: [{ id: "bun", version: Bun.version }]
  };
}

function codexHomeCandidates(root: string, options: CapabilityDiscoveryOptions): readonly string[] {
  if (options.codexHome) return [options.codexHome];
  return uniqueStrings([join(root, ".codex"), join(homedir(), ".codex")]);
}

async function discoverCodexHome(codexHome: string): Promise<CapabilityInventory | null> {
  const skills = [
    ...await discoverSkills(join(codexHome, "skills"), ""),
    ...await discoverSkills(join(codexHome, "plugins", "cache"), "plugin-cache")
  ];
  const mcpServers = await discoverMcpServers(codexHome);
  const plugins = await discoverPlugins(join(codexHome, "plugins", "cache"));
  if (!skills.length && !mcpServers.length && !plugins.length) return null;
  return {
    skills: uniqueItems(skills),
    mcpServers,
    plugins,
    runtimes: [{ id: "bun", version: Bun.version }]
  };
}

async function discoverSkills(root: string, source: "plugin-cache" | ""): Promise<readonly InventoryItem[]> {
  const paths = await findSkillFiles(root);
  return paths.map((path) => ({
    id: skillIdFromPath(root, path, source),
    status: "installed"
  }));
}

async function findSkillFiles(root: string): Promise<readonly string[]> {
  const entries = await safeReaddir(root);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry);
    if (entry === "SKILL.md") files.push(path);
    files.push(...await findSkillFiles(path));
  }
  return files;
}

function skillIdFromPath(root: string, path: string, source: "plugin-cache" | ""): string {
  const parts = relative(root, path).split(sep);
  if (source === "plugin-cache") {
    const skillsIndex = parts.indexOf("skills");
    const plugin = skillsIndex >= 2 ? parts[skillsIndex - 2] : null;
    const skill = skillsIndex >= 0 ? parts[skillsIndex + 1] : null;
    return plugin && skill ? `${plugin}:${skill}` : parts.at(-2) ?? "unknown-skill";
  }
  return parts.at(-2) ?? "unknown-skill";
}

async function discoverMcpServers(codexHome: string): Promise<readonly InventoryItem[]> {
  const config = parseJsonObject(await safeRead(join(codexHome, "mcp.json")));
  const servers = isRecord(config) && isRecord(config["mcpServers"]) ? config["mcpServers"] : null;
  if (!servers) return [];
  return Object.keys(servers).map((id) => ({ id, status: "available", officialDocsUrl: officialDocsUrlFor(id) }));
}

async function discoverPlugins(root: string): Promise<readonly InventoryItem[]> {
  const entries = await safeReaddir(root);
  return entries.map((entry) => ({ id: entry, status: "installed" }));
}

function officialDocsUrlFor(id: string): string | undefined {
  if (id.includes("lennys")) return "https://github.com/min9lin9/lennys-podcast-mcp#readme";
  if (id.includes("code-review-graph")) return "https://github.com/min9lin9/code-review-graph#readme";
  return undefined;
}

function parseInventory(content: string | null): CapabilityInventory | null {
  const parsed = parseJsonObject(content);
  if (!isInventory(parsed)) return null;
  return parsed;
}

function isInventory(value: unknown): value is CapabilityInventory {
  if (!isRecord(value)) return false;
  return ["skills", "mcpServers", "plugins", "runtimes"].every((key) => Array.isArray(value[key]));
}

async function safeReaddir(path: string): Promise<readonly string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

async function safeRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function parseJsonObject(content: string | null): unknown {
  if (!content) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed;
  } catch {
    return null;
  }
}

function uniqueItems(items: readonly InventoryItem[]): readonly InventoryItem[] {
  const seen = new Set<string>();
  const result: InventoryItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
