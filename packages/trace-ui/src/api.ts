// Use the canonical projection, not a second, independently invented span DTO.
import type { TraceBinding } from "../../../src/trace/bindings";
import type { SessionProjection } from "../../../src/trace/projection";
import type { HeadRevision } from "../../../src/trace/server";
export type { ViewEntry } from "../../../src/trace/contracts";
export type { ViewNode, UnresolvedEntry } from "../../../src/trace/projection";
export type { HeadRevision } from "../../../src/trace/server";
export type Binding = TraceBinding;
export type UsageEntry = SessionProjection["usage"]["entries"][number];
export type SessionSummary = Pick<SessionProjection,
  "session_id" | "snapshot_id" | "snapshot_digest" | "source_instance_id" | "agent_id" | "coverage" | "disposition_counts"
> & { readonly id: string };
export type SessionsResponse = { sessions: SessionSummary[]; head_revision: HeadRevision | null; bindings_revision: string };
export type SessionResponse = SessionProjection & { head_revision: HeadRevision | null };
export type BindingsResponse = { bindings: Binding[]; head_revision: HeadRevision | null; bindings_revision: string };

export function sameRevision(left: HeadRevision | null, right: HeadRevision | null) {
  return left === null || right === null ? left === right : left.sequence === right.sequence && left.digest === right.digest;
}

export function revisionQuery(revision: HeadRevision | null) {
  return `head_revision=${encodeURIComponent(revision ? `${revision.sequence}:${revision.digest}` : "0:none")}`;
}

export async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 409
    ? "The pinned revision is unavailable. Refresh to load a consistent view."
    : `Fetch failed (${response.status}) for ${path}`);
  return response.json() as Promise<T>;
}
