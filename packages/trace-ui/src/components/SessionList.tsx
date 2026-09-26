import type { SessionSummary } from "../api";

export function SessionList({ sessions, selectedId, onSelect, disabled = false }: {
  sessions: SessionSummary[]; selectedId: string | null; onSelect: (session: SessionSummary) => void; disabled?: boolean;
}) {
  return <section aria-labelledby="sessions-heading" className="panel">
    <h2 id="sessions-heading">Sessions <span className="count">{sessions.length}</span></h2>
    {sessions.length === 0 ? <p data-state="no-sessions">No sessions in this published revision.</p> :
      <ul className="session-list">{sessions.map((session) => <li key={session.snapshot_id}>
        <button type="button" aria-pressed={selectedId === session.snapshot_id} onClick={() => onSelect(session)} disabled={disabled}>
          {session.session_id}
        </button>
        <dl className="metadata">
          <dt>Snapshot</dt><dd><code>{session.snapshot_id}</code></dd>
          <dt>Source / agent</dt><dd>{session.source_instance_id} / {session.agent_id}</dd>
          <dt>Coverage</dt><dd>{session.coverage.kind} ({session.coverage.input_count} inputs)</dd>
          <dt>Normalized / ignored / quarantined</dt><dd>{session.disposition_counts.normalized} / {session.disposition_counts.ignored} / {session.disposition_counts.quarantined}</dd>
        </dl>
      </li>)}</ul>}
  </section>;
}
