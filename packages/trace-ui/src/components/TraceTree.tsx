import type { ViewNode } from "../api";
import { SpanDetails } from "./SpanDetails";

export function TraceTree({ entries }: { entries: readonly ViewNode[] }) {
  // Render the server's hierarchy verbatim; neither execution provenance nor
  // detached/unresolved entries may invent display membership or ordering.
  function renderChildren(nodes: readonly ViewNode[]) {
    if (!nodes.length) return null;
    return <ul className="trace-tree">{nodes.map((entry) => <li key={entry.span_id} data-entry-id={entry.span_id}>
      <details open>
        <summary><span className="entry-kind">{entry.kind}</span> {entry.name}</summary>
        <SpanDetails entry={entry} />
        {renderChildren(entry.children)}
      </details>
    </li>)}</ul>;
  }
  return <section className="panel" aria-labelledby="trace-heading" data-section="trace">
    <h3 id="trace-heading">Trace tree</h3>
    <p className="hint">Display grouping only; execution parents are provenance, not display hierarchy.</p>
    {entries.length === 0 ? <p data-state="trace-empty">No trace entries in this snapshot.</p> : renderChildren(entries)}
  </section>;
}
