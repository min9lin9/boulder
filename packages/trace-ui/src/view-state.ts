import { getJson, revisionQuery, sameRevision, type BindingsResponse, type HeadRevision, type SessionResponse, type SessionsResponse, type SessionSummary } from "./api";

export type ViewRequest = { kind: "refresh" | "select" | "check"; session: SessionSummary | null; revision: HeadRevision | null };
export type ViewPayload = { catalog?: SessionsResponse; detail?: SessionResponse; bindings?: BindingsResponse };
export type ViewState = {
  request: ViewRequest;
  loading: boolean;
  error: string | null;
  selectedSnapshotId: string | null;
  pinned: HeadRevision | null;
  available: HeadRevision | null;
  stale: boolean;
  catalog: SessionsResponse | null;
  detail: SessionResponse | null;
  bindings: BindingsResponse | null;
};
export const initialView: ViewState = {
  request: { kind: "refresh", session: null, revision: null }, loading: true, error: null,
  selectedSnapshotId: null, pinned: null, available: null, stale: false, catalog: null, detail: null, bindings: null,
};
export type ViewAction =
  | { type: "request"; request: ViewRequest }
  | { type: "loaded"; request: ViewRequest; payload: ViewPayload }
  | { type: "failed"; request: ViewRequest; error: string };

export async function loadView(request: ViewRequest, signal: AbortSignal): Promise<ViewPayload> {
  if (request.kind === "check") return { catalog: await getJson<SessionsResponse>("/api/sessions", signal) };
  if (request.kind === "select") return {
    detail: await getJson<SessionResponse>(`/api/sessions/${encodeURIComponent(request.session!.snapshot_id)}?${revisionQuery(request.revision)}`, signal),
  };
  // Capture the catalog FIRST, then pin every dependent read to both stores.
  const catalog = await getJson<SessionsResponse>("/api/sessions", signal);
  const pin = revisionQuery(catalog.head_revision);
  const selected = catalog.sessions.find((session) => session.session_id === request.session?.session_id
    && session.source_instance_id === request.session.source_instance_id && session.agent_id === request.session.agent_id);
  const [bindings, detail] = await Promise.all([
    getJson<BindingsResponse>(`/api/bindings?${pin}&bindings_revision=${encodeURIComponent(catalog.bindings_revision)}`, signal),
    selected ? getJson<SessionResponse>(`/api/sessions/${encodeURIComponent(selected.snapshot_id)}?${pin}`, signal) : undefined,
  ]);
  return { catalog, bindings, detail };
}

// A complete refresh is published atomically. Navigation/check responses cannot
// replace any part of the pinned view, including its independent binding store.
export function viewReducer(state: ViewState, action: ViewAction): ViewState {
  if (action.type === "request") return {
    ...state, request: action.request, loading: true, error: null,
    selectedSnapshotId: action.request.kind === "select" ? action.request.session!.snapshot_id : state.selectedSnapshotId,
  };
  if (action.request !== state.request) return state;
  if (action.type === "failed") return { ...state, loading: false, error: action.error };
  const { catalog, detail, bindings } = action.payload;
  const revisions = [catalog?.head_revision, detail?.head_revision, bindings?.head_revision]
    .filter((revision): revision is HeadRevision | null => revision !== undefined);
  const expected = action.request.kind === "refresh" ? catalog!.head_revision : state.pinned;
  if (revisions.some((revision) => !sameRevision(revision, expected))
    || (catalog && (action.request.kind === "check" ? state.bindings : bindings)?.bindings_revision !== catalog.bindings_revision)) {
    // Only a head revision that actually differs is "available"; a bindings-
    // only change is carried by `stale` alone and must not offer the still-
    // pinned revision as a newer one.
    const available = revisions.find((revision) => !sameRevision(revision, state.pinned)) ?? null;
    return { ...state, loading: false, available, stale: true };
  }
  if (action.request.kind === "refresh") return {
    ...state, loading: false, error: null, pinned: expected, available: null, stale: false,
    selectedSnapshotId: detail?.snapshot_id ?? null,
    catalog: catalog!, detail: detail ?? null, bindings: bindings!,
  };
  return { ...state, loading: false, ...(detail ? { detail } : {}) };
}
