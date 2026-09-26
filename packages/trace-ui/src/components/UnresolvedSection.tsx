import type { UnresolvedEntry } from "../api";
import { SpanDetails } from "./SpanDetails";

export function UnresolvedSection({ entries }: { entries: readonly UnresolvedEntry[] }) {
  return <section className="panel unresolved" aria-labelledby="unresolved-heading" data-section="unresolved">
    <h3 id="unresolved-heading">Unresolved <span className="count">{entries.length}</span></h3>
    <p className="hint">Unmatched and quarantined observations stay separate, never assigned to a guessed parent.</p>
    {entries.length === 0 ? <p data-state="unresolved-empty">No unresolved entries in this snapshot.</p> :
      <ul className="unresolved-list">{entries.map((item) => <li key={JSON.stringify(item.source_event_refs)} data-unresolved-order={item.source_order}>
        <strong>{item.entry?.name ?? "Quarantined observation"}</strong>
        <p>Reason: <code data-unresolved-reason={item.reason}>{item.reason}</code></p>
        <dl className="metadata">
          <dt>Source order</dt><dd>{item.source_order}</dd>
          <dt>Source events</dt><dd><code>{JSON.stringify(item.source_event_refs)}</code></dd>
          <dt>Quality flags</dt><dd>{item.quality_flags.join(", ") || "none"}</dd>
        </dl>
        {item.entry && <details><summary>Unresolved entry details</summary><SpanDetails entry={item.entry} /></details>}
      </li>)}</ul>}
  </section>;
}
