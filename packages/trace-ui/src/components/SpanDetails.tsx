import type { ViewEntry } from "../api";

export function SpanDetails({ entry }: { entry: ViewEntry }) {
  return <div className="span-details">
    <dl className="metadata">
      <dt>Entry</dt><dd><code>{entry.span_id}</code></dd>
      <dt>Trace (synthetic session)</dt><dd><code>{entry.trace_id}</code></dd>
      <dt>Status / completion basis</dt><dd>{entry.status} / {entry.completion_basis}</dd>
      <dt>Duration</dt><dd>{entry.timing_basis === "unavailable" || entry.duration_ms === undefined ? "unavailable" : `${entry.duration_ms} ms`} (basis: {entry.timing_basis})</dd>
      {entry.start_time !== undefined && <><dt>Start</dt><dd>{entry.start_time}</dd></>}
      {entry.end_time !== undefined && <><dt>End</dt><dd>{entry.end_time}</dd></>}
      <dt>Display parent</dt><dd>{entry.display_parent_id ?? "root"}</dd>
      <dt>Execution parent (provenance only)</dt><dd data-provenance="execution-parent">{entry.execution_parent_span_id ?? "unavailable"}</dd>
      <dt>Source order</dt><dd>{entry.source_order}</dd>
      <dt>Source events</dt><dd><ul>{entry.source_event_refs.map((ref) => <li key={JSON.stringify(ref)}>
        <code>{ref.source_row_key}</code> / <code>{ref.source_revision}</code>
        {ref.logical_event_id !== undefined && <> / <code>{ref.logical_event_id}</code></>}
      </li>)}</ul></dd>
      <dt>Links</dt><dd>{entry.links.length ? <ul>{entry.links.map((link) => <li key={JSON.stringify(link)}>{link.relationship}: {link.target_span_id}</li>)}</ul> : "unavailable"}</dd>
      <dt>Quality flags</dt><dd>{entry.quality_flags.join(", ") || "none"}</dd>
    </dl>
    <details><summary>Observed attributes (metadata only)</summary>
      <pre className="transcript-text">{JSON.stringify(entry.attributes, null, 2)}</pre>
    </details>
  </div>;
}
