import { useEffect, useReducer } from "react";
import { RevisionHeader } from "./components/RevisionHeader";
import { SessionDetail } from "./components/SessionDetail";
import { SessionList } from "./components/SessionList";
import { StaleRevisionNotice } from "./components/StaleRevisionNotice";
import { initialView, loadView, viewReducer } from "./view-state";

export function App() {
  const [state, dispatch] = useReducer(viewReducer, initialView);
  const { request } = state;
  useEffect(() => {
    const controller = new AbortController();
    loadView(request, controller.signal).then(
      (payload) => dispatch({ type: "loaded", request, payload }),
      (error: unknown) => {
        if (!controller.signal.aborted) dispatch({ type: "failed", request, error: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => controller.abort();
  }, [request]);

  const selected = state.catalog?.sessions.find((session) => session.snapshot_id === state.selectedSnapshotId) ?? null;
  const refresh = () => dispatch({ type: "request", request: { kind: "refresh", session: selected, revision: state.pinned } });
  const detail = state.detail?.snapshot_id === state.selectedSnapshotId ? state.detail : null;
  return <main>
    <header className="page-header">
      <div><h1>Boulder Trace</h1><p>Read-only snapshots. No live polling or automatic revision changes.</p></div>
      <nav aria-label="Revision controls">
        <button type="button" onClick={() => dispatch({ type: "request", request: { kind: "check", session: selected, revision: state.pinned } })} disabled={state.loading || !state.catalog}>Check for newer revision</button>
        <button type="button" onClick={refresh} disabled={state.loading}>Refresh</button>
      </nav>
    </header>
    {state.catalog && <RevisionHeader revision={state.pinned} snapshotId={detail?.snapshot_id} />}
    <StaleRevisionNotice stale={state.stale} onRefresh={refresh} disabled={state.loading} />
    {state.loading && <p role="status" data-state="loading">Loading trace data...</p>}
    {state.error && <div className="error-notice" role="alert" data-state="fetch-error"><strong>Unable to load trace data.</strong><p>{state.error}</p><p>Any previously loaded data remains pinned. Use Refresh to retry.</p></div>}
    <div className="workspace" aria-busy={state.loading}>
      {state.catalog && <SessionList sessions={state.catalog.sessions} selectedId={state.selectedSnapshotId} disabled={state.loading}
        onSelect={(session) => dispatch({ type: "request", request: { kind: "select", session, revision: state.pinned } })} />}
      {detail ? <SessionDetail session={detail} bindings={state.bindings?.bindings ?? []} /> : state.catalog &&
        <section className="panel"><h2>Session detail</h2><p data-state={state.selectedSnapshotId ? "detail-unavailable" : "no-selection"}>
          {state.selectedSnapshotId ? "Session detail is not loaded at the pinned revision. Refresh explicitly to load the latest revision." : "Select a session to inspect its snapshot."}
        </p></section>}
    </div>
  </main>;
}
