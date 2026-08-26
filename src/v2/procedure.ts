import { isV2Digest, isV2Id, type V2Digest, type V2Id, type V2JsonValue } from "./contracts.js";
import { digestV2 } from "./canonical.js";

export const V2_PROCEDURE_SCHEMA_VERSION = "boulder.v2.procedure.v1" as const;
const MAX_V2_PROCEDURE_ISSUES = 100;

export type V2ProcedureNodeKind = "agent-task" | "human-task" | "deterministic-task" | "bounded-loop";

export interface V2ProcedureNode {
  readonly id: V2Id;
  readonly kind: V2ProcedureNodeKind;
  readonly maxIterations?: number;
}

export interface V2ProcedureAuthorityRequirement {
  readonly action: "complete-loop";
  readonly policyDigest: V2Digest;
}

export interface V2ProcedureEdge {
  readonly id: V2Id;
  readonly from: V2Id;
  readonly to: V2Id;
  readonly authority?: V2ProcedureAuthorityRequirement;
}

export interface V2ProcedureDefinition {
  readonly schemaVersion: typeof V2_PROCEDURE_SCHEMA_VERSION;
  readonly procedureId: V2Id;
  readonly revision: number;
  readonly entryNodeId: V2Id;
  readonly nodes: readonly V2ProcedureNode[];
  readonly edges: readonly V2ProcedureEdge[];
}

export interface V2ResolvedProcedure extends V2ProcedureDefinition {
  readonly procedureDigest: V2Digest;
}

export interface V2ProcedureIssue {
  readonly id: string;
  readonly path: string;
  readonly message: string;
}

export type V2ProcedureCompilationResult =
  | { readonly ok: true; readonly value: V2ResolvedProcedure }
  | { readonly ok: false; readonly issues: readonly V2ProcedureIssue[] };

export async function compileV2Procedure(value: unknown): Promise<V2ProcedureCompilationResult> {
  const issues: V2ProcedureIssue[] = [];
  if (!isRecord(value)) return failure("v2.procedure.type_invalid", "$", "Procedure must be an object.");
  rejectRuntimeLiterals(value, "$", issues);
  rejectUnknownFields(value, ["schemaVersion", "procedureId", "revision", "entryNodeId", "nodes", "edges"], "$", issues);
  if (value.schemaVersion !== V2_PROCEDURE_SCHEMA_VERSION) addIssue(issues, "v2.procedure.schema_invalid", "$.schemaVersion", "Schema version is invalid.");
  if (!isV2Id(value.procedureId)) addIssue(issues, "v2.procedure.id_invalid", "$.procedureId", "Procedure ID is invalid.");
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 1) addIssue(issues, "v2.procedure.revision_invalid", "$.revision", "Revision must be positive.");
  if (!isV2Id(value.entryNodeId)) addIssue(issues, "v2.procedure.id_invalid", "$.entryNodeId", "Entry node ID is invalid.");

  const nodes = parseNodes(value.nodes, issues);
  const edges = parseEdges(value.edges, issues);
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (isV2Id(value.entryNodeId) && !nodeIds.has(value.entryNodeId)) addIssue(issues, "v2.procedure.reference_unknown", "$.entryNodeId", "Entry node does not exist.");
  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index];
    if (!nodeIds.has(edge.from)) addIssue(issues, "v2.procedure.reference_unknown", `$.edges[${index}].from`, "Source node does not exist.");
    if (!nodeIds.has(edge.to)) addIssue(issues, "v2.procedure.reference_unknown", `$.edges[${index}].to`, "Target node does not exist.");
  }
  detectImplicitCycle(nodes, edges, issues);
  if (issues.length > 0) return { ok: false, issues: sortedIssues(issues) };

  const definition: V2ProcedureDefinition = {
    schemaVersion: V2_PROCEDURE_SCHEMA_VERSION,
    procedureId: value.procedureId as V2Id,
    revision: value.revision as number,
    entryNodeId: value.entryNodeId as V2Id,
    nodes: [...nodes].sort(compareId),
    edges: [...edges].sort(compareId)
  };
  const procedureDigest = await digestV2("boulder.v2.procedure.v1", definition as unknown as V2JsonValue);
  return { ok: true, value: { ...definition, procedureDigest } };
}

function parseNodes(value: unknown, issues: V2ProcedureIssue[]): V2ProcedureNode[] {
  if (!Array.isArray(value)) {
    addIssue(issues, "v2.procedure.nodes_invalid", "$.nodes", "Nodes must be an array.");
    return [];
  }
  const nodes: V2ProcedureNode[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const path = `$.nodes[${index}]`;
    const item = value[index];
    if (!isRecord(item)) {
      addIssue(issues, "v2.procedure.node_invalid", path, "Node must be an object.");
      continue;
    }
    rejectUnknownFields(item, ["id", "kind", "maxIterations"], path, issues);
    if (!isV2Id(item.id)) addIssue(issues, "v2.procedure.id_invalid", `${path}.id`, "Node ID is invalid.");
    if (!isNodeKind(item.kind)) addIssue(issues, "v2.procedure.node_kind_invalid", `${path}.kind`, "Node kind is invalid.");
    if (typeof item.id === "string" && seen.has(item.id)) addIssue(issues, "v2.procedure.node_duplicate", `${path}.id`, "Node ID is duplicated.");
    if (typeof item.id === "string") seen.add(item.id);
    if (item.kind === "bounded-loop" && (!Number.isSafeInteger(item.maxIterations) || Number(item.maxIterations) < 1)) {
      addIssue(issues, "v2.procedure.loop_bound_invalid", `${path}.maxIterations`, "Bounded loops require a positive bound.");
    }
    if (item.kind !== "bounded-loop" && item.maxIterations !== undefined) {
      addIssue(issues, "v2.procedure.loop_bound_unexpected", `${path}.maxIterations`, "Only bounded-loop nodes may declare a bound.");
    }
    if (isV2Id(item.id) && isNodeKind(item.kind)) {
      nodes.push(item.kind === "bounded-loop"
        ? { id: item.id, kind: item.kind, maxIterations: Number(item.maxIterations) }
        : { id: item.id, kind: item.kind });
    }
  }
  return nodes;
}

function parseEdges(value: unknown, issues: V2ProcedureIssue[]): V2ProcedureEdge[] {
  if (!Array.isArray(value)) {
    addIssue(issues, "v2.procedure.edges_invalid", "$.edges", "Edges must be an array.");
    return [];
  }
  const edges: V2ProcedureEdge[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const path = `$.edges[${index}]`;
    const item = value[index];
    if (!isRecord(item)) {
      addIssue(issues, "v2.procedure.edge_invalid", path, "Edge must be an object.");
      continue;
    }
    rejectUnknownFields(item, ["id", "from", "to", "authority"], path, issues);
    if (!isV2Id(item.id) || !isV2Id(item.from) || !isV2Id(item.to)) addIssue(issues, "v2.procedure.id_invalid", path, "Edge IDs and references must be valid.");
    if (typeof item.id === "string" && seen.has(item.id)) addIssue(issues, "v2.procedure.edge_duplicate", `${path}.id`, "Edge ID is duplicated.");
    if (typeof item.id === "string") seen.add(item.id);
    const authority = parseAuthority(item.authority, `${path}.authority`, issues);
    if (isV2Id(item.id) && isV2Id(item.from) && isV2Id(item.to)) {
      edges.push(authority ? { id: item.id, from: item.from, to: item.to, authority } : { id: item.id, from: item.from, to: item.to });
    }
  }
  return edges;
}

function parseAuthority(value: unknown, path: string, issues: V2ProcedureIssue[]): V2ProcedureAuthorityRequirement | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    addIssue(issues, "v2.procedure.authority_invalid", path, "Authority must be an object.");
    return undefined;
  }
  rejectUnknownFields(value, ["action", "policyDigest"], path, issues);
  if (value.action !== "complete-loop" || !isV2Digest(value.policyDigest)) {
    addIssue(issues, "v2.procedure.authority_invalid", path, "Authority must bind complete-loop to a policy digest.");
    return undefined;
  }
  return { action: value.action, policyDigest: value.policyDigest };
}

function detectImplicitCycle(nodes: readonly V2ProcedureNode[], edges: readonly V2ProcedureEdge[], issues: V2ProcedureIssue[]): void {
  const unboundedIds = new Set(nodes.filter((node) => node.kind !== "bounded-loop").map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (unboundedIds.has(edge.from) && unboundedIds.has(edge.to)) {
      outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      addIssue(issues, "v2.procedure.cycle_implicit", "$.edges", "Cycles must pass through a bounded-loop node.");
      return;
    }
    visiting.add(id);
    for (const target of outgoing.get(id) ?? []) visit(target);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of unboundedIds) visit(id);
}

function rejectRuntimeLiterals(value: Readonly<Record<string, unknown>>, path: string, issues: V2ProcedureIssue[]): void {
  for (const key of Object.keys(value)) {
    if (key === "host" || key === "provider" || key === "runtime") {
      addIssue(issues, "v2.procedure.runtime_literal_forbidden", `${path}.${key}`, "Procedure contracts cannot bind a runtime host or provider.");
    }
    const child = value[key];
    if (isRecord(child)) rejectRuntimeLiterals(child, `${path}.${key}`, issues);
    if (Array.isArray(child)) {
      for (let index = 0; index < child.length; index += 1) {
        if (isRecord(child[index])) rejectRuntimeLiterals(child[index], `${path}.${key}[${index}]`, issues);
      }
    }
  }
}

function rejectUnknownFields(value: Readonly<Record<string, unknown>>, allowed: readonly string[], path: string, issues: V2ProcedureIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key) && key !== "host" && key !== "provider" && key !== "runtime") {
      addIssue(issues, "v2.procedure.field_unknown", `${path}.${key}`, "Unknown field.");
    }
  }
}

function addIssue(issues: V2ProcedureIssue[], id: string, path: string, message: string): void {
  if (issues.length < MAX_V2_PROCEDURE_ISSUES) issues.push({ id, path, message });
}

function failure(id: string, path: string, message: string): V2ProcedureCompilationResult {
  return { ok: false, issues: [{ id, path, message }] };
}

function sortedIssues(issues: readonly V2ProcedureIssue[]): V2ProcedureIssue[] {
  return [...issues].sort((left, right) => left.path.localeCompare(right.path) || left.id.localeCompare(right.id));
}

function compareId(left: { readonly id: string }, right: { readonly id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function isNodeKind(value: unknown): value is V2ProcedureNodeKind {
  return value === "agent-task" || value === "human-task" || value === "deterministic-task" || value === "bounded-loop";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
