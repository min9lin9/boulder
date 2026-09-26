export function StaleRevisionNotice({ stale, onRefresh, disabled = false }: {
  stale: boolean; onRefresh: () => void; disabled?: boolean;
}) {
  if (!stale) return null;
  return <aside className="stale-notice" role="status" data-state="stale-revision">
    <strong>Updated trace or bindings available - refresh</strong>
    <p>The current view has not changed. Refresh explicitly to load a consistent revision.</p>
    <button type="button" onClick={onRefresh} disabled={disabled}>Refresh to latest revision</button>
  </aside>;
}
